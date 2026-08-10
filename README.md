# Recipe Book

A personal recipe notebook: title, description, tags, ingredients, steps,
a YouTube link (with automatic ingredient grabbing), a web link, and notes
— installable as an app on Android (and desktop), with full offline access
to your own recipes.

**Stack**: plain HTML/CSS/JS, no build step, hosted free on **GitHub
Pages**. The database is **Firestore** (with **Firebase Auth** for
sign-in) — hosting and database are two separate free services that don't
need to know about each other.

---

## 1. Create your Firebase project (free) — this is your database

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project.
2. **Authentication** → Get started → enable the **Google** sign-in provider.
3. **Firestore Database** → Create database → start in **production mode** (we supply our own rules below) → pick any region close to you.
4. **Project settings** (gear icon) → **General** → scroll to "Your apps" → click the web icon (`</>`) → register an app (any nickname). You do **not** need Firebase Hosting for this — just copy the `firebaseConfig` object it shows you.

## 2. Add your config

Open `js/firebase-config.js` and replace the placeholder values with the
config object from step 1.4. These values identify your project — they
aren't secret, so it's fine for them to sit in client code. Access control
is enforced by the security rules below, not by hiding this file.

## 3. Deploy your security rules

In the Firebase console: **Firestore Database** → **Rules** tab → paste in
the contents of `firestore.rules` from this project → **Publish**.

This scopes every recipe to the signed-in user who created it (via a
`userId` field on each document) — so even though the app is single-user
today, the data model is already public-ready. See the comment at the
bottom of `firestore.rules` for the one-line change needed to open it up
later.

## 4. Push this project to GitHub

```bash
cd recipe-book
git init
git add .
git commit -m "Initial commit"
gh repo create recipe-book --public --source=. --push
```

(No `gh` CLI? Create an empty repo on github.com first, then
`git remote add origin https://github.com/YOUR-USERNAME/recipe-book.git`
and `git push -u origin main`.)

## 5. Turn on GitHub Pages

In your new repo: **Settings** → **Pages** → under "Build and deployment",
set **Source** to "Deploy from a branch" → branch `main`, folder `/ (root)`
→ **Save**.

GitHub will give you a live URL shortly, in the form:
`https://YOUR-USERNAME.github.io/recipe-book/`

That's the whole hosting setup — every time you `git push` an update, the
site redeploys automatically within a minute or two, no extra steps.

## 6. Connect the two: authorize your GitHub Pages domain in Firebase

Firebase blocks sign-in from domains it doesn't recognize. In the Firebase
console: **Authentication** → **Settings** → **Authorized domains** → **Add domain**
→ enter `YOUR-USERNAME.github.io` (domain only, no path). Without this
step, Google sign-in will fail with an "unauthorized domain" error.

## 7. Try it

Open your GitHub Pages URL, sign in with Google, and add a recipe. Since
this is a fresh Firestore database, the recipe list starts empty — that's
expected.

## 8. Optional: auto-grab ingredients from YouTube

When adding or editing a recipe, pasting a YouTube link enables a "Grab
ingredients" button. It reads the video's **description** via the YouTube
Data API and pulls out anything under an "Ingredients" heading — it does
not transcribe narration or on-screen text, so it only works when the
creator listed ingredients in the description (most recipe channels do).
If nothing is found, it shows you the full description so you can copy
the relevant lines by hand instead.

To enable it:

1. In [Google Cloud Console](https://console.cloud.google.com), use the same project Firebase created for you (or a new one).
2. **APIs & Services** → **Library** → search **YouTube Data API v3** → Enable.
3. **APIs & Services** → **Credentials** → **Create credentials** → **API key**.
4. Paste that key into `youtubeApiKey` in `js/firebase-config.js`, commit, and push.
5. Click the key in Cloud Console → **Application restrictions** → **Websites** → add `https://YOUR-USERNAME.github.io/*`, so the key can't be used from anywhere else.

The free quota (10,000 units/day, ~1 unit per lookup) is far more than a
personal recipe box will ever use.

## 9. Install it on Android

Open your GitHub Pages URL in Chrome on your Android phone → menu (⋮) →
**Add to Home screen**. It launches full-screen with its own icon, exactly
like a native app, and reads your recipes offline via Firestore's local
cache.

If you later want a real Play Store listing, wrap this same site as a
**Trusted Web Activity** using [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
or [PWABuilder](https://www.pwabuilder.com/) — no code changes needed here.

## Running it locally before you push

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. (Opening `index.html` directly via
`file://` won't work — ES module imports and service workers both require
being served over `http://` or `https://`.) You'll need to temporarily add
`localhost` to Firebase's authorized domains list (step 6) to sign in
while testing locally — it's usually there by default.

## How offline access works

Firestore's client SDK caches every document your account has ever synced
in local IndexedDB (enabled in `js/app.js`). At personal scale, your whole
recipe collection stays cached automatically — the "Pin for offline" star
on each recipe is there for your own reference (and becomes functionally
important later if the collection grows very large and eviction becomes
relevant), but you don't need to think about it day to day. Ingredients
and steps are plain fields on the recipe document, so they're available
offline with zero extra code. YouTube/web links obviously need a live
connection to open.

## Scaling to a public app later

The data model already supports it — see the comment block in
`firestore.rules`. Broadly: add a `public` boolean field, relax the read
rule, open up additional sign-in methods, and consider adding full-text
search (Firestore's own querying is limited) via something like Algolia
or Typesense once you have enough recipes that ingredient/keyword search
matters.
