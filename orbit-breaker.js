/* EYES 5.0 · Orbit Breaker, an Eye Arcade cartridge.
   A small ship drifts through a dark field of crystalline debris. Break the big pieces into smaller, faster ones;
   clear the field and the next wave arrives with something new in it. Original luminous vector art and synthesised
   sound; inspired by the mechanics of classic space-rock games, built from nothing of theirs.

   Forgiving mobile controls: the stick flies the ship where you point it (no thrust-and-rotate physics; it eases in
   and out), the ship faces the way it flies, and shots lean a little toward a crystal close to your aim. The field
   wraps at its edges. Three hits end the run.

     OrbitCore    the simulation: pure, seeded, fixed 60 Hz steps, no DOM (tested headless)
     the game     what Eye Arcade drives (arcade.js): newRound, pause, resume, stop, input, step, render, status

   Field: 120 × 88 game pixels under an 8 px status strip (120 × 96 in all). Nothing here runs until you press Play. */
'use strict';
(function (root) {
  const W = 120, H = 96, TOP = 8, FH = H - TOP, STEP_MS = 1000 / 60, TAU = Math.PI * 2;
  const TUNING = {
    lives: 3, invulnMs: 2000, readyMs: 1200, calmMs: 1400,
    shipSpeed: 50, shipEase: 9, shipStop: 7, turnRate: 11, shipR: 3,
    bulletSpeed: 115, bulletLife: 760, maxBullets: 6, fireEvery: 210, assistRange: 48, assistCone: 0.28,
    rock: { 3: { r: 9, sp: [7, 13], pts: 20 }, 2: { r: 5.5, sp: [13, 21], pts: 50 }, 1: { r: 3, sp: [19, 28], pts: 100 } },
    speedPerWave: 0.05, speedMax: 1.6, pickupChance: 0.1, pickupLife: 6500, powerMs: 8000, slowMs: 6000,
    cometFrom: 3, cometWarn: 1000, cometEvery: [9000, 14000], cometPts: 150,
    seekerFrom: 5, seekerPts: 200, waveBonus: 100, dangerNear: 15
  };
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const wrapX = (x) => ((x % W) + W) % W;
  const wrapY = (y) => (((y - TOP) % FH) + FH) % FH + TOP;
  // shortest offset across the wrapped field
  const dxw = (a, b) => { let d = b - a; if (d > W / 2) d -= W; if (d < -W / 2) d += W; return d; };
  const dyw = (a, b) => { let d = b - a; if (d > FH / 2) d -= FH; if (d < -FH / 2) d += FH; return d; };
  const dist = (a, b) => Math.hypot(dxw(a.x, b.x), dyw(a.y, b.y));

  // ---------- a run ----------
  function createWorld(seed) {
    const R = rng(seed);
    return {
      R, seed, t: 0, phase: 'ready', readyLeft: TUNING.readyMs, wave: 0, calmUntil: 0, score: 0, lives: TUNING.lives,
      ship: { x: W / 2, y: TOP + FH / 2, vx: 0, vy: 0, a: -Math.PI / 2, invulnUntil: 0, shield: false, shieldUntil: 0 },
      rocks: [], bullets: [], pickups: [], comets: [], power: { spread: 0, slow: 0 },
      fireAt: -1e9, nextComet: Infinity, events: [], input: { vx: 0, vy: 0, fire: false, hold: false },
      result: null, broken: 0, stats: { shots: 0, hits: 0, pickups: 0 }, dangerAt: 0, lowSent: false
    };
  }
  const emit = (w, type, d) => w.events.push(Object.assign({ type }, d || {}));
  function makeRock(w, tier, x, y, kind) {
    const T = TUNING.rock[tier], R = w.R, a = R() * TAU, k = Math.min(TUNING.speedMax, 1 + TUNING.speedPerWave * (w.wave - 1));
    const sp = (T.sp[0] + R() * (T.sp[1] - T.sp[0])) * k, n = 7 + Math.floor(R() * 3), shape = [];
    for (let i = 0; i < n; i++) shape.push(0.72 + R() * 0.32);
    return { tier, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: T.r, shape, ang: R() * TAU, spin: (R() - 0.5) * 1.6, kind: kind || 'rock', hp: kind === 'seeker' ? 2 : 1 };
  }
  // a fair place to appear: on the edge of the field, well away from you
  function edgeSpot(w, minD) {
    const R = w.R;
    for (let i = 0; i < 30; i++) {
      const side = Math.floor(R() * 4), p = side < 2 ? { x: R() * W, y: side ? TOP + 1 : H - 1 } : { x: side === 2 ? 1 : W - 1, y: TOP + R() * FH };
      if (dist(p, w.ship) >= minD) return p;
    }
    return { x: wrapX(w.ship.x + W / 2), y: wrapY(w.ship.y + FH / 2) };
  }
  function startWave(w) {
    w.wave++;
    const n = Math.min(2 + w.wave, 7);
    for (let i = 0; i < n; i++) { const p = edgeSpot(w, 36); w.rocks.push(makeRock(w, 3, p.x, p.y, w.wave >= 3 && i === n - 1 ? 'splinter' : 'rock')); }
    if (w.wave >= TUNING.seekerFrom) { const p = edgeSpot(w, 44); const s = makeRock(w, 2, p.x, p.y, 'seeker'); s.vx *= 0.4; s.vy *= 0.4; w.rocks.push(s); }
    w.nextComet = w.wave >= TUNING.cometFrom ? w.t + TUNING.cometEvery[0] * (0.6 + 0.4 * w.R()) : Infinity;
    emit(w, 'wave', { wave: w.wave });
  }
  function breakRock(w, i, by) {
    const r = w.rocks[i];
    w.rocks.splice(i, 1);
    w.broken++;
    const pts = r.kind === 'seeker' ? TUNING.seekerPts : TUNING.rock[r.tier].pts;
    w.score += pts;
    emit(w, 'break', { x: r.x, y: r.y, tier: r.tier, kind: r.kind, value: pts });
    const kids = r.kind === 'splinter' ? 3 : r.tier > 1 && r.kind !== 'seeker' ? 2 : 0;
    for (let k = 0; k < kids; k++) w.rocks.push(makeRock(w, r.tier - 1, r.x, r.y, r.tier - 1 === 2 && r.kind === 'splinter' ? 'rock' : 'rock'));
    if (r.tier >= 2 && w.R() < TUNING.pickupChance) {
      const kinds = ['shield', 'spread', 'slow'];
      w.pickups.push({ x: r.x, y: r.y, kind: kinds[Math.floor(w.R() * 3)], until: w.t + TUNING.pickupLife });
    }
  }
  function hurt(w) {
    const s = w.ship;
    if (w.t < s.invulnUntil) return false;
    if (s.shield) { s.shield = false; s.invulnUntil = w.t + 700; emit(w, 'shield-break', { x: s.x, y: s.y }); return false; }
    w.lives--;
    s.invulnUntil = w.t + TUNING.invulnMs;
    emit(w, 'hit', { lives: w.lives, x: s.x, y: s.y });
    if (w.lives === 1 && !w.lowSent) { w.lowSent = true; emit(w, 'low'); }
    return true;
  }
  function fire(w) {
    const s = w.ship;
    if (w.bullets.length >= TUNING.maxBullets) return;
    // a little help: lean the shot toward a crystal close to where you're facing
    let aim = s.a, best = TUNING.assistCone;
    for (const r of w.rocks) {
      const dx = dxw(s.x, r.x), dy = dyw(s.y, r.y), d = Math.hypot(dx, dy);
      if (d > TUNING.assistRange) continue;
      let off = Math.atan2(dy, dx) - s.a; off = Math.atan2(Math.sin(off), Math.cos(off));
      if (Math.abs(off) < best) { best = Math.abs(off); aim = s.a + off * 0.8; }
    }
    const shot = (a) => w.bullets.push({ x: s.x + Math.cos(a) * 4, y: s.y + Math.sin(a) * 4, vx: Math.cos(a) * TUNING.bulletSpeed, vy: Math.sin(a) * TUNING.bulletSpeed, until: w.t + TUNING.bulletLife });
    shot(aim);
    if (w.t < w.power.spread) { shot(aim - 0.22); shot(aim + 0.22); }
    w.fireAt = w.t; w.stats.shots++;
    emit(w, 'fire');
  }
  function step(w, dt) {
    dt = dt || STEP_MS;
    const sec = dt / 1000;
    if (w.phase === 'ready') {
      w.readyLeft -= dt;
      if (w.readyLeft <= 0) { w.phase = 'playing'; startWave(w); emit(w, 'go'); }
      return;
    }
    if (w.phase !== 'playing') return;
    w.t += dt;
    const s = w.ship, inp = w.input;
    // the ship: eases toward where the stick points; turns to face the way it flies
    const mag = Math.min(1, Math.hypot(inp.vx, inp.vy));
    const tx = inp.vx * TUNING.shipSpeed, ty = inp.vy * TUNING.shipSpeed, k = 1 - Math.exp(-(mag > 0.05 ? TUNING.shipEase : TUNING.shipStop) * sec);
    s.vx += (tx - s.vx) * k; s.vy += (ty - s.vy) * k;
    s.x = wrapX(s.x + s.vx * sec); s.y = wrapY(s.y + s.vy * sec);
    if (mag > 0.2) { const want = Math.atan2(inp.vy, inp.vx); let d = want - s.a; d = Math.atan2(Math.sin(d), Math.cos(d)); s.a += Math.sign(d) * Math.min(Math.abs(d), TUNING.turnRate * sec); }
    if (s.shield && w.t > s.shieldUntil) s.shield = false;
    // firing: a tap fires at once; holding keeps firing at a steady pace
    if (inp.fire || (inp.hold && w.t - w.fireAt >= TUNING.fireEvery)) { if (w.t - w.fireAt >= 90) fire(w); }
    inp.fire = false;
    const slow = w.t < w.power.slow ? 0.5 : 1;
    for (const r of w.rocks) {
      if (r.kind === 'seeker') {   // a slow crystal that drifts toward you
        const dx = dxw(r.x, s.x), dy = dyw(r.y, s.y), d = Math.hypot(dx, dy) || 1;
        r.vx += (dx / d * 11 - r.vx) * 0.8 * sec; r.vy += (dy / d * 11 - r.vy) * 0.8 * sec;
      }
      r.x = wrapX(r.x + r.vx * sec * slow); r.y = wrapY(r.y + r.vy * sec * slow); r.ang += r.spin * sec * slow;
    }
    for (let i = w.bullets.length - 1; i >= 0; i--) {
      const b = w.bullets[i];
      b.x = wrapX(b.x + b.vx * sec); b.y = wrapY(b.y + b.vy * sec);
      if (w.t > b.until) { w.bullets.splice(i, 1); continue; }
      for (let j = w.rocks.length - 1; j >= 0; j--) {
        const r = w.rocks[j];
        if (dist(b, r) < r.r + 1) {
          w.bullets.splice(i, 1); w.stats.hits++;
          if (--r.hp <= 0) breakRock(w, j, 'shot'); else emit(w, 'chip', { x: r.x, y: r.y });
          break;
        }
      }
    }
    // comets: always announced by a warning line first, then they cross once, fast
    if (w.t >= w.nextComet) {
      const R = w.R, horiz = R() < 0.5, y = TOP + 8 + R() * (FH - 16), x = 8 + R() * (W - 16), dir = R() < 0.5 ? 1 : -1;
      w.comets.push(horiz ? { x: dir > 0 ? -6 : W + 6, y, vx: dir * 70, vy: 0, warnUntil: w.t + TUNING.cometWarn, horiz }
                          : { x, y: dir > 0 ? TOP - 6 : H + 6, vx: 0, vy: dir * 60, warnUntil: w.t + TUNING.cometWarn, horiz });
      w.nextComet = w.t + TUNING.cometEvery[0] + R() * (TUNING.cometEvery[1] - TUNING.cometEvery[0]);
      emit(w, 'warn', { x: horiz ? W / 2 : x, y: horiz ? y : TOP + FH / 2 });
    }
    for (let i = w.comets.length - 1; i >= 0; i--) {
      const c = w.comets[i];
      if (w.t < c.warnUntil) continue;
      c.x += c.vx * sec * slow; c.y += c.vy * sec * slow;
      if (c.x < -10 || c.x > W + 10 || c.y < TOP - 10 || c.y > H + 10) { w.comets.splice(i, 1); continue; }
      for (let j = w.bullets.length - 1; j >= 0; j--) if (Math.hypot(w.bullets[j].x - c.x, w.bullets[j].y - c.y) < 4) { w.bullets.splice(j, 1); w.comets.splice(i, 1); w.score += TUNING.cometPts; emit(w, 'break', { x: c.x, y: c.y, tier: 1, kind: 'comet', value: TUNING.cometPts }); break; }
    }
    // touching
    let near = Infinity, nearR = null;
    for (let j = w.rocks.length - 1; j >= 0; j--) {
      const r = w.rocks[j], d = dist(s, r);
      if (d < near) { near = d; nearR = r; }
      if (d < r.r + TUNING.shipR - 0.5) {
        const shielded = s.shield;
        if (hurt(w) || shielded) breakRock(w, j, 'ship');
      }
    }
    for (const c of w.comets) if (w.t >= c.warnUntil && Math.hypot(c.x - s.x, c.y - s.y) < 4) hurt(w);
    for (let i = w.pickups.length - 1; i >= 0; i--) {
      const p = w.pickups[i];
      if (w.t > p.until) { w.pickups.splice(i, 1); continue; }
      if (dist(p, s) < 7) {
        w.pickups.splice(i, 1); w.stats.pickups++;
        if (p.kind === 'shield') { s.shield = true; s.shieldUntil = w.t + TUNING.powerMs * 1.4; }
        else if (p.kind === 'spread') w.power.spread = w.t + TUNING.powerMs;
        else w.power.slow = w.t + TUNING.slowMs;
        emit(w, 'pickup', { kind: p.kind, x: p.x, y: p.y });
      }
    }
    if (nearR && near < TUNING.dangerNear + nearR.r && w.t - w.dangerAt > 280) { w.dangerAt = w.t; emit(w, 'danger', { x: nearR.x, y: nearR.y, d: near }); }
    if (w.lives <= 0) return finish(w);
    if (!w.rocks.length) {
      if (!w.calmUntil) { w.calmUntil = w.t + TUNING.calmMs; w.score += TUNING.waveBonus * w.wave; emit(w, 'clear', { wave: w.wave, bonus: TUNING.waveBonus * w.wave }); }
      else if (w.t >= w.calmUntil) { w.calmUntil = 0; startWave(w); }
    }
  }
  function finish(w) {
    w.phase = 'lost';
    const secs = Math.round(w.t / 1000);
    w.result = { phase: 'lost', reason: 'survival', score: w.score, wave: w.wave, broken: w.broken, headline: w.wave >= 4 ? 'What a flight' : 'Ship down',
      detail: `Wave ${w.wave} · ${w.broken} crystals broken · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` };
    emit(w, 'over', w.result);
  }
  const OrbitCore = { W, H, TOP, TUNING, STEP_MS, createWorld, step, rng };
  root.OrbitCore = OrbitCore;

  // =====================================================================================================
  // drawing and sound
  // =====================================================================================================
  const SOUNDS = (K) => ({
    fire: (ac, out, t) => K.tone(ac, out, t, { type: 'square', f0: 1320, f1: 660, dur: 0.06, vol: 0.035 }),
    crack: (ac, out, t, big) => { K.hiss(ac, out, t, { f: big ? 500 : 1400, f1: big ? 160 : 600, dur: big ? 0.22 : 0.12, vol: big ? 0.13 : 0.09, q: 0.9 }); K.tone(ac, out, t, { type: 'triangle', f0: big ? 220 : 520, f1: big ? 110 : 260, dur: 0.12, vol: 0.05 }); },
    chime: (ac, out, t) => K.tone(ac, out, t, { type: 'sine', f0: 1760, f1: 2640, dur: 0.12, vol: 0.06 }),
    hit: (ac, out, t) => { K.tone(ac, out, t, { type: 'sawtooth', f0: 300, f1: 70, dur: 0.35, vol: 0.08 }); K.hiss(ac, out, t, { f: 300, dur: 0.3, vol: 0.1 }); },
    shield: (ac, out, t) => K.tone(ac, out, t, { type: 'sine', f0: 900, f1: 300, dur: 0.18, vol: 0.08 }),
    pickup: (ac, out, t) => K.notes(ac, out, t, [880, 1175, 1568], 0.05, { type: 'triangle', vol: 0.08, dur: 0.08 }),
    warn: (ac, out, t) => K.notes(ac, out, t, [740, 740], 0.12, { type: 'square', vol: 0.035, dur: 0.06 }),
    wave: (ac, out, t) => K.notes(ac, out, t, [392, 523, 659, 784], 0.07, { type: 'triangle', vol: 0.07, dur: 0.1 }),
    ready: (ac, out, t) => K.tone(ac, out, t, { type: 'triangle', f0: 440, dur: 0.1, vol: 0.06 }),
    over: (ac, out, t) => K.notes(ac, out, t, [330, 262, 196, 147], 0.15, { type: 'triangle', vol: 0.08, dur: 0.18 }),
    best: (ac, out, t) => K.notes(ac, out, t, [523, 659, 784, 1047, 1319], 0.07, { type: 'square', vol: 0.05, dur: 0.1 })
  });
  const PICK = { shield: '#7fe3ff', spread: '#ffcf7a', slow: '#c7a6ff' };
  const STORE_KEY = 'eyes.arcade.orbit.v1';
  function createGame(host) {
    const K = root.ArcadeKit;
    let canvas = null, ctx = null, scale = 1, world = null, phase = 'title', paused = false, newBest = false, sfx = null, stars = null, fx = null, texts = [], flash = 0;
    const record = { best: 0, plays: 0, bestWave: 0 };
    try { Object.assign(record, host.store.get(STORE_KEY) || {}); } catch (e) {}
    const save = () => { try { host.store.set(STORE_KEY, record); } catch (e) {} };
    const reduced = () => !host.motion(), low = () => host.lowPower();
    function attach(c) {
      canvas = c; ctx = c.getContext('2d');
      sfx = K.synth(host.audio, SOUNDS(K));
      fx = K.particles(80);
      const R = rng(42); stars = [];
      for (let i = 0; i < 38; i++) stars.push({ x: R() * W, y: TOP + R() * FH, b: R() });
    }
    function resize(s) { scale = Math.max(1, s | 0); if (canvas) { canvas.width = W * scale; canvas.height = H * scale; } }
    function title() { phase = 'title'; world = null; }
    function newRound() {
      world = createWorld((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
      phase = 'ready'; paused = false; newBest = false; texts = []; fx.clear(); flash = 0;
      record.plays++; save();
      host.emit('start', {});
      sfx.play('ready');
    }
    function pause() { if (world && (phase === 'playing' || phase === 'ready')) { paused = true; world.input.vx = world.input.vy = 0; world.input.hold = false; } }
    function resume() { paused = false; }
    function stop() { world = null; phase = 'title'; paused = false; if (fx) fx.clear(); texts = []; if (sfx) sfx.stop(); canvas = null; ctx = null; }
    function input(st) {
      if (!world || paused) return;
      world.input.vx = st.vx || 0; world.input.vy = st.vy || 0; world.input.hold = !!st.hold;
      if (st.pulse) world.input.fire = true;
    }
    const nx = (x) => (x / W) * 2 - 1, ny = (y) => (y / H) * 2 - 1;
    function burst(x, y, n, col, sp) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = (0.4 + Math.random()) * (sp || 30); fx.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 380 + Math.random() * 300, max: 680, c: col }); } }
    function step(dt) {
      if (!world || paused) { if (fx) fx.step(dt); return; }
      const before = world.phase;
      OrbitCore.step(world, dt);
      phase = world.phase;
      fx.step(dt);
      for (const t of texts) t.life -= dt;
      texts = texts.filter((t) => t.life > 0);
      if (flash > 0) flash -= dt;
      for (const ev of world.events) handle(ev);
      world.events.length = 0;
      if (before !== 'lost' && phase === 'lost') {}
    }
    function handle(ev) {
      switch (ev.type) {
        case 'go': host.emit('go'); break;
        case 'fire': sfx.play('fire'); break;
        case 'break': {
          sfx.play(ev.tier >= 2 ? 'crack' : 'chime', ev.tier >= 2);
          burst(ev.x, ev.y, reduced() ? 3 : ev.tier * 5 + 3, ev.kind === 'comet' ? '#ffe9b8' : '#9ff0ff', 20 + ev.tier * 8);
          if (ev.value >= 100) texts.push({ s: '+' + ev.value, x: ev.x, y: ev.y, life: 700 });
          host.emit(ev.tier === 1 ? 'pop' : 'collect', { nx: nx(ev.x), ny: ny(ev.y) });
          break;
        }
        case 'chip': sfx.play('chime'); burst(ev.x, ev.y, 3, '#ffcf7a', 20); break;
        case 'hit': sfx.play('hit'); flash = 260; burst(ev.x, ev.y, reduced() ? 4 : 14, '#ffd38a', 40); host.emit('hit', { health: ev.lives }); break;
        case 'shield-break': sfx.play('shield'); burst(ev.x, ev.y, 8, '#7fe3ff', 30); host.emit('pulse', {}); break;
        case 'low': host.emit('low'); break;
        case 'pickup': sfx.play('pickup'); texts.push({ s: ev.kind, x: ev.x, y: ev.y, life: 900 }); host.emit('collect', { rare: true, nx: nx(ev.x), ny: ny(ev.y) }); break;
        case 'warn': sfx.play('warn'); host.emit('warn', { nx: nx(ev.x), ny: ny(ev.y) }); break;
        case 'danger': host.emit('danger', { nx: nx(ev.x), ny: ny(ev.y), d: ev.d / 8 }); break;
        case 'wave': if (ev.wave > 1) { sfx.play('wave'); host.emit('wave', { wave: ev.wave }); } texts.push({ s: 'WAVE ' + ev.wave, x: W / 2, y: TOP + 30, life: 1300, big: true }); break;
        case 'clear': texts.push({ s: '+' + ev.bonus, x: W / 2, y: TOP + 44, life: 1100 }); break;
        case 'over': {
          const prev = record.best || 0;
          newBest = world.score > prev && world.score > 0;
          if (newBest) record.best = world.score;
          record.bestWave = Math.max(record.bestWave || 0, world.wave);
          world.result.rating = world.wave >= 4 || (prev && world.score >= prev * 0.6) ? 'good' : world.wave >= 2 ? 'ok' : 'poor';
          save();
          sfx.play(newBest ? 'best' : 'over');
          host.emit('lose', { ...world.result, newBest, best: record.best, rating: world.result.rating });
          if (newBest) host.emit('best', { score: world.score });
          break;
        }
      }
    }
    // ---------- drawing (vector lines in game pixels, scaled whole) ----------
    function glowStroke(col, wide) {
      if (!low()) { ctx.globalAlpha = 0.25; ctx.lineWidth = wide || 2.2; ctx.strokeStyle = col; ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.lineWidth = 0.9; ctx.strokeStyle = col; ctx.stroke();
    }
    function wrapDraw(x, y, r, fn) {   // things near an edge are also drawn on the other side
      fn(x, y);
      if (x < r) fn(x + W, y); if (x > W - r) fn(x - W, y);
      if (y < TOP + r) fn(x, y + FH); if (y > H - r) fn(x, y - FH);
    }
    function drawRock(r) {
      const col = r.kind === 'seeker' ? '#ff9fd0' : r.kind === 'splinter' ? '#c7a6ff' : r.tier === 1 ? '#bff6ff' : '#7fe3ff';
      wrapDraw(r.x, r.y, r.r + 1, (x, y) => {
        ctx.beginPath();
        r.shape.forEach((k, i) => { const a = r.ang + (i / r.shape.length) * TAU, px = x + Math.cos(a) * r.r * k, py = y + Math.sin(a) * r.r * k; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.closePath();
        ctx.fillStyle = 'rgba(40,110,140,0.18)'; ctx.fill();
        glowStroke(col);
        if (r.tier === 3 && !low()) { ctx.beginPath(); ctx.moveTo(x - r.r * 0.3, y - r.r * 0.2); ctx.lineTo(x + r.r * 0.15, y + r.r * 0.25); ctx.strokeStyle = 'rgba(191,246,255,0.35)'; ctx.lineWidth = 0.6; ctx.stroke(); }
      });
    }
    function drawShip(s, time) {
      const blink = world.t < s.invulnUntil && Math.floor(time / 90) % 2 === 0;
      if (blink) return;
      wrapDraw(s.x, s.y, 6, (x, y) => {
        const c = Math.cos(s.a), si = Math.sin(s.a), P = (px, py) => [x + px * c - py * si, y + px * si + py * c];
        ctx.beginPath(); const p0 = P(5, 0), p1 = P(-3.5, -3.2), p2 = P(-1.8, 0), p3 = P(-3.5, 3.2);
        ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath();
        ctx.fillStyle = 'rgba(255,200,120,0.18)'; ctx.fill(); glowStroke('#ffd38a');
        const moving = Math.hypot(s.vx, s.vy) > 8;
        if (moving && !reduced()) { const f = P(-3 - Math.random() * 2.5, 0); ctx.fillStyle = '#ffb35c'; ctx.fillRect(f[0] - 0.5, f[1] - 0.5, 1, 1); }
        if (s.shield) { ctx.beginPath(); ctx.arc(x, y, 6.5, 0, TAU); glowStroke('rgba(127,227,255,0.85)'); }
      });
    }
    function render() {
      if (!ctx) return;
      const time = performance.now();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = '#03060c'; ctx.fillRect(0, 0, W, H);
      for (const st of stars) { ctx.fillStyle = st.b > 0.7 ? '#56708a' : '#24384c'; ctx.fillRect(Math.round(st.x), Math.round(st.y), 1, 1); }
      if (world) {
        const w = world;
        ctx.save(); ctx.beginPath(); ctx.rect(0, TOP, W, FH); ctx.clip();
        if (w.t < w.power.slow) { ctx.fillStyle = 'rgba(120,90,200,0.08)'; ctx.fillRect(0, TOP, W, FH); }
        for (const c of w.comets) {
          if (w.t < c.warnUntil) {   // the warning line
            ctx.strokeStyle = `rgba(255,190,110,${0.25 + 0.25 * Math.sin(time / 60)})`; ctx.lineWidth = 0.6; ctx.setLineDash([2, 2]); ctx.beginPath();
            if (c.horiz) { ctx.moveTo(0, c.y); ctx.lineTo(W, c.y); } else { ctx.moveTo(c.x, TOP); ctx.lineTo(c.x, H); }
            ctx.stroke(); ctx.setLineDash([]);
          } else {
            ctx.fillStyle = '#fff2c8'; ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 3, 3);
            ctx.fillStyle = 'rgba(255,200,120,0.5)'; ctx.fillRect(Math.round(c.x - Math.sign(c.vx) * 4) - 1, Math.round(c.y - Math.sign(c.vy) * 4), Math.abs(c.vx) ? 4 : 1, Math.abs(c.vy) ? 4 : 1);
          }
        }
        for (const r of w.rocks) drawRock(r);
        for (const p of w.pickups) {
          const left = p.until - w.t;
          if (left < 1500 && Math.floor(time / 120) % 2) continue;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3 + 0.6 * Math.sin(time / 180), 0, TAU); glowStroke(PICK[p.kind]);
          ctx.fillStyle = PICK[p.kind]; ctx.fillRect(Math.round(p.x) - 0.5, Math.round(p.y) - 0.5, 1, 1);
        }
        ctx.fillStyle = '#fff2c8';
        for (const b of w.bullets) ctx.fillRect(Math.round(b.x * scale) / scale - 0.5, Math.round(b.y * scale) / scale - 0.5, 1.2, 1.2);
        if (w.phase !== 'lost') drawShip(w.ship, time);
        for (const q of fx.list) { ctx.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5)); ctx.fillStyle = q.c; ctx.fillRect(q.x - 0.5, q.y - 0.5, 1, 1); }
        ctx.globalAlpha = 1;
        for (const t of texts) { ctx.globalAlpha = Math.min(1, t.life / 300); K.text(ctx, t.s, t.x, t.y - (t.big ? 0 : (700 - t.life) / 60), t.big ? '#ffd38a' : '#dff8ff', t.big ? 2 : 1, 'center'); }
        ctx.globalAlpha = 1;
        if (flash > 0) { ctx.fillStyle = `rgba(255,120,80,${flash / 260 * 0.16})`; ctx.fillRect(0, TOP, W, FH); }
        if (w.phase === 'ready' && (Math.floor(w.readyLeft / 200) % 2 === 0 || reduced())) { K.text(ctx, 'READY', W / 2 + 1, TOP + 37, '#1a1206', 2, 'center'); K.text(ctx, 'READY', W / 2, TOP + 36, '#ffe9b8', 2, 'center'); }
        if (paused || w.phase === 'lost') { ctx.fillStyle = 'rgba(2,6,8,0.5)'; ctx.fillRect(0, TOP, W, FH); }
        ctx.restore();
        // the status strip
        ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, W, TOP); ctx.fillStyle = '#1a2a3a'; ctx.fillRect(0, TOP - 1, W, 1);
        K.text(ctx, String(w.score).padStart(5, '0'), 2, 1, '#e4f7ff');
        for (let i = 0; i < TUNING.lives; i++) { ctx.fillStyle = i < w.lives ? '#ffd38a' : '#3a3024'; ctx.fillRect(26 + i * 6, 2, 4, 1); ctx.fillRect(27 + i * 6, 3, 2, 2); }
        if (w.ship.shield) { ctx.fillStyle = PICK.shield; ctx.fillRect(46, 2, 3, 3); }
        if (w.t < w.power.spread) { ctx.fillStyle = PICK.spread; ctx.fillRect(51, 2, 3, 3); }
        if (w.t < w.power.slow) { ctx.fillStyle = PICK.slow; ctx.fillRect(56, 2, 3, 3); }
        K.text(ctx, 'W' + Math.max(1, w.wave), W - 2, 1, '#7fe3ff', 1, 'right');
      }
    }
    function status() {
      const w = world;
      return {
        phase, paused, score: w ? w.score : 0, best: record.best || 0, newBest, result: w ? w.result : null,
        pulseReady: 1, wave: w ? w.wave : 0, lives: w ? w.lives : TUNING.lives,
        player: w ? { nx: nx(w.ship.x), ny: ny(w.ship.y) } : null
      };
    }
    function wantsFrames() { return !paused && !!world && (phase === 'ready' || phase === 'playing' || fx.size > 0 || texts.length > 0); }
    return { id: 'orbit', title: 'Orbit Breaker', width: W, height: H, stepMs: STEP_MS, attach, resize, title, newRound, pause, resume, stop, input, step, render, status, wantsFrames, debug: { world: () => world, record: () => ({ ...record }) } };
  }
  if (root.EyesArcade && root.EyesArcade.defineGame) root.EyesArcade.defineGame('orbit', createGame);
  root.OrbitBreakerGame = createGame;
})(typeof window === 'undefined' ? globalThis : window);
