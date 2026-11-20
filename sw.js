/* EYES for iPhone: works offline after the first visit. Eye Contact (ntfy.sh) is never cached. */
const CACHE = 'eyes-web-1.0.0';
const SHELL = ['./', 'index.html', 'eyes-web.css', 'awakening.css', 'eyes-boot.js', 'haven-dna.js', 'awakening.js', 'eyes-link.js', 'eyes-app.js',
  'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  // network first so updates arrive; the cache is the fallback when offline
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
