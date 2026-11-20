/* HAVEN LINK effects, redrawn for the glass eye.
   Soft light instead of outlines. Each signal has its own personality, and most of it lives in
   the eye's body (pose, lids, pupil, in presence.js); this file only draws the light around him.
   Your friend lives up and to the left: their signals arrive from there and yours leave that way,
   away from the notification glow at the upper right. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (t) => {
    t = clamp(t);
    return t * t * (3 - 2 * t);
  };
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
  // Direction of the friend, as a unit vector (up-left).
  const FRIEND = (() => {
    const x = -0.55,
      y = -0.83,
      l = Math.hypot(x, y);
    return { x: x / l, y: y / l };
  })();
  function createLinkEffects() {
    // A soft dot of light: the basic brush for everything here.
    function glow(ctx, x, y, r, rgba, a) {
      if (a <= 0.004 || r <= 0.5) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(a));
      g.addColorStop(0.35, rgba(a * 0.45));
      g.addColorStop(1, rgba(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    // A soft ring of light: a wide faint band with a brighter core, no hard edge.
    function band(ctx, x, y, radius, width, rgba, a) {
      if (a <= 0.004 || radius <= 1) return;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.lineWidth = width * 3;
      ctx.strokeStyle = rgba(a * 0.18);
      ctx.stroke();
      ctx.lineWidth = width;
      ctx.strokeStyle = rgba(a * 0.55);
      ctx.stroke();
    }
    // Where an incoming signal starts: just off screen in the friend's direction.
    function origin(cx, cy, size) {
      return { x: cx + FRIEND.x * size * 3.4, y: cy + FRIEND.y * size * 3.4 };
    }
    // A gentle curve from the friend to the eye's upper-left rim.
    function inbound(cx, cy, size, k) {
      const o = origin(cx, cy, size),
        end = { x: cx + FRIEND.x * size * 0.55, y: cy + FRIEND.y * size * 0.55 },
        ctl = { x: (o.x + end.x) / 2 + size * 0.9, y: (o.y + end.y) / 2 - size * 0.2 };
      const q = (a, c, b) => (1 - k) * (1 - k) * a + 2 * (1 - k) * k * c + k * k * b;
      return { x: q(o.x, ctl.x, end.x), y: q(o.y, ctl.y, end.y) };
    }
    function paint(ctx, { t, r, cx, cy, size, hue, friendHue: friendRgb }) {
      const u = clamp((t - r.at) / r.duration);
      const rgba = (a, k = 1) =>
        'rgba(' + hue.map((x) => Math.min(255, Math.round(x * k))).join(',') + ',' + clamp(a) + ')';
      const name = r.name;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.lineCap = 'round';
      if (name === 'link-send') {
        // He gathers, then lets a soft ring lift off and drift toward the friend.
        const k = clamp((u - 0.22) / 0.7),
          drift = easeOut(k);
        if (k > 0) {
          const x = cx + FRIEND.x * size * 1.6 * drift,
            y = cy + FRIEND.y * size * 1.6 * drift;
          band(ctx, x, y, size * (1.02 + 0.55 * drift), size * 0.05, rgba, 0.9 * (1 - k));
        }
        glow(ctx, cx, cy, size * 1.7, rgba, 0.3 * Math.sin(Math.PI * clamp((u - 0.15) / 0.4)));
      } else if (name === 'link-receive') {
        // An orb floats in from the friend's side, with a short soft trail, and sinks into the glass.
        const travel = clamp((u - 0.12) / 0.5);
        if (travel > 0 && travel < 1) {
          for (let i = 4; i >= 0; i--) {
            const p = inbound(cx, cy, size, ease(Math.max(0, travel - i * 0.05)));
            glow(ctx, p.x, p.y, size * (0.2 - i * 0.025), rgba, (i ? 0.25 : 0.9) * (1 - i * 0.18));
          }
        }
        const sink = clamp((u - 0.6) / 0.35);
        if (sink > 0 && sink < 1) {
          // The ripple spreads inside the eye, then the glow swells as he takes it in.
          band(
            ctx,
            cx,
            cy,
            size * (0.25 + 0.7 * easeOut(sink)),
            size * 0.035,
            rgba,
            0.8 * (1 - sink)
          );
          glow(ctx, cx, cy, size * 1.5, rgba, 0.32 * Math.sin(Math.PI * sink));
        }
      } else if (name === 'link-spark-out') {
        // A little hop, and a fan of warm sparks flies out toward the friend, arcing and twinkling.
        const k = clamp((u - 0.18) / 0.72);
        if (k > 0 && k < 1) {
          for (let i = 0; i < 7; i++) {
            const spread = (i - 3) * 0.24,
              ax = FRIEND.x * Math.cos(spread) - FRIEND.y * Math.sin(spread),
              ay = FRIEND.x * Math.sin(spread) + FRIEND.y * Math.cos(spread),
              dist = size * (0.9 + (1.5 + 0.25 * Math.sin(i * 2.1)) * easeOut(k)),
              x = cx + ax * dist,
              y = cy + ay * dist + size * 0.8 * k * k,
              twinkle = 0.6 + 0.4 * Math.sin(t / 45 + i * 1.7);
            glow(ctx, x, y, size * (0.13 - 0.06 * k), rgba, 0.95 * (1 - k) * twinkle);
          }
        }
        glow(
          ctx,
          cx,
          cy - size * 0.8,
          size * 0.9,
          rgba,
          0.4 * Math.sin(Math.PI * clamp((u - 0.12) / 0.3))
        );
      } else if (name === 'link-spark-in') {
        // Warm sparks stream in from the friend's side and pop against the rim.
        for (let i = 0; i < 6; i++) {
          const start = 0.08 + i * 0.07,
            k = clamp((u - start) / 0.36);
          if (k <= 0) continue;
          if (k < 1) {
            const p = inbound(cx + (i - 2.5) * size * 0.12, cy, size, easeOut(k));
            glow(ctx, p.x, p.y, size * 0.11, rgba, 0.9 * (0.6 + 0.4 * Math.sin(t / 40 + i)));
          } else {
            const pop = clamp((u - start - 0.36) / 0.18);
            if (pop < 1) {
              const a = Math.atan2(FRIEND.y, FRIEND.x) + (i - 2.5) * 0.22;
              glow(
                ctx,
                cx + Math.cos(a) * size,
                cy + Math.sin(a) * size,
                size * (0.12 + 0.2 * pop),
                rgba,
                0.8 * (1 - pop)
              );
            }
          }
        }
        glow(ctx, cx, cy, size * 1.6, rgba, 0.28 * Math.sin(Math.PI * clamp((u - 0.45) / 0.5)));
      } else if (name === 'link-calm-out') {
        // A slow exhale: one broad, soft wave rolls out in every direction.
        const k = clamp((u - 0.25) / 0.75);
        if (k > 0)
          band(ctx, cx, cy, size * (1.05 + 1.6 * easeOut(k)), size * 0.12, rgba, 0.55 * (1 - k));
        glow(ctx, cx, cy, size * 2, rgba, 0.18 * Math.sin(Math.PI * u));
      } else if (name === 'link-calm-in') {
        // A cool mist drifts down from the friend's side and settles over him.
        const fall = easeOut(clamp(u / 0.6)),
          o = origin(cx, cy, size),
          x = o.x + (cx - o.x) * fall,
          y = o.y + (cy - size * 0.2 - o.y) * fall;
        glow(
          ctx,
          x,
          y,
          size * (1.1 + 0.9 * fall),
          rgba,
          0.32 * Math.sin(Math.PI * clamp(u / 0.95))
        );
        glow(
          ctx,
          cx,
          cy,
          size * 1.5,
          rgba,
          0.16 * ease(clamp((u - 0.4) / 0.3)) * (1 - ease(clamp((u - 0.75) / 0.25)))
        );
      } else if (name === 'link-resonance') {
        // You both reached out at once: two lights circle the eye in opposite directions,
        // meet at the top in a flash, while he beats like a heart.
        const k = clamp(u / 0.7),
          a = -Math.PI / 2 + Math.PI * (1 - easeOut(k)),
          r1 = size * 1.22,
          // A linked friend's own colour when their HAVEN is known, otherwise a warm light.
          friendHue = (al) => 'rgba(' + (friendRgb || [255, 214, 150]).join(',') + ',' + clamp(al) + ')';
        if (k < 1) {
          for (let trail = 3; trail >= 0; trail--) {
            const b = a + trail * 0.12,
              fade = trail ? 0.2 : 0.9;
            glow(ctx, cx + Math.cos(b) * r1, cy + Math.sin(b) * r1, size * 0.16, rgba, fade);
            const c = -Math.PI - b;
            glow(ctx, cx + Math.cos(c) * r1, cy + Math.sin(c) * r1, size * 0.16, friendHue, fade);
          }
        }
        const flash = clamp((u - 0.66) / 0.3);
        if (flash > 0 && flash < 1) {
          glow(ctx, cx, cy - r1, size * (0.3 + 0.8 * flash), rgba, 0.9 * (1 - flash));
          band(
            ctx,
            cx,
            cy,
            size * (1.05 + 1.2 * easeOut(flash)),
            size * 0.06,
            rgba,
            0.7 * (1 - flash)
          );
        }
      }
      ctx.restore();
    }
    return { paint, FRIEND };
  }
  root.createLinkEffects = createLinkEffects;
  if (typeof module !== 'undefined') module.exports = { createLinkEffects };
})(typeof window === 'undefined' ? globalThis : window);
