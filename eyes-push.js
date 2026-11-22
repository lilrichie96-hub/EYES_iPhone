/* EYES 4.0 · notifications through the EYES push relay (push/worker.js).
   Receiving needs an iPhone Home Screen web app (iOS 16.4+) or another browser with Web Push; Android's
   WebView can't receive, but it still sends nudges so iPhone friends get buzzed.
   The relay address comes from eyes-config.js or The Optic (empty until a relay exists). */
'use strict';
(function (root) {
  const KEY_SERVER = 'eyes.push.server', KEY_ON = 'eyes.push.on', NAMES = 'eyes-push-names';
  const unb64u = (str) => { let s = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  const server = () => String(localStorage.getItem(KEY_SERVER) || (root.EYES_CONFIG && root.EYES_CONFIG.pushServer) || '').trim().replace(/\/+$/, '');
  const canReceive = () => 'serviceWorker' in navigator && 'PushManager' in root && 'Notification' in root && location.protocol === 'https:';
  const post = (path, body) => {
    const s = server(); if (!s) return Promise.resolve(null);
    // text/plain keeps it a simple request (no CORS preflight); the relay parses the JSON itself
    return fetch(s + path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain' }, cache: 'no-store', keepalive: true }).catch(() => null);
  };
  async function subscription(create) {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub && create) {
      const r = await fetch(server() + '/vapid', { cache: 'no-store' }); const { publicKey } = await r.json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(publicKey) });
    }
    return sub;
  }
  function friendsWithMailboxes() {
    const F = root.EyesFriends; if (!F) return [];
    return F.list().map((f) => ({ f, ch: F.channel(f) })).filter((x) => x.ch && x.ch.mailbox);
  }
  // the service worker names who it was ("Haven sent a pulse"): it reads this little map from the cache
  async function writeNames() {
    try {
      const map = {}; friendsWithMailboxes().forEach(({ f, ch }) => { map[ch.mailbox] = f.nick || (f.profile && f.profile.name) || 'Your friend'; });
      if (root.EYES_NATIVE_MAILBOX) map[root.EYES_NATIVE_MAILBOX] = (root.HavenFriend && HavenFriend.dna() && HavenFriend.dna().name) || 'Your friend';
      const c = await caches.open(NAMES); await c.put('./__names', new Response(JSON.stringify(map), { headers: { 'Content-Type': 'application/json' } }));
    } catch (e) {}
  }
  async function registerAll() {
    if (!canReceive() || localStorage.getItem(KEY_ON) !== '1' || !server() || Notification.permission !== 'granted') return;
    const sub = await subscription(true).catch(() => null); if (!sub) return;
    const json = sub.toJSON();
    await Promise.all(friendsWithMailboxes().map(({ ch }) => post('/register', { mailbox: ch.mailbox, tag: ch.tag, sub: json })));
    writeNames();
  }
  const Push = {
    server, canReceive,
    setServer(url) { const u = String(url || '').trim().replace(/\/+$/, ''); if (u && !/^https:\/\//.test(u)) throw new Error('The relay address starts with https://'); u ? localStorage.setItem(KEY_SERVER, u) : localStorage.removeItem(KEY_SERVER); registerAll(); },
    state() {
      return { server: server(), canReceive: canReceive(), on: localStorage.getItem(KEY_ON) === '1' && canReceive() && Notification.permission === 'granted',
        permission: 'Notification' in root ? Notification.permission : 'unsupported', standalone: navigator.standalone === true || matchMedia('(display-mode: standalone)').matches };
    },
    async enable() {                   // must be called from a tap
      if (!canReceive()) throw new Error('Notifications need EYES opened from your Home Screen');
      if (!server()) throw new Error('No notification relay set up yet');
      const p = await Notification.requestPermission();
      if (p !== 'granted') throw new Error('Notifications are off for EYES in Settings');
      localStorage.setItem(KEY_ON, '1');
      await registerAll();
      return true;
    },
    async disable() {
      localStorage.removeItem(KEY_ON);
      await Promise.all(friendsWithMailboxes().map(({ ch }) => post('/unregister', { mailbox: ch.mailbox, tag: ch.tag })));
      try { const sub = await subscription(false); if (sub) await sub.unsubscribe(); } catch (e) {}
    },
    nudge(mailbox, tag, kind) { if (mailbox) post('/nudge', { mailbox, from: tag, kind }); },
    forget(mailbox, tag) { if (mailbox) post('/unregister', { mailbox, tag }); },
    refresh: registerAll
  };
  root.EyesPush = Push;
  if (root.EyesFriends) { EyesFriends.on('paired', () => setTimeout(registerAll, 500)); EyesFriends.on('profile', () => writeNames()); }
  addEventListener('load', () => setTimeout(registerAll, 3000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') registerAll(); });
})(window);
