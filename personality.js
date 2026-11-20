/* HAVEN personality: the mind behind the eye.
   - Temperament: five slow traits (energy, curiosity, sleepiness, missing you, contentment) that drift
     with the time of day and how he's treated, and quietly shape his blinks, glances and lids.
   - Idle habits: every minute or so of quiet he does one small thing that fits his mood.
   - Memory: greetings scale with how long you were gone; the first visit of the morning gets a stretch.
   - Touch: a slow circle around him is petting; rapid taps on the background annoy him.
   - Sleep: left alone at night, he dozes off, dreams a little, and wakes when something happens.
   The body (poses, lids, gaze) lives in presence.js; this file only decides what happens and when. */
(function (root) {
  'use strict';
  const KEY = 'haven.personality.v1',
    SLEEP_AFTER = 150000, // quiet time at night before he dozes off
    TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  // How sleepy he tends to be through the day (hour -> 0..1).
  const SLEEP_CURVE = [
    [0, 0.75],
    [3, 0.85],
    [6, 0.6],
    [8, 0.3],
    [10, 0.1],
    [14, 0.12],
    [17, 0.1],
    [20, 0.3],
    [22, 0.55],
    [23, 0.68],
    [24, 0.75]
  ];
  function curve(hour) {
    for (let i = 0; i < SLEEP_CURVE.length - 1; i++) {
      const [h0, v0] = SLEEP_CURVE[i],
        [h1, v1] = SLEEP_CURVE[i + 1];
      if (hour >= h0 && hour <= h1) return v0 + ((v1 - v0) * (hour - h0)) / (h1 - h0);
    }
    return 0.3;
  }
  function createPersonality({ core, read, save, now, eye, schedule, random = Math.random }) {
    const saved = read(KEY, null) || {};
    const mood = {
      energy: 0.6,
      curiosity: 0.5,
      sleepiness: 0.2,
      missing: 0,
      content: 0.5,
      ...(saved.mood || {})
    };
    let lastSeen = Number(saved.lastSeen) || Date.now(),
      lastPoke = now(),
      nextHabit = now() + 40000,
      lastTick = now(),
      taps = [],
      annoyedAt = -1e9,
      circle = null,
      suppressEyeTapUntil = 0,
      lastDream = 0,
      habitsDone = 0,
      greetTimer = 0,
      sleepAfter = SLEEP_AFTER,
      holdTouchUntil = 0;
    const persist = () => save(KEY, { mood: { ...mood }, lastSeen });
    const hourNow = () => {
      const d = new Date();
      return d.getHours() + d.getMinutes() / 60;
    };
    // Touch reactions may interrupt his ordinary touch response; only music, alerts and Motion Off stop them.
    const touchable = () =>
      core.motion && core.mode !== 'music' && core.mode !== 'alert' && !core.asleep;
    const free = () =>
      core.motion &&
      core.stage === 'rest' &&
      core.mode !== 'music' &&
      core.mode !== 'alert' &&
      !core.attention.active;

    // ---------- Temperament ----------
    function drift(dtMs) {
      const hour = hourNow(),
        tiredBattery = core.state.battery <= 20 && !core.state.charging ? 0.2 : 0,
        k = (tau) => 1 - Math.exp(-dtMs / tau);
      // Its DNA temperament sets where its moods like to rest (sleepy, curious, grumpy...).
      const dnaBias = root.HavenDNA ? root.HavenDNA.bias() : { sleep: 0, curious: 0, content: 0 };
      const sleepyTarget = clamp(curve(hour) + tiredBattery + dnaBias.sleep);
      const morning = hour >= 7 && hour < 11 ? 0.12 : 0;
      mood.sleepiness += (sleepyTarget - mood.sleepiness) * k(20 * 60000);
      mood.energy += (clamp(0.9 - 0.8 * mood.sleepiness + morning) - mood.energy) * k(20 * 60000);
      mood.curiosity +=
        (clamp(0.4 + (hour >= 12 && hour < 18 ? 0.2 : 0) - 0.2 * mood.sleepiness + dnaBias.curious) -
          mood.curiosity) *
        k(10 * 60000);
      const contentTarget =
        0.5 + (core.state.charging ? 0.1 : 0) + (core.state.media?.playing ? 0.1 : 0) + dnaBias.content;
      mood.content += (contentTarget - mood.content) * k(15 * 60000);
      mood.missing += (0 - mood.missing) * k(3 * 60000);
      core.setMood(mood);
    }
    function nudge(changes) {
      for (const [key, d] of Object.entries(changes)) mood[key] = clamp(mood[key] + d);
      core.setMood(mood);
    }

    // ---------- Idle habits ----------
    function pickHabit() {
      const night = mood.sleepiness > 0.5;
      const options = [
        ['look-around', 0.4 + mood.curiosity],
        ['firefly', 0.25 + mood.curiosity * mood.energy],
        ['stretch', 0.25 + (hourNow() < 11 ? 0.3 : 0)],
        ['yawn', night ? 0.4 + mood.sleepiness : 0.05],
        ['sigh', 0.15 + 0.6 * Math.max(0, mood.content - 0.4)]
      ];
      let total = options.reduce((s, o) => s + o[1], 0),
        r = random() * total;
      for (const [name, w] of options) if ((r -= w) <= 0) return name;
      return 'look-around';
    }
    function habit(t) {
      if (!free() || core.activeReaction(t) || core.asleep) return false;
      const name = pickHabit();
      core.react(name, t);
      habitsDone++;
      schedule();
      return name;
    }

    // ---------- Sleep ----------
    function canSleep(t) {
      return (
        free() && !core.state.media?.playing && mood.sleepiness > 0.55 && t - lastPoke > sleepAfter
      );
    }
    function fallAsleep() {
      if (core.asleep) return;
      core.sleep(true);
      schedule();
    }
    function wake(how = 'stir') {
      if (!core.asleep) return false;
      core.sleep(false);
      core.react(how, now());
      // The tap that woke him shouldn't replace the startle with an ordinary touch reaction.
      holdTouchUntil = now() + 900;
      nudge({ energy: how === 'startle' ? 0.08 : 0.03 });
      schedule();
      return true;
    }

    // ---------- Greeting memory ----------
    function greet(t) {
      const awayMs = Date.now() - lastSeen,
        hour = hourNow(),
        lastHour = new Date(lastSeen).getHours(),
        sameDay = new Date(lastSeen).toDateString() === new Date().toDateString();
      lastSeen = Date.now();
      lastPoke = t;
      persist();
      if (root.HavenDNA) root.HavenDNA.note('visit');
      try { root.dispatchEvent(new CustomEvent('haven:greet')); } catch (e) {}
      if (core.asleep) wake('stir');
      const firstOfMorning =
        hour >= 5 && hour < 12 && awayMs > 3 * 3600000 && (!sameDay || lastHour < 4);
      clearTimeout(greetTimer);
      // Let the pop-out-of-the-app animation finish first.
      // Wait until the app-return animation finishes. The new director protects
      // that animation from being interrupted by a lower-priority greeting.
      const delay = core.reaction?.name === 'welcome'
        ? Math.max(300, core.reaction.at + core.reaction.duration - now() + 140)
        : 680;
      greetTimer = setTimeout(() => {
        const at = now();
        if (!core.motion) return;
        if (firstOfMorning) {
          core.react('stretch', at);
          setTimeout(() => core.react('yawn', now()), 1750);
          nudge({ missing: 0.4 });
        } else if (awayMs > 60 * 60000) {
          // More than an hour away: a real welcome, bigger the longer you were gone.
          core.react('greet-big', at, awayMs > 6 * 3600000);
          nudge({ missing: clamp(awayMs / (6 * 3600000)), energy: 0.1, content: 0.08 });
        }
        schedule();
      }, delay);
    }
    function hidden() {
      lastSeen = Date.now();
      persist();
    }

    // ---------- Touch ----------
    // Petting: a slow circle drawn around him. Annoyance: rapid taps on the empty background.
    function pointer(type, e) {
      const t = now(),
        c = eye();
      lastPoke = t;
      if (type === 'down') {
        if (core.asleep) {
          wake('startle');
          suppressEyeTapUntil = t + 500;
          return;
        }
        const d = Math.hypot(e.clientX - c.x, e.clientY - c.y);
        circle =
          d < c.size * 2.2
            ? {
                angle: Math.atan2(e.clientY - c.y, e.clientX - c.x),
                total: 0,
                at: t,
                done: false,
                id: e.pointerId
              }
            : null;
        const onBackground = !e.target?.closest?.(
          'button, a, input, select, textarea, .sheet, #coreHit, #irisGlint'
        );
        if (onBackground && d > c.size * 1.3) {
          taps = taps.filter((x) => t - x < 1600);
          taps.push(t);
          if (taps.length >= 4 && t - annoyedAt > 6000 && touchable()) {
            annoyedAt = t;
            taps = [];
            core.react('annoyed', t, false, { x: e.clientX > c.x ? 1 : -1, y: 0 });
            if (root.HavenDNA) root.HavenDNA.note('poke');
            holdTouchUntil = t + 1300;
            nudge({ content: -0.15 });
            schedule();
          }
        }
      } else if (type === 'move' && circle && !circle.done && e.pointerId === circle.id) {
        const d = Math.hypot(e.clientX - c.x, e.clientY - c.y);
        if (d < c.size * 0.35 || d > c.size * 2.4 || t - circle.at > 3200) {
          circle = null;
          return;
        }
        const a = Math.atan2(e.clientY - c.y, e.clientX - c.x);
        let delta = a - circle.angle;
        if (delta > Math.PI) delta -= TAU;
        if (delta < -Math.PI) delta += TAU;
        circle.total += delta;
        circle.angle = a;
        if (Math.abs(circle.total) > TAU * 0.85) {
          circle.done = true;
          suppressEyeTapUntil = t + 600;
          if (touchable()) {
            core.react('pet', t);
            if (root.HavenDNA) root.HavenDNA.note('pet');
            holdTouchUntil = t + 1300;
            nudge({ content: 0.25, missing: -0.2, energy: 0.04 });
            schedule();
          }
        }
      } else if (type === 'up' || type === 'cancel') {
        if (circle?.done) suppressEyeTapUntil = t + 400;
        circle = null;
      }
    }

    // Anything happening while he sleeps wakes him: touches startle him, everything else stirs him.
    for (const method of ['react', 'touch', 'notice', 'watch', 'follow']) {
      const original = core[method].bind(core);
      core[method] = (...args) => {
        if (core.asleep && !(method === 'react' && args[0] === 'dream')) {
          wake(method === 'touch' ? 'startle' : 'stir');
          if (method === 'touch') return;
        }
        if (method !== 'react') lastPoke = now();
        if (method === 'touch' && now() < holdTouchUntil) return;
        return original(...args);
      };
    }
    const originalRequest = core.request.bind(core);
    core.request = (event, t) => {
      if (core.asleep && ['notification', 'call', 'alarm', 'timer', 'music'].includes(event?.kind))
        wake('stir');
      return originalRequest(event, t);
    };

    // ---------- Heartbeat: once a second ----------
    function tick() {
      const t = now(),
        dt = Math.min(60000, t - lastTick);
      lastTick = t;
      if (document.hidden) return;
      drift(dt);
      if (core.asleep) {
        if (!core.motion || core.mode === 'music' || core.mode === 'alert' || mood.sleepiness < 0.4)
          wake('stir');
        else if (t - lastDream > 9000 && random() < 0.12) {
          lastDream = t;
          core.react('dream', t);
          schedule();
        }
        return;
      }
      if (canSleep(t)) return fallAsleep();
      if (t >= nextHabit) {
        if (t - lastPoke > 12000) habit(t);
        // Busier when energetic, rarer when sleepy.
        nextHabit = t + (45000 + random() * 65000) / (0.6 + 0.6 * mood.energy);
      }
    }
    setInterval(tick, 1000);
    setInterval(persist, 60000);
    core.setMood(mood);
    return {
      pointer,
      greet,
      hidden,
      wake,
      habit,
      nudge,
      poke: () => (lastPoke = now()),
      eyeTapSuppressed: () => now() < suppressEyeTapUntil,
      sleepNow: () => fallAsleep(),
      setSleepAfter: (ms) => (sleepAfter = ms),
      diagnostics: () => ({
        mood: Object.fromEntries(
          Object.entries(mood).map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),
        asleep: core.asleep,
        habitsDone,
        quietFor: Math.round((now() - lastPoke) / 1000),
        nextHabitIn: Math.round((nextHabit - now()) / 1000)
      })
    };
  }
  root.createPersonality = createPersonality;
  if (typeof module !== 'undefined') module.exports = { createPersonality };
})(typeof window === 'undefined' ? globalThis : window);
