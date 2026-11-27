/* EYES 4.8.0 · The Living Eye.
   The Eye's own attention, moods and little habits, while nobody is asking anything of it.

   - Emotions: ten temporary states (content, curious, playful, sleepy, excited, mischievous, startled,
     thoughtful, shy, bored) grow out of the existing temperament (personality.js mood + Eye DNA dials), the
     time of day, the phone's own signals and what just happened. They ease in and out over seconds and show
     only as small shifts in gaze, pupil, lids, light, breathing, posture, body shape and pace. Each Eye's DNA
     decides how easily it feels each one and how strongly it shows it.
   - A behavioural director (not a timer): every second it weighs temperament, emotion, recent interactions,
     the environment, time since the last behaviour, what it already did, the space it has on screen and the
     current mode. Weighted choice, cooldowns, recent-history suppression, contextual eligibility, and quiet
     spells when the Eye is happy doing nothing at all.
   - Every behaviour is one sequence with five phases (motivation, anticipation, action, reaction, recovery)
     played on the real body: it claims presence.js's single reaction channel at the lowest priority, so any
     real event (a touch, a launch, a notification, music, an alert, an ability) takes the body back at once.
     The Eye then lets go in about 0.2 s: particles fade, offsets return to zero, nothing is queued to replay.
   - Rare sequences are not listed anywhere. Their last showing is remembered (eyes.living.v1, per Eye) so
     they stay rare across days.
   - It runs only inside the launcher's existing frame loop (no timers, listeners or canvases of its own
     besides one passive pointer listener and the greet event), so it costs nothing while EYES is hidden,
     follows Motion Off / Gentle Motion and the battery-saving frame rates, and makes no network calls.
   Shared, unchanged, by Android and iPhone.
   5.0: emotional continuity (EyesFeel.report): what happens in Arcade, Play, Hangouts, duels, Pocket and Vision
   lingers as a temporary feeling and one short afterglow back on the home screen (see "emotional continuity").
   5.0: occasional weather body language from the cached forecast (no new requests; see "weather"). */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
  const mix = (a, b, t) => a + (b - a) * t;
  const R = (u, a, b) => ease((u - a) / Math.max(1e-4, b - a));             // rise from a to b
  const W = (u, a, b, c, d) => R(u, a, b) * (1 - R(u, c, d));              // rise a..b, fall c..d
  const B = (u, c, w) => Math.exp(-Math.pow((u - c) / w, 2));              // a bump at c
  const KEY = 'eyes.living.v1';
  // [[u, x, y], ...]: fixations joined by eased moves (how eyes really look: settle, jump, settle)
  function G(u, keys) {
    if (u <= keys[0][0]) return { x: keys[0][1], y: keys[0][2] };
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (u <= b[0]) { const k = ease((u - a[0]) / Math.max(1e-4, b[0] - a[0])); return { x: mix(a[1], b[1], k), y: mix(a[2], b[2], k) }; }
    }
    const z = keys[keys.length - 1];
    return { x: z[1], y: z[2] };
  }

  // ---------- emotions ----------
  const EMOTIONS = ['content', 'curious', 'playful', 'sleepy', 'excited', 'mischievous', 'startled', 'thoughtful', 'shy', 'bored'];
  // what each feeling does to the body at full strength (lids/pupil/light are fractions, x/y px, tilt rad)
  // gx/gy: where the gaze likes to rest; pace: how long between glances; breath: how deep it breathes
  const EXPR = {
    content:     { up: 0.06, low: 0.06, pupil: 0.02, glow: 0.03, sy: -0.008, sx: 0.006, breath: 0.22, pace: 1.08 },
    curious:     { up: -0.06, pupil: 0.1, sy: 0.016, tilt: 0.028, light: 0.04, glow: 0.03, pace: 0.8 },
    playful:     { up: -0.03, low: 0.05, pupil: 0.08, sy: 0.02, y: -1.5, glow: 0.06, sway: 0.016, pace: 0.85 },
    sleepy:      { up: 0.17, low: 0.06, pupil: -0.07, y: 2, sy: -0.026, sx: 0.012, light: -0.1, glow: -0.05, breath: 0.38, pace: 1.38 },
    excited:     { up: -0.1, pupil: 0.18, glow: 0.12, sy: 0.03, y: -2, light: 0.08, breath: 0.15, pace: 0.7 },
    mischievous: { up: 0.12, low: 0.11, tilt: -0.04, pupil: -0.05, gx: 0.13, glow: 0.03, pace: 0.95 },
    startled:    { up: -0.2, pupil: -0.2, sy: 0.04, sx: -0.02, y: -2, pace: 0.6 },
    thoughtful:  { gx: 0.18, gy: -0.2, up: 0.05, tilt: 0.024, breath: 0.1, pace: 1.4 },
    shy:         { gx: -0.2, gy: 0.22, up: 0.08, low: 0.08, sy: -0.02, sx: -0.015, y: 1.5, light: -0.05, pace: 1.12 },
    bored:       { up: 0.1, gy: 0.08, y: 1, sx: 0.015, sy: -0.015, light: -0.05, pace: 1.25 }
  };
  // how quickly each feeling arrives and leaves (ms): surprise is instant, moods are slow
  const TAU_IN = { startled: 160, excited: 600 }, TAU_OUT = { startled: 1300, excited: 2600 };
  // how much the director's choices lean with each feeling, per kind of behaviour
  const AFFINITY = {
    curious: { curious: 1.8, bored: 1.4, thoughtful: 1.15, sleepy: 0.5, shy: 0.8, excited: 1.1 },
    play: { playful: 2, excited: 1.6, bored: 1.5, content: 1.1, sleepy: 0.45, shy: 0.7, thoughtful: 0.6, mischievous: 1.2 },
    rare: { mischievous: 1.4, bored: 1.3, playful: 1.2, curious: 1.1 }
  };
  // how long it waits before the next idea, per feeling (multiplier)
  const SPACING = { bored: 0.6, excited: 0.7, playful: 0.8, curious: 0.85, content: 1.15, thoughtful: 1.25, sleepy: 1.5, shy: 1.1, mischievous: 0.9, startled: 1 };
  // how long a sequence takes, per feeling: sleepy is slow, excited is quick
  const SPEED = { excited: 0.85, playful: 0.92, sleepy: 1.25, thoughtful: 1.15, bored: 1.05, startled: 0.9 };

  // ---------- small drawing helpers (always in the Eye's own colour) ----------
  function mote(ctx, x, y, r, P, a, hot = 1.5) {
    if (a <= 0.004 || r <= 0.2) return;
    if (P.lowPower) {
      ctx.globalAlpha = clamp(a * 0.8);
      ctx.fillStyle = P.tint(hot, 1);
      ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, P.tint(hot + 0.3, clamp(a)));
    g.addColorStop(0.28, P.tint(hot, clamp(a * 0.55)));
    g.addColorStop(1, P.tint(1, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function ring(ctx, x, y, r, width, P, a) {
    if (a <= 0.004 || r <= 0.5) return;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.lineWidth = Math.max(0.6, width);
    ctx.strokeStyle = P.tint(1.4, clamp(a));
    ctx.stroke();
  }

  function createEyesLiving(host) {
    const core = host.core, now = host.now, rnd = host.random || Math.random;
    const read = host.read || ((k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } });
    const save = host.save || ((k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} });
    const eye = () => host.eyeCentre();
    const DNA = () => (root.HavenDNA && root.HavenDNA.dna ? root.HavenDNA.dna() : null);
    const temper = () => { const d = DNA(); return d && d.T ? d.T : { curiosity: 0.5, shyness: 0.5, energy: 0.5, grump: 0.5, drama: 0.5 }; };
    const seedOf = () => { const d = DNA(); return d && Number.isFinite(d.seed) ? d.seed >>> 0 : 0; };

    // ---- persistent, per Eye: when each rare sequence was last seen (wall clock) ----
    let mem = read(KEY, null);
    const blankMem = (seed) => ({ v: 1, seed, last: {}, seen: {} });
    function memory() {
      const s = seedOf();
      if (!mem || mem.v !== 1 || typeof mem.last !== 'object') mem = blankMem(s);
      if (mem.seed !== s) mem = blankMem(s);   // a newly woken Eye starts with its own history
      return mem;
    }
    const remember = (id) => { const m = memory(); m.last[id] = Date.now(); m.seen[id] = (m.seen[id] || 0) + 1; save(KEY, m); };

    // ---- emotion engine ----
    const E = {
      level: Object.fromEntries(EMOTIONS.map((e) => [e, 0])),
      current: 'content', strength: 0.4, since: 0,
      impulses: {}, lastUpdate: 0, lastFrame: 0, fade: 0,
      scores: {}
    };
    E.level.content = 0.4;
    function impulse(name, v, tau = 30000) {
      if (!EXPR[name]) return;
      const t = now(), cur = E.impulses[name];
      const left = cur ? cur.v * Math.exp(-(t - cur.at) / cur.tau) : 0;
      if (v >= left) E.impulses[name] = { v: clamp(v), at: t, tau };
    }
    function susceptibility(T) {
      return {
        content: 1 - 0.4 * T.grump,
        curious: 0.5 + T.curiosity,
        playful: 0.4 + 0.9 * T.energy + 0.2 * (1 - T.grump),
        sleepy: 1.3 - 0.6 * T.energy,
        excited: 0.5 + 0.6 * T.drama + 0.4 * T.energy,
        mischievous: 0.6 * (1 - T.shyness) + 0.6 * T.grump,
        startled: 0.6 + 0.5 * T.shyness + 0.3 * T.drama,
        thoughtful: 0.5 + 0.5 * (1 - T.energy) + 0.3 * (1 - T.drama),
        shy: 0.3 + 1.1 * T.shyness,
        bored: 0.4 + 0.7 * T.energy
      };
    }
    function emotionTargets(t) {
      const T = temper(), S = susceptibility(T), mood = core.mood || {}, hour = new Date().getHours();
      const quietMin = (t - Math.max(D.lastTouch, D.lastGreet)) / 60000;
      const wet = /rain|drizzle|storm|thunder|snow|sleet/.test(D.weather || ''), sunny = /sun|clear/.test(D.weather || '');
      const sc = {
        content: S.content * (0.3 + 0.35 * (mood.content ?? 0.5) + (core.state.charging ? 0.12 : 0) + (t - D.musicStoppedAt < 300000 ? 0.06 : 0)),
        curious: S.curious * (0.1 + 0.45 * (mood.curiosity ?? 0.5) + (D.unread ? 0.06 : 0)),
        playful: S.playful * (0.05 + 0.36 * (mood.energy ?? 0.6) * (hour >= 12 && hour < 18 ? 1.15 : 1) + (sunny ? 0.05 : 0)),
        sleepy: S.sleepy * Math.max(0, (mood.sleepiness ?? 0.2) - 0.32) * 1.5,
        excited: 0,
        mischievous: S.mischievous * 0.05 * (hour >= 18 && hour < 23 ? 1.4 : 1),
        startled: 0,
        thoughtful: S.thoughtful * (0.07 + (hour >= 19 || hour < 2 ? 0.12 : 0) + (wet ? 0.1 : 0)),
        shy: S.shy * 0.05,
        bored: S.bored * clamp((quietMin - 4) / 16) * 0.45 * (1 - (mood.sleepiness ?? 0.2))
      };
      for (const [name, im] of Object.entries(E.impulses)) {
        const v = im.v * Math.exp(-(t - im.at) / im.tau);
        if (v < 0.02) { delete E.impulses[name]; continue; }
        sc[name] += v * (S[name] || 1);
      }
      return sc;
    }
    function updateEmotion(t) {
      const sc = emotionTargets(t);
      E.scores = sc;
      let best = E.current, bestV = (sc[E.current] || 0) + 0.08;            // a little loyalty to what it feels now
      for (const e of EMOTIONS) if (sc[e] > bestV) { best = e; bestV = sc[e]; }
      if (sc.startled > 0.3 && E.current !== 'startled') { best = 'startled'; bestV = sc.startled + 1; }   // a real fright cuts in at once
      const dwell = t - E.since;
      if (best !== E.current && (dwell > 9000 || bestV > (sc[E.current] || 0) + 0.25)) { E.current = best; E.since = t; }
      E.strength = clamp((sc[E.current] || 0) * 1.4, 0.3, 1);
    }
    function easeEmotion(t) {
      const dt = clamp(t - (E.lastFrame || t), 0, 250);
      E.lastFrame = t;
      for (const e of EMOTIONS) {
        const target = e === E.current ? E.strength : 0, up = target > E.level[e];
        const tau = up ? TAU_IN[e] || 2600 : TAU_OUT[e] || 3200;
        E.level[e] += (target - E.level[e]) * (1 - Math.exp(-dt / tau));
      }
      return dt;
    }
    const emoK = (e) => E.level[e] || 0;

    // ---------- director state ----------
    const D = {
      cur: null, nextAt: 0, quietUntil: 0, history: [], lastTick: 0, lastOtherAt: -1e9,
      lastTouch: 0, lastGreet: 0, lastReaction: null, reunion: null, env: null,
      unread: 0, weather: null, weatherAt: -1e9, musicStoppedAt: -1e9, charging: null, playing: null,
      frames: 0, started: 0, interrupted: 0, finished: 0, cleaned: 0, decisions: 0, nothing: 0, counts: {}, log: []
    };
    let started = false;

    // ---------- context the director looks at ----------
    const vis = (el) => {
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.2) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, right: r.right };
    };
    function context(t) {
      const e = eye(), w = innerWidth, h = innerHeight, T = temper();
      let sat = null;
      try { sat = root.EyesAbility && root.EyesAbility.satellite ? root.EyesAbility.satellite() : null; } catch (err) { sat = null; }
      if (sat && !(Number.isFinite(sat.x) && Number.isFinite(sat.y))) sat = null;
      const icons = [];
      for (const el of document.querySelectorAll('.dock-app, #eyesDock button')) { const r = vis(el); if (r) icons.push(r); }
      icons.sort((a, b) => a.x - b.x);
      const byId = (id) => vis(document.getElementById(id));
      return {
        t, wall: Date.now(), rng: rnd, T, emoK, emo: E.current, mood: core.mood || {}, hour: new Date().getHours(),
        lowPower: host.lowPower ? host.lowPower() : false, gentle: !!core.gentle, w, h, eye: e,
        sat, icons, clock: byId('clock'), battery: byId('battery'), date: byId('date'), chip: byId('weatherChip'),
        glint: byId('irisGlint'), unread: D.unread, weather: D.weather, musicStoppedAt: D.musicStoppedAt,
        compact: h < 620 || w < 340, landscape: w > h * 1.15, side: seedOf() & 1 ? 1 : -1,
        sleepy: (core.mood?.sleepiness ?? 0) > 0.45 || emoK('sleepy') > 0.35, mode: core.mode
      };
    }
    const toGaze = (c, x, y) => ({ x: clamp((x - c.w * 0.5) / (c.w * 0.39), -0.95, 0.95), y: clamp((y - c.h * 0.49) / (c.h * 0.34), -0.9, 0.9) });
    const span = (c) => clamp(1 + 0.3 * c.emoK('curious') - 0.25 * c.emoK('bored') - 0.15 * c.emoK('excited') + 0.15 * (c.T.curiosity - 0.5), 0.75, 1.35);
    const pick = (c, list) => list[Math.floor(c.rng() * list.length) % list.length];
    const sideOf = (c) => (c.rng() < 0.5 ? -1 : 1);

    // ---------- the behaviours ----------
    // build(c) returns { dur, phases, f(u,t) → body offsets, paint?, iris?, blinks?, after?, touch?, variant? }.
    // Offsets: gx, gy, gw (gaze target and how much it owns the gaze), x, y, tilt, sx, sy, glow, focus,
    // up, low (lids), pupil, light, energy. All of them return to zero by u = 1.
    const DEFS = [];
    const def = (d) => { DEFS.push(d); return d; };

    // ======== curiosity ========
    def({
      id: 'satellite', group: 'curious', cd: 5 * 60000, gentle: true,
      when: (c) => !!c.sat,
      weight: (c) => 0.35 + 1.4 * c.T.curiosity,
      build(c) {
        const S = toGaze(c, c.sat.x, c.sat.y), dir = Math.sign(S.x) || -1, dy = Math.sign(S.y) || -1;
        // now and then something else catches its eye halfway through, and it forgets the satellite
        const distract = c.rng() < 0.1 + 0.25 * c.emoK('bored') + 0.15 * c.emoK('excited') + 0.08 * c.T.energy;
        const Dg = { x: clamp(-S.x * 0.85 + (c.rng() - 0.5) * 0.3, -0.9, 0.9), y: clamp(0.3 + c.rng() * 0.35, -0.8, 0.8) };
        const look = distract
          ? [[0, 0, 0], [0.05, S.x * 0.25, S.y * 0.25], [0.11, S.x * 0.25, S.y * 0.25], [0.16, S.x, S.y], [0.34, S.x, S.y], [0.38, S.x + 0.07, S.y - 0.05], [0.44, S.x + 0.07, S.y - 0.05], [0.47, Dg.x, Dg.y], [0.62, Dg.x, Dg.y], [0.67, S.x, S.y], [0.74, S.x, S.y], [0.88, 0, 0], [1, 0, 0]]
          : [[0, 0, 0], [0.05, S.x * 0.25, S.y * 0.25], [0.11, S.x * 0.25, S.y * 0.25], [0.16, S.x, S.y], [0.34, S.x, S.y], [0.38, S.x + 0.07, S.y - 0.05], [0.46, S.x + 0.07, S.y - 0.05], [0.5, S.x - 0.06, S.y + 0.04], [0.58, S.x - 0.06, S.y + 0.04], [0.62, S.x, S.y], [0.8, S.x, S.y], [0.92, 0, 0], [1, 0, 0]];
        return {
          dur: 5600 * span(c), phases: [0.06, 0.2, 0.62, 0.82], variant: distract ? 'distracted' : null,
          blinks: distract ? [[0.46, false], [0.86, false]] : [[0.66, false]],
          after: distract ? [[0.5, 'curious', 0.35, 20000]] : [[0.66, 'curious', 0.4, 30000], [0.7, 'content', 0.2, 20000]],
          f(u) {
            const g = G(u, look), gw = R(u, 0, 0.04) * (1 - R(u, 0.9, 1));
            const back = W(u, 0.08, 0.14, 0.18, 0.24), lean = distract ? W(u, 0.2, 0.32, 0.44, 0.52) : W(u, 0.2, 0.32, 0.6, 0.74);
            const puzzled = distract ? W(u, 0.63, 0.67, 0.74, 0.82) : 0;
            return {
              gx: g.x, gy: g.y, gw,
              x: dir * (5 * lean - 2 * back), y: dy * 3 * lean + 2 * B(u, 0.7, 0.03), tilt: dir * 0.06 * lean + 0.08 * puzzled * -dir,
              sy: -0.025 * back + 0.02 * lean, sx: 0.012 * back,
              up: 0.1 * back - 0.06 * lean + 0.05 * puzzled, pupil: -0.12 * B(u, 0.05, 0.03) + 0.25 * lean, focus: 0.08 * lean,
              glow: distract ? 0 : 0.08 * B(u, 0.72, 0.05)
            };
          }
        };
      }
    });
    def({
      id: 'icons', group: 'curious', cd: 6 * 60000, gentle: true,
      when: (c) => c.icons.length >= 2,
      weight: (c) => 0.3 + 1.2 * c.T.curiosity,
      build(c) {
        const pts = c.icons.map((r) => toGaze(c, r.x, r.y));
        if (c.rng() < 0.5) pts.reverse();
        const k = 1 + Math.floor(c.rng() * (pts.length - 1)), path = pts.slice(0, k + 1), lens = [0];
        for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
        const total = lens[lens.length - 1] || 1, at = (s) => {
          const d = s * total; let i = 1; while (i < path.length - 1 && lens[i] < d) i++;
          const a = path[i - 1], b = path[i], f = clamp((d - lens[i - 1]) / Math.max(1e-4, lens[i] - lens[i - 1]));
          return { x: mix(a.x, b.x, f), y: mix(a.y, b.y, f) };
        };
        const end = path[path.length - 1], dir = Math.sign(end.x) || 1;
        return {
          dur: (3200 + 380 * path.length) * span(c), phases: [0.05, 0.12, 0.52, 0.76],
          blinks: [[0.74, false]], after: [[0.6, 'curious', 0.3, 20000]],
          f(u) {
            let g;
            if (u < 0.12) g = G(u, [[0, 0, 0], [0.04, 0, 0], [0.12, path[0].x, path[0].y]]);
            else if (u < 0.52) g = at(ease((u - 0.12) / 0.4));          // follows the row, icon by icon
            else g = G(u, [[0.52, end.x, end.y], [0.76, end.x, end.y], [0.92, 0, 0], [1, 0, 0]]);
            const hold = W(u, 0.5, 0.56, 0.72, 0.8);
            return {
              gx: g.x, gy: g.y, gw: R(u, 0, 0.05) * (1 - R(u, 0.9, 1)),
              x: dir * 4 * hold, y: 2.5 * hold, tilt: dir * 0.05 * hold, pupil: 0.06 * W(u, 0.12, 0.2, 0.48, 0.52) + 0.22 * hold,
              up: -0.05 * hold, focus: 0.07 * hold
            };
          }
        };
      }
    });
    def({
      id: 'study', group: 'curious', cd: 7 * 60000, gentle: true,
      when: (c) => !!(c.clock || c.battery || c.date || c.chip),
      weight: (c) => 0.25 + 1.0 * c.T.curiosity + 0.3 * (1 - c.T.energy) + 0.2 * c.emoK('thoughtful'),
      build(c) {
        const r = pick(c, [c.clock, c.battery, c.date, c.chip].filter(Boolean));
        const L = toGaze(c, r.left + 4, r.y), Rg = toGaze(c, r.right - 4, r.y), M = toGaze(c, r.x, r.y), dir = Math.sign(M.x) || 1;
        const rev = c.rng() < 0.4, a = rev ? Rg : L, b = rev ? L : Rg;
        // distracted variant: an investigation abandoned halfway for something else
        const distract = c.rng() < 0.08 + 0.2 * c.emoK('bored'), Dg = { x: -dir * 0.7, y: 0.5 };
        const look = distract
          ? [[0, 0, 0], [0.1, M.x, M.y], [0.26, M.x, M.y], [0.32, a.x, a.y], [0.42, mix(a.x, b.x, 0.5), b.y], [0.45, Dg.x, Dg.y], [0.64, Dg.x, Dg.y], [0.68, M.x, M.y], [0.74, M.x, M.y], [0.9, 0, 0], [1, 0, 0]]
          : [[0, 0, 0], [0.1, M.x, M.y], [0.26, M.x, M.y], [0.32, a.x, a.y], [0.6, b.x, b.y], [0.66, M.x, M.y], [0.78, M.x, M.y], [0.92, 0, 0], [1, 0, 0]];
        return {
          dur: 5200 * span(c), phases: [0.04, 0.12, 0.62, 0.8], variant: distract ? 'distracted' : null,
          blinks: [[0.84, false]], after: [[0.66, 'thoughtful', 0.3, 30000]],
          f(u) {
            const g = G(u, look), squint = W(u, 0.12, 0.24, 0.62, 0.74) * (distract && u > 0.45 && u < 0.66 ? 0.3 : 1);
            return {
              gx: g.x, gy: g.y, gw: R(u, 0, 0.05) * (1 - R(u, 0.9, 1)),
              up: 0.12 * squint, low: 0.1 * squint, pupil: -0.08 * squint, tilt: dir * 0.045 * squint,
              x: dir * 2.5 * squint, y: 2.5 * B(u, 0.7, 0.035), sy: -0.012 * squint, focus: 0.05 * squint
            };
          }
        };
      }
    });
    def({
      id: 'periphery', group: 'curious', cd: 9 * 60000, gentle: false,
      weight: (c) => 0.15 + 0.8 * c.T.drama + 0.7 * c.T.shyness,
      build(c) {
        const s = sideOf(c), P = { x: s * 0.95, y: -0.3 + c.rng() * 0.6 };
        return {
          dur: 3800 * span(c), phases: [0.06, 0.09, 0.42, 0.7], blinks: [[0.82, false]],
          after: [[0.1, 'startled', 0.55, 1500], [0.5, 'curious', 0.35, 20000]],
          f(u) {
            const g = G(u, [[0, 0, 0], [0.06, 0, 0], [0.09, P.x, P.y], [0.4, P.x, P.y], [0.5, s * 0.1, 0], [0.58, s * 0.1, 0], [0.61, P.x * 0.9, P.y], [0.68, P.x * 0.9, P.y], [0.82, 0, 0], [1, 0, 0]]);
            const jolt = B(u, 0.1, 0.022), wide = W(u, 0.08, 0.1, 0.38, 0.48), check = W(u, 0.6, 0.62, 0.66, 0.7);
            return {
              gx: g.x, gy: g.y, gw: 1 - R(u, 0.9, 1),
              x: -s * (4 * jolt + 1.5 * wide), sy: 0.05 * jolt, sx: -0.03 * jolt, tilt: -s * 0.03 * wide,
              up: -0.18 * wide - 0.08 * check, pupil: -0.18 * B(u, 0.1, 0.03) + 0.2 * W(u, 0.14, 0.2, 0.38, 0.46), glow: 0.05 * jolt
            };
          }
        };
      }
    });
    def({
      id: 'suspicious', group: 'curious', cd: 10 * 60000, gentle: true,
      weight: (c) => (0.15 + 1.1 * c.T.grump + 0.35 * c.T.shyness) * (1 + c.emoK('mischievous')),
      build(c) {
        const s = sideOf(c), S = { x: s * 0.75, y: 0.55 };
        return {
          dur: 5400 * span(c), phases: [0.1, 0.18, 0.7, 0.8], blinks: [[0.86, false]],
          after: [[0.74, 'content', 0.2, 15000]],
          f(u) {
            const g = G(u, [[0, 0, 0], [0.1, s * 0.25, 0.2], [0.2, s * 0.25, 0.2], [0.26, s * 0.45, 0.35], [0.36, s * 0.45, 0.35], [0.42, s * 0.62, 0.47], [0.5, s * 0.62, 0.47], [0.55, S.x, S.y], [0.7, S.x, S.y], [0.78, S.x * 0.5, S.y * 0.5], [0.92, 0, 0], [1, 0, 0]]);
            const squint = W(u, 0.1, 0.2, 0.68, 0.74), away = W(u, 0.12, 0.22, 0.48, 0.54), lean = W(u, 0.52, 0.6, 0.68, 0.74), relax = B(u, 0.77, 0.04);
            return {
              gx: g.x, gy: g.y, gw: R(u, 0, 0.06) * (1 - R(u, 0.9, 1)),
              up: 0.15 * squint - 0.06 * relax, low: 0.12 * squint, pupil: -0.1 * squint + 0.15 * lean,
              x: s * (-3 * away + 4.5 * lean), sx: -0.03 * away + 0.02 * lean, tilt: -s * 0.04 * away + s * 0.03 * lean,
              y: 3 * relax, glow: 0.1 * relax, focus: 0.06 * lean
            };
          }
        };
      }
    });
    def({
      id: 'glint', group: 'curious', cd: 8 * 60000, gentle: true,
      when: (c) => !!c.glint && c.unread > 0,
      weight: (c) => 0.6 + 0.5 * c.T.curiosity,
      build(c) {
        const g0 = toGaze(c, c.glint.x, c.glint.y), dir = Math.sign(g0.x) || 1;
        return {
          dur: 2400, phases: [0.05, 0.12, 0.55, 0.72], blinks: [[0.62, false]],
          f(u) {
            const g = G(u, [[0, 0, 0], [0.12, g0.x, g0.y], [0.6, g0.x, g0.y], [0.85, 0, 0], [1, 0, 0]]), hold = W(u, 0.12, 0.2, 0.5, 0.62);
            return { gx: g.x, gy: g.y, gw: 1 - R(u, 0.88, 1), pupil: 0.18 * hold, up: -0.06 * hold, tilt: dir * 0.03 * hold, x: dir * 2 * hold };
          }
        };
      }
    });

    // ======== independent play ========
    // Firefly: a speck of its own light that drifts out, gets watched, chased and (usually) caught
    function fireflyBuild(c, outcome) {
      const s = sideOf(c), ph = c.rng() * TAU, A = c.compact || c.landscape ? 1.15 : 1.4;
      const drift = (k) => ({ x: s * A * Math.sin(TAU * 0.8 * k + ph) * 0.9, y: -0.42 - 0.48 * Math.sin(TAU * 1.1 * k + ph * 0.7) });
      const Q = { x: -s * 1.25, y: -0.95 };
      const escape = outcome === 'miss' || outcome === 'escape';
      const pos = (u) => {
        if (u < 0.04) return null;
        if (u < 0.14) { const k = ease((u - 0.04) / 0.1), d = drift(0); return { x: d.x * k, y: d.y * k, a: k, r: mix(0.05, 0.13, k) }; }
        if (u < 0.56) { const d = drift((u - 0.14) / 0.42); return { ...d, a: 1, r: 0.13 }; }
        const d0 = drift(1);
        if (!escape) {
          // caught at the first lunge: pulled into the pupil
          const k = ease((u - 0.56) / 0.07);
          return u < 0.63 ? { x: d0.x * (1 - k), y: d0.y * (1 - k), a: 1 - 0.6 * k, r: 0.13 * (1 - 0.6 * k) } : null;
        }
        if (u < 0.6) { const k = ease((u - 0.56) / 0.04); return { x: mix(d0.x, Q.x, k), y: mix(d0.y, Q.y, k), a: 1, r: 0.13 }; }  // darts away
        if (u < 0.73) { const k = (u - 0.6) / 0.13; return { x: Q.x + 0.25 * s * Math.sin(k * 3) * k, y: Q.y + 0.3 * k, a: 1, r: 0.13 }; }
        const q1 = { x: Q.x + 0.25 * s * Math.sin(3), y: Q.y + 0.3 };
        if (outcome === 'miss') {
          // the second try misses too: it floats up and away, fading
          if (u < 0.77) { const k = ease((u - 0.73) / 0.04); return { x: q1.x - s * 0.5 * k, y: q1.y - 0.4 * k, a: 1, r: 0.13 }; }
          const k = (u - 0.77) / 0.15;
          return k < 1 ? { x: q1.x - s * 0.5 - s * 0.6 * k, y: q1.y - 0.4 - 1.4 * k, a: 1 - k, r: 0.13 * (1 - 0.4 * k) } : null;
        }
        const k = ease((u - 0.73) / 0.07);
        return u < 0.8 ? { x: q1.x * (1 - k), y: q1.y * (1 - k), a: 1 - 0.6 * k, r: 0.13 * (1 - 0.6 * k) } : null;
      };
      const catchAt = escape ? 0.76 : 0.6;
      return {
        dur: (escape ? 7800 : 6400) * (c.gentle ? 1.15 : 1), phases: [0.04, 0.45, 0.6, escape ? 0.82 : 0.66],
        variant: outcome === 'miss' ? 'miss' : null, touch: null,
        blinks: outcome === 'miss' ? [[0.94, true]] : [[escape ? 0.86 : 0.72, true]],
        after: outcome === 'miss'
          ? [[0.84, 'shy', 0.65, 30000]]
          : [[catchAt, 'playful', 0.5, 40000], [catchAt + 0.04, 'content', 0.35, 40000]],
        pos,
        f(u) {
          const p = pos(u), e = eye();
          const track = p ? toGaze(c, e.x + p.x * e.size, e.y + p.y * e.size) : null;
          if (track) { this._gx = track.x; this._gy = track.y; }
          const lastX = this._gx || 0, lastY = this._gy || 0;
          const gw = (u < 0.04 ? 0 : R(u, 0.04, 0.1)) * (1 - R(u, outcome === 'miss' ? 0.94 : 0.88, 1));
          const gx = track ? track.x : mix(lastX, 0, R(u, catchAt + 0.06, 0.9)), gy = track ? track.y : mix(lastY, 0, R(u, catchAt + 0.06, 0.9));
          const n = Math.hypot(lastX, lastY) || 1, vx = lastX / n, vy = lastY / n;
          const crouch1 = W(u, 0.46, 0.54, 0.55, 0.57), lunge1 = B(u, 0.575, 0.022);
          const crouch2 = escape ? W(u, 0.68, 0.72, 0.725, 0.74) : 0, lunge2 = escape ? B(u, 0.755, 0.02) : 0;
          const savor = escape ? (outcome === 'miss' ? 0 : W(u, 0.8, 0.84, 0.9, 0.96)) : W(u, 0.63, 0.68, 0.82, 0.92);
          const gotIt = outcome === 'miss' ? 0 : B(u, catchAt + 0.02, 0.025);
          const shy = outcome === 'miss' ? W(u, 0.84, 0.88, 0.95, 1) : 0;
          const lunge = lunge1 + lunge2, crouch = crouch1 + crouch2;
          return {
            gx: shy ? mix(gx, -vx * 0.3, shy) : gx, gy: shy ? mix(gy, 0.45, shy) : gy, gw: Math.max(gw, shy),
            x: vx * 7 * lunge + (escape ? -vx * 3 * B(u, 0.6, 0.02) : 0), y: vy * 5 * lunge + 2.5 * crouch + 2 * shy,
            sy: -0.05 * crouch + 0.06 * lunge - 0.02 * savor - 0.02 * shy, sx: 0.03 * crouch - 0.025 * lunge + 0.02 * savor - 0.015 * shy,
            tilt: vx * 0.04 * lunge,
            up: -0.08 * W(u, 0.14, 0.2, 0.5, 0.56) + 0.1 * savor + 0.14 * shy, low: 0.18 * savor + 0.08 * shy,
            pupil: 0.18 * W(u, 0.1, 0.2, 0.55, 0.6) + 0.3 * gotIt - 0.06 * shy, glow: 0.18 * gotIt + 0.04 * savor, energy: 0.5 * gotIt,
            light: -0.05 * shy
          };
        },
        paint(ctx, u, t, P) {
          const p = pos(u);
          if (!p) return;
          const x = clamp(P.hx + p.x * P.size, 10, P.w - 10), y = clamp(P.hy + p.y * P.size, 10, P.h - 10);
          const flick = 0.7 + 0.3 * Math.sin(t / 190 + 1.3) * Math.sin(t / 77);
          mote(ctx, x, y, P.size * p.r * 2.6, P, 0.55 * p.a * flick * P.k, 1.3);
          mote(ctx, x, y, P.size * p.r * 0.7, P, 0.95 * p.a * P.k, 1.9);
        }
      };
    }
    def({
      id: 'firefly', group: 'play', cd: 8 * 60000, gentle: true,
      weight: (c) => 0.25 + 1.4 * c.T.energy + 0.3 * c.T.curiosity,
      build: (c) => fireflyBuild(c, c.rng() < 0.4 + 0.25 * c.T.energy ? 'escape' : 'catch')
    });
    def({
      id: 'bubble', group: 'play', cd: 9 * 60000, gentle: true,
      weight: (c) => 0.25 + 0.9 * c.T.drama + 0.45 * c.T.energy,
      build(c) {
        // it rises on the side away from the satellite (upper left), so the two never crowd each other
        const s = c.sat ? (c.sat.x < c.eye.x ? 1 : -1) : sideOf(c), T = c.T, sc = c.compact || c.landscape ? 0.8 : 1;
        const reaction = c.gentle ? 'amused' : pick(c, [
          ...Array(Math.round(1 + T.drama * 4)).fill('surprise'),
          ...Array(Math.round(1 + (1 - T.grump) * 3 + T.energy * 2)).fill('amused'),
          ...Array(Math.round(1 + T.curiosity * 2 + T.shyness * 2)).fill('confused')
        ]);
        const at = (u) => { const k = R(u, 0.08, 0.62); return { x: s * (0.15 + 0.35 * k) * sc + 0.08 * Math.sin(u * 14), y: (-0.3 - 1.25 * k) * sc }; };
        const radius = (u) => (0.05 + 0.44 * R(u, 0.08, 0.6)) * sc * (1 + 0.04 * Math.sin(u * 40));
        const popAt = 0.64, pop = at(popAt);
        return {
          dur: 6200 * (SPEED[c.emo] || 1), phases: [0.08, 0.36, 0.64, 0.86], variant: null,
          blinks: reaction === 'amused' ? [[0.9, false]] : [[0.88, false]],
          after: reaction === 'surprise' ? [[popAt + 0.01, 'startled', 0.8, 1200], [popAt + 0.1, 'playful', 0.35, 30000]]
            : reaction === 'amused' ? [[popAt + 0.03, 'playful', 0.55, 40000]] : [[popAt + 0.05, 'curious', 0.4, 25000]],
          f(u) {
            const b = at(Math.min(u, popAt)), e = eye(), track = toGaze(c, e.x + b.x * e.size, e.y + b.y * e.size);
            const grow = R(u, 0.1, 0.6) * (u < popAt ? 1 : 0);
            const o = { gx: track.x, gy: track.y, gw: R(u, 0.04, 0.12) * (1 - R(u, 0.86, 1)) };
            o.y = -3 * grow; o.sy = 0.03 * grow; o.pupil = 0.3 * grow; o.up = -0.06 * grow;
            if (reaction === 'surprise') {
              const jump = B(u, 0.665, 0.025), wide = W(u, 0.64, 0.66, 0.74, 0.82);
              o.y += -9 * jump; o.sy += 0.07 * jump; o.sx = -0.03 * jump; o.up += -0.25 * wide; o.pupil += -0.25 * B(u, 0.65, 0.02) + 0.15 * wide; o.glow = 0.12 * jump;
            } else if (reaction === 'amused') {
              const giggle = W(u, 0.66, 0.7, 0.8, 0.88);
              o.tilt = 0.07 * Math.sin(u * 70) * giggle; o.low = 0.26 * giggle; o.up += 0.08 * giggle; o.glow = 0.1 * giggle; o.y += -2 * Math.abs(Math.sin(u * 52)) * giggle;
            } else {
              const where = W(u, 0.64, 0.68, 0.8, 0.86), g = G(u, [[0.64, track.x, track.y], [0.68, track.x - 0.25, track.y + 0.1], [0.73, track.x - 0.25, track.y + 0.1], [0.76, track.x + 0.25, track.y + 0.05], [0.81, track.x + 0.25, track.y + 0.05], [0.88, 0, 0]]);
              if (u >= popAt) { o.gx = g.x; o.gy = g.y; }
              o.tilt = -s * 0.1 * where; o.up += 0.05 * where; o.pupil += 0.1 * where;
            }
            return o;
          },
          paint(ctx, u, t, P) {
            const b = at(Math.min(u, popAt));
            const x = clamp(P.hx + b.x * P.size, 12, P.w - 12), y = clamp(P.hy + b.y * P.size, 12, P.h - 12);
            if (u < popAt) {
              const r = radius(u) * P.size, a = R(u, 0.06, 0.14) * P.k;
              if (!P.lowPower) {
                const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
                g.addColorStop(0, P.tint(1.6, 0.16 * a)); g.addColorStop(0.7, P.tint(1.2, 0.05 * a)); g.addColorStop(1, P.tint(1.3, 0.22 * a));
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
              }
              ring(ctx, x, y, r, Math.max(1, r * 0.06), P, 0.45 * a);
              ctx.beginPath(); ctx.arc(x, y, r * 0.72, -2.5, -1.7);
              ctx.lineWidth = Math.max(1, r * 0.08); ctx.lineCap = 'round'; ctx.strokeStyle = P.tint(1.9, 0.5 * a); ctx.stroke();
            } else {
              const k = clamp((u - popAt) / 0.12), r = radius(popAt) * P.size;
              if (k >= 1) return;
              ring(ctx, x, y, r * (1 + 0.5 * k), Math.max(0.8, r * 0.05 * (1 - k)), P, 0.5 * (1 - k) * P.k);
              for (let i = 0; i < 8; i++) {
                const a = (i / 8) * TAU + 0.3, d = r * (1 + 1.1 * ease(k));
                mote(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, P.size * 0.08 * (1 - k), P, 0.7 * (1 - k) * P.k);
              }
            }
          }
        };
      }
    });
    def({
      id: 'amuse', group: 'play', cd: 8 * 60000, gentle: true,
      weight: (c) => 0.2 + 0.9 * c.T.energy + 0.5 * (1 - c.T.grump),
      build(c) {
        const motif = pick(c, c.gentle ? ['pulse', 'wobble'] : ['squish', 'pulse', 'wobble']), reps = c.rng() < 0.5 ? 2 : 3;
        const times = [0.1, 0.3, 0.45, 0.6].slice(0, reps + 1), last = 0.74, amp = [0.5, 0.85, 1.05, 1.15];
        return {
          dur: 6200 * (SPEED[c.emo] || 1), phases: [0.08, 0.2, last - 0.02, 0.8], touch: 'pretend', variant: motif,
          blinks: [[0.86, false]], after: [[0.4, 'playful', 0.45, 30000], [0.78, 'bored', 0.25, 20000]],
          f(u) {
            const o = { x: 0, y: 0, sx: 0, sy: 0, tilt: 0, glow: 0, light: 0, energy: 0 };
            const all = times.map((at, i) => [at, amp[i]]).concat([[last, 0.4]]);
            for (const [at, a] of all) {
              const e = B(u, at, 0.022);
              if (motif === 'squish') { o.sx += 0.07 * a * e; o.sy -= 0.07 * a * e; o.y += 3 * a * e; }
              else if (motif === 'pulse') { o.light += 0.3 * a * e; o.glow += 0.2 * a * e; o.energy += 0.5 * a * e; }
              else o.tilt += 0.07 * a * Math.sin((u - at) * TAU * 14) * W(u, at - 0.015, at, at + 0.04, at + 0.06);
            }
            const notice = W(u, 0.12, 0.16, 0.22, 0.28), joy = W(u, 0.3, 0.36, 0.66, 0.74), bored = W(u, 0.78, 0.82, 0.9, 0.97);
            const g = G(u, [[0, 0, 0], [0.13, 0, 0.35], [0.24, 0, 0.35], [0.3, 0.05, 0.2], [0.72, 0.05, 0.2], [0.8, 0.45, -0.15], [0.9, 0.45, -0.15], [1, 0, 0]]);
            o.gx = g.x; o.gy = g.y; o.gw = R(u, 0.1, 0.14) * (1 - R(u, 0.92, 1));
            o.pupil = 0.15 * notice + 0.12 * joy - 0.06 * bored; o.low = 0.22 * joy; o.up = 0.1 * bored - 0.04 * notice; o.glow += 0.05 * joy;
            return o;
          }
        };
      }
    });
    def({
      id: 'peekaboo', group: 'play', cd: 10 * 60000, gentle: true,
      weight: (c) => (0.15 + 1.5 * c.T.shyness + 0.15 * c.T.energy) * (1 + c.emoK('shy')),
      build(c) {
        const s = sideOf(c);
        return {
          dur: 5600, phases: [0.06, 0.2, 0.68, 0.82], touch: 'found', touchWindow: [0.06, 0.7],
          after: [[0.72, 'playful', 0.45, 30000]],
          f(u) {
            // closed from 0.18 to 0.66; one lid opens halfway for the peek in the middle
            const peek = W(u, 0.42, 0.47, 0.53, 0.58), shut = W(u, 0.06, 0.18, 0.66, 0.7) * (1 - 0.55 * peek);
            const boo = B(u, 0.72, 0.03), after = W(u, 0.72, 0.76, 0.84, 0.94);
            const g = G(u, [[0, 0, 0], [0.44, 0, 0.1], [0.48, s * 0.55, 0.05], [0.54, s * 0.55, 0.05], [0.58, 0, 0.1], [0.7, 0, 0], [1, 0, 0]]);
            return {
              gx: g.x, gy: g.y, gw: R(u, 0.4, 0.44) * (1 - R(u, 0.6, 0.66)) + 0.4 * after,
              up: 1 * shut - 0.18 * boo, low: 0.9 * shut, sx: -0.13 * shut + 0.03 * boo, sy: -0.15 * shut + 0.08 * boo,
              y: 3 * shut - 6 * boo, glow: -0.3 * shut + 0.18 * boo, light: -0.35 * shut, pupil: 0.3 * boo + 0.06 * after,
              x: s * 2 * peek, tilt: s * 0.05 * peek
            };
          }
        };
      }
    });

    // ======== rare, unannounced ========
    def({
      id: 'own-spark', group: 'rare', cd: 5 * 86400000, gentle: false,
      weight: (c) => 1 + c.T.shyness + c.T.drama,
      build(c) {
        const s = sideOf(c), sp = (u) => {
          if (u < 0.04 || u > 0.84) return null;
          if (u < 0.2) { const k = ease((u - 0.04) / 0.16); return { x: -s * 0.95 * k, y: 0.15 - 0.2 * k, a: k }; }
          if (u < 0.46) return { x: -s * 0.95 + 0.04 * Math.sin(u * 30), y: -0.05 + 0.04 * Math.cos(u * 23), a: 1 };
          if (u < 0.5) { const k = ease((u - 0.46) / 0.04); return { x: -s * (0.95 + 0.35 * k), y: -0.05 - 0.25 * k, a: 1 }; }   // it flinches too
          if (u < 0.7) return { x: -s * 1.3, y: -0.3, a: 1 };
          const k = ease((u - 0.7) / 0.14); return { x: -s * 1.3 * (1 - k), y: -0.3 * (1 - k), a: 1 - 0.7 * k };          // quietly goes home
        };
        return {
          dur: 6800, phases: [0.04, 0.38, 0.46, 0.84], variant: null,
          after: [[0.45, 'startled', 1, 1400], [0.86, 'shy', 0.7, 30000]], blinks: [[0.58, false], [0.92, false]],
          f(u) {
            const g = G(u, [[0, s * 0.35, -0.1], [0.36, s * 0.35, -0.1], [0.42, -s * 0.6, -0.05], [0.44, -s * 0.6, -0.05], [0.5, -s * 0.85, -0.2], [0.7, -s * 0.85, -0.2], [0.8, 0.1 * s, 0.45], [0.9, 0.1 * s, 0.45], [0.95, 0, 0], [1, 0, 0]]);
            const jump = B(u, 0.46, 0.022), wide = W(u, 0.44, 0.46, 0.6, 0.7), shy = W(u, 0.76, 0.8, 0.9, 0.98);
            return {
              gx: g.x, gy: g.y, gw: R(u, 0, 0.06) * (1 - R(u, 0.95, 1)),
              y: -10 * jump + 2 * shy, sy: 0.09 * jump - 0.02 * shy, sx: -0.04 * jump - 0.015 * shy, x: s * 3 * wide,
              up: -0.26 * wide + 0.14 * shy, low: 0.1 * shy, pupil: -0.15 * B(u, 0.43, 0.02) + 0.25 * wide - 0.05 * shy, glow: 0.2 * jump, light: -0.04 * shy
            };
          },
          paint(ctx, u, t, P) {
            const p = sp(u); if (!p) return;
            const x = P.hx + p.x * P.size, y = P.hy + p.y * P.size;
            mote(ctx, x, y, P.size * 0.24, P, 0.45 * p.a * P.k, 1.3);
            mote(ctx, x, y, P.size * 0.07, P, 0.9 * p.a * P.k, 1.9);
          }
        };
      }
    });
    def({
      id: 'reflection', group: 'rare', cd: 6 * 86400000, gentle: true,
      weight: (c) => 1 + c.T.curiosity + (1 - c.T.energy) * 0.5,
      build(c) {
        const s = sideOf(c);
        return {
          dur: 8200, phases: [0.06, 0.16, 0.84, 0.9], blinks: [[0.86, false], [0.9, false]],
          after: [[0.5, 'content', 0.4, 40000], [0.88, 'startled', 0.25, 1000]],
          f(u) {
            const in_ = W(u, 0.08, 0.22, 0.82, 0.86), sway = Math.sin(u * TAU * 2.2) * in_;
            const g = { x: 0.12 * Math.cos(u * TAU * 1.6 + s) * in_, y: 0.28 * in_ + 0.06 * Math.sin(u * TAU * 1.6) * in_ };
            const snap = B(u, 0.88, 0.025);
            return {
              gx: g.x, gy: g.y, gw: R(u, 0.06, 0.18) * (1 - R(u, 0.86, 0.95)),
              pupil: 0.3 * in_, up: 0.12 * in_, low: 0.06 * in_, tilt: 0.04 * sway, x: 1.5 * sway,
              sx: -0.02 * snap, y: -3 * snap, light: 0.06 * in_
            };
          },
          iris(ctx, u, t, P) {
            const a = W(u, 0.1, 0.24, 0.8, 0.86) * P.k; if (a <= 0.01) return;
            const ang = u * TAU * 1.6 + s, r = P.irisRadius * 0.55;
            mote(ctx, P.gx + Math.cos(ang) * r, P.gy + Math.sin(ang) * r * 0.8, P.irisRadius * 0.45, P, 0.5 * a, 1.7);
          }
        };
      }
    });
    def({
      id: 'dance', group: 'rare', cd: 5 * 86400000, gentle: false,
      when: (c) => !c.sleepy,
      weight: (c) => 0.8 + c.T.energy * 1.2 + c.emoK('playful'),
      build(c) {
        const beat = 1 / 9;   // eight beats across 0.06..0.94
        return {
          dur: 5600, phases: [0.04, 0.1, 0.86, 0.92], touch: 'pretend', touchWindow: [0.06, 0.86],
          after: [[0.2, 'playful', 0.7, 40000], [0.5, 'excited', 0.4, 6000]], blinks: [[0.93, false]],
          f(u) {
            const on = W(u, 0.06, 0.1, 0.84, 0.88), k = clamp((u - 0.1) / (beat * 8)), b = k * 8, i = Math.floor(b), f = b - i;
            const thump = Math.exp(-f * 6) * on, side = i % 2 ? 1 : -1, hop = (i === 3 || i === 7) ? Math.sin(Math.PI * clamp(f * 1.6)) * on : 0;
            const done = W(u, 0.86, 0.89, 0.93, 0.98);
            return {
              gx: 0.1 * side * on, gy: -0.25 * on, gw: on + done,
              y: 3 * thump - 8 * hop, sy: -0.04 * thump + 0.05 * hop, sx: 0.03 * thump - 0.02 * hop,
              tilt: 0.06 * side * on * (0.6 + 0.4 * Math.cos(f * Math.PI)), glow: 0.1 * thump, low: 0.2 * on,
              up: -0.04 * on, pupil: 0.12 * on - 0.06 * done
            };
          }
        };
      }
    });
    def({
      id: 'mischief', group: 'rare', cd: 6 * 86400000, gentle: true,
      when: (c) => !!c.clock,
      weight: (c) => 0.6 + (1 - c.T.shyness) * 0.8 + c.T.grump * 0.8 + c.emoK('mischievous') * 2,
      build(c) {
        const e = c.eye, C = { x: (c.clock.x - e.x) / e.size, y: (c.clock.y - e.y) / e.size }, Cg = toGaze(c, c.clock.x, c.clock.y);
        const s = Math.sign(C.x) || 1;
        const shot = (u) => {
          if (u < 0.46 || u > 0.6) return null;
          const k = (u - 0.46) / 0.14, ek = ease(k);
          return { x: C.x * ek, y: C.y * ek - 0.6 * Math.sin(Math.PI * k), a: 1 };
        };
        return {
          dur: 6800, phases: [0.06, 0.4, 0.62, 0.66], touch: 'pretend', touchWindow: [0.06, 0.62],
          after: [[0.02, 'mischievous', 0.8, 30000], [0.64, 'playful', 0.4, 30000]], blinks: [[0.93, false]],
          f(u) {
            const g = G(u, [[0, 0, 0], [0.08, -0.7, 0.05], [0.18, -0.7, 0.05], [0.24, 0.7, 0.05], [0.33, 0.7, 0.05], [0.38, 0, 0], [0.44, 0, 0], [0.5, Cg.x * 0.6, Cg.y * 0.6], [0.6, Cg.x, Cg.y], [0.63, -s * 0.45, -0.55], [0.88, -s * 0.45, -0.55], [0.96, 0, 0], [1, 0, 0]]);
            const sly = W(u, 0.04, 0.1, 0.38, 0.44), flick = B(u, 0.46, 0.02), innocent = W(u, 0.62, 0.66, 0.86, 0.94);
            return {
              gx: g.x, gy: g.y, gw: R(u, 0, 0.06) * (1 - R(u, 0.93, 1)),
              up: 0.14 * sly + 0.12 * innocent, low: 0.1 * sly + 0.2 * innocent, pupil: -0.06 * sly + 0.1 * innocent,
              sy: -0.05 * flick + 0.025 * innocent, x: s * 4 * flick, tilt: -s * 0.04 * innocent + 0.025 * Math.sin(u * 60) * innocent,
              glow: 0.15 * flick, energy: 0.4 * flick
            };
          },
          paint(ctx, u, t, P) {
            const p = shot(u);
            if (p) { mote(ctx, P.hx + p.x * P.size, P.hy + p.y * P.size, P.size * 0.2, P, 0.5 * P.k, 1.4); mote(ctx, P.hx + p.x * P.size, P.hy + p.y * P.size, P.size * 0.06, P, P.k, 1.9); }
            const k = clamp((u - 0.6) / 0.12);
            if (k > 0 && k < 1) {
              const cx = P.hx + C.x * P.size, cy = P.hy + C.y * P.size;
              ring(ctx, cx, cy, P.size * (0.1 + 0.55 * ease(k)), 1.2, P, 0.45 * (1 - k) * P.k);
              mote(ctx, cx, cy, P.size * 0.5, P, 0.22 * (1 - k) * P.k, 1.2);
            }
          }
        };
      }
    });
    def({
      id: 'daydream', group: 'rare', cd: 4 * 86400000, gentle: true,
      when: (c) => c.sleepy,
      weight: (c) => 1.5 + c.emoK('sleepy') * 2,
      build(c) {
        const seed = c.rng() * 1000, shape = pick(c, ['moon', 'orbit', 'ripple']);
        return {
          dur: 8600, phases: [0.08, 0.2, 0.82, 0.88], blinks: [[0.85, true]],
          after: [[0.5, 'sleepy', 0.4, 60000], [0.9, 'thoughtful', 0.35, 40000]],
          f(u) {
            const heavy = W(u, 0.06, 0.2, 0.82, 0.86), huh = B(u, 0.9, 0.025);
            return {
              gx: 0.05 * Math.sin(u * 5), gy: 0.22, gw: R(u, 0.05, 0.2) * (1 - R(u, 0.86, 0.96)),
              up: 0.32 * heavy - 0.1 * huh, low: 0.05 * heavy, pupil: 0.25 * heavy - 0.12 * huh, y: 2 * heavy, sy: -0.02 * heavy,
              light: -0.06 * heavy, tilt: 0.02 * Math.sin(u * 9) * heavy
            };
          },
          iris(ctx, u, t, P) {
            const a = W(u, 0.18, 0.32, 0.76, 0.84) * P.k; if (a <= 0.01) return;
            const r = P.irisRadius, cx = P.gx, cy = P.gy, s = t / 1000;
            if (shape === 'moon') {
              mote(ctx, cx + r * 0.1, cy - r * 0.05, r * 0.6, P, 0.22 * a, 1.5);
              ctx.save(); ctx.globalCompositeOperation = 'destination-out';
              mote(ctx, cx + r * 0.32, cy - r * 0.18, r * 0.5, P, 0.4 * a, 1.5); ctx.restore();
            } else if (shape === 'orbit') {
              for (let i = 0; i < 6; i++) { const ang = s * 0.6 + i * TAU / 6 + seed; mote(ctx, cx + Math.cos(ang) * r * 0.62, cy + Math.sin(ang) * r * 0.62, r * 0.14, P, 0.45 * a, 1.7); }
            } else {
              for (let i = 0; i < 3; i++) { const k = ((s * 0.35 + i / 3) % 1); ring(ctx, cx, cy, r * (0.25 + 0.7 * k), Math.max(0.8, r * 0.035), P, 0.35 * a * (1 - k)); }
            }
          }
        };
      }
    });
    def({
      id: 'hiccup-sparks', group: 'rare', cd: 5 * 86400000, gentle: true,
      weight: (c) => 1 + c.T.energy,
      build(c) {
        const at = [0.16, 0.36, 0.58], s = sideOf(c);
        return {
          dur: 5400, phases: [0.12, 0.16, 0.64, 0.82], blinks: [[0.84, false]],
          after: [[0.17, 'startled', 0.4, 800], [0.6, 'startled', 0.5, 800], [0.8, 'content', 0.3, 20000]],
          f(u) {
            let y = 0, sy = 0, up = 0, pupil = 0;
            for (const a of at) { const k = B(u, a, 0.02); y -= 5 * k; sy -= 0.06 * k; up -= 0.12 * k; pupil += 0.2 * B(u, a + 0.03, 0.03); }
            const g = G(u, [[0, 0, 0], [0.18, 0, 0], [0.24, s * 0.2, -0.6], [0.32, 0, 0], [0.38, 0, 0], [0.44, -s * 0.2, -0.6], [0.54, 0, 0], [0.6, 0, 0], [0.66, s * 0.15, -0.7], [0.78, s * 0.15, -0.7], [0.9, 0, 0], [1, 0, 0]]);
            const phew = B(u, 0.82, 0.04);
            return { gx: g.x, gy: g.y, gw: R(u, 0.15, 0.2) * (1 - R(u, 0.9, 1)), y: y + 3 * phew, sy: sy - 0.02 * phew, sx: 0.02 * phew, up, pupil };
          },
          paint(ctx, u, t, P) {
            at.forEach((a, i) => {
              const k = (u - a) / 0.18; if (k <= 0 || k >= 1) return;
              const sx = (i % 2 ? -1 : 1) * s;
              mote(ctx, P.hx + sx * 0.25 * P.size * k, P.hy - P.size * (0.2 + 1.3 * ease(k)), P.size * 0.12 * (1 - 0.5 * k), P, 0.8 * (1 - k) * P.k, 1.8);
            });
          }
        };
      }
    });
    def({
      id: 'count-icons', group: 'rare', cd: 6 * 86400000, gentle: true,
      when: (c) => c.icons.length >= 4,
      weight: (c) => 1 + c.T.curiosity,
      build(c) {
        const pts = c.icons.map((r) => toGaze(c, r.x, r.y)), n = pts.length, half = Math.ceil(n / 2);
        // one by one (a small nod at each), loses count halfway, starts again faster, gives up with a sigh
        const keys = [[0, 0, 0], [0.04, 0, 0]], nods = [];
        let u0 = 0.06;
        const step1 = 0.3 / half;
        for (let i = 0; i < half; i++) { keys.push([u0 + step1 * 0.25, pts[i].x, pts[i].y], [u0 + step1, pts[i].x, pts[i].y]); nods.push(u0 + step1 * 0.35); u0 += step1; }
        const lost = u0 + 0.02;
        keys.push([lost + 0.08, pts[half - 1].x, pts[half - 1].y]);
        u0 = lost + 0.1;
        const step2 = 0.34 / n;
        for (let i = 0; i < n; i++) { keys.push([u0 + step2 * 0.3, pts[i].x, pts[i].y], [u0 + step2, pts[i].x, pts[i].y]); nods.push(u0 + step2 * 0.4); u0 += step2; }
        keys.push([Math.max(u0 + 0.02, 0.84), pts[n - 1].x, pts[n - 1].y], [0.94, 0, 0], [1, 0, 0]);
        return {
          dur: 6400 + 420 * n, phases: [0.04, 0.06, 0.78, 0.86], blinks: [[lost + 0.02, false], [0.88, false]],
          after: [[0.8, 'content', 0.3, 20000]],
          f(u) {
            const g = G(u, keys);
            let y = 0; for (const a of nods) y += 1.6 * B(u, a, 0.012);
            const confused = W(u, lost - 0.03, lost, lost + 0.06, lost + 0.09), sigh = B(u, 0.86, 0.03);
            return { gx: g.x, gy: g.y, gw: R(u, 0, 0.05) * (1 - R(u, 0.92, 1)), y: y + 3 * sigh, tilt: 0.09 * confused, up: 0.05 * confused + 0.08 * sigh, pupil: 0.1 * confused, sy: -0.02 * sigh };
          }
        };
      }
    });
    def({
      id: 'corner-stare', group: 'rare', cd: 7 * 86400000, gentle: true,
      weight: (c) => 0.8 + c.T.curiosity * 0.5 + (1 - c.T.energy) * 0.6,
      build(c) {
        const s = sideOf(c), C = { x: s * 0.88, y: -0.8 };
        return {
          dur: 8400, phases: [0.04, 0.16, 0.8, 0.86], noBlink: [0.14, 0.8], blinks: [[0.81, false], [0.85, false]],
          after: [[0.5, 'thoughtful', 0.5, 40000]],
          f(u) {
            const g = G(u, [[0, 0, 0], [0.04, 0, 0], [0.16, C.x, C.y], [0.8, C.x, C.y], [0.9, 0, 0], [1, 0, 0]]);
            const stare = W(u, 0.12, 0.2, 0.78, 0.82), shake = W(u, 0.82, 0.84, 0.88, 0.9);
            return { gx: g.x, gy: g.y, gw: R(u, 0.02, 0.06) * (1 - R(u, 0.9, 1)), pupil: 0.35 * stare, up: -0.05 * stare, x: 2 * Math.sin(u * 160) * shake, tilt: s * 0.02 * stare };
          }
        };
      }
    });
    def({
      id: 'top-look', group: 'rare', cd: 6 * 86400000, gentle: false,
      weight: (c) => 0.8 + c.T.energy * 0.6 + c.T.drama * 0.6,
      build(c) {
        const s = sideOf(c);
        return {
          dur: 5200, phases: [0.06, 0.14, 0.52, 0.72], blinks: [[0.9, false]],
          after: [[0.62, 'startled', 0.35, 900], [0.86, 'shy', 0.5, 25000]],
          f(u) {
            const up = W(u, 0.08, 0.24, 0.5, 0.58), wob = Math.sin((u - 0.3) * 40) * W(u, 0.3, 0.36, 0.52, 0.6) * Math.max(0, 1 - (u - 0.3) * 2);
            const tip = W(u, 0.5, 0.56, 0.6, 0.66), land = B(u, 0.64, 0.025), shy = W(u, 0.72, 0.78, 0.88, 0.96);
            const g = G(u, [[0, 0, 0], [0.08, 0, 0], [0.24, 0, -1], [0.56, 0, -1], [0.66, 0, 0], [0.76, -s * 0.4, 0.4], [0.88, -s * 0.4, 0.4], [1, 0, 0]]);
            return {
              gx: g.x, gy: g.y, gw: R(u, 0.04, 0.1) * (1 - R(u, 0.92, 1)),
              sy: 0.06 * up - 0.07 * land, sx: -0.03 * up + 0.05 * land, y: -3 * up + 3 * land + 1.5 * shy, tilt: 0.06 * wob + s * 0.12 * tip,
              up: -0.12 * up + 0.12 * shy, low: 0.1 * shy, pupil: 0.1 * up
            };
          }
        };
      }
    });
    def({
      id: 'music-echo', group: 'rare', cd: 4 * 86400000, gentle: true,
      when: (c) => c.t - c.musicStoppedAt > 8000 && c.t - c.musicStoppedAt < 240000,
      weight: () => 3,
      build() {
        return {
          dur: 5200, phases: [0.06, 0.1, 0.56, 0.74], blinks: [[0.8, true]],
          after: [[0.7, 'content', 0.4, 40000]],
          f(u) {
            const on = W(u, 0.08, 0.14, 0.5, 0.58), k = Math.max(0, (u - 0.1) / 0.11), f = k % 1, beat = Math.exp(-f * 5) * on;
            const realize = W(u, 0.56, 0.6, 0.7, 0.76), sigh = B(u, 0.72, 0.035);
            return {
              gx: 0.25 * realize, gy: -0.1 * on + 0.2 * realize, gw: on + realize,
              y: 2.5 * beat + 3 * sigh, sy: -0.03 * beat - 0.02 * sigh, sx: 0.02 * beat + 0.02 * sigh, tilt: 0.04 * Math.sin(k * Math.PI) * on,
              glow: 0.08 * beat, up: 0.08 * realize, low: 0.12 * on
            };
          },
          paint(ctx, u, t, P) {
            for (const a of [0.2, 0.42]) { const k = (u - a) / 0.2; if (k > 0 && k < 1) ring(ctx, P.cx, P.cy, P.size * (1.1 + 0.6 * ease(k)), Math.max(0.8, P.size * 0.025), P, 0.22 * (1 - k) * P.k); }
          }
        };
      }
    });
    def({
      id: 'nod-off', group: 'rare', cd: 4 * 86400000, gentle: true,
      when: (c) => c.sleepy && c.hour >= 9 && c.hour < 21,
      weight: (c) => 1.5 + c.emoK('sleepy') * 2,
      build(c) {
        const s = sideOf(c);
        return {
          dur: 6200, phases: [0.1, 0.44, 0.5, 0.78],
          after: [[0.49, 'startled', 0.8, 1200], [0.85, 'shy', 0.4, 20000]], blinks: [[0.62, false]],
          f(u) {
            const sink = R(u, 0.08, 0.45) * (1 - R(u, 0.47, 0.5)), jerk = B(u, 0.49, 0.02), wide = W(u, 0.48, 0.5, 0.58, 0.66), sheep = W(u, 0.8, 0.84, 0.9, 0.97);
            const g = G(u, [[0, 0, 0.1], [0.45, 0, 0.3], [0.5, 0, 0], [0.56, -s * 0.7, 0], [0.63, -s * 0.7, 0], [0.68, s * 0.7, 0], [0.75, s * 0.7, 0], [0.82, 0, 0.1], [1, 0, 0]]);
            return {
              gx: g.x, gy: g.y, gw: R(u, 0.04, 0.1) * (1 - R(u, 0.95, 1)),
              up: 0.82 * sink - 0.2 * wide, low: 0.3 * sink + 0.18 * sheep, y: 4 * sink - 6 * jerk, sy: -0.04 * sink + 0.07 * jerk, sx: 0.02 * sink,
              pupil: -0.2 * jerk + 0.1 * wide, light: -0.15 * sink, glow: 0.1 * jerk
            };
          }
        };
      }
    });
    def({
      id: 'miss', group: 'rare', cd: 4 * 86400000, gentle: true,
      weight: (c) => 0.8 + c.T.shyness + c.T.energy * 0.4,
      build: (c) => fireflyBuild(c, 'miss')
    });

    // ======== environment (after the existing dedicated reactions have played) ========
    def({
      id: 'unplug', group: 'env', cd: 10 * 60000, gentle: true,
      build(c) {
        return {
          dur: 2600, phases: [0.06, 0.1, 0.55, 0.7], blinks: [[0.7, false]],
          f(u) {
            const g = G(u, [[0, 0, 0], [0.1, 0.05, 0.85], [0.55, 0.05, 0.85], [0.85, 0, 0], [1, 0, 0]]), hold = W(u, 0.1, 0.2, 0.5, 0.6);
            return { gx: g.x, gy: g.y, gw: 1 - R(u, 0.86, 1), tilt: 0.05 * hold, pupil: 0.1 * hold, y: 2 * B(u, 0.62, 0.04) };
          }
        };
      }
    });
    def({
      id: 'cozy', group: 'env', cd: 10 * 60000, gentle: true,
      build() {
        return {
          dur: 3000, phases: [0.08, 0.2, 0.6, 0.8], after: [[0.5, 'content', 0.6, 60000]],
          f(u) {
            const settle = W(u, 0.1, 0.35, 0.72, 0.95), sigh = B(u, 0.4, 0.06);
            return { up: 0.16 * settle, low: 0.12 * settle, sy: -0.03 * settle - 0.02 * sigh, sx: 0.03 * settle, y: 2 * settle + 2 * sigh, glow: 0.06 * settle };
          }
        };
      }
    });
    def({
      id: 'second-look', group: 'env', cd: 4 * 60000, gentle: true,
      when: (c) => !!c.glint,
      build(c) {
        const g0 = toGaze(c, c.glint.x, c.glint.y), dir = Math.sign(g0.x) || 1;
        return {
          dur: 2600, phases: [0.05, 0.12, 0.55, 0.72], blinks: [[0.62, false]], after: [[0.3, 'curious', 0.4, 25000]],
          f(u) {
            const g = G(u, [[0, 0, 0], [0.1, g0.x, g0.y], [0.6, g0.x, g0.y], [0.85, 0, 0], [1, 0, 0]]), hold = W(u, 0.1, 0.2, 0.5, 0.62);
            return { gx: g.x, gy: g.y, gw: 1 - R(u, 0.88, 1), pupil: 0.2 * hold, x: dir * 3 * hold, tilt: dir * 0.04 * hold, up: -0.05 * hold };
          }
        };
      }
    });
    def({
      id: 'sky', group: 'env', cd: 2 * 3600000, gentle: true,
      build(c) {
        const s = sideOf(c);
        return {
          dur: 3800, phases: [0.06, 0.14, 0.7, 0.8], blinks: [[0.76, true]], after: [[0.5, 'thoughtful', 0.45, 40000]],
          f(u) {
            const g = G(u, [[0, 0, 0], [0.16, s * 0.25, -0.88], [0.72, s * 0.25, -0.88], [0.9, 0, 0], [1, 0, 0]]), hold = W(u, 0.14, 0.24, 0.68, 0.76);
            return { gx: g.x, gy: g.y, gw: 1 - R(u, 0.9, 1), pupil: 0.15 * hold, up: -0.08 * hold, sy: 0.02 * hold, light: 0.04 * hold };
          }
        };
      }
    });

    // ======== 5.0: weather, felt (from the cached forecast only; never a request of its own) ========
    // Picked by tick() at most once per forecast look (every ten minutes), then played like the other
    // environment moments: occasionally, briefly, and only when the home screen is free.
    def({
      id: 'wx-rain-soon', group: 'env', cd: 90 * 60000, gentle: true,
      build(c) {
        const s = sideOf(c), T = c.T, k0 = 0.8 + 0.4 * T.curiosity;
        return {
          dur: 4200, phases: [0.06, 0.16, 0.66, 0.82], blinks: [[0.8, false]], after: [[0.5, 'curious', 0.35, 30000]],
          f(u) {
            const g = G(u, [[0, 0, 0], [0.14, s * 0.3, -0.82], [0.36, s * 0.3, -0.82], [0.42, -s * 0.2, -0.6], [0.5, -s * 0.2, -0.6], [0.56, s * 0.35, -0.85], [0.74, s * 0.35, -0.85], [0.9, 0, 0], [1, 0, 0]]);
            const hold = W(u, 0.12, 0.22, 0.7, 0.8), sniff = (B(u, 0.26, 0.02) + B(u, 0.31, 0.02) + B(u, 0.62, 0.02)) * k0;
            return { gx: g.x, gy: g.y, gw: 1 - R(u, 0.9, 1), pupil: 0.12 * hold + 0.1 * sniff, tilt: 0.05 * s * hold, up: -0.06 * hold, sy: 0.015 * hold + 0.012 * sniff, y: -1.5 * hold };
          }
        };
      }
    });
    def({
      id: 'wx-sunrise', group: 'env', cd: 20 * 3600000, gentle: true,
      build(c) {
        const s = sideOf(c), stretch = c.T.energy > 0.55;
        return {
          dur: 5000, phases: [0.08, 0.2, 0.7, 0.86], blinks: [[0.62, true]], after: [[0.6, 'content', 0.45, 90000]],
          f(u) {
            const k = W(u, 0.08, 0.26, 0.72, 0.92), br = Math.sin(u * Math.PI * 2.5) * k, st = stretch ? W(u, 0.12, 0.2, 0.3, 0.4) : 0;
            return { gx: s * 0.4, gy: -0.6, gw: 0.7 * k, up: 0.15 * k - 0.1 * st, low: 0.08 * k, glow: 0.14 * k, light: 0.08 * k, sy: 0.012 * br + 0.04 * st, sx: -0.02 * st, y: -2 * k - 2 * st, tilt: 0.03 * s * k };
          }
        };
      }
    });
    def({
      id: 'wx-cold', group: 'env', cd: 45 * 60000, gentle: true,
      build(c) {
        const T = c.T, huddle = 0.6 + 0.8 * T.shyness, glare = T.grump > 0.6;
        return {
          dur: 3200, phases: [0.06, 0.14, 0.7, 0.86], blinks: [[0.78, false]], after: [[0.8, 'content', 0.2, 20000]],
          f(u) {
            const k = W(u, 0.06, 0.18, 0.72, 0.9), sh = Math.sin(u * 150) * (W(u, 0.14, 0.17, 0.32, 0.36) + 0.7 * W(u, 0.52, 0.55, 0.66, 0.7));
            return { x: 0.9 * sh, sx: -0.03 * huddle * k + 0.006 * sh, sy: -0.025 * huddle * k, y: 1.5 * k, up: (glare ? 0.14 : 0.07) * k, low: (glare ? 0.1 : 0.05) * k, light: -0.04 * k, pupil: -0.05 * k };
          }
        };
      }
    });
    def({
      id: 'wx-comfy', group: 'env', cd: 2 * 3600000, gentle: true,
      build(c) {
        return {
          dur: 4400, phases: [0.08, 0.24, 0.72, 0.88], blinks: [[0.58, true]], after: [[0.6, 'content', 0.4, 120000]],
          f(u) {
            const k = W(u, 0.08, 0.3, 0.72, 0.94), br = Math.sin(u * Math.PI * 2) * k;
            return { up: 0.12 * k, low: 0.06 * k, sy: 0.016 * br - 0.01 * k, sx: 0.012 * k, y: 1.5 * k, glow: 0.05 * k, gy: 0.08, gw: 0.3 * k };
          }
        };
      }
    });
    def({
      id: 'wx-storm', group: 'env', cd: 40 * 60000, gentle: true,
      build(c) {
        const T = c.T, s = sideOf(c);
        const v = roulette(['hide', 'startle', 'watch', 'glare'], [0.1 + 1.5 * Math.max(0, T.shyness - 0.35), 0.1 + 1.3 * T.drama, 0.2 + 1.2 * T.curiosity, 0.1 + 1.5 * Math.max(0, T.grump - 0.4)], c.rng);
        if (v === 'hide') return { variant: 'hide', dur: 3800, phases: [0.04, 0.1, 0.64, 0.84], blinks: [[0.12, false], [0.8, false]], after: [[0.3, 'shy', 0.45, 30000]],
          f(u) { const fl = B(u, 0.08, 0.03), k = W(u, 0.1, 0.22, 0.62, 0.84);
            return { gx: -0.5 * s, gy: 0.55, gw: 0.8 * k, sx: -0.035 * k - 0.02 * fl, sy: -0.035 * k + 0.03 * fl, y: 3 * k - 2 * fl, up: 0.12 * k, low: 0.1 * k, light: -0.05 * k, x: -2 * s * k }; } };
        if (v === 'startle') return { variant: 'startle', dur: 3200, phases: [0.03, 0.08, 0.6, 0.8], blinks: [[0.76, false]], after: [[0.2, 'startled', 0.4, 1200], [0.5, 'curious', 0.3, 20000]],
          f(u) { const jump = B(u, 0.07, 0.03), stare = W(u, 0.1, 0.18, 0.56, 0.72);
            return { gx: s * 0.2, gy: -0.85, gw: 0.9 * stare, up: -0.18 * jump - 0.06 * stare, pupil: -0.2 * jump + 0.15 * stare, sy: 0.04 * jump + 0.015 * stare, y: -3 * jump - 1.5 * stare }; } };
        if (v === 'glare') return { variant: 'glare', dur: 3000, phases: [0.06, 0.14, 0.62, 0.82], blinks: [[0.82, false]], after: [[0.5, 'mischievous', 0.25, 20000]],
          f(u) { const k = W(u, 0.06, 0.18, 0.66, 0.84);
            return { gx: s * 0.3, gy: -0.8, gw: 0.85 * k, up: 0.16 * k, low: 0.12 * k, pupil: -0.1 * k, tilt: -0.04 * s * k }; } };
        return { variant: 'watch', dur: 4000, phases: [0.06, 0.16, 0.7, 0.86], blinks: [[0.46, false], [0.84, false]], after: [[0.5, 'curious', 0.4, 30000]],
          f(u) { const k = W(u, 0.08, 0.2, 0.72, 0.9), lean = W(u, 0.2, 0.32, 0.62, 0.74);
            return { gx: s * 0.35, gy: -0.85, gw: 0.9 * k, pupil: 0.18 * k, y: -3 * lean, x: 3 * s * lean, tilt: 0.05 * s * lean, sy: 0.02 * lean, up: -0.06 * k }; } };
      }
    });
    // what the forecast (already on the phone) suggests the Eye might feel; null for nothing in particular
    function weatherFeel(t) {
      const WD = root.EyesWeatherData;
      if (!WD || !WD.readCache) return null;
      let prefs = null; try { prefs = WD.readPrefs ? WD.readPrefs() : null; } catch (e) { prefs = null; }
      if (prefs && (prefs.enabled === false || prefs.idle === false)) return null;   // Weather or its idle moments are off
      const data = WD.readCache();
      const v = data && WD.nowView(data);
      if (!v || !v.available || !v.cond || v.age > 3 * 3600e3) return null;
      const kind = v.cond.kind, feels = Number.isFinite(v.feels) ? v.feels : v.temp, wet = /rain|storm|snow/.test(kind), sec = Date.now() / 1000;
      if (kind === 'storm') return 'wx-storm';
      if (!wet) {
        const next = (WD.upcoming ? WD.upcoming(data, Date.now(), 3) : []).slice(1);
        if (next.some((h) => (h.cond && /rain|storm/.test(h.cond.kind)) || (Number.isFinite(h.pop) && h.pop >= 65))) return 'wx-rain-soon';
      }
      if (Number.isFinite(v.sunrise) && sec >= v.sunrise && sec < v.sunrise + 75 * 60 && /sun|partly/.test(kind)) return 'wx-sunrise';
      if (Number.isFinite(feels) && feels <= 2) return 'wx-cold';
      if (Number.isFinite(feels) && feels >= 18 && feels <= 25 && /sun|partly|night/.test(kind) && !(Number.isFinite(v.pop) && v.pop > 30)) return 'wx-comfy';
      return null;
    }

    // ======== reunion (after personality.js's greeting decides it's ours) ========
    const GREETS = {
      ack: () => ({
        dur: 1400, phases: [0.05, 0.1, 0.45, 0.7], blinks: [[0.45, false]], after: [[0.4, 'content', 0.3, 20000]],
        f(u) { const k = B(u, 0.3, 0.12); return { gx: 0, gy: 0, gw: R(u, 0, 0.2) * (1 - R(u, 0.8, 1)), y: -2 * k, up: -0.08 * k, pupil: 0.12 * k }; }
      }),
      waiting: () => ({
        dur: 1600, phases: [0.02, 0.05, 0.5, 0.7], blinks: [[0.55, true]], after: [[0.3, 'content', 0.45, 30000]],
        f(u) { const k = W(u, 0.05, 0.3, 0.6, 0.95); return { gx: 0, gy: 0, gw: 1 - R(u, 0.85, 1), y: -2 * k, up: -0.1 * k, pupil: 0.2 * k, glow: 0.08 * k, low: 0.08 * k }; }
      }),
      'double-take': (c) => {
        const s = sideOf(c);
        return {
          dur: 2000, phases: [0.05, 0.3, 0.45, 0.7], blinks: [[0.72, false]], after: [[0.46, 'excited', 0.5, 6000], [0.6, 'content', 0.3, 30000]],
          f(u) {
            const g = G(u, [[0, s * 0.6, 0.1], [0.24, s * 0.6, 0.1], [0.29, 0, 0], [0.33, 0, 0], [0.38, s * 0.55, 0.1], [0.42, s * 0.55, 0.1], [0.45, 0, 0], [1, 0, 0]]);
            const snap = B(u, 0.47, 0.03), wide = W(u, 0.45, 0.48, 0.6, 0.75);
            return { gx: g.x, gy: g.y, gw: 1 - R(u, 0.85, 1), up: -0.22 * wide, pupil: 0.35 * wide, sy: 0.05 * snap, y: -5 * snap, glow: 0.12 * wide };
          }
        };
      },
      bounce: () => ({
        dur: 1900, phases: [0.05, 0.18, 0.6, 0.75], blinks: [[0.78, false]], after: [[0.3, 'playful', 0.6, 40000]],
        f(u) {
          const crouch = W(u, 0.06, 0.14, 0.16, 0.22), h1 = Math.sin(Math.PI * clamp((u - 0.2) / 0.18)), h2 = 0.65 * Math.sin(Math.PI * clamp((u - 0.42) / 0.15)), land = B(u, 0.6, 0.025);
          const hop = Math.max(0, h1) + Math.max(0, h2);
          return { gx: 0, gy: -0.05, gw: 1 - R(u, 0.85, 1), y: 3 * crouch - 9 * hop + 2 * land, sy: -0.06 * crouch + 0.06 * hop - 0.05 * land, sx: 0.04 * crouch - 0.03 * hop + 0.04 * land, glow: 0.14 * hop, low: 0.18 * W(u, 0.2, 0.3, 0.7, 0.9) };
        }
      }),
      'shy-peek': (c) => {
        const s = sideOf(c);
        return {
          dur: 2400, phases: [0.05, 0.35, 0.65, 0.8], blinks: [[0.8, false]], after: [[0.1, 'shy', 0.5, 20000], [0.7, 'content', 0.4, 30000]],
          f(u) {
            const g = G(u, [[0, s * 0.4, 0.4], [0.35, s * 0.4, 0.4], [0.4, 0, 0], [0.45, 0, 0], [0.5, s * 0.35, 0.35], [0.6, s * 0.35, 0.35], [0.66, 0, 0], [1, 0, 0]]);
            const hide = W(u, 0, 0.1, 0.55, 0.66), smile = W(u, 0.66, 0.72, 0.85, 0.98);
            return { gx: g.x, gy: g.y, gw: 1 - R(u, 0.88, 1), up: 0.06 * hide, low: 0.1 * hide + 0.2 * smile, sx: -0.02 * hide, sy: -0.02 * hide, y: 1.5 * hide, tilt: s * 0.04 * hide - s * 0.03 * smile, glow: 0.08 * smile };
          }
        };
      },
      enthusiastic: () => ({
        dur: 2400, phases: [0.03, 0.08, 0.62, 0.8], blinks: [[0.8, false]], after: [[0.1, 'excited', 0.7, 8000], [0.6, 'playful', 0.5, 40000]],
        f(u) {
          let hop = 0; for (const a of [0.14, 0.32, 0.5]) hop += Math.max(0, Math.sin(Math.PI * clamp((u - a) / 0.15))) * (a === 0.5 ? 0.6 : 1);
          const wide = W(u, 0.03, 0.1, 0.6, 0.8);
          return { gx: 0, gy: -0.05, gw: 1 - R(u, 0.85, 1), y: -8 * hop, sy: 0.05 * hop, sx: -0.025 * hop, up: -0.2 * wide, pupil: 0.35 * wide, glow: 0.25 * wide, energy: 0.6 * wide, low: 0.16 * wide };
        }
      }),
      'wake-slow': () => ({
        dur: 3400, phases: [0.05, 0.3, 0.7, 0.82], blinks: [[0.84, true]], after: [[0.3, 'sleepy', 0.5, 40000], [0.85, 'content', 0.4, 30000]],
        f(u) {
          const heavy = K(u, [[0, 0.85], [0.22, 0.5], [0.34, 0.66], [0.6, 0.2], [0.78, 0]]), body = 1 - R(u, 0.1, 0.75), stretch = B(u, 0.62, 0.06);
          const g = G(u, [[0, 0, 0.2], [0.4, 0, 0.2], [0.8, 0, 0], [1, 0, 0]]);
          return { gx: g.x, gy: g.y, gw: 1 - R(u, 0.85, 1), up: heavy, low: 0.4 * heavy, pupil: -0.2 * body, y: 4 * body, sy: -0.04 * body + 0.05 * stretch, sx: 0.02 * body - 0.03 * stretch, light: -0.2 * body };
        }
      })
    };
    // ======== reactions to being caught in the act ========
    const TOUCHES = {
      // Peekaboo: found! It pops out, delighted, then goes a little shy
      found: () => ({
        dur: 1700, phases: [0.02, 0.06, 0.35, 0.7], blinks: [[0.7, false]], after: [[0.1, 'excited', 0.6, 5000], [0.5, 'shy', 0.35, 20000], [0.6, 'playful', 0.5, 30000]],
        f(u) {
          const pop = B(u, 0.12, 0.05), wide = W(u, 0.02, 0.08, 0.3, 0.45), smile = W(u, 0.3, 0.4, 0.75, 0.95);
          return { gx: 0, gy: 0, gw: 1 - R(u, 0.85, 1), y: -8 * pop, sy: 0.08 * pop, sx: -0.03 * pop, up: -0.25 * wide, pupil: 0.4 * wide, glow: 0.25 * wide, low: 0.25 * smile, tilt: 0.04 * Math.sin(u * 30) * smile };
        }
      }),
      // Caught mid-dance (or mid-mischief): it freezes, looks at you, and pretends nothing happened
      pretend: (c) => {
        const s = sideOf(c);
        return {
          dur: 2200, phases: [0.02, 0.08, 0.35, 0.85], blinks: [[0.32, false]], after: [[0.1, 'startled', 0.4, 900], [0.4, 'shy', 0.45, 20000]],
          f(u) {
            const look = W(u, 0.06, 0.1, 0.28, 0.34), away = W(u, 0.34, 0.42, 0.78, 0.9);
            const g = G(u, [[0, 0, 0], [0.08, 0, 0], [0.32, 0, 0], [0.4, s * 0.55, -0.45], [0.82, s * 0.55, -0.45], [0.95, 0, 0]]);
            return {
              gx: g.x, gy: g.y, gw: 1 - R(u, 0.9, 1), up: -0.15 * look + 0.1 * away, low: 0.22 * away, pupil: -0.15 * look + 0.05 * away,
              sy: 0.025 * away, tilt: s * 0.05 * away + 0.02 * Math.sin(u * 40) * away, y: -1.5 * look
            };
          }
        };
      }
    };
    function K(u, keys) {
      if (u <= keys[0][0]) return keys[0][1];
      for (let i = 0; i < keys.length - 1; i++) { const a = keys[i], b = keys[i + 1]; if (u <= b[0]) return mix(a[1], b[1], ease((u - a[0]) / Math.max(1e-4, b[0] - a[0]))); }
      return keys[keys.length - 1][1];
    }
    const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));
    const RARE_P = 0.03;

    // ---------- choosing ----------
    function affinity(d, c) {
      const A = AFFINITY[d.group];
      if (!A) return 1;
      let k = 1;
      for (const e in A) k += c.emoK(e) * (A[e] - 1);
      return Math.max(0.15, k);
    }
    function cooledDown(d, c, last) {
      const at = last[d.id];
      return !at || c.wall - at >= d.cd;
    }
    function eligible(d, c) {
      if (c.gentle && !d.gentle) return false;
      try { return !d.when || d.when(c); } catch (e) { return false; }
    }
    // The pure decision: what (if anything) to do now. Used by the live director and by the simulation.
    function choose(S, c) {
      S.decisions++;
      if (c.rng() < 0.14 * (1 + c.emoK('content') + c.emoK('sleepy') - c.emoK('bored'))) {
        S.quietUntil = c.t + (2 + c.rng() * 4) * 60000;   // a quiet spell: perfectly happy doing nothing
        S.nothing++;
        return null;
      }
      const last = S.last;
      if (c.rng() < RARE_P * (1 + 0.5 * c.emoK('bored') + 0.3 * c.emoK('mischievous'))) {
        const rares = DEFS.filter((d) => d.group === 'rare' && eligible(d, c) && cooledDown(d, c, S.rareLast));
        if (rares.length) {
          // the one it hasn't done for the longest is the likeliest, weighted by temperament
          const ws = rares.map((d) => d.weight(c) * affinity(d, c) * (1 + clamp((c.wall - (S.rareLast[d.id] || 0)) / (7 * 86400000), 0, 3)));
          return roulette(rares, ws, c.rng);
        }
      }
      const pool = DEFS.filter((d) => (d.group === 'curious' || d.group === 'play') && eligible(d, c) && cooledDown(d, c, last));
      const ws = pool.map((d) => {
        const recent = S.history.slice(-4), i = recent.lastIndexOf(d.id);
        const suppress = i < 0 ? 1 : i >= recent.length - 2 ? 0.15 : 0.5;
        return d.weight(c) * affinity(d, c) * suppress;
      });
      const nothing = 0.8 + 1.1 * c.emoK('content') + 1.0 * c.emoK('thoughtful') + 1.4 * c.emoK('sleepy') - 0.5 * c.emoK('bored');
      const pickD = roulette(pool.concat([null]), ws.concat([Math.max(0.2, nothing)]), c.rng);
      if (!pickD) S.nothing++;
      return pickD;
    }
    function roulette(items, ws, rng) {
      const total = ws.reduce((a, b) => a + Math.max(0, b), 0);
      if (!(total > 0)) return items[items.length - 1] || null;
      let r = rng() * total;
      for (let i = 0; i < items.length; i++) if ((r -= Math.max(0, ws[i])) <= 0) return items[i];
      return items[items.length - 1];
    }
    const spacing = (c) => (30000 + c.rng() * 60000) * (SPACING[c.emo] || 1) / (0.6 + 0.6 * (c.mood.energy ?? 0.6)) * (c.lowPower ? 2 : 1);
    // the director's own memory (session); rare timestamps come from the per-Eye store
    const S = { history: [], last: {}, quietUntil: 0, decisions: 0, nothing: 0, get rareLast() { return memory().last; } };

    // ---------- 5.0: emotional continuity ----------
    // Abilities report what just happened (EyesFeel.report). The feeling starts at once as ordinary emotion
    // impulses that fade on their own; the first time the home screen is the Eye's again (within two minutes)
    // it plays one short afterglow on the real body, chosen by its temperament, so two Eyes never answer the
    // same win the same way. Nothing is stored and no stat changes: everything here has expired within minutes.
    // Competing reports: the feelings blend (an impulse keeps the stronger of old and new); the afterglow keeps
    // the more significant experience when two arrive within 20 s, otherwise the newest.
    const XP_RANK = { 'arcade-best': 4, 'battle-win': 4, 'battle-loss': 4, hangout: 4, 'arcade-win': 3, 'arcade-loss': 3, 'battle-draw': 2, play: 2, company: 2, 'vision-scan': 1, 'pocket-stored': 1 };
    const X = { pending: null, reported: 0, shown: 0, expired: 0, kept: 0, log: [] };
    const vary = (c, k = 0.15) => 1 + (c.rng() - 0.5) * 2 * k;            // never quite the same twice
    const choosy = (c, opts) => { const ks = Object.keys(opts); return roulette(ks, ks.map((k) => Math.max(0.01, opts[k])), c.rng); };
    function feelNow(kind, T, data) {
      const d = data || {};
      switch (kind) {
        case 'arcade-best': impulse('excited', 0.55 + 0.3 * T.drama, 20000); impulse('content', 0.5, 90000); break;
        case 'arcade-win': { const k = d.mild ? 0.6 : 1; impulse('excited', (0.35 + 0.3 * T.drama) * k, 15000); impulse('content', 0.4 * k, 60000); if (T.grump > 0.6) impulse('mischievous', 0.3 * k, 20000); break; }   // 5.0: a survival run that went fine is a mild win
        case 'battle-win': impulse('excited', 0.45 + 0.3 * T.drama, 20000); impulse('content', 0.45, 90000); if (T.grump > 0.55) impulse('mischievous', 0.35, 30000); break;
        case 'arcade-loss':
          if (T.grump > 0.55) impulse('mischievous', 0.35, 30000); else if (T.shyness > 0.6) impulse('shy', 0.3, 25000); else impulse('thoughtful', 0.3, 30000);
          break;
        case 'battle-loss':
          if (T.grump > 0.55) impulse('mischievous', 0.4, 45000); else if (T.shyness > 0.55) impulse('shy', 0.45, 45000); else impulse('thoughtful', 0.45, 60000);
          break;
        case 'battle-draw': impulse('curious', 0.3, 20000); break;
        case 'hangout': impulse('content', 0.55 + Math.min(0.2, (d.seconds || 0) / 1800), 240000); if (T.energy > 0.6) impulse('playful', 0.3, 90000); if (T.shyness > 0.6) impulse('shy', 0.2, 20000); break;
        case 'play': impulse('playful', 0.4 + 0.3 * T.energy, 150000); impulse('content', 0.25, 60000); break;
        case 'company': impulse('content', 0.55, 240000); if (T.energy < 0.45) impulse('sleepy', 0.2, 90000); break;
        case 'pocket-stored': impulse('curious', 0.3 + 0.2 * T.curiosity, 30000); break;
        case 'vision-scan': impulse('curious', 0.35 + 0.25 * T.curiosity, 40000); impulse('thoughtful', 0.15, 30000); break;
      }
    }
    function experience(kind, data) {
      if (!XP_RANK[kind]) return false;
      const t = now();
      X.reported++;
      try { feelNow(kind, temper(), data); } catch (e) {}
      const cur = X.pending;
      if (cur && t - cur.at < 20000 && XP_RANK[cur.kind] > XP_RANK[kind]) { X.kept++; return true; }
      X.pending = { kind, data: data || {}, at: t, until: t + 120000 };
      X.log.push({ kind, at: Math.round(t) }); if (X.log.length > 20) X.log.shift();
      host.schedule && host.schedule();
      return true;
    }
    // The afterglows. Every one returns all of its offsets to zero by u = 1, like the 4.8 behaviours.
    const AFTER = {
      pride(c, big) {
        const T = c.T, s = (big ? 1.25 : 1) * vary(c), side = c.side * (c.rng() < 0.3 ? -1 : 1);
        const v = choosy(c, { puff: 0.4 + T.drama + 0.6 * T.energy, smug: 0.1 + 1.6 * Math.max(0, T.grump - 0.35), bashful: 0.1 + 1.6 * Math.max(0, T.shyness - 0.4) });
        if (v === 'puff') return { variant: 'puff', dur: 2600 * vary(c, 0.1), phases: [0.08, 0.2, 0.6, 0.8], blinks: [[0.8, false]],
          after: [[0.3, 'excited', 0.3 * s, 6000], [0.86, 'content', 0.35, 40000]],
          f(u) { const sw = W(u, 0.12, 0.3, 0.62, 0.86), b1 = B(u, 0.38, 0.04), b2 = big ? B(u, 0.5, 0.04) : 0;
            return { gx: 0, gy: -0.25, gw: 0.6 * sw, sx: 0.035 * sw * s, sy: 0.045 * sw * s - 0.035 * (b1 + b2), y: -4 * sw * s + 2.5 * (b1 + b2), glow: 0.16 * sw * s, pupil: 0.18 * sw, up: -0.06 * sw, energy: 0.4 * sw }; } };
        if (v === 'smug') return { variant: 'smug', dur: 3000 * vary(c, 0.1), phases: [0.08, 0.2, 0.65, 0.82], blinks: [[0.56, true]],
          after: [[0.4, 'mischievous', 0.3, 20000], [0.86, 'content', 0.3, 40000]],
          f(u) { const k = W(u, 0.1, 0.28, 0.7, 0.9);
            return { gx: 0.35 * side, gy: -0.12, gw: 0.7 * k, tilt: 0.06 * side * k * s, up: 0.16 * k, low: 0.1 * k, y: -2 * k, glow: 0.08 * k * s, pupil: -0.06 * k }; } };
        return { variant: 'bashful', dur: 2600 * vary(c, 0.1), phases: [0.08, 0.2, 0.6, 0.8], blinks: [[0.3, false], [0.72, false]],
          after: [[0.5, 'shy', 0.3, 15000], [0.86, 'content', 0.4, 40000]],
          f(u) { const k = W(u, 0.08, 0.22, 0.62, 0.86), wig = Math.sin(u * Math.PI * 6) * W(u, 0.25, 0.3, 0.5, 0.58);
            return { gx: -0.3 * side, gy: 0.3, gw: 0.65 * k, tilt: 0.04 * wig * s, y: 1.5 * k, glow: 0.1 * k * s, sy: -0.012 * k, low: 0.12 * k }; } };
      },
      // a lost round of Arcade: a little frustration, then it gets over it
      frustration(c) {
        const T = c.T, s = vary(c), side = c.side;
        const v = choosy(c, { huff: 0.15 + 1.6 * Math.max(0, T.grump - 0.3), droop: 0.15 + 1.2 * Math.max(0, T.shyness - 0.3) + 0.6 * (1 - T.energy), shrug: 0.2 + 1.1 * T.energy });
        if (v === 'huff') return { variant: 'huff', dur: 3000 * vary(c, 0.1), phases: [0.06, 0.16, 0.56, 0.8], blinks: [[0.8, false]],
          after: [[0.3, 'mischievous', 0.3, 20000], [0.9, 'content', 0.3, 30000]],
          f(u) { const huff = B(u, 0.16, 0.035), glare = W(u, 0.18, 0.28, 0.5, 0.6), shake = Math.sin(u * 70) * W(u, 0.6, 0.63, 0.72, 0.78);
            return { gx: 0.45 * side, gy: 0.05, gw: 0.8 * glare, sx: 0.05 * huff * s, sy: -0.045 * huff * s, up: 0.14 * glare, low: 0.12 * glare, tilt: 0.03 * shake, x: 1.2 * shake, pupil: -0.08 * glare }; } };
        if (v === 'droop') return { variant: 'droop', dur: 3200 * vary(c, 0.1), phases: [0.08, 0.2, 0.62, 0.82], blinks: [[0.66, true]],
          after: [[0.3, 'thoughtful', 0.3, 20000], [0.88, 'content', 0.3, 30000]],
          f(u) { const k = W(u, 0.08, 0.24, 0.58, 0.72), perk = B(u, 0.76, 0.05);
            return { gx: -0.15 * side, gy: 0.38, gw: 0.7 * k, y: 3 * k * s - 2 * perk, up: 0.14 * k, sy: -0.02 * k + 0.02 * perk, pupil: -0.05 * k + 0.12 * perk, light: -0.05 * k }; } };
        return { variant: 'shrug', dur: 2400 * vary(c, 0.1), phases: [0.08, 0.2, 0.6, 0.8], blinks: [[0.5, false]],
          after: [[0.8, 'content', 0.3, 30000]],
          f(u) { const a = W(u, 0.1, 0.2, 0.3, 0.4), b = W(u, 0.35, 0.45, 0.55, 0.65), bob = B(u, 0.72, 0.04);
            return { gx: 0.3 * side, gy: -0.3, gw: 0.5 * (a + b), tilt: 0.05 * (a - b) * side * s, sy: -0.02 * bob, y: 1.5 * bob, up: 0.06 * (a + b) }; } };
      },
      // a lost duel stings more, and each temperament carries it its own way
      disappointment(c) {
        const T = c.T, s = vary(c), side = c.side;
        const v = choosy(c, { sulk: 0.1 + 1.3 * T.drama, droop: 0.1 + 1.3 * Math.max(0, T.shyness - 0.25), grumble: 0.1 + 1.6 * Math.max(0, T.grump - 0.35), stoic: 0.2 + 0.8 * (1 - T.drama) });
        if (v === 'sulk') {
          const look = [[0, 0, 0], [0.14, -0.65 * side, 0.15], [0.5, -0.62 * side, 0.12], [0.55, 0.05, 0], [0.62, 0.05, 0], [0.66, -0.6 * side, 0.15], [0.84, -0.4 * side, 0.1], [1, 0, 0]];
          return { variant: 'sulk', dur: 4200 * vary(c, 0.1), phases: [0.06, 0.16, 0.66, 0.84], blinks: [[0.58, false], [0.86, true]],
            after: [[0.3, 'thoughtful', 0.35, 40000], [0.95, 'content', 0.3, 40000]],
            f(u) { const g = G(u, look), k = W(u, 0.08, 0.2, 0.78, 0.96);
              return { gx: g.x, gy: g.y, gw: 0.85 * k, x: -3 * side * k * s, sy: -0.03 * k, sx: 0.01 * k, up: 0.12 * k, tilt: -0.04 * side * k, light: -0.06 * k }; } };
        }
        if (v === 'droop') return { variant: 'droop-long', dur: 3800 * vary(c, 0.1), phases: [0.08, 0.2, 0.66, 0.84], blinks: [[0.7, true]],
          after: [[0.3, 'shy', 0.3, 30000], [0.9, 'content', 0.3, 40000]],
          f(u) { const k = W(u, 0.08, 0.26, 0.64, 0.82), perk = B(u, 0.84, 0.05);
            return { gx: 0.1 * side, gy: 0.45, gw: 0.75 * k, y: 3.5 * k * s - 1.5 * perk, up: 0.16 * k, low: 0.05 * k, sy: -0.025 * k, sx: -0.01 * k, pupil: -0.06 * k + 0.08 * perk, light: -0.07 * k }; } };
        if (v === 'grumble') return { variant: 'grumble', dur: 3200 * vary(c, 0.1), phases: [0.06, 0.18, 0.6, 0.82], blinks: [[0.84, false]],
          after: [[0.4, 'mischievous', 0.4, 45000]],
          f(u) { const k = W(u, 0.06, 0.18, 0.62, 0.8), rum = Math.sin(u * 95) * W(u, 0.22, 0.26, 0.46, 0.5), huff = B(u, 0.56, 0.035);
            return { gx: 0.2 * side, gy: 0.1, gw: 0.6 * k, up: 0.18 * k, low: 0.12 * k, x: 0.9 * rum, sx: 0.05 * huff * s, sy: -0.045 * huff * s, pupil: -0.1 * k }; } };
        return { variant: 'stoic', dur: 3600 * vary(c, 0.1), phases: [0.08, 0.2, 0.66, 0.84], blinks: [[0.64, true]],
          after: [[0.4, 'thoughtful', 0.35, 40000]],
          f(u) { const g = G(u, [[0, 0, 0], [0.14, 0.35 * side, -0.4], [0.6, 0.38 * side, -0.38], [0.86, 0, 0], [1, 0, 0]]), k = W(u, 0.1, 0.22, 0.62, 0.82);
            return { gx: g.x, gy: g.y, gw: 0.7 * k, tilt: 0.03 * side * k, up: 0.08 * k, sy: -0.01 * k }; } };
      },
      draw(c) {
        const side = c.side;
        return { variant: 'huh', dur: 2200 * vary(c, 0.1), phases: [0.08, 0.2, 0.6, 0.8], blinks: [[0.7, false]], after: [[0.6, 'curious', 0.25, 15000]],
          f(u) { const g = G(u, [[0, 0, 0], [0.15, 0.35, -0.1], [0.32, 0.35, -0.1], [0.42, -0.35, -0.1], [0.6, -0.35, -0.1], [0.82, 0, 0], [1, 0, 0]]), k = W(u, 0.1, 0.2, 0.62, 0.8);
            return { gx: g.x, gy: g.y, gw: 0.6 * k, tilt: 0.05 * side * k, pupil: 0.06 * k }; } };
      },
      // a Hangout that went well: it is still with its friend for a moment
      affection(c) {
        const T = c.T, s = vary(c), side = c.side * (c.rng() < 0.5 ? 1 : -1);
        const v = choosy(c, { linger: 0.6 + 0.6 * T.curiosity, warm: 0.1 + 1.4 * Math.max(0, T.shyness - 0.35), bounce: 0.1 + 1.3 * Math.max(0, T.energy - 0.4) });
        if (v === 'bounce') return { variant: 'bounce', dur: 2600 * vary(c, 0.1), phases: [0.08, 0.2, 0.6, 0.8], blinks: [[0.78, false]],
          after: [[0.5, 'playful', 0.3, 60000], [0.9, 'content', 0.4, 120000]],
          f(u) { const h1 = B(u, 0.3, 0.05), h2 = B(u, 0.46, 0.05), k = W(u, 0.1, 0.2, 0.6, 0.8);
            return { gx: 0.4 * side, gy: -0.1, gw: 0.5 * k, y: -4 * (h1 + h2) * s, sy: 0.03 * (h1 + h2) - 0.02 * B(u, 0.56, 0.03), glow: 0.1 * k, pupil: 0.14 * k }; } };
        if (v === 'warm') return { variant: 'warm', dur: 3400 * vary(c, 0.1), phases: [0.08, 0.2, 0.64, 0.82], blinks: [[0.5, true]],
          after: [[0.9, 'content', 0.45, 180000]],
          f(u) { const k = W(u, 0.08, 0.24, 0.66, 0.86), wig = Math.sin(u * Math.PI * 5) * W(u, 0.3, 0.36, 0.5, 0.56);
            return { gx: 0.25 * side, gy: 0.28, gw: 0.6 * k, low: 0.14 * k, up: 0.06 * k, y: 1.5 * k, tilt: 0.035 * wig, glow: 0.1 * k * s }; } };
        // it looks toward where its friend's Eye left, and leans that way for a breath
        return { variant: 'linger', dur: 3800 * vary(c, 0.1), phases: [0.08, 0.2, 0.66, 0.84], blinks: [[0.56, true]],
          after: [[0.9, 'content', 0.45, 180000]],
          f(u) { const k = W(u, 0.08, 0.26, 0.66, 0.88);
            return { gx: 0.7 * side, gy: 0.05, gw: 0.75 * k, x: 4 * side * k * s, tilt: 0.04 * side * k, low: 0.08 * k, up: 0.05 * k, glow: 0.08 * k }; } };
      },
      // after Play: a little playfulness hangs around
      playful(c) {
        const T = c.T, s = vary(c), side = c.side;
        const v = choosy(c, { wiggle: 0.5 + T.energy, tease: 0.1 + 1.4 * Math.max(0, T.grump - 0.35) + 0.4 * (1 - T.shyness), peek: 0.1 + 1.2 * Math.max(0, T.shyness - 0.35) });
        if (v === 'tease') return { variant: 'tease', dur: 2400 * vary(c, 0.1), phases: [0.08, 0.2, 0.6, 0.8], blinks: [[0.48, false]],
          after: [[0.8, 'playful', 0.3, 60000]],
          f(u) { const g = G(u, [[0, 0, 0], [0.12, 0.6 * side, 0.1], [0.36, 0.6 * side, 0.1], [0.42, 0, 0], [0.56, 0, 0], [0.62, 0.6 * side, 0.1], [0.8, 0.6 * side, 0.1], [0.94, 0, 0], [1, 0, 0]]), k = W(u, 0.08, 0.18, 0.78, 0.94);
            return { gx: g.x, gy: g.y, gw: 0.8 * k, up: 0.1 * k, low: 0.08 * k, tilt: -0.04 * side * k, x: 2 * side * k * s }; } };
        if (v === 'peek') return { variant: 'peek', dur: 2600 * vary(c, 0.1), phases: [0.08, 0.2, 0.6, 0.8], blinks: [[0.3, false]],
          after: [[0.8, 'playful', 0.25, 60000]],
          f(u) { const hide = W(u, 0.08, 0.2, 0.42, 0.5), peek = B(u, 0.62, 0.06);
            return { gx: -0.5 * side, gy: 0.4, gw: 0.6 * hide, x: -5 * side * hide * s + 2 * side * peek, y: 2 * hide, low: 0.15 * hide, up: 0.1 * hide, pupil: 0.15 * peek, glow: 0.06 * peek }; } };
        return { variant: 'wiggle', dur: 2200 * vary(c, 0.1), phases: [0.08, 0.2, 0.6, 0.8], blinks: [[0.75, false]],
          after: [[0.7, 'playful', 0.3, 60000]],
          f(u) { const k = W(u, 0.1, 0.2, 0.6, 0.78), sway = Math.sin(u * Math.PI * 6) * k, hop = B(u, 0.66, 0.04);
            return { tilt: 0.06 * sway * s, x: 2.5 * sway, y: -3 * hop, sy: 0.03 * hop, pupil: 0.12 * k, glow: 0.06 * k }; } };
      },
      // after Company: calm. A long breath, softer lids, one slow blink
      calm(c) {
        const s = vary(c);
        return { variant: 'settle', dur: 4400 * vary(c, 0.1), phases: [0.1, 0.24, 0.7, 0.86], blinks: [[0.6, true]],
          after: [[0.5, 'content', 0.5, 180000]],
          f(u) { const k = W(u, 0.08, 0.3, 0.72, 0.94), br = Math.sin(u * Math.PI * 2) * W(u, 0.1, 0.2, 0.8, 0.9);
            return { up: 0.17 * k * s, low: 0.08 * k, sy: 0.018 * br - 0.012 * k, sx: 0.01 * k, y: 1.5 * k, glow: 0.05 * k, gy: 0.12, gw: 0.4 * k }; } };
      },
      // something new went into its pupil: it peers in, and a mote of it circles inside the iris
      pocket(c) {
        const side = c.side, s = vary(c);
        return { variant: 'peer-in', dur: 2800 * vary(c, 0.1), phases: [0.08, 0.2, 0.66, 0.84], blinks: [[0.86, false]],
          after: [[0.6, 'curious', 0.25, 20000]],
          f(u) { const k = W(u, 0.08, 0.2, 0.66, 0.86), puls = Math.sin(u * Math.PI * 4) * k;
            return { gx: 0.05 * side, gy: 0.34, gw: 0.6 * k, tilt: 0.05 * side * k, pupil: 0.12 * k + 0.08 * puls * s, focus: 0.05 * k, y: 1 * k }; },
          iris(ctx, u, t, P) {
            const k = W(u, 0.14, 0.3, 0.7, 0.88) * (P.k || 1); if (k <= 0.01) return;
            const r = (P.irisRadius || 20) * 0.34, a0 = u * Math.PI * 3 * side;
            mote(ctx, P.gx + Math.cos(a0) * r, P.gy + Math.sin(a0) * r * 0.9, Math.max(2, (P.irisRadius || 20) * 0.09), P, 0.7 * k, 1.6);
          } };
      },
      // after Vision: it keeps looking at the room for a moment, focused and curious
      vision(c) {
        const side = c.side, s = vary(c);
        const look = [[0, 0, 0], [0.1, 0.5 * side, -0.05], [0.24, 0.5 * side, -0.05], [0.3, -0.35 * side, 0.1], [0.44, -0.35 * side, 0.1], [0.5, 0.1 * side, -0.35], [0.66, 0.1 * side, -0.35], [0.84, 0, 0], [1, 0, 0]];
        return { variant: 'look-around', dur: 3200 * vary(c, 0.1), phases: [0.06, 0.12, 0.66, 0.84], blinks: [[0.78, false]],
          after: [[0.6, 'curious', 0.3, 30000]],
          f(u) { const g = G(u, look), k = W(u, 0.04, 0.12, 0.72, 0.9), tilt = W(u, 0.5, 0.58, 0.68, 0.8);
            return { gx: g.x, gy: g.y, gw: 0.85 * k, pupil: -0.14 * k * s, focus: 0.06 * k, tilt: 0.05 * side * tilt, up: -0.04 * k }; } };
      }
    };
    function afterglowFor(kind, c) {
      switch (kind) {
        case 'arcade-best': return AFTER.pride(c, true);
        case 'battle-win': return AFTER.pride(c, true);
        case 'arcade-win': return AFTER.pride(c, false);
        case 'arcade-loss': return AFTER.frustration(c);
        case 'battle-loss': return AFTER.disappointment(c);
        case 'battle-draw': return AFTER.draw(c);
        case 'hangout': return AFTER.affection(c);
        case 'play': return AFTER.playful(c);
        case 'company': return AFTER.calm(c);
        case 'pocket-stored': return AFTER.pocket(c);
        case 'vision-scan': return AFTER.vision(c);
      }
      return null;
    }
    // called by direct(): returns true when an afterglow started (or was let go)
    function afterglow(t) {
      const p = X.pending;
      if (!p) return false;
      if (t > p.until) { X.pending = null; X.expired++; return false; }
      if (!canStart(t, true)) return false;
      const c = context(t);
      let b = null;
      try { b = afterglowFor(p.kind, c); } catch (e) { b = null; }
      if (!b) { X.pending = null; return false; }
      if (start(b, 'living', 'feel:' + p.kind, 'feel', t, c)) {
        X.pending = null; X.shown++;
        D.nextAt = Math.max(D.nextAt, t + b.dur + spacing(c));
        return true;
      }
      return false;
    }

    // ---------- playing a behaviour on the real body ----------
    let focused = true;
    addEventListener('blur', () => { focused = false; if (D.cur) end(now(), 'blur'); });
    addEventListener('focus', () => { focused = true; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (D.cur) end(now(), 'hidden'); } else focused = true; });
    // Android's own hide message doesn't change document.hidden: personality.hidden() is called for both
    if (host.personality && typeof host.personality.hidden === 'function') {
      const hiddenFn = host.personality.hidden;
      host.personality.hidden = (...a) => { if (D.cur) end(now(), 'hidden'); return hiddenFn(...a); };
    }
    function blockedReason(t) {
      if (!core.motion) return 'motion';
      if (!focused) return 'focus';
      const r = host.blocked ? host.blocked() : '';
      if (r) return r;
      if (core.mode === 'music' || core.mode === 'alert') return core.mode;
      if (core.state.media && core.state.media.playing && !core.state.media.hidden) return 'music';   // about to become music
      if (core.attention.active) return 'touch';
      return '';
    }
    function start(b, name, id, group, t, c) {
      if (!b) return false;
      const ok = core.react(name, t, false, { x: 0, y: 0 }, { script: {}, duration: Math.round(b.dur * (SPEED[E.current] && group !== 'greet' && group !== 'touch' ? mix(1, SPEED[E.current], emoK(E.current)) : 1)) });
      if (!ok || !core.reaction || core.reaction.name !== name) return false;
      D.cur = { id, group, b, token: core.reaction, at: t, lastOwned: t, last: null, fired: new Set(), ending: null, phase: 'motivation', variant: b.variant || null };
      D.started++;
      D.counts[id] = (D.counts[id] || 0) + 1;
      const v = b.variant && (b.variant === 'distracted' || b.variant === 'miss') ? b.variant : null;
      if (group === 'rare') remember(id);
      if (v === 'distracted') remember('distracted');
      S.history.push(id); if (S.history.length > 12) S.history.shift();
      S.last[id] = c ? c.wall : Date.now();
      D.log.push({ id, at: Math.round(t), variant: b.variant || null }); if (D.log.length > 40) D.log.shift();
      host.schedule && host.schedule();
      return true;
    }
    function end(t, reason) {
      const cur = D.cur;
      if (!cur || cur.ending) return;
      if (core.reaction === cur.token) { core.reaction = null; core.blendFrom = null; }
      cur.ending = { at: t, reason };
      if (reason === 'done') D.finished++; else D.interrupted++;
      if (core.nextGaze > t + 1500) core.nextGaze = t + 1500;
      // covered or gone (a panel, a scene, EYES hidden): no frame will show a fade, so let go of everything now
      if (/^(hidden|scene|panel|away)$/.test(reason)) { D.cur = null; D.cleaned++; D.nextAt = Math.max(D.nextAt, t + 20000 + rnd() * 20000); }
      host.schedule && host.schedule();
    }
    const phaseOf = (b, u) => { const p = b.phases || [0.1, 0.25, 0.65, 0.85]; return u < p[0] ? 'motivation' : u < p[1] ? 'anticipation' : u < p[2] ? 'action' : u < p[3] ? 'reaction' : 'recovery'; };

    function tick(t) {
      if (t - D.lastTick < 1000) return;
      D.lastTick = t;
      // signals from the phone itself
      const ch = !!core.state.charging, pl = !!core.state.media?.playing;
      if (D.charging !== null && ch !== D.charging) envSignal(ch ? 'plug' : 'unplug', t);
      if (D.playing !== null && pl !== D.playing) { if (!pl) { D.musicStoppedAt = t; impulse('content', 0.35, 60000); } else impulse('playful', 0.4, 60000); }
      D.charging = ch; D.playing = pl;
      if (core.state.battery >= 99 && core.state.charging && !D.fullNoted) { D.fullNoted = true; impulse('excited', 0.35, 5000); }
      if (!core.state.charging) D.fullNoted = false;
      if (t - D.weatherAt > 600000) {
        D.weatherAt = t;
        try { const WD = root.EyesWeatherData; const v = WD && WD.nowView(WD.readCache()); D.weather = v && v.available && v.cond ? String(v.cond.kind || '') : null; } catch (e) { D.weather = null; }
        if (D.weather && /rain|drizzle|storm|thunder|snow/.test(D.weather) && rnd() < 0.5) D.env = { id: 'sky', at: t + 3000 + rnd() * 20000, until: t + 120000 };
        // 5.0: occasional body language for the weather outside (cooldowns keep each one rare)
        let wx = null; try { wx = weatherFeel(t); } catch (e) { wx = null; }
        D.wxFeel = wx;
        const wxChance = { 'wx-storm': 0.6, 'wx-rain-soon': 0.5, 'wx-sunrise': 0.7, 'wx-cold': 0.4, 'wx-comfy': 0.3 }[wx] || 0;
        if (wx && (!D.env || (D.env.id === 'sky' && wx === 'wx-storm')) && rnd() < wxChance) D.env = { id: wx, at: t + 4000 + rnd() * 40000, until: t + 240000 };
      }
      // what it has seen happen to the body lately
      const r = core.reaction;
      if (r && r !== D.lastReaction) {
        D.lastReaction = r;
        const T = temper();
        if (r.name === 'pet') { impulse('content', 0.75, 60000); if (T.shyness > 0.55) impulse('shy', 0.45 * T.shyness, 15000); }
        else if (r.name === 'annoyed') impulse(T.grump > 0.5 ? 'mischievous' : 'shy', 0.45, 30000);
        else if (r.name === 'startle' || r.name === 'wake-wary') impulse('startled', 0.7, 1200);
        else if (r.name === 'greet-big') impulse('excited', 0.6, 8000);
        else if (r.name === 'notification' && r.important) { impulse('curious', 0.4, 20000); if (T.drama > 0.6) impulse('excited', 0.35, 4000); }
      }
      if (X.pending && t > X.pending.until) { X.pending = null; X.expired++; }   // 5.0: an unseen afterglow simply lapses
      updateEmotion(t);
      core.paceK = paceK();
      direct(t);
    }
    function paceK() {
      let k = 1;
      for (const e of EMOTIONS) k += emoK(e) * ((EXPR[e].pace || 1) - 1);
      return clamp(k, 0.6, 1.6);
    }
    function envSignal(kind, t) {
      const T = temper();
      if (kind === 'unplug' && rnd() < 0.45) D.env = { id: 'unplug', at: t + 2600, until: t + 15000 };
      else if (kind === 'plug') { impulse('content', 0.45, 60000); if (rnd() < 0.35 + 0.2 * (1 - T.energy)) D.env = { id: 'cozy', at: t + 2800, until: t + 15000 }; }
      else if (kind === 'notification') { impulse('curious', 0.3 + 0.3 * T.curiosity, 25000); if (rnd() < 0.3 + 0.2 * T.curiosity) D.env = { id: 'second-look', at: t + 2800, until: t + 12000 }; }
    }
    function canStart(t, soon) {   // soon (5.0): an afterglow may follow the owner's last touch sooner
      if (blockedReason(t)) return false;
      if (core.asleep || core.stage !== 'rest' || core.activeReaction(t)) return false;
      if (core.reaction && t < core.reaction.at) return false;
      if (window.HavenLife && HavenLife.busy && HavenLife.busy(t)) return false;
      if (root.EyesAbility && EyesAbility.busy && EyesAbility.busy(t)) return false;
      if (root.EyesVisits && EyesVisits.active && EyesVisits.active(t)) return false;
      if (t - D.lastOtherAt < (soon ? 2500 : 6000)) return false;                        // something else just happened: let it breathe
      if (t - Math.max(D.lastTouch, D.lastGreet) < (soon ? 1800 : 6000)) return false;   // the owner is busy with their phone
      if (core.state.battery <= 8 && !core.state.charging) return false;
      return true;
    }
    function direct(t) {
      const cur = D.cur;
      if (cur) return;
      if (X.pending && afterglow(t)) return;   // 5.0: what just happened comes first
      if (!canStart(t)) {
        if (D.env && t > D.env.until) D.env = null;
        if (D.nextAt < t + 3000) D.nextAt = t + 3000 + rnd() * 4000;
        return;
      }
      const c = context(t);
      if (D.env && t >= D.env.at) {
        const env = D.env; D.env = null;
        const d = byId[env.id];
        if (t <= env.until && d && eligible(d, c) && cooledDown(d, c, S.last)) { start(d.build(c), 'living', d.id, 'env', t, c); return; }
      }
      if (t < D.nextAt || t < S.quietUntil) return;
      const d = choose(S, c);
      if (!d) { D.nextAt = t + 15000 + rnd() * 25000; return; }
      const b = d.build(c);
      if (start(b, 'living', d.id, d.group, t, c)) D.nextAt = t + b.dur + spacing(c);
      else D.nextAt = t + 8000;
    }

    // ---------- every frame (from launcher draw) ----------
    function apply(model, t, ab) {
      if (!started) return;
      D.frames++;
      const dt = easeEmotion(t);
      const blocked = blockedReason(t) || (ab ? 'ability' : '') || (core.asleep ? 'asleep' : '');
      tick(t);
      // track other reactions, so the director never steps on their heels
      if (core.activeReaction(t) && !(D.cur && core.reaction === D.cur.token)) D.lastOtherAt = t;
      // expression: eased on/off so nothing ever snaps
      const want = !blocked && core.motion ? 1 : 0;
      E.fade += (want - E.fade) * (1 - Math.exp(-dt / (want ? 700 : 260)));
      if (!core.motion) E.fade = 0;
      if (E.fade > 0.002) express(model, t, E.fade * (core.gentle ? 0.6 : 1));
      // the current behaviour
      const cur = D.cur;
      if (!cur) return;
      if (!cur.ending) {
        const owned = core.reaction === cur.token && core.activeReaction(t);
        const ownTouch = cur.group === 'touch' && (blocked === 'touch' || blocked === 'iris');   // the finger that caught it
        if (blocked && blocked !== 'asleep' && owned && !ownTouch) end(t, 'yield:' + blocked);
        else if (!owned) {
          const u0 = (t - cur.token.at) / cur.token.duration;
          end(t, u0 >= 0.97 ? 'done' : 'interrupted');
        }
      }
      if (cur.ending) {
        const k = t - cur.lastOwned > 500 ? 0 : 1 - (t - cur.ending.at) / 220;   // frames stopped meanwhile: nothing to fade
        if (k <= 0 || !core.motion) { D.cur = null; D.cleaned++; D.nextAt = Math.max(D.nextAt, t + (cur.ending.reason === 'done' ? 0 : 20000 + rnd() * 20000)); return; }
        if (cur.last) offsets(model, cur.last, ease(k));
        cur.fx = ease(k);
        return;
      }
      const u = clamp((t - cur.token.at) / cur.token.duration);
      cur.lastOwned = t;
      cur.u = u;
      cur.phase = phaseOf(cur.b, u);
      const o = cur.b.f(u, t) || {};
      cur.last = o;
      cur.fx = 1;
      offsets(model, o, 1);
      // keyed blinks, emotional aftertastes, no idle saccades underneath, held stares
      if (cur.b.blinks) cur.b.blinks.forEach((bk, i) => { const key = 'b' + i; if (!cur.fired.has(key) && u >= bk[0]) { cur.fired.add(key); core.startBlink(t, !!bk[1]); } });
      if (cur.b.after) cur.b.after.forEach((a, i) => { const key = 'a' + i; if (!cur.fired.has(key) && u >= a[0]) { cur.fired.add(key); impulse(a[1], a[2], a[3]); } });
      core.nextGaze = Math.max(core.nextGaze, t + 400);
      if (cur.b.noBlink && u >= cur.b.noBlink[0] && u < cur.b.noBlink[1]) core.blink.next = Math.max(core.blink.next, t + 600);
    }
    function offsets(model, o, k) {
      const p = model.pose, e = model.eye || (model.eye = { upper: 0, lower: 0, pupil: 1 }), soft = core.gentle ? 0.4 : 1, lidK = core.gentle ? 0.8 : 1;
      p.x += (o.x || 0) * k * soft; p.y += (o.y || 0) * k * soft; p.tilt += (o.tilt || 0) * k * soft;
      p.sx += (o.sx || 0) * k * soft; p.sy += (o.sy || 0) * k * soft;
      p.glow += (o.glow || 0) * k; p.focus += (o.focus || 0) * k;
      if (o.gw) {
        const gw = clamp(o.gw) * k * (core.gentle ? 0.8 : 1), gy0 = model.gaze.y;
        model.gaze.x = clamp(mix(model.gaze.x, o.gx || 0, gw), -1, 1);
        model.gaze.y = clamp(mix(model.gaze.y, o.gy || 0, gw), -1, 1);
        e.upper = clamp((e.upper || 0) + (model.gaze.y - gy0) * 0.14);
        e.lower = clamp((e.lower || 0) - (model.gaze.y - gy0) * 0.07);
      }
      e.upper = clamp((e.upper || 0) + (o.up || 0) * k * lidK);
      e.lower = clamp((e.lower || 0) + (o.low || 0) * k * lidK);
      e.pupil = Math.max(0.3, (e.pupil || 1) * (1 + (o.pupil || 0) * k));
      if (o.light) model.light = Math.max(0.1, (model.light || 1) * (1 + o.light * k));
      if (o.energy && model.material) {
        model.material.activity = clamp((model.material.activity || 0) + o.energy * k * 0.6);
        model.material.pulse = clamp((model.material.pulse || 0) + o.energy * k);
      }
    }
    function express(model, t, k) {
      const T = temper(), gain = mix(0.65, 1.3, T.drama) * k, side = seedOf() & 1 ? 1 : -1, o = { up: 0, low: 0, pupil: 0, glow: 0, light: 0, x: 0, y: 0, sx: 0, sy: 0, tilt: 0, gx: 0, gy: 0, breath: 0 };
      for (const e of EMOTIONS) {
        const L = E.level[e]; if (L < 0.005) continue;
        const X = EXPR[e];
        for (const key in o) if (X[key]) o[key] += X[key] * L;
        if (X.sway) o.tilt += X.sway * L * Math.sin(t / 1100);
      }
      const p = model.pose, ey = model.eye || (model.eye = { upper: 0, lower: 0, pupil: 1 });
      p.x += o.x * gain; p.y += o.y * gain; p.tilt += o.tilt * gain * side; p.sx += o.sx * gain; p.sy += o.sy * gain; p.glow += o.glow * gain;
      ey.upper = clamp((ey.upper || 0) + o.up * gain); ey.lower = clamp((ey.lower || 0) + o.low * gain);
      ey.pupil = Math.max(0.3, (ey.pupil || 1) * (1 + o.pupil * gain));
      model.light = Math.max(0.1, (model.light || 1) * (1 + o.light * gain));
      // where its eyes like to rest (only nudges the resting gaze; a real look still wins)
      const free = !(core.activeReaction(t) && !(D.cur && core.reaction === D.cur.token)) && !core.attention.active;
      if (free) { model.gaze.x = clamp(model.gaze.x + o.gx * gain * side, -1, 1); model.gaze.y = clamp(model.gaze.y + o.gy * gain, -1, 1); }
      if (Number.isFinite(model.breathe)) model.breathe *= 1 + o.breath * gain;
    }
    function paint(ctx, P) {
      const cur = D.cur;
      if (!cur || !cur.b.paint || !core.motion) return;
      const k = cur.ending ? cur.fx || 0 : 1;
      if (k <= 0.01) return;
      const e = eye();
      ctx.save();
      if (!P.lowPower) ctx.globalCompositeOperation = 'screen';
      try { cur.b.paint(ctx, cur.ending ? cur.u || 0 : cur.u || 0, P.t, { ...P, hx: e.x, hy: e.y, k, w: innerWidth, h: innerHeight }); } catch (err) { /* a drawing glitch must never break the home screen */ }
      ctx.restore();
    }
    function paintIris(ctx, P) {
      const cur = D.cur;
      if (!cur || !cur.b.iris || !core.motion || (P.music || 0) > 0.05) return;
      const k = cur.ending ? cur.fx || 0 : 1;
      if (k <= 0.01) return;
      ctx.save();
      ctx.beginPath(); ctx.arc(P.gx, P.gy, P.irisRadius, 0, TAU); ctx.clip();
      if (!P.lowPower) ctx.globalCompositeOperation = 'screen';
      try { cur.b.iris(ctx, cur.u || 0, P.t, { ...P, k }); } catch (err) {}
      ctx.restore();
    }

    // ---------- the owner ----------
    addEventListener('pointerdown', (ev) => {
      const t = now();
      D.lastTouch = t;
      focused = true;   // a finger on the screen means the window has focus, whatever the last blur said
      const T = temper();
      if (T.shyness > 0.6 && rnd() < 0.25) impulse('shy', 0.25, 12000);
      const cur = D.cur;
      if (!cur || cur.ending || t - cur.lastOwned > 150) return;
      const e = eye(), d = Math.hypot(ev.clientX - e.x, ev.clientY - e.y), u = cur.u || 0, win = cur.b.touchWindow || [0.05, 0.9];
      const kind = cur.b.touch;
      end(t, kind && d < e.size * 1.9 && u >= win[0] && u <= win[1] ? 'caught' : 'touch');
      // caught in the act: its own response to you, ahead of the ordinary touch reaction
      if (kind && cur.ending.reason === 'caught' && core.motion) {
        const c = context(t);
        D.cur = null;
        if (start(TOUCHES[kind](c), 'living-caught', kind === 'pretend' ? 'pretend' : 'found', 'touch', t, c) && kind === 'pretend') remember('pretend');
      }
    }, { capture: true, passive: true });

    // ---------- recognition and reunion ----------
    function planReunion(awayMs) {
      const T = temper(), s = awayMs / 1000, hour = new Date().getHours(), c = { rng: rnd, gentle: !!core.gentle };
      const emo = E.current, L = emoK(emo);
      const boost = (name) => 1 + (emo === name ? 1.2 * L : 0);
      let options;
      if (s < 6) options = { none: 2.2, ack: 0.9 };
      else if (s < 300) options = { ack: 1.2, waiting: 0.9 * boost('content'), none: 0.5 };
      else if (s < 3600) options = { ack: 0.6 + 0.6 * T.grump, 'double-take': (0.4 + 0.6 * T.curiosity + 0.5 * T.drama) * boost('curious'), bounce: (0.3 + 0.9 * T.energy) * boost('playful'), 'shy-peek': (0.2 + 1.1 * T.shyness) * boost('shy'), waiting: 0.5 * boost('content') };
      else if (awayMs > 3 * 3600000 && hour >= 5 && hour < 12) options = { classic: 1 };   // the morning stretch and yawn stay
      else options = { classic: 1.1, enthusiastic: (0.6 + 0.5 * T.energy + 0.5 * T.drama) * boost('bored') * boost('excited'), 'double-take': 0.4 + 0.4 * T.drama, 'wake-slow': 1.6 * emoK('sleepy'), 'shy-peek': 0.4 * T.shyness };
      if (c.gentle) { if (options.bounce) { options.ack = (options.ack || 0) + options.bounce; delete options.bounce; } if (options.enthusiastic) { options.classic = (options.classic || 0) + options.enthusiastic; delete options.enthusiastic; } }
      const keys = Object.keys(options);
      return roulette(keys, keys.map((k) => options[k]), rnd);
    }
    addEventListener('haven:greet', (ev) => {
      const t = now(), awayMs = Number(ev && ev.detail && ev.detail.awayMs) || 0;
      D.lastGreet = t;
      focused = true;
      if (D.cur && !D.cur.ending) end(t, 'away');
      if (!started || !core.motion) { D.reunion = null; return; }
      const variant = planReunion(awayMs);
      D.reunion = { awayMs, at: t, variant };
      if (variant === 'waiting' && !core.asleep) {
        // it was already looking your way when you came back
        core.gaze = { x: 0, y: 0 }; core.gazeFrom = { x: 0, y: 0 }; core.gazeTarget = { x: 0, y: 0 };
        core.gazeAt = t; core.gazeDuration = 1; core.nextGaze = t + 2400;
      }
      if (awayMs > 3600000) impulse('excited', 0.25 + 0.3 * temper().drama, 6000);
    });
    function reunion(info) {
      let plan = D.reunion; D.reunion = null;
      if (!started || !core.motion) return false;
      // personality.js knows the real absence; plan again if the greet event didn't carry it
      if (info && Number.isFinite(info.awayMs) && (!plan || (plan.variant !== 'woke' && Math.abs((plan.awayMs || 0) - info.awayMs) > 5000)))
        plan = { awayMs: info.awayMs, variant: planReunion(info.awayMs) };
      if (!plan) return false;
      if (plan.variant !== 'woke' && info && (info.firstOfMorning || info.ritual)) return false;   // the morning stretch, a remembered ritual
      if (plan.variant === 'woke') return true;                    // already greeted by waking slowly
      if (plan.variant === 'classic') return false;                // personality.js keeps its own greetings
      if (plan.variant === 'none') return true;                    // a quiet return; the Eye just carries on
      if (info && info.wasAsleep) return false;
      const t = now(), c = { rng: rnd, gentle: !!core.gentle };
      const id = plan.variant, b = GREETS[id] && GREETS[id](c);
      if (!b) return false;
      if (b && start(b, 'living-greet', 'greet:' + id, 'greet', t, null)) { D.nextAt = Math.max(D.nextAt, t + 30000); return true; }
      return false;
    }
    function wakeSlowly(awayMs) {
      if (!started || !core.motion || !core.asleep) return false;
      const T = temper(), chance = clamp(0.25 + 0.5 * emoK('sleepy') + 0.3 * (1 - T.energy), 0, 0.85);
      if (rnd() >= chance) return false;
      core.sleep(false);
      const t = now();
      if (!start(GREETS['wake-slow'](), 'living-greet', 'greet:wake-slow', 'greet', t, null)) return false;
      D.reunion = { awayMs, at: t, variant: 'woke' };
      impulse('sleepy', 0.4, 30000);
      return true;
    }
    function signal(kind, data) {
      const t = now();
      if (kind === 'notifications') {
        const items = (data && data.items) || [];
        const before = D.unread;
        D.unread = items.length;
        if (items.length > before && D.knownN !== undefined) envSignal('notification', t);
        D.knownN = items.length;
      }
    }

    // ---------- simulation (tests): the same chooser, a virtual clock, many hours ----------
    function simulate(opts = {}) {
      const hours = opts.hours || 24, step = 1000, seed0 = opts.seed || 1;
      let s = seed0 >>> 0;
      const rng = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
      const T = opts.T || temper(), rareLast = {}, Sx = { history: [], last: {}, quietUntil: 0, decisions: 0, nothing: 0, rareLast };
      const counts = {}, seq = [];
      let tt = 0, next = 0, busyUntil = 0, wall = opts.wall || Date.now(), allRareAt = null;
      const emoFor = (h) => (h >= 22 || h < 7 ? 'sleepy' : h >= 12 && h < 18 ? (T.energy > 0.5 ? 'playful' : 'curious') : 'content');
      for (; tt < hours * 3600000; tt += step) {
        if (tt < busyUntil || tt < next || tt < Sx.quietUntil) continue;
        const hour = Math.floor(((opts.startHour || 9) + tt / 3600000) % 24), emo = emoFor(hour);
        const c = {
          t: tt, wall: wall + tt * (24 / (opts.idlePerDay || 24)), rng, T, emo, emoK: (e) => (e === emo ? 0.6 : 0), mood: { energy: 0.6, sleepiness: emo === 'sleepy' ? 0.6 : 0.2 },
          hour, lowPower: false, gentle: !!opts.gentle, w: 390, h: 844, eye: { x: 195, y: 413, size: 92 },
          sat: { x: 110, y: 330 }, icons: [{ x: 60, y: 780, left: 40, right: 80 }, { x: 130, y: 780, left: 110, right: 150 }, { x: 200, y: 780, left: 180, right: 220 }, { x: 270, y: 780, left: 250, right: 290 }, { x: 340, y: 780, left: 320, right: 360 }],
          clock: { x: 195, y: 70, left: 140, right: 250 }, battery: { x: 300, y: 110, left: 280, right: 320 }, date: null, chip: null,
          glint: null, unread: 0, weather: null, musicStoppedAt: -1e9, compact: false, landscape: false, side: 1, sleepy: emo === 'sleepy', mode: 'idle'
        };
        const d = choose(Sx, c);
        if (!d) { next = tt + 15000 + rng() * 25000; continue; }
        const b = d.build(c);
        counts[d.id] = (counts[d.id] || 0) + 1;
        if (b.variant === 'distracted') counts.distracted = (counts.distracted || 0) + 1;
        seq.push(d.id);
        Sx.history.push(d.id); if (Sx.history.length > 12) Sx.history.shift();
        Sx.last[d.id] = c.wall; if (d.group === 'rare') rareLast[d.id] = c.wall;
        if (allRareAt === null && DEFS.filter((x) => x.group === 'rare' && eligible(x, c)).every((x) => rareLast[x.id])) allRareAt = tt;
        busyUntil = tt + b.dur;
        next = tt + b.dur + spacing(c);
      }
      let maxRun = 1, run = 1;
      for (let i = 1; i < seq.length; i++) { run = seq[i] === seq[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
      return { hours, behaviours: seq.length, decisions: Sx.decisions, nothing: Sx.nothing, counts, maxRun, rare: seq.filter((id) => byId[id] && byId[id].group === 'rare').length, allRareHours: allRareAt === null ? null : Math.round(allRareAt / 360000) / 10, first: seq.slice(0, 30) };
    }

    const api = {
      apply, paint, paintIris, reunion, wakeSlowly, signal,
      experience,   // 5.0 (abilities call EyesFeel.report, which lands here)
      // a screen is taking over (a panel, Eye Contact...): let go now, before the frame loop pauses
      yieldNow: (reason) => { if (D.cur) end(now(), reason || 'yield'); },
      quiet: (t) => (t || now()) < S.quietUntil || !!(D.cur && !D.cur.ending),
      emotion: () => E.current,
      diagnostics: () => ({
        emotion: E.current, strength: Math.round(E.strength * 100) / 100,
        levels: Object.fromEntries(EMOTIONS.map((e) => [e, Math.round(E.level[e] * 100) / 100])),
        fade: Math.round(E.fade * 100) / 100, paceK: Math.round((core.paceK || 1) * 100) / 100,
        current: D.cur ? { id: D.cur.id, group: D.cur.group, phase: D.cur.phase, u: Math.round((D.cur.u || 0) * 100) / 100, ending: D.cur.ending ? D.cur.ending.reason : null, variant: D.cur.variant } : null,
        nextIn: Math.round((D.nextAt - now()) / 1000), quietFor: Math.max(0, Math.round((S.quietUntil - now()) / 1000)),
        frames: D.frames, started: D.started, finished: D.finished, interrupted: D.interrupted, cleaned: D.cleaned, decisions: S.decisions, nothing: S.nothing,
        counts: { ...D.counts }, history: S.history.slice(), log: D.log.slice(-12), unread: D.unread, weather: D.weather, wxFeel: D.wxFeel || null,
        blocked: blockedReason(now()), behaviours: DEFS.map((d) => d.id), rareSeen: { ...memory().seen },
        feel: { pending: X.pending ? { kind: X.pending.kind, age: Math.round((now() - X.pending.at) / 1000) } : null, reported: X.reported, shown: X.shown, expired: X.expired, kept: X.kept, log: X.log.slice(-8), impulses: Object.keys(E.impulses) }
      }),
      // test-only hooks (not reachable from any screen)
      _debug: {
        play(id, opts = {}) {
          const t = now(), c = context(t); if (opts.rng) c.rng = opts.rng;
          if (D.cur && !D.cur.ending) end(t, 'debug');
          D.cur = null;
          if (GREETS[id]) return start(GREETS[id](c), 'living-greet', 'greet:' + id, 'greet', t, c);
          if (TOUCHES[id]) return start(TOUCHES[id](c), 'living-caught', id, 'touch', t, c);
          const d = byId[id]; if (!d || (!opts.force && !eligible(d, c))) return false;
          const b = d.build(c); if (opts.variant) b.variant = opts.variant;
          return start(b, 'living', id, d.group, t, c);
        },
        build: (id) => { const c = context(now()); return byId[id] ? byId[id].build(c) : null; },
        eligible: (id) => { const c = context(now()); return byId[id] ? eligible(byId[id], c) : false; },
        feel(name, v = 1, tau = 60000) { impulse(name, v, tau); E.since = -1e9; updateEmotion(now()); },
        settle() { for (const e of EMOTIONS) E.level[e] = e === E.current ? E.strength : 0; },
        clearImpulses() { E.impulses = {}; },
        simulate, choose: (c) => choose(S, c), context: () => context(now()),
        state: () => D, defs: () => DEFS.map((d) => ({ id: d.id, group: d.group, cd: d.cd, gentle: d.gentle })),
        hold: (ms) => { D.nextAt = now() + ms; },
        quietNow: () => { S.quietUntil = 0; D.nextAt = 0; D.lastOtherAt = -1e9; D.lastTouch = -1e9; D.lastGreet = -1e9; },
        tick: () => { D.lastTick = -1e9; tick(now()); },
        afterglow(kind, opts = {}) { const t = now(), c = context(t); if (opts.rng) c.rng = opts.rng; if (opts.T) c.T = opts.T; if (D.cur && !D.cur.ending) end(t, 'debug'); D.cur = null; const b = afterglowFor(kind, c); return b ? (start(b, 'living', 'feel:' + kind, 'feel', t, c) ? b.variant : false) : null; },
        afterglowPlan(kind, T, seed) { let x = (seed >>> 0) || 1; const rng = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; const c = { ...context(now()), rng, T: T || temper() }; const b = afterglowFor(kind, c); if (!b) return null; let ok = true; const end0 = b.f(1, 0) || {}; for (const k in end0) if (Math.abs(end0[k] || 0) > 1e-3 && k !== 'gx' && k !== 'gy') ok = false; return { variant: b.variant, dur: Math.round(b.dur), endsAtRest: ok }; },
        feelState: () => X
      }
    };
    D.lastTouch = now(); D.lastGreet = now(); D.nextAt = now() + 20000 + rnd() * 20000;
    started = true;
    root.EyesLiving = api;
    if (root.EyesFeel && root.EyesFeel._attach) root.EyesFeel._attach(experience);
    return api;
  }
  root.createEyesLiving = createEyesLiving;
  // 5.0 · Emotional continuity. Any ability reports what just happened: EyesFeel.report(kind, data).
  //   arcade-win · arcade-best · arcade-loss · battle-win · battle-loss · battle-draw · hangout · play ·
  //   company · pocket-stored · vision-scan
  // The Living Eye feels it at once and shows it once it has the home screen back. A report made before the
  // Eye exists waits (at most four, for two minutes). Reporting never throws and never blocks the caller.
  const early = [];
  let sink = null;
  root.EyesFeel = {
    report(kind, data) {
      try {
        if (sink) return !!sink(String(kind), data || {});
        if (early.length < 4) early.push([String(kind), data || {}, Date.now()]);
      } catch (e) {}
      return false;
    },
    _attach(fn) { sink = fn; while (early.length) { const [k, d, at] = early.shift(); if (Date.now() - at < 120000) { try { fn(k, d); } catch (e) {} } } }
  };
  if (typeof module !== 'undefined') module.exports = { createEyesLiving };
})(typeof window === 'undefined' ? globalThis : window);
