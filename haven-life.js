/* HAVEN life: quirks and the little things that make each HAVEN its own.
   Quirks are silent, visual habits picked from its seed (one at birth, one more at each stage).
   They play now and then while HAVEN is resting on the home screen, and two of them play when you come back.
   This file only nudges the pose, gaze, lids and pupil of the frame launcher.js is about to draw. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const bump = (u, c, w) => Math.exp(-Math.pow((u - c) / w, 2));
  const env = (u) => Math.sin(Math.PI * clamp(u));

  // Each quirk: duration (ms) and a shape over u = 0..1 returning offsets for that frame.
  const QUIRKS = {
    hiccup: { dur: 1200, f: (u) => { const k = bump(u, 0.15, 0.05) + bump(u, 0.45, 0.05) + bump(u, 0.75, 0.05);
      return { y: -5 * k, sy: 1 - 0.06 * k, sx: 1 + 0.03 * k, upper: 0.08 * k }; } },
    sneeze: { dur: 1600, f: (u) => { const build = u < 0.55 ? ease(u / 0.55) : 0, burst = u >= 0.55 ? Math.exp(-(u - 0.55) / 0.08) : 0, shut = u > 0.55 && u < 0.68 ? 1 : 0;
      return { upper: 0.5 * build + 0.95 * shut, lower: 0.25 * build + 0.9 * shut, sy: 1 + 0.07 * build - 0.1 * burst, sx: 1 - 0.03 * build + 0.1 * burst,
        y: 7 * burst - 2 * build, tilt: -0.05 * build + 0.08 * burst, pupil: 1 - 0.25 * build }; } },
    doubletake: { dur: 1300, greet: true, f: (u) => {
      const away = u < 0.25 ? ease(u / 0.25) : u < 0.42 ? 1 : u < 0.5 ? 1 - ease((u - 0.42) / 0.08) : 0, snap = bump(u, 0.52, 0.08);
      return { gx: 0.75 * away, upper: -0.1 * snap, pupil: 1 - 0.2 * snap + (u > 0.5 ? 0.25 * Math.exp(-(u - 0.5) / 0.2) : 0), sy: 1 + 0.05 * snap, y: -3 * snap }; } },
    wiggle: { dur: 1400, greet: true, f: (u) => { const e = env(u);
      return { tilt: 0.12 * Math.sin(u * TAU * 3) * e, y: -2 * e, glow: 1 + 0.1 * e, lower: 0.15 * e, upper: 0.08 * e }; } },
    doze: { dur: 2600, f: (u) => { const c = u < 0.55 ? ease(u / 0.55) : u < 0.75 ? 1 : u < 0.8 ? 1 - ease((u - 0.75) / 0.05) : 0, pop = bump(u, 0.81, 0.04);
      return { upper: c, lower: 0.85 * c, y: u < 0.75 ? 4 * c : 0, sy: 1 + 0.05 * pop, pupil: 1 - 0.2 * pop }; } },
    shiver: { dur: 900, f: (u) => { const e = env(u); return { x: 2.2 * Math.sin(u * TAU * 14) * e, sx: 1 - 0.02 * e }; } },
    yawn: { dur: 2400, f: (u) => { const s = env(u / 0.9);
      return { sy: 1 + 0.1 * s, sx: 1 - 0.05 * s, upper: 0.45 * s, lower: 0.25 * s, pupil: 1 - 0.3 * s, y: -3 * s }; } },
    hop: { dur: 900, f: (u) => {
      if (u < 0.15) { const k = ease(u / 0.15); return { sy: 1 - 0.1 * k, sx: 1 + 0.06 * k, y: 2 * k }; }
      if (u < 0.7) { const k = (u - 0.15) / 0.55; return { y: -14 * Math.sin(Math.PI * k), sy: 1 + 0.05 * Math.sin(Math.PI * k), sx: 1 - 0.03 * Math.sin(Math.PI * k) }; }
      const k = env((u - 0.7) / 0.3); return { sy: 1 - 0.08 * k, sx: 1 + 0.05 * k, y: 2 * k }; } },
    eyeroll: { dur: 1500, f: (u) => { const th = Math.PI + Math.PI * ease((u - 0.1) / 0.75), w = env(u);
      return { gx: 0.75 * Math.cos(th) * w, gy: 0.6 * Math.sin(th) * w, upper: 0.15 * w }; } },
    flutter: { dur: 1000, f: (u) => { const k = bump(u, 0.25, 0.07) + bump(u, 0.55, 0.07); return { pupil: 1 + 0.35 * k, glow: 1 + 0.15 * k }; } },
    sway: { dur: 3200, f: (u) => { const e = env(u), s = Math.sin(u * TAU * 2); return { tilt: 0.07 * s * e, x: 3 * s * e }; } },
    peek: { dur: 2600, f: (u) => { const e = u < 0.2 ? ease(u / 0.2) : u < 0.8 ? 1 : 1 - ease((u - 0.8) / 0.2);
      return { upper: 0.5 * e, lower: 0.2 * e, gx: 0.55 * e * Math.cos(u * TAU) }; } },
    squint: { dur: 2200, f: (u) => { const e = u < 0.2 ? ease(u / 0.2) : u < 0.8 ? 1 : 1 - ease((u - 0.8) / 0.2);
      return { upper: 0.38 * e, lower: 0.3 * e, pupil: 1 - 0.25 * e, sy: 1 - 0.03 * e, tilt: 0.04 * e }; } },
    boing: { dur: 1100, f: (u) => { const d = Math.exp(-4 * u) * Math.sin(u * TAU * 3);
      return { sy: 1 + 0.14 * d, sx: 1 - 0.07 * d, y: -4 * d }; } }
  };

  let current = null, next = 0, greetWanted = false, forced = null;
  const unlocked = () => {
    const g = root.HavenDNA && root.HavenDNA.growth();
    return g ? g.quirkIds.filter((id) => QUIRKS[id]) : [];
  };
  addEventListener('haven:greet', () => { greetWanted = true; });

  function start(id, t, delay = 0) { current = { id, at: t + delay, dur: QUIRKS[id].dur }; }

  // Called by launcher.js on every frame, before the eye is drawn. ok = HAVEN is resting and free to act.
  function apply(model, t, ok) {
    if (!next) next = t + 20000 + Math.random() * 25000;
    const mine = unlocked();
    if (forced && QUIRKS[forced]) { start(forced, t); forced = null; }
    if (!current && ok && mine.length) {
      if (greetWanted) {
        greetWanted = false;
        const g = mine.filter((id) => QUIRKS[id].greet);
        if (g.length) start(g[Math.floor(Math.random() * g.length)], t, 900);
      } else if (t >= next) {
        const idle = mine.filter((id) => !QUIRKS[id].greet);
        if (idle.length) start(idle[Math.floor(Math.random() * idle.length)], t);
        next = t + 35000 + Math.random() * 45000;
      }
    } else if (greetWanted && !mine.length) greetWanted = false;
    if (!current) return false;
    const u = (t - current.at) / current.dur;
    if (u < 0) return true;
    if (u > 1) { current = null; return false; }
    if (!ok && u < 0.05) { current = null; return false; }     // something else took over: skip it
    const o = QUIRKS[current.id].f(u), p = model.pose;
    if (p) {
      p.x += o.x || 0; p.y += o.y || 0; p.tilt += o.tilt || 0;
      p.sx *= o.sx ?? 1; p.sy *= o.sy ?? 1; p.glow *= o.glow ?? 1;
    }
    if (model.gaze) { model.gaze.x = clamp(model.gaze.x + (o.gx || 0), -1, 1); model.gaze.y = clamp(model.gaze.y + (o.gy || 0), -1, 1); }
    model.eye = model.eye || { upper: 0, lower: 0, pupil: 1 };
    model.eye.upper = clamp((model.eye.upper || 0) + (o.upper || 0));
    model.eye.lower = clamp((model.eye.lower || 0) + (o.lower || 0));
    model.eye.pupil = (model.eye.pupil || 1) * (o.pupil ?? 1);
    model.quirk = current.id;
    return true;
  }
  const busy = (t) => !!current && t >= current.at - 50;

  // Which minutes of the day HAVEN is looked at (for the Nocturnal branch).
  setInterval(() => { if (document.visibilityState === 'visible' && root.HavenDNA) root.HavenDNA.note('minute'); }, 60000);

  root.HavenLife = { apply, busy, play: (id) => { forced = id; }, list: () => Object.keys(QUIRKS) };
})(typeof window === 'undefined' ? globalThis : window);
