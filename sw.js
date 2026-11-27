/* EYES for iPhone: offline after the first visit, and notifications from the EYES push relay.
   Eye Contact itself (ntfy.sh) and the relay are never cached. */
const CACHE = 'eyes-web-3.0.0-rc1', NAMES = 'eyes-push-names';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./","index.html","eyes-web-shell.js?v=267","ability-wheel.js?v=300","ability-wheel.css?v=300","eyes-playtime.js?v=300","eyes-playtime.css?v=300","eyes-play.js?v=266","eyes-social.js?v=266","vision.js?v=300","vision.css?v=300","vision-qr.js","arcade.js?v=300","arcade.css?v=300","tunnelbug.js","tunnelbug-render.js","tunnelbug-audio.js","pocket.js?v=300","pocket.css?v=300","pocket-store.js","weather.js","weather.css","weather-data.js","weather-sky.js","eyes-ios-native-bridge.js","eyes-ios-pocket-backup.js","eyes-polish.js","eyes-polish.css","eyes-ios-tapfix.js","eyes-ios-tapfix.css","launcher.js?v=280","eyes-living.js?v=300","presence.js","personality.js","haven-life.js","eye-render.js","eyes-hangout.js?v=300","eyes-hangout.css?v=270","eyes-contact.js?v=301","eyes-firebase.js?v=301","eyes-friends.js?v=301","eyes-friendship.js?v=301","eyes-exchange.js?v=290","eyes-exchange.css?v=290","eyes-exchange-boot.js?v=290","eyes-visits.js","eyes-rename.js?v=300","arcade-kit.js","orbit-breaker.js","critter-crossing.js","prism-break.js","haven-dna.js?v=300","awakening.js?v=300","awakening.css?v=300","eyes-duel.js?v=301","manifest.webmanifest","icons/apple-touch-icon.png","icons/icon-192.png","haven-friend.css","haven.css","eyes.css","eyes-social.css","eyes-contact.css?v=301","eyes-duel.css","eyes-web.css","eyes-web-shim.js","safety.js","haven-friend.js","home-gestures.js","app-management.js","iris.js","skin-system.js","eye-detail.js","eye-dive.js","haven-link-ui.js","link-effects.js","eyes-mind.js","tips.js","eyes-brand.js","eyes-config.js","eyes-push.js","eyes-passport.js","eyes-senses.js","eyes-dex.js","eyes-qr.js"].map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== NAMES).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
let slowUntil = 0;   // after one request had to fall back to the cache, don't make every other file wait 4 s too
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET' || u.pathname.endsWith('/__names')) return;
  // network first so updates arrive; the cache is the fallback when offline, and also when the network is
  // too slow (a weak signal or a captive portal must not leave EYES on a blank screen: after 4 s a cached copy wins,
  // and the stuck request is abandoned so it can't hold a connection).
  // Requests revalidate with the server (304s are cheap) so a fresh upload is never shadowed by the HTTP cache.
  const fromCache = () => caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: !u.searchParams.has('v') })).catch(() => null);
  const ac = new AbortController();
  const net = e.request.mode === 'navigate' ? fetch(u.href, { cache: 'no-cache', credentials: 'same-origin', signal: ac.signal }) : fetch(new Request(e.request, { cache: 'no-cache', signal: ac.signal }));
  e.respondWith(new Promise((resolve) => {
    let done = false;
    const give = (r) => { if (!done && r) { done = true; resolve(r); } };
    const fallback = () => fromCache().then((r) => { if (r) { give(r); ac.abort(); } });   // abort frees the stuck connection
    if (Date.now() < slowUntil) fromCache().then(give);           // the network is known to be crawling: cache first, network only refreshes
    const slow = setTimeout(() => { slowUntil = Date.now() + 30000; fallback(); }, 4000);
    net.then((r) => {
      if (!r.ok) throw Error('Network response unavailable');
      const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      clearTimeout(slow); slowUntil = 0; give(r);
    }).catch(() => {
      clearTimeout(slow);
      fromCache().then((r) => { if (r) give(r); else if (!done) { done = true; resolve(Response.error()); } });
    });
  }));
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

