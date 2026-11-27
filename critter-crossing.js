/* EYES 5.0 · Critter Crossing, an Eye Arcade cartridge.
   Guide a tiny critter across rolling lanes, then over a flowing energy stream on rafts and lilies, to the far
   bank. Every crossing builds a new, harder arrangement. Original pixel art and synthesised sound; inspired by the
   timing of classic road-crossing games, built from nothing of theirs.

   Fair by construction: traffic always leaves gaps of at least three squares, every stream lane is at least a third
   raft or lily with gaps you can wait out, sinking lilies always shimmer first, and there's a safe row halfway.
   Hazards move at steady speeds, so they can be read and anticipated.

     CritterCore   the simulation: pure, seeded, fixed 60 Hz steps, no DOM (tested headless)
     the game      what Eye Arcade drives (arcade.js)

   Field: 15 × 11 squares of 8 px (120 × 88) under an 8 px status strip. Nothing here runs until you press Play. */
'use strict';
(function (root) {
  const COLS = 15, ROWS = 11, T = 8, TOP = 8, W = COLS * T, H = ROWS * T + TOP, STEP_MS = 1000 / 60;
  const TUNING = {
    lives: 3, readyMs: 1100, hopMs: 110, leapMs: 200, leapCooldown: 1600, repeatDelay: 210, repeatEvery: 160,
    crossingMs: 40000, respawnMs: 900, invulnMs: 700, stepPts: 10, crossPts: 100, levelPts: 50,
    minTrafficGap: 3, sinkWarn: 900
  };
  // rows: 10 start bank · 9–6 road · 5 safe · 4–1 stream · 0 far bank
  const ROAD = [9, 8, 7, 6], STREAM = [4, 3, 2, 1], SAFE = [10, 5, 0];
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const LOOP = COLS + 6;            // a lane is a loop a little longer than the screen (things come and go off-screen)

  // ---------- an arrangement for this level ----------
  // Things in a lane are segments on the loop [0, LOOP): { at, len, kind }. Speed is squares per second.
  function buildLanes(R, level) {
    const lanes = {};
    const sp = (lo, hi) => (lo + R() * (hi - lo)) * Math.min(2.1, 1 + level * 0.12);
    ROAD.forEach((row, i) => {
      const dir = (i + level) % 2 ? 1 : -1, kind = level >= 3 && i === 3 ? 'spark' : 'cart';
      const speed = kind === 'spark' ? sp(2.6, 3.2) : sp(1.1, 2.0);
      const items = [];
      let x = R() * 3;
      const minGap = TUNING.minTrafficGap + (kind === 'spark' ? 2 : 0), maxGap = Math.max(minGap + 1, 7 - Math.min(3, level * 0.5));
      while (true) {
        const len = kind === 'spark' ? 1 : level >= 2 && R() < 0.3 ? 3 : R() < 0.5 ? 2 : 1;
        if (x + len + minGap > LOOP) break;
        items.push({ at: x, len, kind, hue: Math.floor(R() * 3) });
        x += len + minGap + R() * (maxGap - minGap);
      }
      lanes[row] = { row, type: 'road', dir, speed, items };
    });
    STREAM.forEach((row, i) => {
      const dir = (i + level) % 2 ? -1 : 1, speed = sp(0.8, 1.5);
      const items = [];
      let x = R() * 2, cover = 0;
      const maxGap = Math.max(2, 3.2 - level * 0.15);
      while (x < LOOP - 2) {
        const lily = R() < 0.35, len = lily ? 1 + Math.floor(R() * 2) : 2 + Math.floor(R() * 3);
        if (x + len > LOOP) break;
        items.push({ at: x, len, kind: lily ? 'lily' : 'raft', sinks: lily && level >= 3 && R() < 0.5, phase: R() * 6000 });
        cover += len;
        x += len + 1 + R() * (maxGap - 1);
      }
      // never a lane you can't use: at least a third of it is something to stand on
      if (cover < LOOP / 3) items.push({ at: (x + 1) % LOOP, len: 3, kind: 'raft', sinks: false, phase: 0 });
      lanes[row] = { row, type: 'stream', dir, speed, items };
    });
    return lanes;
  }
  // where a segment is on screen right now (x in squares, may be negative or past the edge)
  const segX = (lane, it, t) => {
    let p = (it.at + lane.dir * lane.speed * t / 1000) % LOOP;
    if (p < 0) p += LOOP;
    return p - 3;                   // the loop starts three squares left of the screen
  };
  const sunk = (it, t) => it.sinks && ((t + it.phase) % 6000) > 4200;       // under for 1.8 s of every 6 s
  const sinking = (it, t) => it.sinks && ((t + it.phase) % 6000) > 4200 - TUNING.sinkWarn && !sunk(it, t);

  function createWorld(seed) {
    const R = rng(seed);
    const w = {
      R, seed, t: 0, laneT: 0, phase: 'ready', readyLeft: TUNING.readyMs, level: 0, score: 0, lives: TUNING.lives, crossings: 0,
      lanes: buildLanes(R, 0), crossingLeft: TUNING.crossingMs, furthest: 10,
      p: { x: 7, row: 10, fx: 7, frow: 10, move: null, face: 1, alive: true, deadUntil: 0, invulnUntil: 0, why: '' },
      leapAt: -1e9, held: 0, heldSince: 0, lastRepeat: 0, input: { dir: 0, leap: false }, events: [], result: null
    };
    return w;
  }
  const emit = (w, type, d) => w.events.push(Object.assign({ type }, d || {}));
  const DX = [0, 0, 1, 0, -1], DR = [0, -1, 0, 1, 0];
  function tryMove(w, dir, n) {
    const p = w.p;
    if (!p.alive || p.move) return false;
    const tx = Math.round(p.x) + DX[dir] * n, tr = p.row + DR[dir] * n;
    if (tr > 10 || tr < 0) return false;
    p.face = dir;
    p.move = { fx: p.x, fr: p.row, tx: Math.max(0, Math.min(COLS - 1, tx)), tr, at: w.t, dur: n > 1 ? TUNING.leapMs : TUNING.hopMs, leap: n > 1 };
    emit(w, n > 1 ? 'leap' : 'hop');
    return true;
  }
  function die(w, why) {
    const p = w.p;
    if (!p.alive || w.t < p.invulnUntil) return;
    p.alive = false; p.why = why; p.deadUntil = w.t + TUNING.respawnMs;
    w.lives--;
    emit(w, 'fail', { why, x: p.x, row: p.row, lives: w.lives });
  }
  function respawn(w) {
    const p = w.p;
    Object.assign(p, { x: 7, row: 10, fx: 7, frow: 10, move: null, face: 1, alive: true, invulnUntil: w.t + TUNING.invulnMs, why: '' });
    w.furthest = 10;
    w.crossingLeft = TUNING.crossingMs;
  }
  function crossed(w) {
    w.crossings++;
    const bonus = TUNING.crossPts + TUNING.levelPts * w.level + Math.floor(w.crossingLeft / 1000) * 2;
    w.score += bonus;
    w.level++;
    w.lanes = buildLanes(w.R, w.level);
    w.laneT = 0;
    emit(w, 'cross', { bonus, level: w.level });
    respawn(w);
  }
  function step(w, dt) {
    dt = dt || STEP_MS;
    if (w.phase === 'ready') { w.readyLeft -= dt; if (w.readyLeft <= 0) { w.phase = 'playing'; emit(w, 'go'); } return; }
    if (w.phase !== 'playing') return;
    w.t += dt; w.laneT += dt;
    const p = w.p;
    if (!p.alive) {
      if (w.t >= p.deadUntil) { if (w.lives <= 0) return finish(w); respawn(w); }
      return;
    }
    // input: a push hops once; holding keeps hopping at a steady pace; the action button leaps two squares
    const d = w.input.dir | 0;
    if (d !== w.held) { w.held = d; w.heldSince = w.t; w.lastRepeat = w.t; if (d) tryMove(w, d, 1); }
    else if (d && w.t - w.heldSince >= TUNING.repeatDelay && w.t - w.lastRepeat >= TUNING.repeatEvery) { if (tryMove(w, d, 1)) w.lastRepeat = w.t; }
    if (w.input.leap) {
      w.input.leap = false;
      if (w.t - w.leapAt >= TUNING.leapCooldown && !p.move) { if (tryMove(w, p.face || 1, 2)) w.leapAt = w.t; }
      else emit(w, 'nope');
    }
    // movement
    if (p.move) {
      const m = p.move, u = Math.min(1, (w.t - m.at) / m.dur);
      p.fx = m.fx + (m.tx - m.fx) * u; p.frow = m.fr + (m.tr - m.fr) * u;
      if (u >= 1) {
        p.x = m.tx; p.row = m.tr; p.move = null; p.fx = p.x; p.frow = p.row;
        if (p.row < w.furthest) { w.score += TUNING.stepPts * (w.furthest - p.row); w.furthest = p.row; }
        if (p.row === 0) { emit(w, 'goal'); crossed(w); return; }
      }
    }
    // the stream carries you on what you stand on
    const lane = w.lanes[p.row];
    if (!p.move && lane && lane.type === 'stream') {
      let on = null;
      for (const it of lane.items) { const x = segX(lane, it, w.laneT); if (p.x + 0.5 > x + 0.15 && p.x + 0.5 < x + it.len - 0.15 && !sunk(it, w.laneT)) { on = it; break; } }
      if (!on) return die(w, 'splash');
      p.x += lane.dir * lane.speed * dt / 1000; p.fx = p.x;
      if (p.x < -0.4 || p.x > COLS - 0.6) return die(w, 'swept');
    }
    // traffic: a cart or spark under you (not while you're in the air mid-leap)
    const rowNow = Math.round(p.frow), ln = w.lanes[rowNow];
    if (ln && ln.type === 'road' && !(p.move && p.move.leap)) {
      for (const it of ln.items) {
        const x = segX(ln, it, w.laneT);
        if (p.fx + 0.5 > x + 0.1 && p.fx + 0.5 < x + it.len - 0.1) return die(w, it.kind === 'spark' ? 'zap' : 'bump');
        if (Math.abs(p.fx + 0.5 - (x + it.len / 2)) < it.len / 2 + 1.2 && !w.dangerAt) { w.dangerAt = w.t; emit(w, 'danger', { x: x + it.len / 2, row: rowNow }); }
      }
    }
    if (w.dangerAt && w.t - w.dangerAt > 350) w.dangerAt = 0;
    w.crossingLeft -= dt;
    if (w.crossingLeft <= 0) die(w, 'time');
  }
  function finish(w) {
    w.phase = 'lost';
    w.result = { phase: 'lost', reason: 'survival', score: w.score, crossings: w.crossings, level: w.level,
      headline: w.crossings >= 3 ? 'What a journey' : w.crossings ? 'Safe at last' : 'Out of tries',
      detail: `${w.crossings} crossing${w.crossings === 1 ? '' : 's'} · arrangement ${w.level + 1}` };
    emit(w, 'over', w.result);
  }
  const CritterCore = { COLS, ROWS, T, TOP, W, H, TUNING, ROAD, STREAM, STEP_MS, createWorld, step, buildLanes, segX, sunk, rng, LOOP };
  root.CritterCore = CritterCore;

  // =====================================================================================================
  // drawing and sound
  // =====================================================================================================
  const SPR = {
    critter: ['..LL.LL.', '.LggggL.', 'LgWkgWkL', 'Lggggggg', '.gggrgg.', '.gggggg.', '.f.ff.f.', '........'],
    critterSquish: ['........', '........', '........', '.LggggL.', 'LgxgggxL', 'gggggggg', '.f.ff.f.', '........'],
    lily: ['..pppp..', '.pPPPPp.', 'pPPPpPPp', 'pPPpPPPp', '.pPPPPp.', '..pppp..']
  };
  const PAL = { L: '#c8ff9a', g: '#7ee06a', W: '#ffffff', k: '#123018', r: '#ff8fa3', f: '#3f8f3a', x: '#123018', p: '#1f6b2c', P: '#3fae4a' };
  const CART = [['#ff7a59', '#b84028'], ['#ffd166', '#b08a2a'], ['#7ab8ff', '#3a6aab']];
  const SOUNDS = (K) => ({
    hop: (ac, out, t) => K.tone(ac, out, t, { type: 'square', f0: 520, f1: 780, dur: 0.05, vol: 0.04 }),
    leap: (ac, out, t) => K.tone(ac, out, t, { type: 'triangle', f0: 400, f1: 1200, dur: 0.16, vol: 0.08 }),
    nope: (ac, out, t) => K.tone(ac, out, t, { type: 'square', f0: 180, dur: 0.05, vol: 0.03 }),
    bump: (ac, out, t) => { K.tone(ac, out, t, { type: 'square', f0: 360, f1: 90, dur: 0.25, vol: 0.08 }); K.hiss(ac, out, t, { f: 600, dur: 0.12, vol: 0.06 }); },
    splash: (ac, out, t) => K.hiss(ac, out, t, { f: 1800, f1: 400, dur: 0.35, vol: 0.12, q: 0.6 }),
    zap: (ac, out, t) => { K.tone(ac, out, t, { type: 'sawtooth', f0: 1200, f1: 200, dur: 0.2, vol: 0.06 }); },
    goal: (ac, out, t) => K.notes(ac, out, t, [523, 659, 784, 1047], 0.08, { type: 'square', vol: 0.06, dur: 0.1 }),
    tick: (ac, out, t) => K.tone(ac, out, t, { type: 'sine', f0: 1400, dur: 0.03, vol: 0.03 }),
    ready: (ac, out, t) => K.tone(ac, out, t, { type: 'triangle', f0: 600, dur: 0.08, vol: 0.06 }),
    over: (ac, out, t) => K.notes(ac, out, t, [392, 349, 294, 262], 0.13, { type: 'triangle', vol: 0.08, dur: 0.15 }),
    best: (ac, out, t) => K.notes(ac, out, t, [659, 784, 988, 1319], 0.08, { type: 'square', vol: 0.05, dur: 0.11 })
  });
  const STORE_KEY = 'eyes.arcade.critter.v1';
  function createGame(host) {
    const K = root.ArcadeKit;
    let canvas = null, ctx = null, scale = 1, world = null, phase = 'title', paused = false, newBest = false, sfx = null, fx = null, texts = [], S = {}, flash = 0;
    const record = { best: 0, plays: 0, mostCrossings: 0 };
    try { Object.assign(record, host.store.get(STORE_KEY) || {}); } catch (e) {}
    const save = () => { try { host.store.set(STORE_KEY, record); } catch (e) {} };
    const reduced = () => !host.motion(), low = () => host.lowPower();
    function attach(c) {
      canvas = c; ctx = c.getContext('2d');
      sfx = K.synth(host.audio, SOUNDS(K));
      fx = K.particles(60);
      S.critter = { 1: K.sprite(SPR.critter, PAL), 3: K.sprite(SPR.critter, PAL), 2: K.sprite(SPR.critter, PAL), 4: K.sprite(K.mirror(SPR.critter), PAL) };
      S.squish = K.sprite(SPR.critterSquish, PAL);
      S.lily = K.sprite(SPR.lily, PAL);
    }
    function resize(s) { scale = Math.max(1, s | 0); if (canvas) { canvas.width = W * scale; canvas.height = H * scale; } }
    function title() { phase = 'title'; world = null; }
    function newRound() {
      world = createWorld((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
      phase = 'ready'; paused = false; newBest = false; texts = []; fx.clear(); flash = 0;
      record.plays++; save();
      host.emit('start', {}); sfx.play('ready');
    }
    function pause() { if (world && (phase === 'playing' || phase === 'ready')) { paused = true; world.input.dir = 0; } }
    function resume() { paused = false; }
    function stop() { world = null; phase = 'title'; paused = false; if (fx) fx.clear(); texts = []; if (sfx) sfx.stop(); canvas = null; ctx = null; }
    function input(st) { if (!world || paused) return; world.input.dir = st.dir | 0; if (st.pulse) world.input.leap = true; }
    const nx = (x) => ((x + 0.5) * T / W) * 2 - 1, ny = (row) => ((row + 0.5) * T + TOP) / H * 2 - 1;
    function step(dt) {
      if (!world || paused) { if (fx) fx.step(dt); return; }
      CritterCore.step(world, dt);
      phase = world.phase;
      fx.step(dt);
      for (const t of texts) t.life -= dt; texts = texts.filter((t) => t.life > 0);
      if (flash > 0) flash -= dt;
      for (const ev of world.events) handle(ev);
      world.events.length = 0;
    }
    function puff(x, row, col, n) { const px = (x + 0.5) * T, py = (row + 0.5) * T + TOP; for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 10 + Math.random() * 25; fx.add({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, g: 40, life: 450 + Math.random() * 250, max: 700, c: col }); } }
    function handle(ev) {
      const p = world.p;
      switch (ev.type) {
        case 'go': host.emit('go'); break;
        case 'hop': sfx.play('hop'); break;
        case 'leap': sfx.play('leap'); host.emit('pulse', {}); break;
        case 'nope': sfx.play('nope'); break;
        case 'danger': host.emit('danger', { nx: nx(ev.x), ny: ny(ev.row), d: 1 }); break;
        case 'fail':
          sfx.play(ev.why === 'splash' || ev.why === 'swept' ? 'splash' : ev.why === 'zap' ? 'zap' : 'bump');
          flash = 300;
          puff(ev.x, ev.row, ev.why === 'splash' || ev.why === 'swept' ? '#9fe8ff' : '#c8ff9a', reduced() ? 4 : 12);
          texts.push({ s: { splash: 'SPLASH', swept: 'SWEPT AWAY', zap: 'ZAP', bump: 'BONK', time: 'TOO SLOW' }[ev.why] || 'OOPS', x: W / 2, y: TOP + 34, life: 900, big: true });
          host.emit('hit', { health: ev.lives });
          if (ev.lives === 1) host.emit('low');
          break;
        case 'goal': sfx.play('goal'); puff(p.x, 0, '#ffe08a', reduced() ? 4 : 14); break;
        case 'cross': texts.push({ s: '+' + ev.bonus, x: W / 2, y: TOP + 34, life: 1100, big: true }); host.emit('wave', { wave: ev.level + 1 }); host.emit('collect', { rare: true }); break;
        case 'over': {
          const prev = record.best || 0;
          newBest = world.score > prev && world.score > 0;
          if (newBest) record.best = world.score;
          record.mostCrossings = Math.max(record.mostCrossings || 0, world.crossings);
          world.result.rating = world.crossings >= 3 || (prev && world.score >= prev * 0.6) ? 'good' : world.crossings >= 1 ? 'ok' : 'poor';
          save();
          sfx.play(newBest ? 'best' : 'over');
          host.emit('lose', { ...world.result, newBest, best: record.best, rating: world.result.rating });
          if (newBest) host.emit('best', { score: world.score });
          break;
        }
      }
    }
    function drawRow(row, time) {
      const y = row * T + TOP;
      if (row === 0) { ctx.fillStyle = '#244a2a'; ctx.fillRect(0, y, W, T); for (let x = 2; x < W; x += 9) { ctx.fillStyle = (x / 9) % 2 ? '#ffd166' : '#ff8fd0'; ctx.fillRect(x, y + 3, 2, 2); } return; }
      if (row === 10 || row === 5) { ctx.fillStyle = row === 5 ? '#1f4a2e' : '#22512f'; ctx.fillRect(0, y, W, T); ctx.fillStyle = '#2e6b3c'; for (let x = (row * 3) % 7; x < W; x += 7) ctx.fillRect(x, y + 2 + (x % 3), 1, 2); return; }
      if (ROAD.includes(row)) { ctx.fillStyle = '#1b2230'; ctx.fillRect(0, y, W, T); ctx.fillStyle = '#2a3446'; if (row !== 6) for (let x = 0; x < W; x += 8) ctx.fillRect(x + 2, y + T - 1, 4, 1); return; }
      ctx.fillStyle = '#0f3550'; ctx.fillRect(0, y, W, T);
      const lane = world.lanes[row], off = reduced() ? 0 : ((world.laneT / 1000) * lane.speed * T * lane.dir) % 10;
      ctx.fillStyle = '#2a7aa8';
      for (let x = -10; x < W + 10; x += 10) ctx.fillRect(Math.round(x + off + (row % 2) * 5), y + 3 + (row % 2), 3, 1);
    }
    function drawLane(lane, time) {
      const y = lane.row * T + TOP;
      for (const it of lane.items) {
        const x = segX(lane, it, world.laneT) * T;
        if (x > W || x + it.len * T < 0) continue;
        const px = Math.round(x * scale) / scale;
        if (it.kind === 'cart') {
          const c = CART[it.hue];
          ctx.fillStyle = c[1]; ctx.fillRect(px, y + 1, it.len * T - 1, T - 2);
          ctx.fillStyle = c[0]; ctx.fillRect(px + 1, y + 1, it.len * T - 3, T - 4);
          ctx.fillStyle = '#e8f4ff'; ctx.fillRect(lane.dir > 0 ? px + it.len * T - 3 : px + 1, y + 2, 1, 2);
          ctx.fillStyle = '#0b0e14'; ctx.fillRect(px + 1, y + T - 2, 2, 1); ctx.fillRect(px + it.len * T - 4, y + T - 2, 2, 1);
        } else if (it.kind === 'spark') {
          const f = Math.floor(time / 80) % 2;
          ctx.fillStyle = '#fff3a0'; ctx.fillRect(px + 3, y + 1, 2, 6); ctx.fillRect(px + 1, y + 3, 6, 2);
          ctx.fillStyle = f ? '#ffd166' : '#ff9f3a'; ctx.fillRect(px + 2, y + 2, 4, 4);
        } else if (it.kind === 'raft') {
          ctx.fillStyle = '#5a3a1e'; ctx.fillRect(px, y + 1, it.len * T, T - 2);
          ctx.fillStyle = '#8a5a2b'; ctx.fillRect(px, y + 2, it.len * T, 3);
          ctx.fillStyle = '#4a2e16'; for (let k = 1; k < it.len; k++) ctx.fillRect(px + k * T, y + 1, 1, T - 2);
        } else {
          if (sunk(it, world.laneT)) { ctx.fillStyle = 'rgba(80,200,120,0.25)'; for (let k = 0; k < it.len; k++) ctx.fillRect(px + k * T + 2, y + 3, 4, 2); continue; }
          const warn = sinking(it, world.laneT) && Math.floor(time / 120) % 2;
          for (let k = 0; k < it.len; k++) { ctx.globalAlpha = warn ? 0.55 : 1; ctx.drawImage(S.lily, px + k * T, y + 1); }
          ctx.globalAlpha = 1;
        }
      }
    }
    function render() {
      if (!ctx) return;
      const time = performance.now();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      if (world) {
        const w = world;
        for (let r = 0; r < ROWS; r++) drawRow(r, time);
        for (const r of [...ROAD, ...STREAM]) drawLane(w.lanes[r], time);
        const p = w.p;
        if (p.alive) {
          const blink = w.t < p.invulnUntil && Math.floor(time / 90) % 2 === 0;
          const hop = p.move ? Math.sin(Math.min(1, (w.t - p.move.at) / p.move.dur) * Math.PI) * (p.move.leap ? 4 : 1.5) : 0;
          if (!blink) ctx.drawImage(S.critter[p.face || 1], Math.round(p.fx * T * scale) / scale, Math.round((p.frow * T + TOP - hop) * scale) / scale);
        } else if (p.why !== 'splash' && p.why !== 'swept') ctx.drawImage(S.squish, Math.round(p.x * T), p.row * T + TOP);
        for (const q of fx.list) { ctx.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5)); ctx.fillStyle = q.c; ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); }
        ctx.globalAlpha = 1;
        if (flash > 0) { ctx.fillStyle = `rgba(255,90,90,${flash / 300 * 0.15})`; ctx.fillRect(0, TOP, W, H - TOP); }
        for (const t of texts) { ctx.globalAlpha = Math.min(1, t.life / 300); K.text(ctx, t.s, t.x + 1, t.y + 1, '#0a1a10', t.big ? 2 : 1, 'center'); K.text(ctx, t.s, t.x, t.y, '#f4ffe8', t.big ? 2 : 1, 'center'); }
        ctx.globalAlpha = 1;
        if (w.phase === 'ready' && (Math.floor(w.readyLeft / 200) % 2 === 0 || reduced())) { K.text(ctx, 'READY', W / 2 + 1, TOP + 37, '#0a1a10', 2, 'center'); K.text(ctx, 'READY', W / 2, TOP + 36, '#e8ffd8', 2, 'center'); }
        if (paused || w.phase === 'lost') { ctx.fillStyle = 'rgba(2,6,8,0.5)'; ctx.fillRect(0, TOP, W, H - TOP); }
        // status strip: score, tries, the leap, the crossing clock
        ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, W, TOP); ctx.fillStyle = '#1a3020'; ctx.fillRect(0, TOP - 1, W, 1);
        K.text(ctx, String(w.score).padStart(5, '0'), 2, 1, '#e8ffd8');
        for (let i = 0; i < TUNING.lives; i++) { ctx.fillStyle = i < w.lives ? '#7ee06a' : '#26402a'; ctx.fillRect(26 + i * 6, 2, 4, 4); ctx.fillStyle = i < w.lives ? '#123018' : '#1a2a1c'; ctx.fillRect(27 + i * 6, 3, 1, 1); ctx.fillRect(29 + i * 6, 3, 1, 1); }
        const lr = Math.min(1, (w.t - w.leapAt) / TUNING.leapCooldown);
        ctx.fillStyle = '#16301e'; ctx.fillRect(46, 3, 12, 2); ctx.fillStyle = lr >= 1 ? '#c8ff9a' : '#4f8a46'; ctx.fillRect(46, 3, Math.round(12 * lr), 2);
        const tl = Math.max(0, w.crossingLeft / TUNING.crossingMs), hurry = tl < 0.25 && Math.floor(time / 250) % 2;
        ctx.fillStyle = '#16301e'; ctx.fillRect(64, 3, 30, 2); ctx.fillStyle = hurry ? '#ff9f8a' : '#ffd166'; ctx.fillRect(64, 3, Math.round(30 * tl), 2);
        K.text(ctx, 'L' + (w.level + 1), W - 2, 1, '#ffd166', 1, 'right');
      } else { ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, W, H); }
    }
    function status() {
      const w = world;
      return {
        phase, paused, score: w ? w.score : 0, best: record.best || 0, newBest, result: w ? w.result : null,
        pulseReady: w ? Math.min(1, (w.t - w.leapAt) / TUNING.leapCooldown) : 1, lives: w ? w.lives : TUNING.lives, crossings: w ? w.crossings : 0, level: w ? w.level : 0,
        player: w ? { nx: nx(w.p.fx), ny: ny(w.p.frow) } : null
      };
    }
    function wantsFrames() { return !paused && !!world && (phase === 'ready' || phase === 'playing' || fx.size > 0 || texts.length > 0); }
    return { id: 'critter', title: 'Critter Crossing', width: W, height: H, stepMs: STEP_MS, attach, resize, title, newRound, pause, resume, stop, input, step, render, status, wantsFrames, debug: { world: () => world, record: () => ({ ...record }) } };
  }
  if (root.EyesArcade && root.EyesArcade.defineGame) root.EyesArcade.defineGame('critter', createGame);
  root.CritterCrossingGame = createGame;
})(typeof window === 'undefined' ? globalThis : window);
