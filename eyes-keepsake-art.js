/* EYES 5.3 · Keepsake art: every discovery drawn procedurally in his own light (no images, no emoji).
   The same visual language as the desktop companion's props (companion.js paintProps): a wide soft glow pass,
   a colour pass and a thin white core, in the creature's own colour shifted a little per discovery.

   EyesKeepsakeArt.paint(ctx, id, { x, y, r, color, vs, t, alpha, still })
     id     a catalog discovery id ("aquatic.fish.moonpuff")
     color  the creature's tint function (mult, alpha) -> css colour (HavenRender.ownColor(dna) on the phone)
     vs     the variation seed recorded with the discovery (0..65535): small, deterministic differences
     t      seconds, for a gentle shimmer (omit or pass still:true for a static drawing) */
'use strict';
(function (root) {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const CAT = () => root.EYES_CATALOG || { discoveries: {} };

  // ---- colour: parse the tint, shift its hue, hand back a tint of the same shape
  function parse(c) {
    const m = /rgba?\(([^)]+)\)/.exec(String(c));
    if (!m) return [190, 235, 238];
    return m[1].split(',').slice(0, 3).map((x) => parseFloat(x) || 0);
  }
  function rgb2hsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hsl2rgb([h, s, l]) {
    h = ((h % 360) + 360) % 360 / 360;
    if (!s) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  function shifted(color, deg) {
    const base = rgb2hsl(parse(color ? color(1, 1) : 'rgb(170,225,230)'));
    const hsl = [base[0] + deg, clamp(base[1] * 0.9 + 0.12, 0.25, 0.85), clamp(base[2], 0.5, 0.72)];
    const [r, g, b] = hsl2rgb(hsl);
    return (mult, a) => {
      const k = mult || 1, lift = k > 1 ? (k - 1) * 0.6 : 0;
      const c = (x) => Math.round(clamp(x * Math.min(k, 1) + (255 - x) * lift, 0, 255));
      return `rgba(${c(r)},${c(g)},${c(b)},${clamp(a == null ? 1 : a)})`;
    };
  }
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  }

  // ---- the glow stroke: soft wide pass, colour pass, white core
  function glow(ctx, tint, draw, r, a, fill) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = a;
    ctx.strokeStyle = tint(0.9, 0.16); ctx.lineWidth = r * 0.34; ctx.beginPath(); draw(); ctx.stroke();
    if (fill) { ctx.fillStyle = tint(0.8, 0.16 * fill); ctx.beginPath(); draw(); ctx.fill(); }
    ctx.strokeStyle = tint(1.05, 0.78); ctx.lineWidth = Math.max(1, r * 0.1); ctx.beginPath(); draw(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.72)'; ctx.lineWidth = Math.max(0.6, r * 0.035); ctx.beginPath(); draw(); ctx.stroke();
    ctx.restore();
  }
  function orb(ctx, tint, x, y, rr, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, 'rgba(255,255,255,' + 0.9 * a + ')'); g.addColorStop(0.35, tint(1.1, 0.7 * a)); g.addColorStop(1, tint(0.8, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
  }
  function star(ctx, x, y, R, r, n, rot) {
    for (let i = 0; i <= n * 2; i++) {
      const a = rot + (i / (n * 2)) * TAU - Math.PI / 2, rr = i % 2 ? r : R;
      i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
  }

  const ART = {
    fish(ctx, T, r, o, I, R) {
      const sh = I.shape || {}, L = r * (sh.len || 1), H = r * (0.35 + 0.4 * (sh.round || 0.4)), f = sh.fin || 0.6, sway = Math.sin(o.t * 2.2) * 0.08;
      glow(ctx, T, () => {
        ctx.moveTo(-L * 0.62, 0);
        ctx.bezierCurveTo(-L * 0.25, -H, L * 0.35, -H * 0.95, L * 0.55, -H * 0.1);
        ctx.quadraticCurveTo(L * 0.62, 0, L * 0.55, H * 0.1);
        ctx.bezierCurveTo(L * 0.35, H * 0.95, -L * 0.25, H, -L * 0.62, 0);
        ctx.moveTo(-L * 0.6, 0); ctx.lineTo(-L * (0.95 + 0.25 * f), -H * (0.55 + sway));
        ctx.moveTo(-L * 0.6, 0); ctx.lineTo(-L * (0.95 + 0.25 * f), H * (0.55 - sway));
        ctx.moveTo(-L * 0.05, -H * 0.82); ctx.quadraticCurveTo(L * 0.05, -H * (1.2 + 0.3 * f), L * 0.2, -H * 0.75);
      }, r, o.alpha, 0.8);
      orb(ctx, T, L * 0.3, -H * 0.15, r * 0.09, o.alpha);
      if (sh.lamp) { ctx.strokeStyle = T(1, 0.6 * o.alpha); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L * 0.45, -H * 0.5); ctx.quadraticCurveTo(L * 0.75, -H * 1.2, L * 0.85, -H * 0.85); ctx.stroke(); orb(ctx, T, L * 0.85, -H * 0.85, r * 0.16, o.alpha); }
      if (sh.speckle) for (let i = 0; i < 6; i++) orb(ctx, T, (R() - 0.5) * L * 0.8, (R() - 0.5) * H, r * 0.05, o.alpha * 0.9);
    },
    boot(ctx, T, r, o) {
      glow(ctx, T, () => {
        ctx.moveTo(-r * 0.3, -r * 0.7); ctx.lineTo(-r * 0.3, r * 0.25); ctx.quadraticCurveTo(-r * 0.3, r * 0.55, 0, r * 0.55);
        ctx.lineTo(r * 0.6, r * 0.55); ctx.quadraticCurveTo(r * 0.75, r * 0.3, r * 0.4, r * 0.18); ctx.lineTo(r * 0.15, r * 0.1); ctx.lineTo(r * 0.15, -r * 0.7);
        ctx.moveTo(-r * 0.38, -r * 0.7); ctx.lineTo(r * 0.23, -r * 0.7);
      }, r, o.alpha, 0.6);
      orb(ctx, T, r * 0.55, -r * 0.55 - Math.sin(o.t * 1.5) * r * 0.06, r * 0.08, o.alpha * 0.8);     // a drip
    },
    key(ctx, T, r, o) {
      glow(ctx, T, () => {
        ctx.arc(-r * 0.4, 0, r * 0.26, 0, TAU);
        ctx.moveTo(-r * 0.14, 0); ctx.lineTo(r * 0.7, 0);
        ctx.moveTo(r * 0.45, 0); ctx.lineTo(r * 0.45, r * 0.22); ctx.moveTo(r * 0.62, 0); ctx.lineTo(r * 0.62, r * 0.17);
      }, r, o.alpha);
      orb(ctx, T, -r * 0.4, 0, r * 0.12, o.alpha);
    },
    shell(ctx, T, r, o, I, R) {
      const n = 5 + Math.floor(R() * 3);
      glow(ctx, T, () => {
        ctx.moveTo(-r * 0.7, r * 0.35);
        ctx.quadraticCurveTo(0, -r * 1.15, r * 0.7, r * 0.35); ctx.quadraticCurveTo(0, r * 0.55, -r * 0.7, r * 0.35);
        for (let i = 1; i < n; i++) { const u = i / n; ctx.moveTo(0, r * 0.45); ctx.lineTo(-r * 0.7 + u * r * 1.4, -r * 0.2 * Math.sin(u * Math.PI) - r * 0.05); }
      }, r, o.alpha, 0.5);
    },
    star(ctx, T, r, o) {
      const tw = 1 + Math.sin(o.t * 3) * 0.05;
      glow(ctx, T, () => star(ctx, 0, 0, r * 0.75 * tw, r * 0.32, 5, 0), r, o.alpha, 0.9);
      orb(ctx, T, 0, 0, r * 0.3, o.alpha);
    },
    flower(ctx, T, r, o, I, R) {
      const n = I.petals || 5, rot = R() * TAU, breathe = 1 + Math.sin(o.t * 1.6) * 0.04;
      glow(ctx, T, () => {
        ctx.moveTo(0, r * 0.25); ctx.quadraticCurveTo(r * 0.12, r * 0.6, -r * 0.05, r * 0.95);
        for (let i = 0; i < n; i++) {
          const a = rot + (i / n) * TAU, px = Math.cos(a), py = Math.sin(a), qx = Math.cos(a + 0.5), qy = Math.sin(a + 0.5), sx = Math.cos(a - 0.5), sy = Math.sin(a - 0.5);
          const cx = 0, cy = -r * 0.12, L = r * 0.55 * breathe;
          ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + qx * L * 0.8, cy + qy * L * 0.8, cx + px * L, cy + py * L); ctx.quadraticCurveTo(cx + sx * L * 0.8, cy + sy * L * 0.8, cx, cy);
        }
      }, r, o.alpha, 0.7);
      orb(ctx, T, 0, -r * 0.12, r * 0.16, o.alpha);
    },
    seedpod(ctx, T, r, o) {
      glow(ctx, T, () => {
        ctx.ellipse(0, 0, r * 0.32, r * 0.55, 0.35, 0, TAU);
        ctx.moveTo(r * 0.18, -r * 0.48); ctx.quadraticCurveTo(r * 0.45, -r * 0.9, r * 0.2, -r * 0.95);
        ctx.moveTo(-r * 0.05, -r * 0.35); ctx.lineTo(r * 0.08, r * 0.35);
      }, r, o.alpha, 0.6);
      for (let i = 0; i < 3; i++) orb(ctx, T, Math.sin(o.t + i * 2) * r * 0.5 - r * 0.6, -r * 0.3 - i * r * 0.22, r * 0.05, o.alpha * 0.7);
    },
    crystal(ctx, T, r, o, I, R) {
      const w = 0.38 + R() * 0.12;
      glow(ctx, T, () => {
        ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * w, -r * 0.3); ctx.lineTo(r * w * 0.8, r * 0.6); ctx.lineTo(0, r * 0.85); ctx.lineTo(-r * w * 0.8, r * 0.6); ctx.lineTo(-r * w, -r * 0.3); ctx.closePath();
        ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, r * 0.85); ctx.moveTo(-r * w, -r * 0.3); ctx.lineTo(r * w, -r * 0.3);
      }, r, o.alpha, 1);
      orb(ctx, T, 0, -r * 0.1 + Math.sin(o.t * 1.3) * r * 0.2, r * 0.18, o.alpha);
    },
    feather(ctx, T, r, o) {
      glow(ctx, T, () => {
        ctx.moveTo(-r * 0.55, r * 0.75); ctx.quadraticCurveTo(0, 0, r * 0.45, -r * 0.8);
        ctx.moveTo(r * 0.45, -r * 0.8); ctx.quadraticCurveTo(r * 0.75, -r * 0.1, -r * 0.25, r * 0.45);
        ctx.moveTo(r * 0.45, -r * 0.8); ctx.quadraticCurveTo(-r * 0.25, -r * 0.5, -r * 0.25, r * 0.45);
      }, r, o.alpha, 0.6);
    },
    lantern(ctx, T, r, o) {
      glow(ctx, T, () => {
        ctx.moveTo(-r * 0.3, -r * 0.45); ctx.lineTo(r * 0.3, -r * 0.45); ctx.lineTo(r * 0.38, r * 0.45); ctx.lineTo(-r * 0.38, r * 0.45); ctx.closePath();
        ctx.moveTo(-r * 0.18, -r * 0.45); ctx.quadraticCurveTo(0, -r * 0.95, r * 0.18, -r * 0.45);
        ctx.moveTo(-r * 0.45, r * 0.45); ctx.lineTo(r * 0.45, r * 0.45);
      }, r, o.alpha, 0.5);
      orb(ctx, T, 0, r * 0.02, r * (0.28 + Math.sin(o.t * 4) * 0.03), o.alpha);
    },
    cube(ctx, T, r, o) {
      const s = r * 0.5, d = r * 0.28;
      glow(ctx, T, () => {
        ctx.rect(-s * 0.9, -s * 0.6, s * 1.4, s * 1.4);
        ctx.moveTo(-s * 0.9, -s * 0.6); ctx.lineTo(-s * 0.9 + d, -s * 0.6 - d); ctx.lineTo(s * 0.5 + d, -s * 0.6 - d); ctx.lineTo(s * 0.5, -s * 0.6);
        ctx.moveTo(s * 0.5 + d, -s * 0.6 - d); ctx.lineTo(s * 0.5 + d, s * 0.8 - d); ctx.lineTo(s * 0.5, s * 0.8);
      }, r, o.alpha, 0.6);
    },
    ring(ctx, T, r, o) {
      glow(ctx, T, () => ctx.ellipse(0, 0, r * 0.62, r * 0.5, -0.25, 0, TAU), r, o.alpha);
      const a = o.t * 1.2;
      orb(ctx, T, Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.5, r * 0.11, o.alpha);
    },
    tower(ctx, T, r, o, I, R) {
      const n = 4 + Math.floor(R() * 3);
      let y = r * 0.8;
      const stones = [];
      for (let i = 0; i < n; i++) { const w = r * (0.5 - i * 0.05) * (0.9 + R() * 0.2), h = r * 0.28; stones.push([(R() - 0.5) * r * 0.12, y - h / 2, w, h]); y -= h * 0.98; }
      glow(ctx, T, () => { for (const [x, cy, w, h] of stones) ctx.ellipse(x, cy, w / 2, h / 2, 0, 0, TAU); }, r, o.alpha, 0.5);
      orb(ctx, T, stones[n - 1][0], y - r * 0.05, r * 0.12, o.alpha);
    },
    drawing(ctx, T, r, o, I) {
      const s = I.shape;
      glow(ctx, T, () => {
        if (s === 'star') star(ctx, 0, 0, r * 0.75, r * 0.3, 5, 0);
        else if (s === 'spiral') { for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU * 2.2, rr = r * 0.08 + r * 0.6 * i / 60; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(0, 0); } }
        else if (s === 'wave') { for (let i = 0; i <= 40; i++) { const x = -r * 0.8 + i / 40 * r * 1.6, y = Math.sin(i / 40 * TAU * 1.5) * r * 0.3; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } }
        else if (s === 'flower') { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a + 0.6) * r * 0.6, Math.sin(a + 0.6) * r * 0.6, Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.quadraticCurveTo(Math.cos(a - 0.6) * r * 0.6, Math.sin(a - 0.6) * r * 0.6, 0, 0); } }
        else if (s === 'loop') { for (let i = 0; i <= 80; i++) { const a = i / 80 * TAU; const x = Math.sin(a) * r * 0.75, y = Math.sin(a * 2) * r * 0.35; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } }
        else if (s === 'heart') { ctx.moveTo(0, r * 0.65); ctx.bezierCurveTo(-r * 0.95, 0, -r * 0.45, -r * 0.75, 0, -r * 0.25); ctx.bezierCurveTo(r * 0.45, -r * 0.75, r * 0.95, 0, 0, r * 0.65); }
        else if (s === 'constellation') { const p = [[-0.6, 0.3], [-0.25, -0.2], [0.1, 0.05], [0.45, -0.45], [0.65, 0.25]]; p.forEach(([x, y], i) => (i ? ctx.lineTo(x * r, y * r) : ctx.moveTo(x * r, y * r))); }
        else { ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.moveTo(r * 0.2, -r * 0.05); ctx.arc(0, -r * 0.05, r * 0.2, 0, TAU); }      // portrait: himself
      }, r * 0.8, o.alpha);
      if (s === 'constellation') for (const [x, y] of [[-0.6, 0.3], [-0.25, -0.2], [0.1, 0.05], [0.45, -0.45], [0.65, 0.25]]) orb(ctx, T, x * r, y * r, r * 0.1, o.alpha);
      if (s === 'portrait' || !s) orb(ctx, T, 0, -r * 0.05, r * 0.12, o.alpha);
    }
  };

  function paint(ctx, id, o) {
    const I = (CAT().discoveries || {})[id];
    if (!I || !ART[I.art]) return false;
    o = Object.assign({ x: 0, y: 0, r: 20, vs: 0, t: 0, alpha: 1 }, o || {});
    if (o.still) o.t = 0;
    const R = rng((o.vs || 0) * 7919 + 17);
    const tint = shifted(o.color, (I.hue || 0) + (R() - 0.5) * 18);
    ctx.save();
    ctx.translate(o.x, o.y + Math.sin(o.t * 1.1 + (o.vs % 7)) * o.r * 0.03);
    ctx.rotate((R() - 0.5) * 0.3);
    // a soft pool of his light behind every keepsake
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, o.r * 1.25);
    halo.addColorStop(0, tint(0.9, 0.18 * o.alpha)); halo.addColorStop(1, tint(0.7, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, o.r * 1.25, 0, TAU); ctx.fill();
    try { ART[I.art](ctx, tint, o.r, o, I, R); } finally { ctx.restore(); }
    return true;
  }
  // a glyph for journal entries that aren't discoveries: rest, visits, a funny failure, play
  function glyph(ctx, kind, o) {
    o = Object.assign({ x: 0, y: 0, r: 14, alpha: 1, t: 0 }, o || {});
    const tint = shifted(o.color, 0), r = o.r;
    ctx.save(); ctx.translate(o.x, o.y);
    if (kind === 'rest') glow(ctx, tint, () => { ctx.arc(0, r * 0.1, r * 0.75, 0.1 * Math.PI, 0.9 * Math.PI); ctx.moveTo(-r * 0.4, -r * 0.1); ctx.quadraticCurveTo(-r * 0.25, -r * 0.25, -r * 0.1, -r * 0.1); ctx.moveTo(r * 0.1, -r * 0.1); ctx.quadraticCurveTo(r * 0.25, -r * 0.25, r * 0.4, -r * 0.1); }, r, o.alpha);
    else if (kind === 'visit') glow(ctx, tint, () => { ctx.rect(-r * 0.75, -r * 0.5, r * 1.5, r * 0.95); ctx.moveTo(-r * 0.3, r * 0.75); ctx.lineTo(r * 0.3, r * 0.75); }, r, o.alpha);
    else if (kind === 'failed') glow(ctx, tint, () => { for (let i = 0; i <= 24; i++) { const x = -r * 0.75 + i / 24 * r * 1.5, y = Math.sin(i / 24 * TAU * 1.5) * r * 0.25 * (1 - i / 30); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } }, r, o.alpha);
    else { glow(ctx, tint, () => { for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.4; ctx.moveTo(Math.cos(a) * r * 0.35 + r * 0.12, Math.sin(a) * r * 0.35); ctx.arc(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35, r * 0.12, 0, TAU); } }, r, o.alpha); }
    ctx.restore();
  }
  root.EyesKeepsakeArt = { paint, glyph, shifted, kinds: () => Object.keys(ART) };
})(typeof window !== 'undefined' ? window : globalThis);
