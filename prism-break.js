/* EYES 5.0 · Prism Break, an Eye Arcade cartridge.
   A paddle beneath formations of luminous crystal. Where the ball meets the paddle sets its angle; clear crystal
   breaks in one hit, quartz in two, amethyst in three, and dark obsidian only bounces. Original pixel art and
   synthesised sound; inspired by the mechanics of classic brick-breaking games, built from nothing of theirs.

   Reliable by construction:
     - the ball moves in sub-steps of at most half a pixel, one axis at a time, so it can't pass through anything
       and always bounces off the face it actually touched
     - its vertical speed never falls below 35 % of its speed (no endless horizontal skating), and if nothing but
       walls has been touched for a while, its angle is nudged
     - every formation is checked: obsidian never seals a crystal away from the open field, never fills a row, and
       stays under 15 %
     CrystalCore   the simulation: pure, seeded, fixed 60 Hz steps, no DOM (tested headless)
     the game      what Eye Arcade drives (arcade.js)

   Field: 120 × 88 under an 8 px status strip. Nothing here runs until you press Play. */
'use strict';
(function (root) {
  const W = 120, H = 96, TOP = 8, STEP_MS = 1000 / 60;
  const COLS = 10, ROWS = 7, BW = 11, BH = 5, GAP = 1, OX = 1, OY = TOP + 5;
  const TUNING = {
    lives: 3, readyMs: 900, paddleY: 89, paddleH: 3, paddleW: 20, paddleWide: 30, paddleSpeed: 120,
    ballR: 1.5, speed0: 64, speedPerFormation: 5, speedMax: 104, minVy: 0.35, maxAngle: 1.05, stuckMs: 9000,
    pickupChance: 0.11, pickupFall: 30, wideMs: 14000, pierceMs: 8000, barrierMs: 20000, maxBalls: 6,
    pts: { 1: 30, 2: 60, 3: 100 }, hitPts: 10, formationBonus: 200
  };
  // '.' empty · '1' clear · '2' quartz · '3' amethyst · '#' obsidian
  const FORMATIONS = [
    ['..........', '.11111111.', '1111111111', '1122222211', '1111111111', '.11111111.', '..........'],
    ['1........1', '11......11', '121....121', '1221..1221', '1222112221', '1111111111', '..........'],
    ['..2....2..', '.212..212.', '2131221312', '.212..212.', '..2.11.2..', '...1111...', '..........'],
    ['3333333333', '2........2', '2.111111.2', '2.1#..#1.2', '2.111111.2', '2........2', '1111111111'],
    ['....11....', '...2222...', '..333333..', '.22#22#22.', '1111111111', '.1.1.1.1.1', '..........'],
    ['1212121212', '2121212121', '..........', '#33#..#33#', '..........', '1111111111', '2222222222'],
    ['....3.....', '...323....', '..32123...', '.3211123..', '..32123...', '...323....', '....3.....'],
    ['22......22', '2.1....1.2', '..131131..', '.1.3##3.1.', '..131131..', '2.1....1.2', '22......22']
  ];
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // after the designed formations: mirrored, seeded arrangements that get denser and tougher
  function generate(R, n) {
    const rows = [];
    for (let y = 0; y < ROWS; y++) {
      let half = '';
      for (let x = 0; x < COLS / 2; x++) {
        const v = R(), dense = 0.55 + Math.min(0.3, n * 0.02);
        half += v > dense ? '.' : v < 0.05 + Math.min(0.06, n * 0.005) ? '#' : String(1 + Math.min(2, Math.floor(R() * (1.5 + n * 0.12))));
      }
      rows.push(half + half.split('').reverse().join(''));
    }
    return rows;
  }
  // fairness check: no sealed crystal, no wall of obsidian, not too much of it, and something to break
  function validate(rows) {
    const g = rows.map((r) => r.split(''));
    let obs = 0, breakable = 0;
    for (const r of g) { if (r.every((c) => c === '#')) r[0] = '1'; for (const c of r) { if (c === '#') obs++; else if (c !== '.') breakable++; } }
    // too much obsidian: soften the extra into quartz, from the top
    for (let y = 0; y < ROWS && obs > Math.floor(COLS * ROWS * 0.15); y++) for (let x = 0; x < COLS && obs > Math.floor(COLS * ROWS * 0.15); x++) if (g[y][x] === '#') { g[y][x] = '2'; obs--; breakable++; }
    for (let pass = 0; pass < 12; pass++) {
      // anything not obsidian that the open space beneath can reach (crystals count as passable: they break)
      const seen = g.map((r) => r.map(() => false)), q = [];
      for (let x = 0; x < COLS; x++) if (g[ROWS - 1][x] !== '#') { seen[ROWS - 1][x] = true; q.push([x, ROWS - 1]); }
      for (let h = 0; h < q.length; h++) {
        const [x, y] = q[h];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || seen[ny][nx] || g[ny][nx] === '#') continue;
          seen[ny][nx] = true; q.push([nx, ny]);
        }
      }
      let sealed = false;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (g[y][x] === '#' || seen[y][x] || g[y][x] === '.') continue;
        sealed = true;
        for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && g[ny][nx] === '#') g[ny][nx] = '1'; }
      }
      if (!sealed) break;
    }
    if (!breakable) g[ROWS - 1] = '1111111111'.split('');
    return g.map((r) => r.join(''));
  }
  function bricksFrom(rows) {
    const list = [];
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === '.') return;
      const hp = c === '#' ? Infinity : +c;
      list.push({ x: OX + x * (BW + GAP), y: OY + y * (BH + GAP), w: BW, h: BH, hp, max: hp, kind: c === '#' ? 'obsidian' : ['', 'clear', 'quartz', 'amethyst'][+c], col: x, row: y, flash: 0 });
    }));
    return list;
  }
  function createWorld(seed) {
    const R = rng(seed);
    const w = {
      R, seed, t: 0, phase: 'ready', readyLeft: TUNING.readyMs, formation: 0, score: 0, lives: TUNING.lives, cleared: 0,
      paddle: { x: W / 2, w: TUNING.paddleW, vx: 0 }, balls: [], bricks: [], pickups: [], power: { wide: 0, pierce: 0, barrier: 0 },
      input: { vx: 0, launch: false }, events: [], result: null, sinceContact: 0, broken: 0, startBreakables: 0
    };
    loadFormation(w);
    return w;
  }
  const emit = (w, type, d) => w.events.push(Object.assign({ type }, d || {}));
  const speedOf = (w) => Math.min(TUNING.speedMax, TUNING.speed0 + TUNING.speedPerFormation * w.formation);
  function loadFormation(w) {
    const rows = validate(w.formation < FORMATIONS.length ? FORMATIONS[w.formation] : generate(w.R, w.formation));
    w.bricks = bricksFrom(rows);
    w.startBreakables = w.bricks.filter((b) => b.hp !== Infinity).length;
    w.balls = [{ x: w.paddle.x, y: TUNING.paddleY - TUNING.ballR - 0.5, vx: 0, vy: 0, held: true }];
    w.pickups = []; w.sinceContact = 0;
  }
  function launch(w, b) {
    const a = Math.max(-0.45, Math.min(0.45, w.paddle.vx / 260 + (w.R() - 0.5) * 0.3)), sp = speedOf(w);
    b.held = false; b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp;
    emit(w, 'launch');
  }
  function normalise(w, b) {   // keep the speed, and keep it from skating sideways for ever
    const sp = speedOf(w), l = Math.hypot(b.vx, b.vy) || 1;
    b.vx = b.vx / l * sp; b.vy = b.vy / l * sp;
    if (Math.abs(b.vy) < TUNING.minVy * sp) { b.vy = Math.sign(b.vy || -1) * TUNING.minVy * sp; b.vx = Math.sign(b.vx || 1) * Math.sqrt(sp * sp - b.vy * b.vy); }
  }
  const overlap = (b, r) => b.x + TUNING.ballR > r.x && b.x - TUNING.ballR < r.x + r.w && b.y + TUNING.ballR > r.y && b.y - TUNING.ballR < r.y + r.h;
  function hitBrick(w, k, b) {
    const br = w.bricks[k];
    w.sinceContact = 0;
    if (br.hp === Infinity) { br.flash = 140; emit(w, 'thunk', { x: br.x + br.w / 2, y: br.y + br.h / 2 }); return true; }
    w.sinceBrick = 0;
    const pierce = w.t < w.power.pierce;
    br.hp = pierce ? 0 : br.hp - 1; br.flash = 140;
    w.score += TUNING.hitPts;
    if (br.hp <= 0) {
      w.bricks.splice(k, 1); w.broken++;
      w.score += TUNING.pts[br.max];
      emit(w, 'break', { x: br.x + br.w / 2, y: br.y + br.h / 2, kind: br.kind, value: TUNING.pts[br.max] });
      if (w.R() < TUNING.pickupChance) { const kinds = ['wide', 'multi', 'pierce', 'barrier']; w.pickups.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, kind: kinds[Math.floor(w.R() * 4)] }); }
    } else emit(w, 'crack', { x: br.x + br.w / 2, y: br.y + br.h / 2, kind: br.kind, hp: br.hp });
    return !pierce;      // a piercing ball goes straight through crystal
  }
  // one axis at a time, so a bounce always reverses the axis that actually touched something
  function moveAxis(w, b, axis, d) {
    if (axis === 'x') b.x += d; else b.y += d;
    if (b.x - TUNING.ballR < 0) { b.x = TUNING.ballR; b.vx = Math.abs(b.vx); emit(w, 'wall'); return; }
    if (b.x + TUNING.ballR > W) { b.x = W - TUNING.ballR; b.vx = -Math.abs(b.vx); emit(w, 'wall'); return; }
    if (b.y - TUNING.ballR < TOP) { b.y = TOP + TUNING.ballR; b.vy = Math.abs(b.vy); emit(w, 'wall'); return; }
    for (let k = w.bricks.length - 1; k >= 0; k--) {
      if (!overlap(b, w.bricks[k])) continue;
      if (hitBrick(w, k, b)) {
        if (axis === 'x') { b.x -= d; b.vx = -b.vx; } else { b.y -= d; b.vy = -b.vy; }
        return;
      }
    }
  }
  function step(w, dt) {
    dt = dt || STEP_MS;
    const sec = dt / 1000;
    if (w.phase === 'ready') { w.readyLeft -= dt; if (w.readyLeft <= 0) { w.phase = 'playing'; emit(w, 'go'); } }
    if (w.phase !== 'playing' && w.phase !== 'ready') return;
    if (w.phase === 'playing') w.t += dt;
    const pd = w.paddle;
    pd.w = w.t < w.power.wide ? TUNING.paddleWide : TUNING.paddleW;
    const target = (w.input.vx || 0) * TUNING.paddleSpeed;
    pd.vx += (target - pd.vx) * Math.min(1, 14 * sec);
    pd.x = Math.max(pd.w / 2, Math.min(W - pd.w / 2, pd.x + pd.vx * sec));
    if (w.phase !== 'playing') { for (const b of w.balls) if (b.held) b.x = pd.x; return; }
    if (w.input.launch) { w.input.launch = false; for (const b of w.balls) if (b.held) launch(w, b); }
    w.sinceContact += dt; w.sinceBrick = (w.sinceBrick || 0) + dt;
    for (let i = w.balls.length - 1; i >= 0; i--) {
      const b = w.balls[i];
      if (b.held) { b.x = pd.x; b.y = TUNING.paddleY - TUNING.ballR - 0.5; continue; }
      if (w.sinceContact > TUNING.stuckMs) {   // only walls for a long time: nudge the angle
        const a = Math.atan2(b.vx, -b.vy) + (w.R() < 0.5 ? -1 : 1) * (0.15 + w.R() * 0.12);
        const sp = speedOf(w); b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp; w.sinceContact = 0;
      }
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) * sec / 0.5));
      for (let s = 0; s < steps; s++) {
        moveAxis(w, b, 'x', b.vx * sec / steps);
        moveAxis(w, b, 'y', b.vy * sec / steps);
        // the paddle: where it lands sets the angle
        if (b.vy > 0 && b.y + TUNING.ballR >= TUNING.paddleY && b.y - TUNING.ballR <= TUNING.paddleY + TUNING.paddleH && b.x >= pd.x - pd.w / 2 - TUNING.ballR && b.x <= pd.x + pd.w / 2 + TUNING.ballR) {
          const off = Math.max(-1, Math.min(1, (b.x - pd.x) / (pd.w / 2))), sp = speedOf(w);
          let a = off * TUNING.maxAngle + Math.max(-0.12, Math.min(0.12, pd.vx / 900));   // a moving paddle adds a little spin
          // never straight up and down (a ball could shuttle through one gap for ever), and if no crystal has been
          // touched for a while, the paddle sends it somewhere new
          if (Math.abs(a) < 0.07) a = (a < 0 || (a === 0 && w.R() < 0.5) ? -1 : 1) * (0.07 + w.R() * 0.05);
          if (w.sinceBrick > TUNING.stuckMs) { a += (w.R() < 0.5 ? -1 : 1) * (0.25 + w.R() * 0.2); a = Math.max(-TUNING.maxAngle, Math.min(TUNING.maxAngle, a)); w.sinceBrick = 0; }
          b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp; b.y = TUNING.paddleY - TUNING.ballR;
          w.sinceContact = 0;
          emit(w, 'paddle', { off });
        }
        if (b.y > TUNING.paddleY + 4 && w.t < w.power.barrier && b.vy > 0 && b.y >= H - 3) { b.vy = -Math.abs(b.vy); w.power.barrier = 0; emit(w, 'barrier'); }
      }
      normalise(w, b);
      if (b.y - TUNING.ballR > H) { w.balls.splice(i, 1); }
    }
    for (const br of w.bricks) if (br.flash > 0) br.flash -= dt;
    for (let i = w.pickups.length - 1; i >= 0; i--) {
      const p = w.pickups[i];
      p.y += TUNING.pickupFall * sec;
      if (p.y > H + 4) { w.pickups.splice(i, 1); continue; }
      if (p.y + 2 >= TUNING.paddleY && p.y - 2 <= TUNING.paddleY + TUNING.paddleH && Math.abs(p.x - pd.x) <= pd.w / 2 + 2) {
        w.pickups.splice(i, 1);
        if (p.kind === 'wide') w.power.wide = w.t + TUNING.wideMs;
        else if (p.kind === 'pierce') w.power.pierce = w.t + TUNING.pierceMs;
        else if (p.kind === 'barrier') w.power.barrier = w.t + TUNING.barrierMs;
        else {
          const src = w.balls.find((b) => !b.held) || w.balls[0];
          if (src) for (const da of [-0.45, 0.45]) {
            if (w.balls.length >= TUNING.maxBalls) break;
            const a = Math.atan2(src.vx || 0.01, -(src.vy || -1)) + da, sp = speedOf(w);
            w.balls.push({ x: src.x, y: Math.min(src.y, TUNING.paddleY - 4), vx: Math.sin(a) * sp, vy: -Math.abs(Math.cos(a) * sp), held: false });
          }
        }
        emit(w, 'pickup', { kind: p.kind, x: p.x, y: p.y });
      }
    }
    if (!w.bricks.some((b) => b.hp !== Infinity)) {
      w.formation++; w.cleared++;
      const bonus = TUNING.formationBonus * w.formation;
      w.score += bonus;
      emit(w, 'cleared', { formation: w.formation, bonus });
      loadFormation(w);
      return;
    }
    if (!w.balls.length) {
      w.lives--;
      emit(w, 'miss', { lives: w.lives });
      if (w.lives <= 0) return finish(w);
      w.power.wide = 0; w.power.pierce = 0;
      w.balls = [{ x: pd.x, y: TUNING.paddleY - TUNING.ballR - 0.5, vx: 0, vy: 0, held: true }];
    }
  }
  function finish(w) {
    w.phase = 'lost';
    const left = w.bricks.filter((b) => b.hp !== Infinity).length, part = w.startBreakables ? 1 - left / w.startBreakables : 0;
    w.result = { phase: 'lost', reason: 'survival', score: w.score, cleared: w.cleared, part,
      headline: w.cleared >= 2 ? 'Dazzling' : w.cleared ? 'Formation cleared' : 'Out of light',
      detail: `${w.cleared} formation${w.cleared === 1 ? '' : 's'} cleared · ${w.broken} crystals` };
    emit(w, 'over', w.result);
  }
  const CrystalCore = { W, H, TOP, COLS, ROWS, TUNING, FORMATIONS, STEP_MS, createWorld, step, validate, generate, bricksFrom, rng };
  root.CrystalCore = CrystalCore;

  // =====================================================================================================
  // drawing and sound
  // =====================================================================================================
  const GEM = {
    clear: ['#bdf4ff', '#6fd8ff', '#2d8fb3'], quartz: ['#ffd9f4', '#ff8ad8', '#a83f8a'], amethyst: ['#e2d0ff', '#a07aff', '#5a3aa8'],
    obsidian: ['#4a4a60', '#26263a', '#121220']
  };
  const PICKCOL = { wide: '#7affc4', multi: '#ffd166', pierce: '#ff7a7a', barrier: '#6fd8ff' };
  const PICKCH = { wide: 'W', multi: 'M', pierce: 'P', barrier: 'B' };
  const SOUNDS = (K) => ({
    launch: (ac, out, t) => K.tone(ac, out, t, { type: 'triangle', f0: 330, f1: 660, dur: 0.1, vol: 0.06 }),
    paddle: (ac, out, t, off) => K.tone(ac, out, t, { type: 'square', f0: 440 + (off || 0) * 80, dur: 0.05, vol: 0.05 }),
    wall: (ac, out, t) => K.tone(ac, out, t, { type: 'sine', f0: 300, dur: 0.03, vol: 0.03 }),
    clear: (ac, out, t) => K.tone(ac, out, t, { type: 'sine', f0: 2093, f1: 2637, dur: 0.07, vol: 0.06 }),
    quartz: (ac, out, t) => K.tone(ac, out, t, { type: 'triangle', f0: 1318, f1: 1568, dur: 0.08, vol: 0.07 }),
    amethyst: (ac, out, t) => K.tone(ac, out, t, { type: 'triangle', f0: 880, f1: 988, dur: 0.1, vol: 0.08 }),
    shatter: (ac, out, t) => { K.hiss(ac, out, t, { f: 4200, f1: 1800, dur: 0.16, vol: 0.07, q: 1.5 }); K.tone(ac, out, t, { type: 'sine', f0: 2637, f1: 1760, dur: 0.12, vol: 0.05 }); },
    thunk: (ac, out, t) => K.tone(ac, out, t, { type: 'square', f0: 140, dur: 0.06, vol: 0.05 }),
    pickup: (ac, out, t) => K.notes(ac, out, t, [784, 988, 1319], 0.05, { type: 'triangle', vol: 0.08, dur: 0.08 }),
    barrier: (ac, out, t) => K.tone(ac, out, t, { type: 'sine', f0: 600, f1: 1200, dur: 0.14, vol: 0.07 }),
    miss: (ac, out, t) => K.tone(ac, out, t, { type: 'triangle', f0: 392, f1: 98, dur: 0.4, vol: 0.08 }),
    cleared: (ac, out, t) => K.notes(ac, out, t, [523, 659, 784, 1047, 1319, 1568], 0.06, { type: 'triangle', vol: 0.07, dur: 0.1 }),
    ready: (ac, out, t) => K.tone(ac, out, t, { type: 'triangle', f0: 523, dur: 0.08, vol: 0.06 }),
    over: (ac, out, t) => K.notes(ac, out, t, [440, 349, 294, 220], 0.14, { type: 'triangle', vol: 0.08, dur: 0.16 }),
    best: (ac, out, t) => K.notes(ac, out, t, [784, 988, 1175, 1568], 0.08, { type: 'square', vol: 0.05, dur: 0.1 })
  });
  const STORE_KEY = 'eyes.arcade.prism.v1';
  function createGame(host) {
    const K = root.ArcadeKit;
    let canvas = null, ctx = null, scale = 1, world = null, phase = 'title', paused = false, newBest = false, sfx = null, fx = null, texts = [], trail = [];
    const record = { best: 0, plays: 0, mostCleared: 0 };
    try { Object.assign(record, host.store.get(STORE_KEY) || {}); } catch (e) {}
    const save = () => { try { host.store.set(STORE_KEY, record); } catch (e) {} };
    const reduced = () => !host.motion(), low = () => host.lowPower();
    function attach(c) { canvas = c; ctx = c.getContext('2d'); sfx = K.synth(host.audio, SOUNDS(K)); fx = K.particles(90); }
    function resize(s) { scale = Math.max(1, s | 0); if (canvas) { canvas.width = W * scale; canvas.height = H * scale; } }
    function title() { phase = 'title'; world = null; }
    function newRound() {
      world = createWorld((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
      phase = 'ready'; paused = false; newBest = false; texts = []; fx.clear(); trail = [];
      record.plays++; save();
      host.emit('start', {}); sfx.play('ready');
    }
    function pause() { if (world && (phase === 'playing' || phase === 'ready')) { paused = true; world.input.vx = 0; } }
    function resume() { paused = false; }
    function stop() { world = null; phase = 'title'; paused = false; if (fx) fx.clear(); texts = []; trail = []; if (sfx) sfx.stop(); canvas = null; ctx = null; }
    function input(st) { if (!world || paused) return; world.input.vx = Math.abs(st.vx) > 0.05 ? st.vx : st.dir === 2 ? 1 : st.dir === 4 ? -1 : 0; if (st.pulse) world.input.launch = true; }
    const nx = (x) => (x / W) * 2 - 1, ny = (y) => (y / H) * 2 - 1;
    function shards(x, y, kind, n) { const c = GEM[kind] || GEM.clear; for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 12 + Math.random() * 30; fx.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 12, g: 70, life: 500 + Math.random() * 300, max: 800, c: c[i % 2] }); } }
    function step(dt) {
      if (!world || paused) { if (fx) fx.step(dt); return; }
      CrystalCore.step(world, dt);
      phase = world.phase;
      fx.step(dt);
      for (const t of texts) t.life -= dt; texts = texts.filter((t) => t.life > 0);
      if (!reduced() && !low()) { for (const b of world.balls) if (!b.held) trail.push({ x: b.x, y: b.y, life: 120 }); }
      for (const q of trail) q.life -= dt; trail = trail.filter((q) => q.life > 0).slice(-18);
      for (const ev of world.events) handle(ev);
      world.events.length = 0;
    }
    function handle(ev) {
      switch (ev.type) {
        case 'go': host.emit('go'); break;
        case 'launch': sfx.play('launch'); break;
        case 'paddle': sfx.play('paddle', ev.off); break;
        case 'wall': sfx.play('wall'); break;
        case 'thunk': sfx.play('thunk'); break;
        case 'crack': sfx.play(ev.kind); shards(ev.x, ev.y, ev.kind, reduced() ? 1 : 3); break;
        case 'break': sfx.play('shatter'); shards(ev.x, ev.y, ev.kind, reduced() ? 3 : 10); if (ev.value >= 100) texts.push({ s: '+' + ev.value, x: ev.x, y: ev.y, life: 700 }); host.emit(ev.kind === 'amethyst' ? 'collect' : 'pop', { rare: ev.kind === 'amethyst', nx: nx(ev.x), ny: ny(ev.y) }); break;
        case 'pickup': sfx.play('pickup'); texts.push({ s: { wide: 'WIDE', multi: 'x3', pierce: 'PIERCE', barrier: 'BARRIER' }[ev.kind], x: ev.x, y: ev.y - 4, life: 900 }); host.emit('collect', { rare: true }); break;
        case 'barrier': sfx.play('barrier'); host.emit('pulse', {}); break;
        case 'miss': sfx.play('miss'); host.emit('hit', { health: ev.lives }); if (ev.lives === 1) host.emit('low'); break;
        case 'cleared': sfx.play('cleared'); texts.push({ s: 'CLEARED', x: W / 2, y: TOP + 40, life: 1300, big: true }); host.emit('wave', { wave: ev.formation + 1 }); break;
        case 'over': {
          const prev = record.best || 0;
          newBest = world.score > prev && world.score > 0;
          if (newBest) record.best = world.score;
          record.mostCleared = Math.max(record.mostCleared || 0, world.cleared);
          const r = world.result;
          r.rating = r.cleared >= 2 || (prev && world.score >= prev * 0.6) ? 'good' : r.cleared >= 1 || r.part >= 0.5 ? 'ok' : 'poor';
          save();
          sfx.play(newBest ? 'best' : 'over');
          host.emit('lose', { ...r, newBest, best: record.best, rating: r.rating });
          if (newBest) host.emit('best', { score: world.score });
          break;
        }
      }
    }
    function drawBrick(b) {
      const c = GEM[b.kind];
      ctx.fillStyle = c[2]; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = c[1]; ctx.fillRect(b.x, b.y, b.w, b.h - 1);
      ctx.fillStyle = c[0]; ctx.fillRect(b.x, b.y, b.w, 1); ctx.fillRect(b.x, b.y, 1, b.h - 1);
      if (b.kind !== 'obsidian') { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(b.x + 2, b.y + 1, 2, 1); }
      // cracks show how many hits are left
      if (b.hp !== Infinity && b.hp < b.max) {
        ctx.fillStyle = c[2];
        ctx.fillRect(b.x + 5, b.y + 1, 1, 2); ctx.fillRect(b.x + 6, b.y + 3, 1, 1);
        if (b.max - b.hp >= 2) { ctx.fillRect(b.x + 8, b.y + 2, 1, 2); ctx.fillRect(b.x + 3, b.y + 3, 1, 1); }
      }
      if (b.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${b.flash / 140 * 0.6})`; ctx.fillRect(b.x, b.y, b.w, b.h); }
    }
    function render() {
      if (!ctx) return;
      const time = performance.now();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#05050c'; ctx.fillRect(0, 0, W, H);
      if (!world) return;
      const w = world, pd = w.paddle;
      ctx.fillStyle = '#0a0a18'; for (let x = 0; x < W; x += 12) ctx.fillRect(x, TOP, 1, H - TOP);
      for (const b of w.bricks) drawBrick(b);
      for (const p of w.pickups) {
        ctx.fillStyle = PICKCOL[p.kind]; ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 2, 7, 5);
        K.text(ctx, PICKCH[p.kind], Math.round(p.x), Math.round(p.y) - 2, '#05050c', 1, 'center');
      }
      if (w.t < w.power.barrier) { ctx.fillStyle = `rgba(111,216,255,${0.55 + 0.25 * Math.sin(time / 120)})`; ctx.fillRect(0, H - 2, W, 1); }
      for (const q of trail) { ctx.fillStyle = `rgba(232,251,255,${q.life / 120 * 0.3})`; ctx.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2); }
      const pierce = w.t < w.power.pierce;
      for (const b of w.balls) { ctx.fillStyle = pierce ? '#ffb0a0' : '#e8fbff'; ctx.fillRect(Math.round(b.x * scale) / scale - 1.5, Math.round(b.y * scale) / scale - 1.5, 3, 3); }
      const px = Math.round((pd.x - pd.w / 2) * scale) / scale;
      if (!low()) { ctx.fillStyle = 'rgba(111,216,255,0.18)'; ctx.fillRect(px - 1, TUNING.paddleY - 1, pd.w + 2, TUNING.paddleH + 2); }
      ctx.fillStyle = '#2d8fb3'; ctx.fillRect(px, TUNING.paddleY, pd.w, TUNING.paddleH);
      ctx.fillStyle = '#6fd8ff'; ctx.fillRect(px, TUNING.paddleY, pd.w, 1);
      for (const q of fx.list) { ctx.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5)); ctx.fillStyle = q.c; ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); }
      ctx.globalAlpha = 1;
      for (const t of texts) { ctx.globalAlpha = Math.min(1, t.life / 300); K.text(ctx, t.s, t.x, t.y, t.big ? '#ffe9ff' : '#e8fbff', t.big ? 2 : 1, 'center'); }
      ctx.globalAlpha = 1;
      if (w.balls.some((b) => b.held) && w.phase === 'playing' && Math.floor(time / 500) % 2) K.text(ctx, 'LAUNCH', W / 2, TUNING.paddleY - 14, '#8fd6cc', 1, 'center');
      if (w.phase === 'ready' && (Math.floor(w.readyLeft / 200) % 2 === 0 || reduced())) { K.text(ctx, 'READY', W / 2 + 1, TOP + 57, '#0a0a18', 2, 'center'); K.text(ctx, 'READY', W / 2, TOP + 56, '#e8fbff', 2, 'center'); }
      if (paused || w.phase === 'lost') { ctx.fillStyle = 'rgba(2,6,8,0.5)'; ctx.fillRect(0, TOP, W, H - TOP); }
      ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, W, TOP); ctx.fillStyle = '#1a1a30'; ctx.fillRect(0, TOP - 1, W, 1);
      K.text(ctx, String(w.score).padStart(5, '0'), 2, 1, '#eef8ff');
      for (let i = 0; i < TUNING.lives; i++) { ctx.fillStyle = i < w.lives ? '#e8fbff' : '#2a2a40'; ctx.fillRect(27 + i * 6, 2, 3, 3); }
      let ix = 48;
      for (const k of ['wide', 'pierce', 'barrier']) if (w.t < w.power[k]) { ctx.fillStyle = PICKCOL[k]; ctx.fillRect(ix, 2, 3, 3); ix += 5; }
      K.text(ctx, 'F' + (w.formation + 1), W - 2, 1, '#ff8ad8', 1, 'right');
    }
    function status() {
      const w = world;
      return {
        phase, paused, score: w ? w.score : 0, best: record.best || 0, newBest, result: w ? w.result : null,
        pulseReady: w && w.balls.some((b) => b.held) ? 1 : 0.25, lives: w ? w.lives : TUNING.lives, formation: w ? w.formation : 0,
        player: w ? { nx: nx(w.paddle.x), ny: ny(TUNING.paddleY) } : null
      };
    }
    function wantsFrames() { return !paused && !!world && (phase === 'ready' || phase === 'playing' || fx.size > 0 || texts.length > 0); }
    return { id: 'prism', title: 'Prism Break', width: W, height: H, stepMs: STEP_MS, attach, resize, title, newRound, pause, resume, stop, input, step, render, status, wantsFrames, debug: { world: () => world, record: () => ({ ...record }) } };
  }
  if (root.EyesArcade && root.EyesArcade.defineGame) root.EyesArcade.defineGame('prism', createGame);
  root.PrismBreakGame = createGame;
})(typeof window === 'undefined' ? globalThis : window);
