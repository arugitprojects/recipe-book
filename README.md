# Recipe Book

A shared family recipe notebook: title, description, tags, ingredients,
steps, a YouTube link (with automatic ingredient grabbing), a web link,
and notes — installable as an app on Android (and desktop), with full
offline access.

**Access**: no individual accounts. Everyone is signed in silently and
automatically (Firebase anonymous auth), and unlocks the shared notebook
once per device with a family passphrase you set. See "How access works"
below for the full picture.

**Stack**: plain HTML/CSS/JS, no build step, hosted free on **GitHub
Pages**. The database is **Firestore**, with **Firebase Anonymous Auth**
for sessions — hosting and database are two separate free services that
don't need to know about each other.

---

## 1. Create your Firebase project (free) — this is your database

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project.
2. **Authentication** → Get started → **Sign-in method** tab → enable **Anonymous**.
3. **Firestore Database** → Create database → start in **production mode** (we supply our own rules below) → pick any region close to you.
4. **Project settings** (gear icon) → **General** → scroll to "Your apps" → click the web icon (`</>`) → register an app (any nickname). You do **not** need Firebase Hosting for this — just copy the `firebaseConfig` object it shows you.

## 2. Add your config

Open `js/firebase-config.js` and replace the placeholder values with the
config object from step 1.4. These values identify your project — they
aren't secret, so it's fine for them to sit in client code. Access control
is enforced by the security rules below, not by hiding this file.

## 3. Set your passphrase and publish your security rules

Open `firestore.rules` in this project and change the value inside
`correctPassphrase()` to whatever you want your family passphrase to be.
This value is never sent to the browser — it's only ever compared
server-side by Firestore, so it stays hidden even from someone reading
your app's JavaScript.

Then, in the Firebase console: **Firestore Database** → **Rules** tab →
paste in the full contents of your edited `firestore.rules` → **Publish**.

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

Every time you `git push` an update, the site redeploys automatically —
usually within a minute or two, though GitHub's CDN can occasionally lag
a bit longer. If a change doesn't seem to have landed, check
**Actions** or **Deployments** in your repo before assuming something's
broken.

## 6. Try it

Open your GitHub Pages URL. You'll be signed in automatically (no popups,
nothing to click), then asked for your name and the family passphrase you
set in step 3. Enter both — this device is now unlocked permanently
(unless its browser storage gets cleared).

## 7. Optional: auto-grab ingredients from YouTube

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

## 8. Install it on Android

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
being served over `http://` or `https://`.)

## How access works

There are no individual accounts — everyone shares the same passphrase
and the same notebook, full read/write for anyone who's unlocked their
device. The mechanics:

1. On page load, the app silently signs each visitor in via Firebase's
   **anonymous** auth — this creates a session with no user interaction
   at all, just to give Firestore something to check permissions against.
2. The first time on a given device, the app asks for a name (stored
   locally, used to label recipes you add — e.g. "Added by Jordan") and
   the family passphrase (sent to Firestore, checked against the value
   in `firestore.rules`).
3. If correct, that device's anonymous identity is now permanently
   trusted — it won't ask again unless its browser storage is cleared.

**To change the passphrase later** (e.g. to revoke access for everyone at
once): edit the value in `correctPassphrase()` in `firestore.rules`,
republish, and every device will need to re-enter the new passphrase on
its next visit.

**Trade-off worth knowing**: since access is passphrase-based rather than
per-person, there's no way to revoke just one individual's access without
changing the passphrase for everyone. If that becomes a problem later,
switching to real per-person accounts (e.g. Google sign-in with an
allowlist) is a moderate rework, not a full rewrite — the recipe schema
itself wouldn't need to change.

## How offline access works

Firestore's client SDK caches every document your device has ever synced
in local IndexedDB (enabled in `js/app.js`). At personal/family scale,
the whole recipe collection stays cached automatically — the "Pin for
offline" star on each recipe is there mostly for your own reference, and
becomes functionally important only if the collection grows very large
and cache eviction becomes relevant. Ingredients and steps are plain
fields on the recipe document, so they're available offline with zero
extra code. YouTube/web links obviously need a live connection to open.

## Scaling to a public app later

The current model (a single shared passphrase, full access to anyone who
has it) is designed for a trusted household, not the general public —
opening it up further is a bigger step than adding one field. Broadly it
would mean: replacing the passphrase check with real self-serve sign-up,
adding per-recipe ownership back in (so strangers can't edit each other's
recipes — a `createdBy` field already exists on every recipe for this),
and probably adding moderation and rate limits. Also worth adding at that
point: full-text search (Firestore's own querying is limited) via
something like Algolia or Typesense once there are enough recipes that
ingredient/keyword search matters.
