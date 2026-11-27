/* One clock, one body, one attention sequence. No autonomous CSS animation. */
(function (root) {
  'use strict';
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
  const ease = (x) => {
    x = clamp(x);
    return x * x * x * (x * (x * 6 - 15) + 10);
  };
  const mix = (a, b, t) => a + (b - a) * t;
  // Keep one reaction channel, but arbitrate it deliberately. Background habits must not
  // stomp on a user's gesture, a link signal, or an actual phone alert.
  const PRIORITY = Object.freeze({
    call: 100, alarm: 100, timer: 95,
    pickup: 87, place: 87, release: 87, launch: 87, welcome: 87,
    previous: 85, next: 85, transport: 85, choose: 84,
    touch: 76, pet: 78, annoyed: 78, startle: 82,
    'link-receive': 84, 'link-spark-in': 84, 'link-calm-in': 84,
    'link-resonance': 85, 'link-send': 80, 'link-spark-out': 80,
    'link-calm-out': 80, 'link-hello': 82,
    notification: 81, peek: 76,
    inspect: 60, anticipate: 60, reach: 63, folder: 68, unfold: 68, fold: 68, merge: 68,
    charge: 56, full: 56, low: 56, music: 55, morning: 52,
    'greet-big': 52, 'greet-familiar': 52, stir: 62,
    'anticipate-pet': 54, 'wake-wary': 82,
    // 4.4 Distant Visit: above idle habits and greetings, below music, power states, gestures and alerts,
    // so anything real that happens takes the body back (eyes-visits.js then lets the visitor go)
    visit: 54,
    idle: 25, night: 25,
    'look-around': 12, firefly: 12, stretch: 12, yawn: 12, sigh: 12, dream: 8,
    // 4.8 The Living Eye (eyes-living.js): its own idle sequences sit below every real event; its greetings sit
    // with the greetings; being caught in the act by your touch sits just above an ordinary touch
    living: 14, 'living-greet': 52, 'living-caught': 77
  });
  const priorityOf = (name) => PRIORITY[name] || 35;
  // 4.4: a scripted reaction carries keyframes per channel ([[u, {ch: value}], …], u = 0..1). Between two keys the
  // value eases (smootherstep); a channel a key doesn't mention is 0 there. Used by Distant Visits.
  function sampleKeys(keys, u) {
    if (!keys || !keys.length) return null;
    if (u <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [a0, av] = keys[i], [b0, bv] = keys[i + 1];
      if (u <= b0) {
        const k = ease((u - a0) / Math.max(0.0001, b0 - a0)), out = {};
        for (const c of new Set([...Object.keys(av), ...Object.keys(bv)])) out[c] = mix(av[c] || 0, bv[c] || 0, k);
        return out;
      }
    }
    return keys[keys.length - 1][1];
  }
  // Too big or too quick for someone who asked their phone for less motion.
  const GENTLE_SKIP = new Set(['look-around', 'firefly', 'startle']);
  const colors = {
    idle: [111, 193, 202],
    night: [87, 136, 164],
    low: [104, 139, 159],
    charge: [123, 207, 186],
    full: [162, 219, 206],
    alert: [238, 181, 127]
  };
  function profile(state) {
    return {
      fps: state.battery <= 8 ? 12 : state.saver || state.battery <= 20 ? 15 : 30,
      period: state.battery <= 20 ? 8500 : state.hour >= 21 || state.hour < 6 ? 7600 : 5400
    };
  }
  // The imaginary firefly he sometimes watches, in eye units (x right, y down; the eye is about 1 across).
  function fireflyAt(u) {
    return {
      x: 1.35 - 2.9 * u + 0.38 * Math.sin(u * Math.PI * 3),
      y: -0.45 + 0.55 * Math.sin(u * Math.PI * 2.2) - 0.35 * u
    };
  }
  function mode(state) {
    if (!state.media?.hidden && (state.media?.playing || state.media?.holdUntil > Date.now()))
      return 'music';
    if (state.battery <= 20 && !state.charging) return 'low';
    if (state.battery >= 99) return 'full';
    if (state.charging) return 'charge';
    if (state.hour >= 21 || state.hour < 6) return 'night';
    return 'idle';
  }
  class Presence {
    constructor(present = () => {}, random = Math.random) {
      this.present = present;
      this.random = random;
      this.state = {
        battery: 75,
        charging: false,
        saver: false,
        hour: 12,
        media: { playing: false }
      };
      this.motion = true;
      // Gentle: the phone asks for reduced motion. He still blinks, breathes and looks around,
      // but slowly: no darting glances, no bouncing, no big personality acts.
      this.gentle = false;
      this.hidden = false;
      this.mode = 'idle';
      this.desired = 'idle';
      this.stage = 'rest';
      this.event = null;
      this.started = 0;
      this.time = 0;
      this.freezeTime = 0;
      this.gaze = { x: 0, y: 0 };
      this.gazeFrom = { x: 0, y: 0 };
      this.gazeTarget = { x: 0.45, y: -0.2 };
      this.gazeAt = 900;
      this.gazeDuration = 1800;
      this.nextGaze = 900;
      this.gazes = 0;
      this.value = { music: 0, light: 1, r: 111, g: 193, b: 202, lift: 0, energy: 0 };
      this.from = { ...this.value };
      this.to = { ...this.value };
      this.history = [];
      this.ripple = null;
      this.until = 0;
      this.reaction = null;
      this.blendFrom = null;
      this.lastPetAt = -Infinity;
      this.petCount = 0;
      this.attention = { active: false, x: 0, y: 0, at: 0 };
      this.attentionEvents = [];
      this.curiosity = { target: null, at: 0, x: 0, y: 0 };
      // Living-eye layer: lids, blinks, saccades, micro-saccades and a pupil that breathes.
      this.gazeKind = 'smooth';
      this.micro = { x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, at: 0, next: 600 };
      this.blink = { at: -10000, close: 70, hold: 30, open: 170, next: 2400, again: false };
      this.lids = { upper: 0.1, lower: 0.02 };
      this.pupil = 1;
      this.lastSample = 0;
      // Personality layer (driven by personality.js): a slow temperament, and sleep.
      this.mood = { energy: 0.6, curiosity: 0.5, sleepiness: 0.2, missing: 0, content: 0.5 };
      this.asleep = false;
      this.sleepK = 0;
      // 4.4 (review item 5): no mechanical rhythms. Home glances come every 4–7 looks (mood-shaped), and
      // pet responses are chosen, never cycled.
      this.sinceHome = 0;
      this.homeEvery = 5;
      this.lastPetVariant = -1;
    // 4.8: how its feelings stretch or quicken the time between idle glances (eyes-living.js). 1 = unchanged.
    this.paceK = 1;
      // 4.4 (review item 3): blinks while music plays, on a phrase boundary of the beat (launcher → musicBeat)
      this.music = { next: 0, touch: false, lastBeat: 0 };
    }
    setMood(mood) {
      this.mood = { ...this.mood, ...mood };
    }
    sleep(on) {
      this.asleep = Boolean(on) && this.motion;
      if (this.asleep) this.reaction = null;
    }
    target(next) {
      let key = next === 'music' ? 'idle' : next;
      const c = colors[key] || colors.idle;
      const night = this.state.hour >= 21 || this.state.hour < 6;
      const tired = this.state.battery <= 20 && !this.state.charging;
      let light = next === 'low' ? 0.59 : next === 'night' ? 0.66 : next === 'full' ? 1.12 : 1;
      if (next !== 'alert') {
        if (night && next !== 'night') light *= 0.68;
        if (tired && next !== 'low') light *= 0.65;
      }
      return {
        music: next === 'music' ? 1 : 0,
        light,
        r: c[0],
        g: c[1],
        b: c[2],
        lift: 0,
        energy: next === 'charge' ? 1 : next === 'alert' ? 1.7 : this.state.charging ? 0.6 : 0
      };
    }
    setGentle(on) {
      on = Boolean(on);
      if (this.gentle === on) return;
      this.gentle = on;
      if (on && this.reaction && GENTLE_SKIP.has(this.reaction.name)) {
        this.reaction = null;
        this.blendFrom = null;
      }
    }
    setMotion(on, t) {
      if (this.motion === on) return;
      this.tick(t);
      this.motion = on;
      this.freezeTime = t;
      this.ripple = null;
      if (!on) {
        this.reaction = null;
        this.blendFrom = null;
        this.attention.active = false;
        this.micro.x = this.micro.y = this.micro.tx = this.micro.ty = 0;
        this.blink.at = -10000;
      }
      if (!on) {
        this.value = this.target(this.desired);
        this.mode = this.desired;
        this.stage = 'rest';
        if (this.event) this.present(this.event, this.mode);
        this.event = null;
        this.gazeFrom = { ...this.gaze };
        this.gazeTarget = { ...this.gaze };
      } else {
        this.nextGaze = t + 800;
        this.gazeAt = t;
        this.gazeFrom = { ...this.gaze };
      }
    }
    update(state, t) {
      const before = mode(this.state);
      const oldCharging = this.state.charging;
      const oldNight = this.state.hour >= 21 || this.state.hour < 6,
        oldTired = this.state.battery <= 20 && !this.state.charging;
      this.state = { ...this.state, ...state };
      const next = mode(this.state);
      this.desired = next;
      const contextChanged =
        oldCharging !== this.state.charging ||
        oldNight !== (this.state.hour >= 21 || this.state.hour < 6) ||
        oldTired !== (this.state.battery <= 20 && !this.state.charging);
      if ((before !== next || contextChanged) && this.mode !== 'alert')
        this.request(
          {
            kind: 'state',
            mode: next,
            vector:
              next === 'music'
                ? { x: 0.4, y: 0.1 }
                : next === 'charge'
                  ? { x: 0, y: 0.65 }
                  : { x: 0, y: 0 },
            important: next === 'music'
          },
          t
        );
    }
    request(event, t) {
      this.tick(t);
      const urgent = ['call', 'alarm', 'timer'].includes(event.kind);
      if (this.event && ['call', 'alarm', 'timer'].includes(this.event.kind) && !urgent) return;
      if (this.mode === 'alert' && t < this.until && !urgent) return;
      if (event.kind === 'state' && this.event?.kind === 'state' && event.mode === this.event.mode)
        return;
      // Attention leads the animation: gaze starts now, expression follows shortly after.
      // Alerts still respond almost immediately; gentle state changes take their time.
      this.react(
        event.kind === 'state' ? event.mode : event.kind,
        t,
        event.important,
        event.vector,
        { delay: urgent ? 75 : event.kind === 'notification' ? 220 : 130 }
      );
      this.from = { ...this.value };
      this.event = { ...event };
      this.started = t;
      this.stage = this.motion ? 'notice' : 'rest';
      this.gazeFrom = { ...this.gaze };
      this.gazeKind = 'smooth';
      this.gazeTarget = event.vector || { x: 0, y: -0.85 };
      this.gazeAt = t;
      this.gazeDuration = this.motion ? 260 : 0;
      const next = urgent ? 'alert' : event.mode || this.desired;
      this.to = this.target(next);
      this.to.lift = 0;
      this.history.push({ kind: event.kind, at: t, mode: next, presentAt: null });
      if (this.history.length > 60) this.history.shift();
      if (!this.motion) {
        this.value = { ...this.to };
        this.mode = next;
        this.history[this.history.length - 1].presentAt = t;
        this.present(event, next);
        this.event = null;
        this.until = urgent ? t + 5500 : 0;
      }
    }
    aim(x, y, t, duration = 230) {
      if (!this.motion) return;
      if (this.gentle) duration = Math.max(420, duration * 2.4);
      this.gazeKind = 'smooth';
      this.gazeFrom = { ...this.gaze };
      this.gazeTarget = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
      this.gazeAt = t;
      this.gazeDuration = duration;
      this.nextGaze = t + 1050;
    }
    touch(x, y, t) {
      this.request({ kind: 'touch', vector: { x: clamp(x, -1, 1), y: clamp(y, -1, 1) } }, t);
    }
    // These reactions are deliberately separate from state changes. Looking at a dragged
    // icon must never interrupt music, charging or an important notification.
    notice(kind, x, y, t) {
      if (!this.motion) return;
      const vector = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
      this.aim(vector.x, vector.y, t, 165);
      this.react(kind, t, false, vector);
      this.attentionEvents.push({ kind, at: t, vector });
      if (this.attentionEvents.length > 30) this.attentionEvents.shift();
    }
    // Attention toward a real, visible target. Ignore incidental idle motion.
    watch(target, x, y, t) {
      if (!this.motion || this.attention.active) return;
      const nx = clamp(x, -1, 1),
        ny = clamp(y, -1, 1),
        same = this.curiosity.target === target;
      const recently = t - this.curiosity.at < 450;
      this.curiosity = { target, at: t, x: nx, y: ny };
      this.gazeKind = 'smooth';
      this.gazeFrom = { ...this.gaze };
      this.gazeTarget = { x: nx, y: ny };
      this.gazeAt = t;
      this.gazeDuration = this.gentle ? (same ? 650 : 520) : same ? 270 : 190;
      this.nextGaze = t + (this.gentle ? 2200 : 1450);
      if (!same && !recently) {
        this.react('inspect', t, false, { x: nx, y: ny });
        this.attentionEvents.push({ kind: 'inspect', at: t, vector: { x: nx, y: ny }, target });
        if (this.attentionEvents.length > 30) this.attentionEvents.shift();
      }
    }
    follow(x, y, t) {
      if (!this.motion) return;
      const vector = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
      if (!this.attention.active) {
        this.attention = { active: true, x: vector.x, y: vector.y, at: t };
        this.react('pickup', t, false, vector);
        this.attentionEvents.push({ kind: 'pickup', at: t, vector });
        if (this.attentionEvents.length > 30) this.attentionEvents.shift();
      } else {
        this.attention.x = vector.x;
        this.attention.y = vector.y;
      }
      this.aim(vector.x, vector.y, t, 135);
      this.nextGaze = t + 1800;
    }
    releaseFollow(t, placed = true) {
      if (!this.attention.active) return;
      const { x, y } = this.attention;
      this.attention.active = false;
      this.attention.at = t;
      this.aim(x * 0.35, y * 0.35, t, 340);
      this.nextGaze = t + 1400;
      this.react(placed ? 'place' : 'release', t, false, { x, y });
      this.attentionEvents.push({ kind: placed ? 'place' : 'release', at: t, vector: { x, y } });
      if (this.attentionEvents.length > 30) this.attentionEvents.shift();
    }
    tick(t) {
      this.time = t;
      if (!this.motion) return this.value;
      if (this.stage === 'notice') {
        const elapsed = t - this.started;
        const important =
          this.event.important || ['call', 'alarm', 'timer'].includes(this.event.kind);
        const peak = important ? 1 : 0.3;
        // A small, damped overshoot in the body. The pupil never closes or blinks.
        this.value.lift =
          peak *
          (elapsed < 260 ? ease(elapsed / 260) * 1.1 : mix(1.1, 1, ease((elapsed - 260) / 190)));
        if (elapsed >= 450) {
          this.stage = 'morph';
          this.morphAt = t;
          this.from = { ...this.value };
          this.mode = ['call', 'alarm', 'timer'].includes(this.event.kind)
            ? 'alert'
            : this.event.mode || this.desired;
          this.to = this.target(this.mode);
          this.until = this.mode === 'alert' ? t + 5500 : 0;
          const h = this.history[this.history.length - 1];
          if (h) h.presentAt = t;
          this.present(this.event, this.mode);
          this.event = null;
        }
      }
      if (this.stage === 'morph') {
        const u = ease((t - this.morphAt) / 420);
        for (const k of Object.keys(this.value)) this.value[k] = mix(this.from[k], this.to[k], u);
        if (t - this.morphAt >= 420) {
          this.value = { ...this.to };
          this.stage = 'rest';
          this.nextGaze = t + 1500;
        }
      }
      if (this.mode === 'alert' && this.stage === 'rest' && t >= this.until) {
        this.mode = this.desired;
        this.until = 0;
        this.request({ kind: 'state', mode: this.desired, vector: { x: 0, y: 0 } }, t);
      }
      if (this.asleep) this.nextGaze = Math.max(this.nextGaze, t + 400);
      if (this.stage === 'rest' && !this.attention.active && t >= this.nextGaze) {
        this.curiosity.target = null;
        this.gazes++;
        this.gazeFrom = { ...this.gaze };
        const slow = this.state.battery <= 20 || this.state.hour >= 21 || this.state.hour < 6;
        // Mostly glance between nearby points, sometimes look far away, sometimes come back to you.
        const home = ++this.sinceHome >= this.homeEvery,
          far = !home && !this.gentle && this.random() < 0.15 + 0.3 * this.mood.curiosity;
        const reach = this.gentle ? 0.4 : far ? 1 : 0.55;
        this.gazeTarget = home
          ? { x: (this.random() - 0.5) * 0.12, y: (this.random() - 0.5) * 0.1 }
          : {
              x: clamp(this.gaze.x * 0.35 + (this.random() - 0.5) * 1.5 * reach, -0.8, 0.8),
              y: clamp(this.gaze.y * 0.35 + (this.random() - 0.5) * 1.1 * reach, -0.6, 0.6)
            };
        if (home) {
          // missing you brings it back sooner; a curious Eye wanders longer before it checks in
          this.sinceHome = 0;
          this.homeEvery = Math.round(clamp(4 + this.random() * 3 - 1.5 * (this.mood.missing || 0) + 1.2 * (this.mood.curiosity - 0.5), 3, 8));
        }
        this.gazeAt = t;
        const jump = Math.hypot(this.gazeTarget.x - this.gaze.x, this.gazeTarget.y - this.gaze.y);
        if (this.gentle) {
          // Drifts to the next spot instead of snapping there.
          this.gazeKind = 'smooth';
          this.gazeDuration = 1300 + jump * 1400;
        } else if (slow && this.random() < 0.45) {
          this.gazeKind = 'smooth';
          this.gazeDuration = 2400;
        } else {
          this.gazeKind = 'saccade';
          this.gazeDuration = (95 + jump * 70) * (typeof HavenDNA !== 'undefined' ? HavenDNA.motion().snap : 1);
        }
        // Big eye movements often carry a blink with them.
        if (this.mode !== 'music' && !this.gentle && jump > 0.6 && this.random() < 0.3 && t - this.blink.at > 1400) this.startBlink(t + 20);
        // Curious: glances more often. Sleepy: lingers.
        const dnaMotion = typeof HavenDNA !== 'undefined' ? HavenDNA.motion() : null;
        const pace =
          (1.35 - 0.7 * this.mood.curiosity) * (1 + 0.5 * this.mood.sleepiness) * (dnaMotion ? dnaMotion.gazePace : 1) * (this.paceK || 1);
        this.nextGaze = t + ((slow ? 3600 : 1500) + this.random() * (slow ? 3000 : 2600)) * pace * (this.gentle ? 1.7 : 1);
      }
      const g = clamp((t - this.gazeAt) / Math.max(1, this.gazeDuration));
      // Idle saccades snap and overshoot a hair, like a real eye; directed looks stay smooth.
      const u =
        this.gazeKind === 'saccade'
          ? g >= 1
            ? 1
            : 1 + 1.9 * Math.pow(g - 1, 3) + 0.9 * Math.pow(g - 1, 2)
          : ease(g);
      this.gaze = {
        x: mix(this.gazeFrom.x, this.gazeTarget.x, u),
        y: mix(this.gazeFrom.y, this.gazeTarget.y, u)
      };
      this.applyGazeScript(t);
      if (this.asleep) {
        // Under closed lids the eye drifts down and settles.
        this.gaze = { x: mix(this.gaze.x, 0, 0.04), y: mix(this.gaze.y, 0.18, 0.04) };
        this.gazeFrom = { ...this.gaze };
        this.gazeTarget = { ...this.gaze };
      } else {
        this.tickMicro(t);
        this.tickBlink(t);
      }
      return this.value;
    }
    // Where he looks during scripted moments (looking around, chasing a firefly, being annoyed).
    applyGazeScript(t) {
      if (!this.activeReaction(t)) return;
      const r = this.reaction,
        u = clamp((t - r.at) / r.duration);
      let g = null;
      if (r.name === 'look-around') {
        const keys = [
          [0, this.gazeFrom.x, this.gazeFrom.y],
          [0.08, -0.78, -0.05],
          [0.34, -0.78, -0.05],
          [0.42, 0.78, 0.04],
          [0.66, 0.78, 0.04],
          [0.72, 0.15, -0.4],
          [0.84, 0.15, -0.4],
          [0.92, 0, 0],
          [1, 0, 0]
        ];
        let i = 0;
        while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
        const [a0, ax, ay] = keys[i],
          [b0, bx, by] = keys[i + 1],
          k = ease((u - a0) / Math.max(0.001, b0 - a0));
        g = { x: mix(ax, bx, k), y: mix(ay, by, k) };
      } else if (r.name === 'firefly') {
        const f = fireflyAt(u);
        g = { x: clamp(f.x * 0.75, -0.85, 0.85), y: clamp(f.y * 0.75, -0.7, 0.7) };
      } else if (r.name === 'wake-wary') {
        const away = r.vector.x < 0 ? 0.58 : -0.58;
        g = { x: away * Math.sin(Math.PI * u), y: -0.12 };
      } else if (r.name === 'annoyed') {
        const away = r.vector.x > 0 ? -0.8 : 0.8;
        g =
          u < 0.12
            ? { x: mix(0, away, ease(u / 0.12)), y: -0.1 }
            : u < 0.7
              ? { x: away, y: -0.1 }
              : { x: mix(away, 0, ease((u - 0.7) / 0.2)), y: mix(-0.1, 0, ease((u - 0.7) / 0.2)) };
      } else if (r.name === 'startle' || r.name === 'greet-big') {
        g = { x: mix(this.gaze.x, 0, 0.3), y: mix(this.gaze.y, 0, 0.3) };
      } else if (r.script) {
        // 4.4 scripted: keyed blinks fire once each; the gaze channel (if any) leads from where he was looking
        const sc = r.script;
        if (sc.blinks) for (let i = 0; i < sc.blinks.length; i++) {
          const b = sc.blinks[i];
          if (!r.fired[i] && u >= b[0]) { r.fired[i] = true; this.startBlink(t, !!b[1]); }
        }
        const s = sc.gaze && sampleKeys(sc.gaze, u);
        if (s) {
          const lead = sc.gaze[0][0] > 0 ? ease(u / sc.gaze[0][0]) : 1;
          g = { x: clamp(mix(r.gazeFrom.x, s.x || 0, lead), -1, 1), y: clamp(mix(r.gazeFrom.y, s.y || 0, lead), -1, 1) };
          if (this.gentle) g = { x: mix(r.gazeFrom.x, g.x, 0.8), y: mix(r.gazeFrom.y, g.y, 0.8) };
        }
      }
      if (!g) return;
      this.gaze = g;
      this.gazeFrom = { ...g };
      this.gazeTarget = { ...g };
      this.gazeAt = t;
      this.gazeDuration = 1;
      this.nextGaze = Math.max(this.nextGaze, r.at + r.duration + 700);
    }
    react(name, t, important = false, vector = { x: 0, y: 0 }, options = {}) {
      // While asleep only dreams play; anything else must wake him first (personality.js).
      if (this.asleep && name !== 'dream') return false;
      if (!this.motion) {
        this.reaction = null;
        this.blendFrom = null;
        return false;
      }
      if (this.gentle && GENTLE_SKIP.has(name)) return false;
      const priority = priorityOf(name) + (important ? 1 : 0);
      // Idle habits never claim gaze or body during a drag. Higher-priority gestures,
      // media controls, and real alerts are always allowed to take over.
      if (this.attention.active && priority < 80) return false;
      if (this.activeReaction(t)) {
        const current = this.reaction;
        if (current.priority > priority && current.name !== name) return false;
        // Don't let repetitive low-value events endlessly restart an existing reaction.
        if (current.name === name && priority < 70 && t - current.at < 280) return false;
      }
      const previousPose = this.pose(t);
      const baseDuration =
        {
          touch: 950,
          notification: important ? 1500 : 1000,
          charge: 2100,
          low: 2200,
          full: 1800,
          music: 1350,
          call: 2300,
          alarm: 2100,
          timer: 1800,
          morning: 2100,
          previous: 850,
          next: 850,
          transport: 950,
          night: 1900,
          idle: 1000,
          pickup: 560,
          place: 760,
          release: 610,
          folder: 950,
          launch: 570,
          welcome: 1080,
          reach: 800,
          choose: 490,
          peek: 790,
          inspect: 620,
          unfold: 1000,
          fold: 660,
          anticipate: 570,
          merge: 880,
          'link-send': 1100,
          'link-receive': 1400,
          'link-spark-in': 1400,
          'link-spark-out': 1120,
          'link-calm-in': 1650,
          'link-calm-out': 1300,
          'link-resonance': 2150,
          'link-hello': 920,
          // Personality
          'look-around': 3400,
          firefly: 3800,
          stretch: 1700,
          yawn: 2500,
          sigh: 2100,
          'greet-big': 1600,
          'greet-familiar': 1280,
          'anticipate-pet': 920,
          'wake-wary': 1200,
          pet: 1500,
          annoyed: 1400,
          startle: 950,
          stir: 1300,
          dream: 800
        }[name] || 1100;
      const scripted = options.script && typeof options.script === 'object' ? options.script : null;
      const base = scripted && options.duration > 0 ? clamp(options.duration, 400, 15000) : baseDuration;
      const duration = this.gentle ? Math.round(base * 1.35) : base;
      let variant = 0;
      if (name === 'pet') {
        this.petCount = t - this.lastPetAt < 18000 ? this.petCount + 1 : 0;
        this.lastPetAt = t;
        // a choice with reasons: the lean is its default, contentment brings the wiggle, curiosity follows the
        // finger; in a run of pets it never repeats the response it just gave
        const w = [1, 0.55 + 0.9 * (this.mood.content || 0), 0.45 + 0.9 * (this.mood.curiosity || 0)];
        if (this.petCount > 0 && this.lastPetVariant >= 0) w[this.lastPetVariant] = 0;
        let x = this.random() * (w[0] + w[1] + w[2]);
        variant = 0; while (variant < 2 && (x -= w[variant]) > 0) variant++;
      } else if (name === 'greet-big') {
        variant = this.mood.sleepiness > 0.56 ? 1 : important ? 2 : 0;
      }
      if (name === 'pet' && options.variant === 0) variant = 0;
      if (name === 'pet') this.lastPetVariant = variant;
      const delay = clamp(options.delay || 0, 0, 400);
      this.blendFrom = previousPose;
      this.reaction = {
        name, at: t + delay, duration, important, priority, variant,
        vector: vector || { x: 0, y: 0 },
        script: scripted, fired: [], gazeFrom: { ...this.gaze }
      };
      if (name === 'welcome') this.startBlink(t + 150, true);
      else if (name === 'launch') this.startBlink(t + 90);
      else if (name === 'link-hello') {
        this.startBlink(t + 380);
        this.blink.again = true;
      } else if (name === 'link-calm-in') this.startBlink(t + 1150, true);
      else if (name === 'greet-familiar') this.startBlink(t + 700);
      else if (name === 'greet-big') {
        this.startBlink(t + 520);
        this.blink.again = true;
      } else if (name === 'stretch') this.startBlink(t + 1350);
      else if (name === 'yawn') this.startBlink(t + 2050, true);
      else if (name === 'annoyed') this.startBlink(t + 1150, true);
      else if (name === 'firefly') this.startBlink(t + 3500);
      else if (name === 'stir' || name === 'startle' || name === 'wake-wary') this.startBlink(t + 600);
      else if (name === 'touch' && this.random() < 0.35) this.startBlink(t + 60);
      return true;
    }
    drowsy() {
      return this.mode === 'night' || this.mode === 'low';
    }
    startBlink(t, slowOpen = false) {
      const d = this.drowsy(),
        heavy = d && this.random() < 0.16;
      this.blink = {
        ...this.blink,
        at: t,
        close: d ? 105 : 68,
        hold: heavy ? 520 : d ? 60 : 28,
        open: slowOpen ? 260 : heavy ? 420 : d ? 240 : 165,
        again: !d && this.random() < 0.17
      };
    }
    // True while anything visible is moving, or about to. Between these moments the eye only
    // breathes, so the launcher can drop to a calm frame rate and save battery.
    busy(t) {
      if (!this.motion) return false;
      if (this.stage !== 'rest' || this.attention.active || this.activeReaction(t)) return true;
      if (this.reaction && t < this.reaction.at && this.reaction.at - t < 500) return true;
      if (this.asleep) return Boolean(this.settling);
      const soon = 90,
        b = this.blink,
        blinkEnd = b.at + b.close + b.hold + b.open;
      if (t >= b.at - soon && t <= blinkEnd + 20) return true;
      if (b.next >= t && b.next - t < soon) return true;
      if (
        t - this.gazeAt < this.gazeDuration + 30 ||
        (this.nextGaze >= t && this.nextGaze - t < soon)
      )
        return true;
      const m = this.micro;
      if (t - m.at < 70 || (m.next >= t && m.next - t < soon)) return true;
      return Boolean(this.settling);
    }
    // 4.4: the launcher calls this on a phrase boundary of the music (every 4th beat). A blink lands on the
    // beat when one is due; never while a control is touched or a reaction (a skip, a press) is playing.
    musicBeat(t) {
      const m = this.music;
      m.lastBeat = t;
      if (!this.motion || this.mode !== 'music' || m.touch || this.attention.active || this.activeReaction(t) || t < m.next) return false;
      this.startBlink(t);
      // Music blinks belong to phrase boundaries; don't add an unscheduled second blink.
      this.blink.again = false;
      this.scheduleMusicBlink(t);
      return true;
    }
    scheduleMusicBlink(t) {
      const pace = typeof HavenDNA !== 'undefined' ? HavenDNA.motion().blinkPace : 1;
      this.music.next = t + (4200 + this.random() * 5200) * pace * (1 + 0.6 * this.mood.sleepiness);
    }
    tickBlink(t) {
      const b = this.blink;
      if (this.mode === 'music' && this.stage === 'rest' && !this.attention.active) {
        // listening, not staring: blinks come on the beat (musicBeat). With no beat to follow (paused, or
        // a silent capture) it still blinks now and then on its own.
        const m = this.music, end = b.at + b.close + b.hold + b.open;
        if (!m.next) this.scheduleMusicBlink(t);
        if (t >= end && b.again) {
          // Only phrase-timed music blinks are allowed when the beat is available.
          b.again = false;
          return;
        }
        const noBeat = t - (m.lastBeat || 0) > 3000;
        if (noBeat && t >= m.next + 1800 && t > end && !m.touch && !this.activeReaction(t)) { this.startBlink(t); this.blink.again = false; this.scheduleMusicBlink(t); }
        if (t >= b.next) b.next = t + 1200;
        return;
      }
      if (
        this.mode === 'music' ||
        this.mode === 'alert' ||
        this.attention.active ||
        this.stage !== 'rest'
      ) {
        if (t >= b.next) b.next = t + 1200;
        return;
      }
      const end = b.at + b.close + b.hold + b.open;
      if (t >= end && b.again) {
        b.again = false;
        this.blink = { ...b, at: t + 70, hold: 20, again: false };
        return;
      }
      if (t >= b.next && t > end) {
        this.startBlink(t);
        this.blink.next =
          t +
          ((this.drowsy() ? 5000 : 3000) + this.random() * 4400) *
          (1 + 0.6 * this.mood.sleepiness) *
          (typeof HavenDNA !== 'undefined' ? HavenDNA.motion().blinkPace : 1);
      }
    }
    blinkAmount(t) {
      if (!this.motion) return 0;
      const b = this.blink,
        e = t - b.at;
      if (e < 0) return 0;
      if (e < b.close) return ease(e / b.close);
      if (e < b.close + b.hold) return 1;
      const o = (e - b.close - b.hold) / b.open;
      return o < 1 ? 1 - ease(o) : 0;
    }
    tickMicro(t) {
      const m = this.micro;
      if (
        !this.motion ||
        this.attention.active ||
        this.stage !== 'rest' ||
        (this.gazeKind === 'smooth' && t - this.gazeAt < this.gazeDuration)
      ) {
        m.tx = m.ty = 0;
      } else if (t >= m.next) {
        m.fx = m.x;
        m.fy = m.y;
        const a = this.random() * Math.PI * 2,
          r = (0.015 + this.random() * 0.022) * (this.gentle ? 0.45 : 1),
          d = this.drowsy();
        m.tx = Math.cos(a) * r;
        m.ty = Math.sin(a) * r * 0.8;
        m.at = t;
        m.next = t + ((d ? 1800 : 950) + this.random() * (d ? 2600 : 1600)) * (this.gentle ? 1.8 : 1);
      }
      const u = ease((t - m.at) / (this.gentle ? 180 : 38));
      m.x = mix(m.fx, m.tx, u);
      m.y = mix(m.fy, m.ty, u);
    }
    // Lids and pupil carry mood. They are eased, never snapped, and freeze with Motion Off.
    eyeLife(t, clock) {
      const base = {
        idle: [0.1, 0.02, 1],
        night: [0.36, 0.07, 1.3],
        low: [0.42, 0.05, 1.2],
        charge: [0.16, 0.2, 1.06],
        full: [0.02, 0, 0.94],
        alert: [0, 0, 0.7],
        music: [0, 0, 1]
      }[this.mode] || [0.1, 0.02, 1];
      let [up, low, pupil] = base;
      if (this.activeReaction(clock)) {
        const r = this.reaction,
          u = clamp((clock - r.at) / r.duration),
          swell = Math.sin(Math.PI * ease(u));
        switch (r.name) {
          case 'notification':
            if (r.important) {
              up -= 0.14 * swell;
              pupil *= 1 - 0.22 * swell;
            } else up -= 0.05 * swell;
            break;
          case 'call':
          case 'alarm':
          case 'timer':
            up -= 0.2 * swell;
            pupil *= 1 - 0.3 * swell;
            break;
          case 'touch':
            low += 0.5 * swell;
            up += 0.1 * swell;
            break;
          case 'place':
          case 'merge':
            low += 0.32 * swell;
            up += 0.05 * swell;
            break;
          case 'inspect':
          case 'pickup':
          case 'peek':
          case 'reach':
          case 'unfold':
          case 'folder':
          case 'choose':
            up -= 0.1 * swell;
            pupil *= 1 + 0.2 * swell;
            break;
          // HAVEN LINK: each signal shows in his lids and pupil, not just in the light around him.
          case 'link-receive':
            up -= 0.12 * swell;
            pupil *= 1 + 0.3 * swell;
            break;
          case 'link-spark-in':
            low += 0.45 * swell;
            up += 0.05 * swell;
            pupil *= 1 + 0.2 * swell;
            break;
          case 'link-calm-in':
            up += 0.32 * swell;
            low += 0.1 * swell;
            pupil *= 1 + 0.15 * swell;
            break;
          case 'link-resonance':
            up -= 0.16 * swell;
            pupil *= 1 + 0.35 * swell;
            break;
          case 'link-send':
            up -= 0.05 * swell;
            pupil *= 1 - 0.15 * swell;
            break;
          case 'link-spark-out':
            up -= 0.1 * swell;
            low += 0.22 * swell;
            break;
          case 'link-hello':
            up -= 0.15 * swell;
            break;
          case 'link-calm-out':
            up += 0.35 * swell;
            break;
          case 'calm':
            up += 0.18 * swell;
            break;
          // Personality
          case 'look-around':
            up -= 0.05 * swell;
            break;
          case 'firefly':
            up -= 0.08 * swell;
            pupil *= 1 + 0.18 * swell;
            break;
          case 'stretch': {
            const wide = Math.sin(Math.PI * clamp(u / 0.5)),
              squeeze = Math.sin(Math.PI * clamp((u - 0.5) / 0.35));
            up -= 0.16 * wide;
            up += 0.4 * squeeze;
            low += 0.3 * squeeze;
            break;
          }
          case 'yawn': {
            // Lids squeeze heavy while the eye stretches tall, then a slow watery blink.
            const open = Math.sin(Math.PI * clamp((u - 0.1) / 0.65));
            up += 0.5 * open;
            low += 0.32 * open;
            pupil *= 1 - 0.2 * open;
            break;
          }
          case 'sigh':
            up += 0.26 * Math.sin(Math.PI * clamp((u - 0.35) / 0.65));
            break;
          case 'greet-big':
            up -= (r.variant === 1 ? 0.06 : 0.18) * swell;
            pupil *= 1 + (r.variant === 2 ? 0.37 : 0.24) * swell;
            break;
          case 'pet':
            low += (r.variant === 1 ? 0.42 : 0.55) * swell;
            up += (r.variant === 2 ? 0.13 : 0.24) * swell;
            pupil *= 1 + (r.variant === 2 ? 0.21 : 0.12) * swell;
            break;
          case 'annoyed':
            up += 0.36 * swell;
            low += 0.3 * swell;
            pupil *= 1 - 0.15 * swell;
            break;
          case 'startle':
            up -= 0.28 * swell;
            pupil *= 1 + 0.4 * swell;
            break;
          case 'stir':
            up += 0.2 * (1 - u);
            break;
          case 'morning':
          case 'full':
            up -= 0.12 * swell;
            break;
          case 'night':
          case 'low':
            up += 0.12 * swell;
            break;
        }
        if (r.script && r.script.lids) {
          const s = sampleKeys(r.script.lids, u);
          if (s) { up += s.up || 0; low += s.low || 0; pupil *= 1 + (s.pupil || 0); }
        }
      }
      if (this.attention.active) {
        up -= 0.08;
        pupil *= 1.1;
      }
      // Looking down lowers the upper lid; looking up lifts it.
      up += this.gaze.y * 0.14;
      low -= this.gaze.y * 0.07;
      if (this.motion)
        pupil *= 1 + 0.035 * Math.sin(clock / 1300) + 0.018 * Math.sin(clock / 470 + 1.3);
      // Temperament: sleepy lids sit lower, energy lifts them.
      up += 0.12 * Math.max(0, this.mood.sleepiness - 0.3) - 0.04 * this.mood.energy;
      up = clamp(up);
      low = clamp(low);
      const dt = this.motion ? clamp(clock - this.lastSample, 0, 120) : 1e6;
      this.lastSample = clock;
      const k = 1 - Math.exp(-dt / 150);
      this.lids.upper = mix(this.lids.upper, up, k);
      this.lids.lower = mix(this.lids.lower, low, k);
      // Sleep closes the lids slowly (about four seconds) and opens them quickly on waking.
      const ks = 1 - Math.exp(-dt / (this.asleep ? 1400 : 220));
      this.sleepK = mix(this.sleepK, this.asleep ? 1 : 0, ks);
      if (this.sleepK > 0.001) {
        this.lids.upper = mix(this.lids.upper, 1, this.sleepK * ks);
        this.lids.lower = mix(this.lids.lower, 0.92, this.sleepK * ks);
      }
      // Still easing toward a new mood? Then the eye needs smooth frames.
      this.settling =
        Math.abs(this.sleepK - (this.asleep ? 1 : 0)) > 0.01 ||
        Math.abs(this.lids.upper - up) > 0.012 ||
        Math.abs(this.lids.lower - low) > 0.012;
      // Pupils constrict quickly and dilate slowly.
      const kp = 1 - Math.exp(-dt / (pupil < this.pupil ? 170 : 520));
      this.pupil = mix(this.pupil, pupil, kp);
      if (Math.abs(this.pupil - pupil) > 0.06) this.settling = true;
      if (this.asleep) this.settling = this.sleepK < 0.99;
      const blink = this.blinkAmount(clock),
        sk = this.sleepK;
      return {
        upper: Math.max(mix(this.lids.upper, 1, sk), blink),
        lower: Math.max(mix(this.lids.lower, 0.92, sk), blink * 0.92),
        blink,
        sleep: sk,
        pupil: this.pupil
      };
    }
    activeReaction(t) {
      return Boolean(
        this.motion && this.reaction &&
        t >= this.reaction.at && t - this.reaction.at < this.reaction.duration
      );
    }
    pose(t) {
      const p = { name: 'rest', x: 0, y: 0, sx: 1, sy: 1, tilt: 0, focus: 1, glow: 1 };
      if (this.activeReaction(t)) {
        const r = this.reaction,
          u = clamp((t - r.at) / r.duration);
        const swell = Math.sin(Math.PI * ease(u)),
          settle = Math.sin(Math.PI * u) * Math.exp(-2.5 * u);
        p.name = r.name;
        switch (r.name) {
          case 'notification': {
            const k = r.important ? 1 : 0.24;
            p.y = -6 * swell * k;
            p.sx += 0.025 * swell * k;
            p.sy += 0.045 * swell * k;
            p.tilt = -0.045 * swell * k;
            p.focus += 0.11 * swell * k;
            p.glow += 0.09 * swell * k;
            break;
          }
          case 'touch':
            p.x = r.vector.x * 5 * settle;
            p.y = r.vector.y * 4 * settle;
            p.tilt = r.vector.x * 0.035 * settle;
            p.focus += 0.055 * swell;
            break;
          case 'charge':
            p.y = 7 * swell;
            p.sx += 0.045 * swell;
            p.sy -= 0.022 * swell;
            p.focus += 0.08 * swell;
            p.glow += 0.07 * swell;
            break;
          case 'low':
          case 'night':
            p.y = 6 * swell;
            p.sx += 0.025 * swell;
            p.sy -= 0.025 * swell;
            p.focus -= 0.07 * swell;
            break;
          case 'full':
          case 'morning':
            p.y = -7 * swell;
            p.sx += 0.035 * swell;
            p.sy += 0.025 * swell;
            p.focus += 0.13 * swell;
            p.glow += 0.09 * swell;
            break;
          case 'music':
            p.tilt = -0.035 * swell;
            p.sx += 0.025 * swell;
            p.focus += 0.09 * swell;
            break;
          case 'call':
            p.x = Math.sin(u * Math.PI * 4) * Math.sin(Math.PI * u) * 7;
            p.tilt = Math.sin(u * Math.PI * 4) * Math.sin(Math.PI * u) * 0.065;
            p.focus += 0.14 * swell;
            break;
          case 'alarm':
          case 'timer': {
            const pulse = Math.pow(Math.sin(u * Math.PI * 2), 2) * Math.sin(Math.PI * u),
              k = r.name === 'alarm' ? 1 : 0.75;
            p.y = -11 * pulse * k;
            p.sx += 0.04 * pulse * k;
            p.sy += 0.06 * pulse * k;
            p.focus += 0.16 * pulse * k;
            p.glow += 0.08 * pulse * k;
            break;
          }
          case 'previous':
          case 'next': {
            const side = r.name === 'next' ? 1 : -1;
            p.x = side * 7 * settle;
            p.tilt = side * 0.05 * settle;
            p.focus += 0.08 * swell;
            break;
          }
          case 'transport':
            p.sx += 0.025 * swell;
            p.sy -= 0.016 * swell;
            p.glow += 0.09 * swell;
            break;
          case 'idle':
            p.y = 3 * swell;
            break;
          case 'pickup':
            p.y = -4 * swell;
            p.sy += 0.045 * swell;
            p.sx -= 0.02 * swell;
            p.focus += 0.12 * swell;
            p.glow += 0.11 * swell;
            break;
          case 'place':
            p.y = 5 * settle;
            p.sx += 0.058 * swell;
            p.sy -= 0.07 * swell;
            p.focus += 0.07 * swell;
            p.glow += 0.13 * swell;
            break;
          case 'release':
            p.x = r.vector.x * 2.8 * settle;
            p.tilt = r.vector.x * 0.02 * settle;
            p.focus += 0.025 * swell;
            break;
          case 'folder':
          case 'unfold':
            p.sy -= 0.075 * swell;
            p.sx += 0.055 * swell;
            p.tilt = r.vector.x * 0.045 * swell;
            p.focus += 0.14 * swell;
            p.glow += 0.14 * swell;
            break;
          case 'fold':
            p.sx -= 0.042 * swell;
            p.sy += 0.038 * swell;
            p.focus -= 0.06 * swell;
            break;
          case 'inspect':
            p.tilt = r.vector.x * 0.036 * swell;
            p.x = r.vector.x * 2 * settle;
            p.focus += 0.05 * swell;
            break;
          case 'anticipate':
            p.sx += 0.04 * swell;
            p.sy -= 0.027 * swell;
            p.focus += 0.07 * swell;
            p.glow += 0.07 * swell;
            break;
          case 'merge':
            p.sx += 0.075 * swell;
            p.sy -= 0.075 * swell;
            p.focus += 0.13 * swell;
            p.glow += 0.11 * swell;
            break;
          // HAVEN LINK poses. The friend lives up and to the left (see link-effects.js).
          case 'link-send': {
            // Gather, then release toward the friend.
            const gather = Math.exp(-Math.pow((u - 0.18) / 0.09, 2)),
              release = Math.exp(-Math.pow((u - 0.33) / 0.1, 2));
            p.sy -= 0.12 * gather;
            p.sx += 0.06 * gather;
            p.sy += 0.08 * release;
            p.x -= 3 * release;
            p.y -= 5 * release;
            p.tilt -= 0.04 * swell;
            p.focus += 0.15 * swell;
            p.glow += 0.2 * swell;
            break;
          }
          case 'link-spark-out': {
            // A crouch and a happy little hop.
            const crouch = Math.exp(-Math.pow((u - 0.12) / 0.07, 2)),
              hop = Math.exp(-Math.pow((u - 0.3) / 0.12, 2));
            p.sy -= 0.14 * crouch;
            p.sx += 0.08 * crouch;
            p.y -= 11 * hop;
            p.sy += 0.1 * hop;
            p.sx -= 0.05 * hop;
            p.glow += 0.25 * swell;
            break;
          }
          case 'link-calm-out':
            // A slow exhale: he settles a little lower and softer.
            p.y += 3 * swell;
            p.sx += 0.035 * swell;
            p.sy -= 0.04 * swell;
            p.glow += 0.06 * swell;
            break;
          case 'link-receive': {
            // Takes the orb in, then swells with it.
            const intake = Math.exp(-Math.pow((u - 0.68) / 0.08, 2)),
              after = Math.exp(-Math.pow((u - 0.82) / 0.12, 2));
            p.tilt -= 0.05 * settle;
            p.sx -= 0.08 * intake;
            p.sy -= 0.08 * intake;
            p.sx += 0.07 * after;
            p.sy += 0.06 * after;
            p.focus += 0.2 * swell;
            p.glow += 0.26 * after;
            break;
          }
          case 'link-spark-in': {
            // A few delighted bounces as the sparks land.
            const k = clamp((u - 0.38) / 0.52),
              bounce = Math.abs(Math.sin(Math.PI * k * 3)) * (1 - k);
            p.y -= 7 * bounce;
            p.sy += 0.05 * bounce;
            p.sx -= 0.02 * bounce;
            p.glow += 0.22 * swell;
            break;
          }
          case 'link-calm-in':
            // Settles down, content.
            p.y += 3 * swell;
            p.sx += 0.03 * swell;
            p.sy -= 0.03 * swell;
            p.glow += 0.1 * swell;
            break;
          case 'link-resonance': {
            // A heartbeat: lub-dub, lub-dub, then a full bloom.
            const beat = (at) => Math.exp(-Math.pow((u - at) / 0.03, 2));
            const beats =
              beat(0.18) + 0.7 * beat(0.25) + beat(0.42) + 0.7 * beat(0.49) + 1.4 * beat(0.72);
            p.sx += 0.08 * beats;
            p.sy += 0.07 * beats;
            p.focus += 0.25 * swell;
            p.glow += 0.3 * swell;
            break;
          }
          case 'link-hello':
            // Wide awake, then a glance toward the friend.
            p.sy += 0.06 * swell;
            p.y -= 3 * swell;
            p.x -= 3 * settle;
            p.focus += 0.1 * swell;
            break;
          // Personality
          case 'look-around':
            p.tilt += 0.07 * this.gaze.x * swell;
            p.x += 6 * this.gaze.x * swell;
            p.y += 3 * this.gaze.y * swell;
            break;
          case 'firefly':
            p.tilt += 0.05 * this.gaze.x * swell;
            p.x += 3 * this.gaze.x * swell;
            p.y += 2 * this.gaze.y * swell;
            p.focus += 0.06 * swell;
            break;
          case 'stretch': {
            const tall = Math.sin(Math.PI * clamp(u / 0.5)),
              squash = Math.sin(Math.PI * clamp((u - 0.5) / 0.35));
            p.sy += 0.16 * tall;
            p.sx -= 0.08 * tall;
            p.y -= 6 * tall;
            p.sy -= 0.1 * squash;
            p.sx += 0.08 * squash;
            p.y += 3 * squash;
            break;
          }
          case 'yawn': {
            const open = Math.sin(Math.PI * clamp((u - 0.1) / 0.65)),
              shake = u > 0.75 ? Math.sin((u - 0.75) * 50) * (1 - u) * 4 : 0;
            p.sy += 0.13 * open;
            p.sx -= 0.04 * open;
            p.tilt += 0.03 * shake;
            p.glow -= 0.08 * open;
            break;
          }
          case 'sigh': {
            const rise = Math.sin(Math.PI * clamp(u / 0.4)),
              fall = Math.sin(Math.PI * clamp((u - 0.35) / 0.65));
            p.y -= 3 * rise;
            p.sy += 0.04 * rise;
            p.y += 4 * fall;
            p.sx += 0.04 * fall;
            p.sy -= 0.05 * fall;
            break;
          }
          case 'greet-familiar':
            p.x += 2.6 * Math.sin(Math.PI * u) * swell;
            p.tilt += 0.065 * swell;
            p.sy += 0.032 * swell;
            p.focus += 0.11 * swell;
            p.glow += 0.08 * swell;
            break;
          case 'anticipate-pet':
            p.x += r.vector.x * 5.4 * swell;
            p.y += r.vector.y * 4.2 * swell;
            p.tilt += r.vector.x * 0.055 * swell;
            p.sx += 0.02 * swell;
            p.focus += 0.045 * swell;
            break;
          case 'wake-wary':
            p.x += 2.5 * Math.sin(u * Math.PI * 1.3) * swell;
            p.tilt -= 0.065 * swell;
            p.sy -= 0.028 * swell;
            p.focus -= 0.045 * swell;
            break;
          case 'greet-big': {
            const k = r.variant === 1 ? 0.35 : r.important ? 1 : 0.65,
              count = r.variant === 2 ? 3 : 2,
              hop = Math.abs(Math.sin(Math.PI * clamp(u / 0.75) * count)) *
                (1 - clamp(u / 0.75));
            p.y -= 11 * hop * k;
            p.sy += 0.07 * hop * k;
            p.sx -= 0.03 * hop * k;
            p.glow += (r.variant === 1 ? 0.15 : 0.4) * swell * k;
            p.focus += 0.12 * swell;
            break;
          }
          case 'pet':
            if (r.variant === 0) {
              // Lean into the stroke.
              p.tilt += 0.05 * Math.sin(u * Math.PI * 3) * swell;
              p.sx += 0.04 * swell;
              p.sy -= 0.02 * swell;
            } else if (r.variant === 1) {
              // A contented little body wiggle, not a copy of the first response.
              p.tilt += 0.055 * Math.sin(u * Math.PI * 5) * swell;
              p.x += 3.5 * Math.sin(u * Math.PI * 4) * swell;
              p.sy += 0.02 * swell;
            } else {
              // Follow the last touch and hold a curious open pupil.
              p.x += r.vector.x * 4 * swell;
              p.y += r.vector.y * 3 * swell;
              p.sy += 0.045 * swell;
              p.focus += 0.08 * swell;
            }
            p.glow += 0.18 * swell;
            break;
          case 'annoyed': {
            const shake = u < 0.35 ? Math.sin(u * 60) * (1 - u / 0.35) : 0;
            p.tilt += 0.05 * shake;
            p.x += 3 * shake;
            p.sy -= 0.04 * swell;
            break;
          }
          case 'startle': {
            const jump = Math.exp(-Math.pow((u - 0.18) / 0.1, 2)),
              land = Math.exp(-Math.pow((u - 0.42) / 0.08, 2));
            p.y -= 12 * jump;
            p.sy += 0.08 * jump;
            p.sy -= 0.08 * land;
            p.sx += 0.06 * land;
            p.glow += 0.3 * swell;
            break;
          }
          case 'stir':
            p.sy += 0.05 * swell;
            p.y -= 2 * swell;
            break;
          case 'dream': {
            const twitch = Math.sin(u * 40) * (1 - u);
            p.x += 1.5 * twitch;
            p.glow += 0.12 * Math.sin(Math.PI * u);
            break;
          }
          case 'launch': {
            const flick = Math.exp(-Math.pow((u - 0.24) / 0.12, 2));
            p.sy -= 0.14 * flick;
            p.sx += 0.08 * flick;
            p.focus -= 0.18 * flick;
            p.glow += 0.18 * swell;
            break;
          }
          case 'welcome': {
            const blink = Math.exp(-Math.pow((u - 0.24) / 0.072, 2));
            p.sy -= 0.16 * blink;
            p.sx += 0.045 * blink;
            p.y = -3 * swell;
            p.focus += 0.11 * swell;
            p.glow += 0.09 * swell;
            break;
          }
          case 'reach':
            p.focus += 0.105 * swell;
            p.sy += 0.035 * swell;
            p.glow += 0.08 * swell;
            break;
          case 'choose':
            p.x = r.vector.x * 4 * settle;
            p.y = r.vector.y * 3 * settle;
            p.focus += 0.08 * swell;
            break;
          case 'peek':
            p.focus += 0.135 * swell;
            p.tilt = -0.055 * swell;
            p.glow += 0.11 * swell;
            break;
        }
        if (r.script && r.script.body) {
          const s = sampleKeys(r.script.body, u);
          if (s) for (const k of ['x', 'y', 'tilt', 'sx', 'sy', 'focus', 'glow']) p[k] += s[k] || 0;
        }
      }
      // Sustained attention while dragging; organic follow, never a looping animation.
      if (this.attention.active) {
        const age = clamp((t - this.attention.at) / 260);
        const k = ease(age);
        p.name = 'following';
        p.tilt += this.attention.x * 0.055 * k;
        p.x += this.attention.x * 4 * k;
        p.y += this.attention.y * 3 * k;
        p.sx += 0.022 * k;
        p.sy -= 0.018 * k;
        p.focus += 0.075 * k;
        p.glow += 0.06 * k;
      }
      // During a choreographed gaze lead-in, retain the previous pose rather
      // than snapping to neutral before the new reaction starts.
      if (this.blendFrom && this.reaction && t < this.reaction.at)
        return this.soften({ ...this.blendFrom, name: 'anticipating' });
      // Crossfade on an interruption, so the body doesn't snap to its new pose.
      if (this.blendFrom && this.activeReaction(t)) {
        const age = t - this.reaction.at,
          k = ease(age / 170);
        if (k < 1) {
          for (const key of ['x', 'y', 'sx', 'sy', 'tilt', 'focus', 'glow'])
            p[key] = mix(this.blendFrom[key], p[key], k);
        } else this.blendFrom = null;
      }
      return this.soften(p);
    }
    // Gentle keeps every pose but at about a third of the size: a lean, not a bounce.
    soften(p) {
      if (!this.gentle) return p;
      const k = 0.35;
      return {
        ...p,
        x: p.x * k, y: p.y * k, tilt: p.tilt * k,
        sx: 1 + (p.sx - 1) * k, sy: 1 + (p.sy - 1) * k,
        focus: 1 + (p.focus - 1) * 0.6, glow: 1 + (p.glow - 1) * 0.6
      };
    }
    // Small, coordinated changes to the same luminous material, not pasted-on effects.
    material(t) {
      if (!this.motion || this.asleep) return {
        activity: 0, pulse: 0, flow: 0, depth: 0, direction: 0, charging: false
      };
      const r = this.activeReaction(t) ? this.reaction : null,
        u = r ? clamp((t - r.at) / r.duration) : 0,
        enter = ease(u / 0.24),
        exit = 1 - ease((u - 0.73) / 0.27),
        life = r ? enter * exit : 0;
      const strength = r ? ({
        notification: r.important ? 0.9 : 0.48,
        charge: 0.88, full: 0.55, 'greet-big': 0.78,
        pet: 0.66, 'link-receive': 0.95, 'link-spark-in': 0.95,
        'link-resonance': 1, 'link-send': 0.75,
        inspect: 0.36, peek: 0.45, call: 0.8, alarm: 0.83, visit: 0.42
      }[r.name] ?? 0.18) : 0;
      const base = this.mode === 'charge' ? 0.16 : this.attention.active ? 0.12 : 0.025;
      const activity = clamp(base + life * strength, 0, 1);
      const flow = r?.name === 'charge' ? u : this.mode === 'charge' ? (t % 3800) / 3800 : 0;
      const direction = r ? clamp(r.vector.x, -1, 1) : this.gaze.x;
      return {
        activity,
        pulse: life * strength,
        flow,
        depth: clamp(0.06 + 0.24 * this.mood.curiosity + 0.45 * activity),
        direction,
        // Charging is a persistent material channel even while he's reacting to a pet.
        charging: this.mode === 'charge',
        kind: r?.name || this.mode
      };
    }
    sample(t) {
      this.tick(t);
      const clock = this.motion ? t : this.freezeTime;
      const p = profile(this.state);
      const breathe = Math.sin((clock * 2 * Math.PI) / p.period);
      const eye = this.eyeLife(t, clock);
      return {
        ...this.value,
        gaze: { x: this.gaze.x + this.micro.x, y: this.gaze.y + this.micro.y },
        eye,
        breathe,
        pose: this.pose(clock),
        material: this.material(clock),
        following: this.motion && this.attention.active,
        mode: this.mode,
        stage: this.stage,
        fps: p.fps
      };
    }
  }
  root.HavenPresence = { Presence, mode, profile, ease, mix, fireflyAt, sampleKeys };
  if (typeof module !== 'undefined') module.exports = root.HavenPresence;
})(typeof window === 'undefined' ? globalThis : window);
