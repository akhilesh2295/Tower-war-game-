// Minimal offline cache. Bump VERSION to force clients onto a new build.
const VERSION = 'tower-tide-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Pages: network first so updates arrive; assets: cache first (they're content-hashed).
  const networkFirst = req.mode === 'navigate';
  e.respondWith(
    (networkFirst ? fetch(req).then(store, () => caches.match(req)) : caches.match(req).then((hit) => hit || fetch(req).then(store)))
      .then((res) => res || caches.match('./index.html')),
  );
  function store(res) {
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  }
});
