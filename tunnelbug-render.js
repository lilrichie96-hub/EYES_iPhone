/* EYES 4.4.4 · Tunnelbug drawing. Original pixel art, built in code from the little maps below.
   Everything is drawn at 120 × 96 game pixels and scaled by a whole number, so every pixel stays crisp;
   moving things are placed to the device pixel, so they glide instead of stepping.
   The earth is one tiny image (120 × 88) that the bug carves into as it digs: no per-frame tile work. */
'use strict';
(function (root) {
  const C = () => root.TunnelbugCore;

  // ---------- palettes and sprites (8 × 8 unless noted) ----------
  const PAL = {
    bug: { o: '#0f3942', L: '#dcfff6', b: '#5cf0cf', d: '#2bb09d', e: '#062026', a: '#aefcff', l: '#37c4b1' },
    grub: { o: '#3a0f2e', p: '#ff5fa8', P: '#c23a7d', w: '#ffffff', k: '#2a0420' },
    hunter: { s: '#ffcf7a', o: '#3d1d05', y: '#ffa23a', Y: '#c96d14', W: '#fff2c0', K: '#3a0f00' },
    hunting: { s: '#ffe08a', o: '#4a1205', y: '#ff8a2a', Y: '#d0480f', W: '#ff4a3a', K: '#fff0e0' },
    stunned: { o: '#1a2a3a', p: '#86a9c9', P: '#5e7f9f', w: '#e0f0ff', k: '#20303f', s: '#a9c3db', y: '#86a9c9', Y: '#5e7f9f', W: '#e0f0ff', K: '#20303f' },
    crystal: { c: '#1d86a8', C: '#63e6ff', W: '#effffe' },
    rare: { c: '#b0601a', C: '#ffd166', W: '#fffbe6' },
    rock: { o: '#1b1726', g: '#5b5470', G: '#857d9f' },
    heart: { h: '#ff5f7a' }, heartOff: { h: '#3b2633' }, gem: { h: '#63e6ff' }
  };
  const SPR = {
    bug: [
      ['......a.', '.ooo..a.', 'oLLLooo.', 'oLbbbbeo', 'obbbbbbo', '.oddddo.', '.l.l.l..', 'l.l.l...'],
      ['......a.', '.ooo...a', 'oLLLooo.', 'oLbbbbeo', 'obbbbbbo', '.oddddo.', 'l.l.l...', '.l.l.l..']
    ],
    grub: [
      ['........', '..oooo..', '.oppppo.', 'oppwpwpo', 'oppkpkpo', 'oppppppo', '.oPoPoo.', 'o.o..o.o'],
      ['........', '..oooo..', '.oppppo.', 'oppwpwpo', 'oppkpkpo', 'oppppppo', '.oPoPoo.', '.o.oo.o.']
    ],
    hunter: [
      ['s.s..s.s', '.oooooo.', 'oyyyyyyo', 'oyWyyWyo', 'oyKyyKyo', 'oYyyyyYo', '.oYYYYo.', 'o.o..o.o'],
      ['.s.ss.s.', '.oooooo.', 'oyyyyyyo', 'oyWyyWyo', 'oyKyyKyo', 'oYyyyyYo', '.oYYYYo.', '.o.oo.o.']
    ],
    crystal: [
      ['...cc...', '..cCCc..', '.cCWCCc.', 'cCWCCCCc', '.cCCCCc.', '..cCCc..', '...cc...', '........'],
      ['...cc...', '..cCWc..', '.cCCCCc.', 'cCCCCWCc', '.cCCCCc.', '..cCCc..', '...cc...', '........']
    ],
    rock: [['..oooo..', '.oggggo.', 'oggGgggo', 'ogGgggGo', 'oggggggo', 'ogggGggo', '.oggggo.', '..oooo..']],
    heart: [['.h.h.', 'hhhhh', 'hhhhh', '.hhh.', '..h..']],
    gem: [['..h..', '.hhh.', 'hhhhh', '.hhh.', '..h..']]
  };
  // 3 × 5 pixel letters
  const FONT = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001011001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', '!': '010010010000010', '+': '000010111010000', ':': '000010000010000', '-': '000000111000000',
    '.': '000000000000010', ' ': '000000000000000'
  };
  function sprite(rows, pal) {
    const h = rows.length, w = rows[0].length;
    const c = makeCanvas(w, h), x = c.getContext('2d');
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      const k = rows[y][i];
      if (k === '.' || !pal[k]) continue;
      x.fillStyle = pal[k]; x.fillRect(i, y, 1, 1);
    }
    return c;
  }
  const rotate = (rows, turns) => {           // quarter turns clockwise
    let r = rows;
    for (let n = 0; n < turns; n++) { const h = r.length, w = r[0].length, out = []; for (let x = 0; x < w; x++) { let s = ''; for (let y = h - 1; y >= 0; y--) s += r[y][x]; out.push(s); } r = out; }
    return r;
  };
  const mirror = (rows) => rows.map((s) => s.split('').reverse().join(''));
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch {} }
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

  // ---------- the earth ----------
  const STRATA = [
    { base: '#7c4a2f', hi: '#93603c', lo: '#5e3621' },   // top soil
    { base: '#6e3c4e', hi: '#84505f', lo: '#512a3a' },   // rust clay
    { base: '#4c3a66', hi: '#5f4c7c', lo: '#36294d' },   // violet rock
    { base: '#2d3c5e', hi: '#3c4f74', lo: '#1f2b45' }    // the deep
  ].map((s) => ({ base: hex(s.base), hi: hex(s.hi), lo: hex(s.lo) }));
  const bandOf = (tileY) => (tileY < 3 ? 0 : tileY < 6 ? 1 : tileY < 9 ? 2 : 3);

  function create(canvas, opts) {
    const K = C(), W = K.WIDTH, H = K.HEIGHT, T = K.TILE, HUD = K.HUD, FW = K.COLS * T, FH = K.ROWS * T;
    const ctx = canvas.getContext('2d', { alpha: false });
    let scale = 1;
    const reduced = () => !!(opts && opts.reduced && opts.reduced());
    const lowPower = () => !!(opts && opts.lowPower && opts.lowPower());

    // sprite sheets
    const S = {};
    const dirs = (rows) => ({ 2: sprite(rows, PAL.bug), 4: sprite(mirror(rows), PAL.bug), 1: sprite(rotate(rows, 3), PAL.bug), 3: sprite(rotate(rows, 1), PAL.bug) });
    S.bug = SPR.bug.map(dirs);
    const facing = (frames, pal) => frames.map((r) => ({ 2: sprite(r, pal), 4: sprite(mirror(r), pal) }));
    S.grub = facing(SPR.grub, PAL.grub); S.grubStun = facing(SPR.grub, PAL.stunned);
    S.hunter = facing(SPR.hunter, PAL.hunter); S.hunterHunt = facing(SPR.hunter, PAL.hunting); S.hunterStun = facing(SPR.hunter, PAL.stunned);
    S.crystal = SPR.crystal.map((r) => sprite(r, PAL.crystal)); S.rare = SPR.crystal.map((r) => sprite(r, PAL.rare));
    S.rock = sprite(SPR.rock[0], PAL.rock);
    S.heart = sprite(SPR.heart[0], PAL.heart); S.heartOff = sprite(SPR.heart[0], PAL.heartOff); S.gem = sprite(SPR.gem[0], PAL.gem);
    S.glow = (() => {
      const c = makeCanvas(24, 24), x = c.getContext('2d'), g = x.createRadialGradient(12, 12, 0, 12, 12, 12);
      g.addColorStop(0, 'rgba(120,255,220,0.42)'); g.addColorStop(0.5, 'rgba(90,230,210,0.12)'); g.addColorStop(1, 'rgba(90,230,210,0)');
      x.fillStyle = g; x.fillRect(0, 0, 24, 24); return c;
    })();
    S.gemGlow = (() => {
      const c = makeCanvas(16, 16), x = c.getContext('2d'), g = x.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 16, 16); return c;
    })();

    // the earth image and what each of its pixels is (0 earth, 1 tunnel wall, 2 tunnel floor, 3 stone)
    const earth = makeCanvas(FW, FH), ex = earth.getContext('2d');
    let img = ex.createImageData(FW, FH), state = new Uint8Array(FW * FH), soil = new Uint8ClampedArray(FW * FH * 3);
    let dirty = null;
    function paintPixel(i) {
      const o = i * 4, s = state[i];
      if (s === 2) {
        const y = (i / FW) | 0, deep = y / FH;
        img.data[o] = 10 + deep * 4; img.data[o + 1] = 9 + deep * 6; img.data[o + 2] = 16 + deep * 12;
      } else if (s === 1) {
        img.data[o] = soil[i * 3] * 0.5; img.data[o + 1] = soil[i * 3 + 1] * 0.5; img.data[o + 2] = soil[i * 3 + 2] * 0.55;
      } else if (s === 0) {
        img.data[o] = soil[i * 3]; img.data[o + 1] = soil[i * 3 + 1]; img.data[o + 2] = soil[i * 3 + 2];
      }
      img.data[o + 3] = 255;
    }
    function markDirty(x0, y0, x1, y1) {
      if (!dirty) dirty = { x0, y0, x1, y1 };
      else { dirty.x0 = Math.min(dirty.x0, x0); dirty.y0 = Math.min(dirty.y0, y0); dirty.x1 = Math.max(dirty.x1, x1); dirty.y1 = Math.max(dirty.y1, y1); }
    }
    function carve(x, y, w, h) {
      x = Math.round(x); y = Math.round(y);
      const x0 = Math.max(0, x - 1), y0 = Math.max(0, y - 1), x1 = Math.min(FW, x + w + 1), y1 = Math.min(FH, y + h + 1);
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = yy * FW + xx, inner = xx >= x && xx < x + w && yy >= y && yy < y + h;
        if (state[i] === 3) continue;
        if (inner) { if (state[i] !== 2) { state[i] = 2; paintPixel(i); } }
        else if (state[i] === 0) { state[i] = 1; paintPixel(i); }
      }
      markDirty(x0, y0, x1, y1);
    }
    function buildEarth(world) {
      img = ex.createImageData(FW, FH); state = new Uint8Array(FW * FH); soil = new Uint8ClampedArray(FW * FH * 3);
      const R = K.rng((world.seed ^ 0x9e3779b9) >>> 0);
      for (let y = 0; y < FH; y++) {
        const ty = y / T, band = bandOf(Math.floor(ty)), next = bandOf(Math.min(K.ROWS - 1, Math.floor(ty) + 1));
        const edge = (ty % 1), blend = band !== next && edge > 0.7 ? (edge - 0.7) / 0.3 * 0.5 : 0;
        for (let x = 0; x < FW; x++) {
          const i = y * FW + x, n = R();
          let c = n < 0.12 ? STRATA[band].hi : n < 0.26 ? STRATA[band].lo : STRATA[band].base;
          if (blend && R() < blend) c = STRATA[next].base;
          // a few minerals glint in the deeper layers
          if (band >= 2 && R() < 0.006) c = band === 3 ? [86, 210, 230] : [168, 120, 230];
          soil[i * 3] = c[0]; soil[i * 3 + 1] = c[1]; soil[i * 3 + 2] = c[2];
          paintPixel(i);
        }
      }
      // stone is baked into the earth image itself, so later carving can never paint over it
      const rockPal = {}; for (const k in PAL.rock) rockPal[k] = hex(PAL.rock[k]);
      for (let ty = 0; ty < K.ROWS; ty++) for (let tx = 0; tx < K.COLS; tx++) {
        if (world.tiles[K.idx(tx, ty)] !== K.ROCK) continue;
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          const i = (ty * T + y) * FW + tx * T + x, k = SPR.rock[0][y][x];
          state[i] = 3;
          if (rockPal[k]) { const o = i * 4; img.data[o] = rockPal[k][0]; img.data[o + 1] = rockPal[k][1]; img.data[o + 2] = rockPal[k][2]; }
        }
      }
      // the old tunnels
      for (let ty = 0; ty < K.ROWS; ty++) for (let tx = 0; tx < K.COLS; tx++) {
        const i = K.idx(tx, ty);
        if (world.tiles[i] !== K.TUNNEL) continue;
        carve(tx * T + 1, ty * T + 1, 6, 6);
        if (world.links[i] & K.BIT[2]) carve(tx * T + 1, ty * T + 1, 14, 6);
        if (world.links[i] & K.BIT[3]) carve(tx * T + 1, ty * T + 1, 6, 14);
      }
      ex.putImageData(img, 0, 0);
      dirty = null;
    }
    function flushEarth() {
      if (!dirty) return;
      const d = dirty; dirty = null;
      ex.putImageData(img, 0, 0, d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
    }

    // ---------- little effects ----------
    let parts = [], texts = [], rings = [], flashes = [], digT = 0, lastCarve = null, goAt = -1;
    const cap = () => (reduced() ? 24 : lowPower() ? 60 : 140);
    function burst(x, y, n, colors, speed, life) {
      const m = Math.min(n, cap() - parts.length);
      for (let k = 0; k < m; k++) {
        const a = Math.random() * Math.PI * 2, s = (0.4 + Math.random()) * speed;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, g: 40, life: life * (0.6 + Math.random() * 0.6), max: life, c: colors[k % colors.length] });
      }
    }
    function floatText(str, x, y, color) { texts.push({ str, x, y, c: color, life: 900, max: 900 }); }

    let titleWorld = null, demo = null, titleClock = 0;
    function title(w) {
      titleWorld = w; buildEarth(w); parts = []; texts = []; rings = []; flashes = [];
      demo = { x: 2, y: 0, dir: 2, walk: 0 };
      titleClock = 0;
    }
    function begin(w) {
      titleWorld = null; demo = null; buildEarth(w); parts = []; texts = []; rings = []; flashes = []; lastCarve = null; goAt = -1;
    }
    function tick(w, dt) {
      const p = w.player;
      // the bug carves the earth wherever it actually goes
      const cx = p.x * T + 1, cy = p.y * T + 1;
      if (!lastCarve || Math.abs(lastCarve.x - cx) >= 0.5 || Math.abs(lastCarve.y - cy) >= 0.5) { carve(cx, cy, 6, 6); lastCarve = { x: cx, y: cy }; }
      if (p.moving && p.inDirt) {
        digT += dt;
        if (digT > (reduced() ? 160 : 55)) {
          digT = 0;
          const band = STRATA[bandOf(Math.round(p.y))], fx = p.x * T + 4 + K.DX[p.dir] * 4, fy = p.y * T + 4 + K.DY[p.dir] * 4;
          const col = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
          burst(fx, fy, 3, [col(band.hi), col(band.base), col(band.lo)], 26, 380);
        }
      }
      advance(dt);
    }
    function advance(dt) {
      const s = dt / 1000;
      for (const q of parts) { q.vy += q.g * s; q.x += q.vx * s; q.y += q.vy * s; q.life -= dt; }
      parts = parts.filter((q) => q.life > 0);
      for (const q of texts) { q.y -= 7 * s; q.life -= dt; }
      texts = texts.filter((q) => q.life > 0);
      for (const q of rings) q.life -= dt;
      rings = rings.filter((q) => q.life > 0);
      for (const q of flashes) q.life -= dt;
      flashes = flashes.filter((q) => q.life > 0);
    }
    function event(ev, w) {
      const px = (ev.x || 0) * T + 4, py = (ev.y || 0) * T + 4;
      switch (ev.type) {
        case 'collect': burst(px, py, 10, ['#effffe', '#63e6ff', '#1d86a8'], 34, 520); floatText('+' + ev.value, px, py - 4, '#a8f4ff'); break;
        case 'rare': burst(px, py, 16, ['#fffbe6', '#ffd166', '#ff9f43'], 42, 700); floatText('+' + ev.value, px, py - 4, '#ffe08a'); break;
        case 'pulse': rings.push({ x: ev.x * T + 4, y: ev.y * T + 4, life: 520, max: 520, r: K.TUNING.pulseRadius * T }); break;
        case 'pop': burst(px, py, 12, ['#ffffff', '#ff9fd0', '#ffd08a'], 40, 520); floatText('+' + ev.value, px, py - 4, '#ffffff'); break;
        case 'hit': burst(w.player.x * T + 4, w.player.y * T + 4, 10, ['#ff5f7a', '#ffd0d8'], 36, 420); if (!reduced()) flashes.push({ life: 140, max: 140 }); break;
        case 'stir': rings.push({ x: px, y: py, life: 700, max: 700, r: 10, warm: true }); break;
        case 'warn': floatText('!', px, py - 6, '#ff7a5a'); break;
        case 'wave':
          for (const c of ev.cells || []) burst((c % K.COLS) * T + 4, ((c / K.COLS) | 0) * T + 4, 5, ['#effffe', '#63e6ff', '#ffd166'], 22, 600);
          texts.push({ str: 'WAVE ' + ev.wave, x: FW / 2, y: FH / 2 - 2, c: '#ffe9a8', life: 1100, max: 1100, big: true, fixed: true });
          break;
        case 'go': goAt = 0; texts.push({ str: 'GO!', x: FW / 2, y: FH / 2 - 2, c: '#dcfff6', life: 650, max: 650, big: true, fixed: true }); break;
      }
    }

    // ---------- drawing ----------
    function resize(s) {
      scale = Math.max(1, s | 0);
      if (canvas.width !== W * scale) canvas.width = W * scale;
      if (canvas.height !== H * scale) canvas.height = H * scale;
      ctx.imageSmoothingEnabled = false;
    }
    const snap = (v) => Math.round(v * scale) / scale;     // to the device pixel: smooth motion, crisp sprites
    function text(str, x, y, color, size, align) {
      size = size || 1;
      str = String(str).toUpperCase();
      const width = str.length * 4 * size - size;
      let ox = align === 'center' ? Math.round(x - width / 2) : align === 'right' ? Math.round(x - width) : x;
      ctx.fillStyle = color;
      for (const ch of str) {
        const g = FONT[ch] || FONT[' '];
        for (let k = 0; k < 15; k++) if (g[k] === '1') ctx.fillRect(ox + (k % 3) * size, y + ((k / 3) | 0) * size, size, size);
        ox += 4 * size;
      }
      return width;
    }
    function drawField(w, alpha, time) {
      flushEarth();
      ctx.drawImage(earth, 0, HUD);
      // crystals
      const sh = Math.floor(time / 420) % 2;
      for (let i = 0; i < w.items.length; i++) {
        const it = w.items[i];
        if (!it) continue;
        const tx = (i % K.COLS) * T, ty = ((i / K.COLS) | 0) * T + HUD;
        const bob = it === 2 && !reduced() ? (Math.floor(time / 300 + i) % 2) : 0;
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time / 500 + i);
        ctx.drawImage(S.gemGlow, tx - 4, ty - 4 - bob);
        ctx.globalAlpha = 1;
        ctx.drawImage((it === 2 ? S.rare : S.crystal)[(sh + i) % 2], tx, ty - bob);
      }
    }
    function drawEnemy(e, alpha, time) {
      if (e.mode === 'gone') return;
      const x = snap((e.px + (e.x - e.px) * alpha) * T), y = snap((e.py + (e.y - e.py) * alpha) * T + HUD);
      const f = Math.floor(e.anim / 180) % 2, face = e.face === 4 ? 4 : 2;
      if (e.mode === 'burrow') {
        // only its eyes move through the earth
        const glow = 0.6 + 0.4 * Math.sin(time / 120);
        ctx.fillStyle = `rgba(255,${e.kind === 'hunter' ? 90 : 160},70,${glow})`;
        ctx.fillRect(x + 2, y + 3, 1, 1); ctx.fillRect(x + 5, y + 3, 1, 1);
        ctx.fillStyle = 'rgba(255,200,150,0.18)'; ctx.fillRect(x + 1, y + 2, 6, 3);
        return;
      }
      if (e.mode === 'spawn' || e.mode === 'rise') {
        if (Math.floor(time / 70) % 2) return;     // shimmering, not yet solid (and harmless)
        ctx.globalAlpha = 0.55;
      }
      let sheet = e.kind === 'hunter' ? (e.mode === 'hunt' || e.mode === 'warn' ? S.hunterHunt : S.hunter) : S.grub;
      if (e.mode === 'stunned') sheet = e.kind === 'hunter' ? S.hunterStun : S.grubStun;
      const shake = e.mode === 'warn' && !reduced() ? (Math.floor(time / 45) % 2 ? 1 : -1) / scale * Math.max(1, scale / 3) : 0;
      ctx.drawImage(sheet[e.mode === 'stunned' ? 0 : f][face], x + shake, y);
      ctx.globalAlpha = 1;
      if (e.mode === 'stunned') {
        // little sparks circle its head
        const a = time / 140;
        ctx.fillStyle = '#e8f6ff';
        ctx.fillRect(snap(x + 3.5 + Math.cos(a) * 3.5), snap(y - 1 + Math.sin(a) * 1.2), 1, 1);
        ctx.fillRect(snap(x + 3.5 + Math.cos(a + Math.PI) * 3.5), snap(y - 1 + Math.sin(a + Math.PI) * 1.2), 1, 1);
      }
    }
    function drawBug(p, alpha, time, blink, frameFromWalk) {
      if (blink) return;
      const x = snap((p.px + (p.x - p.px) * alpha) * T), y = snap((p.py + (p.y - p.py) * alpha) * T + HUD);
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(time / 260);
      ctx.drawImage(S.glow, x - 8, y - 8);
      ctx.globalAlpha = 1;
      const f = Math.floor(frameFromWalk / 110) % 2;
      ctx.drawImage(S.bug[f][p.face || 2], x, y);
    }
    function drawEffects(time) {
      for (const r of rings) {
        const u = 1 - r.life / r.max, rad = r.r * Math.min(1, u / 0.5);
        ctx.strokeStyle = r.warm ? `rgba(255,170,120,${(1 - u) * 0.7})` : `rgba(150,255,235,${(1 - u) * 0.85})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(r.x, r.y + HUD, Math.max(0.5, rad), 0, Math.PI * 2); ctx.stroke();
        if (!r.warm) { ctx.strokeStyle = `rgba(150,255,235,${(1 - u) * 0.3})`; ctx.beginPath(); ctx.arc(r.x, r.y + HUD, Math.max(0.5, rad * 0.7), 0, Math.PI * 2); ctx.stroke(); }
      }
      for (const q of parts) { ctx.globalAlpha = Math.min(1, q.life / q.max * 1.6); ctx.fillStyle = q.c; ctx.fillRect(snap(q.x), snap(q.y + HUD), 1, 1); }
      ctx.globalAlpha = 1;
      for (const q of texts) {
        ctx.globalAlpha = Math.min(1, q.life / q.max * 2.2);
        if (q.big) { text(q.str, q.x + 1, Math.round(q.y + HUD) + 1, '#0a2a2a', 2, 'center'); text(q.str, q.x, Math.round(q.y + HUD), q.c, 2, 'center'); }
        else text(q.str, q.x, Math.round(q.y + HUD), q.c, 1, 'center');
      }
      ctx.globalAlpha = 1;
    }
    function drawHud(w, time) {
      ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, W, HUD);
      ctx.fillStyle = '#16323a'; ctx.fillRect(0, HUD - 1, W, 1);
      text(String(w.score).padStart(5, '0'), 2, 1, '#cff7ef');
      for (let i = 0; i < K.TUNING.health; i++) ctx.drawImage(i < w.health ? S.heart : S.heartOff, 26 + i * 6, 1);
      const low = w.health === 1 && Math.floor(time / 300) % 2;
      if (low) { ctx.fillStyle = 'rgba(255,95,122,0.25)'; ctx.fillRect(25, 0, 19, HUD - 1); }
      ctx.drawImage(S.gem, 50, 1);
      text(String(w.crystalsLeft), 57, 1, '#a8f4ff');
      // which wave, as three small pips
      for (let i = 0; i < w.waves.length; i++) { ctx.fillStyle = i < w.wave ? '#ffd166' : '#3a3324'; ctx.fillRect(68 + i * 3, 3, 2, 2); }
      // the pulse: a small bar that fills while it recharges
      const ready = Math.min(1, (w.t - w.pulseAt) / K.TUNING.pulseCooldown);
      ctx.fillStyle = '#123038'; ctx.fillRect(82, 3, 16, 2);
      ctx.fillStyle = ready >= 1 ? '#8fffe6' : '#3f8f88'; ctx.fillRect(82, 3, Math.round(16 * ready), 2);
      const secs = Math.ceil(Math.max(0, K.TUNING.roundMs - w.t) / 1000);
      const hurry = secs <= 10 && Math.floor(time / 250) % 2;
      text(String(secs), W - 2, 1, hurry ? '#ff9f8a' : '#cff7ef', 1, 'right');
    }
    let clock = 0;
    function draw(w, alpha, o) {
      clock += 16;
      const time = performance.now();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      drawField(w, alpha, time);
      for (const e of w.enemies) drawEnemy(e, alpha, time);
      const blink = w.t < w.invulnUntil && Math.floor(time / 90) % 2 === 0;
      drawBug(w.player, alpha, time, blink, w.player.walk);
      drawEffects(time);
      for (const f of flashes) { ctx.fillStyle = `rgba(255,60,90,${(f.life / f.max) * 0.18})`; ctx.fillRect(0, HUD, W, H - HUD); }
      if (w.phase === 'ready') {
        const r = Math.max(0, w.readyLeft);
        if (Math.floor(r / 200) % 2 === 0 || reduced()) { text('READY', W / 2 + 1, HUD + 37, '#062224', 2, 'center'); text('READY', W / 2, HUD + 36, '#dcfff6', 2, 'center'); }
      }
      if (o && o.paused) { ctx.fillStyle = 'rgba(2,6,8,0.55)'; ctx.fillRect(0, HUD, W, H - HUD); }
      if (w.phase === 'won' || w.phase === 'lost') { ctx.fillStyle = 'rgba(2,6,8,0.5)'; ctx.fillRect(0, HUD, W, H - HUD); }
      drawHud(w, time);
    }
    // ---------- the attract screen ----------
    function tickTitle(dt) {
      titleClock += dt;
      if (!demo || !titleWorld) return;
      const sp = reduced() ? 0 : 2.4 * dt / 1000;
      demo.walk += dt;
      demo.x += demo.dir === 2 ? sp : -sp;
      if (demo.x > K.COLS - 1) { demo.x = K.COLS - 1; demo.dir = 4; }
      if (demo.x < 0) { demo.x = 0; demo.dir = 2; }
      carve(demo.x * T + 1, demo.y * T + 1 + 32, 6, 6);
      advance(dt);
    }
    function drawTitle() {
      const time = performance.now();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      if (!titleWorld) { ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, W, H); return; }
      drawField(titleWorld, 1, time);
      if (demo) drawBug({ x: demo.x, y: demo.y + 4, px: demo.x, py: demo.y + 4, face: demo.dir }, 1, time, false, demo.walk);
      ctx.fillStyle = 'rgba(3,6,10,0.42)'; ctx.fillRect(0, HUD, W, H - HUD);
      ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, W, HUD);
      // the logo, with a soft energy shimmer travelling across it
      const lx = W / 2, ly = 14;
      text('TUNNELBUG', lx + 1, ly + 1, '#06282a', 2, 'center');
      text('TUNNELBUG', lx, ly, '#5cf0cf', 2, 'center');
      const sweep = reduced() ? -99 : ((time / 18) % 160) - 20;
      ctx.save(); ctx.beginPath(); ctx.rect(sweep, ly, 10, 10); ctx.clip(); text('TUNNELBUG', lx, ly, '#e6fffa', 2, 'center'); ctx.restore();
      text('A POCKET ARCADE GAME', lx, ly + 13, '#7fb9b3', 1, 'center');
    }
    function busy() { return parts.length > 0 || texts.length > 0 || rings.length > 0 || flashes.length > 0; }
    function destroy() {
      parts = []; texts = []; rings = []; flashes = []; titleWorld = null; demo = null;
      try { earth.width = earth.height = 0; } catch {}
      img = null; state = null; soil = null;
    }
    return { resize, title, begin, tick, tickTitle, event, draw, drawTitle, busy, destroy, debug: { state: () => state, text } };
  }

  root.TunnelbugRender = { create, PAL, SPR, FONT };
})(typeof window === 'undefined' ? globalThis : window);
