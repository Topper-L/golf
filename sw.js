/* Network-first while online. Offline reads the versioned cache and never calls fetch. Bump CACHE to drop old copies. */
const CACHE = 'golf-v23';
const FILES = ['index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = async () => {
      const hit = await cache.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate' || /\/$/.test(url.pathname) || url.pathname.endsWith('index.html')) return cache.match('index.html');
    };
    // Some WebKit builds throw inside the worker if fetch runs with no network, and that error replaces the cached page. Read the cache instead.
    if (self.navigator && self.navigator.onLine === false) {
      const hit = await cached();
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok) await cache.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await cached();
      if (hit) return hit;
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
