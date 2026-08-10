// App-shell cache only. Recipe DATA offline access is handled separately
// by Firestore's own IndexedDB persistence (enabled in js/app.js) — this
// service worker just makes sure the app's UI itself still loads with no
// signal at all.
//
// Strategy: network-first, falling back to cache only when offline. An
// earlier cache-first version of this file meant updates never reached
// returning visitors until they manually cleared site data — this fixes
// that. Bump CACHE_NAME whenever you want to force a clean slate for
// everyone (not usually necessary, since network-first self-heals).

const CACHE_NAME = 'recipe-book-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/firebase-config.js',
  './js/app.js',
  './js/youtube.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests for the app shell.
  // Everything else (Firestore/Auth calls to Google's servers, YouTube
  // embeds, etc.) is left completely alone so those SDKs manage their
  // own networking and offline behavior.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
