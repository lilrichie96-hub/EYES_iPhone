/* EYES for iPhone: offline after the first visit, and notifications from the EYES push relay.
   Eye Contact itself (ntfy.sh) and the relay are never cached. */
const CACHE = 'eyes-web-2.5.0-authentic', NAMES = 'eyes-push-names';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./","index.html","ability-wheel.js","ability-wheel.css","vision.js","vision.css","vision-qr.js","arcade.js","arcade.css","tunnelbug.js","tunnelbug-render.js","tunnelbug-audio.js","pocket.js","pocket.css","pocket-store.js","weather.js","weather.css","weather-data.js","weather-sky.js","eyes-ios-native-bridge.js","eyes-ios-pocket-backup.js","launcher.js","eye-render.js"])).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== NAMES).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET' || u.pathname.endsWith('/__names')) return;
  // network first so updates arrive; the cache is the fallback when offline
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
// a friend reached for you: { m: mailbox, k: kind } (names were left in the cache by the app)
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil((async () => {
    let names = {};
    try { const r = await (await caches.open(NAMES)).match('./__names'); if (r) names = await r.json(); } catch (err) {}
    const who = names[d.m] || 'Your Eye Contact';
    const what = { pulse: 'sent you a pulse', spark: 'sent you a spark', calm: 'sent you calm', resonance: 'resonated with you' }[d.k] || 'is reaching for you';
    await self.registration.showNotification(who, { body: what, tag: 'eyes-' + (d.m || 'x'), renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { m: d.m } });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => { for (const c of cs) if ('focus' in c) return c.focus(); return clients.openWindow('./'); }));
});
