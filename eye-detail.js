/* HAVEN 2.2.1+ — living-eye detail: eyelids, iris stroma, limbal ring and catchlights.
   Pure drawing helpers. Every value of time, mood and gaze comes from Presence. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  function createEyeDetail() {
    const RES = 320;
    let light = null,
      dark = null,
      tinted = null,
      tintKey = '';
    function rand(seed) {
      let s = seed >>> 0;
      return () => {
        s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0;
        s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0;
        return ((s ^= s >>> 16) >>> 0) / 4294967296;
      };
    }
    // The stroma is baked once: fine radial fibres, a jagged collarette, crypts and a limbal ring.
    function bake() {
      if (light || typeof document === 'undefined') return;
      const make = () => {
        const c = document.createElement('canvas');
        c.width = c.height = RES;
        return c;
      };
      light = make();
      dark = make();
      tinted = make();
      const L = light.getContext('2d'),
        D = dark.getContext('2d');
      if (!L || !D) {
        light = null;
        return;
      }
      const R = RES / 2,
        r = rand(0x4a7e11);
      L.translate(R, R);
      D.translate(R, R);
      L.lineCap = D.lineCap = 'round';
      for (let i = 0; i < 260; i++) {
        const a = (i / 260) * TAU + (r() - 0.5) * 0.02,
          start = R * (0.25 + r() * 0.08),
          end = R * (0.62 + r() * 0.33);
        const wob = (r() - 0.5) * 0.16,
          bend = (r() - 0.5) * 0.1;
        const ctl = a + wob,
          tip = a + bend;
        L.beginPath();
        L.moveTo(Math.cos(a) * start, Math.sin(a) * start);
        L.quadraticCurveTo(
          Math.cos(ctl) * (start + end) * 0.5,
          Math.sin(ctl) * (start + end) * 0.5,
          Math.cos(tip) * end,
          Math.sin(tip) * end
        );
        L.lineWidth = 0.6 + r() * 1.5;
        L.strokeStyle = `rgba(255,255,255,${0.1 + r() * 0.32})`;
        L.stroke();
      }
      // Collarette: the bright crinkled ring where the inner iris meets the outer.
      L.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * TAU,
          rr =
            R *
            (0.43 + 0.035 * Math.sin(a * 9 + 1.3) + 0.02 * Math.sin(a * 23) + (r() - 0.5) * 0.02);
        i
          ? L.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
          : L.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      L.closePath();
      L.lineWidth = R * 0.035;
      L.strokeStyle = 'rgba(255,255,255,.34)';
      L.stroke();
      L.lineWidth = R * 0.012;
      L.strokeStyle = 'rgba(255,255,255,.55)';
      L.stroke();
      // Crypts: soft dark lacunae between fibres, mostly in the outer iris.
      for (let i = 0; i < 46; i++) {
        const a = r() * TAU,
          rr = R * (0.5 + r() * 0.38),
          w = R * (0.025 + r() * 0.05);
        D.save();
        D.translate(Math.cos(a) * rr, Math.sin(a) * rr);
        D.rotate(a);
        D.scale(1.7, 0.6);
        const g = D.createRadialGradient(0, 0, 0, 0, 0, w);
        g.addColorStop(0, 'rgba(0,0,0,.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        D.fillStyle = g;
        D.beginPath();
        D.arc(0, 0, w, 0, TAU);
        D.fill();
        D.restore();
      }
      // Limbal ring: a dark soft boundary that makes the iris read as a lens, not a glow.
      const limb = D.createRadialGradient(0, 0, R * 0.74, 0, 0, R);
      limb.addColorStop(0, 'rgba(0,0,0,0)');
      limb.addColorStop(0.62, 'rgba(0,0,0,.42)');
      limb.addColorStop(0.86, 'rgba(0,0,0,.7)');
      limb.addColorStop(1, 'rgba(0,0,0,0)');
      D.fillStyle = limb;
      D.beginPath();
      D.arc(0, 0, R, 0, TAU);
      D.fill();
      // Inner ring of contraction furrows.
      for (let k = 0; k < 3; k++) {
        D.beginPath();
        D.arc(0, 0, R * (0.68 + k * 0.075), 0, TAU);
        D.lineWidth = R * 0.008;
        D.strokeStyle = 'rgba(0,0,0,.22)';
        D.stroke();
      }
    }
    function tintFor(rgb) {
      bake();
      if (!light) return null;
      const key = rgb.map((n) => Math.round(n / 6)).join(',');
      if (key === tintKey) return tinted;
      tintKey = key;
      const T = tinted.getContext('2d');
      T.globalCompositeOperation = 'copy';
      T.drawImage(light, 0, 0);
      T.globalCompositeOperation = 'source-in';
      T.fillStyle = `rgb(${rgb.map((n) => clamp(Math.round(n * 1.25 + 30), 0, 255)).join(',')})`;
      T.fillRect(0, 0, RES, RES);
      return tinted;
    }
    // Iris stroma, drawn into the clipped eye at the iris position. Torsion follows head tilt.
    function paintIris(ctx, { gx, gy, radius, rgb, t, tilt, pupil, alpha, motion }) {
      const fibres = tintFor(rgb);
      if (!fibres || alpha <= 0.01) return;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate((motion ? t * 0.000018 : 0) - tilt * 0.6);
      const r = radius * 1.02;
      ctx.globalAlpha = alpha * 0.62;
      ctx.drawImage(dark, -r, -r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'screen';
      // Pupil dilation pulls fibres outward: draw them slightly scaled with the pupil.
      const s = r * (1 + (pupil - 1) * 0.12);
      ctx.globalAlpha = alpha * 0.75;
      ctx.drawImage(fibres, -s, -s, s * 2, s * 2);
      ctx.restore();
    }
    // Two catchlights sit fixed to the eye's surface, so the iris moves beneath them.
    function paintCatchlight(ctx, { size, light, alpha }) {
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.translate(-size * 0.34, -size * 0.4);
      ctx.rotate(-0.6);
      ctx.scale(1, 0.55);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.16);
      g.addColorStop(0, `rgba(245,255,255,${0.62 * alpha * light})`);
      g.addColorStop(0.35, `rgba(220,250,255,${0.22 * alpha * light})`);
      g.addColorStop(1, 'rgba(200,240,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.16, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // Lid geometry: parabolic edges that meet a little below centre when fully closed.
    function lidCurves(rx, ry, lids) {
      const meet = ry * 0.5,
        span = rx * 1.18;
      const upperY = mix(-ry * 1.1, meet, lids.upper),
        lowerY = mix(ry * 1.1, meet, lids.lower);
      const bu = ry * 0.62 * (1 - 0.55 * lids.upper),
        bl = ry * 0.42 * (1 - 0.5 * lids.lower);
      const up = (x) => upperY + bu * (x / span) * (x / span),
        down = (x) => Math.max(up(x), lowerY - bl * (x / span) * (x / span));
      return { span, up, down };
    }
    function clipLids(ctx, rx, ry, lids) {
      if (lids.upper <= 0.001 && lids.lower <= 0.001) return;
      const { span, up, down } = lidCurves(rx, ry, lids),
        N = 26;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const x = -span + (2 * span * i) / N;
        i ? ctx.lineTo(x, up(x)) : ctx.moveTo(x, up(x));
      }
      for (let i = N; i >= 0; i--) {
        const x = -span + (2 * span * i) / N;
        ctx.lineTo(x, down(x));
      }
      ctx.closePath();
      ctx.clip();
    }
    // A soft shadow under the upper lid and a faint luminous rim give the lids real depth.
    function paintLidShade(ctx, rx, ry, lids, tint) {
      if (lids.upper <= 0.02) return;
      const { span, up } = lidCurves(rx, ry, lids),
        y0 = up(0);
      const g = ctx.createLinearGradient(0, y0, 0, y0 + ry * 0.38);
      g.addColorStop(0, 'rgba(1,6,12,.62)');
      g.addColorStop(1, 'rgba(1,6,12,0)');
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(-span, y0 - ry * 0.1, span * 2, ry * 0.6);
      ctx.restore();
    }
    function paintLidRims(ctx, rx, ry, lids, tint, light) {
      const { span, up, down } = lidCurves(rx, ry, lids),
        N = 26;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'screen';
      const stroke = (f, alpha, width) => {
        if (alpha <= 0.01) return;
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const x = -span + (2 * span * i) / N;
          i ? ctx.lineTo(x, f(x)) : ctx.moveTo(x, f(x));
        }
        ctx.lineWidth = width;
        ctx.strokeStyle = tint(1.15, alpha);
        ctx.stroke();
      };
      const ua = clamp((lids.upper - 0.03) / 0.2) * 0.5 * light,
        la = clamp((lids.lower - 0.05) / 0.2) * 0.32 * light;
      ctx.shadowColor = tint(1.2, 0.5);
      ctx.shadowBlur = rx * 0.08;
      stroke(up, ua, Math.max(1.1, rx * 0.022));
      if (lids.lower < 0.98) stroke(down, la, Math.max(0.9, rx * 0.016));
      ctx.restore();
    }
    // Light, not detail: a halo on the room, a backlit rim, a marble glow and a hot pupil core.
    function paintHalo(ctx, { rx, ry, tint, amount }) {
      if (amount <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, rx * 0.85, 0, 0, rx * 2.4);
      g.addColorStop(0, tint(0.9, 0.11 * amount));
      g.addColorStop(0.35, tint(0.8, 0.045 * amount));
      g.addColorStop(1, tint(0.7, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx * 2.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    function paintRim(ctx, { rx, ry, tint, amount }) {
      if (amount <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      // Centred low, so the rim is brightest across the top edge and fades down the sides.
      ctx.translate(0, ry * 0.1);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, rx * 0.78, 0, 0, rx * 1.06);
      g.addColorStop(0, tint(1, 0));
      g.addColorStop(0.72, tint(1.15, 0.07 * amount));
      g.addColorStop(0.93, tint(1.35, 0.26 * amount));
      g.addColorStop(1, tint(1.4, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-rx * 1.2, -rx * 1.2, rx * 2.4, rx * 2.4);
      ctx.restore();
    }
    function paintCaustic(ctx, { rx, ry, gx, gy, tint, amount }) {
      if (amount <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.translate(-gx * 0.35, ry * 0.66 - gy * 0.25);
      ctx.scale(1, 0.34);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.72);
      g.addColorStop(0, tint(1.15, 0.2 * amount));
      g.addColorStop(0.5, tint(1, 0.08 * amount));
      g.addColorStop(1, tint(0.9, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx * 0.72, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    function paintPupilCore(ctx, { gx, gy, radius, light, alpha }) {
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const bloom = ctx.createRadialGradient(gx, gy, radius * 0.6, gx, gy, radius * 2.1);
      bloom.addColorStop(0, `rgba(200,250,250,${0.12 * alpha * light})`);
      bloom.addColorStop(1, 'rgba(200,250,250,0)');
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(gx, gy, radius * 2.1, 0, TAU);
      ctx.fill();
      const core = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius * 0.32);
      core.addColorStop(0, `rgba(255,255,255,${0.95 * alpha * light})`);
      core.addColorStop(0.55, `rgba(240,255,255,${0.5 * alpha * light})`);
      core.addColorStop(1, 'rgba(230,255,255,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(gx, gy, radius * 0.32, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    return {
      paintHalo,
      paintRim,
      paintCaustic,
      paintPupilCore,
      paintIris,
      paintCatchlight,
      clipLids,
      paintLidShade,
      paintLidRims
    };
  }
  root.createEyeDetail = createEyeDetail;
  if (typeof module !== 'undefined') module.exports = { createEyeDetail };
})(typeof window === 'undefined' ? globalThis : window);
