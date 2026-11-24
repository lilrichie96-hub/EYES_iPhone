/* EYES 4.4.4 · Tunnelbug, the first Pocket Arcade game.
   A tiny luminous tunnelling creature digs through the earth inside EYES, gathering energy crystals while two
   kinds of little organisms live in the chambers: grubs wander the tunnels, stalkers sometimes hunt.

   This file holds two things:
     TunnelbugCore   the simulation. Pure, deterministic for a seed, no DOM. Fixed 60 Hz steps.
     the game        what Pocket Arcade (arcade.js) drives: start, pause, resume, stop, step, render, input,
                     status, and the events it reports to the creature (collect, danger, hit, low, pulse, win,
                     best, lose …).
   Drawing lives in tunnelbug-render.js and sound in tunnelbug-audio.js. Nothing here runs until Arcade opens.

   Field: 15 × 11 tiles of 8 px (120 × 88) under an 8 px status strip: 120 × 96 game pixels in all. */
'use strict';
(function (root) {
  const COLS = 15, ROWS = 11, TILE = 8, HUD = 8;
  const WIDTH = COLS * TILE, HEIGHT = ROWS * TILE + HUD;
  const STEP_MS = 1000 / 60;
  const DIRT = 0, TUNNEL = 1, ROCK = 2;
  // directions: 1 up, 2 right, 3 down, 4 left
  const DX = [0, 0, 1, 0, -1], DY = [0, -1, 0, 1, 0], OPP = [0, 3, 4, 1, 2], BIT = [0, 1, 2, 4, 8];
  const EPS = 1e-6;

  const TUNING = {
    roundMs: 90000, health: 3, invulnMs: 1800, readyMs: 1300,
    speedDirt: 2.6, speedTunnel: 4.2,                    // tiles per second
    grubSpeed: 2.4, hunterSpeed: 2.3, huntSpeed: 3.2, burrowSpeed: 1.9,
    escalate: 0.28,                                      // enemies are this much faster by the final second
    firstHunt: 6000, huntEvery: [8500, 5000], huntWarn: 900, huntFor: 4200,
    pulseCooldown: 6000, pulseRadius: 2.0, pulseStun: 2000, pulseGrow: 260,
    hitStun: 1300, popRespawn: 6000, spawnShimmer: 1100,
    hitRadius: 0.62, riseMs: 650, crystal: 25, rare: 100, pop: 100,
    // three waves of crystals; each new wave grows in riskier places and stirs the chambers
    waves: [{ normals: 6, rares: 0 }, { normals: 6, rares: 1 }, { normals: 5, rares: 2 }],
    normals: 6, rares: 0, dangerNear: 3.2
  };

  /* Layout legend: '.' earth  '#' stone  ' ' an old tunnel  'P' you  'W' grub chamber  'H' stalker chamber
     'c' a place a crystal may grow  'R' a place a rich crystal may grow (always near danger)
     Each round picks one layout and grows its crystals in a seeded subset of the marked places. */
  const LAYOUTS = [
    { name: 'Rootways', rows: [
      '..c..  P  ..c..',
      '......#........',
      '.c...........c.',
      '...#.  W  .#...',
      '..c...........R',
      '......c..c.....',
      '#..#.......#...',
      '.c.  H  ....c..',
      '...R.......#...',
      '..#...c...  W  ',
      '.c....#.....c..'
    ] },
    { name: 'Glow Pockets', rows: [
      '.c...  P  ...c.',
      '...#.......#...',
      '..c...#.#...c..',
      'W  .........  W',
      '....c.#.#.c....',
      '..#...   ...#..',
      '.c...# H #...c.',
      '....R.....R....',
      '..#...c.c...#..',
      '.c....#.#....c.',
      '...c.......c...'
    ] },
    { name: 'Deep Vein', rows: [
      '...c.  P  .c...',
      '.c.....#......c',
      '....#.....#....',
      '..c...c....c...',
      '.#..R.....#.R..',
      '..  W         .',
      '...#....c..#...',
      '.c.....#.......',
      '...c.#...  H .c',
      '..R......c...R.',
      '.c..#.....c....'
    ] }
  ];

  function rng(seed) {                    // mulberry32
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const idx = (x, y) => y * COLS + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

  // ---------- a round ----------
  function createWorld(opts) {
    const o = opts || {};
    const layoutIndex = ((o.layout | 0) % LAYOUTS.length + LAYOUTS.length) % LAYOUTS.length;
    const L = LAYOUTS[layoutIndex];
    const seed = (o.seed == null ? 1 : o.seed) >>> 0;
    const R = rng(seed);
    const tiles = new Uint8Array(COLS * ROWS), links = new Uint8Array(COLS * ROWS), items = new Uint8Array(COLS * ROWS);
    const normals = [], rares = [], wNests = [], hNests = [];
    let start = { x: 7, y: 0 };
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const ch = L.rows[y][x], i = idx(x, y);
      tiles[i] = ch === '#' ? ROCK : ch === ' ' || ch === 'P' || ch === 'W' || ch === 'H' ? TUNNEL : DIRT;
      if (ch === 'c') normals.push(i);
      else if (ch === 'R') rares.push(i);
      else if (ch === 'P') start = { x, y };
      else if (ch === 'W') wNests.push({ x, y });
      else if (ch === 'H') hNests.push({ x, y });
    }
    // old tunnels are joined to their neighbours
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (tiles[idx(x, y)] !== TUNNEL) continue;
      for (const d of [2, 3]) {
        const nx = x + DX[d], ny = y + DY[d];
        if (inside(nx, ny) && tiles[idx(nx, ny)] === TUNNEL) { links[idx(x, y)] |= BIT[d]; links[idx(nx, ny)] |= BIT[OPP[d]]; }
      }
    }
    const pick = (list, n) => {
      const a = list.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a.slice(0, Math.min(n, a.length));
    };
    const usedNormals = new Set(), usedRares = new Set();
    const first = o.waves ? o.waves[0] : TUNING.waves[0];
    for (const i of pick(normals, o.normals != null ? o.normals : first.normals)) { items[i] = 1; usedNormals.add(i); }
    for (const i of pick(rares, o.rares != null ? o.rares : first.rares)) { items[i] = 2; usedRares.add(i); }
    let crystals = 0;
    for (let i = 0; i < items.length; i++) if (items[i]) crystals++;

    const enemies = [];
    let nextId = 1;
    const enemy = (kind, nest, at) => ({
      id: nextId++, kind, nest: { ...nest }, x: nest.x, y: nest.y, px: nest.x, py: nest.y, dir: 0, face: 2,
      mode: 'patrol', resume: 'patrol', until: 0, stunUntil: 0, nextHunt: kind === 'hunter' ? TUNING.firstHunt + R() * 1500 : Infinity,
      huntUntil: 0, spawnUntil: at || 0, anim: R() * 1000
    });
    for (const n of wNests) enemies.push(enemy('grub', n));
    for (const n of hNests) enemies.push(enemy('hunter', n));

    return {
      layout: layoutIndex, layoutName: L.name, seed, R, tiles, links, items,
      wNests, hNests, crystals, crystalsLeft: crystals, collected: 0,
      wave: 1, waves: o.waves || TUNING.waves, places: { normals, rares, usedNormals, usedRares }, pick,
      phase: 'ready', t: 0, readyLeft: TUNING.readyMs, score: 0, health: TUNING.health, invulnUntil: 0,
      pulseAt: -1e9, pulse: null, result: null, extraSpawned: false,
      player: { x: start.x, y: start.y, px: start.x, py: start.y, dir: 0, face: 2, tile: idx(start.x, start.y), moving: false, inDirt: false, walk: 0 },
      start, enemies, nextEnemyId: () => nextId++, makeEnemy: enemy,
      input: { dir: 0, pulse: false },
      events: [], dangerAt: 0, lowSent: false, stats: { digs: 0, hits: 0, pulses: 0, pops: 0, stuns: 0 }
    };
  }

  const tileAt = (w, x, y) => (inside(x, y) ? w.tiles[idx(x, y)] : ROCK);
  const passable = (w, x, y) => inside(x, y) && w.tiles[idx(x, y)] !== ROCK;
  const linked = (w, x, y, d) => inside(x, y) && (w.links[idx(x, y)] & BIT[d]) !== 0;
  const speedMul = (w) => 1 + TUNING.escalate * Math.min(1, w.t / TUNING.roundMs);
  const emit = (w, type, data) => { w.events.push(Object.assign({ type, at: w.t }, data || {})); };

  // ---------- you ----------
  function movePlayer(w, dt) {
    const p = w.player;
    p.px = p.x; p.py = p.y;
    const want = w.input.dir | 0;
    p.moving = false;
    if (!want) return;
    let budget = dt / 1000;                // seconds of travel left this step
    for (let guard = 0; guard < 4 && budget > EPS; guard++) {
      const horiz = want === 2 || want === 4;
      // turning: first slide along the lane you're in to the nearest tile centre, then go the new way
      const lane = horiz ? p.y : p.x, laneCentre = Math.round(lane);
      if (Math.abs(lane - laneCentre) > EPS) {
        const toward = laneCentre > lane ? (horiz ? 3 : 2) : (horiz ? 1 : 4);
        const nx = Math.round(p.x), ny = Math.round(p.y);
        const sp = w.tiles[idx(nx, ny)] === TUNNEL ? TUNING.speedTunnel : TUNING.speedDirt;
        const dist = Math.abs(laneCentre - lane), go = Math.min(dist, budget * sp);
        if (horiz) p.y += Math.sign(laneCentre - lane) * go; else p.x += Math.sign(laneCentre - lane) * go;
        if (go >= dist - EPS) { if (horiz) p.y = laneCentre; else p.x = laneCentre; }
        p.dir = toward; p.moving = true;
        budget -= go / sp;
        afterMove(w);
        continue;
      }
      const a = horiz ? p.x : p.y, sign = want === 2 || want === 3 ? 1 : -1;
      const next = sign > 0 ? Math.floor(a + EPS) + 1 : Math.ceil(a - EPS) - 1;
      const tx = horiz ? next : Math.round(p.x), ty = horiz ? Math.round(p.y) : next;
      p.face = want;
      if (!passable(w, tx, ty)) break;     // stone or the edge: you stop at the centre you're on
      const sp = w.tiles[idx(tx, ty)] === TUNNEL ? TUNING.speedTunnel : TUNING.speedDirt;
      const dist = Math.abs(next - a), go = Math.min(dist, budget * sp);
      if (horiz) p.x += sign * go; else p.y += sign * go;
      if (go >= dist - EPS) { if (horiz) p.x = next; else p.y = next; }
      p.dir = want; p.moving = true;
      p.inDirt = w.tiles[idx(tx, ty)] !== TUNNEL;
      budget -= go / sp;
      afterMove(w);
    }
    if (p.moving) p.walk += dt;
  }
  function afterMove(w) {
    const p = w.player, tx = Math.round(p.x), ty = Math.round(p.y), ti = idx(tx, ty);
    if (ti === p.tile) return;
    const fx = p.tile % COLS, fy = (p.tile / COLS) | 0;
    let d = 0;
    for (let k = 1; k <= 4; k++) if (fx + DX[k] === tx && fy + DY[k] === ty) d = k;
    if (w.tiles[ti] === DIRT) { w.tiles[ti] = TUNNEL; w.stats.digs++; emit(w, 'dig', { x: tx, y: ty }); }
    if (d) { w.links[p.tile] |= BIT[d]; w.links[ti] |= BIT[OPP[d]]; }
    p.tile = ti;
    const item = w.items[ti];
    if (item) {
      w.items[ti] = 0;
      w.crystalsLeft--; w.collected++;
      const value = item === 2 ? TUNING.rare : TUNING.crystal;
      w.score += value;
      emit(w, item === 2 ? 'rare' : 'collect', { x: tx, y: ty, value, left: w.crystalsLeft });
    }
  }

  // ---------- them ----------
  function bfsFirstStep(w, sx, sy, tx, ty, limit) {
    if (sx === tx && sy === ty) return 0;
    const start = idx(sx, sy), goal = idx(tx, ty);
    const prev = new Int16Array(COLS * ROWS).fill(-1), first = new Uint8Array(COLS * ROWS);
    const q = [start]; prev[start] = start;
    for (let h = 0; h < q.length && q.length < (limit || 400); h++) {
      const c = q[h], cx = c % COLS, cy = (c / COLS) | 0;
      for (let d = 1; d <= 4; d++) {
        if (!(w.links[c] & BIT[d])) continue;
        const nx = cx + DX[d], ny = cy + DY[d];
        if (!inside(nx, ny)) continue;
        const n = idx(nx, ny);
        if (prev[n] !== -1) continue;
        prev[n] = c; first[n] = c === start ? d : first[c];
        if (n === goal) return first[n];
        q.push(n);
      }
    }
    return -1;
  }
  function nearestTunnel(w, x, y) {
    let best = null, bd = Infinity;
    for (let i = 0; i < w.tiles.length; i++) {
      if (w.tiles[i] !== TUNNEL || !w.links[i]) continue;
      const tx = i % COLS, ty = (i / COLS) | 0, d = Math.abs(tx - x) + Math.abs(ty - y);
      if (d < bd) { bd = d; best = { x: tx, y: ty }; }
    }
    return best;
  }
  function chooseDir(w, e) {
    const cx = Math.round(e.x), cy = Math.round(e.y), here = idx(cx, cy);
    if (e.mode === 'burrow') {
      // through the earth, straight toward you (or home once the hunt is over); never through stone
      const target = w.t < e.huntUntil ? { x: Math.round(w.player.x), y: Math.round(w.player.y) } : e.home || nearestTunnel(w, cx, cy) || e.nest;
      const dx = target.x - cx, dy = target.y - cy, prefs = [];
      const hx = dx > 0 ? 2 : 4, vy = dy > 0 ? 3 : 1;
      if (Math.abs(dx) >= Math.abs(dy)) { if (dx) prefs.push(hx); if (dy) prefs.push(vy); }
      else { if (dy) prefs.push(vy); if (dx) prefs.push(hx); }
      for (let d = 1; d <= 4; d++) if (!prefs.includes(d)) prefs.push(d);
      for (const d of prefs) if (d !== OPP[e.dir] && passable(w, cx + DX[d], cy + DY[d])) return d;
      for (const d of prefs) if (passable(w, cx + DX[d], cy + DY[d])) return d;
      return 0;
    }
    const opts = [];
    for (let d = 1; d <= 4; d++) if (w.links[here] & BIT[d]) opts.push(d);
    if (!opts.length) return 0;
    if (e.mode === 'hunt') {
      const s = bfsFirstStep(w, cx, cy, Math.round(w.player.x), Math.round(w.player.y));
      if (s > 0) return s;
      if (s === 0) return 0;
      e.mode = 'burrow';                    // no tunnel leads to you: it slips into the earth (harmless, eyes only)
      return chooseDir(w, e);
    }
    const fwd = opts.filter((d) => d !== OPP[e.dir]);
    const pool = fwd.length ? fwd : opts;
    if (e.dir && pool.includes(e.dir) && w.R() < 0.55) return e.dir;
    return pool[Math.floor(w.R() * pool.length)];
  }
  function moveEnemy(w, e, dt) {
    e.px = e.x; e.py = e.y;
    e.anim += dt;
    if (e.mode === 'gone' || e.mode === 'warn') return;
    if (e.mode === 'spawn') { if (w.t >= e.spawnUntil) e.mode = 'patrol'; return; }
    if (e.mode === 'rise') { if (w.t >= e.until) e.mode = e.resume === 'hunt' && w.t < e.huntUntil ? 'hunt' : 'patrol'; return; }
    if (e.mode === 'stunned') {
      if (w.t >= e.stunUntil) e.mode = e.resume === 'burrow' && tileAt(w, Math.round(e.x), Math.round(e.y)) !== TUNNEL ? 'burrow' : e.resume === 'hunt' && w.t < e.huntUntil ? 'hunt' : e.resume === 'burrow' ? 'burrow' : 'patrol';
      else return;
    }
    const m = speedMul(w);
    const sp = (e.mode === 'burrow' ? TUNING.burrowSpeed : e.mode === 'hunt' ? TUNING.huntSpeed : e.kind === 'hunter' ? TUNING.hunterSpeed : TUNING.grubSpeed) * m;
    let budget = (dt / 1000) * sp;
    for (let guard = 0; guard < 3 && budget > EPS; guard++) {
      const atCentre = Math.abs(e.x - Math.round(e.x)) < EPS && Math.abs(e.y - Math.round(e.y)) < EPS;
      if (atCentre) {
        e.x = Math.round(e.x); e.y = Math.round(e.y);
        if (e.mode === 'burrow' && tileAt(w, e.x, e.y) === TUNNEL && w.links[idx(e.x, e.y)]) {
          // it surfaces only into a tunnel that leads to you (or anywhere once the hunt is over), and it
          // shimmers there first, harmless, so it can never pop out of the earth straight onto you
          const hunting = w.t < e.huntUntil;
          if (!hunting || bfsFirstStep(w, e.x, e.y, Math.round(w.player.x), Math.round(w.player.y)) >= 0) {
            e.mode = 'rise'; e.until = w.t + TUNING.riseMs; e.resume = hunting ? 'hunt' : 'patrol';
            emit(w, 'surface', { id: e.id, x: e.x, y: e.y });
            return;
          }
        }
        const d = chooseDir(w, e);
        if (!d) return;
        e.dir = d;
        if (d === 2 || d === 4) e.face = d;
      }
      // travel toward the next centre along e.dir
      const horiz = e.dir === 2 || e.dir === 4, sign = e.dir === 2 || e.dir === 3 ? 1 : -1;
      const a = horiz ? e.x : e.y;
      const next = sign > 0 ? Math.floor(a + EPS) + 1 : Math.ceil(a - EPS) - 1;
      const dist = Math.abs(next - a), go = Math.min(dist, budget);
      if (horiz) e.x += sign * go; else e.y += sign * go;
      if (go >= dist - EPS) { if (horiz) e.x = next; else e.y = next; }
      budget -= go;
    }
  }
  function updateHunter(w, e) {
    if (e.kind !== 'hunter' || e.mode === 'gone' || e.mode === 'spawn' || e.mode === 'stunned' || e.mode === 'rise') return;
    if (e.mode === 'warn' && w.t >= e.until) {
      e.mode = 'hunt'; e.huntUntil = w.t + TUNING.huntFor;
      emit(w, 'hunt', { id: e.id });
    } else if ((e.mode === 'patrol') && w.t >= e.nextHunt) {
      // it holds still and trembles first, so you always see a hunt coming
      e.mode = 'warn'; e.until = w.t + TUNING.huntWarn;
      const f = Math.min(1, w.t / TUNING.roundMs + (w.wave - 1) * 0.25);
      e.nextHunt = w.t + TUNING.huntWarn + TUNING.huntFor + (TUNING.huntEvery[0] + (TUNING.huntEvery[1] - TUNING.huntEvery[0]) * f);
      emit(w, 'warn', { id: e.id, x: e.x, y: e.y });
    } else if (e.mode === 'hunt' && w.t >= e.huntUntil) {
      e.mode = 'patrol';
    } else if (e.mode === 'burrow' && w.t >= e.huntUntil && !e.home) {
      e.home = nearestTunnel(w, Math.round(e.x), Math.round(e.y)) || e.nest;
    }
    if (e.mode !== 'burrow') e.home = null;
  }
  const harmful = (e) => e.mode === 'patrol' || e.mode === 'hunt' || e.mode === 'warn';

  // ---------- one fixed step ----------
  function step(w, dt) {
    dt = dt || STEP_MS;
    if (w.phase === 'ready') {
      w.readyLeft -= dt;
      w.player.px = w.player.x; w.player.py = w.player.y;
      for (const e of w.enemies) { e.px = e.x; e.py = e.y; e.anim += dt; }
      if (w.readyLeft <= 0) { w.phase = 'playing'; emit(w, 'go'); }
      return;
    }
    if (w.phase !== 'playing') {
      w.player.px = w.player.x; w.player.py = w.player.y;
      for (const e of w.enemies) { e.px = e.x; e.py = e.y; e.anim += dt; }
      return;
    }
    w.t += dt;
    movePlayer(w, dt);
    afterMove(w);
    // the energy pulse
    if (w.input.pulse) {
      w.input.pulse = false;
      if (w.t - w.pulseAt >= TUNING.pulseCooldown) {
        w.pulseAt = w.t;
        w.pulse = { x: w.player.x, y: w.player.y, at: w.t };
        let hits = 0;
        for (const e of w.enemies) {
          if (e.mode === 'gone' || e.mode === 'spawn' || e.mode === 'rise') continue;
          if (Math.hypot(e.x - w.player.x, e.y - w.player.y) <= TUNING.pulseRadius) {
            if (e.mode !== 'stunned') e.resume = e.mode === 'warn' ? 'patrol' : e.mode;
            e.mode = 'stunned'; e.stunUntil = w.t + TUNING.pulseStun; hits++;
          }
        }
        w.stats.pulses++; w.stats.stuns += hits;
        emit(w, 'pulse', { hits, x: w.player.x, y: w.player.y });
      } else emit(w, 'pulse-wait');
    }
    for (const e of w.enemies) {
      if (e.mode === 'gone' && w.t >= e.until) {
        e.x = e.px = e.nest.x; e.y = e.py = e.nest.y; e.dir = 0;
        e.mode = 'spawn'; e.spawnUntil = w.t + TUNING.spawnShimmer;
      }
      updateHunter(w, e);
      moveEnemy(w, e, dt);
    }
    // touching: a stunned organism pops; a lively one hurts (once, then it recoils)
    const p = w.player;
    let nearest = Infinity, near = null;
    for (const e of w.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (e.mode === 'stunned' && d < TUNING.hitRadius) {
        e.mode = 'gone'; e.until = w.t + TUNING.popRespawn;
        w.score += TUNING.pop; w.stats.pops++;
        emit(w, 'pop', { id: e.id, x: e.x, y: e.y, value: TUNING.pop });
        continue;
      }
      if (!harmful(e)) continue;
      if (d < nearest) { nearest = d; near = e; }
      if (d < TUNING.hitRadius && w.t >= w.invulnUntil) {
        w.health--; w.stats.hits++;
        w.invulnUntil = w.t + TUNING.invulnMs;
        e.resume = 'patrol'; e.mode = 'stunned'; e.stunUntil = w.t + TUNING.hitStun; e.dir = OPP[e.dir] || e.dir;
        emit(w, 'hit', { health: w.health, x: p.x, y: p.y });
        if (w.health === 1 && !w.lowSent) { w.lowSent = true; emit(w, 'low'); }
      }
    }
    if (near && nearest < TUNING.dangerNear && w.t - w.dangerAt >= 250) {
      w.dangerAt = w.t;
      emit(w, 'danger', { d: nearest, x: near.x, y: near.y, kind: near.kind });
    }
    if (w.health <= 0) return finish(w, 'lost', 'health');
    if (w.crystalsLeft <= 0) {
      if (w.wave >= w.waves.length) return finish(w, 'won', 'clear');
      nextWave(w);
    }
    if (w.t >= TUNING.roundMs) return finish(w, 'lost', 'time');
  }
  // a new wave: crystals grow again, now in riskier places, and the chambers stir
  function nextWave(w) {
    w.wave++;
    const spec = w.waves[w.wave - 1], P = w.places;
    const px = Math.round(w.player.x), py = Math.round(w.player.y);
    const free = (i) => !w.items[i] && w.tiles[i] !== ROCK && Math.abs((i % COLS) - px) + Math.abs(((i / COLS) | 0) - py) >= 3 &&
      !w.enemies.some((e) => idx(Math.round(e.x), Math.round(e.y)) === i) && ![...w.wNests, ...w.hNests].some((n) => idx(n.x, n.y) === i);
    let normals = w.pick(P.normals.filter((i) => !P.usedNormals.has(i) && free(i)), spec.normals);
    if (normals.length < spec.normals) {
      // the marked places are used up: grow the rest deep down and near the chambers (constrained, seeded)
      const nests = [...w.wNests, ...w.hNests];
      const extra = [];
      for (let i = 0; i < w.tiles.length; i++) {
        if (!free(i) || normals.includes(i)) continue;
        const x = i % COLS, y = (i / COLS) | 0;
        const nearNest = nests.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= 3);
        if (y >= 3 && (nearNest || y >= 6)) extra.push(i);
      }
      normals = normals.concat(w.pick(extra, spec.normals - normals.length));
    }
    let rares = w.pick(P.rares.filter((i) => !P.usedRares.has(i) && free(i) && !normals.includes(i)), spec.rares);
    if (rares.length < spec.rares) {
      // rich crystals always grow somewhere risky: beside a chamber, or in the deep
      const nests = [...w.wNests, ...w.hNests], risky = [];
      for (let i = 0; i < w.tiles.length; i++) {
        if (!free(i) || normals.includes(i) || rares.includes(i)) continue;
        const x = i % COLS, y = (i / COLS) | 0;
        if (nests.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= 2) || y >= 9) risky.push(i);
      }
      rares = rares.concat(w.pick(risky, spec.rares - rares.length));
    }
    for (const i of normals) { w.items[i] = 1; P.usedNormals.add(i); }
    for (const i of rares) { w.items[i] = 2; P.usedRares.add(i); }
    w.crystals = normals.length + rares.length;
    w.crystalsLeft = w.crystals;
    emit(w, 'wave', { wave: w.wave, cells: normals.concat(rares) });
    // the chambers stir: one more grub wakes in your tunnels, far from you; the stalkers grow restless
    if (w.wNests.length) {
      let nest = w.wNests[(w.wave + w.collected) % w.wNests.length];
      const far = [];
      for (let i = 0; i < w.tiles.length; i++) {
        if (w.tiles[i] !== TUNNEL || !w.links[i]) continue;
        const x = i % COLS, y = (i / COLS) | 0;
        if (Math.abs(x - px) + Math.abs(y - py) >= 6 && bfsFirstStep(w, x, y, px, py) > 0) far.push({ x, y });
      }
      if (far.length) nest = far[Math.floor(w.R() * far.length)];
      const e = w.makeEnemy('grub', nest, w.t + TUNING.spawnShimmer);
      e.mode = 'spawn';
      w.enemies.push(e);
      emit(w, 'stir', { x: nest.x, y: nest.y });
    }
    for (const e of w.enemies) if (e.kind === 'hunter' && e.mode === 'patrol') e.nextHunt = Math.min(e.nextHunt, w.t + 2500);
  }
  function finish(w, phase, reason) {
    w.phase = phase;
    let bonus = 0;
    if (phase === 'won') bonus = Math.ceil(Math.max(0, TUNING.roundMs - w.t) / 1000) * 5 + w.health * 50;
    w.score += bonus;
    w.result = { phase, reason, bonus, score: w.score, timeMs: Math.round(w.t), collected: w.collected, wave: w.wave, waves: w.waves.length };
    emit(w, phase === 'won' ? 'win' : 'lose', w.result);
  }

  const Core = { COLS, ROWS, TILE, HUD, WIDTH, HEIGHT, STEP_MS, DIRT, TUNNEL, ROCK, DX, DY, BIT, TUNING, LAYOUTS, createWorld, step, rng, idx };
  root.TunnelbugCore = Core;

  // =====================================================================================================
  // the game Pocket Arcade drives
  // =====================================================================================================
  const STORE_KEY = 'eyes.arcade.tunnelbug.v1';
  function createGame(host) {
    const Render = root.TunnelbugRender, Audio = root.TunnelbugAudio;
    let world = null, phase = 'title', paused = false, record = { best: 0, plays: 0, wins: 0, layout: 0 }, newBest = false;
    let titleT = 0, renderer = null, sfx = null, lastDigSound = -1e9, stepCount = 0;
    try { Object.assign(record, host.store.get(STORE_KEY) || {}); } catch {}
    const saveRecord = () => { try { host.store.set(STORE_KEY, record); } catch {} };

    function attach(canvas) {
      renderer = Render ? Render.create(canvas, { reduced: () => !host.motion(), lowPower: () => host.lowPower() }) : null;
      sfx = Audio ? Audio.create(host.audio) : null;
    }
    function resize(scale) { if (renderer) renderer.resize(scale); }

    function title() {
      phase = 'title'; paused = false; world = null; titleT = 0;
      if (renderer) renderer.title(Core.createWorld({ layout: record.layout, seed: 7 }));
    }
    function newRound() {
      record.layout = (record.layout + 1) % LAYOUTS.length;
      record.plays++;
      saveRecord();
      const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      world = Core.createWorld({ layout: record.layout, seed });
      phase = 'ready'; paused = false; newBest = false; stepCount = 0;
      if (renderer) renderer.begin(world);
      host.emit('start', { layout: world.layoutName });
      if (sfx) sfx.play('ready');
    }
    function pause() { if (world && (phase === 'playing' || phase === 'ready')) { paused = true; world.input.dir = 0; world.input.pulse = false; } }
    function resume() { if (world && paused) paused = false; }
    function stop() {
      paused = false; world = null; phase = 'title';
      if (renderer) { renderer.destroy(); renderer = null; }
      if (sfx) { sfx.stop(); sfx = null; }
    }
    function input(st) {
      if (!world || paused) return;
      world.input.dir = st.dir | 0;
      if (st.pulse) world.input.pulse = true;
    }
    function step(dt) {
      if (phase === 'title') { titleT += dt; if (renderer) renderer.tickTitle(dt); return; }
      if (!world || paused) return;
      Core.step(world, dt);
      stepCount++;
      phase = world.phase;
      if (renderer) renderer.tick(world, dt);
      for (const ev of world.events) handle(ev);
      world.events.length = 0;
    }
    function handle(ev) {
      if (renderer) renderer.event(ev, world);
      switch (ev.type) {
        case 'dig':
          if (world.t - lastDigSound > 120) { lastDigSound = world.t; sfx && sfx.play('dig'); }
          break;
        case 'collect': sfx && sfx.play('crystal'); host.emit('collect', { left: ev.left }); break;
        case 'rare': sfx && sfx.play('rare'); host.emit('collect', { left: ev.left, rare: true }); break;
        case 'pulse': sfx && sfx.play('pulse'); host.emit('pulse', { hits: ev.hits }); break;
        case 'pulse-wait': sfx && sfx.play('nope'); break;
        case 'pop': sfx && sfx.play('pop'); host.emit('pop'); break;
        case 'hit': sfx && sfx.play('hit'); host.emit('hit', { health: ev.health }); break;
        case 'low': host.emit('low'); break;
        case 'warn': sfx && sfx.play('warn'); host.emit('warn', at(ev)); break;
        case 'danger': host.emit('danger', { ...at(ev), d: ev.d }); break;
        case 'stir': host.emit('stir', at(ev)); break;
        case 'wave': sfx && sfx.play('go'); host.emit('wave', { wave: ev.wave }); break;
        case 'go': sfx && sfx.play('go'); host.emit('go'); break;
        case 'win':
        case 'lose': {
          if (ev.type === 'win') record.wins++;
          newBest = world.score > (record.best || 0) && world.score > 0;
          if (newBest) record.best = world.score;
          saveRecord();
          sfx && sfx.play(ev.type === 'win' ? 'win' : 'lose');
          host.emit(ev.type, { ...ev, newBest, best: record.best });
          if (newBest) host.emit('best', { score: world.score });
          break;
        }
      }
    }
    // a place in the field as -1..1 across the display (the creature looks there)
    const at = (ev) => ({ nx: ((ev.x + 0.5) / COLS) * 2 - 1, ny: ((ev.y + 0.5) * TILE + HUD) / HEIGHT * 2 - 1 });
    function render(alpha) {
      if (!renderer) return;
      if (phase === 'title' || !world) renderer.drawTitle(titleT);
      else renderer.draw(world, paused ? 1 : alpha, { paused, best: record.best });
    }
    function status() {
      const w = world;
      const pulseReady = w ? Math.min(1, (w.t - w.pulseAt) / TUNING.pulseCooldown) : 1;
      return {
        phase, paused,
        score: w ? w.score : 0, best: record.best || 0, plays: record.plays, wins: record.wins,
        health: w ? w.health : TUNING.health, maxHealth: TUNING.health,
        pulseReady, timeLeft: w ? Math.max(0, TUNING.roundMs - w.t) : TUNING.roundMs,
        crystalsLeft: w ? w.crystalsLeft : 0, crystals: w ? w.crystals : 0, wave: w ? w.wave : 1, waves: TUNING.waves.length,
        result: w ? w.result : null, newBest, layout: w ? w.layoutName : LAYOUTS[record.layout].name,
        invulnerable: !!(w && w.t < w.invulnUntil),
        player: w ? { nx: ((w.player.x + 0.5) / COLS) * 2 - 1, ny: ((w.player.y + 0.5) * TILE + HUD) / HEIGHT * 2 - 1 } : null
      };
    }
    // frames are wanted while something moves: a round in play, the countdown, the attract screen
    function wantsFrames() { return !paused && (phase === 'playing' || phase === 'ready' || phase === 'title' || (renderer && renderer.busy())); }

    return {
      id: 'tunnelbug', title: 'Tunnelbug', width: WIDTH, height: HEIGHT, stepMs: STEP_MS,
      attach, resize, title, newRound, pause, resume, stop, input, step, render, status, wantsFrames,
      debug: { world: () => world, record: () => ({ ...record }) }
    };
  }

  if (root.EyesArcade && root.EyesArcade.defineGame) root.EyesArcade.defineGame('tunnelbug', createGame);
  root.TunnelbugGame = createGame;
})(typeof window === 'undefined' ? globalThis : window);
