/* EYES 4.4.5 · Pocket Dimension, the Eye's third ability.
   EYES can swallow things you want to keep, hold them in a little world inside his pupil, and give them back.
   Chosen from the Ability Wheel, he looks at it, his pupil deepens as if it opened onto something far away,
   his iris pulls outward in layers, and the pupil becomes a dimensional opening with your things suspended
   inside. Closing, they retreat into the dark and he is himself again.

   Layers
     launcher.js draw()   paints the Eye (pose from here: size, stretch, iris, pupil, glow …)
     frame()              paints the opening: its depth, receding layers, a few motes, the living lip, ripples
     #pocket (DOM)        search, categories, the inventory cards inside the opening, the detail card, trays
     pocket-store.js      IndexedDB (notes, links, metadata, thumbnails)
     EyesPocketNative     Android: Share into EYES, picking photos/files, private file storage, open/share/export
                          (native/PocketBridge.java). Without it, thoughts and links still work.

   Storage and animation never depend on each other: an item is saved (committed to IndexedDB, and for shared
   things, copied into EYES' private files by Android first) and only then does he swallow it. If saving fails
   he doesn't swallow anything; you get the reason.

   States (central machine in ability-wheel.js):
     POCKET_OPENING -> POCKET_ACTIVE -> POCKET_CLOSING -> IDLE
     POCKET_SWALLOW (claimed from IDLE: something you shared arrives while he's on the home screen) -> IDLE */
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const ms = () => performance.now();
  const TAU = Math.PI * 2;
  const Store = () => window.EyesPocketStore;

  // a portal glyph: an eye-shaped opening with something small held inside
  const ICON = 'M3 12c2.6-4.3 5.6-6.4 9-6.4s6.4 2.1 9 6.4c-2.6 4.3-5.6 6.4-9 6.4S5.6 16.3 3 12Z M7.4 12a4.6 3.4 0 1 0 9.2 0a4.6 3.4 0 1 0 -9.2 0 M10.6 11.2h2.8v2.2h-2.8Z';
  const CHANNELS = ['look', 'gx', 'gy', 'k', 'neutral', 'hush', 'open', 'grow', 'size', 'pupil', 'iris', 'lens', 'rxK', 'ryK', 'glow', 'bsx', 'bsy', 'lid', 'ap', 'deep'];
  const KINDS = {
    thought: { label: 'Thoughts', one: 'thought', glyph: 'M6 6.5h12M6 10.5h12M6 14.5h7.5' },
    link: { label: 'Links', one: 'link', glyph: 'M10 14l4-4M8.6 11.4l-1.5 1.5a3 3 0 0 0 4.2 4.2l1.5-1.5M15.4 12.6l1.5-1.5a3 3 0 0 0-4.2-4.2l-1.5 1.5' },
    image: { label: 'Images', one: 'image', glyph: 'M5 6.5h14v11H5Z M5 15l4-4 3.2 3.2 2.3-2.3L19 16.4 M14.6 9.4a1 1 0 1 0 0.01 0' },
    file: { label: 'Files', one: 'file', glyph: 'M7 4.5h6.5L17.5 8.5V19.5H7Z M13.5 4.5V8.5H17.5' }
  };
  const ORDER = ['thought', 'link', 'image', 'file'];
  const PREFS_KEY = 'eyes.pocket.prefs.v1';
  const MAX_TEXT = 100000, MAX_TITLE = 140;
  const FULL = 60;                         // "a very full pocket"
  const UNDO_MS = 5200;

  const P = {
    api: null, state: 'IDLE', gen: 0, L: null,
    at: 0, from: null, tracks: null, osc: null, moveUntil: 0, reactions: [], cur: null,
    ripples: [], motes: [], itemAt: null, satAt: null, phase0: Math.random() * 10,
    items: [], loaded: false, loading: null, filter: 'all', query: '', sort: 'pinned',   // 5.0: the default view is Pinned first
    urls: new Map(), observer: null, detail: null, pendingDelete: null, undoTimer: 0, noteTimer: 0,
    tray: false, composer: null, busy: 0, flights: 0, swallowQueue: [], swallowTimer: 0, draining: null,
    watch: { x: 0, y: 0, until: 0, amount: 0 }, previewReq: 0, previewWait: new Map(), lastGeo: null,
    stats: { opened: 0, closed: 0, saved: 0, failed: 0, swallowed: 0, retrieved: 0, deleted: 0, restored: 0, imported: 0, duplicates: 0, frames: 0, reactions: {} }
  };
  // a sort you chose yourself is kept exactly as you chose it (it's only ever saved when you change it)
  try { const pr = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; if (['newest', 'oldest', 'pinned'].includes(pr.sort)) P.sort = pr.sort; } catch {}
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ sort: P.sort })); } catch {} };
  const host = () => (P.api ? P.api.host() : window.Haven && Haven.abilityHost ? Haven.abilityHost() : null);
  const speed = () => { const h = host(); if (!h || !h.motion()) return 0; return h.gentle() ? 0.6 : 1; };
  const lowPower = () => { const h = host(); return !!(h && h.lowPower()); };
  const toast = (t) => { const h = host(); if (h && h.toast) h.toast(t); };

  // ---------- the Android side ----------
  const nat = () => window.EyesPocketNative || null;
  const call = (name, ...args) => {
    const n = nat();
    if (!n || typeof n[name] !== 'function') return undefined;
    try { return n[name](...args.map((a) => (a === undefined || a === null ? '' : typeof a === 'object' ? JSON.stringify(a) : a))); } catch { return undefined; }
  };
  const nativeFiles = () => !!(nat() && typeof nat().pick === 'function');

  // ---------- where everything goes (fixed while Pocket is open; rebuilt on rotation or a fold) ----------
  function insets() {
    const st = document.documentElement.style;
    return { top: parseFloat(st.getPropertyValue('--native-inset-top')) || 0, bottom: parseFloat(st.getPropertyValue('--native-inset-bottom')) || 0 };
  }
  function computeLayout() {
    const W = innerWidth, H = innerHeight, ins = insets();
    const cx = W * 0.5, cy = H * 0.49;                       // the Eye lives here; Pocket never moves him
    const EDGE = 14;
    // landscape and small cover screens (Razr's outer display) get one-row rims and compact cards
    const wide = W > H * 1.2 && W >= 560, tight = wide || H - ins.top - ins.bottom < 600;
    const headTop = ins.top + (tight ? 6 : 10), headH = wide ? 46 : tight ? 80 : 92, footH = tight ? 54 : 64;
    const headBottom = headTop + headH, footTop = H - ins.bottom - 10 - footH;
    const half = Math.max(90, Math.min(cy - headBottom - 6, footTop - cy - 6));
    const ry = Math.min(half, 360), rx = wide ? Math.min(W / 2 - EDGE, 400, ry * 2.4) : Math.min(W / 2 - EDGE, 270, Math.max(ry * 0.72, Math.min(W / 2 - EDGE, ry * 1.5)));
    const S = Math.min(rx, ry / 1.055);
    const rxK = rx / S, ryK = ry / (S * 1.055);
    const band = clamp(Math.min(rx, ry) * 0.12, 18, 36);   // the living iris left around the opening
    const ax = rx - band, ay = ry - band * 1.1;
    const looks = window.HavenDNA && HavenDNA.looks ? HavenDNA.looks() : { iris: 1, pupil: 1 };
    // the inventory scrolls through the middle of the opening and fades at its rim
    const view = { x: cx - ax * 0.86, y: cy - ay, w: ax * 1.72, h: ay * 2 };
    const compact = view.h < 330;
    const cols = compact ? (view.w >= 520 ? 3 : view.w >= 300 ? 2 : 1) : view.w >= 400 ? 3 : view.w >= 236 ? 2 : 1;
    return {
      W, H, cx, cy, rx, ry, S, rxK, ryK, ax, ay, band, view, cols, compact, wide, tight,
      head: { x: Math.max(EDGE, cx - (wide ? 380 : 240)), y: headTop, w: Math.min(W - 2 * EDGE, wide ? 760 : 480), h: headH },
      foot: { x: Math.max(EDGE, cx - 240), y: footTop, w: Math.min(W - 2 * EDGE, 480), h: footH },
      portrait: W < H,
      irisF: (Math.max(rx, ry) * 1.04) / S,
      pupilBase: looks.pupil || 1, irisBase: 0.62 * (looks.iris || 1),
      key: [W, H, ins.top, ins.bottom].join(':')
    };
  }

  // ---------- choreography (keyframed channels, the same way Vision and Arcade move) ----------
  function idleValues() {
    const L = P.L;
    return { look: 0, gx: 0, gy: 0, k: 0, neutral: 0, hush: 0, open: 0, grow: 0, size: L.S, pupil: L.pupilBase, iris: L.irisBase, lens: 0, rxK: 1, ryK: 1, glow: 1, bsx: 1, bsy: 1, lid: 0, ap: 0, deep: 0 };
  }
  function evalTracks(t) {
    if (!P.tracks) return P.from || idleValues();
    const sp = speed(), e = sp ? (t - P.at) / sp : Infinity, out = {};
    for (const ch of CHANNELS) {
      const keys = P.tracks[ch];
      let v = P.from[ch];
      if (keys) {
        let pt = 0, pv = P.from[ch];
        v = keys[keys.length - 1][1];
        for (const [kt, kv, kind] of keys) {
          if (e <= kt) { const f = (e - pt) / (kt - pt || 1); v = mix(pv, kv, kind === 'out' ? easeOut(f) : kind === 'lin' ? clamp(f) : ease(f)); break; }
          pt = kt; pv = kv;
        }
      }
      out[ch] = v;
    }
    return out;
  }
  function plan(tracks, osc) {
    const t = ms();
    P.from = P.tracks ? evalTracks(t) : idleValues();
    P.at = t; P.tracks = tracks; P.osc = osc || null;
    let end = 0;
    for (const ch in tracks) end = Math.max(end, tracks[ch][tracks[ch].length - 1][0]);
    P.moveUntil = t + end * speed() + 30;
    if (P.api) P.api.redraw();
    return end * speed();
  }
  function gazeAt(p) {
    const L = P.L;
    return { x: clamp((p.x - L.cx) / (L.W * 0.39), -1, 1), y: clamp((p.y - L.cy) / (L.H * 0.34), -1, 1) };
  }
  // Stage A (recognition) and Stage B (opening), one continuous move; Stage C (inventory) follows in the DOM
  function planOpening(full) {
    const L = P.L;
    P.from = idleValues();
    const it = P.itemAt || P.satAt;
    if (it) { const g = gazeAt(it); P.from.gx = g.x; P.from.gy = g.y; }
    P.tracks = null;
    return plan({
      // A: he looks toward the ability; the pupil focuses, then begins to deepen
      look: [[120, 1, 'out'], [480, 1], [760, 0]],
      glow: [[220, 1.18, 'out'], [700, 1.26], [1300, 1.06]],
      k: [[300, 0.7], [520, 1]],
      neutral: [[360, 1]], hush: [[320, 1]], open: [[320, 1]],
      pupil: [[200, L.pupilBase * 0.82, 'out'], [460, L.pupilBase * 0.9], [760, L.pupilBase * 1.7]],
      deep: [[180, 0], [620, 1, 'out']],
      // B: the iris pulls outward in layers and the pupil becomes the opening
      iris: [[420, L.irisBase * 0.98], [1180, L.irisF, 'out']],
      grow: [[440, 0], [1160, 1, 'out']],
      size: [[1, L.S]],
      rxK: [[520, 1], [1080, L.rxK * 1.02, 'out'], [1260, L.rxK]],
      ryK: [[520, 1], [1080, L.ryK * 1.03, 'out'], [1260, L.ryK]],
      lens: [[620, 0], [820, 1]],
      ap: [[560, 0], [1220, 1.025, 'out'], [1340, 1]],
      bsx: full ? [[1260, 1], [1360, 1.04], [1460, 0.97], [1560, 1.02], [1680, 1]] : [[1, 1]],
      bsy: full ? [[1260, 1], [1360, 0.96], [1460, 1.03], [1560, 0.985], [1680, 1]] : [[1, 1]]
    }, (t, c) => {
      const e = (t - P.at) / (speed() || 1);
      if (speed() === 1 && e > 300 && e < 520) c.pupil *= 1 + 0.025 * Math.sin(e * 0.13) * (1 - (e - 300) / 220);   // he focuses
    });
  }
  function steadyTracks() {
    const L = P.L;
    return { k: [[1, 1]], neutral: [[1, 1]], hush: [[1, 1]], open: [[1, 1]], look: [[300, 0]], gx: [[300, 0]], gy: [[300, 0]], size: [[1, L.S]], grow: [[1, 1]], pupil: [[1, L.pupilBase * 1.7]], iris: [[260, L.irisF]], lens: [[1, 1]], rxK: [[260, L.rxK]], ryK: [[260, L.ryK]], glow: [[400, 1]], bsx: [[200, 1]], bsy: [[200, 1]], lid: [[300, 0]], ap: [[1, 1]], deep: [[1, 1]] };
  }
  function planSteady() { plan(steadyTracks(), steadyOsc); }
  function steadyOsc(t, c) {
    if (speed() !== 1) return;
    c.iris *= 1 + 0.005 * Math.sin(t / 1900);
    c.glow *= 1 + 0.02 * Math.sin(t / 2600 + 1);
  }
  // Stage D: things retreat, the opening contracts, his pupil returns
  function planClosing(fast) {
    const L = P.L, f = fast ? 0.6 : 1, c = P.cur || {};
    return plan({
      ap: [[160 * f, 1], [620 * f, 0]],
      deep: [[500 * f, 1], [820 * f, 0]],
      lens: [[460 * f, 1], [640 * f, 0]],
      pupil: [[480 * f, L.pupilBase * 0.7], [900 * f, L.pupilBase]],
      grow: [[300 * f, 1], [820 * f, 0]],
      rxK: [[300 * f, c.rxK || L.rxK], [780 * f, 1]],
      ryK: [[300 * f, c.ryK || L.ryK], [780 * f, 1]],
      iris: [[820 * f, L.irisBase]],
      glow: [[420 * f, 1.12], [900 * f, 1]],
      lid: [[300 * f, 0]], bsx: [[1, 1]], bsy: [[1, 1]],
      look: [[200, 0.3], [620 * f, 0]], gx: [[1, 0]], gy: [[1, 0.3]],
      k: [[620 * f, 1], [920 * f, 0]],
      neutral: [[920 * f, 0]], hush: [[920 * f, 0]], open: [[920 * f, 0]]
    });
  }
  // a swallow on the home screen (something you shared while he was away): he notices, gulps, ripples
  function planHomeSwallow(target, effort) {
    const L = P.L, g = gazeAt(target), e = effort ? 1.35 : 1;
    P.from = idleValues(); P.tracks = null;
    return plan({
      look: [[160, 1, 'out'], [520 * e, 0.8], [900 * e, 0.1], [1150 * e, 0]],
      gx: [[160, g.x], [620 * e, g.x * 0.3], [900 * e, 0]],
      gy: [[160, g.y], [620 * e, g.y * 0.3], [900 * e, 0]],
      k: [[200, 1], [980 * e, 1], [1200 * e, 0]],
      pupil: [[220, L.pupilBase * 0.85], [520 * e, L.pupilBase * 1.55, 'out'], [760 * e, L.pupilBase * 0.92], [1100 * e, L.pupilBase]],
      iris: [[1, L.irisBase], [640 * e, L.irisBase * 1.04], [900 * e, L.irisBase]],
      deep: [[260, 0.8], [700 * e, 0.6], [1000 * e, 0]],
      glow: [[200, 1.12], [700 * e, 1.3], [1100 * e, 1]],
      bsx: effort ? [[300, 0.95], [560, 1.05], [760, 0.97], [980, 1.02], [1200, 1]] : [[1, 1]],
      bsy: effort ? [[300, 1.06], [560, 0.95], [760, 1.03], [980, 0.99], [1200, 1]] : [[1, 1]]
    });
  }

  // ---------- reactions: small and quick, never in the way ----------
  const REACT = {
    pulse: { dur: 420, glow: [[90, 1.22], [420, 1]], iris: [[90, 1.03], [420, 1]] },            // a note: a satisfied pulse
    effort: { dur: 900, bsx: [[140, 0.95], [300, 1.05], [480, 0.97], [660, 1.02], [900, 1]], bsy: [[140, 1.06], [300, 0.95], [480, 1.03], [660, 0.99], [900, 1]], glow: [[300, 1.25], [900, 1]] },
    release: { dur: 560, glow: [[120, 0.84], [560, 1]], iris: [[160, 1.04], [560, 1]] },          // letting something go
    glance: { dur: 300, glow: [[100, 1.06], [300, 1]] },
    search: { dur: 1500 },
    stuffed: { dur: 760, bsx: [[120, 1.045], [260, 0.97], [400, 1.03], [560, 0.99], [760, 1]], bsy: [[120, 0.96], [260, 1.03], [400, 0.975], [560, 1.01], [760, 1]] }
  };
  function react(name) {
    P.stats.reactions[name] = (P.stats.reactions[name] || 0) + 1;
    const sp = speed(), t = ms();
    if (!sp || !REACT[name]) return;
    P.reactions = P.reactions.filter((r) => t - r.at < r.dur * r.sp);
    if (P.reactions.length > 4) P.reactions.shift();
    P.reactions.push({ ...REACT[name], name, at: t, sp: sp === 1 ? 1 : 0.6 });
    P.moveUntil = Math.max(P.moveUntil, t + REACT[name].dur * sp + 30);
    if (P.api) P.api.redraw();
  }
  function reactionMul(t, ch) {
    let m = 1;
    for (const r of P.reactions) {
      const keys = r[ch];
      if (!keys) continue;
      const e = (t - r.at) / r.sp;
      if (e >= r.dur || e < 0) continue;
      let pt = 0, pv = 1, v = 1;
      for (const [kt, kv] of keys) { if (e <= kt) { v = mix(pv, kv, ease((e - pt) / (kt - pt || 1))); break; } pt = kt; pv = kv; v = kv; }
      m *= v;
    }
    return m;
  }
  function watch(p, dur, amount) {
    const g = gazeAt(p);
    P.watch = { x: g.x, y: g.y, until: ms() + dur, amount: amount || 0.6 };
    P.moveUntil = Math.max(P.moveUntil, P.watch.until + 400);
    if (P.api) P.api.redraw();
  }

  // ---------- the pose handed to launcher.js ----------
  function pose(t) {
    if (P.state === 'IDLE' || !P.L) return null;
    const c = evalTracks(t);
    if (P.osc) P.osc(t, c);
    for (const ch of ['glow', 'iris', 'bsx', 'bsy']) c[ch] *= reactionMul(t, ch);
    const w = P.watch, live = w.until > t ? 1 : clamp(1 - (t - w.until) / 400);
    if (live > 0 && speed()) { c.look = Math.max(c.look, w.amount * live); c.gx = mix(c.gx, w.x, live); c.gy = mix(c.gy, w.y, live); }
    // an empty pocket: a curious look around, left, right, then back
    const s = P.reactions.find((r) => r.name === 'search' && t - r.at < r.dur * r.sp);
    if (s) { const e = (t - s.at) / (s.dur * s.sp); c.look = Math.max(c.look, Math.sin(e * Math.PI) * 0.7); c.gx = Math.sin(e * TAU) * 0.8; c.gy = 0.15 * Math.sin(e * Math.PI); }
    P.cur = c;
    return { k: c.k, look: c.look, gaze: { x: c.gx, y: c.gy }, neutral: c.neutral, hush: c.hush, open: c.open, grow: c.grow, size: c.size, pupil: c.pupil, iris: c.iris, lens: c.lens, rxK: c.rxK, ryK: c.ryK, glow: c.glow, bodySx: c.bsx, bodySy: c.bsy, lid: c.lid };
  }
  function fps(t, low) {
    if (P.state === 'IDLE') return 0;
    if (t < P.moveUntil || P.ripples.length || P.flights) return low ? 30 : 60;
    if (P.state === 'POCKET_ACTIVE' && speed() === 1 && !low && !P.detail) return 10;    // the motes drift, slowly
    return 0;                                                                           // still: nothing redraws
  }

  // ---------- painting the opening into the Eye's canvas ----------
  function aperture(u, g) {
    const L = P.L, d = g && g.drawn, sx = g && g.pose ? g.pose.sx : 1;
    const c0 = d ? g.screen(d.gx, d.gy) : { x: L.cx, y: L.cy };
    const pr = d ? Math.max(4, d.pupilR * sx) : 12;
    const uw = easeOut(clamp(u * 1.1)), uh = ease(clamp((u - 0.05) / 0.95));
    return { x: mix(c0.x, L.cx, ease(u)), y: mix(c0.y, L.cy, ease(u)), rx: mix(pr, L.ax, uw), ry: mix(pr, L.ay, uh) };
  }
  function seedMotes() {
    P.motes = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * TAU + Math.random() * 0.4, z: Math.random(), sp: 0.035 + Math.random() * 0.03, s: 0.6 + Math.random() * 0.8 }));
  }
  // an organic, slightly wobbling ring; few points, so it stays cheap at any size
  function wobblyEllipse(ctx, x, y, rx, ry, seed, wob) {
    const n = 28;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, k = 1 + wob * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 5 - seed * 1.7) * 0.4);
      const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function frame(ctx, g) {
    if (P.state === 'IDLE' || !P.L) return;
    const t = ms(), c = P.cur || evalTracks(t), L = P.L, tint = g.tint, sp = speed();
    P.lastGeo = g; P.stats.frames++;
    if (P.state === 'POCKET_SWALLOW') { paintHomeRipples(ctx, g, t); return; }
    const u = clamp(c.ap, 0, 1.05), deep = clamp(c.deep);
    syncView(c);
    // the pupil deepening before it opens: a dark well with a faint far light
    if (u <= 0.002) {
      if (deep > 0.01 && g.drawn) {
        const o = aperture(0, g), r = o.rx * 0.95;
        const gr = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
        gr.addColorStop(0, tint(1.3, 0.35 * deep)); gr.addColorStop(0.25, `rgba(1,2,4,${0.8 * deep})`); gr.addColorStop(1, 'rgba(1,2,4,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, TAU); ctx.fill();
      }
      return;
    }
    const o = aperture(Math.min(1, u), g);
    const R = Math.max(o.rx, o.ry);
    const drift = sp === 1 ? (t / 14000 + P.phase0) % 1 : 0.35;
    ctx.save();
    wobblyEllipse(ctx, o.x, o.y, o.rx, o.ry, 0, 0);
    ctx.clip();
    // depth: almost black at the far centre, a breath of his colour near the rim
    const bg = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R);
    bg.addColorStop(0, '#000102'); bg.addColorStop(0.55, '#02060a'); bg.addColorStop(1, tint(0.5, 0.42));
    ctx.fillStyle = bg; ctx.fillRect(o.x - o.rx - 2, o.y - o.ry - 2, o.rx * 2 + 4, o.ry * 2 + 4);
    // the layers recede: rings crowd together toward a far vanishing point, drifting slowly outward
    const N = 6, layersIn = clamp((u - 0.15) / 0.85);
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      let z = (i + drift) / N;                     // 0 = far, 1 = at the lip
      const zr = Math.pow(z, 1.9);
      const a = (0.06 + 0.22 * z) * layersIn * (1 - Math.pow(z, 6));
      if (a < 0.005) continue;
      wobblyEllipse(ctx, o.x, o.y, o.rx * zr, o.ry * zr, i * 1.9 + drift * 2, 0.025 + 0.02 * z);
      ctx.strokeStyle = tint(1.1, a); ctx.stroke();
    }
    // a far light at the vanishing point
    const fl = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R * 0.22);
    fl.addColorStop(0, tint(1.5, 0.28 * layersIn)); fl.addColorStop(1, tint(1, 0));
    ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(o.x, o.y, R * 0.22, 0, TAU); ctx.fill();
    // luminous motes drifting up out of the depth (only while there's motion to spend)
    if (sp && !lowPower()) {
      for (const m of P.motes) {
        const z = (m.z + t * m.sp / 1000 * (sp === 1 ? 1 : 0)) % 1, zz = z * z;
        const x = o.x + Math.cos(m.a + z * 0.6) * o.rx * zz * 0.96, y = o.y + Math.sin(m.a + z * 0.6) * o.ry * zz * 0.96;
        const alpha = Math.sin(z * Math.PI) * 0.75 * layersIn;
        ctx.fillStyle = tint(1.6, alpha);
        ctx.beginPath(); ctx.arc(x, y, 0.4 + m.s * zz * 1.6, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    // the lip: his iris gives way to the opening along a softly glowing edge
    const breathe = sp === 1 ? 0.5 + 0.5 * Math.sin(t / 1600) : 0.5;
    const lipA = (0.45 + 0.12 * breathe) * clamp(u * 1.4);
    ctx.save();
    for (const [grow, w, a] of [[5, 8, 0.07], [2.4, 3.4, 0.16], [0.4, 1.3, 0.7]]) {
      wobblyEllipse(ctx, o.x, o.y, o.rx + grow, o.ry + grow, 0, 0);
      ctx.strokeStyle = tint(1.15, a * lipA); ctx.lineWidth = w; ctx.stroke();
    }
    // ripples: the iris quivers outward when something disappears inside
    P.ripples = P.ripples.filter((r) => t - r.at < 620);
    for (const r of P.ripples) {
      const e = (t - r.at) / 620, gr = 3 + easeOut(e) * 34;
      wobblyEllipse(ctx, o.x, o.y, o.rx + gr, o.ry + gr, e * 4, 0.012 * (1 - e));
      ctx.strokeStyle = tint(1.35, 0.5 * (1 - e)); ctx.lineWidth = 2.2 * (1 - e) + 0.5; ctx.stroke();
    }
    ctx.restore();
  }
  function paintHomeRipples(ctx, g, t) {
    P.ripples = P.ripples.filter((r) => t - r.at < 620);
    const d = g.drawn;
    if (!d) return;
    const o = g.screen(d.gx, d.gy), base = Math.max(6, d.pupilR * (g.pose ? g.pose.sx : 1));
    const deep = clamp((P.cur || {}).deep || 0);
    if (deep > 0.01) {
      const gr = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, base);
      gr.addColorStop(0, g.tint(1.4, 0.3 * deep)); gr.addColorStop(0.3, `rgba(1,2,4,${0.7 * deep})`); gr.addColorStop(1, 'rgba(1,2,4,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(o.x, o.y, base, 0, TAU); ctx.fill();
    }
    for (const r of P.ripples) {
      const e = (t - r.at) / 620;
      ctx.beginPath(); ctx.arc(o.x, o.y, base * 1.2 + easeOut(e) * g.size * 0.8, 0, TAU);
      ctx.strokeStyle = g.tint(1.35, 0.5 * (1 - e)); ctx.lineWidth = 2 * (1 - e) + 0.5; ctx.stroke();
    }
  }
  function ripple() { if (speed()) { P.ripples.push({ at: ms() }); if (P.api) P.api.redraw(); } }

  // the inventory sits exactly in the opening; while it opens or closes it's clipped to the opening's shape
  function syncView(c) {
    const view = $('pocketView');
    if (!view || !P.L) return;
    const L = P.L, u = clamp(c.ap);
    const show = P.state === 'POCKET_ACTIVE' || P.state === 'POCKET_OPENING' || P.state === 'POCKET_CLOSING';
    const vis = show && u > 0.35;
    if (view.classList.contains('veiled') === vis) view.classList.toggle('veiled', !vis);
    if (!vis) return;
    const o = aperture(u, P.lastGeo);
    const rx = (o.rx / (L.view.w / 2)) * 100, ry = (o.ry / (L.view.h / 2)) * 100;
    const key = u < 0.999 ? `ellipse(${rx.toFixed(1)}% ${ry.toFixed(1)}% at 50% 50%)` : '';
    if (view.dataset.clip !== key) { view.style.clipPath = key; view.dataset.clip = key; }
    const tint = P.lastGeo ? P.lastGeo.tint(1, 1) : '';
    if (tint && tint !== P.tintKey) {
      P.tintKey = tint;
      const m = /rgba?\(([^)]+)\)/.exec(tint);
      if (m) $('pocket').style.setProperty('--pocket-rgb', m[1].split(',').slice(0, 3).join(','));
    }
  }

  // ---------- DOM ----------
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role' || k === 'tabindex' || k === 'for') n.setAttribute(k, v === true ? '' : v);
      else n[k] = v;
    }
    n.append(...kids.filter((k) => k !== null && k !== undefined && k !== false));
    return n;
  }
  function svgIcon(d, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d);
    s.append(p);
    return s;
  }
  function btn(label, cls, fn, extra) {
    const b = el('button', { type: 'button', class: 'pk-btn ' + (cls || ''), ...(extra || {}) });
    if (extra && extra.icon) { b.append(svgIcon(extra.icon)); delete b.icon; }
    if (label) b.append(el('span', { class: 'pk-btn-label', text: label }));
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(b, e); });
    return b;
  }
  const I = {
    close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
    plus: 'M12 5v14M5 12h14',
    info: 'M12 10.8v6M12 7.4v0.2 M12 3.6a8.4 8.4 0 1 0 0.01 0',
    sort: 'M7 5v14M4 16l3 3 3-3M14 7h6M14 12h4.5M14 17h3',
    search: 'M10.6 5a5.6 5.6 0 1 0 0.01 0M14.8 14.8l4.6 4.6',
    pin: 'M9 4.5h6l-1 5 3 3H7l3-3zM12 12.5v7',
    open: 'M13.5 5.5h5v5M18.5 5.5l-8 8M16 13.5v5h-10.5v-10.5h5',
    copy: 'M8.5 8.5h10v10h-10ZM15.5 8.5V5.5h-10v10h3',
    share: 'M8 12.5l8-4.5M8 12.5l8 4.5M6 12.5a2 2 0 1 0 0.01 0M18 8a2 2 0 1 0 0.01 0M18 17a2 2 0 1 0 0.01 0',
    edit: 'M5 19l1-4 9.5-9.5 3 3L9 18Zm9-12 3 3',
    rename: 'M5 7.5h9M9.5 7.5v10M15.5 11.5h4M17.5 11.5v6',
    trash: 'M5.5 7.5h13M9.5 7.5V5h5v2.5M7.5 7.5l1 11.5h7l1-11.5',
    save: 'M12 5v10M7.5 10.5L12 15l4.5-4.5M5.5 19h13',
    paste: 'M9 5.5h6v2.5H9ZM7 6.5H5.5v13h13v-13H17',
    back: 'M14.5 6l-6 6 6 6'
  };

  function ensureDom() {
    if ($('pocket')) return;
    // header: search, sort; categories
    const search = el('input', { id: 'pocketSearch', type: 'search', placeholder: 'Search his pocket', autocomplete: 'off', spellcheck: false, enterKeyHint: 'search', 'aria-label': 'Search Pocket Dimension' });
    search.addEventListener('input', () => { P.query = search.value; render(); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search.blur(); } });
    const sortBtn = btn('', 'pk-icon pk-sort', () => cycleSort(), { id: 'pocketSort', icon: I.sort, 'aria-label': 'Sort' });
    const chips = el('div', { id: 'pocketChips', role: 'tablist', 'aria-label': 'Categories' });
    for (const k of ['all', ...ORDER]) {
      const c = el('button', { type: 'button', class: 'pk-chip', role: 'tab', 'data-kind': k, 'aria-selected': String(k === P.filter) },
        el('span', { class: 'pk-chip-label', text: k === 'all' ? 'All' : KINDS[k].label }), el('span', { class: 'pk-chip-n', text: '' }));
      c.addEventListener('click', (e) => { e.stopPropagation(); setFilter(k); });
      chips.append(c);
    }
    const head = el('div', { id: 'pocketHead' }, el('div', { class: 'pk-row' }, el('label', { class: 'pk-search' }, svgIcon(I.search), search), sortBtn), chips);
    // the opening: a scrolling list of cards
    const grid = el('div', { id: 'pocketGrid', role: 'list', 'aria-label': 'Kept items' });
    const empty = el('div', { id: 'pocketEmpty', hidden: true });
    const view = el('div', { id: 'pocketView', class: 'veiled' }, el('div', { id: 'pocketScroll' }, grid, empty));
    // footer: close, swallow, about
    const foot = el('div', { id: 'pocketFoot' },
      btn('', 'pk-icon', () => close_('button'), { id: 'pocketClose', icon: I.close, 'aria-label': 'Close Pocket Dimension' }),
      btn('Swallow', 'pk-swallow primary', () => toggleTray(), { id: 'pocketAdd', icon: I.plus, 'aria-haspopup': 'menu', 'aria-expanded': 'false' }),
      btn('', 'pk-icon', () => showAbout(), { id: 'pocketInfo', icon: I.info, 'aria-label': 'Storage and privacy' }));
    const tray = el('div', { id: 'pocketTray', role: 'menu', 'aria-label': 'Swallow something', hidden: true });
    const note = el('p', { id: 'pocketNote', role: 'status', 'aria-live': 'polite' });
    const snack = el('div', { id: 'pocketSnack', hidden: true });
    const layer = el('div', { id: 'pocketLayer' });         // the detail card, composer, about sheet
    const stage = el('section', { id: 'pocket', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pocket Dimension', tabindex: '-1', hidden: true }, view, head, foot, tray, snack, note, layer);
    // nothing inside Pocket reaches the home screen's gestures (notifications, app launch, drags)
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'click', 'contextmenu', 'wheel', 'dblclick'])
      stage.addEventListener(type, (e) => { e.stopPropagation(); if (type === 'contextmenu' && !/input|textarea/i.test(e.target.tagName)) e.preventDefault(); }, type.startsWith('touch') || type === 'wheel' ? { passive: true } : false);
    stage.addEventListener('keydown', onKey);
    document.body.append(stage);
    const fly = el('div', { id: 'pocketFly', 'aria-hidden': 'true' });
    document.body.append(fly);
    bindGrid(grid);
  }
  function placeDom() {
    const L = P.L, px = (v) => v.toFixed(1) + 'px';
    const box = (id, r) => Object.assign($(id).style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });
    box('pocketView', L.view); box('pocketHead', L.head); box('pocketFoot', L.foot);
    const view = $('pocketView');
    view.style.setProperty('--pk-cols', String(L.cols));
    // cards stay inside the widest part of the opening; top and bottom fade into the depth
    view.style.setProperty('--pk-pad-y', px(L.ay * 0.2));
    const trayY = L.foot.y - 8;
    Object.assign($('pocketTray').style, { left: px(L.cx), top: px(trayY) });
    Object.assign($('pocketSnack').style, { left: px(L.cx), top: px(L.foot.y - 54) });
    Object.assign($('pocketNote').style, { left: px(L.cx), top: px(L.view.y + L.view.h - L.ay * 0.18) });
    $('pocket').classList.toggle('landscape', !L.portrait);
    $('pocket').classList.toggle('wide', L.wide);
    $('pocket').classList.toggle('tight', L.tight);
    $('pocket').classList.toggle('compact', L.compact);
    $('pocket').classList.toggle('still', !speed());
  }
  function showStage(on) {
    ensureDom();
    const stage = $('pocket');
    stage.hidden = !on;
    $('home').classList.toggle('pocket-owned', on);
    document.documentElement.classList.toggle('pocket-open', on);
    if (on) stage.focus({ preventScroll: true });
    else {
      $('pocketView').classList.add('veiled');
      $('pocketGrid').replaceChildren();
      $('pocketLayer').replaceChildren();
      $('pocketTray').hidden = true;
      $('pocketNote').textContent = '';
      releaseUrls();
      if (P.observer) { P.observer.disconnect(); P.observer = null; }
    }
  }
  function note(text, dur, isError) {
    const n = $('pocketNote');
    if (!n) { if (text) toast(text); return; }
    clearTimeout(P.noteTimer);
    n.textContent = text || '';
    n.classList.toggle('on', !!text);
    n.classList.toggle('error', !!isError);
    if (text && dur) P.noteTimer = setTimeout(() => n.classList.remove('on'), dur);
  }

  // ---------- the inventory ----------
  function counts() {
    const c = { all: 0, thought: 0, link: 0, image: 0, file: 0 };
    for (const it of visibleItems(true)) { c.all++; c[it.kind]++; }
    return c;
  }
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  function visibleItems(ignoreFilter) {
    const del = P.pendingDelete ? P.pendingDelete.item.id : null;
    let list = P.items.filter((it) => it.id !== del);
    const q = norm(P.query).trim();
    if (q) {
      const words = q.split(/\s+/);
      list = list.filter((it) => { const hay = norm([it.title, it.text, it.url, it.name, it.host, KINDS[it.kind] && KINDS[it.kind].one].join(' ')); return words.every((w) => hay.includes(w)); });
    }
    if (!ignoreFilter && P.filter !== 'all') list = list.filter((it) => it.kind === P.filter);
    const by = P.sort === 'oldest' ? (a, b) => a.created - b.created : (a, b) => b.created - a.created;
    // 5.0 (build 128): Pinned first (the default) brings pinned things to the entrance, nearest the pupil, newest
    // first in each group. Newest first and Oldest first are purely chronological, pinned or not.
    list.sort((a, b) => (P.sort === 'pinned' ? (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) : 0) || by(a, b));
    return list;
  }
  function setFilter(k) {
    P.filter = k;
    for (const c of document.querySelectorAll('#pocketChips .pk-chip')) c.setAttribute('aria-selected', String(c.dataset.kind === k));
    render();
    $('pocketScroll').scrollTop = 0;
  }
  function cycleSort() {
    const order = ['pinned', 'newest', 'oldest'];
    P.sort = order[(order.indexOf(P.sort) + 1) % 3];
    savePrefs();
    render();
    note({ newest: 'Newest first', oldest: 'Oldest first', pinned: 'Pinned first' }[P.sort], 1400);
  }
  function sortLabel() { return 'Sort: ' + { newest: 'newest first', oldest: 'oldest first', pinned: 'pinned first' }[P.sort]; }
  function metaFor(it) {
    if (it.kind === 'thought') return ago(it.updated || it.created);
    if (it.kind === 'link') return it.host || 'link';
    if (it.kind === 'image') return [it.w && it.h ? it.w + '×' + it.h : '', bytes(it.size)].filter(Boolean).join(' · ');
    return [typeLabel(it), bytes(it.size)].filter(Boolean).join(' · ');
  }
  function card(it, i) {
    const k = KINDS[it.kind] || KINDS.file;
    const face = el('span', { class: 'pk-face' });
    if (it.kind === 'image' || (it.thumb && it.kind === 'file')) face.classList.add('has-thumb');
    if (it.kind === 'thought') face.append(el('span', { class: 'pk-snippet', text: (it.text || '').slice(0, 160) }));
    else if (it.kind === 'file') face.append(svgIcon(k.glyph, 'pk-glyph'), el('span', { class: 'pk-ext', text: extOf(it) }));
    else face.append(svgIcon(k.glyph, 'pk-glyph'));
    const b = el('button', { type: 'button', class: 'pk-card kind-' + it.kind + (it.pinned ? ' pinned' : ''), role: 'listitem', 'data-id': it.id,
      'aria-label': `${k.one}: ${it.title || 'untitled'}${it.pinned ? ', pinned' : ''}. ${metaFor(it)}` },
      face, el('span', { class: 'pk-title', text: it.title || 'Untitled' }), el('span', { class: 'pk-meta', text: metaFor(it) }),
      it.pinned ? svgIcon(I.pin, 'pk-pin') : null);
    // a little depth: each thing floats at its own distance (a fixed tilt, nothing animates once settled)
    const h = hashStr(it.id);
    // 5.0: pinned things float nearest, level and steady, in the light at the entrance
    b.style.setProperty('--tilt', it.pinned ? '0deg' : (((h % 7) - 3) * 0.45).toFixed(2) + 'deg');
    b.style.setProperty('--depth', it.pinned ? '1' : (0.965 + ((h >> 3) % 5) * 0.009).toFixed(3));
    b.style.setProperty('--i', String(Math.min(i, 14)));
    return b;
  }
  function render() {
    if (!$('pocket') || $('pocket').hidden) return;
    const grid = $('pocketGrid'), empty = $('pocketEmpty');
    const list = visibleItems();
    const c = counts();
    for (const ch of document.querySelectorAll('#pocketChips .pk-chip')) ch.querySelector('.pk-chip-n').textContent = c[ch.dataset.kind] ? String(c[ch.dataset.kind]) : '';
    $('pocketSort').setAttribute('aria-label', sortLabel());
    $('pocketSort').dataset.sort = P.sort;
    if (P.observer) P.observer.disconnect();
    const cards = list.map(card);
    // 5.0: a faint threshold between what waits at the entrance and everything further in (decoration only)
    const pins = P.sort === 'pinned' ? list.findIndex((it) => !it.pinned) : -1;
    if (pins > 0) cards.splice(pins, 0, el('div', { class: 'pk-threshold', 'aria-hidden': 'true' }));
    grid.classList.toggle('has-pins', P.sort === 'pinned' && list.length > 0 && !!list[0].pinned);
    grid.replaceChildren(...cards);
    empty.hidden = list.length > 0 || !P.loaded;
    if (!list.length && P.loaded) {
      empty.replaceChildren(el('p', { class: 'pk-empty-title', text: P.items.length ? 'Nothing like that in here.' : 'His pocket is empty.' }),
        el('p', { class: 'pk-empty-sub', text: P.items.length ? 'Try another word or category.' : (window.EYES_IOS_ABILITIES ? 'Tap Swallow to keep a note, link, photo, or file.' : 'Tap Swallow, or share something to EYES from any app.') }));
    }
    observeThumbs();
  }
  // thumbnails load only for cards near the opening, and are let go when Pocket closes
  function observeThumbs() {
    const root = $('pocketScroll');
    if (!('IntersectionObserver' in window)) { for (const n of $('pocketGrid').querySelectorAll('.pk-card')) loadThumb(n); return; }
    if (!P.observer) P.observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { P.observer.unobserve(e.target); loadThumb(e.target); }
    }, { root, rootMargin: '160px 0px' });
    for (const n of $('pocketGrid').querySelectorAll('.pk-card')) { const it = P.items.find((x) => x.id === n.dataset.id); if (it && it.thumb) P.observer.observe(n); }
  }
  async function thumbUrl(id) {
    if (P.urls.has(id)) return P.urls.get(id);
    const blob = await Store().thumb(id).catch(() => null);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    if (P.state === 'IDLE') { URL.revokeObjectURL(url); return null; }
    P.urls.set(id, url);
    return url;
  }
  async function loadThumb(node) {
    const id = node.dataset.id, url = await thumbUrl(id);
    if (!url || !node.isConnected) return;
    const face = node.querySelector('.pk-face');
    const img = el('img', { class: 'pk-thumb', alt: '', decoding: 'async', draggable: false });
    img.src = url;
    face.prepend(img);
    face.classList.add('loaded');
  }
  function releaseUrls() { for (const u of P.urls.values()) URL.revokeObjectURL(u); P.urls.clear(); }

  function bindGrid(grid) {
    let press = null;
    grid.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.pk-card');
      if (!c || e.button > 0) return;
      press = { id: c.dataset.id, x: e.clientX, y: e.clientY, at: ms(), long: false, node: c };
      press.timer = setTimeout(() => { if (!press) return; press.long = true; c.classList.add('held'); if (navigator.vibrate) try { navigator.vibrate(8); } catch {} openDetail(press.id, c, true); }, 480);
    });
    const cancel = () => { if (press) { clearTimeout(press.timer); press.node.classList.remove('held'); } };
    grid.addEventListener('pointermove', (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { cancel(); press = null; } });
    grid.addEventListener('pointercancel', () => { cancel(); press = null; });
    grid.addEventListener('pointerup', () => { cancel(); });
    grid.addEventListener('click', (e) => {
      const c = e.target.closest('.pk-card');
      if (!c) return;
      if (press && press.long) { press = null; return; }      // the long-press already opened it
      press = null;
      openDetail(c.dataset.id, c, false);
    });
  }

  // ---------- retrieving: he brings it forward ----------
  function itemById(id) { return P.items.find((x) => x.id === id) || null; }
  function rectOf(node) { const r = node.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function openDetail(id, fromNode, actionsFirst) {
    const it = itemById(id);
    if (!it || P.state !== 'POCKET_ACTIVE') return;
    closeTray();
    if (P.detail) closeDetail(true);
    P.stats.retrieved++;
    const from = fromNode && fromNode.isConnected ? rectOf(fromNode) : null;
    if (from) watch({ x: from.x + from.w / 2, y: from.y + from.h / 2 }, 380, 0.75);   // focused pupil tracking
    const d = buildDetail(it);
    $('pocketLayer').replaceChildren(d.root);
    $('pocket').classList.add('detail-open');
    P.detail = { id, node: d.root, from, fromId: id, card: d };
    // it comes up out of the opening toward you
    if (from && speed()) {
      const to = rectOf(d.panel);
      const sx = from.w / to.w, sy = from.h / to.h, dx = from.x + from.w / 2 - (to.x + to.w / 2), dy = from.y + from.h / 2 - (to.y + to.h / 2);
      d.panel.animate([{ transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: 0.4, filter: 'blur(2px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }],
        { duration: 340 / speed(), easing: 'cubic-bezier(.2,.9,.25,1.08)' });
      d.scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 / speed() });
    }
    setTimeout(() => { if (P.detail && P.detail.id === id) watch({ x: P.L.cx, y: P.L.cy - 40 }, 500, 0.35); }, 360);
    if (it.kind === 'image') loadPreview(it, d);
    const f = (actionsFirst && d.panel.querySelector('.pk-actions .pk-btn')) || d.panel.querySelector('.pk-detail-close');
    if (f) setTimeout(() => { if (f.isConnected) f.focus({ preventScroll: true }); }, 30);
  }
  function closeDetail(instant) {
    const D = P.detail;
    if (!D) return false;
    P.detail = null;
    $('pocket').classList.remove('detail-open');
    const node = D.node, panel = node.querySelector('.pk-detail');
    const target = document.querySelector(`#pocketGrid .pk-card[data-id="${CSS.escape(D.id)}"]`);
    if (instant || !speed() || !panel) { node.remove(); }
    else {
      const to = target ? rectOf(target) : { x: P.L.cx - 10, y: P.L.cy - 10, w: 20, h: 20 }, fr = rectOf(panel);
      const sx = to.w / fr.w, sy = to.h / fr.h, dx = to.x + to.w / 2 - (fr.x + fr.w / 2), dy = to.y + to.h / 2 - (fr.y + fr.h / 2);
      const a = panel.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: 0 }], { duration: 240 / speed(), easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
      node.querySelector('.pk-scrim').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 / speed(), fill: 'forwards' });
      a.onfinish = () => node.remove();
      setTimeout(() => node.remove(), 600);
    }
    if (target) setTimeout(() => { if (target.isConnected) target.focus({ preventScroll: true }); }, 20);
    else $('pocket').focus({ preventScroll: true });
    return true;
  }
  function buildDetail(it) {
    const k = KINDS[it.kind];
    const scrim = el('div', { class: 'pk-scrim' });
    scrim.addEventListener('click', () => closeDetail());
    const titleId = 'pkTitle' + hashStr(it.id);
    const panel = el('div', { class: 'pk-detail kind-' + it.kind, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
    const top = el('div', { class: 'pk-detail-top' },
      el('span', { class: 'pk-kind' }, svgIcon(k.glyph), el('span', { text: k.one })),
      btn('', 'pk-icon pk-detail-close', () => closeDetail(), { icon: I.close, 'aria-label': 'Put it back' }));
    const title = el('h2', { id: titleId, class: 'pk-detail-title', text: it.title || 'Untitled' });
    const body = el('div', { class: 'pk-detail-body' });
    if (it.kind === 'thought') body.append(el('p', { class: 'pk-detail-text', text: it.text || '' }));
    else if (it.kind === 'link') body.append(el('p', { class: 'pk-detail-host', text: it.host || '' }), el('p', { class: 'pk-detail-url', text: it.url || '' }),
      /^http:/i.test(it.url || '') ? el('p', { class: 'pk-warn', text: 'Not a secure (https) link.' }) : null);
    else if (it.kind === 'image') {
      const fig = el('button', { type: 'button', class: 'pk-figure', 'aria-label': 'View full screen' });
      fig.addEventListener('click', (e) => { e.stopPropagation(); fullView(it); });
      body.append(fig);
    } else body.append(el('div', { class: 'pk-fileface' }, svgIcon(k.glyph, 'pk-glyph'), el('span', { class: 'pk-ext', text: extOf(it) })));
    const meta = el('p', { class: 'pk-detail-meta', text: [it.kind === 'file' || it.kind === 'image' ? it.name : '', metaFor(it), 'kept ' + ago(it.created)].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ') });
    const actions = el('div', { class: 'pk-actions', role: 'toolbar', 'aria-label': 'Actions' });
    const A = (label, icon, fn, extra) => actions.append(btn(label, 'pk-action', fn, { icon, ...(extra || {}) }));
    const needsNative = it.kind === 'image' || it.kind === 'file';
    if (it.kind === 'link') A('Open', I.open, () => openItem(it));
    if (needsNative) A('Open', I.open, () => openItem(it), { disabled: !nativeFiles() });
    if (it.kind === 'thought' || it.kind === 'link') A('Copy', I.copy, () => copyItem(it));
    A('Share', I.share, () => shareItem(it), { disabled: needsNative && !nativeFiles() });
    if (needsNative) A('Save copy', I.save, () => exportItem(it), { disabled: !nativeFiles() });
    if (it.kind === 'thought') A('Edit', I.edit, () => openComposer('thought', it));
    A('Rename', I.rename, () => renameItem(it));
    A(it.pinned ? 'Unpin' : 'Pin', I.pin, () => togglePin(it), { 'aria-pressed': String(!!it.pinned) });
    A('Delete', I.trash, () => deleteItem(it), { class: 'pk-btn pk-action danger' });
    panel.append(top, title, body, meta, actions);
    const root = el('div', { class: 'pk-detail-wrap' }, scrim, panel);
    return { root, panel, scrim, body, title };
  }
  function loadPreview(it, d) {
    const fig = d.body.querySelector('.pk-figure');
    if (!fig) return;
    // the small thumbnail first, then a screen-sized preview from the original (never the full-resolution file)
    thumbUrl(it.id).then((u) => { if (u && fig.isConnected && !fig.querySelector('img')) { const im = el('img', { alt: it.title || 'image', draggable: false }); im.src = u; fig.append(im); } });
    if (!nativeFiles() || !it.nid) return;
    const px = Math.round(Math.min(1600, Math.max(innerWidth, innerHeight) * Math.min(2, devicePixelRatio || 1)));
    requestPreview(it.nid, px).then((src) => {
      if (!src || !fig.isConnected) return;
      const im = el('img', { alt: it.title || 'image', draggable: false });
      im.onload = () => { fig.replaceChildren(im); };
      im.src = src;
    }).catch(() => {});
  }
  function requestPreview(nid, px) {
    return new Promise((resolve) => {
      const req = String(++P.previewReq);
      P.previewWait.set(req, resolve);
      const r = call('preview', req, nid, px);
      if (r === undefined) { P.previewWait.delete(req); resolve(null); }
      setTimeout(() => { if (P.previewWait.has(req)) { P.previewWait.delete(req); resolve(null); } }, 8000);
    });
  }
  function fullView(it) {
    if (!P.detail) return;
    const wrap = el('div', { class: 'pk-full', role: 'dialog', 'aria-modal': 'true', 'aria-label': it.title || 'Image' });
    const fig = P.detail.node.querySelector('.pk-figure img');
    if (fig) { const im = el('img', { alt: it.title || 'image', draggable: false }); im.src = fig.src; wrap.append(im); }
    const x = btn('', 'pk-icon pk-full-close', () => wrap.remove(), { icon: I.close, 'aria-label': 'Close full view' });
    wrap.append(x);
    wrap.addEventListener('click', () => wrap.remove());
    P.detail.node.append(wrap);
    x.focus({ preventScroll: true });
  }

  // ---------- actions ----------
  function copyItem(it) {
    const text = it.kind === 'link' ? it.url : it.text || '';
    const ok = call('copy', text);
    if (ok === undefined) { if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => note('Copied.', 1600), () => note("Couldn't copy.", 2400, true)); else note("Couldn't copy.", 2400, true); return; }
    note('Copied.', 1600);
  }
  function openItem(it) {
    if (it.kind === 'link') {
      const safe = safeUrl(it.url);
      if (!safe) { note("EYES won't open that kind of link.", 2600, true); return; }
      if (call('openLink', safe) === undefined) { try { window.open(safe, '_blank', 'noopener'); } catch { note('No browser answered the link.', 2400, true); } }
      return;
    }
    if (call('open', it.nid, it.mime || '', it.name || '') === undefined) note('Opening files needs the EYES Android update.', 2600, true);
  }
  function shareItem(it) {
    if (it.kind === 'image' || it.kind === 'file') { if (call('share', it.nid, it.mime || '', fileName(it)) === undefined) note('Sharing files needs the EYES Android update.', 2600, true); return; }
    const text = it.kind === 'link' ? it.url : it.text || '';
    const subject = it.kind === 'link' ? it.title || '' : it.title || '';
    if (call('shareText', text, subject) !== undefined) return;
    if (navigator.share) navigator.share({ text, title: subject }).catch(() => {});
    else copyItem(it);
  }
  function exportItem(it) { if (call('saveAs', it.nid, it.mime || '', fileName(it)) === undefined) note('Saving copies needs the EYES Android update.', 2600, true); }
  async function togglePin(it) {
    try {
      const up = await Store().update(it.id, { pinned: !it.pinned });
      replaceItem(up);
      note(up.pinned ? 'Pinned. It stays easy to find.' : 'Unpinned.', 1600);
      react('glance');
      refreshDetail(up);
    } catch (e) { note(e.message, 3000, true); }
  }
  function replaceItem(up) { const i = P.items.findIndex((x) => x.id === up.id); if (i >= 0) P.items[i] = up; render(); }
  function refreshDetail(it) {
    if (!P.detail || P.detail.id !== it.id) return;
    const d = buildDetail(it);
    P.detail.node.replaceWith(d.root);
    P.detail.node = d.root;
    if (it.kind === 'image') loadPreview(it, d);
  }
  function renameItem(it) {
    if (!P.detail) return;
    const h = P.detail.node.querySelector('.pk-detail-title');
    const input = el('input', { class: 'pk-rename', type: 'text', value: it.title || '', maxLength: MAX_TITLE, 'aria-label': 'Name', enterKeyHint: 'done' });
    const done = async (save) => {
      if (!input.isConnected) return;
      const v = cleanTitle(input.value);
      if (!save || v === (it.title || '')) { refreshDetail(it); return; }
      try { const up = await Store().update(it.id, { title: v || defaultTitle(it) }); replaceItem(up); refreshDetail(up); note('Renamed.', 1400); }
      catch (e) { note(e.message, 3000, true); refreshDetail(it); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } });
    input.addEventListener('blur', () => done(true));
    h.replaceWith(input);
    input.focus(); input.select();
  }
  // delete: it leaves at once, with a few seconds to change your mind before anything is really erased
  function deleteItem(it) {
    finalizeDelete();
    closeDetail(true);
    P.pendingDelete = { item: it };
    react('release');
    render();
    const snack = $('pocketSnack');
    snack.replaceChildren(el('span', { text: 'Let go of ' + (it.kind === 'image' ? 'an image' : it.kind === 'file' ? 'a file' : 'a ' + KINDS[it.kind].one) + '.' }), btn('Undo', 'pk-undo', () => undoDelete()));
    snack.hidden = false;
    clearTimeout(P.undoTimer);
    P.undoTimer = setTimeout(finalizeDelete, UNDO_MS);
  }
  function undoDelete() {
    if (!P.pendingDelete) return;
    clearTimeout(P.undoTimer);
    P.pendingDelete = null;
    $('pocketSnack').hidden = true;
    P.stats.restored++;
    render();
    note('Back in his pocket.', 1600);
  }
  async function finalizeDelete() {
    const pd = P.pendingDelete;
    if (!pd) return;
    P.pendingDelete = null;
    clearTimeout(P.undoTimer);
    const snack = $('pocketSnack'); if (snack) snack.hidden = true;
    try {
      await Store().remove(pd.item.id);
      if (pd.item.nid) call('remove', pd.item.nid);
      P.items = P.items.filter((x) => x.id !== pd.item.id);
      if (P.urls.has(pd.item.id)) { URL.revokeObjectURL(P.urls.get(pd.item.id)); P.urls.delete(pd.item.id); }
      P.stats.deleted++;
    } catch (e) {
      note("Couldn't delete it: " + e.message, 3200, true);
    }
    render();
  }

  // ---------- swallowing: adding things ----------
  function toggleTray() { if (P.tray) closeTray(); else openTray(); }
  function openTray() {
    if (P.state !== 'POCKET_ACTIVE') return;
    const tray = $('pocketTray');
    const files = nativeFiles();
    const opt = (kind, label, icon, fn, disabled) => {
      const b = el('button', { type: 'button', class: 'pk-tray-item', role: 'menuitem', disabled, 'aria-label': label + (disabled ? ' (needs the EYES Android update)' : '') }, svgIcon(icon), el('span', { text: label }));
      b.addEventListener('click', (e) => { e.stopPropagation(); closeTray(); fn(); });
      return b;
    };
    tray.replaceChildren(
      opt('thought', 'Thought', KINDS.thought.glyph, () => openComposer('thought')),
      opt('paste', 'Clipboard', I.paste, () => swallowClipboard()),
      opt('link', 'Link', KINDS.link.glyph, () => openComposer('link')),
      opt('image', 'Image', KINDS.image.glyph, () => pick('image'), !files),
      opt('file', 'File', KINDS.file.glyph, () => pick('file'), !files));
    tray.hidden = false;
    P.tray = true;
    $('pocketAdd').setAttribute('aria-expanded', 'true');
    if (speed()) tray.animate([{ opacity: 0, transform: 'translate(-50%,-100%) translateY(10px) scale(.96)' }, { opacity: 1, transform: 'translate(-50%,-100%)' }], { duration: 180 / speed(), easing: 'ease-out' });
    const first = tray.querySelector('button:not([disabled])');
    if (first && P.api && P.api.keyboard()) first.focus({ preventScroll: true });
  }
  function closeTray() {
    if (!P.tray) return false;
    P.tray = false;
    $('pocketTray').hidden = true;
    $('pocketAdd').setAttribute('aria-expanded', 'false');
    return true;
  }
  function openComposer(kind, editing) {
    if (P.state !== 'POCKET_ACTIVE') return;
    closeDetail(true);
    const isLink = kind === 'link';
    const title = el('input', { class: 'pk-in', type: 'text', maxLength: MAX_TITLE, placeholder: isLink ? 'Name (optional)' : 'Title (optional)', 'aria-label': 'Title', value: editing ? editing.title || '' : '' });
    const main = isLink
      ? el('input', { class: 'pk-in pk-in-url', type: 'url', inputMode: 'url', placeholder: 'https://', 'aria-label': 'Link address', autocapitalize: 'off', spellcheck: false, enterKeyHint: 'done' })
      : el('textarea', { class: 'pk-in pk-in-text', rows: 6, maxLength: MAX_TEXT, placeholder: 'Something to keep…', 'aria-label': 'Thought' });
    if (editing && !isLink) main.value = editing.text || '';
    const err = el('p', { class: 'pk-err', role: 'alert' });
    const save = btn(editing ? 'Save' : 'Swallow it', 'primary', () => submit());
    const panel = el('form', { class: 'pk-composer', 'aria-label': editing ? 'Edit thought' : isLink ? 'Swallow a link' : 'Swallow a thought' },
      el('div', { class: 'pk-detail-top' }, el('span', { class: 'pk-kind' }, svgIcon(KINDS[kind].glyph), el('span', { text: editing ? 'edit thought' : 'new ' + KINDS[kind].one })),
        btn('', 'pk-icon', () => closeComposer(), { icon: I.close, 'aria-label': 'Cancel' })),
      isLink ? main : title, isLink ? title : main, err, el('div', { class: 'pk-composer-row' }, save));
    panel.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    const scrim = el('div', { class: 'pk-scrim' });
    scrim.addEventListener('click', () => closeComposer());
    const root = el('div', { class: 'pk-detail-wrap pk-composer-wrap' }, scrim, panel);
    $('pocketLayer').replaceChildren(root);
    $('pocket').classList.add('detail-open');
    P.composer = { root, panel, kind, editing };
    setTimeout(() => main.focus(), 40);
    async function submit() {
      if (P.busy) return;
      err.textContent = '';
      let item;
      if (isLink) {
        const url = normalizeUrl(main.value);
        if (!url) { err.textContent = 'That doesn\'t look like a web address.'; main.focus(); return; }
        item = linkItem(url, cleanTitle(title.value), 'typed');
      } else {
        const text = String(main.value || '').replace(/\r\n?/g, '\n');
        if (!text.trim()) { err.textContent = 'Write something first.'; main.focus(); return; }
        if (editing) {
          P.busy++; save.disabled = true;
          try {
            const up = await Store().update(editing.id, { text, title: cleanTitle(title.value) || firstLine(text) });
            replaceItem(up); closeComposer(); note('Saved.', 1400); react('pulse');
          } catch (e) { err.textContent = e.message; }
          P.busy--; save.disabled = false;
          return;
        }
        item = thoughtItem(text, cleanTitle(title.value), 'typed');
      }
      P.busy++; save.disabled = true;
      const fromRect = rectOf(panel);
      try {
        const saved = await commit(item);
        closeComposer(true);
        swallowInside(saved, fromRect);
      } catch (e) { err.textContent = e.message; P.stats.failed++; }
      P.busy--; save.disabled = false;
    }
  }
  function closeComposer(instant) {
    if (!P.composer) return false;
    const c = P.composer; P.composer = null;
    $('pocket').classList.remove('detail-open');
    c.root.remove();
    if (!instant) $('pocket').focus({ preventScroll: true });
    return true;
  }
  function swallowClipboard() {
    // only ever on your tap: EYES never reads the clipboard by itself
    const fromNative = call('clipboard');
    const got = (text) => {
      text = String(text || '');
      if (!text.trim()) { note('The clipboard is empty, or holds something EYES can\'t keep.', 2800); return; }
      const item = classifyText(text, '', 'clipboard');
      commit(item).then((saved) => swallowInside(saved, null), (e) => { P.stats.failed++; note(e.message, 3400, true); });
    };
    if (fromNative !== undefined) { got(fromNative); return; }
    if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(got, () => note("EYES wasn't allowed to read the clipboard.", 2800, true));
    else note("EYES can't read the clipboard here.", 2600, true);
  }
  function pick(kind) {
    if (call('pick', kind) === undefined) note('Picking ' + (kind === 'image' ? 'images' : 'files') + ' needs the EYES Android update.', 2800, true);
    else note(kind === 'image' ? 'Choose images for him to keep…' : 'Choose files for him to keep…', 2000);
  }

  // building items
  function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function thoughtItem(text, title, source) {
    text = text.slice(0, MAX_TEXT);
    const now = Date.now();
    return { id: newId(), kind: 'thought', title: title || firstLine(text), text, pinned: false, created: now, updated: now, source, hashSrc: 't:' + text };
  }
  function linkItem(url, title, source, extra) {
    const now = Date.now(), host = hostOf(url);
    return { id: newId(), kind: 'link', title: title || shortUrl(url), url, host, text: extra || '', pinned: false, created: now, updated: now, source, hashSrc: 'l:' + url };
  }
  // shared or pasted text: a link when it's essentially one web address, otherwise a thought
  function classifyText(text, subject, source) {
    text = String(text || '').replace(/\r\n?/g, '\n').trim();
    subject = cleanTitle(subject || '');
    const m = /\bhttps?:\/\/[^\s<>"']+/i.exec(text);
    if (m) {
      const url = normalizeUrl(m[0].replace(/[),.;:!?\]]+$/, ''));
      const rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
      if (url && rest.length <= 300) return linkItem(url, subject || cleanTitle(rest) || '', source, rest !== subject ? rest : '');
    }
    const bare = normalizeUrl(text);
    if (bare && !/\s/.test(text) && /\./.test(text)) return linkItem(bare, subject, source);
    return thoughtItem(text, subject, source);
  }
  // commit = durable. Resolves only after IndexedDB has committed; anything else throws with a reason.
  async function commit(item, thumbBlob) {
    const S = Store();
    if (!S) throw new Error("EYES' pocket isn't available.");
    if (item.hashSrc) { item.hash = await sha(item.hashSrc); delete item.hashSrc; }
    if (item.hash && item.source !== 'share' && item.source !== 'pick') {
      const dupe = await S.findHash(item.hash).catch(() => null);
      if (dupe) { P.stats.duplicates++; const e = new Error('He already has that one.'); e.code = 'dupe'; e.item = dupe; throw e; }
    }
    const saved = await S.put(item, thumbBlob || null);
    P.stats.saved++;
    if (!P.items.some((x) => x.id === saved.id)) P.items.push(saved);
    return saved;
  }

  // the signature move: the thing floats, he notices, it shrinks into his pupil, the iris ripples
  // what floats before he swallows it: a picture shows itself, everything else its kind and name
  async function tokenFor(it) {
    const t = el('div', { class: 'pk-token kind-' + it.kind });
    let url = null;
    if (it.thumb) url = await Promise.race([thumbUrl(it.id), new Promise((r) => setTimeout(() => r(null), 350))]).catch(() => null);
    if (url) {
      const img = el('img', { class: 'pk-token-img', alt: '', draggable: false });
      img.src = url;
      t.classList.add('has-img');
      t.append(img);
      return t;
    }
    t.append(svgIcon((KINDS[it.kind] || KINDS.file).glyph, 'pk-glyph'));
    if (it.kind !== 'image') t.append(el('span', { class: 'pk-token-text', text: (it.title || it.name || '').slice(0, 26) }));
    return t;
  }
  function fly(token, from, to, opts) {
    const fly = $('pocketFly');
    const sp = speed();
    fly.append(token);
    Object.assign(token.style, { left: from.x + 'px', top: from.y + 'px' });
    if (!sp) { token.remove(); return Promise.resolve(); }
    P.flights++;
    if (P.api) P.api.redraw();
    const dx = to.x - from.x, dy = to.y - from.y, mx = dx * 0.35 + (opts.arc || 0), my = dy * 0.35 - Math.abs(dx) * 0.15 - 30;
    const hover = opts.hover || 260, travel = opts.travel || 520;
    const total = (hover + travel) / sp;
    const a = token.animate([
      { transform: 'translate(-50%,-50%) scale(.55)', opacity: 0, filter: 'blur(3px)', offset: 0 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, filter: 'blur(0)', offset: (hover * 0.45) / (hover + travel) },
      { transform: 'translate(-50%,-50%) translate(0,-6px) scale(1.04)', opacity: 1, filter: 'blur(0)', offset: hover / (hover + travel) },
      { transform: `translate(-50%,-50%) translate(${mx}px,${my}px) scale(.62)`, opacity: 1, filter: 'blur(0)', offset: (hover + travel * 0.45) / (hover + travel) },
      { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(.06)`, opacity: 0.1, filter: 'blur(1.5px)', offset: 1 }
    ], { duration: total, easing: 'cubic-bezier(.45,0,.35,1)', fill: 'forwards' });
    return new Promise((resolve) => {
      let done = false;
      const end = () => { if (done) return; done = true; token.remove(); P.flights = Math.max(0, P.flights - 1); resolve(); };
      a.onfinish = end; a.oncancel = end;
      setTimeout(end, total + 400);
      // he notices it the moment it appears, and follows it in
      watch(from, hover / sp + 60, 0.85);
      setTimeout(() => watch(to, travel / sp, 0.5), hover / sp);
    });
  }
  function bigImage(it) { return it.kind === 'image' && ((it.size || 0) > 4e6 || (it.w || 0) * (it.h || 0) > 12e6); }
  async function swallowInside(it, fromRect) {
    const L = P.L;
    if (!L || P.state !== 'POCKET_ACTIVE') { render(); return; }
    // make room: show the category it went into, at the top
    if (P.filter !== 'all' && P.filter !== it.kind) setFilter('all');
    const from = fromRect ? { x: fromRect.x + fromRect.w / 2, y: fromRect.y + Math.min(fromRect.h / 2, 120) } : { x: L.cx, y: L.foot.y - 30 };
    if (bigImage(it)) react('effort');
    await fly(await tokenFor(it), from, { x: L.cx, y: L.cy }, { hover: 240, travel: bigImage(it) ? 700 : 480 });
    ripple();
    react(it.kind === 'thought' ? 'pulse' : 'glance');
    P.stats.swallowed++;
    render();
    $('pocketScroll').scrollTop = P.sort === 'oldest' ? $('pocketScroll').scrollHeight : 0;
    const n = document.querySelector(`#pocketGrid .pk-card[data-id="${CSS.escape(it.id)}"]`);
    if (n && speed()) n.animate([{ transform: 'scale(.3)', opacity: 0, filter: 'blur(3px)' }, { transform: 'scale(1)', opacity: 1, filter: 'blur(0)' }], { duration: 380 / speed(), easing: 'cubic-bezier(.2,.9,.3,1.15)' });
    note('Swallowed.', 1500);
    try { if (window.EyesFeel) EyesFeel.report('pocket-stored', { kind: it.kind }); } catch {}   // 5.0
  }

  // ---------- things shared into EYES (Android saved them already; this moves them into his pocket) ----------
  function b64ToBlob(b64, type) {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: type || 'image/jpeg' });
  }
  function readInbox() {
    const raw = call('inbox');
    if (!raw) return [];
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a.slice(0, 50) : []; } catch { return []; }
  }
  function fromInbox(r) {
    const created = Number(r.created) || Date.now();
    let it;
    if (r.kind === 'text') {
      it = classifyText(String(r.text || '').slice(0, MAX_TEXT), r.subject || '', 'share');
      if (!it.text && it.kind === 'thought') return null;
    } else if (r.kind === 'image' || r.kind === 'file') {
      it = { kind: r.kind, title: cleanTitle(stripExt(r.name || '')) || (r.kind === 'image' ? 'Image' : 'File'), name: cleanName(r.name || ''), mime: String(r.mime || 'application/octet-stream').slice(0, 100),
        size: Number(r.size) || 0, nid: String(r.nid || ''), w: Number(r.w) || 0, h: Number(r.h) || 0, pinned: false, source: r.source === 'pick' ? 'pick' : 'share', hash: String(r.hash || '') };
      if (!/^[a-z0-9_]{6,64}$/.test(it.nid)) return null;
    } else return null;
    it.id = 'n' + String(r.id).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);   // the inbox id: delivering twice keeps one item
    it.created = created; it.updated = created;
    if (it.hashSrc && !it.hash) it.hashSrc = it.hashSrc;
    return it;
  }
  async function drainInbox() {
    if (P.draining) return P.draining;
    if (!nat() || !Store()) return [];
    P.draining = (async () => {
      const recs = readInbox(), done = [], fresh = [];
      for (const r of recs) {
        const it = fromInbox(r);
        if (!it) { done.push(String(r.id)); continue; }
        try {
          if (await Store().has(it.id)) { done.push(String(r.id)); P.stats.duplicates++; continue; }
          let thumb = null;
          if (r.thumb && it.nid) { const b64 = call('thumb', it.nid); if (b64) try { thumb = b64ToBlob(b64, 'image/jpeg'); } catch {} }
          const saved = await commit(it, thumb);
          done.push(String(r.id));
          fresh.push(saved);
          P.stats.imported++;
        } catch (e) {
          // not acknowledged: Android keeps it and we'll try again next time
          P.stats.failed++;
          if (P.state === 'POCKET_ACTIVE') note("Couldn't move a shared item into his pocket: " + e.message, 4000, true); else toast("EYES couldn't keep something you shared: " + e.message);
          break;
        }
      }
      if (done.length) call('ack', done);
      return fresh;
    })();
    try { const fresh = await P.draining; if (fresh.length) arrived(fresh); return fresh; }
    finally { P.draining = null; }
  }
  function arrived(list) {
    if (P.state === 'POCKET_ACTIVE') {
      list.forEach((it, i) => setTimeout(() => swallowInside(it, null), i * 280));
      return;
    }
    P.swallowQueue.push(...list);
    trySwallowHome(0);
  }
  // on the home screen: claim the iris for a moment and swallow what came in; if he's busy, try again soon,
  // and if he stays busy, say so in words (it's already saved either way)
  function trySwallowHome(tries) {
    clearTimeout(P.swallowTimer);
    if (!P.swallowQueue.length) return;
    if (P.state !== 'IDLE') { P.swallowTimer = setTimeout(() => trySwallowHome(tries), 700); return; }
    const api = window.EyesAbility && document.visibilityState === 'visible' ? EyesAbility.claim('pocket', 'POCKET_SWALLOW', 'shared') : null;
    if (!api) {
      if (tries < 14) { P.swallowTimer = setTimeout(() => trySwallowHome(tries + 1), 700); return; }
      const n = P.swallowQueue.length;
      P.swallowQueue = [];
      toast(n === 1 ? 'EYES kept what you shared.' : `EYES kept ${n} things you shared.`);
      return;
    }
    const batch = P.swallowQueue.splice(0, 3), extra = P.swallowQueue.length;
    P.swallowQueue = [];
    homeSwallow(api, batch, extra);
  }
  async function homeSwallow(api, batch, extra) {
    P.api = api; P.state = 'POCKET_SWALLOW'; P.gen++;
    const gen = P.gen;
    P.L = computeLayout();
    P.reactions = []; P.ripples = []; P.watch = { x: 0, y: 0, until: 0, amount: 0 };
    ensureDom();
    const L = P.L, target = { x: L.cx, y: L.cy };
    const effort = batch.some(bigImage);
    for (let i = 0; i < batch.length; i++) {
      if (gen !== P.gen) return;
      const it = batch[i];
      const from = { x: L.cx + (i - (batch.length - 1) / 2) * 70, y: Math.max(insets().top + 200, L.cy - 185) };   // between the clock and the Eye
      const d = planHomeSwallow(from, effort && bigImage(it));
      if (!speed()) break;
      await fly(await tokenFor(it), from, target, { hover: it.kind === 'image' ? 560 : 320, travel: bigImage(it) ? 640 : 460 });
      if (gen !== P.gen) return;
      ripple();
      P.stats.swallowed++;
      await new Promise((r) => setTimeout(r, Math.max(120, d - 760)));
    }
    if (gen !== P.gen) return;
    const n = batch.length + extra;
    toast(n === 1 ? `Swallowed: ${batch[0].title || KINDS[batch[0].kind].one}` : `Swallowed ${n} things.`);
    setTimeout(() => { if (gen === P.gen && P.state === 'POCKET_SWALLOW') endHomeSwallow(); }, speed() ? 420 : 0);
  }
  function endHomeSwallow() {
    P.gen++;
    $('pocketFly') && $('pocketFly').replaceChildren();
    P.flights = 0;
    releaseUrls();
    P.tracks = null; P.cur = null; P.reactions = []; P.ripples = [];
    P.state = 'IDLE';
    const api = P.api; P.api = null;
    if (api) api.done('swallowed');
  }

  function fromNative(json) {
    let m;
    try { m = typeof json === 'string' ? JSON.parse(json) : json; } catch { return; }
    if (!m || typeof m.type !== 'string') return;
    switch (m.type) {
      case 'inbox': drainInbox(); break;
      case 'import-error': {
        const why = String(m.reason || 'It could not be imported.').slice(0, 160);
        const name = m.name ? String(m.name).slice(0, 60) + ': ' : '';
        if (P.state === 'POCKET_ACTIVE') note(name + why, 4200, true); else toast("EYES couldn't keep that. " + why);
        break;
      }
      case 'pick': if (m.ok === false && m.error && P.state === 'POCKET_ACTIVE') note(String(m.error).slice(0, 160), 3200, true); break;
      case 'preview': { const w = P.previewWait.get(String(m.req)); if (w) { P.previewWait.delete(String(m.req)); w(m.ok && m.data ? 'data:image/jpeg;base64,' + m.data : null); } break; }
      case 'open': if (m.ok === false) note(m.error ? String(m.error).slice(0, 120) : 'No app on this phone can open that.', 3000, true); break;
      case 'share': if (m.ok === false) note("Couldn't share that.", 2600, true); break;
      case 'save': if (m.ok === true) note('Copy saved.', 1800); else if (m.ok === false && m.error) note(String(m.error).slice(0, 120), 3000, true); break;
      case 'link': if (m.ok === false) note('No browser answered the link.', 2400, true); break;
    }
  }

  // ---------- storage and privacy ----------
  async function showAbout() {
    if (P.state !== 'POCKET_ACTIVE') return;
    closeTray(); closeDetail(true);
    let nativeUse = null;
    const raw = call('usage');
    if (raw) try { nativeUse = JSON.parse(raw); } catch {}
    const est = await Store().estimate();
    const n = P.items.length, files = P.items.filter((x) => x.nid).length;
    const used = (nativeUse ? Number(nativeUse.bytes) || 0 : 0) + (est.usage || 0);
    const rows = el('dl', { class: 'pk-facts' },
      el('dt', { text: 'Kept' }), el('dd', { text: `${n} item${n === 1 ? '' : 's'}${files ? ` (${files} file${files === 1 ? '' : 's'})` : ''}` }),
      el('dt', { text: 'Space used' }), el('dd', { text: '≈ ' + bytes(used) }),
      nativeUse && nativeUse.free ? el('dt', { text: 'Free on phone' }) : null, nativeUse && nativeUse.free ? el('dd', { text: bytes(Number(nativeUse.free)) }) : null);
    const clear = btn('Clear everything', 'danger', (b) => {
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.querySelector('.pk-btn-label').textContent = 'Tap again to erase all ' + n; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.querySelector('.pk-btn-label').textContent = 'Clear everything'; } }, 4000); return; }
      clearAll();
    }, { disabled: !n });
    const panel = el('div', { class: 'pk-composer pk-about', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Storage and privacy' },
      el('div', { class: 'pk-detail-top' }, el('span', { class: 'pk-kind' }, svgIcon(ICON), el('span', { text: 'pocket dimension' })), btn('', 'pk-icon', () => closeComposer(), { icon: I.close, 'aria-label': 'Close' })),
      rows,
      el('p', { class: 'pk-fine', text: 'Everything stays on this phone. Nothing is uploaded, and EYES never reads your clipboard, photos or files unless you hand them over.' }),
      el('p', { class: 'pk-fine', text: "It's handy local storage, not a backup or a vault: it isn't encrypted, and uninstalling EYES or clearing its data erases it." }),
      el('div', { class: 'pk-composer-row' }, clear));
    const scrim = el('div', { class: 'pk-scrim' });
    scrim.addEventListener('click', () => closeComposer());
    const root = el('div', { class: 'pk-detail-wrap pk-composer-wrap' }, scrim, panel);
    $('pocketLayer').replaceChildren(root);
    $('pocket').classList.add('detail-open');
    P.composer = { root, panel, kind: 'about' };
    panel.querySelector('.pk-icon').focus({ preventScroll: true });
  }
  async function clearAll() {
    finalizeDelete();
    try {
      await Store().clear();
      call('clear');
      P.items = [];
      releaseUrls();
      closeComposer();
      react('release');
      render();
      note('His pocket is empty now.', 2200);
    } catch (e) { note("Couldn't clear: " + e.message, 3200, true); }
  }

  // ---------- small helpers ----------
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  async function sha(s) {
    try { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(d).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join(''); }
    catch { return 'f' + hashStr(s).toString(16); }
  }
  function firstLine(text) { const l = String(text).split('\n').map((x) => x.trim()).find(Boolean) || 'Thought'; return l.length > 60 ? l.slice(0, 57).trimEnd() + '…' : l; }
  function cleanTitle(s) { return String(s || '').replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function cleanName(s) { return cleanTitle(String(s).replace(/[\\/]/g, '_')).slice(0, 120); }
  function stripExt(n) { return String(n).replace(/\.[a-z0-9]{1,6}$/i, ''); }
  function defaultTitle(it) { return it.kind === 'thought' ? firstLine(it.text) : it.kind === 'link' ? shortUrl(it.url) : stripExt(it.name || '') || 'Untitled'; }
  function extOf(it) { const m = /\.([a-z0-9]{1,6})$/i.exec(it.name || ''); return m ? m[1].toUpperCase() : (typeLabel(it) || 'FILE').toUpperCase().slice(0, 4); }
  function fileName(it) {
    const base = cleanName(it.title || stripExt(it.name || '') || 'EYES');
    const m = /\.([a-z0-9]{1,6})$/i.exec(it.name || '');
    return m && !base.toLowerCase().endsWith('.' + m[1].toLowerCase()) ? base + '.' + m[1] : base;
  }
  function typeLabel(it) {
    const m = String(it.mime || '');
    const map = { 'application/pdf': 'PDF', 'application/zip': 'ZIP', 'text/plain': 'Text', 'text/csv': 'CSV', 'application/msword': 'Word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word', 'application/vnd.ms-excel': 'Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint', 'application/epub+zip': 'EPUB', 'application/json': 'JSON' };
    if (map[m]) return map[m];
    if (m.startsWith('image/')) return m.slice(6).toUpperCase();
    if (m.startsWith('audio/')) return 'Audio';
    if (m.startsWith('video/')) return 'Video';
    return extOf({ name: it.name, mime: 'x' }) === 'X' ? 'File' : '';
  }
  function bytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n ? n + ' B' : '';
    const u = ['KB', 'MB', 'GB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < 2);
    return (n >= 10 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
  }
  function ago(t) {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' d ago';
    try { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); } catch { return ''; }
  }
  function normalizeUrl(raw) {
    let s = String(raw || '').trim();
    if (!s || s.length > 4000 || /\s/.test(s)) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) { if (!/^[^/]+\.[a-z]{2,}([/:?#]|$)/i.test(s)) return null; s = 'https://' + s; }
    return safeUrl(s);
  }
  // only real web links are kept or opened (the same refusal list as Vision's QR results)
  function safeUrl(s) {
    try {
      const u = new URL(s);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      if (!u.hostname) return null;
      return u.href;
    } catch { return null; }
  }
  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
  function shortUrl(url) { try { const u = new URL(url); const p = (u.pathname + u.search).replace(/\/$/, ''); return (u.hostname.replace(/^www\./, '') + (p.length > 32 ? p.slice(0, 31) + '…' : p)) || url; } catch { return url; } }

  // ---------- the ability's life ----------
  function go(state, reason) {
    if (!P.api) return false;
    if (!P.api.go(state, reason)) return false;
    P.state = state;
    const s = $('pocket'); if (s) s.dataset.state = state;
    return true;
  }
  const owned = () => !!P.api && P.state !== 'IDLE' && P.state !== 'POCKET_SWALLOW';
  async function load() {
    if (P.loading) return P.loading;
    P.loading = Store().all().then((list) => { P.items = list; P.loaded = true; }).finally(() => { P.loading = null; });
    return P.loading;
  }
  function activate(api) {
    P.api = api;
    P.state = api.state();
    P.gen++;
    const gen = P.gen;
    P.stats.opened++;
    P.satAt = api.satellite();
    try { const d = EyesAbility.diagnostics(); const it = d.wheel.items.find((i) => i.id === 'pocket'); P.itemAt = it ? { x: it.x, y: it.y } : null; } catch { P.itemAt = null; }
    ensureDom();
    P.L = computeLayout();
    P.reactions = []; P.ripples = []; P.tracks = null; P.watch = { x: 0, y: 0, until: 0, amount: 0 };
    P.query = ''; $('pocketSearch').value = '';
    seedMotes();
    placeDom();
    showStage(true);
    $('pocketHead').classList.remove('on'); $('pocketFoot').classList.remove('on');
    const loading = load().then(() => drainInbox()).catch((e) => e);
    const full = P.items.length >= FULL;
    const d = planOpening(full);
    const ready = new Promise((r) => setTimeout(r, Math.max(0, d - 220 * speed())));
    Promise.all([loading, ready]).then(([err]) => {
      if (gen !== P.gen || !owned()) return;
      if (!go('POCKET_ACTIVE', 'ready')) { closeNow('refused'); return; }
      setTimeout(() => { if (gen === P.gen && P.state === 'POCKET_ACTIVE') planSteady(); }, Math.max(0, P.moveUntil - ms()));
      $('pocketHead').classList.add('on'); $('pocketFoot').classList.add('on');
      emerge();
      if (err instanceof Error) note(err.message, 5000, true);
      else if (!P.items.length) react('search');                // an empty pocket: a curious searching glance
      else if (P.items.length >= FULL && !full) react('stuffed');
    });
  }
  // Stage C: things come up out of the depth, nearest first
  function emerge() {
    render();
    if (!speed()) return;
    const cards = [...$('pocketGrid').children].slice(0, 12);
    const L = P.L;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const dx = L.cx - (r.left + r.width / 2), dy = L.cy - (r.top + r.height / 2);
      c.animate([{ transform: `translate(${dx * 0.85}px,${dy * 0.85}px) scale(.15)`, opacity: 0, filter: 'blur(4px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }],
        { duration: 520 / speed(), delay: (i * 38) / speed(), easing: 'cubic-bezier(.2,.85,.3,1.12)', fill: 'backwards' });
    });
  }
  // Stage D, first beat: everything sinks back into the dark
  function retreat() {
    if (!speed()) return;
    const L = P.L;
    [...$('pocketGrid').children].slice(0, 16).forEach((c, i) => {
      const r = c.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const dx = L.cx - (r.left + r.width / 2), dy = L.cy - (r.top + r.height / 2);
      c.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.08)`, opacity: 0, filter: 'blur(3px)' }],
        { duration: 300 / speed(), delay: (i * 14) / speed(), easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' });
    });
  }
  function close_(reason, fast) {
    if (!owned() || P.state === 'POCKET_CLOSING') return;
    const gen = ++P.gen;
    finalizeDelete();
    closeTray(); closeComposer(true); closeDetail(true);
    $('pocketHead').classList.remove('on'); $('pocketFoot').classList.remove('on');
    if (document.activeElement && $('pocket').contains(document.activeElement)) document.activeElement.blur();
    retreat();
    if (!go('POCKET_CLOSING', reason)) { closeNow(reason); return; }
    P.watch.until = 0;
    const d = planClosing(!!fast);
    setTimeout(() => { if (P.gen === gen && P.state === 'POCKET_CLOSING') finish(reason); }, d + 20);
  }
  function closeNow(reason) { ++P.gen; finish(reason); }
  function finish(reason) {
    clearTimeout(P.noteTimer); clearTimeout(P.undoTimer);
    finalizeDelete();
    P.tracks = null; P.cur = null; P.reactions = []; P.ripples = []; P.motes = [];
    P.detail = null; P.composer = null; P.tray = false;
    for (const w of P.previewWait.values()) w(null);
    P.previewWait.clear();
    P.state = 'IDLE';
    P.stats.closed++;
    showStage(false);
    const api = P.api;
    P.api = null;
    if (api) api.done(reason);
    if (P.swallowQueue.length) trySwallowHome(0);
  }
  function back() {
    if (P.state === 'POCKET_SWALLOW') return false;      // Back is never swallowed by a passing animation
    if (!owned()) return false;
    if (P.state === 'POCKET_CLOSING') return true;
    if (P.state === 'POCKET_OPENING') { close_('back', true); return true; }
    const full = P.detail && P.detail.node.querySelector('.pk-full');
    if (full) { full.remove(); return true; }
    if (P.composer) { closeComposer(); return true; }
    if (P.detail) { closeDetail(); return true; }
    if (closeTray()) return true;
    if (document.activeElement === $('pocketSearch')) { $('pocketSearch').blur(); if (P.query) { P.query = ''; $('pocketSearch').value = ''; render(); } return true; }
    close_('back');
    return true;
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); back(); return; }
    if (e.key === 'Tab') {
      // keep focus inside the topmost layer
      const scope = (P.composer && P.composer.panel) || (P.detail && P.detail.node) || $('pocket');
      const items = [...scope.querySelectorAll('button, input, textarea')].filter((b) => !b.disabled && b.offsetParent !== null && !b.closest('[hidden]'));
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  }
  function suspend(reason) {
    if (P.state === 'POCKET_SWALLOW') { endHomeSwallow(); return; }
    if (!owned()) return;
    finalizeDelete();
    if (P.state === 'POCKET_CLOSING') closeNow(reason);
    // otherwise stay open: coming back finds things as you left them (nothing animates while hidden)
  }
  function interrupt(reason) {
    if (P.state === 'POCKET_SWALLOW') { endHomeSwallow(); return; }
    if (!owned()) return;
    closeNow(reason);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (P.pendingDelete) finalizeDelete(); return; }
    // back from another app (maybe after sharing something to EYES): bring in whatever arrived
    setTimeout(() => { if (!document.hidden) drainInbox(); }, 450);
  });
  addEventListener('pagehide', () => { finalizeDelete(); });
  addEventListener('resize', () => {
    if (!owned() || !P.L) return;
    const L = computeLayout();
    if (L.key === P.L.key) return;
    // a rotation or a fold: the opening is rebuilt for the new shape; nothing you were doing is lost
    P.L = L;
    placeDom();
    if (P.state === 'POCKET_ACTIVE') planSteady();
    render();
  });
  setTimeout(() => { if (!document.hidden) drainInbox(); }, 1600);

  function available() {
    if (window.EYES_WEB && !window.EYES_IOS_ABILITIES) return false;
    if (!window.indexedDB || !window.EyesPocketStore) return false;
    try { if (localStorage.getItem('eyes.pocket.off') === '1') return false; } catch {}
    return true;
  }

  window.EyesPocket = {
    fromNative,
    drain: drainInbox,
    diagnostics: () => ({
      state: P.state, items: P.items.length, loaded: P.loaded, filter: P.filter, query: P.query, sort: P.sort,
      detail: P.detail ? P.detail.id : null, composer: P.composer ? P.composer.kind : null, tray: P.tray,
      pendingDelete: P.pendingDelete ? P.pendingDelete.item.id : null, urls: P.urls.size, flights: P.flights,
      native: !!nat(), nativeFiles: nativeFiles(), queue: P.swallowQueue.length,
      layout: P.L ? { view: P.L.view, ax: P.L.ax, ay: P.L.ay, cols: P.L.cols, portrait: P.L.portrait, head: P.L.head, foot: P.L.foot } : null,
      stats: JSON.parse(JSON.stringify(P.stats))
    }),
    _debug: { classify: classifyText, commit, normalizeUrl, safeUrl, react, layout: computeLayout, fps: (t) => fps(t || ms(), false), items: () => P.items }
  };

  const register = () => window.EyesAbility && EyesAbility.register({
    id: 'pocket',
    label: 'Pocket',
    icon: ICON,
    available,
    entry: 'POCKET_OPENING',
    claims: ['POCKET_SWALLOW'],
    states: {
      POCKET_OPENING: ['POCKET_ACTIVE', 'POCKET_CLOSING'],
      POCKET_ACTIVE: ['POCKET_CLOSING'],
      POCKET_CLOSING: [],
      POCKET_SWALLOW: []
    },
    activate, pose, fps, frame, back, interrupt, suspend
  });
  if (!register()) addEventListener('DOMContentLoaded', register, { once: true });
})();
