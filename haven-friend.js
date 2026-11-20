/* HAVEN LINK friends: your linked friend's real HAVEN.
   When two HAVENs are linked they swap profiles (seed, name, stage, branch, mutations, birth day) through
   the same encrypted LINK relay. With that, their exact eye can be grown here:
   - it peeks in from the friend's corner whenever a signal travels between you,
   - their signals arrive in their own colours,
   - the LINK sheet shows both HAVENs side by side.
   Needs the native Phone.linkProfile(json) bridge; without it everything falls back to the old LINK look.
   Stored as haven.link.friend.v1 and cleared on unlink. */
(function (root) {
  'use strict';
  const KEY = 'haven.link.friend.v1';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const FRIEND = (() => { const x = -0.55, y = -0.83, l = Math.hypot(x, y); return { x: x / l, y: y / l }; })();
  let friend = null, fdna = null, linked = false, native = null, lastSent = '', lastSentAt = 0;
  // 4.0: another friend can come over for a while (their eye is the one that peeks in and signals)
  let visitor = null, visitorUntil = 0;
  const shown = () => (visitor && Date.now() < visitorUntil ? visitor : fdna);

  function load() {
    try { friend = JSON.parse(localStorage.getItem(KEY)); } catch (e) { friend = null; }
    fdna = friend && root.HavenDNA ? root.HavenDNA.friendDNA(friend.profile) : null;
    if (!fdna) friend = null;
  }
  function save() { try { friend ? localStorage.setItem(KEY, JSON.stringify(friend)) : localStorage.removeItem(KEY); } catch (e) {} }
  function changed() { cameoEye = null; renderSheet(); try { root.dispatchEvent(new CustomEvent('haven:friend')); } catch (e) {} }

  // ---------- sending and receiving ----------
  function sendMine(force) {
    if (!linked || !native || !root.HavenDNA) return;
    const p = root.HavenDNA.profile();
    if (!p) return;
    const json = JSON.stringify(p);
    // Same profile: at most every 6 hours, so a friend who was offline still gets it eventually.
    if (!force && json === lastSent && Date.now() - lastSentAt < 6 * 3600000) return;
    lastSent = json; lastSentAt = Date.now();
    native('linkProfile', json);
  }
  function receive(p) {
    if (!root.HavenDNA) return false;
    const clean = root.HavenDNA.cleanProfile(p);
    if (!clean) return false;
    const before = friend && JSON.stringify(friend.profile);
    friend = { profile: clean, at: Date.now() };
    fdna = root.HavenDNA.friendDNA(clean);
    save();
    if (before !== JSON.stringify(clean)) changed();
    if (!before) sendMine(true);          // first time we meet them: make sure they have us too
    return true;
  }
  function setLinked(on, nativeFn) {
    if (nativeFn) native = nativeFn;
    const was = linked;
    linked = !!on;
    if (linked && !was) sendMine(true);
    if (!linked && was && friend) { friend = null; fdna = null; save(); changed(); }   // unlinked: forget them
  }
  addEventListener('haven:dna', () => sendMine(false));
  addEventListener('haven:greet', () => sendMine(false));

  // ---------- their colours ----------
  const lift = (rgb, k) => rgb.map((c) => Math.round(c + (255 - c) * k));
  function hueFor(kind, base) {
    const fd = shown();
    if (!fd) return base;
    const own = lift(fd.accent, 0.3);
    if (kind === 'pulse') return own;
    return base.map((c, i) => Math.round(c * 0.65 + own[i] * 0.35));   // spark and calm keep their character
  }
  function ownHue(kind, base) {
    const d = root.HavenDNA && root.HavenDNA.dna();
    if (!d) return base;
    const own = lift(d.accent, 0.3);
    if (kind === 'pulse') return own;
    return base.map((c, i) => Math.round(c * 0.65 + own[i] * 0.35));
  }

  // ---------- the cameo: their HAVEN peeks in from the friend's corner ----------
  let cameoEye = null, cameoCanvas = null, cameoLast = 0;
  function cameoFor(px) {
    const Eye = root.HavenEye;
    const fd = shown();
    if (!Eye || !fd) return null;
    const dpr = Math.min(2, root.devicePixelRatio || 1), S = Math.round(px * dpr);
    if (!cameoEye || cameoCanvas.width !== S || cameoEye._for !== fd) {
      cameoCanvas = cameoCanvas || document.createElement('canvas');
      cameoCanvas.width = cameoCanvas.height = S;
      cameoEye = new Eye(fd, cameoCanvas); cameoEye._for = fd;
      cameoEye.auto = true;
    }
    return cameoEye;
  }
  // r: the active LINK reaction. Incoming: they send it, then watch it land. Outgoing: they look up to catch it.
  // rest: { show, alpha } = resting quietly in its corner while you're in Eye Contact (3.2), no signal needed
  function paintCameo(ctx, { t, r, cx, cy, size, rest }) {
    if (!shown() || (!r && !rest)) return;
    const u = r ? clamp((t - r.at) / r.duration) : 0;
    const incoming = r ? /-in$|receive|resonance|hello/.test(r.name) : false;
    const show = rest ? rest.show : ease(u / 0.22) * (1 - ease((u - (incoming ? 0.78 : 0.7)) / 0.22));
    if (show <= 0.01) return;
    const fr = size * 0.58, dw = (fr / 0.36) * 1.0;      // the renderer draws its marble at 36% of its canvas
    const e = cameoFor(dw);
    if (!e) return;
    const far = size * 3.9, near = size * 2.55, d = far + (near - far) * show;
    const x = cx + FRIEND.x * d, y = cy + FRIEND.y * d;
    // it looks toward your HAVEN, and blinks when the signal leaves or arrives
    const s = t / 1000;
    if (rest) e.auto = true;                     // resting: it just lives its own life, glancing your way now and then
    else {
      e.auto = true; e.setTarget(-FRIEND.x * 0.85, -FRIEND.y * 0.85); e.reactUntil = s + 0.5;
      if (!e._linkBlink || e._linkBlink !== r.at) { e._linkBlink = r.at; setTimeout(() => e.blinkNow(), incoming ? 260 : 700); }
    }
    const dt = Math.min(0.05, Math.max(0, s - (cameoLast || s))); cameoLast = s;
    e.step(s, dt || 0.016); e.draw(s);
    ctx.save();
    ctx.globalAlpha = show * (rest ? rest.alpha : 1);
    if (rest) { ctx.beginPath(); ctx.arc(x, y, dw * 0.47, 0, Math.PI * 2); ctx.clip(); }   // no square edge on its glow
    ctx.drawImage(cameoCanvas, x - dw / 2, y - dw / 2, dw, dw);
    ctx.restore();
  }
  const busy = (r) => !!shown() && !!r;

  // ---------- LINK sheet: both HAVENs side by side ----------
  const MATCH = {
    'curious+curious': 'Two curious Eyes. Nobody is getting any peace.',
    'shy+shy': 'Two shy Eyes. They will take turns not looking at each other.',
    'hyper+sleepy': 'One bounces off the walls, the other wants a nap.',
    'grumpy+hyper': 'The hyper one is trying. The grumpy one is not impressed.',
    'hyper+shy': 'Too much energy for one very shy eye.',
    'dramatic+dramatic': 'Every pulse is an event. Every single one.',
    'calm+hyper': 'One calm, one chaos. A classic.',
    'grumpy+grumpy': 'Two grumpy Eyes, judging the world together.',
    'smug+smug': 'Two smug Eyes. Each thinks it is the rare one.',
    'curious+shy': 'The curious one keeps looking. The shy one keeps looking away.',
    'sleepy+sleepy': 'Two sleepy Eyes. Pulses arrive mid-nap.',
    'grumpy+shy': 'The shy one tries. The grumpy one squints. Progress.'
  };
  function matchLine(a, b) {
    const key = [a, b].sort().join('+');
    if (MATCH[key]) return MATCH[key];
    if (a === b) return 'Two ' + a + ' Eyes. Kindred spirits.';
    return 'A ' + a + ' Eye and a ' + b + ' one.';
  }
  let sheetEyes = [], sheetRaf = 0;
  function renderSheet() {
    const box = document.getElementById('linkFriends');
    if (!box) return;
    const mine = root.HavenDNA && root.HavenDNA.dna();
    box.hidden = !(fdna && mine);
    sheetEyes = [];
    if (box.hidden) return;
    const info = (d) => {
      const st = root.HavenDNA.STAGES[d.stage || 0].name + (d.branch ? ' · ' + root.HavenDNA.BRANCHES[d.branch].name : '');
      return `<canvas></canvas><b></b><small class="t-${d.tier}">${d.tier[0].toUpperCase() + d.tier.slice(1)} · ${st}</small><small>${d.words.join(' · ')}</small>`;
    };
    box.innerHTML = `<div class="lf-pair"><div class="lf-eye">${info(mine)}</div><div class="lf-link">⟷</div><div class="lf-eye">${info(fdna)}</div></div><p class="lf-match"></p>`;
    const cells = box.querySelectorAll('.lf-eye');
    cells[0].querySelector('b').textContent = mine.name + ' (yours)';
    cells[1].querySelector('b').textContent = fdna.name;
    box.querySelector('.lf-match').textContent = matchLine(mine.firstWord, fdna.firstWord);
    [mine, fdna].forEach((d, i) => {
      const c = cells[i].querySelector('canvas');
      const e = new root.HavenEye(d, c);
      e.resize();
      // they look at each other
      e.gaze.x = i ? -0.6 : 0.6; e.target = { x: i ? -0.6 : 0.6, y: 0 };
      sheetEyes.push(e);
    });
    tickSheet();
  }
  function tickSheet() {
    cancelAnimationFrame(sheetRaf);
    const sheet = document.getElementById('linkSheet');
    if (!sheetEyes.length || !sheet || sheet.hidden || document.visibilityState !== 'visible') { sheetRaf = 0; return; }
    const t = performance.now() / 1000;
    for (const e of sheetEyes) {
      if (!e.canvas.width || e.canvas.width < 10) e.resize();
      if (Math.random() < 0.004) e.setTarget(e === sheetEyes[0] ? 0.6 : -0.6, (Math.random() - 0.5) * 0.3);   // mostly at each other
      e.step(t, 1 / 30); e.draw(t);
    }
    sheetRaf = requestAnimationFrame(tickSheet);
  }
  // Start the little eyes when the sheet opens.
  new MutationObserver(() => { const s = document.getElementById('linkSheet'); if (s && !s.hidden) { sheetEyes.forEach((e) => e.resize()); tickSheet(); } })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

  load();
  root.HavenFriend = {
    receive, setLinked, sendMine, paintCameo, busy, hueFor, ownHue, renderSheet,
    has: () => !!shown(), dna: () => shown(), profile: () => (friend ? friend.profile : null),
    // 4.0: a different friend's eye visits for a while (signals from them peek in as them)
    visit(profile, ms = 9000) {
      const d = profile && root.HavenDNA ? root.HavenDNA.friendDNA(profile) : null;
      if (!d) return false;
      if (!visitor || visitor.seed !== d.seed) cameoEye = null;
      visitor = d; visitorUntil = Date.now() + ms;
      clearTimeout(this._vt); this._vt = setTimeout(() => { visitor = null; cameoEye = null; }, ms + 50);
      return true;
    },
    // testing: HavenFriend.simulate() pretends a random friend linked up
    simulate(seed, stage = 2, branch = 'feral') {
      const s = seed == null ? (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0) : seed;
      return receive({ v: 1, seed: s, name: '', stage, branch, mutations: [], born: Date.now() - 40 * 864e5 });
    }
  };
  if (document.readyState !== 'loading') renderSheet(); else document.addEventListener('DOMContentLoaded', renderSheet);
})(typeof window === 'undefined' ? globalThis : window);
