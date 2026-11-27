/* EYES 5.0 · Arcade kit. The small shared toolbox the Eye Arcade cartridges are built from, plus each
   cartridge's miniature label art for the selection screen.

   Loaded when the Arcade opens (it holds no engine and starts nothing): the selection screen paints the label
   art from here, and a game's own file is only fetched and created once you press Play.

     ArcadeKit.rng(seed)            mulberry32, deterministic for a seed
     ArcadeKit.canvas(w, h)         an offscreen canvas (OffscreenCanvas where available)
     ArcadeKit.sprite(rows, pal)    pixel art from little character maps
     ArcadeKit.text(ctx, str, x, y, colour, size, align)   the 3 × 5 pixel font every cartridge shares
     ArcadeKit.synth(getOutput, sounds)   original synthesised sound effects (Web Audio; no files). The Arcade
                                    owns the AudioContext and decides whether sound is on.
     ArcadeKit.tone / hiss / notes  the building blocks for those sounds
     ArcadeKit.art(id, ctx, w, h, t)   the cartridge label art (static at t = 0)
   Everything is original: drawn in code, synthesised on the spot. */
'use strict';
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function canvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch (e) {} }
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function sprite(rows, pal) {
    const h = rows.length, w = rows[0].length;
    const c = canvas(w, h), x = c.getContext('2d');
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      const k = rows[y][i];
      if (k === '.' || !pal[k]) continue;
      x.fillStyle = pal[k]; x.fillRect(i, y, 1, 1);
    }
    return c;
  }
  const mirror = (rows) => rows.map((s) => s.split('').reverse().join(''));
  // 3 × 5 pixel letters (the same alphabet as Tunnelbug)
  const FONT = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001011001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', '!': '010010010000010', '+': '000010111010000', ':': '000010000010000', '-': '000000111000000',
    '.': '000000000000010', 'x': '000101010101000', '/': '001001010100100', ' ': '000000000000000'
  };
  function text(ctx, str, x, y, colour, size, align) {
    size = size || 1;
    str = String(str).toUpperCase().replace(/X(?=\d)/g, 'x');
    const width = str.length * 4 * size - size;
    let ox = align === 'center' ? Math.round(x - width / 2) : align === 'right' ? Math.round(x - width) : Math.round(x);
    ctx.fillStyle = colour;
    for (const ch of str) {
      const g = FONT[ch] || FONT[' '];
      for (let k = 0; k < 15; k++) if (g[k] === '1') ctx.fillRect(ox + (k % 3) * size, Math.round(y) + ((k / 3) | 0) * size, size, size);
      ox += 4 * size;
    }
    return width;
  }

  // ---------- sound ----------
  const noiseCache = new WeakMap();
  function noiseBuffer(ac) {
    let b = noiseCache.get(ac);
    if (!b) {
      b = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.4), ac.sampleRate);
      const d = b.getChannelData(0);
      let s = 7;
      for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
      noiseCache.set(ac, b);
    }
    return b;
  }
  function tone(ac, out, t0, o) {
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
    const v = o.vol == null ? 0.1 : o.vol, a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(out);
    osc.start(t0); osc.stop(t0 + o.dur + 0.02);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch (e) {} };
  }
  function hiss(ac, out, t0, o) {
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuffer(ac);
    f.type = o.filter || 'bandpass'; f.frequency.setValueAtTime(o.f || 900, t0); f.Q.value = o.q || 1.2;
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
    g.gain.setValueAtTime(o.vol || 0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t0, Math.random() * 0.2, o.dur + 0.02);
    src.onended = () => { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} };
  }
  const notes = (ac, out, t0, list, step, o) => list.forEach((f, i) => tone(ac, out, t0 + i * step, { ...o, f0: f, dur: o.dur || step * 1.2 }));
  // one player per game: never makes a sound unless the Arcade hands it a running output
  function synth(getOutput, sounds) {
    let lastAt = {};
    return {
      play(name, arg) {
        const fn = sounds[name];
        if (!fn || typeof getOutput !== 'function') return false;
        const o = getOutput();
        if (!o || !o.ctx || o.ctx.state === 'closed') return false;
        const t = o.ctx.currentTime;
        if (lastAt[name] != null && t - lastAt[name] < 0.03) return false;   // never stack the same sound
        lastAt[name] = t;
        try { fn(o.ctx, o.out, t + 0.005, arg); return true; } catch (e) { return false; }
      },
      stop() { lastAt = {}; }
    };
  }

  // ---------- particles (capped, so effects never depend on numbers) ----------
  function particles(max) {
    const list = [];
    return {
      list,
      add(p) { if (list.length >= max) list.shift(); list.push(p); },
      step(dt) {
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          p.life -= dt; p.x += (p.vx || 0) * dt / 1000; p.y += (p.vy || 0) * dt / 1000;
          if (p.g) p.vy += p.g * dt / 1000;
          if (p.life <= 0) list.splice(i, 1);
        }
      },
      clear() { list.length = 0; },
      get size() { return list.length; }
    };
  }

  // ---------- the cartridge labels (static pixel art, original) ----------
  const ART = {
    tunnelbug(ctx, w, h) {
      ctx.fillStyle = '#2b1a14'; ctx.fillRect(0, 0, w, h);
      const bands = ['#7c4a2f', '#6e3c4e', '#4c3a66', '#2d3c5e'];
      for (let i = 0; i < 4; i++) { ctx.fillStyle = bands[i]; ctx.fillRect(0, Math.round(i * h / 4), w, Math.ceil(h / 4)); }
      ctx.fillStyle = '#0c1014';
      ctx.fillRect(3, Math.round(h * 0.42), w - 14, 4); ctx.fillRect(w - 14, Math.round(h * 0.42), 4, Math.round(h * 0.45));
      ctx.fillStyle = '#63e6ff'; ctx.fillRect(8, Math.round(h * 0.72), 3, 3); ctx.fillRect(w - 7, 4, 3, 3);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(Math.round(w * 0.55), Math.round(h * 0.18), 3, 3);
      const bx = Math.round(w * 0.36), by = Math.round(h * 0.42) - 1;
      ctx.fillStyle = '#0f3942'; ctx.fillRect(bx - 1, by, 8, 6);
      ctx.fillStyle = '#5cf0cf'; ctx.fillRect(bx, by + 1, 6, 4);
      ctx.fillStyle = '#dcfff6'; ctx.fillRect(bx, by + 1, 2, 2);
      ctx.fillStyle = '#ff5fa8'; ctx.fillRect(w - 14, Math.round(h * 0.78), 5, 4);
      ctx.fillStyle = '#fff'; ctx.fillRect(w - 13, Math.round(h * 0.78) + 1, 1, 1);
    },
    orbit(ctx, w, h) {
      ctx.fillStyle = '#03060c'; ctx.fillRect(0, 0, w, h);
      const r = rng(11);
      for (let i = 0; i < 14; i++) { ctx.fillStyle = r() < 0.5 ? '#2a4860' : '#56708a'; ctx.fillRect((r() * w) | 0, (r() * h) | 0, 1, 1); }
      const rock = (cx, cy, s, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i <= 7; i++) { const a = (i / 7) * Math.PI * 2, k = s * (0.75 + 0.25 * Math.sin(i * 2.7 + s)); ctx.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); }
        ctx.stroke();
      };
      rock(w * 0.72, h * 0.32, Math.min(w, h) * 0.22, '#7fe3ff');
      rock(w * 0.25, h * 0.72, Math.min(w, h) * 0.12, '#5bb8d6');
      rock(w * 0.86, h * 0.8, Math.min(w, h) * 0.07, '#5bb8d6');
      const sx = w * 0.32, sy = h * 0.36;
      ctx.strokeStyle = '#ffd38a'; ctx.beginPath(); ctx.moveTo(sx + 5, sy); ctx.lineTo(sx - 3, sy - 3); ctx.lineTo(sx - 1, sy); ctx.lineTo(sx - 3, sy + 3); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#ffe9b8'; ctx.fillRect(Math.round(sx + 9), Math.round(sy) - 0, 3, 1); ctx.fillRect(Math.round(sx + 15), Math.round(sy) - 1, 3, 1);
    },
    critter(ctx, w, h) {
      const rows = 6, rh = h / rows;
      const cols = ['#1f4a2e', '#203040', '#203040', '#1f4a2e', '#123a52', '#1f4a2e'];
      for (let i = 0; i < rows; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(0, Math.round(i * rh), w, Math.ceil(rh)); }
      ctx.fillStyle = '#3fb4e0';
      for (let x = 0; x < w; x += 6) ctx.fillRect(x + 2, Math.round(4 * rh + rh / 2), 2, 1);
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(Math.round(w * 0.12), Math.round(4 * rh + 1), Math.round(w * 0.3), Math.round(rh - 2));
      ctx.fillStyle = '#ffb347'; ctx.fillRect(Math.round(w * 0.6), Math.round(1 * rh + 1), 7, Math.round(rh - 2));
      ctx.fillStyle = '#ff5f7a'; ctx.fillRect(Math.round(w * 0.18), Math.round(2 * rh + 1), 7, Math.round(rh - 2));
      const cx = Math.round(w * 0.46), cy = Math.round(5 * rh + 1);
      ctx.fillStyle = '#9dff8a'; ctx.fillRect(cx, cy, 5, 4);
      ctx.fillStyle = '#10301a'; ctx.fillRect(cx + 1, cy + 1, 1, 1); ctx.fillRect(cx + 3, cy + 1, 1, 1);
      ctx.fillStyle = '#ffe08a'; ctx.fillRect(Math.round(w * 0.46), 1, 5, 2);
    },
    prism(ctx, w, h) {
      ctx.fillStyle = '#05050c'; ctx.fillRect(0, 0, w, h);
      const pal = ['#ff7ad9', '#b48cff', '#6fd8ff', '#7affc4', '#ffd166'];
      const bw = Math.floor((w - 4) / 6);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
        if ((r === 3 && (c === 0 || c === 5))) continue;
        const x = 2 + c * bw, y = 3 + r * 4;
        ctx.fillStyle = pal[(r + c) % pal.length]; ctx.fillRect(x, y, bw - 1, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x, y, bw - 1, 1);
      }
      ctx.fillStyle = '#e8fbff'; ctx.fillRect(Math.round(w * 0.58), Math.round(h * 0.62), 2, 2);
      ctx.fillStyle = '#6fd8ff'; ctx.fillRect(Math.round(w * 0.38), h - 4, Math.round(w * 0.26), 2);
    }
  };
  function art(id, ctx, w, h) { const f = ART[id]; if (!f) return false; ctx.save(); try { f(ctx, w, h); } finally { ctx.restore(); } return true; }

  root.ArcadeKit = { rng, canvas, sprite, mirror, text, tone, hiss, notes, synth, particles, art, FONT };
})(typeof window === 'undefined' ? globalThis : window);
