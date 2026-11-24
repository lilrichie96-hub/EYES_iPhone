/* EYES 4.4.6 · Weather Organ, the miniature atmosphere.
   A tiny world grown inside his pupil: sky, a far horizon, three depths of cloud, sun or moon and stars,
   rain, snow, fog, wind and lightning. Layered 2D only (gradients, masks, a few cached sprites and stateless
   particles whose positions are pure functions of time), so nothing accumulates and nothing runs when it is
   not being painted.

   Scenes are not swapped; they are *grown*. Every scene is a set of numbers (cover, darkness, rain, snow,
   fog, storm, wind, sun, moon, stars …) and the painter eases the live set toward the target. Scrubbing from a
   sunny hour to a stormy one makes the clouds gather, darken, start to rain, and only then flicker.

   Also here: the forecast ring painted on his iris, and the brief idle "weather moments". */
'use strict';
(function (root) {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  // stable pseudo-random numbers per particle: no arrays to update every frame
  const hash = (i, s) => { let h = Math.imul((i + 1) * 374761393 + (s || 0) * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  const KEYS = ['night', 'sun', 'beams', 'cover', 'dark', 'rain', 'snow', 'fog', 'storm', 'wind', 'stars', 'moon', 'shimmer', 'frost'];
  const BASE = { night: 0, sun: 0, beams: 0, cover: 0, dark: 0, rain: 0, snow: 0, fog: 0, storm: 0, wind: 0.15, stars: 0, moon: 0, shimmer: 0, frost: 0 };
  // a condition (from weather-data.js) → the numbers that make its world
  function sceneFor(cond) {
    const s = { ...BASE };
    if (!cond) return { ...s, cover: 0.55, dark: 0.3, fog: 0.25 };   // unknown: a quiet, neutral sky (never a made-up one)
    const k = cond.kind, n = cond.night ? 1 : 0, i = cond.intensity == null ? 1 : cond.intensity;
    s.night = n;
    switch (k) {
      case 'sun': Object.assign(s, { sun: 1, beams: 1, cover: 0.06, shimmer: 1, wind: 0.12 }); break;
      case 'night': Object.assign(s, { night: 1, stars: 1, moon: 1, cover: 0.05, wind: 0.1 }); break;
      case 'partly': Object.assign(s, { sun: 0.85, beams: 0.65, cover: 0.48, dark: 0.08, shimmer: 0.25, wind: 0.25, stars: 0.55, moon: 0.75 }); break;
      case 'overcast': Object.assign(s, { sun: 0.08, cover: 1, dark: 0.32, wind: 0.2, stars: 0, moon: 0.1 }); break;
      case 'rain': Object.assign(s, { cover: 1, dark: 0.42 + 0.25 * i, rain: 0.3 + 0.7 * i, wind: 0.3 + 0.2 * i }); break;
      case 'storm': Object.assign(s, { cover: 1, dark: 0.9, rain: 0.75 + 0.2 * i, storm: 0.7 + 0.3 * i, wind: 0.65 }); break;
      case 'snow': Object.assign(s, { cover: 0.85, dark: 0.16, snow: 0.35 + 0.65 * i, frost: 1, wind: 0.12 + 0.1 * i }); break;
      case 'fog': Object.assign(s, { fog: 1, cover: 0.35, dark: 0.12, sun: 0.12, wind: 0.04, moon: 0.2 }); break;
      case 'wind': Object.assign(s, { sun: 0.6, beams: 0.3, cover: 0.42, dark: 0.12, wind: 1, stars: 0.4, moon: 0.6 }); break;
    }
    if (n) { s.sun = 0; s.beams = 0; s.shimmer = 0; if (k !== 'night') { s.stars *= 0.6; } }
    else { s.stars = 0; s.moon = 0; }
    return s;
  }

  // ---------- colours ----------
  const C = {
    dayTop: [58, 128, 190], dayBot: [168, 208, 232],
    nightTop: [6, 11, 28], nightBot: [16, 30, 58],
    greyTop: [104, 120, 136], greyBot: [150, 162, 172],
    greyNTop: [16, 20, 27], greyNBot: [30, 36, 44],
    stormTop: [26, 30, 38], stormBot: [56, 62, 72],
    fogTop: [146, 154, 158], fogBot: [184, 190, 192],
    fogNTop: [28, 33, 37], fogNBot: [46, 52, 56],
    snowTop: [140, 160, 182], snowBot: [206, 218, 228]
  };
  const lerpC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  const rgb = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a == null ? 1 : +a.toFixed(3)})`;
  function skyColours(s, tintRGB) {
    let top = lerpC(C.dayTop, C.nightTop, s.night), bot = lerpC(C.dayBot, C.nightBot, s.night);
    const gT = lerpC(C.greyTop, C.greyNTop, s.night), gB = lerpC(C.greyBot, C.greyNBot, s.night);
    top = lerpC(top, gT, s.cover * 0.85); bot = lerpC(bot, gB, s.cover * 0.85);
    top = lerpC(top, C.stormTop, s.dark * s.cover * 0.85); bot = lerpC(bot, C.stormBot, s.dark * s.cover * 0.8);
    const fT = lerpC(C.fogTop, C.fogNTop, s.night), fB = lerpC(C.fogBot, C.fogNBot, s.night);
    top = lerpC(top, fT, s.fog * 0.8); bot = lerpC(bot, fB, s.fog * 0.85);
    top = lerpC(top, lerpC(C.snowTop, C.greyNTop, s.night), s.snow * 0.45); bot = lerpC(bot, lerpC(C.snowBot, C.greyNBot, s.night), s.snow * 0.5);
    // a breath of his own colour, so the sky belongs to this Eye and this skin
    if (tintRGB) { top = lerpC(top, tintRGB, 0.1); bot = lerpC(bot, tintRGB, 0.08); }
    // sunlight warms the low sky
    bot = lerpC(bot, [236, 204, 150], s.sun * (1 - s.cover) * 0.28);
    return { top, bot };
  }

  // ---------- cached shapes (rebuilt only when the window's size changes) ----------
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch {} }
    if (root.document) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return null;
  }
  function cloudSprite(seed, w, h, tone) {
    const c = makeCanvas(w, h);
    if (!c) return null;
    const x = c.getContext('2d');
    const n = 9 + Math.floor(hash(seed, 1) * 5);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const px = w * (0.14 + 0.72 * u + (hash(seed, i + 10) - 0.5) * 0.12);
      const bump = Math.sin(u * Math.PI);
      const pr = h * (0.22 + 0.26 * bump * (0.7 + 0.6 * hash(seed, i + 30)));
      const py = h * 0.66 - pr * (0.35 + 0.4 * hash(seed, i + 50));
      const g = x.createRadialGradient(px - pr * 0.25, py - pr * 0.3, pr * 0.1, px, py, pr);
      g.addColorStop(0, `rgba(${tone[0]},${tone[1]},${tone[2]},0.95)`);
      g.addColorStop(0.55, `rgba(${tone[0]},${tone[1]},${tone[2]},0.6)`);
      g.addColorStop(1, `rgba(${tone[0]},${tone[1]},${tone[2]},0)`);
      x.fillStyle = g; x.beginPath(); x.arc(px, py, pr, 0, TAU); x.fill();
    }
    // a flatter, shaded underside, the way real cumulus sit on the air
    const base = x.createLinearGradient(0, h * 0.45, 0, h);
    base.addColorStop(0, 'rgba(0,0,0,0)'); base.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = base; x.fillRect(0, h * 0.62, w, h * 0.38);
    return c;
  }
  function hillPath(seed, r, baseY, amp) {
    const p = new Path2D();
    p.moveTo(-r * 1.2, r * 1.2);
    for (let i = 0; i <= 24; i++) {
      const u = i / 24, x = -r * 1.1 + u * r * 2.2;
      const y = baseY - amp * (0.55 * Math.sin(u * 3.1 + seed) + 0.3 * Math.sin(u * 7.3 + seed * 2.1) + 0.15 * Math.sin(u * 15 + seed * 3));
      p.lineTo(x, y);
    }
    p.lineTo(r * 1.2, r * 1.2);
    p.closePath();
    return p;
  }

  function createSky() {
    const S = {
      live: { ...BASE, cover: 0.55, dark: 0.3, fog: 0.25 }, target: { ...BASE, cover: 0.55, dark: 0.3, fog: 0.25 },
      lastT: 0, r: 0, sprites: null, hills: null, flash: null, nextFlash: 0, settled: true, frames: 0
    };
    function setTarget(scene, instant) {
      S.target = { ...BASE, ...scene };
      if (instant) S.live = { ...S.target };
      S.settled = !!instant;
    }
    function step(t, motion) {
      const dt = S.lastT ? Math.min(100, t - S.lastT) : 16;
      S.lastT = t;
      if (!motion) { S.live = { ...S.target }; S.settled = true; return; }
      const k = 1 - Math.exp(-dt / 650);
      let moving = false;
      for (const key of KEYS) {
        const d = S.target[key] - S.live[key];
        if (Math.abs(d) > 0.002) { S.live[key] += d * k; moving = true; } else S.live[key] = S.target[key];
      }
      S.settled = !moving;
    }
    function ensureShapes(r) {
      const key = Math.round(r);
      if (S.r === key && S.sprites) return;
      S.r = key;
      const dpr = Math.min(root.devicePixelRatio || 1, 3);
      const w = Math.max(32, Math.round(r * 1.1 * dpr)), h = Math.max(16, Math.round(r * 0.5 * dpr));
      S.sprites = [];
      for (let i = 0; i < 5; i++) S.sprites.push({ light: cloudSprite(i + 1, w, h, [238, 242, 246]), dark: cloudSprite(i + 1, w, h, [58, 64, 74]), w: r * 1.1, h: r * 0.5 });
      S.hills = { far: hillPath(1.7, r, r * 0.5, r * 0.07), near: hillPath(4.2, r, r * 0.66, r * 0.09) };
    }

    // one painted frame of the world; `form` 0..1 grows it in (Stage B), 1 when fully formed
    function paint(ctx, o) {
      const { x, y, r, t } = o;
      if (r < 6) return { flash: 0 };
      ensureShapes(r);
      S.frames++;
      const s = S.live, form = o.form == null ? 1 : clamp(o.form), still = !o.motion, low = !!o.lowPower;
      const time = still ? 4000 : t;                      // a still world is a single, composed moment
      const sec = time / 1000;
      const windK = 0.2 + s.wind * 1.6;
      const col = skyColours(s, o.tintRGB);
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
      ctx.globalAlpha = ease(form / 0.35);
      // 1 · sky
      const sky = ctx.createLinearGradient(0, -r, 0, r * 0.7);
      sky.addColorStop(0, rgb(col.top)); sky.addColorStop(1, rgb(col.bot));
      ctx.fillStyle = sky; ctx.fillRect(-r, -r, r * 2, r * 2);
      const f2 = ease((form - 0.2) / 0.5), f3 = ease((form - 0.5) / 0.5);
      // 2 · stars
      const starA = s.stars * (1 - s.cover * 0.9) * (1 - s.fog) * f2;
      if (starA > 0.01) {
        ctx.fillStyle = '#e8f0ff';
        for (let i = 0; i < 38; i++) {
          const px = (hash(i, 3) * 2 - 1) * r, py = -r + hash(i, 4) * r * 1.25;
          const tw = still ? 0.8 : 0.55 + 0.45 * Math.sin(sec * (0.8 + hash(i, 5) * 1.6) + i);
          ctx.globalAlpha = starA * tw * (0.35 + 0.65 * hash(i, 6));
          const sz = 0.5 + hash(i, 7) * 0.9;
          ctx.fillRect(px, py, sz, sz);
        }
        ctx.globalAlpha = 1;
      }
      // 3 · sun or moon, with the light they throw
      const sunA = s.sun * (1 - s.cover * 0.75) * f2;
      const sx = -r * 0.34, sy = -r * 0.36;
      if (sunA > 0.01) {
        ctx.globalCompositeOperation = 'screen';
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 1.1);
        glow.addColorStop(0, `rgba(255,236,180,${0.75 * sunA})`); glow.addColorStop(0.18, `rgba(255,210,120,${0.35 * sunA})`); glow.addColorStop(1, 'rgba(255,190,90,0)');
        ctx.fillStyle = glow; ctx.fillRect(-r, -r, r * 2, r * 2);
        // soft volumetric-looking beams that turn very slowly
        const beamA = s.beams * (1 - s.cover * 0.85) * f2 * (low ? 0.6 : 1);
        if (beamA > 0.02) {
          const turn = still ? 0.4 : sec * 0.035;
          for (let i = 0; i < 7; i++) {
            const a = turn + i * (TAU / 7) + Math.sin(sec * 0.3 + i) * (still ? 0 : 0.04);
            const len = r * (1.5 + 0.3 * hash(i, 9)), wdt = 0.07 + 0.05 * hash(i, 8);
            const g = ctx.createRadialGradient(sx, sy, r * 0.12, sx, sy, len);
            g.addColorStop(0, `rgba(255,232,170,${0.16 * beamA})`); g.addColorStop(1, 'rgba(255,220,150,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, len, a - wdt, a + wdt); ctx.closePath(); ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        const disc = ctx.createRadialGradient(sx - r * 0.03, sy - r * 0.03, 0, sx, sy, r * 0.14);
        disc.addColorStop(0, `rgba(255,252,236,${sunA})`); disc.addColorStop(0.7, `rgba(255,232,170,${0.95 * sunA})`); disc.addColorStop(1, `rgba(255,214,130,0)`);
        ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(sx, sy, r * 0.14, 0, TAU); ctx.fill();
      }
      const moonA = s.moon * (1 - s.cover * 0.8) * f2;
      const mx = r * 0.3, my = -r * 0.36;
      if (moonA > 0.01) {
        ctx.globalCompositeOperation = 'screen';
        const mg = ctx.createRadialGradient(mx, my, 0, mx, my, r * 0.75);
        mg.addColorStop(0, `rgba(190,214,255,${0.42 * moonA})`); mg.addColorStop(1, 'rgba(150,180,240,0)');
        ctx.fillStyle = mg; ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.globalCompositeOperation = 'source-over';
        const md = ctx.createRadialGradient(mx - r * 0.03, my - r * 0.03, 0, mx, my, r * 0.1);
        md.addColorStop(0, `rgba(246,248,255,${moonA})`); md.addColorStop(1, `rgba(206,218,240,${0.9 * moonA})`);
        ctx.fillStyle = md; ctx.beginPath(); ctx.arc(mx, my, r * 0.095, 0, TAU); ctx.fill();
        // its shadowed side, so it reads as a little world and not a dot
        ctx.fillStyle = rgb(col.top, 0.5 * moonA);
        ctx.beginPath(); ctx.arc(mx + r * 0.04, my - r * 0.015, r * 0.085, 0, TAU); ctx.fill();
      }
      // heat shimmer on a bright day
      const shimA = s.shimmer * (1 - s.cover) * f3;
      if (shimA > 0.02 && !still && !low) {
        ctx.globalCompositeOperation = 'screen';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const yy = r * 0.45 - ((sec * 6 + i * 13) % (r * 0.9));
          ctx.strokeStyle = `rgba(255,236,200,${0.07 * shimA * Math.sin(((sec * 6 + i * 13) % (r * 0.9)) / (r * 0.9) * Math.PI)})`;
          ctx.beginPath();
          for (let k = 0; k <= 12; k++) { const xx = -r + (k / 12) * r * 2; const yk = yy + Math.sin(k * 1.3 + sec * 2 + i) * 1.6; if (k) ctx.lineTo(xx, yk); else ctx.moveTo(xx, yk); }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // 4 · the far world: two soft ranges of hills under the sky
      {
        const fogK = s.fog, snowK = s.snow;
        let far = lerpC(col.bot, [20, 30, 36], 0.42 + 0.2 * s.night), near = lerpC(col.bot, [10, 16, 20], 0.66 + 0.2 * s.night);
        far = lerpC(far, [226, 234, 240], snowK * 0.55 * (1 - s.night * 0.6)); near = lerpC(near, [232, 238, 244], snowK * 0.6 * (1 - s.night * 0.6));
        far = lerpC(far, col.bot, fogK * 0.7); near = lerpC(near, col.bot, fogK * 0.45);
        ctx.globalAlpha = ease(form / 0.35) * f2;
        ctx.fillStyle = rgb(far); ctx.fill(S.hills.far);
        ctx.fillStyle = rgb(near); ctx.fill(S.hills.near);
        // a wet sheen on the near hills in the rain
        if (s.rain > 0.05) { ctx.fillStyle = `rgba(160,190,210,${0.08 * s.rain})`; ctx.fill(S.hills.near); }
        // far lights at night and in fog: a town somewhere
        const lightsA = Math.max(s.night * 0.7, s.fog * 0.55) * f2 * (1 - s.snow * 0.3);
        if (lightsA > 0.03) {
          ctx.globalCompositeOperation = 'screen';
          for (let i = 0; i < 7; i++) {
            const lx = (hash(i, 21) * 1.6 - 0.8) * r, ly = r * (0.55 + hash(i, 22) * 0.12);
            const lr = r * (0.02 + 0.05 * s.fog) * (0.7 + 0.6 * hash(i, 23));
            const flick = still ? 1 : 0.85 + 0.15 * Math.sin(sec * (1 + hash(i, 24)) + i);
            const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr * 3);
            lg.addColorStop(0, `rgba(255,214,150,${0.7 * lightsA * flick})`); lg.addColorStop(1, 'rgba(255,190,120,0)');
            ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, ly, lr * 3, 0, TAU); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = ease(form / 0.35);
      }
      // 5 · clouds in three depths: far ones small, pale and slow; near ones big, dark and quick
      const coverA = s.cover * f2;
      if (coverA > 0.01 && S.sprites[0].light) {
        const layers = low
          ? [{ n: 3, sc: 0.62, sp: 0.018, y0: -0.62, y1: -0.22, haze: 0.45 }, { n: 3, sc: 1.05, sp: 0.04, y0: -0.5, y1: 0.05, haze: 0 }]
          : [{ n: 5, sc: 0.5, sp: 0.014, y0: -0.7, y1: -0.25, haze: 0.5 }, { n: 4, sc: 0.8, sp: 0.026, y0: -0.6, y1: -0.05, haze: 0.22 }, { n: 3, sc: 1.18, sp: 0.045, y0: -0.48, y1: 0.12, haze: 0 }];
        layers.forEach((L, li) => {
          for (let i = 0; i < L.n; i++) {
            const vis = clamp(coverA * (L.n + 0.6) - i * (0.92 - s.dark * 0.2));
            if (vis <= 0.01) continue;
            const sp = S.sprites[(i + li * 2) % S.sprites.length];
            const w = sp.w * L.sc * (1 + s.dark * 0.25 * (li + 1) / layers.length), h = sp.h * L.sc * (1 + s.dark * 0.35);
            const span = r * 2 + w;
            const x0 = (hash(i, 40 + li) * span + sec * r * L.sp * windK * (li + 1)) % span - r - w;
            const yy = r * mix(L.y0, L.y1, hash(i, 60 + li)) + s.dark * r * 0.08 * li;
            const a = vis * (0.55 + 0.45 * (li + 1) / layers.length) * (1 - L.haze * 0.5);
            const darkness = clamp(s.dark * (0.6 + 0.4 * li / layers.length) + s.night * 0.55);
            ctx.globalAlpha = a * (1 - darkness) * ease(form / 0.35);
            ctx.drawImage(sp.light, x0, yy, w, h);
            if (darkness > 0.01) { ctx.globalAlpha = a * darkness * ease(form / 0.35); ctx.drawImage(sp.dark, x0, yy, w, h); }
          }
        });
        // a full sky: a continuous deck of layered cloud rolling slowly overhead
        const deck = clamp((s.cover - 0.6) / 0.4) * f2;
        if (deck > 0.01) {
          const rows = low ? 2 : 3;
          for (let row = 0; row < rows; row++) {
            const sp = S.sprites[(row + 3) % S.sprites.length];
            const w = sp.w * (1.05 + row * 0.2), h = sp.h * (1.25 + row * 0.25);
            const yy = -r * (1.02 - row * 0.3) + s.dark * r * 0.06 * row;
            const off = (sec * r * 0.012 * windK * (row + 1)) % (w * 0.72);
            const darkness = clamp(s.dark * (0.75 + 0.25 * row / rows) + s.night * 0.55);
            for (let x0 = -r - w + off; x0 < r + w * 0.2; x0 += w * 0.72) {
              ctx.globalAlpha = deck * (0.62 + 0.2 * row) * (1 - darkness) * ease(form / 0.35);
              ctx.drawImage(sp.light, x0, yy, w, h);
              if (darkness > 0.01) { ctx.globalAlpha = deck * (0.62 + 0.2 * row) * darkness * ease(form / 0.35); ctx.drawImage(sp.dark, x0, yy, w, h); }
            }
          }
        }
        ctx.globalAlpha = ease(form / 0.35);
        // under heavy cover, the whole little sky dims
        if (s.dark > 0.05) { ctx.fillStyle = `rgba(6,9,14,${0.32 * s.dark * s.cover})`; ctx.fillRect(-r, -r, r * 2, r * 2); }
      }
      // light slipping through gaps in the clouds
      const gapA = s.sun * s.cover * (1 - s.cover) * 2.2 * (1 - s.dark) * f2;
      if (gapA > 0.03) {
        ctx.globalCompositeOperation = 'screen';
        const shift = still ? 0 : Math.sin(sec * 0.25) * r * 0.25;
        for (let i = 0; i < 3; i++) {
          const bx = -r * 0.5 + i * r * 0.45 + shift;
          const g = ctx.createLinearGradient(bx, -r * 0.4, bx + r * 0.3, r * 0.6);
          g.addColorStop(0, `rgba(255,232,180,${0.16 * gapA * (0.6 + 0.4 * Math.sin(sec * 0.7 + i * 2))})`); g.addColorStop(1, 'rgba(255,232,180,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(bx, -r * 0.4); ctx.lineTo(bx + r * 0.12, -r * 0.4); ctx.lineTo(bx + r * 0.42, r); ctx.lineTo(bx + r * 0.14, r); ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // 6 · wind: wisps and torn fragments streaming one way
      const wispA = clamp((s.wind - 0.35) / 0.65) * f3;
      if (wispA > 0.02) {
        ctx.lineCap = 'round';
        const n = low ? 4 : 8;
        for (let i = 0; i < n; i++) {
          const span = r * 3;
          const px = (hash(i, 70) * span + sec * r * (0.55 + hash(i, 71) * 0.5) * (still ? 0 : 1)) % span - r * 1.5;
          const py = (hash(i, 72) * 1.4 - 0.8) * r;
          const len = r * (0.25 + 0.3 * hash(i, 73));
          ctx.strokeStyle = s.night ? `rgba(170,190,220,${0.22 * wispA})` : `rgba(246,250,252,${0.32 * wispA})`;
          ctx.lineWidth = 0.8 + hash(i, 74) * 1.4;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + len * 0.5, py - r * 0.03, px + len, py + r * 0.01); ctx.stroke();
        }
      }
      // 7 · lightning: rare, brief, soft. Never a strobe; none when motion is reduced
      let flash = 0;
      if (s.storm > 0.5 && !still && f3 > 0.9) {
        if (!S.flash && t > S.nextFlash) {
          if (S.nextFlash) S.flash = { at: t, x: (hash(Math.floor(t), 80) - 0.5) * r * 0.9, seed: Math.floor(t) % 997 };
          S.nextFlash = t + 3800 + Math.random() * 6500 * (1.2 - s.storm * 0.4);
        }
        if (S.flash) {
          const e = t - S.flash.at;
          if (e > 520) S.flash = null;
          else {
            // two soft swells, the second smaller
            flash = (e < 90 ? e / 90 : e < 200 ? 1 - (e - 90) / 110 * 0.75 : e < 260 ? 0.25 + (e - 200) / 60 * 0.4 : 0.65 * (1 - (e - 260) / 260)) * 0.85 * s.storm;
            flash = clamp(flash);
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = `rgba(200,214,255,${0.3 * flash})`; ctx.fillRect(-r, -r, r * 2, r * 2);
            if (e < 200) {
              ctx.strokeStyle = `rgba(236,242,255,${0.9 * flash})`; ctx.lineWidth = 1.4; ctx.shadowColor = 'rgba(190,210,255,0.9)'; ctx.shadowBlur = 6;
              ctx.beginPath();
              let bx = S.flash.x, by = -r * 0.42;
              ctx.moveTo(bx, by);
              for (let i = 0; i < 7; i++) { bx += (hash(i, S.flash.seed) - 0.5) * r * 0.16; by += r * 0.11; ctx.lineTo(bx, by); }
              ctx.stroke();
              ctx.shadowBlur = 0;
            }
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      } else S.flash = null;
      // 8 · rain: stateless streaks, slanting with the wind
      const rainA = s.rain * f3;
      if (rainA > 0.02) {
        const n = Math.round((low ? 34 : 70) * rainA);
        const slant = 0.12 + s.wind * 0.3;
        ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const depth = hash(i, 90);
          const v = r * (1.6 + depth * 1.4);
          const len = r * (0.06 + depth * 0.09);
          const span = r * 2.3;
          const py = (hash(i, 91) * span + (still ? 0 : sec * v)) % span - r * 1.15;
          const px = (hash(i, 92) * 2.4 - 1.2) * r + py * slant;
          ctx.strokeStyle = s.night ? `rgba(176,196,222,${(0.26 + 0.38 * depth) * rainA})` : `rgba(226,236,246,${(0.3 + 0.45 * depth) * rainA})`;
          ctx.lineWidth = 0.6 + depth * 0.8;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + len * slant, py + len); ctx.stroke();
        }
        // ripples where it lands on the near hills
        if (!still) {
          for (let i = 0; i < (low ? 2 : 4); i++) {
            const per = 0.9 + hash(i, 95) * 0.6, ph = (sec / per + hash(i, 96)) % 1;
            const k = Math.floor(sec / per + hash(i, 96));
            const rx = (hash(k, 97 + i) * 1.4 - 0.7) * r, ry = r * (0.74 + hash(k, 98 + i) * 0.14);
            ctx.strokeStyle = `rgba(210,226,238,${0.35 * rainA * (1 - ph)})`; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.ellipse(rx, ry, 1 + ph * r * 0.07, 0.4 + ph * r * 0.022, 0, 0, TAU); ctx.stroke();
          }
        }
      }
      // 9 · snow: drifting flakes, nearer ones bigger and quicker
      const snowA = s.snow * f3;
      if (snowA > 0.02) {
        const n = Math.round((low ? 30 : 60) * snowA);
        ctx.fillStyle = '#f4f8fc';
        for (let i = 0; i < n; i++) {
          const depth = hash(i, 100);
          const v = r * (0.12 + depth * 0.22);
          const span = r * 2.2;
          const py = (hash(i, 101) * span + (still ? 0 : sec * v)) % span - r * 1.1;
          const sway = still ? 0 : Math.sin(sec * (0.6 + hash(i, 102)) + i) * r * 0.05;
          const px = (hash(i, 103) * 2.2 - 1.1) * r + sway + (still ? 0 : sec * s.wind * r * 0.08) % (r * 0.2);
          ctx.globalAlpha = ease(form / 0.35) * (0.4 + 0.6 * depth) * snowA;
          ctx.beginPath(); ctx.arc(px, py, 0.6 + depth * 1.5, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = ease(form / 0.35);
      }
      // 10 · fog: drifting banks of haze that swallow the distance
      const fogA = s.fog * f2;
      if (fogA > 0.02) {
        const haze = lerpC(col.bot, [220, 226, 228], 0.3 * (1 - s.night));
        ctx.fillStyle = rgb(haze, 0.42 * fogA); ctx.fillRect(-r, -r, r * 2, r * 2);
        for (let i = 0; i < 3; i++) {
          const yy = r * (0.05 + i * 0.25);
          const drift = still ? 0 : Math.sin(sec * 0.08 + i * 1.7) * r * 0.3;
          const g = ctx.createRadialGradient(drift, yy, 0, drift, yy, r * 1.2);
          g.addColorStop(0, rgb(haze, 0.45 * fogA)); g.addColorStop(1, rgb(haze, 0));
          ctx.save(); ctx.scale(1, 0.32); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(drift, yy / 0.32, r * 1.2, 0, TAU); ctx.fill(); ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      // 11 · the window itself: frost at its edge, wet glass, a curved highlight, and depth at the rim
      const frostA = s.frost * s.snow * f3;
      if (frostA > 0.03) {
        ctx.strokeStyle = `rgba(236,246,255,${0.5 * frostA})`; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
        for (let i = 0; i < 22; i++) {
          const a = hash(i, 110) * TAU, l = r * (0.07 + hash(i, 111) * 0.1);
          const bx = Math.cos(a) * r, by = Math.sin(a) * r, ix = -Math.cos(a), iy = -Math.sin(a);
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + ix * l, by + iy * l);
          for (const side of [-1, 1]) {
            const m = 0.55, px = bx + ix * l * m, py = by + iy * l * m;
            ctx.moveTo(px, py); ctx.lineTo(px + (ix * 0.5 - iy * side * 0.8) * l * 0.4, py + (iy * 0.5 + ix * side * 0.8) * l * 0.4);
          }
          ctx.stroke();
        }
      }
      const wetA = s.rain * f3;
      if (wetA > 0.05) {
        for (let i = 0; i < (low ? 4 : 8); i++) {
          const a = hash(i, 120) * TAU, d = r * (0.35 + hash(i, 121) * 0.55);
          const slide = still ? 0 : ((sec * 0.05 * hash(i, 122)) % 0.3) * r;
          const px = Math.cos(a) * d, py = Math.sin(a) * d + slide, pr = r * (0.018 + hash(i, 123) * 0.022);
          ctx.fillStyle = `rgba(20,30,40,${0.25 * wetA})`; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
          ctx.fillStyle = `rgba(230,240,250,${0.55 * wetA})`; ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pr * 0.35, pr * 0.4, 0, TAU); ctx.fill();
        }
      }
      const rim = ctx.createRadialGradient(0, 0, r * 0.62, 0, 0, r);
      rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(0.8, 'rgba(1,3,6,0.18)'); rim.addColorStop(1, 'rgba(1,3,6,0.62)');
      ctx.fillStyle = rim; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'screen';
      const spec = ctx.createLinearGradient(-r * 0.7, -r * 0.9, -r * 0.1, -r * 0.2);
      spec.addColorStop(0, `rgba(255,255,255,${0.12 * form})`); spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = spec; ctx.lineWidth = r * 0.06;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.84, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke();
      ctx.restore();
      return { flash };
    }
    // does the world still need frames? (a still world needs none once it has settled)
    function moving(motion) { return motion ? true : !S.settled; }
    return {
      setTarget, step, paint, moving,
      live: () => ({ ...S.live }), target: () => ({ ...S.target }), settled: () => S.settled,
      stats: () => ({ frames: S.frames, flash: !!S.flash })
    };
  }

  // ---------- the forecast ring on his iris ----------
  // hours: up to 24 { temp, pop, cond }, sel: selected index (may be fractional while it glides)
  function paintRing(ctx, o) {
    const { x, y, r0, r1, hours, sel, tint, u, labels } = o;
    if (!hours || !hours.length || u <= 0.01) return;
    const n = 24, mid = (r0 + r1) / 2;
    const ang = (i) => -Math.PI / 2 + (i / n) * TAU;
    let lo = Infinity, hi = -Infinity;
    for (const h of hours) if (h.temp != null) { lo = Math.min(lo, h.temp); hi = Math.max(hi, h.temp); }
    const span = Math.max(4, hi - lo);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = u;
    // a fine dark channel so the marks read on any iris
    ctx.strokeStyle = 'rgba(0,4,8,0.34)'; ctx.lineWidth = r1 - r0;
    ctx.beginPath(); ctx.arc(0, 0, mid, 0, TAU); ctx.stroke();
    // rain chance: ticks that lengthen and cool toward blue
    ctx.lineCap = 'round';
    for (let i = 0; i < Math.min(n, hours.length); i++) {
      const h = hours[i], a = ang(i), pop = h.pop == null ? 0 : h.pop / 100;
      const len = (r1 - r0) * (0.16 + 0.42 * pop);
      const ca = Math.cos(a), sa = Math.sin(a);
      ctx.strokeStyle = pop > 0.15 ? `rgba(150,200,255,${0.35 + 0.55 * pop})` : tint(1.05, 0.38);
      ctx.lineWidth = i % 6 === 0 ? 1.8 : 1.1;
      ctx.beginPath(); ctx.moveTo(ca * (r1 - 1.5), sa * (r1 - 1.5)); ctx.lineTo(ca * (r1 - 1.5 - len), sa * (r1 - 1.5 - len)); ctx.stroke();
    }
    // the temperature trace: warmer hours sit further out
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < Math.min(n, hours.length); i++) {
      const h = hours[i];
      if (h.temp == null) { started = false; continue; }
      const rr = r0 + (r1 - r0) * (0.18 + 0.46 * ((h.temp - lo) / span));
      const px = Math.cos(ang(i)) * rr, py = Math.sin(ang(i)) * rr;
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = tint(1.3, 0.7); ctx.lineWidth = 1.3; ctx.lineJoin = 'round'; ctx.stroke();
    // "now" at the top
    ctx.fillStyle = tint(1.4, 0.9);
    ctx.beginPath(); ctx.moveTo(0, -r1 - 4.5); ctx.lineTo(-3, -r1 - 0.5); ctx.lineTo(3, -r1 - 0.5); ctx.closePath(); ctx.fill();
    // small labels every six hours
    if (labels && r1 - r0 > 18) {
      ctx.font = '600 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [i, text] of labels) {
        const a = ang(i), rr = r0 + (r1 - r0) * 0.38;
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(text, Math.cos(a) * rr + 0.5, Math.sin(a) * rr + 0.7);
        ctx.fillStyle = tint(1.5, 0.82); ctx.fillText(text, Math.cos(a) * rr, Math.sin(a) * rr);
      }
    }
    // the selected hour: a bead of light riding the ring
    const sa = ang(sel), bx = Math.cos(sa) * mid, by = Math.sin(sa) * mid;
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, 13);
    bg.addColorStop(0, tint(1.6, 0.85)); bg.addColorStop(0.4, tint(1.2, 0.35)); bg.addColorStop(1, tint(1, 0));
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(244,252,255,0.95)'; ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, TAU); ctx.fill();
    // the elapsed arc from now to the selection
    if (sel > 0.05) {
      ctx.strokeStyle = tint(1.3, 0.4); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r1 + 2.5, ang(0), sa); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- idle weather moments ----------
  // brief, subtle, painted inside his iris; e runs 0 → 1 over the moment
  const MOMENTS = {
    sun: { dur: 2200 }, partly: { dur: 2000 }, rain: { dur: 2400 }, snow: { dur: 2800 }, storm: { dur: 1500 },
    overcast: { dur: 2600 }, fog: { dur: 2800 }, night: { dur: 2600 }, wind: { dur: 1600 }
  };
  // each moment is painted into a small layer, softly masked to his iris (no hard circular edge), then laid
  // over the Eye; `fade` (0..1) lets a blink or anything more important take it away at once
  let layer = null;
  function momentLayer(px) {
    if (!layer || layer.width < px || layer.width > px * 2) { layer = makeCanvas(px, px); }
    return layer;
  }
  function paintMoment(ctx, o) {
    const { kind, e, gx, gy, R, gentle } = o;
    const fade = o.fade == null ? 1 : clamp(o.fade);
    if (!MOMENTS[kind] || e <= 0 || e >= 1 || R < 4 || fade <= 0.01) return;
    const dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    const px = Math.ceil(R * 2 * dpr);
    const L = momentLayer(px);
    if (!L) return;
    const x = L.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.clearRect(0, 0, L.width, L.height);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = R, cy = R;                       // the iris centre inside the layer
    const amp = (gentle ? 0.6 : 1), bell = Math.sin(e * Math.PI);
    let mode = 'screen';
    if (kind === 'sun' || kind === 'partly') {
      // a warm glint passes through him
      const k = kind === 'sun' ? 1 : 0.6, along = gentle ? 0.5 : mix(-1.2, 1.2, ease(e));
      const bx = cx + along * R, by = cy - along * R * 0.4;
      const g = x.createLinearGradient(bx - R * 0.5, by - R * 0.3, bx + R * 0.5, by + R * 0.3);
      g.addColorStop(0, 'rgba(255,214,140,0)'); g.addColorStop(0.5, `rgba(255,222,150,${0.44 * k * amp * bell})`); g.addColorStop(1, 'rgba(255,214,140,0)');
      x.fillStyle = g; x.fillRect(0, 0, R * 2, R * 2);
    } else if (kind === 'rain') {
      // a raindrop's reflection, there and gone
      mode = 'source-over';
      const slide = gentle ? 0 : ease(e) * R * 0.14;
      const dx = cx + R * 0.34, dy = cy - R * 0.34 + slide, dr = R * 0.12;
      const a = amp * bell;
      // the faint wet trail it leaves, then the bead itself: a dark lens with a bright rim and a glint
      if (slide > 1) { x.strokeStyle = `rgba(190,215,235,${0.22 * a})`; x.lineWidth = dr * 0.5; x.lineCap = 'round'; x.beginPath(); x.moveTo(dx, dy - slide); x.lineTo(dx, dy - dr * 0.6); x.stroke(); }
      x.save(); x.translate(dx, dy); x.scale(1, 1.12);
      const lens = x.createRadialGradient(-dr * 0.2, -dr * 0.25, dr * 0.1, 0, 0, dr);
      lens.addColorStop(0, `rgba(30,50,64,${0.15 * a})`); lens.addColorStop(0.8, `rgba(8,16,24,${0.38 * a})`); lens.addColorStop(1, `rgba(170,205,230,${0.5 * a})`);
      x.fillStyle = lens; x.beginPath(); x.arc(0, 0, dr, 0, TAU); x.fill();
      x.strokeStyle = `rgba(214,234,250,${0.65 * a})`; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, dr, 0.3, Math.PI * 1.05); x.stroke();
      x.fillStyle = `rgba(246,251,255,${0.9 * a})`; x.beginPath(); x.ellipse(-dr * 0.35, -dr * 0.42, dr * 0.26, dr * 0.17, -0.6, 0, TAU); x.fill();
      x.restore();
    } else if (kind === 'snow') {
      // one snowflake drifts across his pupil
      mode = 'source-over';
      const fx = gentle ? cx - R * 0.2 : mix(cx - R * 0.7, cx + R * 0.55, e), fy = gentle ? cy - R * 0.2 : mix(cy - R * 0.65, cy + R * 0.5, e) + Math.sin(e * 6) * R * 0.05;
      const sz = R * 0.09, rot = e * 1.4, fa = amp * Math.min(1, bell * 2);
      x.lineCap = 'round';
      x.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = rot + (i * Math.PI) / 3, ca = Math.cos(a), sa = Math.sin(a);
        x.moveTo(fx, fy); x.lineTo(fx + ca * sz, fy + sa * sz);
        const mx = fx + ca * sz * 0.6, my = fy + sa * sz * 0.6;
        x.moveTo(mx, my); x.lineTo(mx + Math.cos(a + 0.7) * sz * 0.3, my + Math.sin(a + 0.7) * sz * 0.3);
        x.moveTo(mx, my); x.lineTo(mx + Math.cos(a - 0.7) * sz * 0.3, my + Math.sin(a - 0.7) * sz * 0.3);
      }
      // a faint shadow first, so the flake still reads as it crosses his bright pupil
      x.strokeStyle = `rgba(6,16,24,${0.45 * fa})`; x.lineWidth = 2.6; x.stroke();
      x.strokeStyle = `rgba(246,251,255,${0.95 * fa})`; x.lineWidth = 1.1; x.stroke();
    } else if (kind === 'storm') {
      // a distant flicker of light from somewhere beyond: two soft swells, never a flash
      const s1 = Math.max(0, 1 - Math.abs(e - 0.25) / 0.12), s2 = Math.max(0, 1 - Math.abs(e - 0.55) / 0.1) * 0.6;
      const k = (s1 + s2) * amp;
      const lx = cx - R * 0.55, ly = cy - R * 0.65;
      const g = x.createRadialGradient(lx, ly, 0, lx, ly, R * 1.5);
      g.addColorStop(0, `rgba(200,214,255,${0.36 * k})`); g.addColorStop(1, 'rgba(200,214,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, R * 2, R * 2);
    } else if (kind === 'overcast' || kind === 'fog') {
      // his inner light softens for a moment
      mode = 'source-over';
      x.fillStyle = kind === 'fog' ? `rgba(170,178,182,${0.16 * amp * bell})` : `rgba(4,8,12,${0.26 * amp * bell})`;
      x.fillRect(0, 0, R * 2, R * 2);
    } else if (kind === 'night') {
      // a cool moonlit reflection slides across his iris
      const along = gentle ? 0 : mix(-0.9, 0.9, ease(e));
      const mx = cx + along * R, my = cy - R * 0.45;
      x.save(); x.translate(mx, my); x.scale(1.6, 0.6);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, R * 0.45);
      g.addColorStop(0, `rgba(200,220,255,${0.44 * amp * bell})`); g.addColorStop(1, 'rgba(200,220,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, R * 0.45, 0, TAU); x.fill(); x.restore();
    } else if (kind === 'wind') {
      const along = mix(-1.3, 1.3, e), wy = cy - R * 0.2;
      x.strokeStyle = `rgba(230,240,248,${0.35 * amp * bell})`; x.lineWidth = 1.1; x.lineCap = 'round';
      x.beginPath(); x.moveTo(cx + along * R - R * 0.35, wy); x.quadraticCurveTo(cx + along * R, wy - R * 0.06, cx + along * R + R * 0.35, wy + R * 0.02); x.stroke();
    }
    // a soft edge: full inside the iris, gone by its rim
    x.globalCompositeOperation = 'destination-in';
    const m = x.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 0.96);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = m; x.fillRect(0, 0, R * 2, R * 2);
    x.globalCompositeOperation = 'source-over';
    ctx.save();
    if (o.clip) o.clip(ctx);
    ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = fade;
    ctx.drawImage(L, 0, 0, px, px, gx - R, gy - R, R * 2, R * 2);
    ctx.restore();
  }

  root.EyesWeatherSky = { sceneFor, createSky, paintRing, paintMoment, MOMENTS, KEYS, skyColours };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EyesWeatherSky;
})(typeof window !== 'undefined' ? window : globalThis);
