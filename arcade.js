/* EYES 4.4.4 · Pocket Arcade, the Eye's second ability.
   He doesn't open a game: he becomes the arcade machine. Chosen from the Ability Wheel, he notices it, his
   pupil tightens, his iris stretches sideways and unfolds into an illuminated opening, and a tiny retro game
   is revealed inside him. His iris is the cabinet; the pupil became the screen; the controls grow out of
   the lower rim (beside it, in landscape). He stays alive the whole time and reacts to what happens inside.

   The creature never touches the game: reactions only change how the Eye is painted around a screen whose
   position and size stay fixed while you play, and the game runs the same with every animation switched off.

   Layers
     launcher.js draw()   paints the Eye (pose from here: size, stretch, glow, flinch, lids …)
     frame()              paints the opening's lip, the mechanism, ripples, the little rim pupil
     #arcade (DOM)        the screen (a <canvas> at a whole-number pixel scale), menus and touch controls
     the game             its own fixed-timestep loop, only while something moves (tunnelbug.js)

   States (central machine in ability-wheel.js):
     ARCADE_OPENING -> ARCADE_ACTIVE -> ARCADE_CLOSING -> IDLE        ARCADE_ERROR -> ARCADE_CLOSING

   Games: Arcade keeps its own small catalogue. A game file calls EyesArcade.defineGame(id, factory) when it is
   loaded (only when Arcade first opens). Adding a game means adding it to CATALOG; the Ability Wheel never
   changes. A game object offers: attach(canvas), resize(scale), title(), newRound(), pause(), resume(), stop(),
   input({ dir, pulse }), step(ms), render(alpha), status(), wantsFrames(), and reports events through
   host.emit(name, detail). */
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const ms = () => performance.now();
  const TAU = Math.PI * 2;

  const ICON = 'M6.5 8.5h11a4 4 0 0 1 3.9 4.9l-0.8 3.4a2.6 2.6 0 0 1-4.5 1.1L14.6 16H9.4l-1.5 1.9a2.6 2.6 0 0 1-4.5-1.1l-0.8-3.4A4 4 0 0 1 6.5 8.5Z M7.5 11.2v3 M6 12.7h3 M15.6 12.2a0.7 0.7 0 1 0 1.4 0a0.7 0.7 0 1 0 -1.4 0 M17.4 14.2a0.7 0.7 0 1 0 1.4 0a0.7 0.7 0 1 0 -1.4 0';
  const CATALOG = [
    { id: 'tunnelbug', title: 'Tunnelbug', blurb: 'Dig for energy. Dodge what lives down there.', scripts: ['tunnelbug-render.js', 'tunnelbug-audio.js', 'tunnelbug.js'] }
  ];
  const PREFS_KEY = 'eyes.arcade.prefs.v1';
  const CHANNELS = ['look', 'gx', 'gy', 'k', 'neutral', 'hush', 'open', 'grow', 'size', 'pupil', 'iris', 'lens', 'rxK', 'ryK', 'glow', 'bsx', 'bsy', 'lid', 'ap', 'screen', 'rim'];
  const factories = new Map();
  const loaded = new Map();

  const A = {
    api: null, state: 'IDLE', gen: 0, L: null, game: null, entry: null,
    // choreography
    at: 0, from: null, tracks: null, osc: null, moveUntil: 0, reactions: [], cur: null, openedAt: 0,
    watch: { x: 0, y: 0, until: 0, amount: 0 }, nervous: 0, mood: '', moodAt: 0, ripples: [], sparkles: [],
    rimPupil: { next: 0, until: 0, x: 0 }, satAt: null, itemAt: null,
    // the game loop
    raf: 0, last: 0, acc: 0, frameN: 0, lastPhase: '', resultTimer: 0, panel: '', panelFrom: '',
    // input
    keys: [], stick: null, pulseQueued: false, pulseDownAt: 0,
    // sound
    audio: null, prefs: { sound: true, soundWithMusic: false, dead: 'medium' }, musicAtOpen: false,
    stats: { opened: 0, closed: 0, rounds: 0, loops: 0, steps: 0, renders: 0, reactions: {}, events: {} }
  };
  try { Object.assign(A.prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch {}
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(A.prefs)); } catch {} };
  const host = () => (A.api ? A.api.host() : window.Haven && Haven.abilityHost ? Haven.abilityHost() : null);
  const speed = () => { const h = host(); if (!h || !h.motion()) return 0; return h.gentle() ? 0.55 : 1; };
  const lowPower = () => { const h = host(); return !!(h && h.lowPower()); };
  const musicPlaying = () => { const h = host(); return !!(h && h.core && h.core.state && h.core.state.media && h.core.state.media.playing); };

  // ---------- where the cabinet goes (fixed for as long as you play) ----------
  function insets() {
    const st = document.documentElement.style;
    return { top: parseFloat(st.getPropertyValue('--native-inset-top')) || 0, bottom: parseFloat(st.getPropertyValue('--native-inset-bottom')) || 0 };
  }
  function computeLayout(gw, gh) {
    const W = innerWidth, H = innerHeight, ins = insets(), dpr = Math.max(1, devicePixelRatio || 1);
    const cx = W * 0.5, cy = H * 0.49;
    const portrait = W < H * 0.95;
    const EDGE = 28;                       // keep controls clear of Android's edge-swipe gestures
    const CTRL = portrait ? clamp(H * 0.17, 104, 150) : clamp(W * 0.15, 96, 150);
    let maxW, maxH;
    if (portrait) {
      maxW = Math.min(W - 2 * EDGE, 480);
      const below = H - ins.bottom - 12 - CTRL - cy, above = cy - (ins.top + 46);
      maxH = Math.min(2 * below, 2 * above);
    } else {
      maxW = W - 2 * (CTRL + EDGE + 8);
      maxH = H - ins.top - ins.bottom - 36;
    }
    const bezelK = 0.055;                  // the dark glass between the game and the lip
    const fitW = maxW / (1 + 2 * bezelK * (gh / gw)), fitH = maxH / (1 + 2 * bezelK);
    // a whole number of device pixels per game pixel keeps the pixel art perfectly crisp
    const scale = Math.max(1, Math.floor(Math.min((fitW * dpr) / gw, (fitH * dpr) / gh)));
    const snap = (v) => Math.round(v * dpr) / dpr;
    const DW = (gw * scale) / dpr, DH = (gh * scale) / dpr;
    const bz = snap(Math.max(6, DH * bezelK));
    const ap = { w: DW + bz * 2, h: DH + bz * 2 };
    ap.x = snap(cx - ap.w / 2); ap.y = snap(cy - ap.h / 2); ap.r = Math.min(bz * 2.6, ap.h * 0.2);
    const screen = { x: ap.x + bz, y: ap.y + bz, w: DW, h: DH };
    // the controls on the living rim
    let stick, pulse, pause, zones;
    if (portrait) {
      const cyC = Math.min(ap.y + ap.h + CTRL * 0.5 + 6, H - ins.bottom - CTRL * 0.5 - 4);
      const off = Math.min(ap.w * 0.31, W * 0.5 - EDGE - 46);
      stick = { x: cx - off, y: cyC }; pulse = { x: cx + off, y: cyC };
      const top = ap.y + ap.h + 8, bottom = H - ins.bottom - 4;
      zones = { left: { x: EDGE, y: top, w: cx - 8 - EDGE, h: bottom - top }, right: { x: cx + 8, y: top, w: W - EDGE - cx - 8, h: bottom - top } };
      pause = { x: ap.x + ap.w - 20, y: Math.max(ins.top + 20, ap.y - 24) };
      if (pause.y > ap.y - 18) pause = { x: ap.x + ap.w + 22, y: ap.y + 18 };
    } else {
      const off = ap.w / 2 + CTRL * 0.5 + 6;
      stick = { x: cx - off, y: cy + ap.h * 0.12 }; pulse = { x: cx + off, y: cy + ap.h * 0.12 };
      pause = { x: ap.x + ap.w + Math.min(CTRL * 0.5, 40), y: ap.y + 22 };
      const top = ins.top + 8, bottom = H - ins.bottom - 8;
      zones = { left: { x: EDGE, y: top, w: ap.x - 10 - EDGE, h: bottom - top }, right: { x: ap.x + ap.w + 10, y: pause.y + 30, w: W - EDGE - (ap.x + ap.w + 10), h: bottom - (pause.y + 30) } };
    }
    // the body: an ellipse around the opening, reaching the controls
    const a = ap.w / 2 + 16, b = ap.h / 2 + 16;
    let ry, rx;
    if (portrait) {
      ry = Math.max(b * 1.22, stick.y + 46 - cy);
      rx = a / Math.sqrt(Math.max(0.05, 1 - Math.pow(b / ry, 2)));
      rx = clamp(rx, a + 12, W * 0.64);
    } else {
      rx = Math.max(a * 1.2, cx - stick.x + 50);
      ry = b / Math.sqrt(Math.max(0.05, 1 - Math.pow(a / rx, 2)));
      ry = clamp(ry, b + 12, H * 0.62);
    }
    const S = ry / 1.055;
    const looks = window.HavenDNA && HavenDNA.looks ? HavenDNA.looks() : { iris: 1, pupil: 1 };
    return {
      W, H, dpr, portrait, cx, cy, scale, bz, ap, screen, stick, pulse, pause, zones, rx, ry, S,
      rxK: rx / S, irisF: Math.min(Math.max(rx, ry) * 1.04, Math.hypot(ap.w / 2, ap.h / 2) * 1.16) / S,
      pupilBase: looks.pupil || 1, irisBase: 0.62 * (looks.iris || 1),
      key: [W, H, dpr, ins.top, ins.bottom].join(':')
    };
  }

  // ---------- choreography (keyframed channels, the same way Vision moves) ----------
  function idleValues() {
    const L = A.L;
    return { look: 0, gx: 0, gy: 0, k: 0, neutral: 0, hush: 0, open: 0, grow: 0, size: L.S, pupil: L.pupilBase, iris: L.irisBase, lens: 0, rxK: 1, ryK: 1, glow: 1, bsx: 1, bsy: 1, lid: 0, ap: 0, screen: 0, rim: 0 };
  }
  function evalTracks(t) {
    if (!A.tracks) return A.from || idleValues();
    const sp = speed(), e = sp ? (t - A.at) / sp : Infinity, out = {};
    for (const ch of CHANNELS) {
      const keys = A.tracks[ch];
      let v = A.from[ch];
      if (keys) {
        let pt = 0, pv = A.from[ch];
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
    A.from = A.tracks ? evalTracks(t) : idleValues();
    A.at = t; A.tracks = tracks; A.osc = osc || null;
    let end = 0;
    for (const ch in tracks) end = Math.max(end, tracks[ch][tracks[ch].length - 1][0]);
    A.moveUntil = t + end * speed() + 30;
    if (A.api) A.api.redraw();
    return end * speed();
  }
  // Stage A (recognition) and Stage B (opening), one continuous move
  function planOpening() {
    const L = A.L;
    A.from = idleValues();
    const it = A.itemAt || A.satAt;
    if (it) { A.from.gx = clamp((it.x - L.cx) / (L.W * 0.39), -1, 1); A.from.gy = clamp((it.y - L.cy) / (L.H * 0.34), -1, 1); }
    A.tracks = null;
    return plan({
      // A: he looks at the icon he was given, brightens, and gives a small excited twitch
      look: [[140, 1, 'out'], [520, 1], [760, 0]],
      glow: [[200, 1.32, 'out'], [560, 1.18], [1300, 1.08]],
      bsx: [[230, 1.05], [300, 0.97], [370, 1.03], [440, 1], [700, 0.94], [980, 1.02, 'out'], [1150, 1]],
      bsy: [[230, 0.95], [300, 1.03], [370, 0.98], [440, 1], [700, 1.05], [980, 0.99, 'out'], [1150, 1]],
      k: [[360, 0.6], [560, 1]],
      neutral: [[380, 1]], hush: [[340, 1]], open: [[340, 1]],
      // B: the pupil contracts, the iris stretches sideways and the body unfolds around an opening
      pupil: [[260, L.pupilBase * 1.16, 'out'], [520, L.pupilBase * 0.5], [700, L.pupilBase * 0.42]],
      iris: [[260, L.irisBase * 1.04], [560, L.irisBase * 0.96], [1250, L.irisF, 'out']],
      rxK: [[560, 1], [900, L.rxK * 1.06, 'out'], [1150, L.rxK * 0.985], [1320, L.rxK]],
      ryK: [[560, 1], [900, 0.9], [1250, 1, 'out']],
      grow: [[540, 0], [1220, 1, 'out']],
      size: [[1, L.S]],
      lens: [[660, 0], [860, 1]],
      ap: [[600, 0], [1180, 1.03, 'out'], [1320, 1]],
      screen: [[960, 0], [1300, 1]],
      rim: [[1150, 0], [1520, 1, 'out']]
    }, (t, c) => {
      const e = (t - A.at) / (speed() || 1);
      if (speed() === 1 && e > 470 && e < 640) c.pupil *= 1 + 0.03 * Math.sin(e * 0.12) * (1 - (e - 470) / 170);   // anticipation tremble
    });
  }
  function steadyValues() {
    const L = A.L;
    return { k: [[1, 1]], neutral: [[1, 1]], hush: [[1, 1]], open: [[1, 1]], look: [[300, 0.6]], gx: [[300, 0]], gy: [[300, 0]], size: [[1, L.S]], grow: [[1, 1]], pupil: [[1, L.pupilBase * 0.42]], iris: [[260, L.irisF]], lens: [[1, 1]], rxK: [[260, L.rxK]], ryK: [[260, 1]], glow: [[400, 1]], bsx: [[200, 1]], bsy: [[200, 1]], lid: [[500, 0]], ap: [[1, 1]], screen: [[1, 1]], rim: [[1, 1]] };
  }
  function planSteady() { plan(steadyValues(), steadyOsc); }
  function steadyOsc(t, c) {
    if (speed() !== 1) return;
    // he keeps breathing around the screen; the screen itself never moves
    c.iris *= 1 + 0.006 * Math.sin(t / 1700);
    c.glow *= 1 + 0.025 * Math.sin(t / 2300 + 1);
  }
  // Stage D: the screen contracts inward, the iris folds back, his pupil returns
  function planClosing(fast) {
    const L = A.L, f = fast ? 0.65 : 1;
    return plan({
      screen: [[220 * f, 0]],
      ap: [[120 * f, 1], [520 * f, 0]],
      rim: [[200 * f, 0]],
      lens: [[400 * f, 1], [560 * f, 0]],
      pupil: [[420 * f, L.pupilBase * 0.3], [820 * f, L.pupilBase]],
      grow: [[300 * f, 1], [760 * f, 0]],
      rxK: [[260 * f, A.cur ? A.cur.rxK : L.rxK], [720 * f, 1]],
      ryK: [[720 * f, 1]],
      iris: [[760 * f, L.irisBase]],
      glow: [[500 * f, 1.06], [880 * f, 1]],
      lid: [[300 * f, 0]],
      bsx: [[1, 1]], bsy: [[1, 1]],
      look: [[200, 0.4], [600 * f, 0]], gx: [[1, 0.2]], gy: [[1, 0.5]],
      k: [[560 * f, 1], [860 * f, 0]],
      neutral: [[860 * f, 0]], hush: [[860 * f, 0]], open: [[860 * f, 0]]
    });
  }

  // ---------- reactions: small, never in the game's way ----------
  const REACT = {
    collect: { dur: 380, glow: [[90, 1.22], [380, 1]] },
    rare: { dur: 640, glow: [[110, 1.4], [640, 1]], iris: [[120, 1.035], [640, 1]] },
    flinch: { dur: 300, bsx: [[60, 0.955], [150, 1.02], [300, 1]], bsy: [[60, 1.04], [150, 0.985], [300, 1]], iris: [[70, 0.95], [300, 1]], glow: [[60, 0.8], [300, 1]] },
    ripple: { dur: 460, glow: [[80, 1.18], [460, 1]] },
    pop: { dur: 320, glow: [[80, 1.15], [320, 1]], bsy: [[80, 1.02], [320, 1]] },
    wave: { dur: 700, glow: [[160, 1.28], [700, 1]], iris: [[200, 1.03], [700, 1]] },
    cheer: { dur: 1100, iris: [[220, 1.1], [520, 1.04], [1100, 1]], glow: [[200, 1.45], [1100, 1.1]], bsx: [[160, 1.04], [300, 0.98], [460, 1.03], [700, 1]], bsy: [[160, 0.96], [300, 1.02], [460, 0.98], [700, 1]] },
    celebrate: { dur: 1700, glow: [[200, 1.6], [900, 1.3], [1700, 1.1]], bsx: [[150, 1.05], [300, 0.97], [450, 1.05], [600, 0.97], [750, 1.03], [1000, 1]], bsy: [[150, 0.95], [300, 1.03], [450, 0.95], [600, 1.03], [750, 0.98], [1000, 1]] },
    glance: { dur: 260, glow: [[100, 1.05], [260, 1]] }
  };
  function react(name) {
    A.stats.reactions[name] = (A.stats.reactions[name] || 0) + 1;
    const sp = speed(), t = ms();
    if (!sp) return;
    const R = REACT[name];
    if (!R) return;
    A.reactions = A.reactions.filter((r) => t - r.at < r.dur * r.sp);
    if (A.reactions.length > 5) A.reactions.shift();
    A.reactions.push({ ...R, name, at: t, sp: sp === 1 ? 1 : 0.6 });
    A.moveUntil = Math.max(A.moveUntil, t + R.dur * sp + 30);
    if (A.api) A.api.redraw();
  }
  function reactionMul(t, ch) {
    let m = 1;
    for (const r of A.reactions) {
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
  // what the game tells the creature
  function onGameEvent(name, d) {
    A.stats.events[name] = (A.stats.events[name] || 0) + 1;
    if (A.state !== 'ARCADE_ACTIVE') return;
    const t = ms(), L = A.L;
    const toScreen = (nx, ny) => ({ x: L.screen.x + ((nx + 1) / 2) * L.screen.w, y: L.screen.y + ((ny + 1) / 2) * L.screen.h });
    switch (name) {
      case 'start': A.nervous = 0; A.mood = ''; A.sparkles = []; planSteady(); break;
      case 'go': react('glance'); break;
      case 'collect': react(d && d.rare ? 'rare' : 'collect'); flashLip(d && d.rare ? 0.9 : 0.5); break;
      case 'danger': {
        // his iris drifts toward what's coming (the screen stays put)
        const near = clamp(1 - (d.d || 3) / 3.2);
        A.watch = { x: d.nx || 0, y: d.ny || 0, until: t + 650, amount: Math.max(A.watch.until > t ? A.watch.amount : 0, 0.25 + 0.35 * near) };
        break;
      }
      case 'warn': A.watch = { x: d.nx || 0, y: d.ny || 0, until: t + 500, amount: 0.35 }; react('glance'); break;
      case 'hit': react('flinch'); break;
      case 'low': A.nervous = 1; break;
      case 'pulse': react('ripple'); if (speed()) A.ripples.push({ at: t }); break;
      case 'pop': react('pop'); break;
      case 'wave': react('wave'); flashLip(0.8); break;
      case 'stir': { const p = toScreen(d.nx || 0, d.ny || 0); A.watch = { x: d.nx || 0, y: d.ny || 0, until: t + 700, amount: 0.3 }; void p; break; }
      case 'win': A.nervous = 0; A.mood = 'happy'; A.moodAt = t; react('cheer'); break;
      case 'best': A.mood = 'proud'; A.moodAt = t; react('celebrate'); if (speed()) burstSparkles(18); break;
      case 'lose': A.nervous = 0; A.mood = 'sad'; A.moodAt = t; break;
    }
    if (A.api) A.api.redraw();
  }
  function flashLip(k) { A.lipFlash = { at: ms(), k }; }
  function burstSparkles(n) {
    const t = ms();
    for (let i = 0; i < n; i++) A.sparkles.push({ at: t + i * 45, a: (i / n) * TAU, life: 1500 + Math.random() * 500, r: 0.9 + Math.random() * 0.25 });
  }

  // ---------- the pose handed to launcher.js ----------
  function pose(t) {
    if (A.state === 'IDLE' || !A.L) return null;
    const c = evalTracks(t);
    if (A.osc) A.osc(t, c);
    for (const ch of ['glow', 'iris', 'bsx', 'bsy']) c[ch] *= reactionMul(t, ch);
    if (A.state === 'ARCADE_ACTIVE') {
      // watching danger: a gentle drift of the iris, decaying when nothing threatens
      const w = A.watch, live = w.until > t ? 1 : clamp(1 - (t - w.until) / 500);
      if (live > 0 && speed()) { c.look = Math.max(c.look, w.amount * live); c.gx = mix(c.gx, w.x * 0.8, live); c.gy = mix(c.gy, w.y * 0.6, live); }
      // nervous on the last health: the iris narrows a little and trembles
      if (A.nervous) { c.iris *= 0.93 + (speed() === 1 ? 0.006 * Math.sin(t / 95) : 0); c.glow *= 0.94; }
      // after the round: happy, proud, or a little disappointed (a lid droops, the light dims)
      const mt = clamp((t - A.moodAt) / 500);
      if (A.mood === 'sad') { c.lid = Math.max(c.lid, 0.16 * ease(mt)); c.glow *= 1 - 0.22 * ease(mt); c.look = Math.max(c.look, 0.5 * ease(mt)); c.gy = mix(c.gy, 0.55, ease(mt)); }
      if (A.mood === 'happy' || A.mood === 'proud') c.glow *= 1 + 0.08 * ease(mt);
    }
    A.cur = c;
    return { k: c.k, look: c.look, gaze: { x: c.gx, y: c.gy }, neutral: c.neutral, hush: c.hush, open: c.open, grow: c.grow, size: c.size, pupil: c.pupil, iris: c.iris, lens: c.lens, rxK: c.rxK, ryK: c.ryK, glow: c.glow, bodySx: c.bsx, bodySy: c.bsy, lid: c.lid };
  }
  function fps(t, low) {
    if (A.state === 'IDLE') return 0;
    if (A.state !== 'ARCADE_ACTIVE' || t < A.moveUntil - 400) return low ? 30 : 60;
    if (t < A.moveUntil || A.ripples.length || A.sparkles.length || A.watch.until + 500 > t || (A.lipFlash && t - A.lipFlash.at < 500) || (A.mood && t - A.moodAt < 600)) return low ? 20 : 30;
    if (A.rimPupil.until > t) return low ? 12 : 24;
    return A.nervous && speed() === 1 ? (low ? 8 : 12) : (low ? 5 : 8);
  }

  // ---------- painting the opening into the Eye's canvas ----------
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // the opening's shape for a given u (0 = his pupil, 1 = the full screen)
  function aperture(u, g) {
    const L = A.L, ap = L.ap;
    const d = g && g.drawn, sx = g && g.pose ? g.pose.sx : 1;
    const centre = d ? g.screen(d.gx, d.gy) : { x: L.cx, y: L.cy };
    const pr = d ? Math.max(4, d.pupilR * sx) : 10;
    const uw = easeOut(clamp(u * 1.15)), uh = ease(clamp((u - 0.12) / 0.88));     // it stretches sideways first
    const w = mix(pr * 2, ap.w, uw), h = mix(pr * 1.3, ap.h, uh);
    const x = mix(centre.x, ap.x + ap.w / 2, ease(u)) - w / 2, y = mix(centre.y, ap.y + ap.h / 2, ease(u)) - h / 2;
    return { x, y, w, h, r: Math.min(mix(h / 2, ap.r, ease(u)), h / 2) };
  }
  function frame(ctx, g) {
    if (A.state === 'IDLE' || !A.L) return;
    const t = ms(), c = A.cur || evalTracks(t), L = A.L;
    A.lastGeo = g;
    if (A.state === 'ARCADE_ACTIVE' || A.state === 'ARCADE_ERROR') watchdog();
    const u = clamp(c.ap, 0, 1.05);
    syncScreen(c, g);
    if (u <= 0.002) return;
    const o = aperture(Math.min(1, u), g), tint = g.tint;
    ctx.save();
    // the inside of the opening, lit from within as it unfolds
    const lit = clamp(u * 1.4) * (1 - clamp(c.screen));
    roundRect(ctx, o.x, o.y, o.w, o.h, o.r);
    ctx.fillStyle = '#020507'; ctx.fill();
    if (lit > 0.01) {
      const gl = ctx.createRadialGradient(o.x + o.w / 2, o.y + o.h / 2, 0, o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w, o.h) * 0.6);
      gl.addColorStop(0, tint(1.25, 0.55 * lit)); gl.addColorStop(0.5, tint(0.9, 0.2 * lit)); gl.addColorStop(1, tint(0.6, 0));
      ctx.fillStyle = gl; ctx.fill();
    }
    // the mechanism: fine iris blades around the opening fold away as it widens
    if (u < 1 && speed()) {
      const n = 14, cxo = o.x + o.w / 2, cyo = o.y + o.h / 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + u * 1.3;
        const ex = Math.cos(a) * (o.w / 2 + 3), ey = Math.sin(a) * (o.h / 2 + 3);
        const len = (1 - u) * Math.min(o.w, o.h) * 0.22 + 2;
        ctx.strokeStyle = tint(1.1, 0.35 * (1 - u));
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(cxo + ex, cyo + ey); ctx.lineTo(cxo + ex * (1 + len / (o.w / 2 + 3)) + Math.cos(a + 1.2) * len * 0.4, cyo + ey * (1 + len / (o.h / 2 + 3)) + Math.sin(a + 1.2) * len * 0.4); ctx.stroke();
      }
    }
    // the lip: a living, softly glowing rim
    const breathe = speed() === 1 ? 0.5 + 0.5 * Math.sin(t / 1400) : 0.5;
    const fl = A.lipFlash && t - A.lipFlash.at < 500 ? (1 - (t - A.lipFlash.at) / 500) * A.lipFlash.k : 0;
    const lipA = (0.5 + 0.12 * breathe + 0.4 * fl) * clamp(u * 1.5) * (A.mood === 'sad' ? 0.7 : 1);
    for (const [grow, w, a] of [[5, 7, 0.08], [2.5, 3.5, 0.18], [0.5, 1.4, 0.75]]) {
      roundRect(ctx, o.x - grow, o.y - grow, o.w + grow * 2, o.h + grow * 2, o.r + grow);
      ctx.strokeStyle = tint(1.15 + 0.3 * fl, a * lipA); ctx.lineWidth = w; ctx.stroke();
    }
    // the sockets the controls grow from
    if (c.rim > 0.01 && A.state === 'ARCADE_ACTIVE') {
      for (const p of [L.stick, L.pulse]) {
        const r = 44 * (0.6 + 0.4 * c.rim);
        const sg = ctx.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, r);
        sg.addColorStop(0, 'rgba(2,6,8,' + 0.55 * c.rim + ')'); sg.addColorStop(0.7, tint(0.7, 0.12 * c.rim)); sg.addColorStop(1, tint(0.7, 0));
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      }
    }
    // the pulse: light ripples outward through the rim (outside the screen, never over it)
    A.ripples = A.ripples.filter((r) => t - r.at < 520);
    for (const r of A.ripples) {
      const e = (t - r.at) / 520, grow = 4 + easeOut(e) * 40;
      roundRect(ctx, o.x - grow, o.y - grow, o.w + grow * 2, o.h + grow * 2, o.r + grow);
      ctx.strokeStyle = tint(1.3, 0.45 * (1 - e)); ctx.lineWidth = 2 * (1 - e) + 0.6; ctx.stroke();
    }
    // a best score: sparks orbit the cabinet
    A.sparkles = A.sparkles.filter((s) => t - s.at < s.life);
    for (const s of A.sparkles) {
      const e = (t - s.at) / s.life;
      if (e < 0) continue;
      const a = s.a + e * 4.2, rx = (o.w / 2 + 18) * s.r, ry = (o.h / 2 + 18) * s.r;
      const x = o.x + o.w / 2 + Math.cos(a) * rx, y = o.y + o.h / 2 + Math.sin(a) * ry;
      ctx.fillStyle = tint(1.5, (1 - e) * 0.9);
      ctx.beginPath(); ctx.arc(x, y, 1.6 + (1 - e) * 1.4, 0, TAU); ctx.fill();
    }
    paintRimPupil(ctx, g, o, t);
    ctx.restore();
  }
  // now and then a tiny reflective pupil appears on the lower rim and follows the bug
  function paintRimPupil(ctx, g, o, t) {
    const R = A.rimPupil;
    if (A.state !== 'ARCADE_ACTIVE' || !A.game || !speed()) return;
    const s = A.game.status();
    if (s.phase !== 'playing' || s.paused || !s.player) { if (R.until > t) R.until = t; return; }
    if (!R.next) R.next = t + 9000 + Math.random() * 6000;
    if (t >= R.next && R.until < t) { R.until = t + 3800; R.next = t + 20000 + Math.random() * 12000; R.x = s.player.nx; }
    if (R.until <= t) return;
    const left = R.until - t, vis = clamp(Math.min((3800 - left) / 300, left / 400));
    R.x = mix(R.x, s.player.nx, 0.18);
    const inset = o.r + 8, x = clamp(o.x + ((R.x + 1) / 2) * o.w, o.x + inset, o.x + o.w - inset), y = o.y + o.h + 7.5;
    const r = 4.2;
    ctx.globalAlpha = vis;
    ctx.fillStyle = 'rgba(2,8,10,0.85)'; ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, TAU); ctx.fill();
    const pg = ctx.createRadialGradient(x, y, 0, x, y, r);
    pg.addColorStop(0, 'rgba(235,255,252,0.95)'); pg.addColorStop(0.5, g.tint(1.05, 0.85)); pg.addColorStop(1, g.tint(0.7, 0.2));
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(x - 1.3, y - 1.4, 1, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // the DOM screen follows the painted opening while it unfolds, then holds perfectly still
  function syncScreen(c, g) {
    const scr = $('arcadeScreen'), L = A.L;
    if (!scr) return;
    const ap = L.ap, sv = clamp(c.screen), u = clamp(c.ap, 0, 1);
    if (sv <= 0.002 || u <= 0.01) { if (!scr.classList.contains('veiled')) scr.classList.add('veiled'); return; }
    scr.classList.remove('veiled');
    const o = aperture(u, g);
    const top = Math.max(0, o.y - ap.y), left = Math.max(0, o.x - ap.x), right = Math.max(0, ap.x + ap.w - (o.x + o.w)), bottom = Math.max(0, ap.y + ap.h - (o.y + o.h));
    const key = sv < 1 || u < 0.999 ? `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px round ${o.r.toFixed(1)}px)` : '';
    if (scr.dataset.clip !== key) { scr.style.clipPath = key; scr.dataset.clip = key; }
    const op = sv.toFixed(3);
    if (scr.style.opacity !== op) scr.style.opacity = op;
    const rim = $('arcadeRim'), rv = clamp(c.rim).toFixed(3);
    if (rim.style.opacity !== rv) { rim.style.opacity = rv; rim.style.setProperty('--rim', rv); }
    const tint = g.tint(1, 1);
    if (tint !== A.tintKey) {
      A.tintKey = tint;
      const m = /rgba?\(([^)]+)\)/.exec(tint);
      if (m) $('arcade').style.setProperty('--arcade-rgb', m[1].split(',').slice(0, 3).join(','));
    }
  }

  // ---------- DOM ----------
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role' || k === 'tabindex') n.setAttribute(k, v); else n[k] = v;
    }
    n.append(...kids);
    return n;
  }
  function ensureDom() {
    if ($('arcade')) return;
    const canvas = el('canvas', { id: 'arcadeCanvas', 'aria-label': 'Game screen', role: 'img' });
    const menu = el('div', { id: 'arcadeMenu' });
    const screen = el('div', { id: 'arcadeScreen', class: 'veiled' }, canvas, el('div', { class: 'arcade-glass', 'aria-hidden': 'true' }), menu);
    const knob = el('span', { class: 'arcade-knob' });
    const stickBase = el('span', { id: 'arcadeStickBase', class: 'arcade-stick-base', 'aria-hidden': 'true' }, knob,
      ...['n', 'e', 's', 'w'].map((d) => el('span', { class: 'arcade-chev arcade-chev-' + d })));
    const stick = el('div', { id: 'arcadeStick', class: 'arcade-zone', role: 'application', 'aria-label': 'Move: touch and drag' }, stickBase);
    const pulseBtn = el('button', { id: 'arcadePulse', type: 'button', class: 'arcade-zone', 'aria-label': 'Energy pulse' },
      el('span', { id: 'arcadePulseFace', class: 'arcade-pulse-face', 'aria-hidden': 'true' }, el('span', { class: 'arcade-pulse-core' })));
    const pauseBtn = el('button', { id: 'arcadePause', type: 'button', 'aria-label': 'Pause' });
    const rim = el('div', { id: 'arcadeRim' }, stick, pulseBtn, pauseBtn);
    const note = el('p', { id: 'arcadeNote', role: 'status', 'aria-live': 'polite' });
    const stage = el('section', { id: 'arcade', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pocket Arcade', tabindex: '-1', hidden: true }, screen, rim, note);
    // nothing behind the Arcade hears a touch while it owns the iris
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'click', 'contextmenu', 'wheel'])
      stage.addEventListener(type, (e) => { e.stopPropagation(); if (type === 'contextmenu') e.preventDefault(); }, type.startsWith('touch') || type === 'wheel' ? { passive: true } : false);
    stage.addEventListener('keydown', onKey);
    stage.addEventListener('keyup', onKeyUp);
    bindStick(stick, stickBase, knob);
    pulseBtn.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); A.pulseDownAt = ms(); queuePulse(); pulseBtn.classList.add('pressed'); });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) pulseBtn.addEventListener(type, () => pulseBtn.classList.remove('pressed'));
    pulseBtn.addEventListener('click', () => { if (ms() - A.pulseDownAt > 600) queuePulse(); });   // keyboard / accessibility
    pauseBtn.addEventListener('click', () => { const s = A.game && A.game.status(); if (s && (s.phase === 'playing' || s.phase === 'ready') && !s.paused) pauseGame('button'); else close_('button'); });
    document.body.append(stage);
  }
  function bindStick(zone, base, knob) {
    const dead = () => ({ small: 7, medium: 13, large: 20 }[A.prefs.dead] || 13);
    const release = () => {
      A.stick = null;
      base.classList.remove('held');
      base.style.transform = '';
      knob.style.transform = '';
      base.dataset.dir = '';
    };
    zone.addEventListener('pointerdown', (e) => {
      if (A.stick || !A.game) return;
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch {}
      const r = zone.getBoundingClientRect();
      // a floating stick: it starts wherever your thumb lands
      A.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dir: 0, rx: r.left, ry: r.top };
      base.classList.add('held');
      const rest = { x: A.L.stick.x - r.left, y: A.L.stick.y - r.top };
      base.style.transform = `translate(${(e.clientX - r.left - rest.x).toFixed(1)}px, ${(e.clientY - r.top - rest.y).toFixed(1)}px)`;
    });
    zone.addEventListener('pointermove', (e) => {
      const s = A.stick;
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.ox, dy = e.clientY - s.oy, len = Math.hypot(dx, dy), max = 34;
      const k = len > max ? max / len : 1;
      knob.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;
      let dir = s.dir;
      if (len < dead()) dir = 0;
      else {
        const ax = Math.abs(dx), ay = Math.abs(dy);
        const horiz = s.dir === 2 || s.dir === 4, vert = s.dir === 1 || s.dir === 3;
        // a little stickiness on the current axis, so diagonals don't flicker
        const useH = horiz ? ax * 1.25 >= ay : vert ? ax > ay * 1.25 : ax >= ay;
        dir = useH ? (dx > 0 ? 2 : 4) : (dy > 0 ? 3 : 1);
      }
      if (dir !== s.dir) { s.dir = dir; base.dataset.dir = String(dir); }
      // a long drag carries the stick along with your thumb
      if (len > max * 1.6) { s.ox = e.clientX - dx * (max * 1.6 / len); s.oy = e.clientY - dy * (max * 1.6 / len); base.style.transform = `translate(${(s.ox - s.rx - (A.L.stick.x - s.rx)).toFixed(1)}px, ${(s.oy - s.ry - (A.L.stick.y - s.ry)).toFixed(1)}px)`; }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(type, (e) => { if (A.stick && e.pointerId === A.stick.id) release(); });
    A.releaseStick = release;
  }
  const KEYS = { ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3, ArrowLeft: 4, KeyA: 4 };
  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Backspace' && !/input|textarea/i.test(e.target.tagName)) { e.preventDefault(); back(); return; }
    const s = A.game && A.game.status();
    const playing = s && (s.phase === 'playing' || s.phase === 'ready') && !s.paused;
    if (playing) {
      const d = KEYS[e.code];
      if (d) { e.preventDefault(); if (!A.keys.includes(d)) A.keys.push(d); return; }
      if (e.code === 'Space' || e.code === 'KeyX' || e.code === 'KeyJ' || e.code === 'KeyK' || e.code === 'KeyZ') { e.preventDefault(); if (!e.repeat) queuePulse(); return; }
      if (e.code === 'KeyP') { e.preventDefault(); pauseGame('key'); return; }
    } else if (e.code === 'KeyP' && s && s.paused) { e.preventDefault(); resumeGame(); return; }
    if (e.key !== 'Tab') return;
    const items = [...$('arcade').querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent !== null && !b.closest('[hidden]') && b.id !== 'arcadePulse');
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    e.preventDefault();
    items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
  }
  function onKeyUp(e) { const d = KEYS[e.code]; if (d) A.keys = A.keys.filter((k) => k !== d); }
  function queuePulse() { const s = A.game && A.game.status(); if (s && s.phase === 'playing' && !s.paused) A.pulseQueued = true; }
  function currentDir() {
    if (A.stick && A.stick.dir) return A.stick.dir;
    return A.keys.length ? A.keys[A.keys.length - 1] : 0;
  }
  function releaseInput() {
    A.keys = []; A.pulseQueued = false;
    if (A.releaseStick) A.releaseStick();
    const p = $('arcadePulse'); if (p) p.classList.remove('pressed');
    if (A.game) try { A.game.input({ dir: 0, pulse: false }); } catch {}
  }

  // place the screen, the rim and the controls (only when opening, and if the screen size really changes)
  function placeDom() {
    const L = A.L, root = $('arcade');
    const px = (v) => v.toFixed(2) + 'px';
    const scr = $('arcadeScreen'), cv = $('arcadeCanvas');
    Object.assign(scr.style, { left: px(L.ap.x), top: px(L.ap.y), width: px(L.ap.w), height: px(L.ap.h), borderRadius: px(L.ap.r) });
    Object.assign(cv.style, { left: px(L.bz), top: px(L.bz), width: px(L.screen.w), height: px(L.screen.h) });
    root.style.setProperty('--arcade-u', (L.screen.h / 96).toFixed(3) + 'px');
    const zone = (id, z) => Object.assign($(id).style, { left: px(z.x), top: px(z.y), width: px(Math.max(40, z.w)), height: px(Math.max(40, z.h)) });
    zone('arcadeStick', L.zones.left); zone('arcadePulse', L.zones.right);
    const sb = $('arcadeStickBase'), pf = $('arcadePulseFace');
    sb.style.left = px(L.stick.x - L.zones.left.x); sb.style.top = px(L.stick.y - L.zones.left.y);
    pf.style.left = px(L.pulse.x - L.zones.right.x); pf.style.top = px(L.pulse.y - L.zones.right.y);
    Object.assign($('arcadePause').style, { left: px(L.pause.x), top: px(L.pause.y) });
    const note = $('arcadeNote');
    note.style.top = px(L.portrait ? Math.max(insets().top + 8, L.ap.y - 30) : L.H - insets().bottom - 26);
    root.classList.toggle('landscape', !L.portrait);
    root.classList.toggle('still', !speed());
  }
  function showStage(on) {
    ensureDom();
    const stage = $('arcade');
    stage.hidden = !on;
    $('home').classList.toggle('arcade-owned', on);
    document.documentElement.classList.toggle('arcade-open', on);
    if (on) stage.focus({ preventScroll: true });
    else {
      $('arcadeScreen').classList.add('veiled');
      $('arcadeScreen').style.opacity = '0';
      $('arcadeRim').style.opacity = '0';
      $('arcadeMenu').replaceChildren();
      $('arcadeNote').textContent = '';
      const cv = $('arcadeCanvas'); cv.width = cv.height = 0;     // give the pixels back
    }
  }
  function note(text, dur) {
    const n = $('arcadeNote');
    if (!n) return;
    clearTimeout(A.noteTimer);
    n.textContent = text; n.classList.toggle('on', !!text);
    if (text && dur) A.noteTimer = setTimeout(() => n.classList.remove('on'), dur);
  }

  // ---------- menus inside the screen ----------
  function button(label, cls, fn, extra) {
    const b = el('button', { type: 'button', class: 'arcade-btn ' + (cls || ''), text: label, ...(extra || {}) });
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); });
    return b;
  }
  function soundOn() { return A.musicAtOpen ? !!A.prefs.soundWithMusic : !!A.prefs.sound; }
  function soundLabel() { return soundOn() ? 'Sound: on' : 'Sound: off'; }
  function toggleSound(b) {
    if (A.musicAtOpen) A.prefs.soundWithMusic = !A.prefs.soundWithMusic; else A.prefs.sound = !A.prefs.sound;
    savePrefs();
    if (soundOn()) ensureAudio(); else releaseAudio(false);
    if (b) { b.textContent = soundLabel(); b.setAttribute('aria-pressed', String(soundOn())); }
  }
  function deadLabel() { return 'Stick: ' + ({ small: 'tight', medium: 'normal', large: 'relaxed' }[A.prefs.dead] || 'normal'); }
  function cycleDead(b) {
    const order = ['small', 'medium', 'large'];
    A.prefs.dead = order[(order.indexOf(A.prefs.dead) + 1) % 3];
    savePrefs();
    if (b) b.textContent = deadLabel();
  }
  function showPanel(name, from) {
    const menu = $('arcadeMenu');
    A.panelFrom = from || (A.panel && A.panel !== name ? A.panel : A.panelFrom);
    A.panel = name;
    menu.replaceChildren();
    menu.dataset.panel = name || '';
    if (!name) { syncRimButtons(); return; }
    const s = A.game ? A.game.status() : null, entry = A.entry || CATALOG[0];
    const box = el('div', { class: 'arcade-panel arcade-panel-' + name, role: 'group', 'aria-label': name });
    let first = null;
    if (name === 'title') {
      box.append(el('p', { class: 'arcade-blurb', text: entry.blurb }));
      first = button('Play', 'primary', () => startRound());
      const row = el('div', { class: 'arcade-row' }, button('How to play', '', () => showPanel('help', 'title')), button(soundLabel(), 'quiet', toggleSound, { 'aria-pressed': String(soundOn()) }));
      box.append(first, row);
      if (s && s.best) box.append(el('p', { class: 'arcade-best', text: 'Best ' + s.best }));
      if (CATALOG.length > 1) {
        const pick = el('div', { class: 'arcade-row arcade-games' });
        for (const g of CATALOG) pick.append(button(g.title, g.id === entry.id ? 'quiet on' : 'quiet', () => switchGame(g)));
        box.append(pick);
      }
    } else if (name === 'help') {
      box.append(el('h2', { text: 'How to play' }),
        el('ul', { class: 'arcade-help' },
          el('li', { text: 'Touch and drag on the left to dig in any direction. Old tunnels are faster.' }),
          el('li', { text: 'Gather every crystal. Three waves grow, each in riskier places.' }),
          el('li', { text: 'Grubs roam the tunnels. Stalkers tremble, then hunt you through the earth.' }),
          el('li', { text: 'Tap the right side to pulse: it stuns anything close. Touch a stunned one to pop it.' }),
          el('li', { text: 'Three hits and the round is over. 90 seconds on the clock.' })),
        el('p', { class: 'arcade-keys', text: 'Keyboard: arrows or WASD, Space to pulse, P to pause.' }));
      first = button('Back', 'primary', () => showPanel(A.panelFrom === 'pause' ? 'pause' : 'title'));
      box.append(first);
    } else if (name === 'pause') {
      box.append(el('h2', { text: 'Paused' }));
      first = button('Resume', 'primary', () => resumeGame());
      box.append(first, el('div', { class: 'arcade-row' }, button('Restart', '', () => startRound()), button('How to play', '', () => showPanel('help', 'pause'))),
        el('div', { class: 'arcade-row' }, button(soundLabel(), 'quiet', toggleSound, { 'aria-pressed': String(soundOn()) }), button(deadLabel(), 'quiet', cycleDead)),
        button('Leave Arcade', 'quiet', () => close_('menu')));
    } else if (name === 'result') {
      const r = s && s.result;
      const won = r && r.phase === 'won';
      const head = won ? 'Cleared!' : r && r.reason === 'time' ? "Time's up" : 'Out of energy';
      box.append(el('h2', { text: head }));
      box.append(el('p', { class: 'arcade-score', text: String(s ? s.score : 0) }));
      box.append(el('p', { class: 'arcade-best' + (s && s.newBest ? ' new' : ''), text: s && s.newBest ? 'New best!' : 'Best ' + (s ? s.best : 0) }));
      if (r) box.append(el('p', { class: 'arcade-detail', text: won ? `All three waves · ${Math.round(r.timeMs / 1000)} s · bonus ${r.bonus}` : `${r.collected} crystals · wave ${r.wave} of ${r.waves}` }));
      first = button('Play again', 'primary', () => startRound());
      box.append(first, button('Leave Arcade', 'quiet', () => close_('menu')));
    } else if (name === 'error') {
      box.append(el('h2', { text: "The arcade didn't wake up." }), el('p', { class: 'arcade-detail', text: 'Something in the game failed to load. Close and try again.' }));
      first = button('Close', 'primary', () => close_('error'));
      box.append(first);
    }
    menu.append(box);
    syncRimButtons();
    // keep focus inside the cabinet; on a touch screen, don't move focus around for nothing
    if (first && (A.api && A.api.keyboard())) setTimeout(() => { if (A.panel === name && first.isConnected) first.focus({ preventScroll: true }); }, 30);
    else $('arcade').focus({ preventScroll: true });
  }
  function syncRimButtons() {
    const s = A.game && A.game.status();
    const inPlay = !!(s && (s.phase === 'playing' || s.phase === 'ready') && !s.paused);
    const p = $('arcadePause');
    p.classList.toggle('is-close', !inPlay);
    p.setAttribute('aria-label', inPlay ? 'Pause' : 'Close Arcade');
    $('arcadeRim').classList.toggle('live', inPlay);
    $('arcadeStick').setAttribute('aria-disabled', String(!inPlay));
    $('arcadePulse').disabled = !inPlay;
  }

  // ---------- sound (never touches anyone else's music) ----------
  function ensureAudio() {
    if (!soundOn()) return null;
    if (!A.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        const ctx = new AC({ latencyHint: 'interactive' });
        const out = ctx.createGain();
        out.gain.value = 0.55;
        out.connect(ctx.destination);
        A.audio = { ctx, out };
      } catch { return null; }
    }
    if (A.audio.ctx.state === 'suspended') A.audio.ctx.resume().catch(() => {});
    return A.audio;
  }
  function releaseAudio(close) {
    const a = A.audio;
    if (!a) return;
    if (close) { A.audio = null; try { a.out.disconnect(); } catch {} a.ctx.close().catch(() => {}); }
    else if (a.ctx.state === 'running') a.ctx.suspend().catch(() => {});
  }
  const audioOut = () => (soundOn() && A.audio && A.audio.ctx.state === 'running' ? A.audio : null);

  // ---------- the game ----------
  function loadScripts(list) {
    return list.reduce((p, src) => p.then(() => {
      if (loaded.get(src) === 'ok') return;
      if (loaded.get(src) instanceof Promise) return loaded.get(src);
      const pr = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.async = false;
        s.onload = () => { loaded.set(src, 'ok'); resolve(); };
        s.onerror = () => { loaded.delete(src); s.remove(); reject(new Error('load ' + src)); };
        document.head.append(s);
      });
      loaded.set(src, pr);
      return pr;
    }), Promise.resolve());
  }
  function gameHost() {
    return {
      emit: (name, detail) => { try { onGameEvent(name, detail || {}); } catch {} },
      motion: () => speed() > 0,
      lowPower,
      audio: audioOut,
      store: {
        get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
        set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
      }
    };
  }
  async function prepareGame(entry, gen) {
    await loadScripts(entry.scripts);
    if (gen !== A.gen) return null;
    const make = factories.get(entry.id);
    if (!make) throw new Error('no game ' + entry.id);
    const game = make(gameHost());
    game.attach($('arcadeCanvas'));
    game.resize(A.L.scale);
    game.title();
    game.render(1);
    return game;
  }
  function startRound() {
    if (!A.game || A.state !== 'ARCADE_ACTIVE') return;
    ensureAudio();                       // a tap: the moment Android allows sound to start
    releaseInput();
    A.nervous = 0; A.mood = ''; A.sparkles = [];
    clearTimeout(A.resultTimer);
    A.game.newRound();
    A.stats.rounds++;
    A.lastPhase = 'ready';
    showPanel('');
    $('arcade').focus({ preventScroll: true });
    kick();
  }
  function pauseGame(reason) {
    if (!A.game) return;
    const s = A.game.status();
    releaseInput();
    if ((s.phase === 'playing' || s.phase === 'ready') && !s.paused) {
      A.game.pause();
      A.game.render(1);
      showPanel('pause');
      if (reason === 'call' || reason === 'hidden') note('Paused while you were away.', 2600);
    }
    stopLoop();
    releaseAudio(false);
  }
  function resumeGame() {
    if (!A.game) return;
    A.game.resume();
    showPanel('');
    $('arcade').focus({ preventScroll: true });
    ensureAudio();
    kick();
  }
  function switchGame(entry) {
    if (!A.api || entry.id === (A.entry && A.entry.id)) return;
    const gen = A.gen;
    stopLoop();
    if (A.game) { try { A.game.stop(); } catch {} A.game = null; }
    A.entry = entry;
    prepareGame(entry, gen).then((g) => { if (g && gen === A.gen) { A.game = g; showPanel('title'); kick(); } }).catch(() => fail());
  }

  // one loop for the game, alive only while something on the screen moves
  function kick() { if (!A.raf && A.game && A.state === 'ARCADE_ACTIVE' && !document.hidden) { A.last = ms(); A.acc = 0; A.raf = requestAnimationFrame(loop); A.stats.loops++; } }
  function stopLoop() { if (A.raf) cancelAnimationFrame(A.raf); A.raf = 0; }
  function loop(now) {
    A.raf = 0;
    const game = A.game;
    if (!game || A.state !== 'ARCADE_ACTIVE' || document.hidden) return;
    if (watchdog()) return;
    const s0 = game.status();
    const attract = s0.phase === 'title';
    const dt = Math.min(250, Math.max(0, now - A.last));
    A.last = now;
    A.acc += dt;
    const stepMs = game.stepMs || 1000 / 60;
    game.input({ dir: currentDir(), pulse: A.pulseQueued });
    A.pulseQueued = false;
    let n = 0;
    while (A.acc >= stepMs && n < 8) { game.step(stepMs); A.acc -= stepMs; n++; A.stats.steps++; }
    if (n >= 8) A.acc = 0;
    if (n) game.input({ dir: currentDir(), pulse: false });
    // draw at the display's pace while playing (half of it on low power); the attract screen is gentler
    A.frameN++;
    const every = attract ? (lowPower() ? 4 : 2) : lowPower() ? 2 : 1;
    if (A.frameN % every === 0) { game.render(clamp(A.acc / stepMs)); A.stats.renders++; }
    afterFrame(game.status());
    if (game.wantsFrames() && A.state === 'ARCADE_ACTIVE') A.raf = requestAnimationFrame(loop);
  }
  function afterFrame(s) {
    // the pulse button fills while it recharges
    const ready = s.phase === 'playing' && !s.paused ? s.pulseReady : s.phase === 'ready' ? 1 : 0;
    const face = $('arcadePulseFace'), q = (Math.round(ready * 40) / 40).toFixed(3);
    if (face.dataset.q !== q) { face.dataset.q = q; face.style.setProperty('--ready', q); face.classList.toggle('ready', ready >= 1); }
    if (s.phase !== A.lastPhase) {
      const prev = A.lastPhase;
      A.lastPhase = s.phase;
      if (prev === 'ready' && s.phase === 'playing') syncRimButtons();
      if (s.phase === 'won' || s.phase === 'lost') {
        releaseInput();
        syncRimButtons();
        clearTimeout(A.resultTimer);
        // the last moment plays out on screen, then the result card appears
        A.resultTimer = setTimeout(() => { if (A.game && A.state === 'ARCADE_ACTIVE') showPanel('result'); }, speed() ? 900 : 200);
      }
    }
  }
  // a call, an alarm, the screen going off, EYES leaving the foreground: the round pauses safely
  function watchdog() {
    const h = host();
    const blocked = h ? h.blocked() : '';
    if (blocked === 'alert' || blocked === 'hidden') {
      const s = A.game && A.game.status();
      if (s && (s.phase === 'playing' || s.phase === 'ready') && !s.paused) pauseGame(blocked === 'alert' ? 'call' : 'hidden');
      else stopLoop();
      return true;
    }
    return false;
  }

  // ---------- the ability's life ----------
  function go(state, reason) {
    if (!A.api) return false;
    if (!A.api.go(state, reason)) return false;
    A.state = state;
    const stage = $('arcade'); if (stage) stage.dataset.state = state;
    return true;
  }
  const owned = () => !!A.api && A.state !== 'IDLE';
  function activate(api) {
    A.api = api;
    A.state = api.state();
    A.gen++;
    const gen = A.gen;
    A.stats.opened++;
    A.openedAt = ms();
    A.satAt = api.satellite();
    try { const d = EyesAbility.diagnostics(); const it = d.wheel.items.find((i) => i.id === 'arcade'); A.itemAt = it ? { x: it.x, y: it.y } : null; } catch { A.itemAt = null; }
    A.entry = A.entry || CATALOG[0];
    ensureDom();
    A.L = computeLayout(120, 96);
    A.reactions = []; A.ripples = []; A.sparkles = []; A.tracks = null; A.nervous = 0; A.mood = ''; A.watch = { x: 0, y: 0, until: 0, amount: 0 };
    A.rimPupil = { next: 0, until: 0, x: 0 };
    A.musicAtOpen = musicPlaying();
    A.panel = ''; A.lastPhase = '';
    releaseInput();
    placeDom();
    showStage(true);
    syncRimButtons();
    const d = planOpening();
    const loading = prepareGame(A.entry, gen);
    const ready = new Promise((r) => setTimeout(r, Math.max(0, d - 380 * speed())));
    Promise.all([loading, ready]).then(([game]) => {
      if (gen !== A.gen || !owned() || !game) { if (game) try { game.stop(); } catch {} return; }
      A.game = game;
      if (!go('ARCADE_ACTIVE', 'ready')) { closeNow('refused'); return; }
      setTimeout(() => { if (gen === A.gen && A.state === 'ARCADE_ACTIVE') planSteady(); }, Math.max(0, A.moveUntil - ms()));
      showPanel('title');
      if (A.musicAtOpen && !A.prefs.soundWithMusic) note('Game sound is off while your music plays.', 3200);
      kick();
    }).catch(() => { if (gen === A.gen && owned()) fail(); });
  }
  function fail() {
    stopLoop();
    if (A.game) { try { A.game.stop(); } catch {} A.game = null; }
    if (!go('ARCADE_ERROR', 'load')) { closeNow('error'); return; }
    planSteady();
    $('arcadeScreen').style.opacity = '1';
    showPanel('error');
  }
  function close_(reason, fast) {
    if (!owned() || A.state === 'ARCADE_CLOSING') return;
    const gen = ++A.gen;
    // the game stops at once: no loop, no input, no sound while he folds back up
    stopLoop();
    clearTimeout(A.resultTimer);
    releaseInput();
    if (A.game) { try { A.game.pause(); } catch {} }
    releaseAudio(true);
    showPanel('');
    $('arcadeRim').classList.remove('live');
    if (!go('ARCADE_CLOSING', reason)) { closeNow(reason); return; }
    A.mood = ''; A.nervous = 0; A.watch.until = 0;
    const d = planClosing(!!fast);
    setTimeout(() => { if (A.gen === gen && A.state === 'ARCADE_CLOSING') finish(reason); }, d + 20);
  }
  function closeNow(reason) { ++A.gen; finish(reason); }
  function finish(reason) {
    stopLoop();
    clearTimeout(A.resultTimer); clearTimeout(A.noteTimer);
    releaseInput();
    if (A.game) { try { A.game.stop(); } catch {} }
    A.game = null;
    releaseAudio(true);
    A.tracks = null; A.cur = null; A.reactions = []; A.ripples = []; A.sparkles = []; A.mood = ''; A.nervous = 0;
    A.state = 'IDLE';
    A.panel = '';
    A.stats.closed++;
    showStage(false);
    const api = A.api;
    A.api = null;
    if (api) api.done(reason);
  }
  function back() {
    if (!owned()) return false;
    if (A.state === 'ARCADE_CLOSING') return true;
    if (A.state === 'ARCADE_OPENING' || A.state === 'ARCADE_ERROR') { close_('back', true); return true; }
    const s = A.game && A.game.status();
    if (A.panel === 'help') { showPanel(A.panelFrom === 'pause' ? 'pause' : 'title'); return true; }
    if (s && (s.phase === 'playing' || s.phase === 'ready') && !s.paused) { pauseGame('back'); return true; }   // Back never throws a round away
    close_('back');
    return true;
  }
  function suspend(reason) {
    if (!owned()) return;
    if (A.state === 'ARCADE_CLOSING') { closeNow(reason); return; }
    pauseGame('hidden');
    stopLoop();
    releaseAudio(false);
  }
  function interrupt(reason) {
    if (!owned()) return;
    closeNow(reason);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { releaseInput(); stopLoop(); releaseAudio(false); return; }
    if (owned() && A.state === 'ARCADE_ACTIVE' && A.game && A.game.wantsFrames()) kick();
  });
  addEventListener('blur', () => { if (owned()) releaseInput(); });
  addEventListener('pagehide', () => { if (owned()) suspend('pagehide'); });
  addEventListener('resize', () => {
    if (!owned() || !A.L) return;
    const L = computeLayout(120, 96);
    if (L.key === A.L.key) return;
    // a rotation or a fold: pause first, then rebuild the cabinet for the new shape
    pauseGame('resize');
    A.L = L;
    placeDom();
    if (A.game) { A.game.resize(L.scale); A.game.render(1); }
    if (A.state === 'ARCADE_ACTIVE') planSteady();
    if (A.panel === 'title' || !A.panel) kick();
  });

  function available() {
    if (window.EYES_WEB && !window.EYES_IOS_ABILITIES) return false;
    try { if (localStorage.getItem('eyes.arcade.off') === '1') return false; } catch {}
    return true;
  }

  window.EyesArcade = {
    defineGame(id, factory) { if (typeof factory === 'function' && !factories.has(id)) factories.set(id, factory); },
    catalog: () => CATALOG.map((g) => ({ id: g.id, title: g.title })),
    diagnostics: () => ({
      state: A.state, panel: A.panel, game: A.game ? A.game.status() : null, loop: !!A.raf,
      layout: A.L ? { portrait: A.L.portrait, scale: A.L.scale, ap: A.L.ap, screen: A.L.screen, zones: A.L.zones, stick: A.L.stick, pulse: A.L.pulse, pause: A.L.pause, rx: A.L.rx, ry: A.L.ry } : null,
      audio: A.audio ? A.audio.ctx.state : 'none', sound: soundOn(), musicAtOpen: A.musicAtOpen,
      loaded: [...loaded.keys()].filter((k) => loaded.get(k) === 'ok'), defined: [...factories.keys()],
      stats: JSON.parse(JSON.stringify(A.stats)), dir: currentDir(), stickHeld: !!A.stick
    }),
    _debug: { game: () => A.game, react, onGameEvent, layout: computeLayout }
  };

  const register = () => window.EyesAbility && EyesAbility.register({
    id: 'arcade',
    label: 'Arcade',
    icon: ICON,
    available,
    entry: 'ARCADE_OPENING',
    states: {
      ARCADE_OPENING: ['ARCADE_ACTIVE', 'ARCADE_CLOSING', 'ARCADE_ERROR'],
      ARCADE_ACTIVE: ['ARCADE_CLOSING', 'ARCADE_ERROR'],
      ARCADE_ERROR: ['ARCADE_CLOSING'],
      ARCADE_CLOSING: []
    },
    activate, pose, fps, frame, back, interrupt, suspend
  });
  if (!register()) addEventListener('DOMContentLoaded', register, { once: true });
})();
