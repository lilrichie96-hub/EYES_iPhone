/* EYES senses (3.2): three small things that make the eye feel like it's in the room.
   Shared by the Android launcher and EYES for iPhone.

   Tilt to look   Tip the phone and its gaze rolls toward the low side. Holding it normally = looking at you.
                  (Android: on by default. iPhone: asks once for motion access, from The Optic.)
   Bedside        Lying still and flat at night (or just left alone late at night), it drifts off and the
                  screen dims around it so it can breathe in the dark. Touch it or pick the phone up to wake it.
   Their eye      While you're in Eye Contact, their eye rests faintly in its corner instead of only
                  appearing when a signal travels. It brightens when they've just been in touch. */
'use strict';
window.createEyesSenses = function ({ core, personality, now, schedule, eyeCentre, panelOpen, visible }) {
  const KEY = 'eyes.senses.v1';
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // only iPhone/iPad gate motion behind a prompt (some Chromes define requestPermission but grant it silently)
  const needsAsk = isIOS && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
  let prefs = { tilt: !needsAsk, bedside: true, friend: true, keepAwake: false };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- orientation ----------
  let ori = null, base = null, lastAim = 0, aiming = false, listening = false;
  let still = { since: 0, ref: null }, lastTouch = now(), lastFriendSignal = -1e9;
  function onOri(e) {
    if (e.beta == null || e.gamma == null) return;
    const t = now(), o = { b: e.beta, g: e.gamma };
    // stillness: has it moved more than a few degrees since we started watching?
    if (!still.ref || Math.abs(o.b - still.ref.b) > 4 || Math.abs(o.g - still.ref.g) > 4) {
      if (bedside && still.ref && (Math.abs(o.b - still.ref.b) > 9 || Math.abs(o.g - still.ref.g) > 9)) wakeUp('stir');   // picked up
      still = { since: t, ref: o };
    }
    ori = o;
    // the resting angle you hold it at slowly becomes "straight ahead"
    if (!base) base = { ...o };
    base.b += (o.b - base.b) * 0.02; base.g += (o.g - base.g) * 0.02;
    if (!prefs.tilt || !visible() || panelOpen() || core.asleep || core.attention?.active) return;
    const x = clamp((o.g - base.g) / 28, -1, 1), y = clamp(-(o.b - base.b) / 28, -1, 1), mag = Math.hypot(x, y);
    if (mag > 0.18 && t - lastAim > 140) {
      lastAim = t; aiming = true;
      core.aim(x * 0.9, y * 0.75, t, 420);
      schedule();
    } else if (aiming && mag <= 0.12) aiming = false;
  }
  function listen() {
    if (listening) return;
    listening = true;
    addEventListener('deviceorientation', onOri, true);
  }
  async function ask() {
    if (!needsAsk) { listen(); return true; }
    try { const r = await DeviceOrientationEvent.requestPermission(); if (r === 'granted') { listen(); return true; } } catch (e) {}
    return false;
  }
  if (!needsAsk || prefs.tilt || prefs.motionGranted) {
    // On iPhone a previous grant is remembered by Safari; listening without asking simply receives nothing if not.
    listen();
  }

  // ---------- bedside ----------
  let bedside = false, bedsideAt = 0, lock = null;
  const dim = document.createElement('div');
  dim.id = 'eyesBedside';
  dim.setAttribute('aria-hidden', 'true');
  Object.assign(dim.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '40', opacity: '0', transition: 'opacity 4s ease',
    background: 'radial-gradient(circle at 50% 49%, rgba(0,0,0,0) 0, rgba(0,0,0,0.25) 18%, rgba(0,0,0,0.82) 52%)' });
  (document.body ? Promise.resolve() : new Promise((r) => addEventListener('DOMContentLoaded', r))).then(() => document.body.appendChild(dim));
  const night = () => { const h = new Date().getHours(); return h >= 22 || h < 6; };
  function flatAndStill(t) { return ori && Math.abs(ori.b) < 14 && Math.abs(ori.g) < 14 && t - still.since > 60000; }
  async function holdScreen(on) {
    try {
      if (on && prefs.keepAwake && 'wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      if (!on && lock) { lock.release(); lock = null; }
    } catch (e) { lock = null; }
  }
  function enterBedside() {
    if (bedside) return;
    bedside = true; bedsideAt = now(); dim.style.transition = 'opacity 4s ease'; dim.style.opacity = '1';
    drowsy();
    holdScreen(true); schedule();
  }
  // it has to actually feel sleepy, or its own heartbeat wakes it straight back up
  function drowsy() {
    if (personality.nudge) personality.nudge({ sleepiness: 0.35, energy: -0.15 });
    if (!core.asleep && personality.sleepNow) personality.sleepNow();
  }
  function wakeUp(how) {
    if (!bedside) return;
    bedside = false; dim.style.transition = 'opacity 0.6s ease'; dim.style.opacity = '0';
    if (core.asleep && personality.wake) personality.wake(how || 'stir');
    holdScreen(false); schedule();
  }
  addEventListener('pointerdown', () => { lastTouch = now(); if (bedside) wakeUp('startle'); }, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') { holdScreen(false); } else if (bedside) holdScreen(true); });
  setInterval(() => {
    const t = now();
    if (!prefs.bedside || !visible() || panelOpen()) { if (bedside && !prefs.bedside) wakeUp('stir'); return; }
    if (bedside) {
      if (!core.asleep && t - bedsideAt > 8000) wakeUp(); else drowsy();     // woke on its own (a signal)? then so does the room
      return;
    }
    const alone = t - lastTouch;
    if ((flatAndStill(t) && alone > 60000 && night()) || (night() && alone > 4 * 60000) || (flatAndStill(t) && alone > 10 * 60000)) enterBedside();
  }, 5000);

  // ---------- their eye, resting in its corner ----------
  function paint(ctx, { t, cx, cy, size, linkActive }) {
    const F = window.HavenFriend;
    if (!prefs.friend || !F || !F.has() || linkActive || bedside) return;
    // peeking in from its corner; a little nearer and brighter when they've just been in touch
    const recent = clamp(1 - (t - lastFriendSignal) / 20000, 0, 1);
    F.paintCameo(ctx, { t, cx, cy, size, rest: { show: 0.22 + recent * 0.25, alpha: 0.42 + recent * 0.35 + Math.sin(t / 2400) * 0.04 } });
  }
  function friendSignal() { lastFriendSignal = now(); }

  // ---------- The Optic rows ----------
  function row(label, small, control) {
    const d = document.createElement('div'); d.className = 'setting';
    const s = document.createElement('span'); s.textContent = label;
    const sm = document.createElement('small'); sm.textContent = small; s.appendChild(sm);
    d.append(s, control); return d;
  }
  function check(id, on, onChange) {
    const c = document.createElement('input'); c.type = 'checkbox'; c.id = id; c.checked = on;
    c.addEventListener('change', () => onChange(c.checked, c)); return c;
  }
  function mountSettings() {
    const anchor = document.getElementById('linkOpen');
    if (!anchor || document.getElementById('sensesGroup')) return;
    const h = document.createElement('h2'); h.className = 'optic-group'; h.id = 'sensesGroup'; h.textContent = 'Senses';
    const tilt = check('senseTilt', prefs.tilt, async (on, c) => {
      if (on && needsAsk) { const ok = await ask(); if (!ok) { c.checked = false; return; } prefs.motionGranted = true; }
      prefs.tilt = on; save(); base = null;
    });
    const bed = check('senseBedside', prefs.bedside, (on) => { prefs.bedside = on; save(); });
    const awake = check('senseAwake', prefs.keepAwake, (on) => { prefs.keepAwake = on; save(); if (bedside) holdScreen(on); });
    const fr = check('senseFriend', prefs.friend, (on) => { prefs.friend = on; save(); schedule(); });
    const rows = [h,
      row('Tilt to look', 'Tip your phone and its gaze rolls toward the low side.', tilt),
      row('Bedside', 'Left still and flat at night, it falls asleep and the screen dims around it.', bed)];
    if ('wakeLock' in navigator) rows.push(row('Keep the screen on while it sleeps', 'For a nightstand. Uses more battery.', awake));
    rows.push(row('Their Eye nearby', 'In Eye Contact, their Eye rests faintly in its corner.', fr));
    // after the "Your Eye" group (Eye.D. + Eye Contact)
    let after = anchor; rows.forEach((r) => { after.insertAdjacentElement('afterend', r); after = r; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSettings); else mountSettings();

  return {
    paint, friendSignal, ask, wakeUp, enterBedside,
    diagnostics: () => ({ prefs: { ...prefs }, bedside, tilt: ori && base ? { b: +(ori.b - base.b).toFixed(1), g: +(ori.g - base.g).toFixed(1) } : null, ios: isIOS })
  };
};
