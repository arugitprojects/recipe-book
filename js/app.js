import { firebaseConfig, youtubeApiKey } from './firebase-config.js';
import { extractYoutubeId, fetchVideoSnippet, parseIngredientsFromDescription } from './youtube.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, where, orderBy, serverTimestamp,
  enableIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

// ---------- Firebase setup ----------

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Cache the user's whole recipe collection locally so it's readable with
// zero connectivity. At personal scale (tens to low hundreds of recipes)
// this comfortably fits Firestore's local cache in full.
enableIndexedDbPersistence(db).catch((err) => {
  console.warn('Offline persistence unavailable:', err.code);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
  });
}

// ---------- State ----------

let currentUser = null;
let allRecipes = [];
let activeTagFilter = null;
let searchTerm = '';
let unsubscribeRecipes = null;

// ---------- DOM ----------

const root = document.getElementById('app-root');

// ---------- Auth ----------

function renderAuthScreen() {
  root.innerHTML = `
    <div class="auth-screen">
      <h1>Recipe Book</h1>
      <p>Your own recipes, with video links, web links, and full offline access. Sign in to get started.</p>
      <button class="btn-primary" id="sign-in-btn">Sign in with Google</button>
    </div>
  `;
  document.getElementById('sign-in-btn').addEventListener('click', () => {
    signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => alert('Sign-in failed: ' + e.message));
  });
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (unsubscribeRecipes) { unsubscribeRecipes(); unsubscribeRecipes = null; }

  if (!user) {
    renderAuthScreen();
    return;
  }

  renderAppShell();
  subscribeToRecipes();
});

// ---------- Firestore subscription ----------

function subscribeToRecipes() {
  const q = query(
    collection(db, 'recipes'),
    where('userId', '==', currentUser.uid),
    orderBy('title')
  );
  unsubscribeRecipes = onSnapshot(q, (snapshot) => {
    allRecipes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderRecipeList();
  }, (err) => {
    console.error('Recipe subscription error', err);
  });
}

// ---------- App shell ----------

function renderAppShell() {
  root.innerHTML = `
    <header class="app-header">
      <h1>Recipe Book <span class="byline">${escapeHtml(currentUser.displayName || currentUser.email || '')}</span></h1>
      <div class="search-row">
        <input type="search" id="search-input" placeholder="Search recipes or ingredients…" autocomplete="off">
      </div>
      <div class="tag-filter-row" id="tag-filter-row"></div>
    </header>
    <div class="sync-status" id="sync-status"></div>
    <main id="recipe-list" class="recipe-list"></main>
    <button class="fab" id="add-fab" aria-label="Add recipe">+</button>
  `;

  document.getElementById('search-input').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderRecipeList();
  });

  document.getElementById('add-fab').addEventListener('click', () => openFormSheet(null));

  updateSyncStatus();
  window.addEventListener('online', updateSyncStatus);
  window.addEventListener('offline', updateSyncStatus);
}

function updateSyncStatus() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  if (navigator.onLine) {
    el.textContent = '';
    el.classList.remove('offline');
  } else {
    el.textContent = 'Offline — showing cached recipes. Changes will sync when you\'re back online.';
    el.classList.add('offline');
  }
}

// ---------- Recipe list rendering ----------

function allTags() {
  const set = new Set();
  allRecipes.forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
  return [...set].sort();
}

function filteredRecipes() {
  return allRecipes.filter((r) => {
    if (activeTagFilter && !(r.tags || []).includes(activeTagFilter)) return false;
    if (!searchTerm) return true;
    const haystack = [
      r.title, r.description, ...(r.tags || []), ...(r.ingredients || [])
    ].join(' ').toLowerCase();
    return haystack.includes(searchTerm);
  });
}

function renderRecipeList() {
  const tagRow = document.getElementById('tag-filter-row');
  if (tagRow) {
    const tags = allTags();
    tagRow.innerHTML = tags.map((t) => `
      <button class="tag-pill ${t === activeTagFilter ? 'active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>
    `).join('');
    tagRow.querySelectorAll('.tag-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTagFilter = activeTagFilter === btn.dataset.tag ? null : btn.dataset.tag;
        renderRecipeList();
      });
    });
  }

  const listEl = document.getElementById('recipe-list');
  const recipes = filteredRecipes();

  if (recipes.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="icon">&#128218;</div>
        <p>${allRecipes.length === 0 ? 'No recipes yet. Tap + to add your first one.' : 'No recipes match your search.'}</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = recipes.map((r) => `
    <button class="recipe-card" data-id="${r.id}">
      ${r.pinned ? '<span class="pin-badge" title="Pinned for offline">&#9733;</span>' : ''}
      <h3>${escapeHtml(r.title)}</h3>
      ${r.description ? `<p class="desc">${escapeHtml(r.description)}</p>` : ''}
      <div class="tags">${(r.tags || []).map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>
    </button>
  `).join('');

  listEl.querySelectorAll('.recipe-card').forEach((card) => {
    card.addEventListener('click', () => openDetailSheet(card.dataset.id));
  });
}

// ---------- Detail sheet ----------

function openDetailSheet(id) {
  const recipe = allRecipes.find((r) => r.id === id);
  if (!recipe) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const ytId = extractYoutubeId(recipe.youtubeUrl);

  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet-top">
        <div class="recipe-title-block">
          <h2>${escapeHtml(recipe.title)}</h2>
          ${recipe.description ? `<p class="desc">${escapeHtml(recipe.description)}</p>` : ''}
        </div>
        <button class="sheet-close" aria-label="Close">&times;</button>
      </div>

      ${ytId ? `
        <div class="video-embed">
          <iframe src="https://www.youtube.com/embed/${ytId}" title="Recipe video" allowfullscreen loading="lazy"></iframe>
        </div>
      ` : ''}

      ${(recipe.ingredients && recipe.ingredients.length) ? `
        <div class="section-label">Ingredients</div>
        <ul class="ingredient-ledger">
          ${recipe.ingredients.map((line, i) => `
            <li data-idx="${i}">
              <input type="checkbox" id="ing-${i}">
              <label class="ing-text" for="ing-${i}">${escapeHtml(line)}</label>
            </li>
          `).join('')}
        </ul>
      ` : ''}

      ${(recipe.steps && recipe.steps.length) ? `
        <div class="section-label">Steps</div>
        <ol class="steps-list">
          ${recipe.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
        </ol>
      ` : ''}

      ${(recipe.webUrl || recipe.youtubeUrl) ? `
        <div class="section-label">Links</div>
        <div class="link-row">
          ${recipe.webUrl ? `<a class="link-chip" href="${escapeAttr(recipe.webUrl)}" target="_blank" rel="noopener">&#128279; Source page</a>` : ''}
          ${recipe.youtubeUrl ? `<a class="link-chip" href="${escapeAttr(recipe.youtubeUrl)}" target="_blank" rel="noopener">&#9654; Watch on YouTube</a>` : ''}
        </div>
      ` : ''}

      ${recipe.notes ? `
        <div class="section-label">Notes</div>
        <p style="font-size:14.5px; line-height:1.6; color:var(--ink-muted); margin:0;">${escapeHtml(recipe.notes)}</p>
      ` : ''}

      <div class="sheet-actions">
        <button class="btn-secondary" id="edit-btn">Edit</button>
        <button class="btn-secondary btn-pin ${recipe.pinned ? 'pinned' : ''}" id="pin-btn">${recipe.pinned ? '&#9733; Pinned' : '&#9734; Pin for offline'}</button>
        <button class="btn-danger" id="delete-btn">Delete</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const close = () => { backdrop.remove(); document.body.style.overflow = ''; };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.sheet-close').addEventListener('click', close);

  backdrop.querySelectorAll('.ingredient-ledger li').forEach((li) => {
    li.querySelector('input').addEventListener('change', (e) => {
      li.classList.toggle('checked', e.target.checked);
    });
  });

  backdrop.querySelector('#edit-btn').addEventListener('click', () => { close(); openFormSheet(recipe); });

  backdrop.querySelector('#pin-btn').addEventListener('click', async () => {
    await updateDoc(doc(db, 'recipes', recipe.id), { pinned: !recipe.pinned });
    close();
  });

  backdrop.querySelector('#delete-btn').addEventListener('click', async () => {
    if (!confirm(`Delete "${recipe.title}"? This can't be undone.`)) return;
    await deleteDoc(doc(db, 'recipes', recipe.id));
    close();
  });
}

// ---------- Add / edit form sheet ----------

function openFormSheet(recipe) {
  const isEdit = !!recipe;
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';

  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet-top">
        <div class="recipe-title-block"><h2>${isEdit ? 'Edit recipe' : 'New recipe'}</h2></div>
        <button class="sheet-close" aria-label="Close">&times;</button>
      </div>
      <form id="recipe-form">
        <div class="form-field">
          <label for="f-title">Title</label>
          <input type="text" id="f-title" required value="${escapeAttr(recipe?.title || '')}">
        </div>
        <div class="form-field">
          <label for="f-desc">Short description</label>
          <input type="text" id="f-desc" value="${escapeAttr(recipe?.description || '')}">
        </div>
        <div class="form-field">
          <label for="f-tags">Tags (comma separated)</label>
          <input type="text" id="f-tags" placeholder="weeknight, pasta, vegetarian" value="${escapeAttr((recipe?.tags || []).join(', '))}">
        </div>
        <div class="form-field">
          <label for="f-ingredients">Ingredients (one per line)</label>
          <textarea id="f-ingredients" placeholder="200g spaghetti&#10;2 cloves garlic, sliced&#10;1 tsp chili flakes">${escapeHtml((recipe?.ingredients || []).join('\n'))}</textarea>
        </div>
        <div class="form-field">
          <label for="f-steps">Steps (one per line)</label>
          <textarea id="f-steps" placeholder="Boil the pasta until al dente&#10;Fry garlic and chili in olive oil">${escapeHtml((recipe?.steps || []).join('\n'))}</textarea>
        </div>
        <div class="form-field">
          <label for="f-youtube">YouTube link</label>
          <div style="display:flex; gap:8px;">
            <input type="url" id="f-youtube" placeholder="https://youtube.com/watch?v=…" value="${escapeAttr(recipe?.youtubeUrl || '')}" style="flex:1;">
            <button type="button" class="btn-secondary" id="fetch-yt-btn" style="flex:none; white-space:nowrap; padding-left:14px; padding-right:14px;">Grab ingredients</button>
          </div>
          <p class="hint" id="yt-fetch-hint"></p>
        </div>
        <div class="form-field">
          <label for="f-web">Web link</label>
          <input type="url" id="f-web" placeholder="https://…" value="${escapeAttr(recipe?.webUrl || '')}">
        </div>
        <div class="form-field">
          <label for="f-notes">Notes</label>
          <textarea id="f-notes" placeholder="Substitutions, timing tweaks, who liked it…">${escapeHtml(recipe?.notes || '')}</textarea>
        </div>
        <label class="pin-toggle-row">
          <input type="checkbox" id="f-pinned" ${recipe?.pinned ? 'checked' : ''}>
          Pin for offline
        </label>
        <div class="form-submit-row">
          <button type="button" class="btn-secondary" id="cancel-btn">Cancel</button>
          <button type="submit" class="btn-primary" style="flex:1;">${isEdit ? 'Save changes' : 'Add recipe'}</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const close = () => { backdrop.remove(); document.body.style.overflow = ''; };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.sheet-close').addEventListener('click', close);
  backdrop.querySelector('#cancel-btn').addEventListener('click', close);

  backdrop.querySelector('#fetch-yt-btn').addEventListener('click', async () => {
    const btn = backdrop.querySelector('#fetch-yt-btn');
    const hint = backdrop.querySelector('#yt-fetch-hint');
    const urlValue = document.getElementById('f-youtube').value.trim();
    const videoId = extractYoutubeId(urlValue);

    hint.textContent = '';
    hint.classList.remove('offline');

    if (!videoId) {
      hint.textContent = 'Enter a valid YouTube link first.';
      return;
    }
    if (!youtubeApiKey || youtubeApiKey === 'REPLACE_ME') {
      hint.textContent = 'Add a YouTube Data API key in js/firebase-config.js to use this (see README).';
      return;
    }

    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Fetching…';

    try {
      const snippet = await fetchVideoSnippet(videoId, youtubeApiKey);
      const { ingredients, raw } = parseIngredientsFromDescription(snippet.description);
      const ingField = document.getElementById('f-ingredients');

      if (ingredients.length > 0) {
        const shouldReplace = !ingField.value.trim()
          || confirm(`Found ${ingredients.length} ingredient lines in the description. Replace your current ingredients list with them?`);
        if (shouldReplace) ingField.value = ingredients.join('\n');
        hint.textContent = `Pulled ${ingredients.length} lines from the description — check them over before saving.`;
      } else {
        hint.innerHTML = 'Couldn\'t find a clear ingredients section in the description. <button type="button" id="show-raw-desc" style="background:none; border:none; color:var(--accent); text-decoration:underline; padding:0; font-size:inherit; cursor:pointer;">Paste full description</button> to copy manually.';
        const showBtn = backdrop.querySelector('#show-raw-desc');
        showBtn?.addEventListener('click', () => {
          ingField.value = raw;
          hint.textContent = 'Full description pasted below — trim it down to just the ingredients.';
        });
      }
    } catch (err) {
      hint.textContent = 'Could not fetch video info: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

  backdrop.querySelector('#recipe-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      userId: currentUser.uid,
      title: document.getElementById('f-title').value.trim(),
      description: document.getElementById('f-desc').value.trim(),
      tags: splitLines(document.getElementById('f-tags').value, ','),
      ingredients: splitLines(document.getElementById('f-ingredients').value, '\n'),
      steps: splitLines(document.getElementById('f-steps').value, '\n'),
      youtubeUrl: document.getElementById('f-youtube').value.trim(),
      webUrl: document.getElementById('f-web').value.trim(),
      notes: document.getElementById('f-notes').value.trim(),
      pinned: document.getElementById('f-pinned').checked,
      updatedAt: serverTimestamp()
    };

    if (!data.title) return;

    try {
      if (isEdit) {
        await updateDoc(doc(db, 'recipes', recipe.id), data);
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, 'recipes'), data);
      }
      close();
    } catch (err) {
      alert('Could not save recipe: ' + err.message);
    }
  });
}

// ---------- Helpers ----------

function splitLines(str, sep) {
  return str.split(sep).map((s) => s.trim()).filter(Boolean);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}
