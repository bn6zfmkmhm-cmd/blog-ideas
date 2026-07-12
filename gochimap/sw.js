// まえログ: minimal offline support.
// - App shell (this page): network-first, falling back to cache when offline.
// - Photos (Firebase Storage): cache-first, so once viewed they stay available offline.
// - Everything else (Google Maps tiles, Firestore/Firebase API calls, etc.): left
//   untouched — those need a live network connection and aren't meaningfully
//   cacheable, so we just let the browser handle them normally.

const CACHE_NAME = 'maelog-shell-v1';
const APP_SHELL_URL = './index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([APP_SHELL_URL]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // App shell: this page itself (navigations and same-origin index.html requests).
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL_URL, copy));
          return res;
        })
        .catch(() => caches.match(APP_SHELL_URL))
    );
    return;
  }

  // Uploaded photos (Firebase Storage): serve from cache first, refresh in the background.
  if (url.hostname.endsWith('firebasestorage.app') || url.hostname === 'firebasestorage.googleapis.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => { cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
