/* EYES for iPhone: stands in for the Android app around the real EYES page.
   The launcher talks to Android through window.Phone and hears back through Haven.receive(...).
   Here, Phone is answered in the browser: Eye Contact runs on eyes-link.js (the same encrypted protocol
   as Android's native HavenLink), and the launcher-only calls (apps, notifications, music) do nothing. */
'use strict';
window.EYES_WEB = true;          // launcher.js: no apps / notifications / folders panels
window.EYES_HOLD_BIRTH = true;   // awakening.js: wait for the welcome screen
(function () {
  const queue = [];
  function send(data) {
    if (window.Haven && typeof Haven.receive === 'function') { while (queue.length) Haven.receive(queue.shift()); Haven.receive(data); }
    else queue.push(data);
  }
  const flush = () => { if (window.Haven && queue.length) send(queue.shift()); };
  addEventListener('DOMContentLoaded', () => setTimeout(flush, 0));
  function system() {
    send({ type: 'system', battery: 100, charging: false, saver: false, hour: new Date().getHours(), isHome: true, access: false, alarm: 0,
      systemMotion: !matchMedia('(prefers-reduced-motion: reduce)').matches });
  }
  const link = (event, extra) => send({ type: 'havenLink', event, ...(extra || {}) });
  const invite = (code) => `Eye contact? In EYES, open The Optic → Eye Contact → I have an invite, and paste this:\n${code}`;
  let pendingProfile = null, profileTimer = 0;
  function sendProfile(json) {
    pendingProfile = json;
    if (EyesLink.sendProfile(json)) { pendingProfile = null; return; }
    clearTimeout(profileTimer);
    profileTimer = setTimeout(() => { if (pendingProfile) sendProfile(pendingProfile); }, 31000);   // relay pacing: try again
  }
  const noop = () => {};
  window.Phone = {
    setup: noop, refresh: system, setFullscreen: noop, notification: noop, dismissNotification: noop, clearNotifications: noop,
    media: noop, startLiveAudio: noop, stopLiveAudio: noop, setMediaVolume: noop, readMediaVolume: noop,
    launch: noop, launchAppShortcut: noop, getAppShortcuts: noop, appInfo: noop, uninstallApp: noop,
    linkCreate() { EyesLink.create().then((code) => link('code', { code })).catch((e) => link('error', { message: e.message })); },
    linkJoin(code) { EyesLink.join(code).catch((e) => link('error', { message: e.message })); },
    linkPulse(kind) { EyesLink.send(kind); },
    linkStatus() { const s = EyesLink.state(); link('status', { linked: s.linked, paired: s.paired, connection: s.connection }); },
    linkShowCode() { const s = EyesLink.state(); if (s.code) link('code', { code: s.code }); },
    async linkCopyCode() { const s = EyesLink.state(); try { await navigator.clipboard.writeText(invite(s.code)); link('copied'); } catch (e) { link('code', { code: s.code }); } },
    linkUnlink() { EyesLink.unlink(); },
    linkProfile(json) { sendProfile(String(json)); }
  };
  if (navigator.share) window.Phone.linkShareCode = () => { const s = EyesLink.state(); if (s.code) navigator.share({ text: invite(s.code) }).catch(() => {}); };

  EyesLink.on('status', (s) => link('status', { linked: s.linked, paired: s.paired, connection: s.connection }));
  EyesLink.on('paired', () => link('paired'));
  EyesLink.on('profile', (p) => link('profile', { profile: p }));
  EyesLink.on('incoming', (kind) => link('incoming', { kind }));
  EyesLink.on('outgoing', (kind) => { if (kind !== 'resonance') link('outgoing', { kind }); });
  EyesLink.on('error', (message) => link('error', { message }));

  // signals that came while EYES was closed: one gentle replay, and a line saying so
  function caption(text) {
    let el = document.getElementById('eyesCaption');
    if (!el) { el = document.createElement('p'); el.id = 'eyesCaption'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.textContent = text; el.classList.add('show'); clearTimeout(caption.t); caption.t = setTimeout(() => el.classList.remove('show'), 4500);
  }
  function awayReport() {
    const m = EyesLink.state().missed; if (!m.length || !window.HavenDNA || !HavenDNA.has()) return;
    const who = (window.HavenFriend && HavenFriend.dna() && HavenFriend.dna().name) || 'Their eye';
    const ago = (t) => { const min = Math.round((Date.now() - t) / 60000); return min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`; };
    const last = m[m.length - 1];
    caption(m.length === 1 ? `${who} sent a ${last.k} · ${ago(last.t)}` : `${who} sent ${m.length} signals while you were away`);
    link('incoming', { kind: last.k });
    EyesLink.clearMissed();
  }
  EyesLink.on('missed', () => { if (document.visibilityState === 'visible') setTimeout(awayReport, 1200); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { EyesLink.wake(); system(); setTimeout(awayReport, 2500); }
    else EyesLink.sleep();
  });
  setInterval(() => { if (document.visibilityState === 'visible') system(); }, 60000);
  addEventListener('DOMContentLoaded', () => { EyesLink.restore().then(() => setTimeout(awayReport, 3000)); });
})();
