/* EYES: the one eye renderer (3.2).
   This is the home screen's eye, moved out of launcher.js so every surface draws the same creature:
   the home screen, the birth, the Eye.D. card, the Eye Contact sheet and a friend's eye peeking in.

   paintEye(ctx, P) draws one eye with its centre at (P.cx, P.cy). Everything it needs comes in P:
     dna            which eye (defaults to this phone's)
     size, rx, ry   eye radius and body ellipse (rx/ry default from size)
     pose           { tilt, sx, sy, glow, focus }      gaze { x, y }  in -1..1
     lids           { upper, lower } 0 open .. 1 shut  pupilScale, light, breathing, sleepDim, energy
     color(mult, alpha, alternate)  the eye's light; defaults to its own DNA colours
     material       skin strengths { halo, caustic, rim, catch }; own = DNA colours (Your Eye skin)
     music, t (ms), motion, lowPower, irisLightK, irisScaleK, haloBoost
     reveal         { body, iris, pupil, pattern, glass, rare } 0..1 while it is being born (omit = whole)
     sweep          0..1 a band of first light across the glass (omit = none)
     hooks          launcher extras painted in the right layer: paintBody, paintSkinIris, paintMaterial,
                    paintMusic, paintMusicPupil
   Returns { gx, gy, irisRadius, irisOpacity, pupilR, light }. */
'use strict';
(function (root) {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const ORIGINAL = { halo: 1, caustic: 1, rim: 1, catch: 1 };
  let detail = null;
  const eyeDetail = () => detail || (detail = root.createEyeDetail ? root.createEyeDetail() : null);

  // The eye's own light: the home screen's resting teal, mapped into its DNA colours.
  function ownColor(dna) {
    const base = root.HavenDNA ? root.HavenDNA.mapColor(111, 193, 202, dna) : [111, 193, 202];
    return (mult, alpha) => 'rgba(' + base.map((x) => clamp(Math.round(x * mult), 0, 255)).join(',') + ',' + clamp(alpha) + ')';
  }

  // The same halo as eye-detail's, gathered in so it fades out inside a small canvas (no square edge).
  function fittedHalo(ctx, rx, ry, tint, amount, reach) {
    if (amount <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, rx * 0.85, 0, 0, rx * reach);
    g.addColorStop(0, tint(0.9, 0.11 * amount)); g.addColorStop(0.35, tint(0.8, 0.045 * amount)); g.addColorStop(1, tint(0.7, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx * reach, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function paintEye(ctx, P) {
    const D = root.HavenDNA, dna = P.dna || (D && D.dna()), H = P.hooks || {};
    const t = P.t || 0, m = P.music || 0, motion = P.motion !== false, lowPower = !!P.lowPower;
    const R = P.reveal || null, rv = (k) => (R ? ease(R[k] == null ? 1 : R[k]) : 1);
    const rB = rv('body'), rI = rv('iris'), rU = rv('pupil'), rP = rv('pattern'), rG = rv('glass'), rR = rv('rare');
    if (rB <= 0.001) return null;
    const p = Object.assign({ tilt: 0, sx: 1, sy: 1, glow: 1, focus: 1 }, P.pose || {});
    const gaze = P.gaze || { x: 0, y: 0 }, breathing = P.breathing || 0;
    const pop = R ? Math.sin(clamp(R.body == null ? 1 : R.body) * Math.PI) * 0.08 : 0;    // a little swell as it forms
    const size = P.size * mix(0.72, 1, rB) * (1 + pop);
    const rx = (P.rx || size) * (P.rx ? mix(0.72, 1, rB) * (1 + pop) : 1), ry = (P.ry || size * 1.055) * (P.ry ? mix(0.72, 1, rB) * (1 + pop) : 1);
    const color = P.color || ownColor(dna), tint = (i, a) => color(i, a), own = P.own !== false;
    const material = P.material || ORIGINAL, E = eyeDetail();
    const look = D ? D.looks(dna) : { iris: 1, pupil: 1 };
    ctx.save();
    ctx.translate(P.cx, P.cy);
    ctx.rotate(p.tilt);
    ctx.scale(p.sx, p.sy);
    if (rB < 1) ctx.globalAlpha = Math.min(1, rB * 1.4);
    const gx = gaze.x * size * 0.24 * (1 - 0.6 * m), gy = gaze.y * size * 0.23 * (1 - 0.6 * m);
    const light0 = P.light == null ? 1 : P.light;
    const haloAmount = material.halo * clamp(light0 * (1 + breathing * 0.12) * p.glow) * (1 + (P.haloBoost || 0)) * rB;
    if (P.haloReach) fittedHalo(ctx, rx, ry, tint, haloAmount, P.haloReach);
    else if (E) E.paintHalo(ctx, { rx, ry, tint, amount: haloAmount });
    if (D && rR > 0) { ctx.save(); ctx.globalAlpha *= rR; D.paintHalo(ctx, { rx, ry, t, own, tint, dna }); ctx.restore(); }
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.clip();
    const lids = P.lids || { upper: 0, lower: 0 };
    ctx.save();
    if (E) E.clipLids(ctx, rx, ry, lids);
    const sleepDim = P.sleepDim || 0;
    const light = clamp(light0 * (1 + breathing * (0.018 + 0.05 * sleepDim)) * p.glow * (1 - 0.35 * sleepDim));
    const irisLight = light * (P.irisLightK == null ? 1 : P.irisLightK);
    const gradient = ctx.createRadialGradient(gx, gy - size * 0.07, size * 0.04, 0, 0, rx * 1.12);
    gradient.addColorStop(0, color(0.57, light)); gradient.addColorStop(0.42, color(0.29, light)); gradient.addColorStop(1, color(0.065, 0.95));
    ctx.fillStyle = gradient; ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
    if (H.paintBody) H.paintBody(ctx, { gx, gy, rx, ry, size, t });
    // the iris (while it forms it grows out from the pupil)
    const irisOpacity = mix(1, 0.78, m) * Math.min(1, rI * 1.6);
    const irisRadius = size * 0.62 * look.iris * mix(1, 1.28, m) * p.focus * (P.irisScaleK == null ? 1 : P.irisScaleK) * mix(0.25, 1, rI);
    const pupilScale = P.pupilScale == null ? look.pupil : P.pupilScale;
    const pupilR = size * 0.17 * pupilScale * mix(0.15, 1, rU);
    if (rI > 0.001) {
      ctx.globalAlpha = irisOpacity * (rB < 1 ? Math.min(1, rB * 1.4) : 1);
      const ig = ctx.createRadialGradient(gx, gy, 0, gx, gy, irisRadius);
      ig.addColorStop(0, color(0.94, irisLight)); ig.addColorStop(0.25, color(0.77, irisLight)); ig.addColorStop(0.57, color(0.44, 0.8)); ig.addColorStop(1, color(0.32, 0));
      ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(gx, gy, irisRadius, 0, TAU); ctx.fill();
      ctx.globalAlpha = rB < 1 ? Math.min(1, rB * 1.4) : 1;
      if (H.paintSkinIris) H.paintSkinIris(ctx, { gx, gy, irisRadius, size, t });
      // its DNA pattern draws outward from the pupil as it forms
      if (D && rP > 0.001) {
        ctx.save();
        if (rP < 1) { ctx.beginPath(); ctx.arc(gx, gy, pupilR * 1.15 + (irisRadius - pupilR * 1.15) * rP, 0, TAU); ctx.clip(); }
        D.paintIris(ctx, { dna, gx, gy, irisRadius, size, t, pupilR: size * 0.17 * pupilScale, alpha: irisOpacity * (1 - m), own, tint, motion, lowPower });
        D.paintDetail(ctx, { dna, gx, gy, irisR: irisRadius, pupilR: size * 0.17 * pupilScale, size, t, alpha: irisOpacity * (1 - m), own, tint, motion });
        ctx.restore();
      }
      if (H.paintMaterial) H.paintMaterial(ctx, { gx, gy, irisRadius, size, t });
      if (H.paintMusic && m > 0.001) H.paintMusic(ctx, { gx, gy, size, t });
    }
    // the pupil: a luminous core in its own shape (spreading like ink as it forms)
    if (rU > 0.001) {
      if (rU < 1) {
        const ink = ctx.createRadialGradient(gx, gy, 0, gx, gy, pupilR * 2.4);
        ink.addColorStop(0, color(0.9, 0.5 * (1 - rU))); ink.addColorStop(1, color(0.6, 0));
        ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(gx, gy, pupilR * 2.4, 0, TAU); ctx.fill();
      }
      const pg = ctx.createRadialGradient(gx, gy, 0, gx, gy, pupilR);
      pg.addColorStop(0, `rgba(235,255,252,${light})`); pg.addColorStop(0.3, `rgba(216,251,246,${light * 0.98})`);
      pg.addColorStop(0.58, color(0.95, light * 0.85)); pg.addColorStop(1, color(0.8, 0));
      ctx.save();
      ctx.globalAlpha *= 1 - m;
      ctx.fillStyle = pg; ctx.beginPath();
      if (!(D && D.pupilPath(ctx, gx, gy, pupilR, t, dna))) ctx.arc(gx, gy, pupilR, 0, TAU);
      ctx.fill(D ? D.fillRule(dna) : 'nonzero');
      ctx.restore();
      if (E) E.paintPupilCore(ctx, { gx, gy, radius: pupilR, light, alpha: (1 - m) * rU });
    }
    if (H.paintMusicPupil && m > 0.001) H.paintMusicPupil(ctx, { gx, gy, size, light, breathing });
    if ((P.energy || 0) > 0.01) {
      const energy = (breathing + 1) * 0.5, feed = ctx.createLinearGradient(0, ry, 0, -ry);
      feed.addColorStop(0, color(0.65, 0.03 + energy * 0.06 * P.energy)); feed.addColorStop(1, color(0.7, 0));
      ctx.fillStyle = feed; ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
    }
    // the glass: caustics, rim, rare aurora, an elder's crown, catchlights
    if (E) E.paintCaustic(ctx, { rx, ry, gx, gy, tint, amount: light * material.caustic * rG });
    if (E) E.paintRim(ctx, { rx, ry, tint, amount: light * material.rim * mix(0.5, 1, rG) });
    if (D && rR > 0) D.paintRim(ctx, { rx, ry, t, amount: light * rR, dna });
    if (D && rR > 0) D.paintCrown(ctx, { rx, ry, t, amount: light * rR, own, tint, motion, dna });
    if (E) E.paintCatchlight(ctx, { size, light, alpha: material.catch * (1 - m) * rG });
    if (P.sweep > 0 && P.sweep < 1) {                         // its first light crossing the glass
      ctx.save(); ctx.rotate(-0.6);
      const x = mix(-rx * 1.5, rx * 1.5, ease(P.sweep)), g = ctx.createLinearGradient(x - rx * 0.32, 0, x + rx * 0.32, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(-rx * 2, -ry * 2, rx * 4, ry * 4); ctx.restore();
    }
    if (E) E.paintLidShade(ctx, rx, ry, lids);
    ctx.restore();
    if (E) E.paintLidRims(ctx, rx, ry, lids, tint, light);
    ctx.restore();
    return { gx, gy, irisRadius, irisOpacity, pupilR, light, size, rx, ry };
  }
  root.HavenRender = { paintEye, ownColor, eyeDetail };
})(typeof window === 'undefined' ? globalThis : window);
