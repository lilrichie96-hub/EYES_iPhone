/* HAVEN Awakening: how a HAVEN is born. Plays once, the first time HAVEN opens without an eye of its own
   (new installs and existing HAVENs after this update). Hold to wake it: a heartbeat, tendrils, a cocoon
   that cracks and shatters, then the eye forms, wakes, finds you, and reveals its name and rarity.
   The seed is saved the moment it is born, so closing HAVEN never rerolls it. Only haven.dna.v1 is written;
   the home layout, apps, dock, folders and settings are never touched.
   Settings > Your HAVEN shows the birth card again. */
(function () {
'use strict';
if (!window.HavenDNA) return;
const { TAU, clamp, mix, ease, rng, makeDNA, buildPattern, rgbToHsl, hslToRgb, col, lift, tierLabel, originLine, GLINTS } = HavenDNA.lib;

// Styles live in awakening.css (HAVEN's content policy only allows its own stylesheet files).
const host = document.createElement('div');
host.id = 'awaken';
host.setAttribute('role', 'dialog');
host.setAttribute('aria-label', 'Your Eye is waking up');
host.innerHTML = '\n  <canvas id="awCanvas"></canvas>\n  <button id="awMute" class="ghost" data-aw="mute" type="button">sound on</button>\n  <p class="awText" id="awHint">hold to wake it</p>\n  <p class="awText" id="awName"></p>\n  <p class="awText" id="awMeta"></p>\n  <div id="awActions">\n    <div class="row2" id="awChoose"><button id="awKeep" data-aw="keep" type="button">Keep the name</button><button class="ghost" data-aw="rename" type="button">Rename</button></div>\n    <div class="row2" id="awEvo"><button data-aw="keep" type="button">See its card</button><button class="ghost" data-aw="enter" type="button">Continue</button></div>\n    <div class="row2" id="awRename"><input id="awInput" maxlength="14" autocomplete="off" enterkeyhint="done"><button data-aw="renameOk" type="button">Done</button></div>\n  </div>\n  <div id="birth">\n    <div>\n      <div class="bcard" id="bcard">\n        <div class="btop"><span class="bmark">Eye.D.</span><span id="bId"></span></div>\n        <canvas id="bEye"></canvas>\n        <p class="bname" id="bName"></p>\n        <p class="bwords" id="bWords"></p>\n        <p class="borigin" id="bOrigin"></p>\n        <div class="bgrid">\n          <div><span>BORN</span><b id="bBorn"></b></div>\n          <div><span>RARITY</span><b id="bTier"></b></div>\n          <div><span>IRIS</span><b id="bIris"></b></div>\n          <div><span>PUPIL</span><b id="bPupil"></b></div>\n          <div><span>STAGE</span><b id="bStage"></b></div>\n          <div><span>TOGETHER</span><b id="bDays"></b></div>\n        </div>\n        <div class="bquirks" id="bQuirks"></div>\n        <div class="bnext" id="bNext"></div>\n        <div class="btraits" id="bTraits"></div>\n        <div class="bsig" id="bSig" aria-hidden="true"></div>\n        <div class="bissuer"><span>Identification record</span><span>FRAY</span></div>\n      </div>\n      <div class="bactions"><button id="bEnter" data-aw="enter" type="button">Enter EYES</button></div>\n    </div>\n  </div>\n';
document.body.appendChild(host);

// ---------- a living eye ----------
class Eye {
  constructor(dna, canvas) {
    this.dna = dna;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pattern = buildPattern(dna);
    const r = rng(dna.seed ^ 0x9e3779b9);
    this.r = r;
    // "caught mid-something": every eye starts off looking away
    const a = r() * TAU;
    this.gaze = { x: Math.cos(a) * 0.8, y: Math.sin(a) * 0.5, vx: 0, vy: 0 };
    this.target = { x: this.gaze.x, y: this.gaze.y };
    this.nextDart = 0.5 + r() * 1.2;
    this.nextBlink = 1 + r() * dna.motion.blinkEvery;
    this.blinkT = -1; this.blinkQueue = 0;
    this.pupil = 1; this.pupilV = 0; this.pupilGoal = 1;
    this.mood = { squint: 0, wide: 0 };
    this.moodGoal = { squint: 0, wide: 0 };
    this.follow = null; this.reactUntil = 0;
    this.t0 = performance.now() / 1000 + r() * 100;
    this.last = null;
    this.auto = true;   // false while a script (the Awakening) drives it
    this.rv = null;     // reveal amounts while it is being born; null = fully formed
    this.sweep = -1;    // glass shine sweep progress
    this.dartBurst = 0;
    this.lidK = 1;      // 0 while it forms: no lids yet
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || 160;
    if (this.canvas.width !== Math.round(w * dpr)) {
      this.canvas.width = this.canvas.height = Math.round(w * dpr);
    }
  }
  poke(px, py, t) {
    // px,py in -1..1 relative to the eye
    const T = this.dna.T, m = this.dna.motion;
    this.blinkQueue = 0;
    this.pupilV -= 3.5 * (0.4 + T.drama);                        // startle: pupil snaps small
    this.moodGoal.wide = 0.6 + T.drama * 0.4;
    this.setTarget(px, py);
    this.reactUntil = t + 1.4;
    const r = this.r;
    clearTimeout(this.reactTimer);
    this.reactTimer = setTimeout(() => {
      const now = performance.now() / 1000;
      this.moodGoal.wide = 0;
      const k = this.dna.firstWord;
      if (k === 'shy' || (T.shyness > 0.7 && r() < 0.7)) {          // looks away, lids drop
        this.setTarget(-px * 0.9 || 0.8, 0.45);
        this.moodGoal.squint = 0.35;
        this.reactUntil = now + 1.6;
      } else if (k === 'grumpy' || k === 'smug') {                   // unimpressed squint, slow blink
        this.moodGoal.squint = 0.55;
        this.blinkT = now; this.slowBlink = true;
        this.reactUntil = now + 1.8;
      } else if (k === 'hyper') {                                    // quick darts
        this.reactUntil = now + 1.2;
        this.nextDart = 0;
        this.dartBurst = 4;
      } else if (k === 'curious') {                                  // leans in, dilates
        this.pupilGoal = 1 + m.dilate;
        this.reactUntil = now + 2;
      } else if (k === 'dramatic') {                                 // double blink, big pupil swing
        this.blinkT = now; this.blinkQueue = 1;
        this.pupilGoal = 1 + m.dilate * 1.3;
      } else {
        this.blinkT = now;
      }
      setTimeout(() => { this.moodGoal.squint = 0; this.pupilGoal = 1; }, 2200);
    }, 520);
  }
  setTarget(x, y) {
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.target.x = x; this.target.y = y;
  }
  step(t, dt) {
    const d = this.dna, m = d.motion, r = this.r;
    // glances
    if (this.follow) {
      this.setTarget(this.follow.x, this.follow.y);
    } else if (this.auto && t > this.reactUntil && t > this.nextDart) {
      if (this.dartBurst > 0) {
        this.dartBurst--;
        this.setTarget((r() - 0.5) * 1.6, (r() - 0.5) * 1.2);
        this.nextDart = t + 0.12 + r() * 0.12;
      } else {
        const home = r() < 0.45;                                     // often comes back to centre (you)
        const reach = m.reach * (d.T.shyness > 0.65 ? 1.1 : 1);
        if (home) this.setTarget((r() - 0.5) * 0.15, (r() - 0.5) * 0.12);
        else { const a = r() * TAU, rad = mix(0.3, 1, r()) * reach; this.setTarget(Math.cos(a) * rad, Math.sin(a) * rad * 0.75); }
        this.nextDart = t + m.dartEvery * mix(0.4, 1.6, r());
        if (r() < 0.25 * d.T.curiosity) this.pupilV += 1.2;          // a flicker of interest
      }
    }
    // spring toward target (snap, overshoot, settle)
    const k = m.spring, c = 2 * Math.sqrt(k) * m.bounce;
    for (const ax of ['x', 'y']) {
      const v = ax === 'x' ? 'vx' : 'vy';
      const a = k * (this.target[ax] - this.gaze[ax]) - c * this.gaze[v];
      this.gaze[v] += a * dt; this.gaze[ax] += this.gaze[v] * dt;
    }
    // pupil: breathing + goal, springy
    const breathe = Math.sin(t * 0.9) * 0.025;
    const pa = 60 * (this.pupilGoal + breathe - this.pupil) - 9 * this.pupilV;
    this.pupilV += pa * dt; this.pupil += this.pupilV * dt;
    this.pupil = clamp(this.pupil, 0.45, 1.7);
    for (const key of ['squint', 'wide']) this.mood[key] += (this.moodGoal[key] - this.mood[key]) * Math.min(1, dt * 6);
    // blinks
    if (this.auto && this.blinkT < 0 && t > this.nextBlink) {
      this.blinkT = t;
      this.blinkQueue = r() < m.doubleBlink ? 1 : 0;
      this.nextBlink = t + m.blinkEvery * mix(0.5, 1.5, r());
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      const dur = (this.slowBlink ? m.blinkMs * 3.2 : m.blinkMs) / 1000;
      const u = (t - this.blinkT) / dur;
      if (u >= 1) {
        this.slowBlink = false;
        if (this.blinkQueue > 0) { this.blinkQueue--; this.blinkT = t + 0.06; } else this.blinkT = -1;
      } else if (u >= 0) blink = u < 0.42 ? ease(u / 0.42) : 1 - ease((u - 0.42) / 0.58);
    }
    this.blink = Math.max(blink, this.closeK || 0);
  }
  blinkNow(slow) { this.blinkT = performance.now() / 1000; this.slowBlink = !!slow; this.blinkQueue = 0; }
  rvk(k) { const v = this.rv ? clamp(this.rv[k]) : 1; return k === 'pattern' ? v * (this.dna.growthPattern || 1) : v; }
  // One renderer for every eye (eye-render.js): this class only decides where it looks, when it blinks,
  // how it feels and how much of it exists yet. The picture is the home screen's eye, exactly.
  draw(t) {
    const ctx = this.ctx, S = this.canvas.width;
    ctx.clearRect(0, 0, S, S);
    if (!window.HavenRender) return;
    const D = window.HavenDNA, mine = D && D.dna && D.dna();
    const d = mine && mine.seed === this.dna.seed ? mine : this.dna;     // this phone's eye: draw its grown self
    const blink = this.blink || 0, lk = this.lidK ?? 1;
    // lids as the home screen holds them: resting (DNA) + mood + a blink; none at all while it forms
    const rest = clamp(0.1 + (D ? D.lid(d) : 0) + this.mood.squint * 0.45 - this.mood.wide * 0.25, 0, 0.8) * lk;
    const follow = clamp(this.gaze.y * 0.1, -0.05, 0.1) * lk;
    const upper = clamp(mix(rest + follow, 1, blink)), lower = clamp(mix((0.02 + this.mood.squint * 0.18) * lk, 1, blink));
    // the faint idle tremble every eye has
    const jt = t * d.motion.jitterRate, j = d.motion.jitter * 3;
    const jx = (Math.sin(jt * 2.1) + Math.sin(jt * 3.7 + 1.3) * 0.5) * j, jy = (Math.sin(jt * 2.9 + 0.4) + Math.sin(jt * 4.3) * 0.5) * j;
    const look = D ? D.looks(d) : { pupil: 1 };
    const rv = this.rv ? (k) => clamp(this.rv[k]) : null;
    HavenRender.paintEye(ctx, {
      dna: d, cx: S / 2, cy: S / 2, size: S * 0.36,
      gaze: { x: this.gaze.x + jx, y: this.gaze.y + jy },
      lids: { upper, lower },
      pupilScale: look.pupil * this.pupil,
      t: t * 1000, light: 1, breathing: Math.sin((t * TAU) / 4.6),
      reveal: rv ? { body: rv('body'), iris: rv('iris'), pupil: rv('pupil'), pattern: rv('pattern'), glass: rv('glass'), rare: rv('rare') } : null,
      sweep: this.sweep,
      haloReach: 1.3                                                // its canvas is only so big
    });
  }
}


// ---------- sound: everything synthesized, nothing loaded ----------
const Sound = (() => {
  let ac = null, master = null, drone = null, muted = false, noiseBuf = null;
  function ensure() {
    if (muted) return null;
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = 0.8;
        const comp = ac.createDynamicsCompressor(); master.connect(comp).connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
    } catch { ac = null; }
    return ac;
  }
  const env = (g, t, a, peak, rel) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel); };
  function thump(k = 1) {
    const a = ensure(); if (!a) return; const t = a.currentTime;
    for (const [f0, f1, gain, off] of [[100, 40, 0.6, 0], [80, 34, 0.35, 0.13]]) {   // lub-dub
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.setValueAtTime(f0, t + off); o.frequency.exponentialRampToValueAtTime(f1, t + off + 0.2);
      env(g, t + off, 0.008, gain * k, 0.28); o.connect(g).connect(master); o.start(t + off); o.stop(t + off + 0.35);
    }
  }
  function noise(t, dur, type, f0, f1, peak, q = 1) {
    const src = a2().createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain(); env(g, t, 0.005, peak, dur);
    src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.05);
  }
  const a2 = () => ac;
  function crack() { const a = ensure(); if (!a) return; const t = a.currentTime; noise(t, 0.09, 'highpass', 2500, 5000, 0.35); noise(t + 0.02, 0.05, 'bandpass', 1400, 900, 0.25, 4); }
  function droneOn() {
    const a = ensure(); if (!a || drone) return;
    const g = a.createGain(); g.gain.value = 0.0001;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; f.Q.value = 6;
    const os = [55, 55.6, 82.6].map((hz, i) => { const o = a.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = hz; o.connect(f); o.start(); return o; });
    const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 0.4; lg.gain.value = 60; lfo.connect(lg).connect(f.frequency); lfo.start();
    f.connect(g).connect(master);
    drone = { g, f, os, lfo };
  }
  function droneSet(c) {
    if (!drone || !ac) return; const t = ac.currentTime;
    drone.g.gain.setTargetAtTime(0.03 + c * 0.16, t, 0.08);
    drone.f.frequency.setTargetAtTime(180 + c * c * 2600, t, 0.1);
    drone.os.forEach((o, i) => o.frequency.setTargetAtTime([55, 55.6, 82.6][i] * (1 + c * 0.9), t, 0.15));
  }
  function droneOff(fast) {
    if (!drone || !ac) return; const d = drone, t = ac.currentTime; drone = null;
    d.g.gain.setTargetAtTime(0.0001, t, fast ? 0.03 : 0.4);
    setTimeout(() => { d.os.forEach((o) => o.stop()); d.lfo.stop(); }, fast ? 300 : 2000);
  }
  function boom() {
    const a = ensure(); if (!a) return; const t = a.currentTime;
    noise(t, 1.4, 'lowpass', 6000, 90, 0.9);
    noise(t, 0.25, 'highpass', 3000, 8000, 0.4);
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(24, t + 1.2);
    env(g, t, 0.01, 0.9, 1.3); o.connect(g).connect(master); o.start(t); o.stop(t + 1.5);
  }
  function glitch() { const a = ensure(); if (!a) return; const t = a.currentTime; for (let i = 0; i < 5; i++) noise(t + i * 0.07 + Math.random() * 0.03, 0.035, 'bandpass', 800 + Math.random() * 3000, 600 + Math.random() * 2000, 0.18, 8); }
  function tone(t, hz, dur, peak, type = 'sine') { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = hz; env(g, t, 0.02, peak, dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.1); }
  function wake() { const a = ensure(); if (!a) return; const t = a.currentTime; tone(t, 330, 0.5, 0.12); tone(t + 0.08, 494, 0.7, 0.1); }
  function chime(tier) {
    const a = ensure(); if (!a) return; const t = a.currentTime;
    const sets = { common: [523], uncommon: [523, 659], rare: [523, 659, 784, 1047], mythic: [392, 523, 659, 784, 988, 1175, 1568] };
    sets[tier].forEach((hz, i) => { tone(t + i * 0.09, hz, tier === 'mythic' ? 2.4 : 1.4, 0.09); tone(t + i * 0.09, hz * 2.01, 1, 0.025, 'triangle'); });
    if (tier === 'mythic') { tone(t, 98, 3, 0.2, 'sawtooth'); noise(t, 2.5, 'bandpass', 2000, 9000, 0.12, 2); }
  }
  function tick() { const a = ensure(); if (!a) return; tone(a.currentTime, 1800 + Math.random() * 1400, 0.03, 0.025, 'square'); }
  function setMuted(m) { muted = m; if (m) droneOff(true); }
  return { ensure, thump, crack, droneOn, droneSet, droneOff, boom, glitch, wake, chime, tick, setMuted, get muted() { return muted; } };
})();


const Awaken = (() => {
  const box = host, cv = document.getElementById('awCanvas'), ctx = cv.getContext('2d');
  const hint = document.getElementById('awHint'), nameEl = document.getElementById('awName'), meta = document.getElementById('awMeta');
  const actions = document.getElementById('awActions');
  const off = document.createElement('canvas');
  let W = 0, H = 0, dpr = 1, running = false;
  let phase, pt0, charge, down, touch, entropy, dna, eye, parts, rings, flash, tierFx, cardEye, raf, last, held;
  let beat, beatKick, tendrils, veins, cracks, cracksShown, shards, glitchUntil;
  // 3.1: the lights you choose from, how you held it, night births, first touch, the flight home
  const DEFAULT_TINT = [150, 230, 236];
  const GLINT_LIST = [{ fam: 'warm', rgb: GLINTS.warm }, { fam: 'cool', rgb: GLINTS.cool }, { fam: 'strange', rgb: GLINTS.strange }];
  let tint = DEFAULT_TINT, night = false, stars = [], glints = [], glint = null, switched = false, seedFrom = null, seedAt = 0, g0 = 0;
  let hs = { presses: 0, holdTime: 0, move: 0, lastPt: null, holdStart: 0, tapAt: 0, tapMove: 0 }, homeMotes = [], fly = null, msgTok = 0;
  const now = () => performance.now() / 1000;
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr);
    const s = Math.round(Math.min(W, H * 0.62) * 1.0);
    off.width = off.height = s;
  }
  function setPhase(p) { phase = p; pt0 = now(); }
  function buzz(pattern) { if (navigator.vibrate) try { navigator.vibrate(pattern); } catch (e) {} }
  // tendrils that reach in from the dark, veins in the cocoon, the cracks it will break along
  function buildOrganics() {
    const r = Math.random;
    tendrils = Array.from({ length: 11 }, (_, i) => ({ a: (i / 11) * TAU + r() * 0.4, curl: (r() - 0.5) * 2.2, freq: 3 + r() * 4, speed: 1.5 + r() * 2.5, amp: 0.05 + r() * 0.07, w: 0.6 + r() * 1.4, delay: r() * 0.35 }));
    veins = Array.from({ length: 9 }, () => { let a = r() * TAU; const pts = [[0, 0]]; let rad = 0;
      while (rad < 0.95) { rad += 0.12 + r() * 0.1; a += (r() - 0.5) * 0.6; pts.push([Math.cos(a) * rad, Math.sin(a) * rad]); }
      return pts; });
    // cracks start partway out on the shell, run to the edge, sometimes split; they open in a scattered order
    const order = [0, 5, 2, 7, 4, 9, 1, 6, 3, 8];
    cracks = Array.from({ length: 10 }, (_, i) => {
      const a0 = (i / 10) * TAU + (r() - 0.5) * 0.5, r0 = 0.28 + r() * 0.32;
      let a = a0 + (r() - 0.5) * 0.9, x = Math.cos(a0) * r0, y = Math.sin(a0) * r0;
      const pts = [[x, y]];
      while (Math.hypot(x, y) < 1.08 && pts.length < 18) {
        a += (r() - 0.5) * 0.8; let dA = Math.atan2(y, x) - a; dA = Math.atan2(Math.sin(dA), Math.cos(dA)); a += dA * 0.2;
        const st = 0.06 + r() * 0.06; x += Math.cos(a) * st; y += Math.sin(a) * st; pts.push([x, y]);
      }
      const branches = [], nb = r() < 0.7 ? 1 + (r() < 0.4 ? 1 : 0) : 0;
      for (let b = 0; b < nb; b++) {
        const at = 1 + Math.floor(r() * Math.max(1, pts.length - 3));
        let [bx, by] = pts[at], ba = Math.atan2(by, bx) + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.6);
        const bp = [[bx, by]];
        for (let k = 0; k < 3 + Math.floor(r() * 4); k++) { ba += (r() - 0.5) * 0.9; const st = 0.04 + r() * 0.04; bx += Math.cos(ba) * st; by += Math.sin(ba) * st; bp.push([bx, by]); }
        branches.push({ at: at / (pts.length - 1), pts: bp });
      }
      return { pts, branches, born: 0, open: false, start: 0.62 + (order.indexOf(i) / 10) * 0.3 + r() * 0.02 };
    });
  }
  function blobR(th, t) { return 1 + 0.06 * Math.sin(3 * th + t * 1.3) + 0.045 * Math.sin(5 * th - t * 2.1) + 0.03 * Math.sin(8 * th + t * 0.8); }
  function cocoonSize(t) {
    const base = off.width * 0.22 * ease(clamp((charge - 0.18) / 0.55)) * (phase === 'evolve' ? 1.85 : 1);
    let s = base * (1 + beatKick * 0.07);
    if (phase === 'break') {          // the held breath: it squeezes in, then bulges just before it bursts
      const u = (t - pt0) / 0.55;
      s *= u < 0.75 ? 1 - 0.16 * ease(clamp(u / 0.75)) : mix(0.84, 1.1, ease(clamp((u - 0.75) / 0.25)));
    }
    return s;
  }
  const crackGrowth = (c) => clamp((charge - c.start) / 0.16);
  function chips(c, t) {   // tiny flakes knocked off where a crack starts
    const R0 = cocoonSize(t), q = c.pts[Math.min(c.pts.length - 1, 3)], x0 = W / 2 + q[0] * R0, y0 = H * 0.42 + q[1] * R0;
    for (let i = 0; i < 6; i++) {
      const a = Math.atan2(q[1], q[0]) + (Math.random() - 0.5) * 1.2, v = (60 + Math.random() * 120) * dpr;
      parts.push({ x: x0, y: y0, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40 * dpr, life: 0.7 + Math.random() * 0.5, age: 0, rgb: lift(tint, 0.6), s: (0.7 + Math.random()) * dpr, out: true, drag: 2.5, grav: 260 * dpr });
    }
  }
  function crackPts(pts, g) {
    const n = pts.length - 1, m = g * n, out = [pts[0]];
    for (let i = 1; i <= n; i++) { if (i <= m) out.push(pts[i]); else { const f = m - (i - 1); if (f > 0) out.push([mix(pts[i - 1][0], pts[i][0], f), mix(pts[i - 1][1], pts[i][1], f)]); break; } }
    return out;
  }
  function blobPath(x, y, R0, t) { ctx.beginPath(); for (let i = 0; i <= 64; i++) { const th = (i / 64) * TAU, rr = R0 * blobR(th, t); i ? ctx.lineTo(x + Math.cos(th) * rr, y + Math.sin(th) * rr) : ctx.moveTo(x + Math.cos(th) * rr, y + Math.sin(th) * rr); } ctx.closePath(); }
  // light bleeding out of the gaps, a dark lip, a hot thin core that tapers to the tip
  function drawCracks(t, x, y, R0) {
    const bp = phase === 'break' ? clamp((t - pt0) / 0.55) : 0, lines = [];
    cracks.forEach((c, i) => {
      const g = phase === 'evolve' ? (i < cracksShown ? clamp((t - c.born) / 0.4) : 0) : crackGrowth(c);
      if (g <= 0) return;
      lines.push({ pts: crackPts(c.pts, g), w: 1 });
      for (const b of c.branches) { const gb = clamp((g - b.at) / (1 - b.at + 0.001)); if (gb > 0) lines.push({ pts: crackPts(b.pts, gb), w: 0.6 }); }
    });
    if (!lines.length) return;
    const P = (q) => [x + q[0] * R0, y + q[1] * R0];
    const stroke = (L, width) => { ctx.beginPath(); L.pts.forEach((q, j) => { const [px, py] = P(q); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.lineWidth = width * dpr; ctx.stroke(); };
    ctx.save(); blobPath(x, y, R0, t); ctx.clip(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lines) { ctx.strokeStyle = col(tint, 1, (0.1 + bp * 0.25) * L.w); stroke(L, (5 + bp * 7) * L.w); ctx.strokeStyle = col(lift(tint, 0.3), 1, (0.18 + bp * 0.3) * L.w); stroke(L, (2.8 + bp * 3) * L.w); }
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = 'rgba(2,6,8,0.85)';
    for (const L of lines) stroke(L, 3.2 * L.w);
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lines) {
      const n = L.pts.length - 1;
      for (let j = 1; j <= n; j++) {
        const [ax, ay] = P(L.pts[j - 1]), [bx, by] = P(L.pts[j]), u = j / Math.max(1, n);
        ctx.strokeStyle = col(lift(tint, mix(0.85, 0.45, u)), 1, 0.95); ctx.lineWidth = mix(1.6, 0.5, u) * (L.w < 1 ? 0.75 : 1) * (1 + bp * 0.5) * dpr;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function heartbeat(t, dt) {
    const bpm = (phase === 'dark' ? 38 : mix(52, 168, charge * charge)) * (night ? 0.8 : 1);   // night births beat slower
    beat += dt * bpm / 60;
    if (beat >= 1) {
      beat -= 1; beatKick = 1;
      if (phase === 'gather') { Sound.thump(0.4 + charge * 0.8); buzz(charge > 0.6 ? [18, 90, 12] : [10]); rings.push({ t, rgb: tint, speed: 0.25 + charge * 0.35, w: 1.5 + charge * 3, small: true }); }
    }
    beatKick = Math.max(0, beatKick - dt * 5);
  }
  function shatter() {
    const cx = W / 2, cy = H * 0.42, R0 = cocoonSize(now()) || off.width * 0.22, t = now();
    const cuts = cracks.map((c) => { const e = c.pts[c.pts.length - 1]; return (Math.atan2(e[1], e[0]) + TAU) % TAU; });
    for (let i = 0; i < 6; i++) cuts.push(Math.random() * TAU);
    cuts.sort((a, b) => a - b); const n = cuts.length;
    for (let i = 0; i < n; i++) {
      const a0 = cuts[i], a1 = i + 1 < n ? cuts[i + 1] : cuts[0] + TAU;
      const pts = [[0, 0]];
      for (let k = 0; k <= 3; k++) { const a = mix(a0, a1, k / 3), rr = R0 * blobR(a, t); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      const mx = pts.reduce((s, q) => s + q[0], 0) / pts.length, my = pts.reduce((s, q) => s + q[1], 0) / pts.length;
      const ang = Math.atan2(my, mx), v = (500 + Math.random() * 900) * dpr;
      shards.push({ x: cx + mx, y: cy + my, pts: pts.map((q) => [q[0] - mx, q[1] - my]), vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, rot: 0, vr: (Math.random() - 0.5) * 9, age: 0 });
    }
  }
  function fnv(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function start() {
    box.classList.add('open'); document.getElementById('birth').classList.remove('open');
    document.getElementById('bEnter').textContent = 'Enter EYES';
    size();
    charge = 0; down = false; touch = { x: W / 2, y: H / 2 }; entropy = []; parts = []; rings = []; flash = 0; tierFx = null; held = 0;
    dna = null; eye = null;
    beat = 0; beatKick = 0; shards = []; cracksShown = 0; glitchUntil = 0;
    buildOrganics();
    nameEl.className = 'awText'; nameEl.style.opacity = 0; nameEl.innerHTML = '';
    meta.style.opacity = 0; actions.classList.remove('show');
    document.getElementById('awChoose').style.display = 'flex'; document.getElementById('awRename').style.display = 'none';
    document.getElementById('awEvo').style.display = 'none';
    box.style.background = '';
    tint = DEFAULT_TINT; const hr = new Date().getHours(); night = hr >= 21 || hr < 6;
    stars = night ? Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.2, ph: Math.random() * TAU, sp: 0.5 + Math.random() * 1.5 })) : [];
    glints = GLINT_LIST.map((g, i) => ({ ...g, ph: i * 2.1, sp: 0.13 + i * 0.03, gone: 0, chosen: 0, dim: 0, goneAt: null }));
    glint = null; switched = false; seedFrom = null; seedAt = 0; g0 = now(); homeMotes = []; fly = null;
    hs = { presses: 0, holdTime: 0, move: 0, lastPt: null, holdStart: 0, tapAt: 0, tapMove: 0 };
    msgTok = Math.random();
    hint.textContent = 'something is drifting in the dark…'; hint.style.opacity = 0;
    setPhase('glints');
    later(700, 'glints', () => { hint.style.opacity = 1; });
    later(2600, 'glints', () => say('three lights are drifting'));
    later(5000, 'glints', () => say('touch the one that pulls at you'));
    later(16000, 'glints', () => say('take your time…'));
    later(24000, 'glints', () => say('or wait, and it will choose for itself'));
    later(34000, 'glints', () => {            // nobody chose: a plain seed, no colour nudge
      const t = now(); glints.forEach((o) => { o.gone = t; o.goneAt = glintPos(o, t); });
      setPhase('dark'); say('it chose for itself'); later(2200, 'dark', () => say('hold to wake it'));
    });
    if (!running) { running = true; last = now(); raf = requestAnimationFrame(loop); }
  }
  function later(ms, ph, fn) { const tok = msgTok; setTimeout(() => { if (msgTok === tok && running && (!ph || phase === ph)) fn(); }, ms); }
  function say(txt) { hint.style.opacity = 0; const tok = msgTok; setTimeout(() => { if (msgTok !== tok) return; hint.textContent = txt; hint.style.opacity = 1; }, 450); }
  function glintPos(g, t) { const a = (t - g0) * g.sp + g.ph; return { x: W / 2 + Math.cos(a) * W * 0.28 + Math.sin(a * 1.7) * W * 0.05, y: H * 0.42 + Math.sin(a * 1.3) * H * 0.16 }; }
  function seedPos(t) {
    const cx = W / 2, cy = H * 0.42;
    if (!seedFrom) return { x: cx, y: cy };
    const u = ease(clamp((t - seedAt) / 1.5));
    return { x: mix(seedFrom.x, cx, u), y: mix(seedFrom.y, cy, u) - Math.sin(u * Math.PI) * 30 * dpr };
  }
  function hitGlint(p, t, ok) { for (const g of glints) { if (!ok(g)) continue; const q = glintPos(g, t); if (Math.hypot(p.x - q.x, p.y - q.y) < 64 * dpr) return g; } return null; }
  function pickGlint(g, t) {
    const first = !glint;
    if (!first) { const old = glints.find((o) => o.fam === glint); old.goneAt = seedPos(t); old.chosen = 0; old.gone = t; switched = true; }
    seedFrom = glintPos(g, t); glint = g.fam; g.chosen = t; g.dim = 0; seedAt = t; tint = g.rgb;
    Sound.ensure(); Sound.tick(); buzz([10]);
    if (first) {
      glints.forEach((o) => { if (o !== g) o.dim = t; });
      setPhase('dark'); say('it noticed you');
      later(2600, 'dark', () => { if (!switched) say('hold to wake it · or touch another light (once)'); });
    } else {
      glints.forEach((o) => { if (o !== g && !o.gone) { o.gone = t; o.goneAt = glintPos(o, t); } });
      say("changed your mind. it doesn't mind"); later(2200, 'dark', () => say('hold to wake it'));
    }
  }
  // how you held it: slow and still, restless, or quick jabs
  function readHold() {
    const span = Math.max(0.1, now() - hs.holdStart), movePerSec = hs.move / Math.max(0.2, hs.holdTime) / Math.max(1, W) * 100;
    if (hs.presses >= 4 && hs.holdTime / span < 0.7) return 'quick';
    if (movePerSec > 14 || hs.presses >= 3) return 'restless';
    return 'steady';
  }
  function eyeLocal(p) { const R = off.width * 0.36; return { x: clamp((p.x - W / 2) / (R * 1.6), -1, 1), y: clamp((p.y - H * 0.42) / (R * 1.6), -1, 1) }; }
  // the flight home: it shrinks into its place on the home screen
  function flyHome() {
    document.getElementById('birth').classList.remove('open'); cardEye = null;
    actions.classList.remove('show'); nameEl.style.opacity = 0; meta.style.opacity = 0; hint.style.opacity = 0;
    const s = Math.min(innerWidth * 0.235, 101, innerHeight * 0.125) * dpr / (off.width * 0.36);
    fly = { x: innerWidth * 0.5 * dpr, y: innerHeight * 0.49 * dpr, s };
    box.style.background = 'transparent';
    if (eye) { eye.follow = null; eye.reactUntil = Infinity; eye.setTarget(0, 0); eye.blinkNow(); }
    setPhase('home');
  }
  function stop() { box.classList.remove('cardOnly', 'evolving'); evo = null; idTaps = 0; box.style.background = ''; msgTok = Math.random();
    document.getElementById('awEvo').style.display = 'none'; document.getElementById('awChoose').style.display = 'flex'; Sound.droneOff(true); running = false; cancelAnimationFrame(raf); box.classList.remove('open'); cardEye = null; }

  // touch
  const pos = (e) => ({ x: e.clientX * dpr, y: e.clientY * dpr });
  function onDown(e) {
    const t = now(), p = pos(e);
    if (phase === 'glints') { const g = hitGlint(p, t, (o) => !o.gone); if (g) pickGlint(g, t); return; }
    if (phase === 'dark' && glint && !switched) { const g = hitGlint(p, t, (o) => !o.chosen && !o.gone); if (g) { pickGlint(g, t); return; } }
    if (phase === 'name' && eye) {          // first touch: it follows your finger; a tap gets a reaction
      down = true; touch = p; hs.tapAt = t; hs.tapMove = 0; hs.lastPt = p; eye.follow = eyeLocal(p);
      if (!eye._touchedAt) { eye._touchedAt = t; try { HavenDNA.note('pet'); } catch (err) {} }
      return;
    }
    if (phase !== 'dark' && phase !== 'gather') return;
    down = true; touch = p; entropy.push(e.timeStamp, e.clientX, e.clientY, e.pressure || 0);
    hs.presses++; hs.lastPt = p;
    if (phase === 'dark') { hs.holdStart = t; glints.forEach((o) => { if (!o.chosen && !o.gone) { o.gone = t; o.goneAt = glintPos(o, t); } }); }
    Sound.ensure(); Sound.droneOn();
    if (phase === 'dark') setPhase('gather');
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (err) {}
  }
  function onMove(e) {
    if (!down) return;
    const p = pos(e);
    if (hs.lastPt) { const d = Math.hypot(p.x - hs.lastPt.x, p.y - hs.lastPt.y); if (phase === 'gather') hs.move += d; hs.tapMove += d; }
    hs.lastPt = p; touch = p;
    if (phase === 'name' && eye) { eye.follow = eyeLocal(p); return; }
    if (entropy.length < 400) entropy.push(e.timeStamp % 997, e.clientX, e.clientY);
  }
  function onUp() {
    if (phase === 'name' && eye && down) {
      eye.follow = null; const t = now();
      if (t - hs.tapAt < 0.28 && hs.tapMove < 14 * dpr) { const q = eyeLocal(touch); eye.poke(q.x, q.y, t); }
    }
    down = false; hs.lastPt = null;
  }

  function birth() {
    // true randomness from the device, stirred with the rhythm of your hold
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0] ^ fnv(entropy.join(','))) >>> 0;
    const lean = { glint, hold: readHold(), night };   // the light you chose, how you held it, when
    dna = makeDNA(seed, lean);
    HavenDNA.adopt(seed, dna.name, lean);    // it is yours from this moment, even if HAVEN closes
    dna = HavenDNA.dna() || dna;             // as it is today: a hatchling
    eye = new Eye(dna, off);
    eye.auto = false;
    eye.rv = { body: 0, iris: 0, pattern: 0, pupil: 0, glass: 0, rare: 0 };
    eye.gaze.x = 0.4; eye.gaze.y = 0.3; eye.target = { x: 0.4, y: 0.3 };
    eye.pupil = 0.55; eye.pupilGoal = 0.6; eye.moodGoal.squint = 0.45; eye.mood.squint = 0.45; eye.lidK = 0;
    // its own colours spiral in and settle as its iris
    { const R = off.width * 0.36, irisR = R * 0.62 * dna.looks.irisSize, cols = [dna.accent, dna.accent2, lift(dna.accent, 0.5)], t0 = now();
      homeMotes = Array.from({ length: 150 }, (_, i) => ({ a: Math.random() * TAU, r: R * (1.5 + Math.random() * 0.9), target: irisR * (0.55 + Math.random() * 0.45),
        w: (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.4), delay: t0 + 0.2 + Math.random() * 0.7, rgb: cols[i % 3], s: (1 + Math.random() * 1.8) * dpr })); }
    eye.reactUntil = Infinity;
    flash = 1;
    shatter(); Sound.droneOff(true); Sound.boom(); buzz([60, 40, 120]); glitchUntil = now() + 0.7; setTimeout(() => Sound.glitch(), 120);
    rings.push({ t: now(), rgb: [230, 250, 255], speed: 1.25, w: 10 }, { t: now() + 0.08, rgb: tint, speed: 1.05, w: 6 }, { t: now() + 0.2, rgb: dna.accent, speed: 0.8, w: 4 });
    // the gathered light scatters outward
    for (const p of parts) { const a = Math.atan2(p.y - H / 2, p.x - W / 2); p.vx = Math.cos(a) * (600 + Math.random() * 900) * dpr; p.vy = Math.sin(a) * (600 + Math.random() * 900) * dpr; p.out = true; }
    hint.style.opacity = 0;
    setPhase('form');
  }

  function burst(n, colors, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = (0.35 + Math.random()) * speed * dpr;
      const c = colors[Math.floor(Math.random() * colors.length)];
      parts.push({ x: W / 2 + Math.cos(a) * off.width * 0.3, y: H * 0.42 + Math.sin(a) * off.width * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life, age: 0, rgb: c, s: (1 + Math.random() * 2.2) * dpr, out: true, sparkle: true, drag: 1.6 });
    }
  }

  function firstAct() {
    const e = eye, T = dna.T, m = dna.motion, k = dna.firstWord, t = now();
    e.auto = true; e.reactUntil = t + 2.6;
    const later = (ms, f) => setTimeout(() => { if (eye === e) f(); }, ms);
    if (k === 'shy') { e.setTarget(0.85, 0.4); e.moodGoal.squint = 0.3; later(1300, () => e.setTarget(0.25, 0.1)); later(2300, () => { e.setTarget(0, 0); e.moodGoal.squint = 0; }); }
    else if (k === 'hyper') { e.reactUntil = 0; e.nextDart = 0; e.dartBurst = 6; }
    else if (k === 'curious') { e.pupilGoal = 1 + m.dilate * 1.3; e.moodGoal.wide = 0.5; later(2400, () => { e.pupilGoal = 1; e.moodGoal.wide = 0; }); }
    else if (k === 'grumpy' || k === 'smug') { e.moodGoal.squint = 0.55; e.blinkNow(true); later(2400, () => e.moodGoal.squint = 0); }
    else if (k === 'sleepy') { e.moodGoal.squint = 0.65; e.pupilGoal = 0.8; later(700, () => e.blinkNow(true)); later(2600, () => { e.moodGoal.squint = 0; e.pupilGoal = 1; }); }
    else if (k === 'dramatic') { e.blinkNow(); e.blinkQueue = 1; e.pupilGoal = 1 + m.dilate * 1.4; e.pupilV -= 3; later(2400, () => e.pupilGoal = 1); }
    else { e.blinkNow(true); }
  }

  const GLYPHS = '⟁⟟⌖⍜⏃⏚⟒⊑⋔⍀⌇⍙⎅⏁⊬⍾⟊⧖⧗⌬⎊ᚠᚢᚦᚱᚲ';
  function showName() {
    const letters = [...dna.name];
    nameEl.textContent = '';
    letters.forEach((ch, i) => { const sp = document.createElement('span'); sp.textContent = GLYPHS[(i * 7) % GLYPHS.length]; sp.style.transitionDelay = i * 0.06 + 's'; nameEl.appendChild(sp); });
    nameEl.style.opacity = 1;
    requestAnimationFrame(() => requestAnimationFrame(() => nameEl.classList.add('show')));
    const spans = [...nameEl.children], t0 = performance.now(), mine = dna;
    const dec = setInterval(() => {
      if (dna !== mine) return clearInterval(dec);
      const el = performance.now() - t0; let done = true;
      spans.forEach((sp, i) => {
        if (el > 450 + i * 140) sp.textContent = letters[i];
        else { done = false; sp.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; }
      });
      Sound.tick();
      if (done) clearInterval(dec);
    }, 55);
    meta.innerHTML = `<span class="t-${dna.tier}">${tierLabel(dna.tier)}</span> · ${dna.words.join(' · ')}`;
    setTimeout(() => { meta.style.opacity = 1; }, 700);
  }

  function step(t, dt) {
    const p = t - pt0;
    if (phase === 'dark' || phase === 'gather' || phase === 'break') heartbeat(t, dt);
    if (phase === 'gather' && down) hs.holdTime += dt;
    if (phase === 'break') { Sound.droneSet(1); if (p > 0.55) birth(); }
    else if (phase === 'home') { if (p > 1.3) { box.classList.remove('evolving'); stop(); } }
    else if (phase === 'dark') {
      if (p > 0.9 && !glints.length) hint.style.opacity = 1;
    } else if (phase === 'gather') {
      if (down) { charge = Math.min(1, charge + dt / 2.6); held += dt; }
      else charge = Math.max(0, charge - dt * 0.45);
      hint.style.opacity = 1;
      hint.textContent = down ? (charge > 0.75 ? 'almost…' : 'keep holding') : charge > 0 ? "don't let it fade" : 'hold to wake it';
      if (!down && charge === 0) { setPhase('dark'); Sound.droneOff(); }
      Sound.droneSet(charge);
      // cracks creep open with the charge and close again if you let go; each new one chips the shell
      for (const c of cracks) { const g = crackGrowth(c); if (g > 0 && !c.open) { c.open = true; Sound.crack(); buzz([22]); beatKick = 1; chips(c, t); } if (g <= 0) c.open = false; }
      // light drifts in from everywhere
      const rate = (down ? 30 + charge * 140 : 6) * dt;
      for (let i = 0; i < rate; i++) {
        const a = Math.random() * TAU, r = Math.max(W, H) * (0.45 + Math.random() * 0.3);
        parts.push({ x: W / 2 + Math.cos(a) * r, y: H * 0.42 + Math.sin(a) * r, vx: 0, vy: 0, life: 3, age: 0, rgb: lift(tint, 0.4), s: (0.8 + Math.random() * 1.6) * dpr, out: false });
      }
      if (charge >= 1) { setPhase('break'); hint.style.opacity = 0; buzz([30, 30, 30]); }
    } else if (phase === 'form') {
      const rv = eye.rv;
      eye.lidK = 0;      // born round; lids come with its first blink
      rv.body = (p - 0.05) / 0.7; rv.iris = (p - 0.75) / 0.9; rv.pupil = (p - 0.3) / 0.7; rv.pattern = (p - 1.1) / 1.4; rv.glass = (p - 1.9) / 0.5;
      eye.sweep = (p - 1.85) / 0.75;
      // groggy drift
      eye.setTarget(0.35 * Math.cos(p * 0.7), 0.25 + 0.1 * Math.sin(p * 0.9));
      if (p > 3.0) { eye.sweep = -1; setPhase('wake'); }
    } else if (phase === 'wake') {
      const k = (eye._k = eye._k || {});
      eye.lidK = ease(clamp((p - 0.15) / 0.5));        // lids knit in as it closes for the first time
      if (!k.b1 && p > 0.2) { k.b1 = 1; eye.blinkNow(true); }
      if (!k.fl && p > 0.65) { k.fl = 1; eye.moodGoal.squint = 0.7; }      // too bright: a squint
      if (!k.fl2 && p > 0.8) { k.fl2 = 1; eye.moodGoal.squint = 0.35; }
      if (!k.b2 && p > 1.0) { k.b2 = 1; eye.blinkNow(); eye.moodGoal.squint = 0.12; }
      if (!k.l && p > 1.25) { k.l = 1; eye.setTarget(-0.75, 0.05); }
      if (!k.r && p > 1.8) { k.r = 1; eye.setTarget(0.7, -0.08); }
      if (!k.f && p > 2.3) { k.f = 1; const q = eyeLocal(touch); eye.setTarget(q.x * 0.9, q.y * 0.9); eye.pupilGoal = 0.85; }   // where your finger was
      if (!k.c && p > 2.9) { k.c = 1; eye.setTarget(0, 0); eye.moodGoal.squint = 0.2; eye.pupilGoal = 0.62; eye.pupilV -= 2; }  // focus pulls tight…
      if (!k.c2 && p > 3.2) {   // …and it finds you
        k.c2 = 1; Sound.wake(); eye.moodGoal.squint = 0; eye.moodGoal.wide = 0.55;
        eye.pupilV += 5; eye.pupilGoal = 1 + dna.motion.dilate * 0.8;
        rings.push({ t, rgb: dna.accent, speed: 0.55, w: 3 }); buzz([15]);
      }
      if (p > 4.0) { eye.moodGoal.wide = 0; eye.pupilGoal = 1; setPhase('reveal'); revealStart(t); }
    } else if (phase === 'reveal') {
      eye.rv.rare = p / 0.9;
      if (p > (dna.tier === 'mythic' ? 2.4 : dna.tier === 'rare' ? 1.8 : 1.2)) { eye.rv = null; setPhase('name'); showName(); }
    } else if (phase === 'name') {
      if (!eye._acted && p > 1.1) { eye._acted = true; firstAct(); }
      if (!eye._hello && p > 2.0) { eye._hello = true; hint.textContent = 'say hello · touch it'; hint.style.opacity = 1; }
      const ready = eye._touchedAt ? Math.max(eye._touchedAt + 2.4, pt0 + 3) : pt0 + 7.5;
      if (t > ready && !down && !actions.classList.contains('show')) {
        hint.style.opacity = 0;
        document.getElementById('awKeep').textContent = `Keep "${dna.name}"`;
        actions.classList.add('show');
      }
    }
    if (phase === 'evolve') stepEvolve(t, p, dt);
    if (eye) eye.step(t, dt);
  }

  function revealStart(t) {
    const A = dna.accent, B = dna.accent2;
    tierFx = { tier: dna.tier, t };
    Sound.chime(dna.tier);
    if (dna.tier === 'common') rings.push({ t, rgb: A, speed: 0.7, w: 3 });
    else if (dna.tier === 'uncommon') { rings.push({ t, rgb: A, speed: 0.75, w: 3 }, { t: t + 0.25, rgb: B, speed: 0.65, w: 3 }); burst(40, [A, B], 260, 1.6); }
    else if (dna.tier === 'rare') { rings.push({ t, rgb: [160, 195, 255], speed: 1, w: 6 }, { t: t + 0.2, rgb: B, speed: 0.8, w: 4 }); burst(110, [A, B, [190, 215, 255], [255, 255, 255]], 520, 2.2); flash = 0.35; }
    else { rings.push({ t, rgb: [255, 214, 140], speed: 1.3, w: 12 }, { t: t + 0.18, rgb: [255, 240, 200], speed: 1, w: 6 }, { t: t + 0.4, rgb: B, speed: 0.75, w: 4 });
      burst(240, [[255, 207, 122], [255, 236, 190], A, B], 780, 3); flash = 0.7; }
  }

  function drawOrganics(t, x, y) {
    const cx = W / 2, cy = H * 0.42, far = Math.max(W, H) * 0.62;
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    // tendrils reach for the light
    for (const td of tendrils) {
      const reach = ease(clamp((charge - td.delay * 0.4) / 0.85));
      if (reach <= 0.01) continue;
      const ox = cx + Math.cos(td.a) * far, oy = cy + Math.sin(td.a) * far;
      const nx = -Math.sin(td.a), ny = Math.cos(td.a);
      ctx.beginPath();
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const u = (i / steps) * reach;                       // 0 at the edge, 1 at the light
        const bend = Math.sin(u * Math.PI) * td.curl * far * 0.18;
        const wig = Math.sin(u * td.freq * TAU - t * td.speed) * td.amp * far * (1 - u) * (0.6 + charge);
        const px = mix(ox, cx, u) + nx * (bend + wig), py = mix(oy, cy, u) + ny * (bend + wig);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.strokeStyle = col(tint, 1, 0.1 + charge * 0.35 + beatKick * 0.15);
      ctx.lineWidth = td.w * dpr * (1 + charge);
      ctx.stroke();
    }
    // the cocoon
    const R0 = cocoonSize(t);
    if (R0 > 2) {
      blobPath(x, y, R0, t);
      const g = ctx.createRadialGradient(x, y, R0 * 0.1, x, y, R0 * 1.1);
      g.addColorStop(0, col(lift(tint, 0.2), 1, 0.18 + beatKick * 0.1)); g.addColorStop(0.7, col(tint, 0.42, 0.12)); g.addColorStop(1, col(tint, 0.9, 0.28));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = col(lift(tint, 0.35), 1, 0.35 + beatKick * 0.3); ctx.lineWidth = 1.6 * dpr; ctx.stroke();
      ctx.strokeStyle = col(tint, 1, 0.07 + beatKick * 0.06); ctx.lineWidth = 0.8 * dpr;     // faint veins, so they never read as cracks
      for (const v of veins) { ctx.beginPath(); v.forEach(([vx, vy], j) => { const px = x + vx * R0, py = y + vy * R0; j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); }
      drawCracks(t, x, y, R0);
    }
  }

  function drawGlints(t) {
    ctx.globalCompositeOperation = 'lighter';
    for (const g of glints) {
      if (g.chosen && t - g.chosen > 1.5) continue;             // it has become the seed
      const q = g.chosen ? seedPos(t) : g.goneAt || glintPos(g, t);
      let a = (0.6 + 0.4 * Math.sin(t * 1.4 + g.ph)) * clamp((t - g0 - 0.4) / 2.5), r = 13 * dpr;
      if (g.dim) a *= mix(1, 0.4, clamp((t - g.dim) / 0.8));
      if (g.gone) a *= clamp(1 - (t - g.gone) / 0.8);
      if (g.chosen) { const u = clamp((t - g.chosen) / 1.5); r = (13 + Math.sin(u * Math.PI) * 18) * dpr; a = Math.max(a, 0.9); }
      if (a <= 0.01) continue;
      const gr = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 5);
      gr.addColorStop(0, col(g.rgb, 1, 0.9 * a)); gr.addColorStop(0.2, col(g.rgb, 1, 0.35 * a)); gr.addColorStop(1, col(g.rgb, 1, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(q.x, q.y, r * 5, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(q.x, q.y, 3.4 * dpr, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function draw(t) {
    const p = t - pt0, cx = W / 2, cy = H * 0.42;
    ctx.globalCompositeOperation = 'source-over';
    const homeU = phase === 'home' ? ease(clamp(p / 0.9)) : 0;
    if (phase === 'home') { ctx.clearRect(0, 0, W, H); ctx.fillStyle = `rgba(0,0,0,${1 - homeU})`; } else ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // night births: faint stars behind everything
    if (stars.length && phase !== 'card' && phase !== 'evolve') {
      for (const st of stars) { const a = (0.18 + 0.32 * (0.5 + 0.5 * Math.sin(t * st.sp + st.ph))) * (1 - homeU); ctx.fillStyle = `rgba(220,232,255,${a})`; ctx.beginPath(); ctx.arc(st.x * W, st.y * H, st.s * dpr, 0, TAU); ctx.fill(); }
    }
    // the three lights
    if (glints.length && (phase === 'glints' || phase === 'dark' || phase === 'gather')) drawGlints(t);
    // mythic and rare: the room itself glows
    if (tierFx && (tierFx.tier === 'mythic' || tierFx.tier === 'rare')) {
      const u = clamp((t - tierFx.t) / 1.2), br = 0.5 + 0.5 * Math.sin(t * 1.4);
      const rgb = tierFx.tier === 'mythic' ? [255, 196, 110] : [120, 160, 255];
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
      g.addColorStop(0, col(rgb, 1, (0.16 + br * 0.08) * u)); g.addColorStop(1, col(rgb, 1, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (tierFx.tier === 'mythic') {           // slow light beams behind the eye
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.12); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 12; i++) {
          ctx.rotate(TAU / 12);
          const g2 = ctx.createLinearGradient(0, 0, Math.max(W, H) * 0.7, 0);
          g2.addColorStop(0, col([255, 214, 140], 1, 0.13 * u)); g2.addColorStop(1, 'rgba(255,214,140,0)');
          ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.max(W, H), -40 * dpr); ctx.lineTo(Math.max(W, H), 40 * dpr); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }
    // the speck / gathering light
    if ((phase === 'dark' && !(seedFrom && t - seedAt < 1.5)) || phase === 'gather' || phase === 'break') {
      const br = 0.5 + 0.5 * Math.sin(t * 2.2);
      const shake = (charge > 0.8 ? (charge - 0.8) * 5 * dpr : 0) + (phase === 'break' ? 7 * dpr * clamp(p / 0.55) : 0);
      const x = cx + (Math.random() - 0.5) * shake, y = cy + (Math.random() - 0.5) * shake;
      const r = (3 + br * 1.5 + charge * 40 + beatKick * (2 + charge * 14)) * dpr;
      drawOrganics(t, x, y);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
      g.addColorStop(0, `rgba(235,255,255,${0.55 + charge * 0.45})`);
      g.addColorStop(0.15, col(lift(tint, 0.3), 1, 0.35 + charge * 0.4));
      g.addColorStop(1, col(tint, 1, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 6, 0, TAU); ctx.fill();
      // a faint orbit that tightens as it charges
      if (charge > 0.05) {
        ctx.strokeStyle = col(lift(tint, 0.3), 1, charge * 0.35); ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath(); ctx.arc(cx, cy, mix(off.width * 0.6, off.width * 0.36, ease(charge)), t * 2, t * 2 + TAU * charge); ctx.stroke();
      }
    }
    // the eye
    if (eye) {
      eye.draw(t);
      ctx.globalCompositeOperation = 'source-over';
      let es = 1, ecx = cx, ecy = cy, ea = 1;
      if (phase === 'home' && fly) { const u = ease(clamp(p / 1.15)); es = mix(1, fly.s, u); ecx = mix(cx, fly.x, u); ecy = mix(cy, fly.y, u) - Math.sin(u * Math.PI) * 24 * dpr; ea = 1 - clamp((p - 1.0) / 0.3); }
      const ex = ecx - off.width * es / 2, ey = ecy - off.height * es / 2, gl = clamp((glitchUntil - t) / 0.7);
      if (gl > 0) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * gl;
        ctx.drawImage(off, ex - 14 * dpr * gl, ey); ctx.drawImage(off, ex + 11 * dpr * gl, ey + 3 * dpr * gl);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        const sh = off.height;
        for (let i = 0; i < 9; i++) {
          const y0 = Math.random() * sh, hh = (4 + Math.random() * 26) * dpr, dx = (Math.random() - 0.5) * 70 * dpr * gl;
          ctx.drawImage(off, 0, y0, off.width, hh, ex + dx, ey + y0, off.width, hh);
        }
      }
      ctx.globalAlpha = ea; ctx.drawImage(off, ex, ey, off.width * es, off.height * es); ctx.globalAlpha = 1;
      // its colours spiralling in to become the iris
      if (homeMotes.length) {
        const dh = Math.min(0.033, t - (draw.lh || t)); draw.lh = t;
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let i = homeMotes.length - 1; i >= 0; i--) {
          const m = homeMotes[i]; if (t < m.delay) continue;
          const pr = m.r, pa = m.a; m.r += (m.target - m.r) * Math.min(1, dh * 2.8); m.a += m.w * dh;
          if (Math.abs(m.r - m.target) < 2 * dpr) { homeMotes.splice(i, 1); continue; }
          ctx.strokeStyle = col(lift(m.rgb, 0.2), 1, 0.85); ctx.lineWidth = m.s;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(pa) * pr, cy + Math.sin(pa) * pr); ctx.lineTo(cx + Math.cos(m.a) * m.r, cy + Math.sin(m.a) * m.r); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (phase === 'evolve' && evo && evo.cocoon > 0) {
      ctx.save(); ctx.globalAlpha = evo.cocoon; drawOrganics(t, cx, cy); ctx.restore();
    }
    // shell shards
    ctx.globalCompositeOperation = 'lighter';
    for (let i = shards.length - 1; i >= 0; i--) {
      const q = shards[i], dt2 = Math.min(0.033, t - (q.lt || t)); q.lt = t;
      q.age += dt2; const k = Math.exp(-1.6 * dt2); q.vx *= k; q.vy *= k; q.x += q.vx * dt2; q.y += q.vy * dt2; q.rot += q.vr * dt2;
      const life = 1 - q.age / 1.5; if (life <= 0) { shards.splice(i, 1); continue; }
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
      ctx.beginPath(); q.pts.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
      ctx.fillStyle = col(tint, 0.8, 0.16 * life); ctx.fill();
      ctx.strokeStyle = col(lift(tint, 0.6), 1, 0.75 * life); ctx.lineWidth = 1.5 * dpr; ctx.stroke();
      ctx.restore();
    }
    // particles
    ctx.globalCompositeOperation = 'lighter';
    const dt = Math.min(0.033, t - (draw.lt || t)); draw.lt = t;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.age += dt;
      if (!q.out) {        // pulled toward the light
        const dx = cx - q.x, dy = cy - q.y, d = Math.hypot(dx, dy) || 1;
        const pull = (380 + 1600 * charge) * dpr;
        q.vx = (q.vx + (dx / d) * pull * dt) * 0.96; q.vy = (q.vy + (dy / d) * pull * dt) * 0.96;
        if (d < 12 * dpr) { parts.splice(i, 1); continue; }
      } else { const k = Math.exp(-(q.drag || 1.2) * dt); q.vx *= k; q.vy = q.vy * k + (q.grav || 0) * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      const life = q.out ? 1 - q.age / (q.life || 1.4) : Math.min(1, q.age * 2);
      if (life <= 0) { parts.splice(i, 1); continue; }
      const tw = q.sparkle ? 0.5 + 0.5 * Math.sin(q.age * 18 + i) : 1;
      ctx.fillStyle = col(q.rgb, 1, life * 0.9 * tw);
      ctx.beginPath(); ctx.arc(q.x, q.y, q.s, 0, TAU); ctx.fill();
    }
    // shockwaves
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], u = (t - r.t) / 1.6;
      if (u < 0) continue;
      if (u >= 1) { rings.splice(i, 1); continue; }
      const rad = r.small ? off.width * 0.08 + Math.max(W, H) * 0.5 * ease(u) * r.speed : off.width * 0.36 + Math.max(W, H) * 0.6 * ease(u) * r.speed;
      ctx.strokeStyle = col(r.rgb, 1, (1 - u) * 0.55); ctx.lineWidth = r.w * dpr * (1 - u * 0.7);
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, TAU); ctx.stroke();
    }
    // birth flash
    if (flash > 0) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(235,252,255,${flash})`; ctx.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - dt * 1.8);
    }
  }

  // ---------- evolution: silent, a smaller echo of its birth ----------
  let evo = null;
  function evolve(pending) {
    dna = HavenDNA.dna();
    const g = HavenDNA.growth();
    box.classList.remove('cardOnly'); box.classList.add('open', 'evolving'); size();
    document.getElementById('birth').classList.remove('open');
    parts = []; rings = []; shards = []; tierFx = null; flash = 0; charge = 1; beatKick = 0; cracksShown = 0;
    buildOrganics(); tendrils = []; tint = lift(dna.accent, 0.25); stars = []; glints = []; homeMotes = [];
    nameEl.className = 'awText'; nameEl.style.opacity = 0; nameEl.textContent = ''; meta.style.opacity = 0;
    actions.classList.remove('show'); hint.style.opacity = 0;
    document.getElementById('awChoose').style.display = 'none'; document.getElementById('awRename').style.display = 'none';
    document.getElementById('awEvo').style.display = 'flex';
    eye = new Eye(dna, off);
    eye.auto = false; eye.reactUntil = Infinity;
    eye.gaze.x = eye.gaze.y = 0; eye.target = { x: 0, y: 0 };
    // before: how it looked at its last stage
    eye.detailK = pending.from >= 2 ? 1 : 0; eye.crownK = pending.from >= 3 ? 1 : 0;
    if (pending.from === 0) eye.rv = { body: 1, iris: 1, pupil: 1, glass: 1, rare: 1, pattern: 0.85 };
    const quirkNames = (g.quirks || []).slice(pending.from + 1, pending.to + 1);
    const gained = (pending.gained || []).map((id) => (dna.rare.find((r) => r.id === id) || {}).name).filter(Boolean);
    evo = { pending, g, quirkNames, gained, cocoon: 0, k: {} };
    setPhase('evolve');
    if (!running) { running = true; last = now(); raf = requestAnimationFrame(loop); }
  }
  function stepEvolve(t, p, dt) {
    const k = evo.k;
    eye.closeK = p < 0.8 ? 0 : p < 1.6 ? ease((p - 0.8) / 0.8) : p < 3.9 ? 1 : 1 - ease(clamp((p - 3.9) / 0.6));
    const flick = p < 2.1 ? 0.65 + 0.35 * Math.sin(t * 34) * Math.sin(t * 13) : 1;
    evo.cocoon = p < 1.4 ? 0 : p < 2.0 ? ease((p - 1.4) / 0.6) * flick : p < 3.5 ? 1 : 0;
    for (const [at, key] of [[2.0, 'p1'], [2.6, 'p2'], [3.1, 'p3']]) {
      if (!k[key] && p > at) { k[key] = 1; beatKick = 1; buzz([22]); const n = Math.min(cracks.length, cracksShown + 4); while (cracksShown < n) cracks[cracksShown++].born = t; }
    }
    beatKick = Math.max(0, beatKick - dt * 4);
    if (!k.burst && p > 3.5) {                     // it breaks out, new
      k.burst = 1; shatter(); flash = 0.85; cracksShown = 0; buzz([50, 40, 90]);
      eye.rv = null; eye.detailK = 1; eye.crownK = 1;
      rings.push({ t, rgb: lift(dna.accent, 0.3), speed: 1.1, w: 8 }, { t: t + 0.15, rgb: dna.accent2, speed: 0.8, w: 4 });
      burst(evo.gained.length ? 160 : 70, evo.gained.length ? [[255, 207, 122], [255, 236, 190], dna.accent] : [dna.accent, dna.accent2, [255, 255, 255]], 520, 2.2);
      if (evo.gained.length) tierFx = { tier: dna.tier === 'mythic' ? 'mythic' : 'rare', t };
    }
    if (!k.wake && p > 4.4) { k.wake = 1; eye.pupilV += 4; eye.pupilGoal = 1 + dna.motion.dilate; eye.moodGoal.wide = 0.5; }
    if (!k.text && p > 4.9) {
      k.text = 1; eye.auto = true; eye.reactUntil = 0; eye.pupilGoal = 1; eye.moodGoal.wide = 0;
      const g = HavenDNA.growth();
      nameEl.textContent = '';
      for (const ch of dna.name) { const sp = document.createElement('span'); sp.textContent = ch; nameEl.appendChild(sp); }
      nameEl.style.opacity = 1;
      requestAnimationFrame(() => requestAnimationFrame(() => nameEl.classList.add('show')));
      const lines = ['grew into ' + g.stageName + (g.branchName ? ' · ' + g.branchName : '')];
      if (g.branchAbout && evo.pending.from < 2 && evo.pending.to >= 2) lines.push(g.branchAbout);
      evo.quirkNames.forEach((q) => lines.push('New quirk: ' + q));
      evo.gained.forEach((q) => lines.push('✦ New trait: ' + q));
      meta.textContent = '';
      lines.forEach((ln, i) => { const d = document.createElement('div'); d.textContent = ln; if (ln.startsWith('✦')) d.className = 't-mythic'; if (i) d.style.marginTop = '6px'; meta.appendChild(d); });
      setTimeout(() => { meta.style.opacity = 1; }, 600);
    }
    if (!k.act && p > 6.4) { k.act = 1; actions.classList.add('show'); }
  }

  function loop() {
    if (!running) return;
    const t = now(), dt = Math.min(0.033, t - last); last = t;
    step(t, dt); draw(t);
    if (cardEye) { cardEye.step(t, dt); cardEye.draw(t); }
    raf = requestAnimationFrame(loop);
  }

  function showCard() {
    actions.classList.remove('show'); nameEl.style.opacity = 0; meta.style.opacity = 0;
    const b = document.getElementById('birth');
    document.getElementById('bcard').className = 'bcard ' + dna.tier;
    document.getElementById('bId').textContent = '#' + dna.seed.toString(16).toUpperCase().padStart(8, '0');
    document.getElementById('bName').textContent = dna.name;
    document.getElementById('bWords').textContent = dna.words.join(' · ');
    document.getElementById('bOrigin').textContent = originLine(dna, (HavenDNA.summary() || {}).born);
    document.getElementById('bBorn').textContent = new Date((HavenDNA.summary() || {}).born || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const tierEl = document.getElementById('bTier'); tierEl.textContent = tierLabel(dna.tier); tierEl.className = 't-' + dna.tier;
    document.getElementById('bIris').textContent = dna.pal.id + ' ' + dna.pattern.name.toLowerCase();
    document.getElementById('bPupil').textContent = dna.pupil.name;
    document.getElementById('bTraits').textContent = dna.rare.map((x) => '✦ ' + x.name).join('   ');
    // Its genetic signature: the 32 bits of its seed, drawn as a strip of thin and thick marks.
    const sig = document.getElementById('bSig');
    if (sig) {
      sig.textContent = '';
      for (let i = 31; i >= 0; i--) { const m = document.createElement('i'); if ((dna.seed >>> i) & 1) m.className = 'on'; sig.appendChild(m); }
    }
    const g = HavenDNA.growth();
    if (g) {
      document.getElementById('bStage').textContent = g.stageName + (g.branchName ? ' · ' + g.branchName : '');
      document.getElementById('bDays').textContent = g.days + (g.days === 1 ? ' day' : ' days');
      document.getElementById('bQuirks').textContent = g.quirks.length ? 'Quirks: ' + g.quirks.join(' · ') : '';
      document.getElementById('bNext').textContent = g.nextName
        ? g.nextName + ' in ' + g.nextInDays + (g.nextInDays === 1 ? ' day' : ' days') + (g.branch ? '' : ' · leaning ' + g.leaningName)
        : 'Fully grown';
    }
    b.classList.add('open');
    const c = document.getElementById('bEye');
    cardEye = new Eye(dna, c); cardEye.resize();
    if (phase === 'evolve') document.getElementById('bEnter').textContent = 'Continue';
    cardEye.gaze.x = 0; cardEye.gaze.y = 0; cardEye.target = { x: 0, y: 0 };
  }

  const muteBtn = document.getElementById('awMute');
  function toggleMute() { Sound.setMuted(!Sound.muted); muteBtn.textContent = Sound.muted ? 'sound off' : 'sound on'; }
  function openRename() {
    document.getElementById('awChoose').style.display = 'none';
    const r = document.getElementById('awRename'); r.style.display = 'flex';
    const inp = document.getElementById('awInput'); inp.value = dna.name; inp.focus(); inp.select();
  }
  const finishRename = () => {
    const v = document.getElementById('awInput').value.trim().replace(/[<>&"]/g, '').slice(0, 14);
    document.getElementById('awInput').blur();
    document.getElementById('awRename').style.display = 'none';
    if (v) { dna.name = v; HavenDNA.rename(v); nameEl.classList.remove('show'); setTimeout(showName, 250); }
    eye.blinkNow(); eye.pupilV += 2;          // it likes its name
    setTimeout(showCard, 1500);
  };
  // Leaving: fade out to the real home screen, where the eye now wears its DNA.
  function enter() {
    const p = HavenDNA.has() && HavenDNA.growth() && HavenDNA.growth().pending;
    if (p && phase !== 'evolve') { const pend = HavenDNA.takePending(); return evolve(pend); }
    box.classList.remove('evolving');
    if (!box.classList.contains('cardOnly') && phase !== 'evolve') { useOwnColours(); if (eye) return flyHome(); }
    box.classList.add('leaving');
    setTimeout(() => { box.classList.remove('leaving'); stop(); }, 900);
  }
  // A new eye should be seen in its own colours, so the material switches back to "Your HAVEN" once.
  function useOwnColours() {
    const pick = document.getElementById('skinStyle');
    if (pick && pick.value !== 'original') { pick.value = 'original'; pick.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  // Settings > Your HAVEN: the birth card again, view only.
  function showSaved() {
    if (!HavenDNA.has()) return start();
    dna = HavenDNA.dna();
    box.classList.add('open', 'cardOnly'); size();
    phase = 'card'; eye = null; parts = []; rings = []; shards = []; tierFx = null; flash = 0; tendrils = []; charge = 0; stars = []; glints = []; homeMotes = []; tint = DEFAULT_TINT;
    nameEl.style.opacity = 0; meta.style.opacity = 0; actions.classList.remove('show'); hint.style.opacity = 0;
    if (!running) { running = true; last = now(); raf = requestAnimationFrame(loop); }
    showCard();
    document.getElementById('bEnter').textContent = 'Close';
  }
  // Testing (for Patch): on the birth card, tap the #ID 7 times, then each further tap skips 7 days.
  let idTaps = 0;
  function devSkip() {
    if (!HavenDNA.has()) return;
    idTaps++;
    if (idTaps < 7) return;
    const g = HavenDNA.skipDays(7);
    dna = HavenDNA.dna();
    document.getElementById('bNext').textContent = 'Test: +7 days → day ' + g.days + ' (' + g.stageName + ')' + (g.pending ? ' · close to see it evolve' : '');
  }
  const ACT = { mute: toggleMute, keep: showCard, rename: openRename, renameOk: finishRename, enter, close: enter, devskip: devSkip };
  // Input router. HAVEN's home listens on the whole window, so while this screen is up every touch is
  // caught here first and never reaches the launcher (no stray swipes, long-presses or annoyed taps).
  const TYPES = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend',
    'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'contextmenu', 'keydown', 'keyup', 'wheel'];
  for (const type of TYPES) {
    addEventListener(type, (e) => {
      if (!box.classList.contains('open')) return;
      e.stopImmediatePropagation();
      const inside = box.contains(e.target);
      if (type === 'contextmenu') { e.preventDefault(); return; }
      if (type === 'pointerdown' && inside && !e.target.closest('button,input')) onDown(e);
      else if (type === 'pointermove') onMove(e);
      else if (type === 'pointerup' || type === 'pointercancel') onUp(e);
      else if (type === 'click' && inside) {
        if (e.target.closest('#bId')) devSkip();
        const b = e.target.closest('[data-aw]');
        if (b && ACT[b.dataset.aw]) ACT[b.dataset.aw]();
      } else if (type === 'keydown' && e.key === 'Enter' && e.target.id === 'awInput') finishRename();
    }, { capture: true, passive: false });
  }
  addEventListener('resize', () => { if (running) size(); });
  return { start, stop, showSaved, evolve, get open() { return box.classList.contains('open'); } };
})();

window.HavenEye = Eye;          // the standalone renderer, also used for linked friends' HAVENs
window.HavenAwakening = { start: () => Awaken.start(), showSaved: () => Awaken.showSaved(), get open() { return Awaken.open; } };
function maybeEvolve() {
  if (Awaken.open || !HavenDNA.has() || document.visibilityState !== 'visible') return;
  const g = HavenDNA.growth();
  if (g && g.pending) Awaken.evolve(HavenDNA.takePending());
}
addEventListener('haven:greet', () => setTimeout(maybeEvolve, 700));
const boot = () => { if (!HavenDNA.has()) { if (!window.EYES_HOLD_BIRTH) Awaken.start(); } else setTimeout(maybeEvolve, 1200); };   // EYES for iPhone starts the birth itself
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
