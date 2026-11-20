/* EYES 4.1 · Eye Contact 2.0: the Living Constellation and the Meeting Space.
   Shared by Android and iPhone. Loads after eyes-friends.js and eyes-social.js.

   One full-screen scene with three layers:
     .ec-sky    one canvas: stars, dust, threads between Eyes, signals, resonance, unformed Eyes
     .ec-stage  one <button> per Eye with its own canvas, drawn by the real renderer (HavenEye → HavenRender)
     .ec-ui     header, panels, signal controls (plain DOM, so it stays accessible)
   Modes: 'sky' (constellation), 'meet' (two Eyes), 'invite', 'join'. Nodes are reused between modes, so
   choosing a friend physically carries both Eyes into the Meeting Space.

   Honesty rules (see the brief):
   - A local launch animation stops short of their Eye until the protocol knows more: the relay accepted
     it, their phone acknowledged playing it ('ack', newer phones only), or it failed.
   - Their Eye only reacts to your signal when their phone confirmed it. Otherwise the signal settles
     beside a resting Eye as a little waiting light, or dissolves quietly (older phones can't confirm).
   - Pairing steps come from EyesFriends.stage(), which only reports what this phone has observed.
   - Resonance only plays when the protocol produced one.

   Future interactions (Peek, Mirror, Orbit): EyesContact.register(name, { cap, label, … }). A registered
   interaction is only offered to a friend whose phone advertised `cap` in its hello (EyesFriends.supports).
   Nothing is registered for Phase 3 yet, so nothing pretends to work. */
'use strict';
(function (root) {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeIn = (x) => Math.pow(clamp(x), 2.2);
  const F = () => root.EyesFriends;
  const D = () => root.HavenDNA;
  const isWeb = !!root.EYES_WEB;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ago = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; const d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago'); };
  const day = (t) => (t ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '');
  const native = (m, ...a) => { try { if (root.Phone && typeof Phone[m] === 'function') Phone[m](...a); } catch (e) {} };
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
  const now = () => performance.now() / 1000;

  // ---------- the signals (and the registry Phase 2/3 interactions will join) ----------
  const SIG = {
    pulse: { label: 'Pulse', hint: 'a warm beat', c: [255, 146, 168], c2: [255, 200, 150], dur: 1.55, bow: 0.12 },
    spark: { label: 'Spark', hint: 'a bright little star', c: [255, 212, 122], c2: [255, 250, 228], dur: 1.0, bow: 0.3 },
    calm: { label: 'Calm', hint: 'a slow, soft tide', c: [128, 214, 230], c2: [128, 168, 255], dur: 2.5, bow: 0.06 }
  };
  const INTERACTIONS = new Map();
  ['pulse', 'spark', 'calm'].forEach((k) => INTERACTIONS.set(k, { core: true, cap: null, ...SIG[k] }));
  function register(name, def) {
    if (!/^[a-z]{2,12}$/.test(name) || INTERACTIONS.has(name) || !def || !def.cap) return false;
    INTERACTIONS.set(name, { core: false, ...def });
    return true;
  }
  const available = (b) => [...INTERACTIONS.entries()].filter(([, d]) => d.core || (b && b.f && F().supports(b.f, d.cap) && F().CAPS.includes(d.cap)));

  // ---------- who's out there ----------
  const dnaCache = new Map();
  function dnaOf(profile) {
    if (!profile || !D()) return null;
    const k = JSON.stringify(profile);
    if (!dnaCache.has(k)) { try { dnaCache.set(k, D().friendDNA(profile)); } catch (e) { dnaCache.set(k, null); } }
    return dnaCache.get(k);
  }
  const madeAt = new Map();          // when an introduction completed while EYES was open (for "Eye Contact made")
  function nativeBeing() {
    if (isWeb || !root.Haven || !Haven.diagnostics) return null;
    let d = null; try { d = Haven.diagnostics().link; } catch (e) {}
    if (!d || !d.linked) return null;
    const p = root.HavenFriend && HavenFriend.profile ? HavenFriend.profile() : null;
    const st = F().native();
    return { key: 'native', native: true, pending: !d.paired, paired: !!d.paired, connection: d.connection, profile: p, stats: st.stats || {}, firsts: st.firsts || {}, since: st.since };
  }
  function beings() {
    const out = [], nat = nativeBeing();
    if (nat) out.push(nat);
    F().list().forEach((f) => out.push({ key: f.code, f, native: false, pending: !f.peer, profile: f.profile }));
    return out;
  }
  function nameOf(b) {
    if (!b) return '';
    if (b.native) { const d = dnaOf(b.profile); return d ? d.name : 'Their Eye'; }
    const f = b.f; return f.nick || (f.profile && f.profile.name) || (f.peer ? 'Their Eye' : 'Someone new');
  }
  // Status in plain words. Each one is something this phone knows.
  function stateOf(b) {
    if (b.native) {
      if (!b.paired) return { id: 'waiting', label: 'Waiting for their Eye', sub: 'your first Eye Contact' };
      if (b.connection === 'offline') return { id: 'reconnecting', label: 'Trying to reconnect', sub: '' };
      if (!b.profile) return { id: 'introducing', label: 'Introducing itself', sub: '' };
      return { id: 'linked', label: 'Linked', sub: 'your first Eye Contact' };
    }
    const f = b.f, conn = F().connection(f);
    if (!f.peer) return { id: 'waiting', label: 'Waiting for their Eye', sub: f.joined ? 'your invitation is out' : 'invite not opened yet' };
    if (conn === 'offline') return { id: 'reconnecting', label: 'Trying to reconnect', sub: f.lastSeen ? 'last here ' + ago(f.lastSeen) : '' };
    if (!f.profile) return { id: 'introducing', label: 'Introducing itself', sub: '' };
    if (madeAt.has(f.code) && Date.now() - madeAt.get(f.code) < 90000) return { id: 'made', label: 'Eye Contact made', sub: '' };
    if (F().online(f)) return { id: 'awake', label: 'Awake now', sub: '' };
    return { id: 'resting', label: 'Resting', sub: f.lastSeen ? 'last here ' + ago(f.lastSeen) : '' };
  }
  const awake = (b) => !!b && !b.native && !!b.f && F().online(b.f);

  // ---------- motion: Haven's own setting (Auto / On / Gentle / Off) ----------
  function motionMode() {
    try { const d = Haven.diagnostics(); if (d.motion === false) return 'off'; if (d.gentle) return 'gentle'; } catch (e) {}
    if (document.documentElement.dataset.motion === 'off') return 'off';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'gentle';
    return 'on';
  }

  // ---------- scene state ----------
  let el = null, sky = null, sx = null, stageEl = null, ui = null;
  let W = 0, H = 0, dpr = 1, mode = 'sky', focusKey = null, motion = 'on';
  let raf = 0, lastT = 0, lastDraw = 0, tween = null, staticSky = null, resK = 0, dragOrb = null;
  let timers = [], fx = [], parts = [], motes = [], twinkles = [], nodes = new Map(), myColor = [111, 193, 202];
  let pendingInvite = null, joinCode = '', joinedKey = null, liveText = '', toastT = 0, missedPlayed = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers = timers.filter((x) => x !== id); if (el) fn(); }, ms); timers.push(id); return id; };

  function eyeColor(dna) { try { return D().mapColor(111, 193, 202, dna); } catch (e) { return [111, 193, 202]; } }

  // ---------- open / close ----------
  function open(opts = {}) {
    if (!D() || !D().has() || !root.HavenEye) { if (root.EyesSocial && EyesSocial.caption) EyesSocial.caption('Wake your Eye first'); return; }
    if (root.EyesSocial && EyesSocial.close) EyesSocial.close();
    if (!el) build();
    motion = motionMode();
    el.dataset.motion = motion;
    sync(true);
    if (opts.meet) meet(opts.meet, true);
    else if (opts.invite) showInvite(opts.invite);
    else if (opts.join !== undefined) showJoin(opts.join);
    else setMode('sky', true);
    start();
    try { root.Haven && Haven.holdHome && Haven.holdHome(true); } catch (e) {}
  }
  function close() {
    if (!el) return;
    stop();
    timers.forEach(clearTimeout); timers = [];
    removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis);
    nodes.forEach((n) => { if (n.eye) clearTimeout(n.eye.reactTimer); });
    nodes.clear(); fx = []; parts = []; dragOrb = null; tween = null; staticSky = null;
    el.remove(); el = sky = sx = stageEl = ui = null; mode = 'sky'; focusKey = null; pendingInvite = null; joinedKey = null;
    try { root.Haven && Haven.holdHome && Haven.holdHome(false); } catch (e) {}
  }
  const isOpen = () => !!el;

  function build() {
    el = document.createElement('section');
    el.id = 'eyesContact'; el.className = 'ec'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Eye Contact');
    el.innerHTML = `<canvas class="ec-sky" aria-hidden="true"></canvas><div class="ec-stage"></div>
      <div class="ec-ui">
        <header class="ec-top"><button type="button" class="ec-icon ec-back" aria-label="Back"><span aria-hidden="true">‹</span></button>
          <div class="ec-title"><h2>Eye Contact</h2><p class="ec-chip" hidden><i></i><span></span></p></div>
          <button type="button" class="ec-icon ec-more" aria-label="More" aria-expanded="false"><span aria-hidden="true">⋯</span></button>
          <button type="button" class="ec-icon ec-close" aria-label="Close Eye Contact"><span aria-hidden="true">×</span></button></header>
        <div class="ec-panel"></div>
        <p class="ec-live" role="status" aria-live="polite"></p>
        <div class="ec-toast" role="status" aria-live="polite" hidden></div>
        <div class="ec-drawer" hidden><div class="ec-drawer-in"></div></div>
      </div>`;
    document.body.appendChild(el);
    sky = el.querySelector('.ec-sky'); sx = sky.getContext('2d'); stageEl = el.querySelector('.ec-stage'); ui = el.querySelector('.ec-ui');
    el.querySelector('.ec-close').onclick = close;
    el.querySelector('.ec-back').onclick = () => back();
    el.querySelector('.ec-more').onclick = () => toggleDrawer();
    el.querySelector('.ec-toast').onclick = (e) => { const k = e.currentTarget.dataset.key; if (k) meet(k); };
    myColor = eyeColor(D().dna());
    el.style.setProperty('--me', myColor.map((x) => x | 0).join(','));
    addEventListener('resize', onResize); document.addEventListener('visibilitychange', onVis);
    resize();
  }
  function back() {
    if (!el) return false;
    const dr = el.querySelector('.ec-drawer'); if (!dr.hidden) { toggleDrawer(false); return true; }
    if (mode === 'sky') { close(); return true; }
    setMode('sky'); return true;
  }
  function onVis() { if (document.visibilityState === 'visible') { motion = motionMode(); el.dataset.motion = motion; sync(); start(); } else stop(); }
  function onResize() { resize(); relayout(true); }
  function resize() {
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.5);
    sky.width = Math.round(W * dpr); sky.height = Math.round(H * dpr);
    sx.setTransform(dpr, 0, 0, dpr, 0, 0);
    staticSky = null; seedSky();
  }

  // ---------- the sky ----------
  function seedSky() {
    const r = mulberry((D().dna().seed ^ 0x51ab) >>> 0);
    const n = Math.round((W * H) / 5200);
    const c = document.createElement('canvas'); c.width = sky.width; c.height = sky.height;
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#03070a'); bg.addColorStop(0.55, '#050b10'); bg.addColorStop(1, '#020405');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // nebulae in this Eye's own light: its universe
    const neb = [[0.2, 0.18, 0.75, 0.07], [0.85, 0.62, 0.6, 0.05], [0.5, 1.0, 0.9, 0.045]];
    for (const [x, y, s, a] of neb) {
      const R = Math.max(W, H) * s, gr = g.createRadialGradient(W * x, H * y, 0, W * x, H * y, R);
      gr.addColorStop(0, rgba(myColor, a)); gr.addColorStop(0.5, rgba(myColor, a * 0.35)); gr.addColorStop(1, rgba(myColor, 0));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    twinkles = [];
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, rad = 0.25 + Math.pow(r(), 3) * 1.1, a = 0.12 + r() * 0.5;
      if (r() < 0.12) { twinkles.push({ x, y, rad: rad + 0.25, a, ph: r() * TAU, sp: 0.4 + r() * 1.4 }); continue; }
      g.fillStyle = `rgba(220,236,240,${a})`; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    staticSky = c;
    motes = Array.from({ length: Math.min(18, Math.round((W * H) / 26000)) }, () => ({ x: r() * W, y: r() * H, vx: (r() - 0.5) * 4, vy: -1 - r() * 3, r: 0.6 + r() * 1.4, a: 0.05 + r() * 0.12, ph: r() * TAU }));
  }
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- nodes (one per Eye) ----------
  function sync(first) {
    if (!el) return;
    const list = beings(), keep = new Set(['me']);
    if (!nodes.has('me')) makeNode('me', { key: 'me', me: true });
    const me = nodes.get('me'); me.b = { key: 'me', me: true }; me.dna = D().dna();
    if (!me.eye) { me.eye = new HavenEye(me.dna, me.cv); fitCanvas(me); }
    me.el.classList.add('ec-has-eye'); me.state = { id: 'me', label: '' };
    list.forEach((b) => {
      keep.add(b.key);
      const n = nodes.get(b.key) || makeNode(b.key, b);
      const hadDna = n.dna, d = dnaOf(b.profile);
      n.b = b; n.state = stateOf(b);
      if (d && (!hadDna || hadDna.seed !== d.seed)) {
        n.dna = d; n.color = eyeColor(d);
        n.eye = new HavenEye(d, n.cv); fitCanvas(n);
        if (!first && !hadDna) form(n);                 // an Eye taking shape in front of you
      } else if (!d) { n.dna = null; n.eye = null; n.color = [200, 222, 230]; }
      n.el.classList.toggle('ec-has-eye', !!n.eye);
      n.el.dataset.state = n.state.id;
      labelNode(n);
    });
    nodes.forEach((n, k) => { if (!keep.has(k)) { n.el.remove(); nodes.delete(k); if (focusKey === k && mode === 'meet') later(() => setMode('sky'), 30); } });
    labelNode(me);
    if (first) return;
    relayout();
    renderPanel();
  }
  function makeNode(key, b) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ec-node' + (key === 'me' ? ' ec-me' : '');
    btn.innerHTML = '<canvas class="ec-eye" aria-hidden="true"></canvas><span class="ec-label"><b></b><small></small></span>';
    stageEl.appendChild(btn);
    const r = Math.random;
    const n = { key, b, el: btn, cv: btn.querySelector('canvas'), x: W / 2, y: H * 0.45, size: 80, base: 0, op: 0, tx: W / 2, ty: H * 0.45, tsize: 80, top: 0, show: false,
      ph: [r() * TAU, r() * TAU, r() * TAU], eye: null, dna: null, color: [200, 222, 230], ctl: { until: 0, mode: 'idle', at: 0, mutualAt: 0 }, beat: -9, glow: 0, relax: 0, state: { id: 'me', label: '' } };
    btn.onclick = () => tapNode(n);
    btn.addEventListener('pointerenter', () => attention(n));
    btn.addEventListener('focus', () => attention(n));
    nodes.set(key, n);
    setBase(n, 80);
    return n;
  }
  function labelNode(n) {
    const b = n.el.querySelector('b'), s = n.el.querySelector('small');
    if (n.key === 'me') {
      const d = D().dna(); b.textContent = d.name; s.textContent = 'you';
      n.el.setAttribute('aria-label', `${d.name}, your Eye`);
      return;
    }
    const nm = nameOf(n.b); b.textContent = n.b.pending ? (n.b.native ? 'Your first Eye Contact' : n.b.f.joined ? 'Joining…' : 'Invite') : nm;
    s.textContent = n.state.label;
    n.el.setAttribute('aria-label', `${n.b.pending ? 'Pending invitation' : nm}, ${n.state.label}${n.state.sub ? ', ' + n.state.sub : ''}. ${n.b.pending ? 'Show invitation' : 'Open Meeting Space'}`);
  }
  function setBase(n, size) {
    size = Math.max(24, Math.round(size));
    if (n.base === size) return;
    n.base = size; n.el.style.width = size + 'px'; n.cv.style.width = n.cv.style.height = size + 'px';
    fitCanvas(n);
  }
  // canvas pixels from the node's own size (a hidden node has no clientWidth to measure)
  function fitCanvas(n) {
    const px = Math.round(n.base * Math.min(2, devicePixelRatio || 1));
    if (n.cv.width !== px) n.cv.width = n.cv.height = px;
  }
  function form(n) {                                    // their Eye forms from the point of light
    const e = n.eye; if (!e || motion === 'off') return;
    e.rv = { body: 0, iris: 0, pupil: 0, pattern: 0, glass: 0, rare: 0 }; e.lidK = 0; e.sweep = -1;
    n.forming = now();
  }
  function stepForming(n, t) {
    const e = n.eye; if (!n.forming || !e) return;
    const k = (t - n.forming) / (motion === 'gentle' ? 3.4 : 2.6);
    if (k >= 1) { e.rv = null; e.lidK = 1; e.sweep = -1; n.forming = 0; e.blinkNow(); return; }
    e.rv = { body: ease(k / 0.35), iris: ease((k - 0.15) / 0.35), pupil: ease((k - 0.3) / 0.3), pattern: ease((k - 0.35) / 0.45), glass: ease((k - 0.55) / 0.3), rare: ease((k - 0.7) / 0.3) };
    e.lidK = ease((k - 0.8) / 0.2); e.sweep = k > 0.6 && k < 0.95 ? (k - 0.6) / 0.35 : -1;
  }

  // ---------- layouts ----------
  function bounds() {
    const top = (el.querySelector('.ec-top').getBoundingClientRect().bottom || 64) + 6;
    const p = el.querySelector('.ec-panel').getBoundingClientRect();
    const bottom = Math.min(H - 8, (p.top || H * 0.75) - 6);
    return { top, bottom, h: Math.max(140, bottom - top) };
  }
  function layoutSky() {
    const B = bounds(), out = new Map(), others = [...nodes.values()].filter((n) => n.key !== 'me');
    const cx = W / 2, cy = B.top + B.h * 0.5, m = Math.min(W, B.h);
    const n = others.length;
    const meSize = n ? clamp(m * (n > 8 ? 0.24 : 0.3), 90, 200) : clamp(m * 0.46, 140, 280);
    out.set('me', { x: cx, y: n ? cy : B.top + B.h * 0.42, size: meSize, op: 1 });
    if (!n) return out;
    const rings = n > 8 ? [Math.ceil(n * 0.6), n - Math.ceil(n * 0.6)] : [n];
    let idx = 0;
    rings.forEach((count, ri) => {
      const k = ri === 0 ? 1 : 0.6, rx = Math.min(W * 0.37, B.h * (W > B.h * 1.4 ? 1.05 : 0.5)) * k, ry = B.h * 0.36 * k;
      const R = (rx + ry) / 2, chord = count > 1 ? 2 * R * Math.sin(Math.PI / count) : R * 2;
      const size = clamp(Math.min(m * (count <= 3 ? 0.27 : 0.22), chord * 0.72), 54, 150);
      for (let i = 0; i < count; i++, idx++) {
        const off = count === 2 ? 0.35 : count % 2 === 0 ? Math.PI / count : 0;
        const nd = others[idx], a = -Math.PI / 2 + (i / count) * TAU + (ri ? Math.PI / count : 0) + off;
        out.set(nd.key, { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, size: nd.b.pending ? size * 0.62 : size, op: 1 });
      }
    });
    relax(out, B);
    return out;
  }
  // push apart anything that overlaps (labels included), keep inside the safe area
  function relax(out, B) {
    const L = [...out.entries()];
    for (let it = 0; it < 40; it++) {
      let moved = false;
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const a = L[i][1], b = L[j][1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        const need = (a.size + b.size) * 0.5 * 0.86 + 18;
        if (d < need) {
          const push = (need - d) / 2, ux = dx / d, uy = dy / d;
          if (L[i][0] !== 'me') { a.x -= ux * push; a.y -= uy * push; } else { b.x += ux * push; b.y += uy * push; }
          if (L[j][0] !== 'me') { b.x += ux * push; b.y += uy * push; } else { a.x -= ux * push; a.y -= uy * push; }
          moved = true;
        }
      }
      for (const [, p] of L) {
        const half = p.size / 2, side = Math.max(half * 0.8 + 4, 66);      // room for the name under it
        p.x = clamp(p.x, side, W - side);
        p.y = clamp(p.y, B.top + half * 0.75, B.bottom - half * 0.75 - 30);
      }
      if (!moved) break;
    }
  }
  function layoutPair(themKey, compact) {
    const B = bounds(), out = new Map(), wide = W / B.h > 0.8;
    let s;
    if (wide) {
      s = Math.min(W * 0.36, B.h * 0.78, 300);
      out.set('me', { x: W * 0.27, y: B.top + B.h * 0.5, size: s * 0.94, op: 1 });
      out.set(themKey, { x: W * 0.73, y: B.top + B.h * 0.5, size: s, op: 1 });
    } else {
      s = Math.min(W * (compact ? 0.42 : 0.6), B.h * (compact ? 0.62 : 0.5), 320);
      out.set(themKey, { x: W * 0.66, y: B.top + Math.max(s * 0.5, B.h * 0.3), size: s, op: 1 });
      out.set('me', { x: W * 0.34, y: B.bottom - Math.max(s * 0.5 + 26, B.h * 0.28), size: s * 0.92, op: 1 });
      if (compact) { out.get(themKey).y = B.top + B.h * 0.5; out.get('me').y = B.top + B.h * 0.5; out.get(themKey).x = W * 0.72; out.get('me').x = W * 0.28; }
    }
    return out;
  }
  function relayout(instant) {
    if (!el) return;
    let L;
    if (mode === 'sky') L = layoutSky();
    else if (mode === 'meet') L = layoutPair(focusKey);
    else L = layoutPair(focusKey || '__ghost', true);
    nodes.forEach((n, k) => {
      const p = L.get(k);
      if (p) { n.tx = p.x; n.ty = p.y; n.tsize = p.size; n.top = p.op; n.show = true; }
      else { n.top = 0; n.tsize = n.size * 0.7; }
      n.el.classList.toggle('ec-focus', mode !== 'sky' && k === focusKey);
      n.el.tabIndex = n.top > 0 && (mode === 'sky' || k !== 'me') ? 0 : -1;
      n.el.setAttribute('aria-hidden', n.top > 0 ? 'false' : 'true');
    });
    ghost = mode === 'invite' || mode === 'join' ? L.get('__ghost') || null : null;
    const dur = instant || motion === 'off' ? 0 : motion === 'gentle' ? 0.9 : 0.75;
    tween = { t0: now(), dur, from: new Map([...nodes].map(([k, n]) => [k, { x: n.x, y: n.y, size: n.size, op: n.op }])) };
    if (!dur) { finishTween(); }
    kick();
  }
  let ghost = null;                                     // the unformed Eye on the invite / join screens
  function finishTween() {
    nodes.forEach((n) => { n.x = n.tx; n.y = n.ty; n.size = n.tsize; n.op = n.top; if (n.top > 0) setBase(n, n.tsize); n.show = n.top > 0; });
    tween = null;
    place(now());
  }
  function stepTween(t) {
    if (!tween) return;
    const k = tween.dur ? clamp((t - tween.t0) / tween.dur) : 1, e = easeInOut(k);
    nodes.forEach((n, key) => {
      const f = tween.from.get(key) || { x: n.tx, y: n.ty, size: n.tsize, op: 0 };
      n.x = mix(f.x, n.tx, e); n.y = mix(f.y, n.ty, e); n.size = mix(f.size, n.tsize, e); n.op = mix(f.op, n.top, ease(k));
      if (n.top > 0 && n.size > n.base * 1.02) setBase(n, n.tsize);      // grow the canvas first, then scale into it
    });
    if (k >= 1) finishTween();
  }
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  // drift + scale + beat → CSS transform
  function place(t) {
    const amp = motion === 'on' ? 1 : motion === 'gentle' ? 0.45 : 0;
    nodes.forEach((n) => {
      const vis = n.op > 0.01;
      n.el.hidden = !vis;
      if (!vis) return;
      const drift = mode === 'sky' ? 7 : 4;
      n.dx = (Math.sin(t * 0.23 + n.ph[0]) + Math.sin(t * 0.11 + n.ph[2]) * 0.6) * drift * amp;
      n.dy = (Math.cos(t * 0.19 + n.ph[1]) + Math.sin(t * 0.13 + n.ph[0]) * 0.5) * drift * 0.8 * amp;
      const bt = t - n.beat, beat = bt >= 0 && bt < 0.7 && motion === 'on' ? Math.sin((bt / 0.35) * Math.PI) * Math.exp(-bt * 3) * 0.07 : 0;
      const s = (n.size / n.base) * (1 + beat);
      n.el.style.transform = `translate3d(${(n.x + n.dx - n.base / 2).toFixed(1)}px,${(n.y + n.dy - n.base / 2).toFixed(1)}px,0) scale(${s.toFixed(4)})`;
      n.el.style.opacity = n.op.toFixed(3);
    });
  }
  const cx = (n) => n.x + (n.dx || 0), cy = (n) => n.y + (n.dy || 0);

  // ---------- modes ----------
  function setMode(m, instant) {
    if (!el) return;
    const was = mode;
    mode = m;
    if (m === 'sky') focusKey = null;
    el.dataset.mode = m;
    toggleDrawer(false);
    renderPanel();
    relayout(instant || was === m);
    resetControllers();
    if (m === 'sky') { setTitle('Eye Contact'); setChip(null); }
    say('');
  }
  function tapNode(n) {
    if (!el) return;
    if (n.key === 'me') { if (mode === 'sky') selfGlance(); return; }
    if (mode !== 'sky') return;
    if (n.b.pending) { if (n.b.native) return manageNative(); return n.b.f.joined ? showJoinProgress(n.key) : showInvite(n.b.f); }
    // 1 your Eye notices · 2 turns toward them · 3 they respond · 4 the thread forms · 5 into their Meeting Space
    const me = nodes.get('me'), t = now();
    if (motion === 'off') return meet(n.key);
    lookAt(me, cx(n), cy(n), 1.6); me.eye.pupilV += 1.4;
    n.selecting = t;
    later(() => { lookAt(n, cx(me), cy(me), 1.4); n.glow = 1; if (n.eye) { n.eye.pupilV += 1; n.eye.blinkNow(n.dna && n.dna.T.shyness > 0.6); } }, motion === 'gentle' ? 380 : 240);
    later(() => meet(n.key), motion === 'gentle' ? 1050 : 760);
    kick();
  }
  function meet(key, instant) {
    const n = nodes.get(key); if (!n || n.key === 'me') return;
    if (n.b.pending) return;
    focusKey = key;
    setMode('meet', instant);
    setTitle(nameOf(n.b));
    setChip(n.state);
    resetControllers();
    const me = nodes.get('me');
    // both Eyes acknowledge each other on arrival
    later(() => { lookAt(me, cx(n), cy(n), 1.2); lookAt(n, cx(me), cy(me), 1.0); }, motion === 'off' ? 0 : 700);
    if (!n.b.native && n.b.f.missed && n.b.f.missed.length && !missedPlayed.has(key)) later(() => replayMissed(n), 1300);
    if (!n.b.native && !n.b.f.profile) F().refreshProfile(n.b.f);
  }

  // ---------- panels ----------
  const panel = () => el.querySelector('.ec-panel');
  function setTitle(t) { el.querySelector('.ec-title h2').textContent = t; }
  function setChip(st) {
    const c = el.querySelector('.ec-chip');
    if (!st) { c.hidden = true; return; }
    c.hidden = false; c.dataset.state = st.id;
    c.querySelector('span').textContent = st.label + (st.sub ? ' · ' + st.sub : '');
  }
  function say(text, hold) {
    if (!el) return;
    const p = el.querySelector('.ec-live');
    if (text === liveText && text) return;
    liveText = text; p.textContent = text; p.classList.toggle('show', !!text);
    clearTimeout(say.t); if (text && !hold) say.t = setTimeout(() => { if (el && liveText === text) { p.classList.remove('show'); liveText = ''; } }, 7000);
  }
  function toast(text, key) {
    const t = el.querySelector('.ec-toast'); t.textContent = text; t.dataset.key = key || ''; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { if (el) t.hidden = true; }, 5200);
  }
  function renderPanel() {
    if (!el) return;
    const p = panel(); p.className = 'ec-panel ec-p-' + mode;
    el.querySelector('.ec-more').hidden = mode === 'invite' || mode === 'join';
    el.querySelector('.ec-back').hidden = mode === 'sky';
    if (mode === 'sky') panelSky(p);
    else if (mode === 'meet') panelMeet(p);
    else if (mode === 'invite') panelInvite(p);
    else panelJoin(p);
  }
  function panelSky(p) {
    const list = beings(), paired = list.filter((b) => !b.pending);
    if (!list.length) {
      p.innerHTML = `<div class="ec-empty"><p class="ec-lead">Your Eye is alone out here.</p>
        <p class="ec-sub">Eye Contact links your Eye with someone you know. No messages, no names, just signals your Eyes feel from anywhere.</p></div>
        <div class="ec-actions"><button type="button" class="ec-btn ec-primary" data-a="invite">Invite someone</button><button type="button" class="ec-btn" data-a="join">I have an invite</button></div>`;
    } else {
      p.innerHTML = `<p class="ec-hint">${paired.length ? 'Tap an Eye to meet it' : 'Your invitation is out there'}</p>
        ${paired.length > 1 ? `<div class="ec-all"><span>Send to everyone</span>${['pulse', 'spark', 'calm'].map((k) => `<button type="button" class="ec-mini" data-all="${k}" aria-label="Send a ${k} to everyone"><i class="ec-g ec-g-${k}"></i></button>`).join('')}</div>` : ''}
        <div class="ec-actions"><button type="button" class="ec-btn ec-primary" data-a="invite">Invite</button><button type="button" class="ec-btn" data-a="join">Join</button></div>`;
    }
    p.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => (b.dataset.a === 'invite' ? newInvite() : showJoin('')); });
    p.querySelectorAll('[data-all]').forEach((b) => { b.onclick = () => sendAll(b.dataset.all, b); });
  }
  function panelMeet(p) {
    const n = nodes.get(focusKey); if (!n) return;
    const st = n.state, sigs = available(n.b);
    let note = '';
    if (st.id === 'introducing') note = `<div class="ec-note"><p>Their Eye is still introducing itself. Keep EYES open on both phones for a moment.</p><button type="button" class="ec-btn ec-small" data-a="retry">Ask their Eye again</button></div>`;
    else if (st.id === 'reconnecting') note = `<div class="ec-note"><p>The relay can't be reached right now. EYES keeps trying on its own.</p><button type="button" class="ec-btn ec-small" data-a="reconnect">Reconnect now</button></div>`;
    else if (st.id === 'resting') note = `<p class="ec-hint">${esc(nameOf(n.b))} is resting. Signals wait for them and arrive when they open EYES.</p>`;
    else if (st.id === 'linked') note = `<p class="ec-hint">Signals travel through your first Eye Contact.</p>`;
    p.innerHTML = `${note}<div class="ec-sigs" role="group" aria-label="Signals">${sigs.map(([k, d]) => `<button type="button" class="ec-sig ec-sig-${k}" data-sig="${k}" aria-label="Send a ${esc(d.label)}: ${esc(d.hint)}"><span class="ec-orb" aria-hidden="true"><i class="ec-g ec-g-${k}"></i></span><b>${esc(d.label)}</b><small>${esc(d.hint)}</small></button>`).join('')}</div>
      <p class="ec-hint ec-gesture">${motion === 'off' ? 'Tap to send' : 'Tap to send, or drag one to their Eye'}</p>`;
    p.querySelectorAll('[data-sig]').forEach((b) => bindSig(b, b.dataset.sig));
    const a = p.querySelector('[data-a]');
    if (a) a.onclick = () => {
      if (a.dataset.a === 'retry') { F().refreshProfile(n.b.f); say('Asking their Eye to introduce itself…'); a.disabled = true; later(() => { a.disabled = false; }, 20000); later(() => { if (!n.b.f.profile) say('Still nothing. Ask them to open EYES too. It arrives as soon as both phones are open.'); }, 26000); }
      else { F().reconnect(n.b.f); say('Reconnecting…'); }
    };
  }
  function toggleDrawer(force) {
    if (!el) return;
    const dr = el.querySelector('.ec-drawer'), btn = el.querySelector('.ec-more');
    const show = force === undefined ? dr.hidden : force;
    dr.hidden = !show; btn.setAttribute('aria-expanded', String(show));
    if (!show) return;
    const box = dr.querySelector('.ec-drawer-in'); box.innerHTML = '';
    if (mode === 'meet') drawerFriend(box); else drawerSky(box);
    box.insertAdjacentHTML('beforeend', '<button type="button" class="ec-btn ec-quiet ec-done">Done</button>');
    box.querySelector('.ec-done').onclick = () => toggleDrawer(false);
    const first = box.querySelector('button, input, textarea'); if (first) first.focus();
  }
  function drawerSky(box) {
    box.insertAdjacentHTML('beforeend', '<h3>Eye Contact</h3><p class="ec-sub">Signals are end-to-end encrypted with the secret in each invitation. Only the two linked phones can read them.</p>');
    const holder = document.createElement('div'); box.appendChild(holder);
    if (root.EyesSocial && EyesSocial.notifyBlock) EyesSocial.notifyBlock(holder, () => toggleDrawer(true));
  }
  function drawerFriend(box) {
    const n = nodes.get(focusKey); if (!n) return;
    const b = n.b, d = n.dna, s = (b.native ? b.stats : b.f.stats) || {}, firsts = (b.native ? b.firsts : b.f.firsts) || {};
    const facts = [
      ['Linked since', day(b.native ? b.since : b.f.pairedAt || b.f.addedAt)],
      ['Signals traded', `${(s.sent || 0) + (s.recv || 0)} (you sent ${s.sent || 0})`],
      ['This week', b.native ? '' : String(s.weekOf ? (s.wsent || 0) + (s.wrecv || 0) : 0)],
      ['Resonances', String(s.resonances || 0)],
      ['First resonance', firsts.resonance ? day(firsts.resonance) : 'not yet'],
      ['Their Eye', d ? `${d.tier[0].toUpperCase() + d.tier.slice(1)} · ${d.pal.id} · ${d.pupil.name.toLowerCase()} pupil` : ''],
      ['Temperament', d ? d.words.join(' · ') : ''],
      ['Can confirm signals', b.native ? '' : F().supports(b.f, 'ack') ? 'yes' : 'not yet (older EYES)']
    ].filter((x) => x[1]);
    box.insertAdjacentHTML('beforeend', `<h3>${esc(nameOf(b))}</h3><dl class="ec-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`);
    if (b.native) {
      box.insertAdjacentHTML('beforeend', '<div class="ec-actions"><button type="button" class="ec-btn" data-a="manage">Manage this link</button></div>');
      box.querySelector('[data-a=manage]').onclick = manageNative;
      return;
    }
    const f = b.f;
    if (!f.profile) box.insertAdjacentHTML('beforeend', '<div class="ec-actions"><button type="button" class="ec-btn" data-a="retry">Ask their Eye to introduce itself</button></div>');
    box.insertAdjacentHTML('beforeend', `<div class="ec-actions"><button type="button" class="ec-btn" data-a="nick">Nickname</button><button type="button" class="ec-btn ec-danger" data-a="remove">Remove friend</button></div><div class="ec-nick" hidden><input maxlength="24" placeholder="${esc(nameOf(b))}" aria-label="Nickname"><button type="button" class="ec-btn ec-primary" data-a="nickgo">Save</button></div>`);
    const q = (s2) => box.querySelector(s2);
    if (q('[data-a=retry]')) q('[data-a=retry]').onclick = () => { F().refreshProfile(f); say('Asking their Eye to introduce itself…'); };
    q('[data-a=nick]').onclick = () => { q('.ec-nick').hidden = false; q('.ec-nick input').focus(); };
    q('[data-a=nickgo]').onclick = () => { F().rename(f, q('.ec-nick input').value); setTitle(nameOf(b)); toggleDrawer(false); };
    const rm = q('[data-a=remove]');
    rm.onclick = () => {
      if (rm.dataset.sure) { F().remove(f); toggleDrawer(false); setMode('sky'); return; }
      rm.dataset.sure = 1; rm.textContent = 'Tap again to remove'; later(() => { rm.dataset.sure = ''; rm.textContent = 'Remove friend'; }, 3000);
    };
  }
  function manageNative() { close(); const o = document.getElementById('linkOpen'); if (o) { o.dataset.eyesPass = '1'; o.click(); } }

  // ---------- invitations ----------
  const site = () => { try { return root.EyesDex && EyesDex.site ? EyesDex.site() : ''; } catch (e) { return ''; } };
  const inviteLink = (code) => (site() ? site().replace(/#.*$/, '') + '#join=' + code : '');
  const inviteText = (code) => `Let our Eyes meet.\nIn EYES, open Eye Contact (Friends on older versions) → Join, and paste this invite:\n${code}${inviteLink(code) ? `\n\nOr open it here: ${inviteLink(code)}` : ''}`;
  async function newInvite() {
    const pend = F().list().find((f) => !f.peer && !f.joined && Date.now() - (f.addedAt || 0) < 7 * 86400000);
    const f = pend || (await F().invite());
    showInvite(f);
  }
  function showInvite(f) {
    pendingInvite = f; focusKey = f.code;
    setMode('invite');
    setTitle('Let our Eyes meet');
  }
  function showJoin(code) {
    joinCode = code || ''; joinedKey = null; focusKey = null;
    setMode('join'); setTitle('Join their Eye');
  }
  function showJoinProgress(key) { joinedKey = key; focusKey = key; setMode('join'); setTitle('Joining their Eye'); }
  function panelInvite(p) {
    const f = pendingInvite; if (!f) return;
    const link = inviteLink(f.code), stg = F().stage(f);
    p.innerHTML = `<div class="ec-scroll">
      ${f.peer ? '' : `<div class="ec-qrcard"><canvas class="ec-qr" aria-label="QR code of your invitation" role="img"></canvas><p>${link ? 'They scan this with their phone camera,' : 'They scan this,'} or you send the invite.</p></div>
      <div class="ec-actions"><button type="button" class="ec-btn ec-primary" data-a="share">Share invite</button><button type="button" class="ec-btn" data-a="copy">Copy invite</button></div>`}
      ${steps(stg)}
      <div class="ec-actions ec-tail">${f.peer ? '' : '<button type="button" class="ec-btn ec-quiet" data-a="cancel">Cancel invitation</button>'}<button type="button" class="ec-btn ec-quiet" data-a="join">I have an invite instead</button></div>
      <p class="ec-fine">The invite holds the secret that encrypts your signals. Send it only to them.</p></div>`;
    const qr = p.querySelector('.ec-qr');
    if (qr && root.EyesQR) { try { EyesQR.paint(qr, link || f.code, { size: 240, fg: '#071015', bg: '#eaf5f6' }); } catch (e) {} }
    const on = (a, fn) => { const b = p.querySelector(`[data-a=${a}]`); if (b) b.onclick = fn; };
    on('share', () => { const text = inviteText(f.code); if (navigator.share) navigator.share({ text }).catch(() => {}); else copy(text, 'Invite copied. Send it to them.'); });
    on('copy', () => copy(inviteText(f.code), 'Invite copied. Send it to them.'));
    on('cancel', () => { F().remove(f); pendingInvite = null; setMode('sky'); });
    on('join', () => showJoin(''));
  }
  function panelJoin(p) {
    const f = joinedKey && nodes.get(joinedKey) ? nodes.get(joinedKey).b.f : null;
    if (f) {
      p.innerHTML = `<div class="ec-scroll">${steps(F().stage(f))}<p class="ec-sub">Keep EYES open. It finishes as soon as their phone hears yours. If they're away, it finishes when they open EYES.</p>
        <div class="ec-actions ec-tail"><button type="button" class="ec-btn ec-quiet" data-a="cancel">Cancel</button></div></div>`;
      p.querySelector('[data-a=cancel]').onclick = () => { F().remove(f); joinedKey = null; setMode('sky'); };
      return;
    }
    p.innerHTML = `<div class="ec-scroll"><p class="ec-lead">Paste the invite they sent you.</p>
      <textarea class="ec-code" rows="3" placeholder="The whole message, or just the HL1- code" autocomplete="off" spellcheck="false" aria-label="Invitation"></textarea>
      <div class="ec-actions"><button type="button" class="ec-btn" data-a="paste">Paste</button><button type="button" class="ec-btn ec-primary" data-a="go">Join</button></div>
      <p class="ec-err" role="alert"></p>
      <div class="ec-actions ec-tail"><button type="button" class="ec-btn ec-quiet" data-a="invite">Create an invite instead</button></div></div>`;
    const ta = p.querySelector('textarea'), err = p.querySelector('.ec-err'); ta.value = joinCode;
    p.querySelector('[data-a=paste]').onclick = async () => { try { ta.value = await navigator.clipboard.readText(); err.textContent = ''; } catch (e) { ta.focus(); err.textContent = 'Long-press the box and choose Paste.'; } };
    p.querySelector('[data-a=invite]').onclick = newInvite;
    p.querySelector('[data-a=go]').onclick = async () => {
      if (!F().findCode(ta.value)) { err.textContent = "That doesn't contain an Eye Contact invite. It starts with HL1-."; return; }
      try { const nf = await F().join(ta.value); joinCode = ''; sync(); showJoinProgress(nf.code); }
      catch (e) { err.textContent = e.message; }
    };
  }
  function steps(stg) {
    return `<ol class="ec-steps${stg.trouble ? ' trouble' : ''}" aria-label="Connection progress">${stg.steps.map((s, i) => `<li class="${s.done ? 'done' : i === stg.at ? 'now' : ''}"><i aria-hidden="true"></i><span>${esc(s.label)}${i === stg.at && stg.trouble ? ' <em>(the relay is unreachable, retrying)</em>' : ''}</span><span class="ec-vh">${s.done ? 'done' : i === stg.at ? 'in progress' : 'not yet'}</span></li>`).join('')}</ol>`;
  }
  async function copy(text, ok) { try { await navigator.clipboard.writeText(text); say(ok); } catch (e) { say('Copy failed. Long-press to select it.'); } }
  // live progress: refresh the invite/join panel when the pairing moves, without stealing focus
  function refreshProgress() {
    if (!el || (mode !== 'invite' && mode !== 'join')) return;
    const f = mode === 'invite' ? pendingInvite : joinedKey && nodes.get(joinedKey) ? nodes.get(joinedKey).b.f : null;
    if (!f) return;
    const live = F().list().find((x) => x.code === f.code); if (!live) return;
    const stg = F().stage(live), ol = panel().querySelector('.ec-steps');
    if (stg.done) return completed(live);
    if (mode === 'invite' && live.peer && panel().querySelector('.ec-qrcard')) return renderPanel();
    if (ol) ol.outerHTML = steps(stg);
  }
  function completed(f) {
    if (el.dataset.completing === f.code) return;
    el.dataset.completing = f.code;
    madeAt.set(f.code, Date.now());
    say('Eye Contact made.', true);
    const ol = panel().querySelector('.ec-steps'); if (ol) ol.outerHTML = steps(F().stage(f));
    later(() => { delete el.dataset.completing; sync(); meet(f.code); say('Eye Contact made. Say hello.'); }, motion === 'off' ? 600 : 2600);
  }

  // ---------- creature behaviour ----------
  // Gaze toward a screen point, held for `hold` seconds (HavenEye's own darts wait until reactUntil).
  function lookAt(n, px, py, hold) {
    if (!n || !n.eye) return;
    const dx = px - cx(n), dy = py - cy(n), L = Math.hypot(dx, dy) || 1, reach = Math.min(1, L / (n.size * 0.9));
    n.eye.setTarget((dx / L) * 0.92 * reach, (dy / L) * 0.72 * reach);
    n.eye.reactUntil = now() + (hold || 1);
    n.ctl.until = Math.max(n.ctl.until, now() + (hold || 1));
  }
  function lookAway(n, hold, down) {
    if (!n || !n.eye) return;
    const a = Math.random() * TAU;
    n.eye.setTarget(Math.cos(a) * 0.8, down ? 0.55 : Math.sin(a) * 0.55);
    n.eye.reactUntil = now() + hold;
  }
  function resetControllers() { nodes.forEach((n) => { n.ctl = { until: now() + 0.6 + Math.random(), mode: 'idle', at: 0, mutualAt: 0 }; }); }
  const T = (n) => (n.dna ? n.dna.T : { curiosity: 0.5, shyness: 0.5, energy: 0.5, grump: 0.3, drama: 0.4 });
  function attention(n) {
    if (!el || n.key === 'me' || mode !== 'sky' || motion === 'off') return;
    const me = nodes.get('me'); lookAt(me, cx(n), cy(n), 1.2);
    if (n.eye && !n.b.pending) later(() => lookAt(n, cx(me), cy(me), 0.9), 160);
  }
  function selfGlance() { const me = nodes.get('me'); if (!me || !me.eye) return; me.eye.blinkNow(); me.eye.pupilV += 1.2; say('That’s you.'); }
  // How a resting Eye looks: calm, dimmed, half-lidded; never dead.
  function restingLids(n) { const st = n.state.id; return st === 'resting' || st === 'reconnecting' ? 0.5 : st === 'linked' ? 0.12 : 0; }

  function behave(t) {
    const me = nodes.get('me'); if (!me) return;
    const gentle = motion === 'gentle';
    nodes.forEach((n) => {
      if (!n.eye || n.op < 0.05) return;
      const e = n.eye, Tn = T(n), sleepy = clamp((0.45 - Tn.energy) * 1.4, 0, 0.35);
      // lids: resting friends are drowsy, sleepy temperaments heavy, a sent Calm relaxes for a while
      const relax = n.relax > t ? 0.38 : 0;
      e.closeK = mix(e.closeK || 0, Math.max(restingLids(n), sleepy * 0.25, relax), 0.05);
      if (n.glow > 0) n.glow = Math.max(0, n.glow - 0.02);
    });
    if (mode === 'sky') {
      nodes.forEach((n) => {
        if (!n.eye || n.op < 0.05 || t < n.ctl.until) return;
        const Tn = T(n);
        if (n.key === 'me') {
          // your Eye checks on the others now and then, awake ones most
          const others = [...nodes.values()].filter((x) => x.key !== 'me' && x.op > 0.5);
          if (others.length && Math.random() < 0.55) {
            const w = others.map((x) => (awake(x.b) ? 3 : x.b.pending ? 0.6 : 1)), sum = w.reduce((a, b) => a + b, 0);
            let r = Math.random() * sum, pick = others[0]; for (let i = 0; i < others.length; i++) { r -= w[i]; if (r <= 0) { pick = others[i]; break; } }
            lookAt(n, cx(pick), cy(pick), mix(1.4, 3.2, Math.random()) * (gentle ? 1.5 : 1));
          } else n.ctl.until = t + mix(1.5, 4, Math.random());
        } else if (!n.b.pending) {
          const rest = n.state.id === 'resting' || n.state.id === 'reconnecting';
          if (Math.random() < (rest ? 0.15 : mix(0.2, 0.55, 1 - Tn.shyness))) lookAt(n, cx(me), cy(me), mix(0.8, 2.2, Math.random()) * (rest ? 2 : 1));
          else n.ctl.until = t + mix(2, 5, Math.random()) * (rest ? 1.8 : 1) * (gentle ? 1.5 : 1);
        }
      });
      return;
    }
    if (mode !== 'meet') {
      // invite / join: your Eye keeps glancing at where their Eye will be
      const tg = ghost || nodes.get(focusKey);
      if (tg && me.eye && t > me.ctl.until) { if (Math.random() < 0.6) lookAt(me, tg.x, tg.y, mix(1.2, 2.6, Math.random())); else me.ctl.until = t + mix(1, 3, Math.random()); }
      return;
    }
    const them = nodes.get(focusKey); if (!them || !me.eye) return;
    if (dragOrb) { lookAt(me, dragOrb.x, dragOrb.y, 0.4); lookAt(them, dragOrb.x, dragOrb.y, 0.4); if (them.eye && them.ctl.dragSeen !== dragOrb.t0) { them.ctl.dragSeen = dragOrb.t0; them.eye.pupilV += 1.3; } return; }
    meetBehave(me, them, t, gentle);
    if (them.eye) meetBehave(them, me, t, gentle);
    // eye contact: both looking at each other right now
    if (them.eye && me.ctl.mode === 'at' && them.ctl.mode === 'at' && t - Math.max(me.ctl.at, them.ctl.at) > 0.35 && t - (me.ctl.mutualAt || 0) > 5) {
      me.ctl.mutualAt = them.ctl.mutualAt = t;
      mutual(me, them, t); mutual(them, me, t);
    }
  }
  // Personality from the temperament dials (curiosity, shyness, energy, grump, drama), never a lookup table
  function meetBehave(n, other, t, gentle) {
    if (!n.eye || t < n.ctl.until) return;
    const Tn = T(n), resting = n.state.id === 'resting' || n.state.id === 'reconnecting';
    const pAt = resting ? 0.12 : mix(0.3, 0.78, 1 - Tn.shyness) * mix(0.85, 1.15, Tn.curiosity);
    if (n.ctl.mode !== 'at' && Math.random() < pAt) {
      const hold = (resting ? 1.2 : mix(0.9, 4.2, 1 - Tn.shyness) * mix(0.85, 1.7, Tn.grump)) * (gentle ? 1.4 : 1);
      lookAt(n, cx(other), cy(other), hold);
      n.ctl.mode = 'at'; n.ctl.at = t;
      if (Tn.curiosity > 0.55) n.eye.pupilGoal = 1 + n.dna.motion.dilate * 0.6;
    } else {
      const hold = (resting ? mix(3, 7, Math.random()) : mix(1, 3.4, Tn.shyness) * mix(1.3, 0.6, Tn.energy)) * (gentle ? 1.5 : 1);
      lookAway(n, hold, Tn.shyness > 0.6 && Math.random() < 0.6);
      n.ctl.mode = 'away'; n.ctl.until = t + hold; n.eye.pupilGoal = 1;
      if (!gentle && !resting && Tn.energy > 0.68 && Math.random() < 0.5) { n.eye.dartBurst = 2 + ((Math.random() * 3) | 0); n.eye.reactUntil = t; n.eye.nextDart = t; n.ctl.until = t + 1.2; }
    }
  }
  function mutual(n, other, t) {
    if (!n.eye || motion === 'off') return;
    const Tn = T(n), e = n.eye, w = n.dna ? n.dna.firstWord : '';
    if (Tn.shyness > 0.62 || w === 'shy') {                     // caught looking: glance down, lids drop
      later(() => { lookAway(n, mix(1.6, 2.8, Math.random()), true); e.moodGoal.squint = 0.32; n.ctl.mode = 'away'; n.ctl.until = now() + 2.2; later(() => { e.moodGoal.squint = 0; }, 1800); }, mix(250, 700, Math.random()));
    } else if (Tn.grump > 0.58 || w === 'smug' || w === 'grumpy') {   // a little staring contest
      e.moodGoal.squint = 0.42; lookAt(n, cx(other), cy(other), mix(3, 5.5, Tn.grump)); e.nextBlink = now() + 4.5;
      later(() => { e.moodGoal.squint = 0; e.blinkNow(true); }, 3600 + Tn.grump * 1500);
    } else if (Tn.energy > 0.66 || w === 'hyper') {             // excited: wide, then a skitter of glances
      e.moodGoal.wide = 0.5; later(() => { e.moodGoal.wide = 0; e.dartBurst = 3; e.reactUntil = now(); e.nextDart = now(); }, 900);
    } else if (Tn.curiosity > 0.6 || w === 'curious') {         // leans in: dilates
      e.pupilGoal = 1 + n.dna.motion.dilate; later(() => { e.pupilGoal = 1; }, 2400);
    } else if (Tn.drama > 0.6 || w === 'dramatic') {
      e.blinkT = now(); e.blinkQueue = 1;
    } else if (Tn.energy < 0.35 || w === 'sleepy') {            // drowsy, slow blink
      e.blinkNow(true);
    } else { later(() => e.blinkNow(), 600); }
  }

  // ---------- signals ----------
  let cool = 0;
  function bindSig(btn, kind) {
    let s = null;
    btn.addEventListener('pointerdown', (ev) => { if (btn.disabled) return; s = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, drag: false }; try { btn.setPointerCapture(ev.pointerId); } catch (e) {} });
    btn.addEventListener('pointermove', (ev) => {
      if (!s || ev.pointerId !== s.id) return;
      if (!s.drag && motion !== 'off' && Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0) > 16) { s.drag = true; dragOrb = { kind, x: ev.clientX, y: ev.clientY, t0: now() }; btn.classList.add('dragging'); kick(); }
      if (s.drag) { dragOrb.x = ev.clientX; dragOrb.y = ev.clientY; }
    });
    const end = (ev, cancel) => {
      if (!s || ev.pointerId !== s.id) return;
      const was = s; s = null; btn.classList.remove('dragging');
      if (!was.drag || !dragOrb) return;
      btn._skip = true; setTimeout(() => { btn._skip = false; }, 400);
      const them = nodes.get(focusKey), o = dragOrb; dragOrb = null;
      if (!them || cancel) return fizzle(o);
      const to = { x: cx(them), y: cy(them) }, start = { x: was.x0, y: was.y0 };
      const total = Math.hypot(to.x - start.x, to.y - start.y) || 1, done = 1 - Math.hypot(to.x - o.x, to.y - o.y) / total;
      if (Math.hypot(to.x - o.x, to.y - o.y) < them.size * 0.55 || done > 0.55) send(kind, { x: o.x, y: o.y }); else fizzle(o);
    };
    btn.addEventListener('pointerup', (ev) => end(ev, false));
    btn.addEventListener('pointercancel', (ev) => end(ev, true));
    btn.addEventListener('click', () => { if (btn._skip) return; send(kind); });
  }
  function fizzle(o) { fx.push({ type: 'fizzle', kind: o.kind, t0: now(), x: o.x, y: o.y }); say('Drag it all the way to their Eye to send it.'); kick(); }
  function coolDown() {
    cool = Date.now() + 1950;
    el.querySelectorAll('.ec-sig, .ec-mini').forEach((b) => { b.classList.add('cool'); });
    later(() => el.querySelectorAll('.ec-sig, .ec-mini').forEach((b) => b.classList.remove('cool')), 1950);
  }
  function send(kind, from) {
    const them = nodes.get(focusKey), me = nodes.get('me');
    if (!them || !me) return;
    if (Date.now() < cool) { say('A breath between signals…'); return; }
    const nm = nameOf(them.b), lbl = SIG[kind].label.toLowerCase();
    let entry;
    if (them.b.native) {
      native('linkPulse', kind);
      entry = { k: kind, t: Date.now(), st: 'sending', native: true, canFeel: false, awake: false };
      nativeOut.push(entry); later(() => { if (entry.st === 'sending') { entry.st = 'unknown'; } }, 9000);
    } else {
      entry = F().send(them.b.f, kind);
      if (!entry) { say('A breath between signals…'); return; }
    }
    coolDown();
    launch(kind, me, them, { entry, from, out: true });
    say(`Sending your ${lbl}…`);
    deliveryWatch(entry, nm, lbl);
  }
  const nativeOut = [];
  function deliveryWatch(e, nm, lbl) {
    e._nm = nm; e._lbl = lbl;
    later(() => { if (!e.felt && e.st === 'relayed' && e.canFeel && e.awake) say(`Sent. ${nm} hasn't felt it yet. It'll wait for them.`); }, 11000);
  }
  function deliveryText(e) {
    const nm = e._nm || 'Their Eye', lbl = e._lbl || SIG[e.k].label.toLowerCase();
    if (e.felt === 'live') return `${nm}'s Eye felt your ${lbl}.`;
    if (e.felt === 'later') return `${nm}'s Eye felt your ${lbl} when they came back.`;
    if (e.st === 'failed') return `Your ${lbl} couldn't leave this phone. Check your connection and try again.`;
    if (e.st === 'relayed') {
      if (e.native) return `Sent through your first Eye Contact.`;
      if (!e.canFeel) return `Sent. ${nm}'s EYES is an older version, so it can't confirm when it lands.`;
      if (!e.awake) return `Sent. It'll reach ${nm} when they open EYES.`;
      return `On its way to ${nm}…`;
    }
    return '';
  }
  function onDelivery(f, e) {
    if (!el) return;
    const n = nodes.get(f.code);
    if (n && !e._nm) { e._nm = nameOf(n.b); e._lbl = SIG[e.k] ? SIG[e.k].label.toLowerCase() : e.k; }
    const forHere = (mode === 'meet' && focusKey === f.code) || mode === 'sky';
    const flying = fx.some((x) => x.entry === e && x.phase !== 'arrive' && x.phase !== 'settle');
    if (forHere && (Date.now() - e.t < 60000 || e.felt) && !(flying && e.felt)) say(deliveryText(e));
    if (e.felt && n && !fx.some((x) => x.entry === e)) {           // felt later, while we watch: a waiting light goes home
      if (motion !== 'off' && n.op > 0.5) fx.push({ type: 'absorb', kind: e.k, t0: now(), to: n });
      react(n, e.k, nodes.get('me'));
    }
    kick();
  }
  function sendAll(kind, btn) {
    if (Date.now() < cool) return;
    const me = nodes.get('me'); let any = 0;
    F().list().forEach((f) => {
      if (!f.peer) return;
      const e = F().send(f, kind); const n = nodes.get(f.code);
      if (e && n) { any++; e._nm = nameOf(n.b); e._lbl = kind; launch(kind, me, n, { entry: e, out: true }); }
    });
    const nat = nodes.get('native');
    if (nat && nat.b.paired) { native('linkPulse', kind); any++; const e = { k: kind, t: Date.now(), st: 'sending', native: true }; nativeOut.push(e); launch(kind, me, nat, { entry: e, out: true }); }
    if (any) { coolDown(); say(`Your ${kind} is on its way to ${any === 1 ? 'one Eye' : any + ' Eyes'}.`); }
  }
  // Android native link: its signal events (eyes-social forwards them)
  function nativeEvent(ev, kind) {
    if (!el) return;
    if (ev === 'outgoing') { const e = nativeOut.find((x) => x.st === 'sending' && x.k === kind); if (e) { e.st = 'relayed'; if (mode !== 'sky' || focusKey === 'native') say(deliveryText(e)); } return; }
    if (ev === 'error') { const e = nativeOut.find((x) => x.st === 'sending'); if (e) { e.st = 'failed'; say(deliveryText(e)); } return; }
    if (ev === 'incoming') incoming('native', kind);
  }
  function incoming(key, kind) {
    if (!el) return;
    const n = nodes.get(key), me = nodes.get('me'); if (!n || !me) return;
    if (kind === 'resonance') return resonate(n);
    if (!SIG[kind]) return;
    const nm = nameOf(n.b), lbl = SIG[kind].label.toLowerCase();
    if (mode === 'meet' && focusKey !== key) { toast(`${nm} sent a ${lbl} · tap to meet`, key); return; }
    if (mode === 'invite' || mode === 'join') { toast(`${nm} sent a ${lbl}`, key); return; }
    launch(kind, n, me, { out: false });
    if (mode === 'meet') say(`${nm} sent a ${lbl}.`);
  }
  function replayMissed(n) {
    const f = n.b.f; if (!f || !f.missed || !f.missed.length) return;
    missedPlayed.add(n.key);
    const list = f.missed.slice(-5), counts = {};
    f.missed.forEach((m) => { counts[m.k] = (counts[m.k] || 0) + 1; });
    const words = Object.entries(counts).map(([k, c]) => `${c} ${k}${c > 1 ? 's' : ''}`).join(', ');
    say(`While you were away: ${words} from ${nameOf(n.b)}.`);
    list.forEach((m, i) => later(() => { if (mode === 'meet' && focusKey === n.key) launch(m.k, n, nodes.get('me'), { out: false, missed: true }); }, i * 1500));
    F().clearMissed(f);
  }

  // A signal is the sending Eye doing something, a thing crossing space, and the other Eye answering.
  function launch(kind, from, to, o) {
    const t = now();
    generate(from, kind);
    if (motion === 'off') { from.glow = 1; if (!o.out) later(() => react(to, kind, from), 300); else if (o.entry) watchStill(o.entry, to, from); kick(); return; }
    const S = SIG[kind], gentle = motion === 'gentle';
    fx.push({ type: 'sig', kind, from, to, out: !!o.out, entry: o.entry || null, t0: t + (o.from ? 0 : 0.28), dur: S.dur * (gentle ? 1.35 : 1), bow: S.bow * (Math.random() < 0.5 ? -1 : 1) * (kind === 'spark' ? 1 : 0.6),
      start: o.from || null, phase: 'travel', u: 0, wait: 0, trail: [], echoes: [], lastEcho: 0 });
    kick();
  }
  // Motion Off: no flights. The thread lights once, their Eye answers only when it really did.
  function watchStill(e, to, from) { const chk = () => { if (!el) return; if (e.felt) react(to, e.k, from); else if (e.st === 'sending' || (e.st === 'relayed' && e.canFeel && e.awake && Date.now() - e.t < 12000)) later(chk, 400); }; later(chk, 400); }
  function generate(n, kind) {
    if (!n || !n.eye) return;
    const e = n.eye, t = now();
    if (kind === 'pulse') { n.beat = t; later(() => { n.beat = now(); }, 380); }
    else if (kind === 'spark') { e.pupilV -= 2.4; e.moodGoal.wide = 0.45; later(() => { e.moodGoal.wide = 0; }, 700); }
    else if (kind === 'calm') { n.relax = t + 2.4; later(() => e.blinkNow(true), 500); }
    n.glow = 1;
  }
  // The receiving Eye answers in character
  function react(n, kind, from) {
    if (!n || !n.eye || !el) return;
    const e = n.eye, Tn = T(n), d = n.dna;
    n.glow = 1;
    if (from) lookAt(n, cx(from), cy(from), 1.4 + Tn.curiosity);
    if (kind === 'pulse') { n.beat = now(); e.pupilGoal = 1 + (d ? d.motion.dilate : 0.2); later(() => { e.pupilGoal = 1; }, 1600); }
    else if (kind === 'spark') {
      if (Tn.shyness > 0.65) { e.blinkNow(); later(() => lookAway(n, 1.4, true), 500); }
      else if (Tn.energy > 0.6) { e.moodGoal.wide = 0.6; later(() => { e.moodGoal.wide = 0; e.dartBurst = 3; e.nextDart = now(); e.reactUntil = now(); }, 600); }
      else { e.moodGoal.wide = 0.35; e.pupilGoal = 1 + (d ? d.motion.dilate : 0.2); later(() => { e.moodGoal.wide = 0; e.pupilGoal = 1; }, 1200); }
    } else if (kind === 'calm') { n.relax = now() + 2.6; later(() => e.blinkNow(true), 300); }
  }
  // Resonance: only when the protocol says both answered in time
  function resonate(n) {
    if (!el) return;
    const me = nodes.get('me'), nm = nameOf(n.b);
    if (mode === 'meet' && focusKey !== n.key) { toast(`Resonance with ${nm} · tap to meet`, n.key); return; }
    say(`Resonance with ${nm}.`);
    [me, n].forEach((x) => { if (!x.eye) return; x.glow = 1.6; x.beat = now(); x.eye.pupilGoal = 1.25; x.el.classList.add('ec-resonant'); });
    lookAt(me, cx(n), cy(n), 3.2); lookAt(n, cx(me), cy(me), 3.2);
    me.ctl.mode = n.ctl.mode = 'held';
    later(() => { [me, n].forEach((x) => { if (x.eye) { x.eye.pupilGoal = 1; x.el.classList.remove('ec-resonant'); } }); }, 3400);
    if (motion !== 'off') fx.push({ type: 'res', a: me, b: n, t0: now(), dur: motion === 'gentle' ? 4.2 : 3.6 });
    kick();
  }

  // ---------- drawing ----------
  function frame(ms) {
    raf = 0;
    if (!el || document.visibilityState !== 'visible') return;
    const t = ms / 1000;
    const busy = !!tween || fx.length > 0 || !!dragOrb || resK > 0.01 || [...nodes.values()].some((n) => n.forming);
    const step = motion === 'gentle' || !busy ? 1 / 30 : 1 / 60;
    if (t - lastDraw < step * 0.92) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, lastDraw ? t - lastDraw : step);
    lastDraw = t;
    const tt = now();
    stepTween(tt);
    behave(tt);
    place(tt);
    drawSky(tt, dt);
    nodes.forEach((n) => {
      if (!n.eye || n.op < 0.01) return;
      stepForming(n, tt);
      n.eye.step(tt, dt); n.eye.draw(tt);
    });
    if (motion !== 'off') raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!el) return;
    if (motion === 'off') { cancelAnimationFrame(raf); raf = requestAnimationFrame((ms) => { lastDraw = 0; frame(ms); }); return; }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function start() { lastDraw = 0; kick(); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  function drawSky(t, dt) {
    const g = sx;
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    if (staticSky) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(staticSky, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    resK = Math.max(0, resK - dt * 0.35);
    const live = motion !== 'off', amp = motion === 'on' ? 1 : 0.5;
    g.globalCompositeOperation = 'lighter';
    for (const s of twinkles) {
      const a = s.a * (live ? 0.55 + 0.45 * Math.sin(t * s.sp + s.ph) : 0.8) * (1 + resK * 1.2);
      g.fillStyle = `rgba(225,240,244,${clamp(a)})`; g.beginPath(); g.arc(s.x, s.y, s.rad, 0, TAU); g.fill();
    }
    for (const m of motes) {
      if (live) { m.x += m.vx * dt * amp; m.y += m.vy * dt * amp; if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; } if (m.x < -4) m.x = W + 4; if (m.x > W + 4) m.x = -4; }
      g.fillStyle = rgba(myColor, m.a * (0.6 + 0.4 * Math.sin(t * 0.7 + m.ph)) * (1 + resK)); g.beginPath(); g.arc(m.x, m.y, m.r, 0, TAU); g.fill();
    }
    drawThreads(g, t);
    drawPlaceholders(g, t);
    drawWaiting(g, t);
    drawFx(g, t, dt);
    if (dragOrb) drawOrb(g, dragOrb.kind, dragOrb.x, dragOrb.y, t, 1.1);
    g.globalCompositeOperation = 'source-over';
  }
  function edge(a, b, inset) {
    const ax = cx(a), ay = cy(a), bx = cx(b), by = cy(b), dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const ra = a.size * (inset || 0.3), rb = b.size * (inset || 0.3);
    return { ax: ax + (dx / L) * ra, ay: ay + (dy / L) * ra, bx: bx - (dx / L) * rb, by: by - (dy / L) * rb, L };
  }
  function curve(a, b, bow, inset, start) {
    const e = edge(a, b, inset);
    const ax = start ? start.x : e.ax, ay = start ? start.y : e.ay;
    const mx = (ax + e.bx) / 2, my = (ay + e.by) / 2, dx = e.bx - ax, dy = e.by - ay, L = Math.hypot(dx, dy) || 1;
    return { ax, ay, bx: e.bx, by: e.by, qx: mx - (dy / L) * bow * L, qy: my + (dx / L) * bow * L, L };
  }
  const bez = (c, u) => { const v = 1 - u; return { x: v * v * c.ax + 2 * v * u * c.qx + u * u * c.bx, y: v * v * c.ay + 2 * v * u * c.qy + u * u * c.by }; };
  function drawThreads(g, t) {
    const me = nodes.get('me'); if (!me || me.op < 0.05) return;
    const strong = fx.find((f) => f.type === 'res');
    nodes.forEach((n) => {
      if (n.key === 'me' || n.op < 0.05) return;
      if (mode === 'meet' && n.key !== focusKey) return;
      const st = n.state.id, pend = n.b.pending;
      let a = pend ? 0.07 : st === 'awake' || st === 'made' ? 0.3 : st === 'linked' ? 0.22 : 0.12;
      if (mode === 'meet') a *= 1.15;
      if (n.selecting) a += 0.45 * clamp((now() - n.selecting) / 0.5);
      const energ = strong && (strong.b === n || strong.a === n) ? Math.sin(clamp((t - strong.t0) / strong.dur) * Math.PI) : 0;
      a = clamp((a + energ * 0.6) * n.op * me.op);
      const c = curve(me, n, mode === 'sky' ? 0.07 : 0.1, 0.34);
      const gr = g.createLinearGradient(c.ax, c.ay, c.bx, c.by);
      gr.addColorStop(0, rgba(myColor, a)); gr.addColorStop(1, rgba(n.color, a));
      g.strokeStyle = gr; g.lineCap = 'round';
      if (pend) g.setLineDash([2, 7]);
      g.lineWidth = 1 + energ * 2; g.beginPath(); g.moveTo(c.ax, c.ay); g.quadraticCurveTo(c.qx, c.qy, c.bx, c.by); g.stroke();
      g.setLineDash([]);
      if (!pend) { g.globalAlpha = 0.25; g.lineWidth = 5 + energ * 8; g.stroke(); g.globalAlpha = 1; }
      // a glint travels the thread between Eyes that are both here
      if (!pend && motion !== 'off' && (st === 'awake' || st === 'made' || energ > 0 || mode === 'meet')) {
        const k = energ > 0 ? 3 : 1;
        for (let i = 0; i < k; i++) {
          const u = ((t * (mode === 'meet' ? 0.09 : 0.13) + n.ph[0] / TAU + i / k) % 1), p = bez(c, i % 2 ? 1 - u : u), s = Math.sin(u * Math.PI);
          glow(g, p.x, p.y, 3 + energ * 4, mixC(myColor, n.color, u), 0.5 * s * a * 2);
        }
      }
    });
  }
  const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  function glow(g, x, y, r, c, a) {
    if (a <= 0.003 || r <= 0) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 3);
    gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.35, rgba(c, a * 0.4)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3, 0, TAU); g.fill();
  }
  // Pending invites are unformed points of light; an Eye still introducing itself is a light taking shape.
  function drawPlaceholders(g, t) {
    const live = motion !== 'off';
    nodes.forEach((n) => {
      if (n.key === 'me' || n.op < 0.03 || (n.eye && !n.forming)) return;
      if (mode === 'meet' && n.key !== focusKey) return;
      const x = cx(n), y = cy(n), s = n.size, br = live ? 0.5 + 0.5 * Math.sin(t * 1.3 + n.ph[1]) : 0.7;
      if (n.forming) { glow(g, x, y, s * 0.12, [235, 245, 248], 0.35 * (1 - clamp((t - n.forming) / 2))); return; }
      if (n.b.pending) {
        glow(g, x, y, s * 0.09 * (0.85 + br * 0.3), [230, 242, 246], 0.42 * n.op);
        g.strokeStyle = `rgba(230,242,246,${0.3 * n.op * (0.6 + br * 0.4)})`; g.lineWidth = 1;
        const f = s * 0.22 * (0.8 + br * 0.2); g.beginPath(); g.moveTo(x - f, y); g.lineTo(x + f, y); g.moveTo(x, y - f); g.lineTo(x, y + f); g.stroke();
        return;
      }
      // introducing itself: a soft ring forming, motes circling
      glow(g, x, y, s * 0.16, n.color, 0.22 * n.op * (0.7 + br * 0.3));
      g.strokeStyle = `rgba(220,236,240,${0.16 * n.op})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, s * 0.3, s * 0.21, 0, 0, TAU); g.stroke();
      for (let i = 0; i < 6; i++) { const a = t * 0.6 * (live ? 1 : 0) + (i / 6) * TAU; glow(g, x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.21, 1.6, [230, 242, 246], 0.3 * n.op); }
    });
    if (ghost && (mode === 'invite' || mode === 'join')) {
      const live2 = motion !== 'off', br = live2 ? 0.5 + 0.5 * Math.sin(t * 1.1) : 0.7, me = nodes.get('me');
      glow(g, ghost.x, ghost.y, ghost.size * 0.08 * (0.85 + br * 0.35), [230, 242, 246], 0.45);
      if (me) {
        const c = { ax: cx(me) + me.size * 0.32, ay: cy(me), bx: ghost.x - ghost.size * 0.12, by: ghost.y, qx: (cx(me) + ghost.x) / 2, qy: cy(me) + 18, L: 1 };
        g.setLineDash([2, 8]); g.strokeStyle = `rgba(220,236,240,${0.14 + br * 0.08})`; g.lineWidth = 1; g.beginPath(); g.moveTo(c.ax, c.ay); g.quadraticCurveTo(c.qx, c.qy, c.bx, c.by); g.stroke(); g.setLineDash([]);
      }
    }
  }
  // Signals that reached the relay for a resting friend whose phone can confirm: little lights waiting by their Eye
  function drawWaiting(g, t) {
    nodes.forEach((n) => {
      if (n.key === 'me' || n.b.native || !n.b.f || n.op < 0.3) return;
      if (mode === 'meet' && n.key !== focusKey) return;
      const w = (n.b.f.outbox || []).filter((e) => e.st === 'relayed' && e.canFeel && !e.felt && Date.now() - e.t < 12 * 3600000 && !fx.some((x) => x.entry === e));
      w.slice(-5).forEach((e, i) => {
        const a = t * (motion === 'off' ? 0 : 0.35) + i * 1.25 + n.ph[2], r = n.size * 0.46;
        glow(g, cx(n) + Math.cos(a) * r, cy(n) + Math.sin(a) * r * 0.8, 2.2, SIG[e.k] ? SIG[e.k].c : [230, 240, 244], 0.55 * n.op);
      });
    });
  }
  function drawOrb(g, kind, x, y, t, k) {
    const S = SIG[kind]; if (!S) return;
    const br = 0.85 + 0.15 * Math.sin(t * 9);
    glow(g, x, y, 9 * k * br, S.c, 0.55); glow(g, x, y, 3.4 * k, S.c2, 0.95);
  }
  function drawFx(g, t, dt) {
    const gentle = motion === 'gentle';
    fx = fx.filter((f) => {
      if (f.type === 'fizzle') { const k = (t - f.t0) / 0.7; if (k >= 1) return false; drawOrb(g, f.kind, f.x, f.y + k * 20, t, 1 - k); return true; }
      if (f.type === 'absorb') { const k = (t - f.t0) / 0.9; if (k >= 1) return false; glow(g, cx(f.to), cy(f.to), f.to.size * 0.2 * (1 + k), SIG[f.kind].c, 0.35 * (1 - k)); return true; }
      if (f.type === 'res') return drawRes(g, f, t);
      return drawSig(g, f, t, dt, gentle);
    });
    parts = parts.filter((p) => {
      p.life -= dt; if (p.life <= 0) return false;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
      glow(g, p.x, p.y, p.r, p.c, 0.7 * (p.life / p.max)); return true;
    });
  }
  function burst(x, y, c, n, speed) { if (motion !== 'on') n = Math.ceil(n / 3); for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = speed * (0.4 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 0.8 + Math.random() * 1.3, c, life: 0.5 + Math.random() * 0.6, max: 1.1 }); } }
  function drawSig(g, f, t, dt, gentle) {
    const S = SIG[f.kind], from = f.from, to = f.to;
    if (!from || !to || !el || from.op < 0.05 || to.op < 0.05) return false;
    const c = curve(from, to, f.bow, 0.3, f.start);
    // the sending Eye generates it: rings leave the sender before it flies
    const gt = t - (f.t0 - 0.28);
    if (gt >= 0 && gt < 1.1 && !f.start) {
      const k = gt / 1.1, x = cx(from), y = cy(from);
      if (f.kind === 'pulse') for (let i = 0; i < (gentle ? 1 : 2); i++) { const kk = clamp(k - i * 0.22); if (kk > 0) ring(g, x, y, from.size * (0.3 + kk * 0.55), S.c, 0.4 * (1 - kk), 2); }
      else if (f.kind === 'spark' && k < 0.4) glow(g, (c.ax + x) / 2, (c.ay + y) / 2, 6 * (1 - k * 2), S.c2, 0.9);
      else if (f.kind === 'calm') ring(g, x, y, from.size * (0.32 + k * 0.25), S.c, 0.22 * (1 - k), 5);
    }
    if (t < f.t0) return true;
    // hold short of their Eye while the protocol still owes us an answer
    const e = f.entry, hold = f.out && e && !e.felt && (e.st === 'sending' || (e.st === 'relayed' && e.canFeel && !e.native));
    if (f.phase === 'travel') {
      const k = (t - f.t0) / f.dur;
      let u = f.kind === 'calm' ? ease(k) : f.kind === 'spark' ? easeIn(k) * 0.35 + easeOut(k) * 0.65 : easeOut(k);
      if (hold && u > 0.84) { u = 0.84; f.phase = 'wait'; f.waitAt = t; }
      if (f.out && e && e.st === 'failed') { f.phase = 'fail'; f.pt = t; f.fu = u; }
      f.u = u;
      if (k >= 1 && f.phase === 'travel') { f.phase = 'arrive'; f.pt = t; onArrive(f); }
    } else if (f.phase === 'wait') {
      if (e.felt) { f.phase = 'finish'; f.pt = t; }
      else if (e.st === 'failed') { f.phase = 'fail'; f.pt = t; f.fu = f.u; }
      else if (e.st === 'relayed' && (!e.canFeel || e.native)) { f.phase = 'finish'; f.pt = t; }      // can't be confirmed: dissolve, no reaction
      else if (e.st === 'relayed' && !e.awake) { f.phase = 'settle'; f.pt = t; }                        // resting: it waits by their Eye
      else if (t - f.waitAt > 10) { f.phase = 'settle'; f.pt = t; }
    } else if (f.phase === 'finish') {
      const k = (t - f.pt) / 0.35; f.u = mix(0.84, 1, easeOut(k));
      if (k >= 1) { f.phase = 'arrive'; f.pt = t; onArrive(f); }
    }
    const p = bez(c, f.u || 0);
    if (f.phase === 'travel' || f.phase === 'wait' || f.phase === 'finish') {
      const shimmer = f.phase === 'wait' ? 0.75 + 0.25 * Math.sin(t * 6) : 1;
      if (f.kind === 'pulse') {
        if (t - f.lastEcho > (gentle ? 0.4 : 0.22)) { f.lastEcho = t; f.echoes.push({ x: p.x, y: p.y, t }); }
        f.echoes = f.echoes.filter((q) => t - q.t < 0.9);
        f.echoes.forEach((q) => { const kk = (t - q.t) / 0.9; ring(g, q.x, q.y, 6 + kk * 26, S.c, 0.32 * (1 - kk), 1.5); });
        const beat = 1 + 0.25 * Math.max(0, Math.sin(t * 7.5));
        glow(g, p.x, p.y, 9 * beat * shimmer, S.c, 0.55); glow(g, p.x, p.y, 3.5, S.c2, 0.9 * shimmer);
      } else if (f.kind === 'spark') {
        f.trail.push({ x: p.x, y: p.y }); if (f.trail.length > (gentle ? 8 : 16)) f.trail.shift();
        for (let i = 1; i < f.trail.length; i++) {
          const a = i / f.trail.length; g.strokeStyle = rgba(S.c, 0.55 * a * shimmer); g.lineWidth = 0.6 + a * 3.2; g.lineCap = 'round';
          g.beginPath(); g.moveTo(f.trail[i - 1].x, f.trail[i - 1].y); g.lineTo(f.trail[i].x, f.trail[i].y); g.stroke();
        }
        glow(g, p.x, p.y, 7 * shimmer, S.c, 0.7); glow(g, p.x, p.y, 2.6, S.c2, 1);
        flare(g, p.x, p.y, 9 + Math.sin(t * 20) * 2, S.c2, 0.5 * shimmer);
        if (!gentle && Math.random() < 0.5) parts.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30 + 10, r: 0.7, c: S.c, life: 0.5, max: 0.5 });
      } else {
        // calm: a broad slow ribbon of light, the tide moving along the thread
        const u0 = Math.max(0, (f.u || 0) - 0.38), seg = 10;
        for (let i = 0; i < seg; i++) {
          const ua = mix(u0, f.u, i / seg), ub = mix(u0, f.u, (i + 1) / seg), pa = bez(c, ua), pb = bez(c, ub), a = Math.sin(((i + 0.5) / seg) * Math.PI) * 0.5 * shimmer;
          g.strokeStyle = rgba(mixC(S.c2, S.c, i / seg), a * 0.35); g.lineWidth = 16; g.lineCap = 'round'; g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
          g.strokeStyle = rgba(S.c, a); g.lineWidth = 3.5; g.stroke();
        }
        glow(g, p.x, p.y, 10, S.c, 0.3 * shimmer);
      }
      return true;
    }
    if (f.phase === 'arrive') {
      const k = (t - f.pt) / 0.95, x = cx(to), y = cy(to);
      if (k >= 1) return false;
      if (f.quiet) { glow(g, c.bx, c.by, 8 * (1 - k) + 2, S.c, 0.4 * (1 - k)); return true; }   // unconfirmed: it just fades at their edge
      if (f.kind === 'pulse') { ring(g, x, y, to.size * (0.32 + k * 0.4), S.c, 0.45 * (1 - k), 2.5); ring(g, x, y, to.size * (0.32 + k * 0.25), S.c2, 0.3 * (1 - k), 1.2); }
      else if (f.kind === 'spark') { flare(g, c.bx, c.by, 18 * (1 - k) + 4, S.c2, 0.8 * (1 - k)); }
      else { glow(g, x, y, to.size * (0.25 + k * 0.15), S.c, 0.16 * Math.sin(k * Math.PI)); }
      return true;
    }
    if (f.phase === 'settle') {                         // it waits beside their resting Eye (drawWaiting takes over)
      const k = (t - f.pt) / 0.9; if (k >= 1) { f.entry && (f.entry._settled = 1); return false; }
      const q = bez(c, mix(f.u || 0.84, 1, k * 0.4)); glow(g, q.x, q.y, 8 * (1 - k) + 2, S.c, 0.5 * (1 - k * 0.6));
      return true;
    }
    if (f.phase === 'fail') {                           // it never left: it falls back to your Eye and fades
      const k = (t - f.pt) / 0.9; if (k >= 1) return false;
      const q = bez(c, mix(f.fu || 0.5, 0, easeOut(k))); glow(g, q.x, q.y + k * 10, 7, S.c, 0.5 * (1 - k));
      return true;
    }
    return false;
  }
  function onArrive(f) {
    const S = SIG[f.kind], to = f.to, c = curve(f.from, to, f.bow, 0.3, f.start);
    f.quiet = f.out && !(f.entry && f.entry.felt);
    if (f.out && f.entry && f.entry.felt && ((mode === 'meet' && focusKey === to.key) || mode === 'sky')) say(deliveryText(f.entry));
    if (f.quiet) return;
    if (f.kind === 'spark') burst(c.bx, c.by, S.c2, 14, 70);
    if (f.kind === 'pulse') burst(c.bx, c.by, S.c, 6, 30);
    // only an Eye whose phone really played it answers
    if (!f.out || (f.entry && f.entry.felt)) react(to, f.kind, f.from);
  }
  function ring(g, x, y, r, c, a, w) { if (a <= 0.003) return; g.strokeStyle = rgba(c, a); g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
  function flare(g, x, y, r, c, a) {
    g.strokeStyle = rgba(c, a); g.lineWidth = 1.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r);
    const q = r * 0.45; g.moveTo(x - q, y - q); g.lineTo(x + q, y + q); g.moveTo(x - q, y + q); g.lineTo(x + q, y - q); g.stroke();
  }
  function drawRes(g, f, t) {
    const k = (t - f.t0) / f.dur; if (k >= 1) return false;
    const a = f.a, b = f.b, mx = (cx(a) + cx(b)) / 2, my = (cy(a) + cy(b)) / 2, env = Math.sin(clamp(k) * Math.PI);
    resK = Math.max(resK, env * (motion === 'gentle' ? 0.5 : 1));
    const mixed = mixC(myColor, b.color, 0.5);
    for (let i = 0; i < (motion === 'gentle' ? 2 : 4); i++) {
      const kk = clamp(k * 1.4 - i * 0.18); if (kk <= 0 || kk >= 1) continue;
      ring(g, mx, my, 10 + kk * Math.max(W, H) * 0.45, i % 2 ? myColor : b.color, 0.35 * (1 - kk), 1.6);
    }
    glow(g, mx, my, 20 + env * 30, mixed, 0.35 * env);
    glow(g, cx(a), cy(a), a.size * 0.22, myColor, 0.25 * env); glow(g, cx(b), cy(b), b.size * 0.22, b.color, 0.25 * env);
    if (motion === 'on' && Math.random() < 0.6 * env) burst(mx + (Math.random() - 0.5) * 40, my + (Math.random() - 0.5) * 40, Math.random() < 0.5 ? myColor : b.color, 1, 40);
    return true;
  }

  // ---------- events from the link ----------
  function boot() {
    const Fr = F(); if (!Fr) return;
    let syncT = 0;
    const soon = () => { if (!el) return; clearTimeout(syncT); syncT = setTimeout(() => { if (!el) return; sync(); refreshProgress(); if (mode === 'meet') { const n = nodes.get(focusKey); if (n) setChip(n.state); } }, 180); };
    Fr.on('change', soon); Fr.on('paired', soon);
    Fr.on('profile', (f, first) => { if (first) madeAt.set(f.code, Date.now()); soon(); });
    Fr.on('here', soon); Fr.on('removed', soon);
    Fr.on('incoming', (f, kind) => incoming(f.code, kind));
    Fr.on('delivery', (f, e) => onDelivery(f, e));
    addEventListener('haven:friend', soon);
    // Back button (Android) and Escape: Eye Contact steps back first
    if (root.Haven && Haven.back) { const orig = Haven.back.bind(Haven); Haven.back = () => (el ? back() : false) || orig(); }
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && el) { e.stopImmediatePropagation(); back(); } }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  root.EyesContact = {
    open, close, isOpen, register,
    meet: (key) => open({ meet: key }),
    invite: () => { open(); newInvite(); },
    join: (code) => open({ join: code || '' }),
    joining: (key) => { open(); sync(); showJoinProgress(key); },
    nativeEvent,
    _debug: { nodes, fx: () => fx, mode: () => mode, motion: () => motion, interactions: INTERACTIONS }
  };
})(window);
