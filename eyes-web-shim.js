/* EYES for iPhone: stands in for the Android app around the real EYES page.
   The launcher talks to Android through window.Phone and hears back through Haven.receive(...).
   Here Phone is answered in the browser. Every friend runs in eyes-friends.js (the same encrypted
   protocol as Android's native link); the launcher's single-link state follows your first friend, so
   their Eye rests in the corner and the original link machinery stays happy. */
'use strict';
window.EYES_IOS_ABILITIES = true; // native Android ability renderer with browser-only hardware adapters
window.EYES_WEB = true;          // launcher.js: no apps / notifications / folders panels
window.EYES_HOLD_BIRTH = true;   // awakening.js: wait for the welcome screen
(function () {
  const queue = [];
  function send(data) {
    if (window.Haven && typeof Haven.receive === 'function') { while (queue.length) Haven.receive(queue.shift()); Haven.receive(data); }
    else queue.push(data);
  }
  addEventListener('DOMContentLoaded', () => setTimeout(() => { if (window.Haven && queue.length) send(queue.shift()); }, 0));
  // 2.2.2: only real readings. Safari on iPhone has no Battery Status API, so the battery is reported as
  // unknown (null) and the Eye behaves as on an ordinary day: no fake "full", "charging" or "low" moods.
  // A browser that does offer navigator.getBattery() (not Safari) gives its real level and charging state.
  // Alarms, other apps' music and battery saver can't be seen from a web app at all, so they never appear.
  let battery = null;
  function system() {
    const known = !!battery && Number.isFinite(battery.level);
    send({ type: 'system', battery: known ? Math.round(battery.level * 100) : null, charging: known ? !!battery.charging : null, saver: null,
      hour: new Date().getHours(), isHome: true, access: false, alarm: 0, sensed: { battery: known, charging: known, alarm: false, media: false, saver: false },
      systemMotion: !matchMedia('(prefers-reduced-motion: reduce)').matches });
  }
  try {
    if (typeof navigator.getBattery === 'function') navigator.getBattery().then((b) => {
      battery = b; ['levelchange', 'chargingchange'].forEach((e) => b.addEventListener(e, system)); system();
    }, () => {});
  } catch (e) {}
  try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', system); } catch (e) {}
  const link = (event, extra) => send({ type: 'havenLink', event, _eyes: 1, ...(extra || {}) });
  const F = () => window.EyesFriends;
  const primary = () => F() && F().list().find((f) => f.peer);
  let lastPrimary = '';
  function syncPrimary() {
    const p = primary();
    link('status', { linked: !!p, paired: !!p, connection: p ? F().connection(p) : 'off' });
    if (p && p.profile) { const j = JSON.stringify(p.profile); if (j !== lastPrimary) { lastPrimary = j; link('profile', { profile: p.profile }); } }
  }
  const noop = () => {};
  window.Phone = {
    setup: noop, refresh: system, setFullscreen: noop, notification: noop, dismissNotification: noop, clearNotifications: noop,
    media: noop, startLiveAudio: noop, stopLiveAudio: noop, setMediaVolume: noop, readMediaVolume: noop,
    launch: noop, launchAppShortcut: noop, getAppShortcuts: noop, appInfo: noop, uninstallApp: noop,
    // the original Eye Contact sheet isn't shown on iPhone (Friends replaces it); these keep it harmless
    linkCreate() { if (window.EyesSocial) EyesSocial.friends(); },
    linkJoin(code) { F().join(code).catch((e) => link('error', { message: e.message })); },
    linkPulse(kind) { const p = primary(); if (p) F().send(p, kind); },
    linkStatus: syncPrimary, linkShowCode: noop, linkCopyCode: noop, linkUnlink: noop,
    linkProfile: noop                       // eyes-friends.js sends your profile to every friend itself
  };
  addEventListener('DOMContentLoaded', () => {
    if (!F()) return;
    ['change', 'paired', 'profile', 'removed'].forEach((ev) => F().on(ev, () => { clearTimeout(syncPrimary.t); syncPrimary.t = setTimeout(syncPrimary, 200); }));
    setTimeout(syncPrimary, 400);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') system(); });
  setInterval(() => { if (document.visibilityState === 'visible') system(); }, 60000);
})();
