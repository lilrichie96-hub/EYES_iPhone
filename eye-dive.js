/* HAVEN — the app dive.
   Tap an app: it opens instantly while HAVEN leans toward the icon and glances at it, as if slipping inside.
   Come back home: he pops out of that same icon and hops back to his place, landing with a little squash.
   Pure timing and pose; Presence keeps owning mood, lids and gaze. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (t) => {
    t = clamp(t);
    return t * t * (3 - 2 * t);
  };
  const LEAN = 280,
    EMERGE = 620,
    RETURN_WINDOW = 30 * 60 * 1000,
    STUCK_AFTER = 1600;
  function createEyeDive() {
    let s = null; // {phase:'lean'|'emerge', at, tx, ty}
    const quad = (a, c, b, e) => (1 - e) * (1 - e) * a + 2 * (1 - e) * e * c + e * e * b;
    function path(from, to, e, size) {
      const cxp = (from.x + to.x) / 2,
        cyp = Math.min(from.y, to.y) - size * 1.15;
      const x = quad(from.x, cxp, to.x, e),
        y = quad(from.y, cyp, to.y, e);
      const dx = 2 * (1 - e) * (cxp - from.x) + 2 * e * (to.x - cxp),
        dy = 2 * (1 - e) * (cyp - from.y) + 2 * e * (to.y - cyp);
      return { x, y, angle: Math.atan2(dy, dx) };
    }
    // The app launches right away; the lean is only what you glimpse before it covers the screen.
    function start(point, t) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      s = { phase: 'lean', at: t, tx: point.x, ty: point.y };
      return true;
    }
    // Returning home: only if he actually dove somewhere recently.
    function emerge(t) {
      if (!s || s.phase === 'emerge') return false;
      if (t - s.at > RETURN_WINDOW) {
        s = null;
        return false;
      }
      s = { ...s, phase: 'emerge', at: t };
      return true;
    }
    function cancel() {
      s = null;
    }
    function active(t) {
      if (!s) return false;
      if (s.phase === 'emerge' && t - s.at > EMERGE + 380) {
        s = null;
        return false;
      }
      return s.phase === 'emerge' || t - s.at < LEAN;
    }
    // If the app never covered HAVEN (it failed to open), he never left: forget the trip.
    function check(t, visible) {
      if (s && s.phase === 'lean' && visible && t - s.at > STUCK_AFTER) s = null;
    }
    // Mutates the frame's pose. Returns {hidden, diving}.
    function apply(pose, t, home, size) {
      if (!s) return { hidden: false, diving: false };
      const icon = clamp(24 / Math.max(1, size), 0.12, 0.5),
        target = { x: s.tx, y: s.ty };
      if (s.phase === 'lean') {
        const u = (t - s.at) / LEAN;
        if (u >= 1) return { hidden: false, diving: false };
        // Lean toward the icon, stretch a touch along the way, and settle back.
        const k = Math.sin(Math.PI * ease(u)),
          dx = target.x - home.x,
          dy = target.y - home.y,
          dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(size * 0.55, dist * 0.16) * k,
          angle = Math.atan2(dy, dx);
        pose.x += (dx / dist) * reach;
        pose.y += (dy / dist) * reach;
        pose.tilt = mix(pose.tilt, angle, 0.35 * k);
        pose.sx *= 1 + 0.12 * k;
        pose.sy *= 1 - 0.08 * k;
        return { hidden: false, diving: true };
      }
      // Emerge: pop out of the icon, hop home, land.
      const u = (t - s.at) / EMERGE;
      if (u >= 1) return { hidden: false, diving: false };
      if (u < 0.18) {
        const k = ease(u / 0.18),
          pop = icon * mix(0.2, 1.35, k);
        pose.x += target.x - home.x;
        pose.y += target.y - home.y;
        pose.sx *= pop;
        pose.sy *= pop;
      } else if (u < 0.85) {
        const g = (u - 0.18) / 0.67,
          e = 1 - Math.pow(1 - g, 2.2),
          p = path(target, home, e, size),
          stretch = 0.34 * Math.sin(Math.PI * g);
        pose.x += p.x - home.x;
        pose.y += p.y - home.y;
        pose.tilt = mix(pose.tilt, p.angle, clamp(stretch * 3));
        const scale = mix(icon * 1.35, 1.04, ease(g));
        pose.sx *= scale * (1 + stretch);
        pose.sy *= scale * (1 - stretch * 0.5);
      } else {
        const k = (u - 0.85) / 0.15,
          squash = Math.sin(Math.PI * k) * 0.17;
        pose.sy *= 1 - squash;
        pose.sx *= 1 + squash * 0.7;
        pose.y += size * 0.06 * squash;
      }
      return { hidden: false, diving: true };
    }
    // Glow trail in flight, splash on landing, and a smaller splash when he pops back out.
    function paint(ctx, t, home, size, tint) {
      if (!s) return;
      const icon = clamp(24 / Math.max(1, size), 0.12, 0.5),
        target = { x: s.tx, y: s.ty };
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const glow = (x, y, r, a) => {
        if (a <= 0.005 || r <= 0.5) return;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, tint(1.25, a));
        g.addColorStop(1, tint(1, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      };
      const splash = (age, strength) => {
        if (age < 0 || age > 1) return;
        const e = 1 - Math.pow(1 - age, 2.4);
        ctx.beginPath();
        ctx.arc(target.x, target.y, size * icon * (1 + 2.2 * e * strength), 0, TAU);
        ctx.lineWidth = Math.max(0.8, 3 * (1 - age));
        ctx.strokeStyle = tint(1.3, 0.55 * (1 - age));
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = -Math.PI / 2 + (i - 3.5) * 0.34,
            d = size * (0.35 + 0.55 * e) * strength * (0.8 + 0.25 * Math.sin(i * 2.3));
          const x = target.x + Math.cos(a) * d,
            y = target.y + Math.sin(a) * d + size * 0.9 * age * age;
          glow(x, y, size * 0.06 * (1 - age * 0.6), 0.75 * (1 - age));
        }
        glow(target.x, target.y, size * icon * 2.4, 0.35 * (1 - age));
      };
      if (s.phase === 'emerge') {
        const u = (t - s.at) / EMERGE;
        splash((t - s.at) / 420, 0.55);
        if (u > 0.18 && u < 0.85) {
          const g = (u - 0.18) / 0.67;
          for (let k = 1; k <= 4; k++) {
            const q = g - k * 0.05;
            if (q <= 0) break;
            const p = path(target, home, 1 - Math.pow(1 - q, 2.2), size);
            glow(p.x, p.y, size * mix(icon * 1.35, 1, ease(q)) * 0.55, 0.16 * (1 - k / 5));
          }
        }
      }
      ctx.restore();
    }
    return {
      start,
      emerge,
      cancel,
      active,
      check,
      apply,
      paint,
      get phase() {
        return s?.phase || null;
      }
    };
  }
  root.createEyeDive = createEyeDive;
  if (typeof module !== 'undefined') module.exports = { createEyeDive };
})(typeof window === 'undefined' ? globalThis : window);
