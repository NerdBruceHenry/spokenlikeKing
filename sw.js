// Offline cache. Bump VERSION whenever files change.
const VERSION = 'slk-v1';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  "./css/style.css",
  "./js/activities/buddy.js",
  "./js/activities/common.js",
  "./js/activities/daily.js",
  "./js/activities/freetalk.js",
  "./js/activities/listening.js",
  "./js/activities/parent.js",
  "./js/activities/phrases.js",
  "./js/activities/review.js",
  "./js/activities/roleplay.js",
  "./js/activities/shadow.js",
  "./js/activities/soundlab.js",
  "./js/activities/twisters.js",
  "./js/app.js",
  "./js/components.js",
  "./js/data/levels.js",
  "./js/data/phrases.js",
  "./js/data/practice.js",
  "./js/data/scenes.js",
  "./js/data/sounds.js",
  "./js/data/stickers.js",
  "./js/data/stories.js",
  "./js/score.js",
  "./js/speech.js",
  "./js/state.js",
  "./js/ui.js",
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first (so updates arrive), falling back to cache when offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});
