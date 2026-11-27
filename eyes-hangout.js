/* EYES 4.5 · Hangout (replaces Mirror), refined in 4.5.1, grown into a playdate in 4.7. Two friends' Eyes visit each other. Shared by Android and iPhone.
   Loads after eyes-friends.js, eyes-contact.js and eyes-duel.js.

   Not a game and not a call: two little creatures spending time together inside the Meeting Space. One Eye
   invites, the other accepts. They notice each other arrive, perk up, say hello in their own way, and then drift
   between four things for as long as both people leave EYES open:
     catch       one Eye conjures a small glowing ball, studies it and lobs it off the top of the screen; it drops
                 in on the other phone, where that Eye tracks it and catches it (or fumbles it), plays a little and
                 throws it back. The person whose Eye holds the ball can flick it over themselves.
     fireflies   little winking lights the Eyes follow, chase and pounce at; now and then one drifts off the top of
                 one phone and drops in on the other.
     goofing     one Eye bounces, spins, wobbles, puffs up, peeks or rolls its eye; the other joins in its own way,
                 or looks confused, surprised or amused. Never a copy.
     company     they settle, breathe, glance at each other, lean in, share a slow blink, doze. Long quiet
                 stretches are part of it, not a reason to start something.
   When one says goodbye both Eyes wave before they part. Tapping either Eye teases it.

   Both phones agree without a server:
     PLAN is pure. seed = hash(inviter's half ‖ accepter's half); each Eye's temperament dials and first word travel
     in ask / yes. PLAN.at(i) gives activity i: kind, start, duration, who starts it, and its details (the goof move
     and the reaction, firefly crossings, who fumbles which catch). Both phones run the same timeline on their own
     clock from the moment they went live (they differ by the relay's latency, ~1 s, which nobody can see because
     nobody sees the other screen). Only the ball needs live messages, because it is one object with one owner.
   Ownership: in catch i the starter owns the ball. Only the owner may throw. A throw is 'toss {i, n}' with n
     counting up from 1; sending it hands the ball over. A receiver accepts n > its last n and ignores the rest
     (duplicates, late or out-of-order copies). A lost toss can't create a second ball: the ball simply stays where
     each phone last saw it and is absorbed when the catch's time is up. Throws stop 4.5 s before the end.
   Protocol: EyesFriends.hangout(f, h), kind 'hangout', only for friends that advertised the 'hangout' capability.
     h.o = 'ask' {id, sd, tm, w, nm, v} · 'yes' {id, sd, tm, w, v} · 'no' {id, why} · 'cancel' {id}
           'toss' {id, i, n, p, u} · 'tap' {id, w} · 'hi' {id} · 'away' {id} · 'back' {id} · 'bye' {id, why}
   Traffic: ask (+ a re-send every 20 s while waiting) · yes · one toss per throw · at most one tap per 4 s · a 'hi'
     only after 70 s without sending anything · away/back · bye. Everything else is drawn locally. Roughly 40–80
     small messages per phone per hour, most of them during catch.
   Never stuck: an unanswered ask stops after 60 s. Live, silence for 200 s ends it ('quiet' or 'lost'); an accepter
     that hears nothing at all in the first 40 s ends it. A friend who left EYES ('away') dozes on your screen for
     up to 100 s, then the Hangout ends. Leaving EYES yourself for more than 90 s ends it. Either side can leave at any
     moment (Say goodbye, Back, ×), and the other Eye waves goodbye.
   Kept: nothing about a Hangout except stats.hangouts and firsts.hangout in that friendship's history
     (eyes.friends.v1) once it lasted 20 s. Existing stats.mirrors / firsts.mirror are left exactly as they are.
     No scores, no rewards, no streaks.
   Motion: Gentle is slower and smaller. Off can't animate two Eyes, so Hangout says so instead of pretending.
   Battery: 60 fps only while something moves fast (a ball in the air, a hop, a spin); 30 fps otherwise; never 60
     in battery saver or ≤ 15 % and not charging. Nothing runs while EYES is hidden.

   4.5.1 / iPhone 2.5.1:
   - Head to head: your Eye big below, theirs leaning in through a soft doorway at the top edge (clipped there),
     its body mirrored as if the phones lay top to top. The ball and travelling fireflies really leave through
     that edge and arrive through it; a ball their Eye holds shows as light spilling through the doorway.
   - Relay-aware: throws, taps and the 70 s 'hi' stop while EyesFriends.relayStatus() reports a cool-down, and
     stay under 45 per rolling hour; the Eye simply keeps the ball. An invite refused by a limited relay says so.
   - Sound (Hangout only, quiet, synthesized, own mute 'eyes.hangout.sound') and a light Android buzz on a catch.
   - PLAN v2 adds shimmy, hiccup, stretch and the cheer / unimpressed reactions. ask / yes carry v; both phones plan
     with min(v), so a 4.5.0 phone and a 4.5.1 phone still agree on every activity.
   - "new" once (eyes.hangout.hint.v1) and "awake now" on the Hang out button.

   4.7 / iPhone 2.7 · Hangout 2.0, "the Playdate update" (PLAN v3, used only when BOTH phones send v ≥ 3):
   - New shared activities: tug of war, tag, bubble party, dance off, curious discoveries, mischief (poke and look
     away, startle, steal a toy, fake sleep, bump), plus deterministic company "beats" (nudges, coordinated slow blinks,
     leaning together, following each other's gaze, little pokes). Arrival is shorter; something lively starts by 5 s.
   - Personality: every trait (competitive, mischievous, affectionate, attention, recovery…) is derived from the same
     five dials that already travel in ask / yes. Nothing new is stored or sent about an Eye.
   - Owners: Play · Tease · Surprise under the Meeting Space. A press is a cue {by, n, at, k} that becomes part of
     PLAN's input on both phones; PLAN alone decides whether it is used (not during the arrival, CUE_GAP 7 s after
     the last used cue, either owner), so simultaneous presses resolve identically everywhere.
   - v3-only messages (never sent to an older phone):
       'cue' {id, by, n, at, k, h: [[n, at, k] × ≤ 6]}  resent at 2.5 / 6 / 12 s until 'cueok' {id, n}; h repairs losses
       'hi' / 'back' may carry cq: the same short cue history
       'push' {id, i, w, k}   an owner's cheering for activity i, cumulative (k = quarter-seconds), ≤ 1 per 2 s
       'pop'  {id, i, b: [bubble k…]}   bubbles an owner popped, batched ≤ 1 per 1.2 s
       'obj'  {id, i}         an owner touched the mysterious object, ≤ 1 per 1.5 s
       'res'  {id, i, r}      tug of war only: the inviter's phone folds both owners' cheering into PLAN.tugResult and
                              sends the outcome 2.5 s before the reveal (twice); without it both use the plan's own
     push / pop / obj share their own soft budget (70 per rolling hour) and stop during a relay cool-down.
   - Rendering stays local: frames, particles, positions and touches never cross. Quiet moments drop to ~20 fps.
   - An older phone (4.5–4.6.6 / 2.5–2.6.x) still gets the exact v2 Hangout; the nudges simply don't appear. */
'use strict';
(function (root) {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => { x = clamp(x); return 1 - (1 - x) * (1 - x) * (1 - x); };
  const F = () => root.EyesFriends, D = () => root.HavenDNA, C = () => root.EyesContact;
  const nowS = () => performance.now() / 1000;
  const ID_RE = /^[A-Za-z0-9_-]{6,16}$/, SD_RE = /^[A-Za-z0-9_-]{6,16}$/;
  const ASK_MS = 60000, RESEND_MS = 20000, END_HOLD_MS = 1600, MIN_KEEP_S = 20;
  const TM = { hi: 70000, silent: 200000, firstWord: 40000, awayMax: 100000, hiddenMax: 90000 };   // test harnesses may shorten these
  const rid = (n) => { const a = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (const x of a) s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[x & 63]; return s; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ======================================================================================
  // PLAN: pure, deterministic, shared by both phones
  // ======================================================================================
  const PLAN = (() => {
    const DIALS = ['curiosity', 'shyness', 'energy', 'grump', 'drama'];
    const WORDS = ['curious', 'shy', 'hyper', 'sleepy', 'grumpy', 'dramatic', 'calm', 'smug'];
    const NEUTRAL = { curiosity: 0.5, shyness: 0.5, energy: 0.5, grump: 0.3, drama: 0.4 };
    // v1 = EYES 4.5.0 / iPhone 2.5.0. v2 (4.5.1) adds shimmy, hiccup, stretch and the cheer / unimpressed
    // reactions. Two phones always plan with the lower version both understand, so they still agree.
    const MOVES = ['bounce', 'spin', 'wobble', 'peek', 'roll', 'puff', 'shimmy', 'hiccup', 'stretch'];
    const REACTIONS = ['join', 'confused', 'surprised', 'amused', 'cheer', 'unimpressed'];
    function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function seedOf(sa, sb) { let h = 0x811c9dc5; const s = 'HANGOUT1·' + String(sa) + '·' + String(sb); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    const pack = (T) => DIALS.map((k) => Math.round(clamp(Number(T && T[k]) || 0) * 100) / 100);
    function unpack(tm) {
      if (!Array.isArray(tm) || tm.length !== 5 || !tm.every((x) => Number.isFinite(Number(x)))) return { ...NEUTRAL };
      const T = {}; DIALS.forEach((k, i) => { T[k] = Math.round(clamp(Number(tm[i])) * 100) / 100; }); return T;
    }
    const word = (w) => (WORDS.includes(w) ? w : 'calm');
    const sleepy = (T) => clamp((0.42 - T.energy) * 2.4);
    const bold = (T) => (1 - T.shyness) * 0.6 + T.energy * 0.3 + T.curiosity * 0.1;
    function pick(r, w) { const e = Object.entries(w).filter(([, v]) => v > 0); let s = e.reduce((a, x) => a + x[1], 0), x = r() * s; for (const [k, v] of e) if ((x -= v) <= 0) return k; return e[e.length - 1][0]; }
    const other = (x) => (x === 'a' ? 'b' : 'a');
    function moveWeights(T, v) {
      const w = { bounce: 0.4 + 1.2 * T.energy, spin: 0.2 + 0.8 * T.drama + 0.4 * T.energy, wobble: 0.4 + 0.6 * T.drama, peek: 0.3 + 1.1 * T.shyness,
        roll: 0.2 + 1.1 * T.grump + 0.3 * (1 - T.shyness) * T.grump, puff: 0.3 + 0.7 * T.drama + 0.3 * T.curiosity };
      if (v >= 2) { w.shimmy = 0.3 + 0.8 * T.energy * (1 - T.shyness); w.hiccup = 0.25 + 0.5 * T.drama + 0.3 * T.shyness; w.stretch = 0.2 + 1.2 * sleepy(T); }
      return w;
    }
    function reactionWeights(T, v) {
      const w = { join: 0.35 + 0.8 * T.energy + 0.5 * T.curiosity - 0.3 * T.grump, confused: 0.25 + 0.7 * T.grump + 0.3 * sleepy(T),
        surprised: 0.2 + 0.7 * T.shyness + 0.4 * T.drama, amused: 0.35 + 0.6 * T.curiosity + 0.3 * (1 - T.shyness) };
      if (v >= 2) { w.cheer = 0.2 + 0.7 * T.energy * (1 - T.grump); w.unimpressed = 0.15 + 0.8 * T.grump * (1 - T.shyness); }
      return w;
    }
    // ---------- v3 (EYES 4.7 / iPhone 2.7, "Hangout 2.0: the Playdate update") ----------
    // Derived temperament: every trait comes from the five dials that already travel in ask / yes, so nothing new
    // is stored or sent about an Eye.
    const r2 = (x) => Math.round(x * 100) / 100;
    function traits(T) {
      const sl = sleepy(T);
      return {
        compete: clamp(0.45 * T.energy + 0.3 * T.grump + 0.25 * T.drama),
        mischief: clamp(0.1 + 0.4 * (1 - T.shyness) + 0.3 * T.drama + 0.3 * T.curiosity - 0.15 * sl),
        affection: clamp(0.65 * (1 - T.grump) + 0.2 * T.shyness + 0.15 * (1 - T.drama)),
        attention: clamp(0.35 + 0.45 * T.curiosity - 0.3 * T.energy * T.drama + 0.2 * (1 - sl)),
        recover: clamp(0.55 + 0.5 * T.energy - 0.35 * T.grump - 0.2 * T.drama),
        initiative: clamp(bold(T) * 0.7 + 0.3 * T.curiosity)
      };
    }
    const DANCE = ['spin', 'bounce', 'wobble', 'shimmy', 'twirl', 'sway', 'stomp', 'slide', 'puff'];
    const CUE_GAP = 7;                                   // seconds between two accepted owner cues (either owner)
    function danceWeights(T) {
      return { spin: 0.3 + 0.8 * T.drama, bounce: 0.4 + 0.9 * T.energy, wobble: 0.3 + 0.6 * T.drama, shimmy: 0.3 + 0.7 * T.energy * (1 - T.shyness),
        twirl: 0.25 + 0.6 * T.drama + 0.2 * T.curiosity, sway: 0.3 + 0.8 * sleepy(T) + 0.3 * T.shyness, stomp: 0.2 + 0.7 * T.grump + 0.3 * T.energy,
        slide: 0.25 + 0.5 * T.curiosity + 0.3 * (1 - T.shyness), puff: 0.25 + 0.6 * T.drama };
    }
    function trickWeights(T) {
      const X = traits(T);
      return { poke: 0.6 + 0.8 * X.mischief, startle: 0.3 + 0.7 * T.drama + 0.3 * X.mischief, steal: 0.25 + 0.9 * X.mischief * (1 - T.shyness),
        fakesleep: 0.25 + 0.7 * sleepy(T) + 0.3 * T.drama, bump: 0.35 + 0.6 * T.energy };
    }
    function respWeights(T) {
      const X = traits(T);
      return { retaliate: 0.2 + 0.9 * X.compete * (1 - T.shyness), investigate: 0.3 + 0.8 * T.curiosity, annoyed: 0.2 + 0.9 * T.grump,
        giggle: 0.3 + 0.6 * (1 - T.grump) * T.energy + 0.2 * T.drama, sulk: 0.1 + 0.6 * T.shyness * T.drama + 0.3 * T.shyness * (1 - T.energy) };
    }
    // tug of war: who ends up where. Both phones fall back to this with no cheering; the inviter's phone may send
    // the same function's answer with both owners' cheering folded in ('res'), which the other phone adopts.
    function tugResult(p, ca, cb) {
      if (p.jr < p.jokeP) return { k: 'letgo', w: p.joker };
      const s = p.bias + clamp(((Number(ca) || 0) - (Number(cb) || 0)) * 0.09, -0.9, 0.9);
      if (Math.abs(s) < 0.07 && p.tr < 0.55) return { k: 'tie' };
      return { k: 'win', w: s >= 0 ? 'a' : 'b', how: p.sr < 0.32 ? 'slip' : 'drag' };
    }
    // one activity's details (v3). ctx: { cue: 'play' | 'tease' | 'surprise' | undefined, minutes }
    function gen(kind, r, init, Ta, Tb, ctx) {
      const TT = (x) => (x === 'a' ? Ta : Tb), avg = (k) => (Ta[k] + Tb[k]) / 2, Xa = traits(Ta), Xb = traits(Tb);
      const Ti = TT(init), To = TT(other(init)), Xi = traits(Ti), Xo = traits(To);
      const maxSl = Math.max(sleepy(Ta), sleepy(Tb)), minutes = ctx.minutes || 0;
      let dur, p = {};
      if (kind === 'company') {
        dur = Math.min(55, 12 + 16 * r() + 14 * maxSl + 0.9 * Math.min(minutes, 20));
        p.beats = []; let bt = 2.5 + 3 * r();
        const aff = (Xa.affection + Xb.affection) / 2, mis = Math.max(Xa.mischief, Xb.mischief);
        while (bt < dur - 3) {
          const k = pick(r, { nudge: 0.5 + 0.7 * aff, blinks: 0.6 + 0.6 * aff, lean: 0.45, poke: 0.25 + 0.7 * mis, fakesleep: 0.12 + 0.5 * maxSl, startle: 0.1 + 0.4 * Math.max(Ta.drama, Tb.drama) * mis, gaze: 0.5 + 0.4 * avg('curiosity') });
          const wa = k === 'poke' || k === 'startle' ? Xa.mischief : k === 'fakesleep' ? sleepy(Ta) + 0.2 : k === 'gaze' ? Ta.curiosity : Xa.affection;
          const wb = k === 'poke' || k === 'startle' ? Xb.mischief : k === 'fakesleep' ? sleepy(Tb) + 0.2 : k === 'gaze' ? Tb.curiosity : Xb.affection;
          p.beats.push({ t: r2(bt), k, who: r() * (wa + wb + 0.01) < wa ? 'a' : 'b' });
          bt += (5.5 + 6 * r()) * (1 + maxSl * 0.6) * (1 + Math.min(minutes, 30) / 60);
        }
      } else if (kind === 'fireflies') {
        dur = 18 + 10 * r();
        p.count = 5 + Math.floor(r() * 5); p.fseed = Math.floor(r() * 2 ** 31); p.cross = [];
        const nC = r() < 0.55 ? 2 : 1;
        for (let k = 0; k < nC; k++) p.cross.push({ t: 6 + (dur - 13) * ((k + 0.25 + 0.5 * r()) / nC), from: r() < 0.5 ? 'a' : 'b' });
      } else if (kind === 'goof') {
        dur = 8 + 3 * r();
        p.move = pick(r, moveWeights(Ti, 2)); p.reaction = pick(r, reactionWeights(To, 2));
        p.amp = 0.75 + 0.35 * Ti.drama + 0.15 * r();
        p.joinMove = r() < 0.6 ? pick(r, moveWeights(To, 2)) : p.move;
        p.joinAmp = 0.55 + 0.5 * r() * (0.5 + To.energy); p.joinSpeed = 0.8 + 0.45 * r();
        p.delay = 0.35 + 0.5 * r() + 0.5 * To.shyness + 0.3 * sleepy(To);
        p.finale = r() < 0.6;
      } else if (kind === 'catch') {
        dur = 22 + 8 * r() + 6 * avg('energy'); p.cseed = Math.floor(r() * 2 ** 31);
      } else if (kind === 'tug') {
        dur = 15 + 5 * r(); p.rev = r2(dur - 5.4); p.waves = [];
        let t = 1.7, lead = init;
        while (t < p.rev - 1.1) { p.waves.push({ t: r2(t), lead, k: r2(0.45 + 0.55 * r()) }); t += 1.2 + 1.4 * r(); lead = r() < 0.6 ? other(lead) : lead; }
        p.bias = r2((Xa.compete + 0.35 * Ta.energy) - (Xb.compete + 0.35 * Tb.energy) + (r() - 0.5) * 0.7);
        p.joker = Xa.mischief >= Xb.mischief ? 'a' : 'b';
        p.jokeP = r2(clamp(0.3 * Math.max(Xa.mischief, Xb.mischief) - 0.04, 0.04, 0.3));
        p.jr = r2(r()); p.sr = r2(r()); p.tr = r2(r());
        p.res = tugResult(p, 0, 0);
      } else if (kind === 'tag') {
        dur = 16 + 6 * r(); p.legs = [];
        let it = other(init), t = 1.8;
        while (t < dur - 3.4) {
          const run = other(it), Tit = TT(it), Trun = TT(run);
          const k = pick(r, { chase: 1.5, feint: 0.4 + 0.6 * Tit.drama, hide: 0.25 + 0.8 * Trun.shyness, surprise: 0.2 + 0.7 * traits(Trun).mischief, collide: 0.2 + 0.5 * avg('energy') });
          const d = k === 'chase' ? 2.3 + 1.1 * r() : k === 'hide' ? 3.1 + r() : 1.9 + 0.9 * r();
          if (t + d > dur - 2.6) break;
          const leg = { t: r2(t), d: r2(d), k, it, dy: r() < 0.5 ? -1 : 1, caught: k === 'chase' ? r() < 0.62 : false };
          p.legs.push(leg);
          if (leg.caught) it = run;
          t += d + 0.45 + 0.5 * r();
        }
        p.end = it;
      } else if (kind === 'bubbles') {
        dur = 18 + 6 * r(); p.b = [];
        const n = 9 + Math.floor(r() * 4 + 4 * avg('curiosity'));
        for (let k = 0; k < n; k++) {
          const from = k % 2 === 0 ? init : other(init), Tf = TT(from), tt = 0.9 + (dur - 7.5) * ((k + 0.2 + 0.6 * r()) / n);
          const kd = pick(r, { plain: 2.2, sparkle: 0.7, flies: 0.5, burst: 0.6, more: 0.35, chain: 0.3 });
          const wa = 0.2 + Ta.energy + 0.4 * Ta.curiosity, wb = 0.2 + Tb.energy + 0.4 * Tb.curiosity;
          const by = r() < 0.5 + 0.2 * avg('energy') ? (r() * (wa + wb) < wa ? 'a' : 'b') : '';
          p.b.push({ k, t: r2(tt), from, x: r2((from === 'a' ? 0.02 : 0.6) + 0.38 * r()), s: r2(0.7 + 0.6 * r() * (0.6 + 0.6 * Tf.drama)), sp: r2(0.75 + 0.5 * r()), ph: r2(r() * 6.28), kd, by, pt: r2(tt + 2 + 3.2 * r()) });
        }
      } else if (kind === 'dance') {
        dur = 18 + 6 * r();
        const resp = other(init), Tr = TT(resp);
        p.style = pick(r, { eager: 0.4 + 0.9 * Tr.energy * (1 - Tr.shyness), reluctant: 0.3 + 0.6 * sleepy(Tr) + 0.3 * Tr.grump, embarrassed: 0.15 + 1.0 * Tr.shyness, unimpressed: 0.15 + 0.9 * Tr.grump * (1 - Tr.shyness) });
        p.turns = []; let t = 0.9, who = init, last = '';
        const nT = 4 + Math.floor(r() * 3);
        for (let k = 0; k < nT; k++) {
          let mv = pick(r, danceWeights(TT(who)));
          if (mv === last) mv = DANCE[(DANCE.indexOf(mv) + 1 + Math.floor(r() * 3)) % DANCE.length];   // answers, never copies
          p.turns.push({ t: r2(t), who, mv, amp: r2(0.75 + 0.09 * k + 0.2 * r()) });
          last = mv; t += 2.1 + 0.6 * r(); who = other(who);
          if (t > dur - 5) break;
        }
        p.fin = r2(t + 0.2);                              // the finale follows the last turn
        p.together = p.style === 'eager' || (p.style === 'reluctant' && r() < 0.7) || r() < 0.25;
        dur = p.fin + 3.8;
      } else if (kind === 'discover') {
        dur = 15 + 5 * r();
        p.obj = pick(r, { egg: 1, orb: 1, critter: 0.8 + 0.4 * avg('energy'), crystal: 0.9, magnet: 0.6 + 0.4 * (Xa.affection + Xb.affection) / 2 });
        p.first = ctx.cue === 'surprise' ? init : (Ta.curiosity + (r() - 0.5) * 0.3 >= Tb.curiosity ? 'a' : 'b');
        p.rev = r2(7.2 + 3 * r()); p.oseed = Math.floor(r() * 2 ** 31);
        p.twitch = [r2(p.rev - 3.4 - 0.4 * r()), r2(p.rev - 2.2 - 0.3 * r()), r2(p.rev - 1.1)];
        dur = Math.max(dur, p.rev + 7);
      } else {                                           // mischief
        dur = 8 + 3 * r();
        p.trick = pick(r, trickWeights(Ti)); p.resp = pick(r, respWeights(To));
        p.hes = r2(0.2 + 1.2 * Ti.shyness * r());
        if (ctx.cue === 'tease' && Xi.mischief < 0.36 && r() < 0.6) p.trick = 'nudge';   // too sweet to cause trouble: a nudge instead
        if (p.trick === 'nudge') p.resp = To.grump > 0.6 ? 'annoyed' : 'giggle';
        p.comfort = p.resp === 'sulk' && Xi.affection > 0.35 ? 1 : 0;
        if (p.trick === 'steal') dur += 1.5;
        if (p.comfort) dur += 2.5;
      }
      return { dur, p };
    }
    // what "Play" chooses: something shared that suits both temperaments and what they did lately
    function playWeights(Ta, Tb, recent) {
      const avg = (k) => (Ta[k] + Tb[k]) / 2, Xa = traits(Ta), Xb = traits(Tb), calm = 1 - Math.abs(avg('energy') - 0.5) * 2;
      const w = { tug: 0.5 + 0.8 * (Xa.compete + Xb.compete) / 2, tag: 0.35 + 1.0 * avg('energy'), bubbles: 0.6 + 0.4 * avg('curiosity') + 0.3 * calm,
        dance: 0.3 + 0.6 * avg('drama') + 0.3 * avg('energy'), catch: 0.45 + 0.5 * avg('energy'), fireflies: 0.35 + 0.5 * avg('curiosity'), goof: 0.3 + 0.4 * avg('drama') };
      recent.forEach((k, j) => { if (w[k] != null) w[k] *= j === recent.length - 1 ? 0 : 0.25; });
      return w;
    }
    // the whole Hangout as a lazily grown list of activities (start / dur in seconds from going live).
    // v3: cues = owner nudges [{by, n, at, k}] from both phones. A cue is pure data, so both phones that hold the
    // same cues build the same list; acceptance (CUE_GAP, not during the arrival) is decided here, not by the sender.
    function schedule(seed, Ta, Tb, v, cues) {
      v = Math.max(1, Math.min(3, Number(v) || 1));
      Ta = { ...NEUTRAL, ...Ta }; Tb = { ...NEUTRAL, ...Tb };
      const r0 = mulberry(seed >>> 0);
      const first = bold(Ta) + (r0() - 0.5) * 0.2 >= bold(Tb) ? 'a' : 'b';
      const list = [{ i: 0, kind: 'arrive', start: 0, dur: v >= 3 ? 3.4 : 5.2, init: first, p: {} }];
      const avg = (k) => (Ta[k] + Tb[k]) / 2;
      let lastCatch = -9;
      // v3 state
      const Q = v >= 3 ? (cues || []).filter((c) => c && (c.by === 'a' || c.by === 'b') && Number.isFinite(c.at) && ['play', 'tease', 'surprise'].includes(c.k))
        .map((c) => ({ by: c.by, n: c.n | 0, at: Math.round(c.at * 100) / 100, k: c.k })).sort((x, y) => x.at - y.at || (x.by < y.by ? -1 : x.by > y.by ? 1 : x.n - y.n)) : [];
      const verdict = {};
      let ci = 0, lastCue = -99;
      const lastOf = {}, recent = [];
      const note = (k, i) => { lastOf[k] = i; recent.push(k); if (recent.length > 3) recent.shift(); };
      const spaced = (k, i, n) => i - (lastOf[k] == null ? -99 : lastOf[k]) >= n;
      function growV3() {
        const i = list.length, prev = list[i - 1], r = mulberry((seed ^ Math.imul(i + 1, 0x9e3779b1) ^ 0x3c6ef372) >>> 0);
        const minutes = prev.start / 60, gap = 0.5 + 0.9 * r(), nextStart = prev.start + prev.dur + gap;
        while (ci < Q.length && Q[ci].at < nextStart) {
          const c = Q[ci++], id = c.by + c.n;
          if (verdict[id] != null) continue;                        // the same cue twice: first copy counts
          if (prev.kind === 'arrive' || c.at < prev.start || c.at - lastCue < CUE_GAP) { verdict[id] = false; continue; }
          verdict[id] = true; lastCue = c.at;
          prev.dur = Math.max(0.4, c.at - prev.start);
          let h = seed ^ 0x51ed27; const s = c.by + ':' + c.n + ':' + c.k; for (let j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 16777619); }
          const rc = mulberry(h >>> 0);
          const kind = c.k === 'tease' ? 'mischief' : c.k === 'surprise' ? 'discover' : pick(rc, playWeights(Ta, Tb, recent.concat([prev.kind])));
          const init = c.k === 'play' ? (rc() < 0.7 ? c.by : other(c.by)) : c.by;
          const g = gen(kind, rc, init, Ta, Tb, { cue: c.k, minutes });
          list.push({ i, kind, start: Math.round((c.at + 0.35) * 100) / 100, dur: g.dur, init, p: g.p, cue: c.k, by: c.by });
          if (kind === 'catch') lastCatch = i;
          note(kind, i);
          return;
        }
        const calm = 1 - Math.abs(avg('energy') - 0.5) * 2, Xa = traits(Ta), Xb = traits(Tb);
        const busyPrev = ['catch', 'goof', 'tug', 'tag', 'dance', 'discover', 'bubbles'].includes(prev.kind);
        const slA = (sleepy(Ta) + sleepy(Tb)) / 2, slM = Math.max(sleepy(Ta), sleepy(Tb));
        const w = {
          company: i === 1 ? 0 : (0.6 + 0.4 * calm + 1.3 * slM + 0.08 * Math.min(minutes, 20)) * (busyPrev ? 1.5 : 0.8),
          fireflies: 0.35 + 0.5 * avg('curiosity') + 0.5 * slM,
          goof: 0.35 + 0.5 * avg('energy') + 0.5 * avg('drama'),
          catch: i - lastCatch >= (minutes > 10 ? 5 : 4) ? 0.45 + 0.9 * avg('energy') : 0,
          tug: spaced('tug', i, 4) ? 0.15 + 1.1 * (Xa.compete + Xb.compete) / 2 - 0.3 * slA : 0,
          tag: spaced('tag', i, 4) ? 0.1 + 1.4 * avg('energy') - 0.4 * slA : 0,
          bubbles: spaced('bubbles', i, 3) ? 0.45 + 0.4 * avg('curiosity') + 0.4 * calm + 0.5 * slA : 0,
          dance: spaced('dance', i, 5) ? 0.15 + 0.9 * avg('drama') + 0.3 * avg('energy') : 0,
          discover: i >= 3 && spaced('discover', i, 5) ? 0.3 + 0.55 * avg('curiosity') : 0,
          mischief: spaced('mischief', i, 3) ? 0.25 + 0.85 * Math.max(Xa.mischief, Xb.mischief) : 0
        };
        if (i === 1) { for (const k of ['catch', 'fireflies', 'discover', 'tug', 'dance']) w[k] = 0; }   // something lively and immediate first
        w[prev.kind] = 0;
        recent.forEach((k) => { if (w[k]) w[k] *= 0.35; });
        const kind = pick(r, w);
        const init = r() < 0.7 ? other(prev.init) : prev.init;
        const g = gen(kind, r, init, Ta, Tb, { minutes });
        if (kind === 'catch') lastCatch = i;
        note(kind, i);
        list.push({ i, kind, start: nextStart, dur: g.dur, init, p: g.p });
      }
      function grow() {
        if (v >= 3) return growV3();
        const i = list.length, prev = list[i - 1], r = mulberry((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
        const minutes = prev.start / 60;
        const calm = 1 - Math.abs(avg('energy') - 0.5) * 2;
        const w = {
          company: i === 1 ? 0 : (1.1 + 0.6 * calm + 0.5 * Math.max(sleepy(Ta), sleepy(Tb)) + 0.12 * Math.min(minutes, 20)) * (['catch', 'goof'].includes(prev.kind) ? 1.6 : 1),
          fireflies: 0.9 + 0.6 * avg('curiosity'),
          goof: 0.7 + 0.6 * avg('energy') + 0.5 * avg('drama'),
          catch: i - lastCatch >= (minutes > 10 ? 4 : 3) ? 1.1 + 0.7 * avg('energy') : 0
        };
        w[prev.kind] = 0;                                  // never the same thing twice in a row
        const kind = pick(r, w);
        const init = r() < 0.75 ? other(prev.init) : prev.init;
        const Ti = init === 'a' ? Ta : Tb, To = init === 'a' ? Tb : Ta;
        let dur, p = {};
        if (kind === 'company') dur = Math.min(95, 24 + 40 * r() + 18 * Math.max(sleepy(Ta), sleepy(Tb)) + 1.5 * Math.min(minutes, 20));
        else if (kind === 'fireflies') {
          dur = 24 + 14 * r();
          p.count = 5 + Math.floor(r() * 5);
          p.fseed = Math.floor(r() * 2 ** 31);
          p.cross = [];
          const nC = r() < 0.55 ? 2 : 1;
          for (let k = 0; k < nC; k++) p.cross.push({ t: 6 + (dur - 13) * ((k + 0.25 + 0.5 * r()) / nC), from: r() < 0.5 ? 'a' : 'b' });
        } else if (kind === 'goof') {
          dur = 9 + 4 * r();
          p.move = pick(r, moveWeights(Ti, v));
          p.reaction = pick(r, reactionWeights(To, v));
          p.amp = 0.75 + 0.35 * Ti.drama + 0.15 * r();
          p.joinMove = r() < 0.7 ? p.move : pick(r, moveWeights(To, v));    // joining in, its own way
          p.joinAmp = 0.55 + 0.5 * r() * (0.5 + To.energy);
          p.joinSpeed = 0.8 + 0.45 * r();
          p.delay = 0.45 + 0.7 * r() + 0.5 * To.shyness + 0.4 * sleepy(To);
          p.finale = r() < 0.55;
        } else {
          dur = 24 + 10 * r() + 6 * avg('energy');
          p.cseed = Math.floor(r() * 2 ** 31);
          lastCatch = i;
        }
        const gap = 1.2 + 1.6 * r();
        list.push({ i, kind, start: prev.start + prev.dur + gap, dur, init, p });
      }
      return {
        first, Ta, Tb, v,
        at(i) { while (list.length <= i) grow(); return list[i]; },
        find(t, from) { let i = Math.max(0, Math.min(from | 0, list.length - 1)); while (i > 0 && this.at(i).start > t) i--; while (this.at(i + 1).start <= t) i++; return this.at(i); },
        // v3: was this cue used? (true / false / undefined = not reached yet)
        verdict(by, n) { const id = by + n; if (verdict[id] == null) { const c = Q.find((x) => x.by === by && x.n === n); if (c) this.find(c.at + 1); } return verdict[id]; },
        lastCueAt(t) { this.find(t); return lastCue; }
      };
    }
    const actKey = (a) => (a ? a.i + ':' + a.start.toFixed(2) + ':' + a.kind : '');
    // does the Eye of `role` fumble toss n of catch i? (both phones agree)
    function fumble(seed, i, n, T) {
      const r = mulberry((seed ^ Math.imul(i + 7, 0x85ebca6b) ^ Math.imul(n + 3, 0xc2b2ae35)) >>> 0);
      r();
      const p = clamp(0.08 + 0.14 * T.shyness + 0.16 * sleepy(T) + 0.1 * T.drama - 0.08 * T.curiosity, 0.05, 0.36);
      return r() < p;
    }
    return { seedOf, pack, unpack, word, schedule, fumble, sleepy, traits, tugResult, actKey, MOVES, REACTIONS, DANCE, NEUTRAL, CUE_GAP, VERSION: 3 };
  })();

  // ======================================================================================
  // helpers
  // ======================================================================================
  function motionMode() {
    try { const d = root.Haven && Haven.diagnostics(); if (d && d.motion === false) return 'off'; if (d && d.gentle) return 'gentle'; } catch (e) {}
    if (document.documentElement.dataset.motion === 'off') return 'off';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'gentle';
    return 'on';
  }
  function lowPower() {
    try { const p = root.Haven && Haven.diagnostics().power; if (p) return !!p.saver || (p.battery <= 15 && !p.charging); } catch (e) {}
    return false;
  }
  const myDna = () => (D() && D().has() ? D().dna() : null);
  const myName = () => { const d = myDna(); return (d && d.name) || 'Your Eye'; };
  const friendName = (f) => { if (!f) return 'Their Eye'; if (f.companion && f.parent === 'native') { const p = root.HavenFriend && HavenFriend.profile && HavenFriend.profile(); return (p && p.name) || (f.profile && f.profile.name) || 'Their Eye'; } return f.nick || (f.profile && f.profile.name) || 'Their Eye'; };
  const canHang = (f) => !!(f && f.peer && F() && F().CAPS.includes('hangout') && F().hangoutVia && F().hangoutVia(f));
  const keyOf = (f) => (C() && C().keyOf ? C().keyOf(f) : f && f.code);
  const listeners = {};
  const emit = (n, ...a) => (listeners[n] || []).forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } });
  function historyOf(f) {
    if (!f || !F()) return null;
    if (f.companion && f.parent === 'native') return F().native();
    if (f.companion) return F().list().find((x) => x.code === f.parent) || null;
    return f;
  }

  // ======================================================================================
  // the session (one Hangout at a time)
  // ======================================================================================
  let S = null, card = null;
  const answered = new Set(), oldAsks = new Set();
  let timers = [];
  const later = (fn, ms) => { const id = setTimeout(() => { timers = timers.filter((x) => x !== id); fn(); }, ms); timers.push(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  function send(m) {
    if (!S || !F() || !F().hangout) return Promise.resolve(false);
    S.lastSent = Date.now(); S.sent++;
    return F().hangout(S.f, m);
  }
  // 4.5.1: the relay is shared with Pulse, Battle and everything else. Optional Hangout traffic (throws, taps,
  // the 70 s 'hi') stops while the relay is cooling down after refusing us, and stays under a soft budget of
  // 45 per rolling hour, so a long Hangout can't use up what the rest of EYES needs.
  const SOFT_PER_HOUR = 45;
  const relayLimited = () => { try { const r = F() && F().relayStatus && F().relayStatus(); return !!(r && r.limitedUntil > Date.now()); } catch (e) { return false; } };
  const budgetOk = () => { if (!S) return false; const h = Date.now() - 3600000; S.soft = (S.soft || []).filter((x) => x > h); return S.soft.length < SOFT_PER_HOUR; };
  function sendSoft(m, force) {
    if (!S || relayLimited() || (!force && !budgetOk())) return Promise.resolve(false);
    S.soft = (S.soft || []).concat([Date.now()]);
    return send(m);
  }
  const sendTo = (f, m) => (F() && F().hangout ? F().hangout(f, m) : Promise.resolve(false));
  function newSession(f, role, id) {
    const d = myDna();
    return { f, code: f.code, key: keyOf(f), role, id, phase: role === 'a' ? 'asking' : 'answering', sdMine: rid(10), sdTheirs: null,
      tmMine: PLAN.pack(d && d.T), wMine: PLAN.word(d && d.firstWord), tmTheirs: null, wTheirs: 'calm', nm: friendName(f),
      plan: null, seed: 0, t0ms: 0, lastHeard: Date.now(), lastSent: 0, heardLive: false, sent: 0, peerAway: false, awayAt: 0,
      hiddenAt: 0, tossIn: {}, tossOut: {}, lastTapSent: 0, result: null };
  }
  function busyElsewhere() {
    if (root.EyesDuel && EyesDuel.isOpen && EyesDuel.isOpen()) return 'busy';
    if (root.EyesDuel && EyesDuel._debug && EyesDuel._debug.call && EyesDuel._debug.call()) return 'busy';
    return '';
  }
  const elapsed = () => (S && S.t0ms ? (Date.now() - S.t0ms) / 1000 : 0);

  // ---------- inviting (from the Meeting Space) ----------
  function invite(f) {
    if (!f || S || !canHang(f)) return false;
    if (motionMode() === 'off') { say('Hangout needs motion. Choose On or Gentle in The Optic → Motion.'); return false; }
    const c = C(); if (!c || c.focus() !== keyOf(f)) return false;
    Sfx.unlock();
    try { localStorage.setItem('eyes.hangout.hint.v1', '1'); } catch (e) {}
    S = newSession(f, 'a', rid(10));
    if (F().probe) F().probe(f);
    const ask = { o: 'ask', id: S.id, sd: S.sdMine, tm: S.tmMine, w: S.wMine, nm: myName().slice(0, 16), v: PLAN.VERSION };
    const s = S;
    Ctl.attach();
    say(`Inviting ${S.nm}'s Eye over…`, true);
    send(ask).then((ok) => {
      if (S !== s || S.phase !== 'asking') return;
      if (!ok) { over(relayLimited() ? 'limited' : 'failed'); return; }
      S.askSent = true; Ctl.refresh();
      say(`${S.nm}'s Eye has a minute to answer.`, true);
      const again = () => later(() => { if (S === s && S.phase === 'asking') { send(ask); again(); } }, RESEND_MS);
      again();
      later(() => { if (S === s && S.phase === 'asking') { send({ o: 'cancel', id: S.id }); over('timeout'); } }, ASK_MS);
    });
    return true;
  }
  function cancelAsk() {
    if (!S || S.phase !== 'asking') return;
    send({ o: 'cancel', id: S.id });
    over('cancelled');
  }

  // ---------- incoming ----------
  function onHangout(f, m, t) {
    if (!m || typeof m.o !== 'string' || !ID_RE.test(String(m.id || ''))) return;
    const o = m.o, id = m.id;
    const mine = S && S.code === f.code && S.id === id;
    if (mine) { S.lastHeard = Date.now(); if (o !== 'ask' && o !== 'cancel') S.heardLive = true; }
    if (o === 'ask') {
      if (!SD_RE.test(String(m.sd || ''))) return;
      if (Date.now() - t > ASK_MS) return;
      if (mine && S.role === 'b' && S.phase === 'live') { send({ o: 'yes', id: S.id, sd: S.sdMine, tm: S.tmMine, w: S.wMine, v: PLAN.VERSION }); return; }  // our yes was lost
      if (card && card.id === id) return;
      if (answered.has(id) || mine) return;
      if (S && S.code === f.code && S.phase === 'asking') {
        // both reached at once: the smaller id is the one Hangout, the other quietly becomes the answer
        if (id < S.id) { clearTimers(); S = null; Ctl.detach(true); S = newSession(f, 'b', id); return accept(m, true); }
        return;
      }
      const why = S ? 'busy' : busyElsewhere() || (motionMode() === 'off' ? 'still' : '');
      if (why) { sendTo(f, { o: 'no', id, why }); if (why === 'still') flash(`${friendName(f)}'s Eye wanted to hang out. Hangout needs motion turned on.`); return; }
      showInvite(f, m, t);
      return;
    }
    if (o === 'cancel') {
      if (card && card.id === id) hideInvite(`${friendName(f)}'s Eye stopped waiting.`);
      if (mine && S.phase === 'answering') over('faded');
      else if (mine && S.role === 'b' && S.phase === 'live' && !S.heardLive) over('faded');   // they never heard our yes
      return;
    }
    if (!mine) return;
    if (o === 'yes' && S.role === 'a' && S.phase === 'asking') {
      if (!SD_RE.test(String(m.sd || ''))) return;
      clearTimers();
      S.sdTheirs = m.sd; S.tmTheirs = m.tm; S.wTheirs = PLAN.word(m.w); S.vTheirs = Number(m.v) || 1;
      go();
      send({ o: 'hi', id: S.id });                          // so the accepter knows we're here too
      return;
    }
    if (o === 'no' && S.phase === 'asking') { clearTimers(); over(m.why === 'busy' ? 'busy' : m.why === 'still' ? 'still' : 'declined'); return; }
    if (S.phase !== 'live') { if (o === 'bye' && ['asking', 'answering'].includes(S.phase)) over('left'); return; }
    if (o === 'toss') { Ctl.theirToss(m); return; }
    if (S.v >= 3) {
      if (Array.isArray(m.cq) && m.cq.length) theirCues({ h: m.cq, n: 0 });          // history riding on hi / back
      if (o === 'cue') { theirCues(m); return; }
      if (o === 'cueok') { S.cueAcked[Number(m.n) | 0] = 1; return; }
      if (o === 'push') { if (m.w === 'a' || m.w === 'b') Ctl.theirPush(Number(m.i) | 0, m.w, clamp(Number(m.k) / 4, 0, 40)); return; }
      if (o === 'pop') { if (Array.isArray(m.b)) Ctl.theirPops(Number(m.i) | 0, m.b.slice(0, 24).map((x) => Number(x) | 0)); return; }
      if (o === 'obj') { Ctl.theirObj(Number(m.i) | 0); return; }
      if (o === 'res') { if (S.role === 'b' && m.r && typeof m.r === 'object') Ctl.theirRes(Number(m.i) | 0, m.r); return; }
    }
    if (o === 'tap') { if (m.w === 'a' || m.w === 'b') Ctl.remoteTap(m.w); return; }
    if (o === 'away') { if (!S.peerAway) { S.peerAway = true; S.awayAt = Date.now(); Ctl.peerAway(true); } return; }
    if (o === 'back') { if (S.peerAway) { S.peerAway = false; Ctl.peerAway(false); } return; }
    if (o === 'bye') { theyLeft(m.why); return; }
  }

  // ---------- answering ----------
  function showInvite(f, m, t) {
    hideInvite();
    const left = Math.max(5000, ASK_MS - Math.max(0, Date.now() - t));
    card = { f, id: m.id, m, t, until: Date.now() + left, key: keyOf(f) };
    card.timer = setTimeout(() => { if (card && card.id === m.id) hideInvite(); }, left);
    const c = C();
    if (c && c.isOpen() && c.focus() === card.key) { Ctl.attachInvite(); return; }
    Card.show(card);
  }
  function hideInvite(note) {
    if (!card) return;
    clearTimeout(card.timer); answered.add(card.id); if (answered.size > 40) answered.delete(answered.values().next().value);
    card = null; Card.hide(); Ctl.dropInvite();
    if (note) flash(note);
  }
  function decline() {
    if (!card) return;
    sendTo(card.f, { o: 'no', id: card.id, why: 'no' });
    hideInvite();
  }
  function acceptInvite() {
    if (!card || S) return;
    const c0 = card; hideInvite();
    if (Date.now() > c0.until) { flash('That invitation already faded.'); return; }
    if (motionMode() === 'off') { sendTo(c0.f, { o: 'no', id: c0.id, why: 'still' }); flash('Hangout needs motion. Choose On or Gentle in The Optic → Motion.'); return; }
    const c = C(); if (!c) return;
    Sfx.unlock();
    try { localStorage.setItem('eyes.hangout.hint.v1', '1'); } catch (e) {}
    if (!c.isOpen() || c.focus() !== c0.key) c.meet(c0.key);
    S = newSession(c0.f, 'b', c0.id);
    accept(c0.m, false);
  }
  function accept(m, crossed) {
    S.sdTheirs = m.sd; S.tmTheirs = m.tm; S.wTheirs = PLAN.word(m.w); S.vTheirs = Number(m.v) || 1;
    const c = C();
    if (!c || c.focus() !== S.key) { if (c) c.meet(S.key); }
    Ctl.attach();
    say(crossed ? 'You both reached for a Hangout at once.' : `Heading over to ${S.nm}'s Eye…`, true);
    const s = S;
    send({ o: 'yes', id: S.id, sd: S.sdMine, tm: S.tmMine, w: S.wMine, v: PLAN.VERSION }).then((ok) => {
      if (S !== s || S.phase !== 'answering') return;
      if (!ok) { over('failed'); return; }
      go();
    });
  }

  // ---------- live ----------
  function go() {
    const Ta = S.role === 'a' ? PLAN.unpack(S.tmMine) : PLAN.unpack(S.tmTheirs);
    const Tb = S.role === 'a' ? PLAN.unpack(S.tmTheirs) : PLAN.unpack(S.tmMine);
    S.seed = S.role === 'a' ? PLAN.seedOf(S.sdMine, S.sdTheirs) : PLAN.seedOf(S.sdTheirs, S.sdMine);
    S.wa = S.role === 'a' ? S.wMine : S.wTheirs; S.wb = S.role === 'a' ? S.wTheirs : S.wMine;
    S.Ta = Ta; S.Tb = Tb; S.v = Math.min(PLAN.VERSION, S.vTheirs || 1);
    S.cues = []; S.cueN = 0; S.cueAcked = {}; S.res = {}; S.cheer = {}; S.part = [];
    pushQ = null; popQ = []; popT = 0; queuePush.t = 0;
    S.plan = PLAN.schedule(S.seed, Ta, Tb, S.v, S.cues);
    S.phase = 'live'; S.t0ms = Date.now(); S.lastHeard = Date.now();
    say('');
    Ctl.start();
    if (S.v >= 3) later(() => Ctl.refresh(), 3800);            // the nudges wake up once the hellos are done
    watch();
  }

  // ======================================================================================
  // v3: the owners' nudges (Play / Tease / Surprise), cheering, shared objects. Only between two v3 phones.
  // ======================================================================================
  const v3 = () => !!(S && S.phase === 'live' && S.v >= 3);
  const COOLDOWN_S = 9, CUE_LEAD = 1.0, PART_PER_HOUR = 70;
  const partOk = () => { if (!S) return false; const h = Date.now() - 3600000; S.part = (S.part || []).filter((x) => x > h); return S.part.length < PART_PER_HOUR; };
  function sendPart(m) {                                 // participation traffic: its own soft budget, never during a relay cool-down
    if (!v3() || relayLimited() || !partOk()) return Promise.resolve(false);
    S.part.push(Date.now());
    return send(m);
  }
  function replan() {
    if (!S || !S.plan) return;
    S.plan = PLAN.schedule(S.seed, S.Ta, S.Tb, S.v, S.cues);
  }
  function addCue(c) {                                   // idempotent: the same {by, n} is kept once
    if (!S || !c || (c.by !== 'a' && c.by !== 'b') || !['play', 'tease', 'surprise'].includes(c.k) || !Number.isFinite(Number(c.at))) return false;
    const n = Number(c.n) | 0, at = Math.round(Number(c.at) * 100) / 100;
    if (n < 1 || at < 0 || at > 86400 || S.cues.some((x) => x.by === c.by && x.n === n)) return false;
    if (S.cues.length > 400) S.cues.splice(0, 100);      // a very long Hangout: the oldest cues are long settled
    S.cues.push({ by: c.by, n, at, k: c.k });
    return true;
  }
  const myCues = () => (S ? S.cues.filter((c) => c.by === S.role).slice(-6).map((c) => [c.n, c.at, c.k]) : []);
  // can this owner nudge right now? '' when yes, otherwise a reason (used by the controls)
  function cueBlock() {
    if (!v3()) return 'off';
    if (S.peerAway) return 'away';
    const tt = elapsed();
    if (tt < 3.6) return 'arrive';
    if (S.lastCueMine && tt - S.lastCueMine < COOLDOWN_S) return 'cool';
    const last = S.plan.lastCueAt(tt + CUE_LEAD);
    if (tt + CUE_LEAD - last < PLAN.CUE_GAP) return 'cool';
    if (relayLimited()) return 'relay';
    return '';
  }
  function nudge(k) {
    if (cueBlock()) return false;
    S.cueN += 1;
    const c = { by: S.role, n: S.cueN, at: elapsed() + CUE_LEAD, k };
    addCue(c); replan();
    S.lastCueMine = elapsed();
    Ctl.cued(c, true);
    const s = S, m = () => ({ o: 'cue', id: s.id, by: c.by, n: c.n, at: Math.round(c.at * 100) / 100, k, h: myCues() });
    send(m());
    // resend until the other phone confirms (lost messages), then the history in later cues repairs the rest
    [2500, 6000, 12000].forEach((ms) => later(() => { if (S === s && S.phase === 'live' && !S.cueAcked[c.n]) send(m()); }, ms));
    later(() => Ctl.refresh(), (COOLDOWN_S + 0.2) * 1000);
    return true;
  }
  function theirCues(m) {
    const by = S.role === 'a' ? 'b' : 'a';
    let changed = false;
    if (addCue({ by, n: m.n, at: m.at, k: m.k })) { changed = true; Ctl.cued(S.cues[S.cues.length - 1], false); }
    if (Array.isArray(m.h)) for (const x of m.h.slice(-8)) if (Array.isArray(x) && addCue({ by, n: x[0], at: x[1], k: x[2] })) changed = true;
    if (changed) { replan(); Ctl.refresh(); }
    if (Number(m.n) > 0) send({ o: 'cueok', id: S.id, n: Number(m.n) | 0 });
  }
  // cheering: cumulative per activity, so a lost or repeated 'push' never double counts
  function cheerOf(key) { if (!S) return { a: 0, b: 0 }; return (S.cheer[key] = S.cheer[key] || { a: 0, b: 0 }); }
  let pushQ = null, pushAt = 0;
  function queuePush(i, key) {
    if (!v3()) return;
    pushQ = { i, key };
    const wait = Math.max(0, 2000 - (Date.now() - pushAt));
    if (!queuePush.t) queuePush.t = later(() => {
      queuePush.t = 0; if (!pushQ || !v3()) return;
      const q = pushQ; pushQ = null; pushAt = Date.now();
      sendPart({ o: 'push', id: S.id, i: q.i, w: S.role, k: Math.round(cheerOf(q.key)[S.role] * 4) });
    }, wait);
  }
  let popQ = [], popT = 0;
  function queuePop(i, idx) {
    if (!v3()) return;
    popQ.push(idx);
    if (!popT) popT = later(() => { popT = 0; if (!popQ.length || !v3()) { popQ = []; return; } const b = [...new Set(popQ)].slice(0, 24); popQ = []; sendPart({ o: 'pop', id: S.id, i, b }); }, 1200);
  }
  // the quiet watchdog: one timer every 5 s, no networking unless something is actually due
  function watch() {
    const s = S;
    later(() => {
      if (S !== s || S.phase !== 'live') return;
      const now = Date.now();
      if (document.visibilityState === 'visible' && !S.hiddenAt) {
        if (now - S.lastSent > TM.hi) sendSoft(S.v >= 3 && S.cues.length ? { o: 'hi', id: S.id, cq: myCues() } : { o: 'hi', id: S.id }, true);
        if (S.role === 'b' && !S.heardLive && now - S.t0ms > TM.firstWord) { over(F().connection(S.f) === 'online' ? 'quiet' : 'lost'); return; }
        if (S.peerAway && now - S.awayAt > TM.awayMax) { over('gone'); return; }
        if (!S.peerAway && now - S.lastHeard > TM.silent) { over(F().connection(S.f) === 'online' ? 'quiet' : 'lost'); return; }
        if (S.offlineAt && now - S.offlineAt > 60000) { over('lost'); return; }
      }
      watch();
    }, 5000);
  }
  function theyLeft(why) {
    if (!S || S.phase !== 'live') return;
    S.phase = 'leaving'; S.leaveWhy = why === 'bye' ? 'theyBye' : 'left';
    Ctl.farewell('them');
    later(() => over(S && S.leaveWhy), 2600);
  }
  function sayGoodbye() {
    if (!S) return;
    if (S.phase === 'asking') return cancelAsk();
    if (S.phase === 'answering') { send({ o: 'bye', id: S.id, why: 'stop' }); over('stopped'); return; }
    if (S.phase !== 'live') return;
    send({ o: 'bye', id: S.id, why: 'bye' });
    S.phase = 'leaving'; S.leaveWhy = 'done';
    Ctl.farewell('me');
    later(() => over('done'), 2400);
  }
  function over(why) {
    if (!S || S.phase === 'over') return;
    clearTimers();
    const s = S, was = S.phase, secs = elapsed();
    S.phase = 'over'; S.result = why;
    if (s.t0ms && secs >= MIN_KEEP_S) {
      const h = historyOf(s.f);
      if (h) { h.stats = h.stats || {}; h.firsts = h.firsts || {}; h.stats.hangouts = (h.stats.hangouts || 0) + 1; if (!h.firsts.hangout) h.firsts.hangout = Date.now(); try { F().touch(); } catch (e) {} }
    }
    const nm = s.nm, mins = Math.round(secs / 60);
    const long = secs < 50 ? 'for a little while' : mins <= 1 ? 'for about a minute' : `for about ${mins} minutes`;
    const text = {
      done: `${myName()} and ${nm} hung out ${long}.`,
      theyBye: `${nm}'s Eye waved goodbye. They hung out ${long}.`,
      left: `${nm} left EYES, so their Eye waved and went home.`,
      gone: `${nm} didn't come back, so their Eye went home.`,
      declined: `${nm}'s Eye would rather not right now. That's fine.`,
      busy: `${nm}'s Eye is busy with something else right now.`,
      still: `${nm} has Motion turned off, so their Eye can't come over right now.`,
      timeout: `No answer. ${nm}'s Eye might be resting.`,
      failed: "Your Eye's invitation couldn't leave this phone. Check your connection.",
      limited: 'The messaging relay is limiting sends right now. Try again in a few minutes.',
      faded: 'That invitation had already faded.',
      quiet: `${nm}'s Eye went quiet, so the Hangout ended there.`,
      lost: `Lost touch with ${nm}'s Eye. Check your connection.`,
      cancelled: '', away: '', stopped: '', closed: ''
    }[why];
    if (text) say(text, false);
    setTimeout(() => { if (!S || S.phase === 'over') Sfx.sleep(); }, 2500);
    emit('end', { friend: s.f, result: why, was, seconds: Math.round(secs) });
    // 5.0: a Hangout that really happened leaves the Eye content for a while (eyes-living.js, EyesFeel)
    if (was === 'live' && secs >= 30 && !['failed', 'limited', 'declined', 'busy', 'still', 'timeout', 'faded'].includes(why)) { try { if (root.EyesFeel) EyesFeel.report('hangout', { seconds: Math.round(secs) }); } catch (e) {} }
    Ctl.end(why);
    later(() => { if (S === s) { S = null; Ctl.detach(); } }, ['cancelled', 'closed', 'away', 'stopped'].includes(why) ? 60 : END_HOLD_MS);
  }
  function stop(why) {                                          // the owner closed, left the Meeting Space or EYES
    if (!S) return;
    if (S.phase === 'asking') return cancelAsk();
    if (S.phase === 'live' || S.phase === 'answering' || S.phase === 'leaving') { if (S.phase !== 'leaving') send({ o: 'bye', id: S.id, why: why || 'stop' }); }
    over(why === 'close' || why === 'mode' || why === 'replaced' ? 'closed' : why === 'away' ? 'away' : 'stopped');
  }
  function say(text, hold) { const c = C(); if (c && c.isOpen() && c.say) c.say(text, hold); else if (text) flash(text); }
  function flash(text) { if (root.EyesSocial && EyesSocial.caption) EyesSocial.caption(text, 4200); }

  // leaving EYES: a short absence is a pause (their Eye dozes on the other phone); a long one ends it
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (!S) return;
      if (S.phase === 'asking' || S.phase === 'answering') { stop('away'); return; }
      if (S.phase === 'live' && !S.hiddenAt) { S.hiddenAt = Date.now(); send({ o: 'away', id: S.id }); }
      Sfx.sleep();
      return;
    }
    if (card && Date.now() > card.until) hideInvite();
    if (S && S.phase === 'live' && S.hiddenAt) {
      const gone = Date.now() - S.hiddenAt; S.hiddenAt = 0;
      if (gone > TM.hiddenMax) { stop('away'); return; }
      S.lastHeard = Math.max(S.lastHeard, Date.now() - 30000);   // don't count our own absence as their silence
      send(S.v >= 3 && S.cues.length ? { o: 'back', id: S.id, cq: myCues() } : { o: 'back', id: S.id });
      Sfx.unlock();
      Ctl.wokeUp();
    }
  });
  addEventListener('offline', () => { if (S && S.phase === 'live' && !S.offlineAt) S.offlineAt = Date.now(); });
  addEventListener('online', () => { if (S) S.offlineAt = 0; });

  // ======================================================================================
  // sound (Hangout only; the home screen stays silent). Synthesized, quiet, with its own mute.
  // ======================================================================================
  const Sfx = (() => {
    let ac = null, master = null, muted = false;
    try { muted = localStorage.getItem('eyes.hangout.sound') === 'off'; } catch (e) {}
    function unlock() {                                   // only from a tap (iOS needs a gesture)
      try {
        if (!ac) { const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return; ac = new AC(); master = ac.createGain(); master.gain.value = 0.13; master.connect(ac.destination); }
        if (ac.state === 'suspended') ac.resume();
      } catch (e) {}
    }
    const ok = () => !!(ac && !muted && ac.state === 'running' && document.visibilityState === 'visible' && motionMode() !== 'off');
    function tone(f0, f1, dur, type, gain, delay) {
      const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1 || f0), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain || 0.5, t + Math.min(0.02, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, f0, f1, gain, delay) {
      const t = ac.currentTime + (delay || 0), n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = b; f.type = 'bandpass'; f.Q.value = 2.2; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(gain || 0.4, t); s.connect(f); f.connect(g); g.connect(master); s.start(t);
    }
    // each Eye has its own voice: a pitch from its temperament
    const voice = (T) => 420 * Math.pow(2, ((T ? T.energy : 0.5) - 0.5) * 0.9 - (T ? T.shyness - 0.5 : 0) * 0.3);
    const SOUNDS = {
      hello: (T, d) => { const v = voice(T); tone(v, v * 1.5, 0.11, 'sine', 0.35, d); tone(v * 1.2, v * 1.9, 0.13, 'sine', 0.3, (d || 0) + 0.12); },
      bye: (T, d) => { const v = voice(T); tone(v * 1.6, v * 1.2, 0.14, 'sine', 0.3, d); tone(v * 1.25, v * 0.85, 0.2, 'sine', 0.25, (d || 0) + 0.16); },
      conjure: () => { for (let i = 0; i < 5; i++) tone(1400 + Math.random() * 900, 1800 + Math.random() * 900, 0.18, 'sine', 0.08, i * 0.11); },
      toss: () => { noise(0.32, 2200, 500, 0.25); tone(500, 900, 0.18, 'sine', 0.08); },
      incoming: () => tone(1500, 700, 0.42, 'sine', 0.07),
      catch: (T) => { const v = voice(T); tone(v * 2.1, v * 2, 0.16, 'triangle', 0.35); tone(140, 90, 0.09, 'sine', 0.35); },
      fumble: () => { tone(520, 230, 0.26, 'sine', 0.3); tone(230, 260, 0.1, 'sine', 0.2, 0.28); },
      absorb: () => { tone(900, 1700, 0.35, 'sine', 0.15); tone(1700, 2400, 0.25, 'sine', 0.08, 0.2); },
      chime: () => { tone(1320, 1320, 0.7, 'sine', 0.06); tone(1980, 1980, 0.5, 'sine', 0.04, 0.05); },
      boing: (T) => { const v = voice(T) * 0.6; tone(v, v * 2.2, 0.16, 'sine', 0.25); },
      spin: () => noise(0.5, 400, 2400, 0.18),
      giggle: (T) => { const v = voice(T) * 1.6; for (let i = 0; i < 4; i++) tone(v * (1 + (i % 2) * 0.12), v * 1.1, 0.06, 'sine', 0.13, i * 0.085); },
      pop: (T) => { const v = voice(T); tone(v * 1.8, v * 2.6, 0.07, 'sine', 0.22); },
      // 4.7
      boo: (T) => { const v = voice(T); tone(v * 0.9, v * 2.4, 0.12, 'triangle', 0.32); tone(v * 2.4, v * 1.7, 0.18, 'sine', 0.2, 0.11); },
      pull: (k) => noise(0.22 + 0.2 * (k || 0.5), 260, 520, 0.08 + 0.08 * (k || 0.5)),
      snap: () => { noise(0.16, 3200, 900, 0.3); tone(900, 240, 0.2, 'sine', 0.18); },
      bloop: (T) => { const v = voice(T) * 0.7; tone(v, v * 1.6, 0.14, 'sine', 0.14); },
      popb: (r) => { const f = 2400 - Math.min(1600, (r || 14) * 40); tone(f, f * 1.5, 0.05, 'sine', 0.16); noise(0.05, f * 1.2, f * 2, 0.08); },
      shimmer: () => { for (let i = 0; i < 6; i++) tone(1700 + i * 160, 2100 + i * 160, 0.3, 'sine', 0.05, i * 0.09); },
      twitch: (j) => tone(300 + (j || 0) * 90, 210 + (j || 0) * 70, 0.09, 'triangle', 0.18),
      crack: () => { noise(0.08, 2600, 1800, 0.3); noise(0.08, 2200, 1400, 0.25, 0.12); },
      confetti: () => { for (let i = 0; i < 7; i++) tone(900 + Math.random() * 1600, 1400 + Math.random() * 1600, 0.12, 'sine', 0.06, i * 0.04); },
      whoosh: () => noise(0.6, 300, 1600, 0.16)
    };
    function play(name, ...a) { if (!ok() || !SOUNDS[name]) return; try { SOUNDS[name](...a); } catch (e) {} }
    function setMuted(m) { muted = !!m; try { localStorage.setItem('eyes.hangout.sound', muted ? 'off' : 'on'); } catch (e) {} }
    function sleep() { try { if (ac && ac.state === 'running') ac.suspend(); } catch (e) {} }
    return { unlock, play, setMuted, sleep, muted: () => muted };
  })();
  const buzz = (p) => { try { if (navigator.vibrate && motionMode() !== 'off') navigator.vibrate(p); } catch (e) {} };   // Android only; iPhones ignore it

  // ======================================================================================
  // the controller: draws the Hangout with the Meeting Space's own two Eyes
  // 4.5.1: head to head. Your Eye sits big in the lower part of the screen; theirs leans in through a soft
  // doorway at the top edge, as if the two phones lay top to top. Their Eye's body moves mirrored (their "up"
  // points at you). The ball and travelling fireflies really leave through that edge and arrive through it.
  // ======================================================================================
  const Ctl = (() => {
    let attached = null, me = null, them = null, endAt = 0, endWhy = '';
    let fx = null, fg = null, fW = 0, fH = 0, fdpr = 1, lastT = 0, input = null, drew = false;
    const A = { me: null, them: null };                 // actors
    let act = null, actI = -1, actK = '', ast = {};                // current activity and its local state
    let ball = null, flies = [], sparks = [], rings = [], motes = [];
    let farewellAt = 0, farewellWho = '', tipUntil = 0, toldFlick = false, toldRelay = 0, seamY = 80, seamFlash = 0;
    const host = () => C();
    let stageB = null, stageAt = 0;
    const stage = () => { const t = nowS(); if (!stageB || t - stageAt > 0.5) { stageAt = t; try { stageB = host().bounds && host().bounds(); } catch (e) { stageB = null; } } return stageB; };
    const G = 2600;                                      // px/s², for hops

    // ---------- attach / detach ----------
    function attach() {
      const c = host(); if (!c) return;
      const obj = { layout: true, pairLayout, behave, sky, panel, busy, quiet, onClose, back: onBack };
      if (attached && attached.invite) attached = null;
      if (c.attach(obj)) { attached = obj; reset(); }
    }
    // Match iPhone Meeting Space compact pair geometry; track top for cross-phone effects.
    function pairLayout(themKey, B, W, H) {
      const out = new Map(), wide = W / B.h > 0.8;
      const s = wide ? Math.min(W * 0.36, B.h * 0.78, 300) : Math.min(W * 0.42, B.h * 0.62, 320);
      const y = B.top + B.h * 0.5;
      out.set('me', { x: W * (wide ? 0.27 : 0.28), y, size: s * (wide ? 0.94 : 0.92), op: 1 });
      out.set(themKey, { x: W * (wide ? 0.73 : 0.72), y, size: s, op: 1 });
      seamY = B.top;
      return out;
    }
    function attachInvite() {
      const c = host(); if (!c || S) return;
      const obj = { invite: true, layout: false, behave: behaveInvite, panel: panelInvite, onClose: () => { attached = null; } };
      if (c.attach(obj)) attached = obj;
    }
    function dropInvite() { if (attached && attached.invite) { const c = host(); const a = attached; attached = null; if (c) c.detach(a); } }
    function detach(silent) { const c = host(); const a = attached; attached = null; teardown(); if (c && a) c.detach(a); if (!silent && c) c.panelRefresh(); }
    function refresh() { const c = host(); if (c) c.panelRefresh(); }
    function onClose(why) {
      const a = attached; attached = null; teardown();
      if (a && a.invite) return;
      if (S) stop(why);
    }
    function onBack() { if (S && S.phase === 'live') { sayGoodbye(); return true; } if (S && S.phase === 'leaving') return true; return false; }
    function reset() { A.me = A.them = null; act = null; actI = -1; actK = ''; ast = {}; toys = freshToys(); hold = null; ball = null; flies = []; sparks = []; rings = []; motes = []; endAt = 0; farewellAt = 0; lastT = 0; seamFlash = 0; }
    function teardown() {
      if (fx) { fx.remove(); fx = fg = null; }
      if (input) { input.off(); input = null; }
      reset();
    }
    // 4.7: nothing at all moving in a quiet moment → the Meeting Space may drop to ~20 fps
    function quiet() {
      if (!S || S.phase !== 'live' || !act || !A.me || busy()) return false;
      if (!(act.kind === 'company' || elapsed() - act.start >= act.dur || S.peerAway)) return false;
      if (flies.length || ball || toys.rope || toys.obj || toys.pebble) return false;
      return ![A.me, A.them].some((a) => a.move || a.air || a.spin || Math.abs(a.vx) > 8 || Math.abs(a.vq) > 0.3 || a.todo.length);
    }
    function start() { reset(); tipUntil = nowS() + 14; const b = host() && host().bounds && host().bounds(); if (b) seamY = b.top; ensureFx(); bindInput(); refresh(); }
    function end(why) { endAt = nowS(); endWhy = why; refresh(); }
    function busy() {
      if (!S || lowPower()) return false;
      if (S.phase === 'leaving' || (S.phase === 'over' && nowS() - endAt < 1.6)) return true;
      if (ball && ball.st !== 'held' && ball.st !== 'theirs') return true;   // a ball in the air
      if (sparks.length || rings.length || motes.length) return true;
      if (act && (act.kind === 'arrive' || act.kind === 'goof')) return true;
      if (act && PLAY[act.kind] && elapsed() - act.start < act.dur) return true;      // 4.7 activities move all the time
      if (toys.conf.length || toys.cheers.length || toys.kids.length || toys.fadeB.length) return true;
      return !!(A.me && A.them && (A.me.air || A.them.air || A.me.move || A.them.move || Math.abs(A.them.vy) > 30));
    }

    // ---------- the effects layer, above the Eyes (pointer-events: none) ----------
    function ensureFx() {
      const el = document.getElementById('eyesContact'); if (!el) return;
      if (fx && fx.isConnected) return;
      fx = document.createElement('canvas'); fx.className = 'eh-fx'; fx.setAttribute('aria-hidden', 'true');
      const stage = el.querySelector('.ec-stage');
      if (stage && stage.nextSibling) el.insertBefore(fx, stage.nextSibling); else el.appendChild(fx);
      fg = fx.getContext('2d'); fW = fH = 0; drew = false;
    }
    function sizeFx() {
      if (!fx) return false;
      const w = fx.clientWidth || innerWidth, h = fx.clientHeight || innerHeight, d = Math.min(devicePixelRatio || 1, 1.5);
      if (w !== fW || h !== fH || d !== fdpr) { fW = w; fH = h; fdpr = d; fx.width = Math.round(w * d); fx.height = Math.round(h * d); }
      fg.setTransform(fdpr, 0, 0, fdpr, 0, 0);
      return true;
    }

    // ---------- actors: a body with springs, hops and squash, on top of the Eye's own gaze/lids/pupil ----------
    // Each body works in its own frame: −y is "toward the other Eye". Your Eye's frame is the screen's; theirs is
    // flipped (yd = −1), because their phone faces yours top to top.
    function actor(key, n) {
      const myRole = S.role, role = key === 'me' ? myRole : (myRole === 'a' ? 'b' : 'a');
      const T = { ...PLAN.NEUTRAL, ...(role === 'a' ? S.plan.Ta : S.plan.Tb) };
      return { key, role, n, T, w: role === 'a' ? S.wa : S.wb, yd: 1,
        x: 0, y: 0, r: 0, s: 1, q: 0, vx: 0, vy: 0, vr: 0, vs: 0, vq: 0, gx: 0, gy: 0, gr: 0, gs: 1, gq: 0,
        air: false, jy: 0, jv: 0, spin: null, lid: 0, lidGoal: 0.1, next: nowS() + rnd(1.5, 4), todo: [], move: null, fav: null,
        breathe: rnd(3.2, 4.6), ph: rnd(0, TAU), tapAt: 0, doze: 0, lean: 0, away: 0,
        X: PLAN.traits(T), kx: 60, ky: 90, boost: 0, trail: [], trailOn: false, gsx: 0 };
    }
    const other = (a) => (a === A.me ? A.them : A.me);
    const byRole = (role) => (A.me && A.me.role === role ? A.me : A.them);
    const pos = (a) => host().pos(a.n);
    const size = (a) => a.n.size || 120;
    // which way is the other Eye: from the two home spots, so it never flips while they chase past each other
    const dirTo = (a) => Math.sign(other(a).n.x - a.n.x) || (a === A.me ? 1 : -1);
    const soon = (a, dt, fn) => a.todo.push({ at: nowS() + dt * speedK(), fn });
    const speedK = () => (S && S.gentle ? 1.35 : 1);
    const ampK = () => (S && S.gentle ? 0.55 : 1);
    function look(a, x, y, hold) { host().lookAt(a.n, x, y, hold || 0.3); }
    function lookAtOther(a, hold) { const p = pos(other(a)); look(a, p.x, p.y, hold || 1); }
    // gx, gy in the Eye's own frame (−gy: toward the other Eye)
    function lookDir(a, gx, gy, hold) { const e = a.n.eye; if (!e) return; e.setTarget(clamp(gx, -1, 1), clamp(gy * a.yd, -1, 1)); e.reactUntil = nowS() + (hold || 0.6); a.n.ctl.until = nowS() + (hold || 0.6); }
    function blink(a, slow) { const e = a.n.eye; if (e && e.blinkT < 0) { e.blinkT = nowS(); e.slowBlink = !!slow; e.blinkQueue = 0; } }
    function dblink(a) { const e = a.n.eye; if (e && e.blinkT < 0) { e.blinkT = nowS(); e.slowBlink = false; e.blinkQueue = 1; } }
    function mood(a, squint, wide) { const e = a.n.eye; if (!e) return; e.moodGoal.squint = squint || 0; e.moodGoal.wide = wide || 0; }
    function pupil(a, goal, kick) { const e = a.n.eye; if (!e) return; if (goal != null) e.pupilGoal = goal; if (kick) e.pupilV += kick; }
    function crouch(a, k) { a.vq += 2.4 * (k || 1); a.vy += 60 * (k || 1); }
    function hop(a, h) {                                        // h: height in Eye sizes; with a tiny crouch first
      if (a.air) return;
      crouch(a, 0.7);
      soon(a, 0.09, () => { if (a.air) return; a.air = true; a.jv = -Math.sqrt(2 * G * h * size(a) * ampK()) / Math.sqrt(speedK()); });
    }
    function relax(a) { a.gx = dirTo(a) * (a.lean - a.away); a.gy = 0; a.gr = 0; a.gs = 1; a.gq = 0; a.lidGoal = baseLid(a); }
    const baseLid = (a) => clamp(0.02 + 0.16 * PLAN.sleepy(a.T) + (act && act.kind === 'company' ? 0.06 : 0) + (a.doze || 0));
    function spring(a, ch, k, z, dt) {
      const v = 'v' + ch, g = 'g' + ch;
      const acc = k * (a[g] - a[ch]) - 2 * Math.sqrt(k) * z * a[v];
      a[v] += acc * dt; a[ch] += a[v] * dt;
    }
    function stepActor(a, t, dt) {
      const n = a.n, sz = size(a);
      for (let i = a.todo.length - 1; i >= 0; i--) if (t >= a.todo[i].at) { const fn = a.todo[i].fn; a.todo.splice(i, 1); try { fn(); } catch (e) { console.error(e); } }
      if (a.move) runMove(a, t);
      // breathing: each Eye at its own pace, never in step with the other
      const br = 0.012 * Math.sin((t / a.breathe) * TAU + a.ph) * (act && act.kind === 'company' ? 1.3 : 1);
      spring(a, 'x', a.kx || 60, 0.55, dt); spring(a, 'y', a.ky || 90, 0.5, dt); spring(a, 's', 70, 0.55, dt); spring(a, 'q', 300, 0.2, dt);
      a.boost = Math.max(0, a.boost - dt * 0.45);
      if (a.trailOn && motionMode() === 'on') { const p = pos(a); a.trail.push([p.x, p.y + (a.jy || 0) * 0, t]); if (a.trail.length > 16) a.trail.shift(); }
      else if (a.trail.length) a.trail.shift();
      if (a.spin) {
        const u = clamp((t - a.spin.t0) / a.spin.d);
        a.r = a.spin.from + a.spin.by * easeOut(u);
        if (u >= 1) { a.r = a.r % TAU; if (a.r > Math.PI) a.r -= TAU; a.vr = 0; a.spin = null; }
      } else spring(a, 'r', 55, 0.45, dt);
      if (a.air) {
        a.jv += G * dt; a.jy += a.jv * dt;
        a.gq = -clamp(Math.abs(a.jv) / 1800) * 0.1;
        if (a.jy >= 0 && a.jv > 0) { const imp = a.jv; a.air = false; a.jy = 0; a.jv = 0; a.gq = 0; a.vq += clamp(imp / 900, 0, 2) * 2.1; a.vy += imp * 0.12; }
      }
      a.q = clamp(a.q, -0.2, 0.22);
      a.lid = mix(a.lid, a.lidGoal, Math.min(1, dt * 3));
      const k = ampK();
      // keep every Eye comfortably inside the Meeting Space whatever a move asks for
      const W = innerWidth, half = sz * 0.43 * (1 + (a.s - 1) * k) * (1 + Math.max(0, a.gsx)) + 6, mxLim = [half - n.x, W - half - n.x];
      const B = stage(), myLim = B ? [B.top + half * 0.8 - n.y, B.bottom - half * 0.8 - n.y] : [-1e4, 1e4];
      n.mx = clamp(a.x * k, mxLim[0], mxLim[1]); n.my = clamp(((a.y + a.jy) * k + a.q * sz * 0.3) * a.yd, myLim[0], myLim[1]);
      n.rot = a.r * (a.spin ? 1 : k); n.ms = 1 + (a.s - 1 + br) * k; n.sq = clamp(a.q * k + a.gsx * k, -0.24, 0.24);
      if (n.eye) n.eye.closeK = a.lid;
    }

    // ---------- moves (goofing, arrivals, taps): little scripts on a body ----------
    // Each runs on its own clock (amp / speed per Eye), so two Eyes doing "the same" thing never match.
    function startMove(a, name, amp, speed) { a.move = { name, t0: nowS(), amp: amp || 1, sp: (speed || 1) / speedK(), fired: {} }; }
    function once(m, id, cond, fn) { if (!m.fired[id] && cond) { m.fired[id] = true; fn(); } }
    function runMove(a, t) {
      const m = a.move, u = (t - m.t0) * m.sp, A0 = m.amp, sz = size(a), d = dirTo(a);
      switch (m.name) {
        case 'bounce':
          once(m, 1, u >= 0, () => { hop(a, 0.17 * A0); lookDir(a, d * 0.2, -0.4, 0.6); Sfx.play('boing', a.T); });
          once(m, 2, u >= 0.5, () => { a.air = false; a.jy = 0; hop(a, 0.12 * A0); });
          once(m, 3, u >= 0.92, () => { a.air = false; a.jy = 0; hop(a, 0.07 * A0); lookAtOther(a, 1.2); });
          if (u > 1.6) a.move = null; break;
        case 'spin':
          if (u < 0.32) { a.gr = -0.38 * A0 * d; a.gq = 0.12; }
          once(m, 1, u >= 0.32, () => { a.gq = 0; hop(a, 0.08 * A0); a.spin = { t0: nowS(), d: 0.75 / m.sp, from: a.r, by: d * (TAU + 0.38 * A0) }; a.gr = 0; Sfx.play('spin'); });
          once(m, 2, u >= 1.15, () => { const e = a.n.eye; if (e) { e.dartBurst = 3; e.nextDart = 0; e.reactUntil = 0; } pupil(a, 0.85, -1); });
          once(m, 3, u >= 1.9, () => { pupil(a, 1); lookAtOther(a, 1); dblink(a); });
          if (u > 2) a.move = null; break;
        case 'wobble':
          if (u < 1.5) { const dec = Math.exp(-u * 1.7); a.q = 0.17 * A0 * Math.sin(u * 21) * dec; a.vq = 0; a.gr = 0.07 * A0 * Math.sin(u * 13 + 0.6) * dec; }
          once(m, 1, u >= 0, () => { pupil(a, 1.2, 1.5); mood(a, 0, 0.3); });
          once(m, 2, u >= 1.5, () => { a.gr = 0; mood(a, 0.25, 0); lookAtOther(a, 1); });
          once(m, 3, u >= 2.1, () => mood(a, 0, 0));
          if (u > 2.2) a.move = null; break;
        case 'peek':                                         // ducks away from the other, then pops back
          once(m, 1, u >= 0, () => { a.gy = a.lean + 0.3 * sz * A0; a.gs = 0.8; a.lidGoal = 0.32; lookAtOther(a, 1.4); });
          once(m, 2, u >= 1.25, () => { a.gy = a.lean; a.gs = 1.04; a.lidGoal = 0; hop(a, 0.12 * A0); mood(a, 0, 0.75); pupil(a, 1.35, 2.5); Sfx.play('pop', a.T); });
          once(m, 3, u >= 1.8, () => { a.gs = 1; mood(a, 0, 0); pupil(a, 1); a.lidGoal = baseLid(a); });
          if (u > 2) a.move = null; break;
        case 'roll':
          if (u < 1.35) { const ang = -Math.PI / 2 + (u / 1.35) * TAU * d; lookDir(a, Math.cos(ang) * 0.95, Math.sin(ang) * 0.8, 0.2); a.gr = 0.05 * Math.cos(ang) * A0; }
          once(m, 1, u >= 1.35, () => { a.gr = 0; mood(a, 0.32, 0); blink(a, true); lookAtOther(a, 1.2); });
          once(m, 2, u >= 2.2, () => mood(a, 0, 0));
          if (u > 2.3) a.move = null; break;
        case 'puff':
          once(m, 1, u >= 0, () => { a.gs = 1 + 0.17 * A0; a.gq = -0.04; pupil(a, 1.45, 1.5); mood(a, 0, 0.6); });
          once(m, 2, u >= 1.0, () => { a.gs = 0.96; a.gq = 0; a.vq += 2.4; mood(a, 0.3, 0); a.lidGoal = 0.3; });
          once(m, 3, u >= 1.55, () => { a.gs = 1; pupil(a, 1); mood(a, 0, 0); a.lidGoal = baseLid(a); lookAtOther(a, 1); });
          if (u > 1.7) a.move = null; break;
        case 'shimmy':                                       // 4.5.1: a side-to-side shimmy
          if (u < 1.6) { const e = Math.sin(Math.PI * clamp(u / 1.6)); a.gx = Math.sin(u * 15) * 0.09 * sz * A0 * e; a.gr = -Math.sin(u * 15) * 0.06 * A0 * e; }
          once(m, 1, u >= 0, () => { mood(a, 0.3, 0); pupil(a, 1.25); });
          once(m, 2, u >= 1.6, () => { a.gx = 0; a.gr = 0; mood(a, 0, 0); lookAtOther(a, 1); });
          if (u > 1.7) a.move = null; break;
        case 'hiccup':                                       // 4.5.1: three surprised little hops at odd moments
          for (const [id, at] of [[1, 0], [2, 0.55], [3, 1.45]]) once(m, id, u >= at, () => { a.air = false; a.jy = 0; hop(a, 0.05 * A0); mood(a, 0, 0.7); pupil(a, 0.8, -2); Sfx.play('pop', a.T); soon(a, 0.25, () => mood(a, 0, 0)); });
          once(m, 4, u >= 2.1, () => { pupil(a, 1); blink(a); lookAtOther(a, 1); });
          if (u > 2.2) a.move = null; break;
        case 'stretch':                                      // 4.5.1: a long tall stretch and a little yawn
          once(m, 1, u >= 0, () => { a.gq = -0.15 * A0; a.gs = 1.06; a.lidGoal = 0.45; lookDir(a, 0, -0.8, 1.4); });
          once(m, 2, u >= 1.3, () => { a.gq = 0; a.gs = 0.97; a.vq += 1.6; a.lidGoal = 0.25; });
          once(m, 3, u >= 2, () => { a.gs = 1; a.lidGoal = baseLid(a); blink(a, true); lookAtOther(a, 1); });
          if (u > 2.1) a.move = null; break;
        case 'confused':
          once(m, 1, u >= 0, () => { a.gr = 0.16 * d; lookDir(a, -d * 0.55, -0.6, 0.9); pupil(a, 0.85); mood(a, 0.15, 0); });
          once(m, 2, u >= 0.95, () => { lookAtOther(a, 0.9); });
          once(m, 3, u >= 1.45, () => { a.gr = -0.1 * d; lookDir(a, d * 0.3, -0.7, 0.6); });
          once(m, 4, u >= 2.2, () => { a.gr = 0; pupil(a, 1); mood(a, 0, 0); blink(a); lookAtOther(a, 1); });
          if (u > 2.4) a.move = null; break;
        case 'surprised':
          once(m, 1, u >= 0, () => { mood(a, 0, 0.85); pupil(a, 0.7, -3); a.gy = a.lean + 0.12 * sz; hop(a, 0.06); });
          once(m, 2, u >= 0.5, () => pupil(a, 1.3, 1.5));
          once(m, 3, u >= 0.95, () => dblink(a));
          once(m, 4, u >= 1.9, () => { mood(a, 0, 0); pupil(a, 1); a.gy = a.lean; });
          if (u > 2) a.move = null; break;
        case 'amused':
          once(m, 1, u >= 0, () => { mood(a, 0.42, 0); pupil(a, 1.3, 1); Sfx.play('giggle', a.T); });
          if (u < 1.25) { const k = Math.floor(u / 0.16); once(m, 'g' + k, true, () => { a.vy -= 95 * (1 - u / 1.4); a.vq += 0.7; }); }
          once(m, 2, u >= 1.4, () => { blink(a, true); });
          once(m, 3, u >= 2, () => { mood(a, 0, 0); pupil(a, 1); });
          if (u > 2.1) a.move = null; break;
        case 'cheer':                                        // 4.5.1: delighted double hop
          once(m, 1, u >= 0, () => { hop(a, 0.1); pupil(a, 1.45, 2); mood(a, 0.2, 0.3); });
          once(m, 2, u >= 0.48, () => { a.air = false; a.jy = 0; hop(a, 0.08); });
          once(m, 3, u >= 1.3, () => { mood(a, 0, 0); pupil(a, 1); lookAtOther(a, 1); });
          if (u > 1.4) a.move = null; break;
        case 'unimpressed':                                  // 4.5.1: a long slow blink and a look elsewhere
          once(m, 1, u >= 0, () => { mood(a, 0.38, 0); pupil(a, 0.9); blink(a, true); });
          once(m, 2, u >= 0.7, () => lookDir(a, -d * 0.7, 0.2, 1.2));
          once(m, 3, u >= 1.9, () => { mood(a, 0, 0); pupil(a, 1); lookAtOther(a, 1); });
          if (u > 2) a.move = null; break;
        // ---- 4.7 dance moves (each with anticipation, action and follow-through) ----
        case 'twirl':                                        // a crouch, a tall double spin, a wide-eyed wobble out of it
          if (u < 0.3) { a.gq = 0.14 * A0; a.gr = -0.2 * d * A0; }
          once(m, 1, u >= 0.3, () => { a.gq = -0.12 * A0; a.gs = 1.06; hop(a, 0.11 * A0); a.spin = { t0: nowS(), d: 1.0 / m.sp, from: a.r, by: d * (TAU * 2) }; a.gr = 0; Sfx.play('spin'); });
          once(m, 2, u >= 1.4, () => { a.gq = 0; a.gs = 1; startMove(a, 'wobble', 0.5 * A0, 1.3); });
          if (u > 1.45 && a.move && a.move.name === 'twirl') a.move = null; break;
        case 'sway':                                         // slow, dreamy, half-lidded
          if (u < 2) { const e = Math.sin(Math.PI * clamp(u / 2)); a.gr = Math.sin(u * 4.4) * 0.15 * A0 * e; a.gx = Math.sin(u * 4.4 + 0.5) * 0.06 * sz * A0 * e; a.lidGoal = 0.35; }
          once(m, 1, u >= 0, () => { mood(a, 0.2, 0); pupil(a, 1.15); });
          once(m, 2, u >= 2, () => { a.gr = 0; a.gx = 0; mood(a, 0, 0); a.lidGoal = baseLid(a); blink(a, true); lookAtOther(a, 1); });
          if (u > 2.1) a.move = null; break;
        case 'stomp':                                        // three heavy little stomps, each one a squash
          for (const [id, at] of [[1, 0], [2, 0.5], [3, 1.0]]) once(m, id, u >= at, () => { a.air = false; a.jy = 0; hop(a, 0.06 * A0); soon(a, 0.32, () => { a.vq += 2.6 * A0; Sfx.play('boing', a.T); }); mood(a, 0.35, 0); });
          once(m, 4, u >= 1.65, () => { mood(a, 0, 0); pupil(a, 1.2, 1); lookAtOther(a, 1); });
          if (u > 1.75) a.move = null; break;
        case 'slide':                                        // a smooth glide out and back, leaning into it
          if (u < 1.8) { const e = Math.sin(Math.PI * clamp(u / 1.8)); a.gx = -d * 0.22 * sz * A0 * e; a.gr = d * 0.12 * A0 * e; a.gsx = 0.06 * e; }
          once(m, 1, u >= 0, () => { pupil(a, 1.25); mood(a, 0.25, 0); });
          once(m, 2, u >= 1.8, () => { a.gx = 0; a.gr = 0; a.gsx = 0; mood(a, 0, 0); lookAtOther(a, 1); });
          if (u > 1.9) a.move = null; break;
        case 'wave':                                         // goodbye: a little waggle, a nod and a slow blink
          if (u < 1.3) a.gr = 0.11 * Math.sin(u * 11) * (1 - u / 1.3) * d; else a.gr = 0;
          once(m, 1, u >= 0, () => { lookAtOther(a, 2.4); pupil(a, 1.2, 1); mood(a, 0.18, 0); Sfx.play('bye', a.T); });
          once(m, 2, u >= 0.3, () => hop(a, 0.05));
          once(m, 3, u >= 1.35, () => blink(a, true));
          once(m, 4, u >= 2.1, () => { mood(a, 0, 0); pupil(a, 1); });
          if (u > 2.3) a.move = null; break;
        default: a.move = null;
      }
    }

    // ---------- every frame ----------
    function behave(t, m, th, gentle) {
      me = m; them = th;
      if (!S) return false;
      if (S.phase === 'asking' || S.phase === 'answering') {
        if (m.eye && t > (m.ctl.until || 0)) { if (Math.random() < 0.7) host().lookAt(m, host().pos(th).x, host().pos(th).y, rnd(1, 2.2)); else { m.eye.setTarget(rnd(-0.2, 0.2), 0.15); m.eye.reactUntil = t + 0.9; m.ctl.until = t + 0.9; } }
        return false;
      }
      if (!S.plan) return false;
      S.gentle = gentle || motionMode() === 'gentle';
      const dt = clamp(lastT ? t - lastT : 1 / 30, 0, 0.05); lastT = t; frameDt = dt || 1 / 30;
      if (!A.me || A.me.n !== m) { A.me = actor('me', m); A.them = actor('them', th); }
      seamFlash = Math.max(0, seamFlash - dt * 1.6);
      if (S.phase === 'over') {
        const k = t - endAt;
        for (const a of [A.me, A.them]) { a.lean = 0; relax(a); stepActor(a, t, dt); }
        if (ball && ball.st !== 'absorb') ballGone();
        return k < END_HOLD_MS / 1000;
      }
      if (S.phase === 'leaving') { stepFarewell(t); for (const a of [A.me, A.them]) stepActor(a, t, dt); stepBall(t, dt); stepFlies(t, dt); return true; }
      const tt = elapsed(), cur = S.plan.find(tt, actI);
      // 4.7: the list can be rebuilt (an owner's nudge); same activity → same key, so it carries on uninterrupted
      if (PLAN.actKey(cur) !== actK) enter(cur, t); else act = cur;
      const ta = tt - act.start, inAct = ta < act.dur;
      if (S.peerAway) behaveCompany(t, ta, true);
      else if (!inAct) { if (act.kind === 'catch' && ball) behaveCatch(t, ta); else if (PLAY[act.kind] && !ast.wrapped) wrapUp(t); else behaveCompany(t, ta, false, true); }
      else if (act.kind === 'arrive') behaveArrive(t, ta);
      else if (act.kind === 'company') behaveCompany(t, ta);
      else if (act.kind === 'fireflies') behaveFlies(t, ta);
      else if (act.kind === 'goof') behaveGoof(t, ta);
      else if (PLAY[act.kind]) PLAY[act.kind](t, ta);
      else behaveCatch(t, ta);
      for (const a of [A.me, A.them]) stepActor(a, t, dt);
      stepBall(t, dt); stepFlies(t, dt); stepToys(t, dt);
      return true;
    }
    function enter(cur, t) {
      const prev = act, prevAst = ast;
      act = cur; actI = cur.i; actK = PLAN.actKey(cur); ast = { t0: t, ev: {} };
      if (prev && prev.kind === 'fireflies') flies.forEach((f) => { if (f.mode !== 'leave') { f.mode = 'leave'; f.vy = -rnd(30, 60); } });
      if (prev && prev.kind === 'catch' && ball) ballGone();
      if (prev && PLAY[prev.kind]) clearToys(t, prevAst);
      for (const a of [A.me, A.them]) {
        a.move = null; a.fav = null; a.next = t + rnd(1, 3); if (cur.kind !== 'company') a.doze = 0; a.gx = 0; a.gy = 0;
        a.kx = 60; a.ky = 90; a.gsx = 0; a.trailOn = false; a.gs = 1; a.gq = 0; a.gr = 0; a.lean = 0; a.lidGoal = baseLid(a); mood(a, 0, 0); pupil(a, 1);
      }
      if (cur.kind === 'fireflies') spawnFlies(cur);
      if (cur.kind === 'catch') startCatch(cur, t);
    }

    // ----- arrival: their Eye leans in through the doorway; both perk up and say hello their own way -----
    function behaveArrive(t, ta) {
      if (!ast.init) {
        ast.init = true;
        const fresh = elapsed() < 3;
        for (const a of [A.me, A.them]) {
          const sz = size(a);
          if (fresh) { a.x = -dirTo(a) * 0.22 * sz; a.s = 0.9; a.lid = 0.3; }
          a.lean = 0; a.gx = 0; a.gs = 1; a.gy = 0;
          a.delay = a === A.me ? rnd(0.15, 0.4) : rnd(0, 0.2);
          lookDir(a, rnd(-0.6, 0.6), 0.4, 0.5 + a.delay);
        }
        // a few motes gather at the doorway where they come in
        const p = pos(A.them);
        for (let i = 0; i < 16; i++) motes.push({ x: p.x + rnd(-0.8, 0.8) * size(A.them), y: p.y + rnd(-0.55, 0.55) * size(A.them), tx: () => pos(A.them), t0: t + rnd(0, 0.5), d: rnd(0.6, 1.1), col: A.them.n.color || [200, 222, 230] });
        seamFlash = 1;
      }
      for (const a of [A.me, A.them]) {
        const u = ta - a.delay, d = dirTo(a), sz = size(a);
        if (!a.fired) a.fired = {};
        const fire = (id, at, fn) => { if (!a.fired[id] && u >= at) { a.fired[id] = true; fn(); } };
        fire('notice', 0.45, () => { lookAtOther(a, 1.6); pupil(a, 1.3, 2.2); mood(a, 0, 0.55); a.lidGoal = 0; hop(a, 0.11 + 0.06 * a.T.energy); Sfx.play('hello', a.T, a === A.me ? 0 : 0.05); });
        fire('hello', 1.4, () => {
          mood(a, 0, 0); pupil(a, 1.15);
          const w = a.w;
          if (w === 'curious') { a.gx = d * 0.1 * sz; soon(a, 0.2, () => hop(a, 0.05)); soon(a, 0.5, () => hop(a, 0.04)); pupil(a, 1.38); }
          else if (w === 'shy') { lookDir(a, -d * 0.7, 0.55, 0.9); a.gs = 0.95; soon(a, 0.95, () => { lookAtOther(a, 1.5); blink(a, true); a.gs = 1; }); }
          else if (w === 'hyper') { hop(a, 0.09); soon(a, 0.42, () => hop(a, 0.07)); soon(a, 0.85, () => startMove(a, 'wobble', 0.6, 1.2)); }
          else if (w === 'sleepy') { a.lidGoal = 0.45; soon(a, 0.6, () => { a.gs = 1.07; a.gq = -0.05; }); soon(a, 1.3, () => { a.gs = 1; a.gq = 0; a.lidGoal = baseLid(a); blink(a, true); }); }
          else if (w === 'grumpy') { mood(a, 0.4, 0); soon(a, 0.9, () => { mood(a, 0.12, 0); blink(a, true); a.gr = 0.05 * d; }); soon(a, 1.5, () => { a.gr = 0; mood(a, 0, 0); }); }
          else if (w === 'smug') { a.gr = 0.12 * d; mood(a, 0.25, 0); soon(a, 0.4, () => blink(a, true)); soon(a, 1.6, () => { a.gr = 0; mood(a, 0, 0); }); }
          else if (w === 'dramatic') { mood(a, 0, 0.8); a.vq -= 3; hop(a, 0.13); soon(a, 0.7, () => startMove(a, 'wobble', 0.8, 1)); soon(a, 1.6, () => mood(a, 0, 0)); }
          else { blink(a, true); a.gr = 0.04 * d; soon(a, 1, () => { a.gr = 0; }); }
        });
        fire('settle', 3.6, () => { a.lean = 0.03 * sz; relax(a); lookAtOther(a, 1.2); });
      }
    }

    // ----- company: relaxed, mostly quiet, glances, leaning in, shared slow blinks, dozing -----
    function behaveCompany(t, ta, peerAway, between) {
      const beats = !peerAway && !between && act && act.kind === 'company' && act.p && act.p.beats;
      if (beats) { const ev = E(ta); beats.forEach((b, j) => ev('b' + j, b.t, () => companyBeat(b))); }
      for (const a of [A.me, A.them]) {
        if (a.move) continue;
        const o = other(a), sz = size(a), d = dirTo(a);
        if (peerAway && a === A.them) {                      // they left EYES for a moment: their Eye rests on the sill
          a.lidGoal = 0.78; a.gs = 0.97; a.gr = 0.02 * Math.sin(t * 0.5); a.gx = 0; a.gy = 0.12 * sz;
          if (t > a.next) { lookDir(a, rnd(-0.2, 0.2), 0.5, 4); a.next = t + rnd(4, 8); }
          continue;
        }
        if (a.lidGoal > baseLid(a) + 0.05 && !a.doze) a.lidGoal = baseLid(a);
        if (t < a.next) continue;
        const T = a.T, quietK = between ? 0.5 : 1;
        const w = {
          nothing: (1.3 + 0.8 * (1 - T.energy)) * quietK,
          glance: 0.9 + 0.6 * T.curiosity - 0.3 * T.shyness,
          around: 0.5 + 0.5 * T.curiosity,
          lean: a.lean > 0.035 * sz ? 0.2 : 0.35 + 0.4 * (1 - T.shyness),
          sigh: 0.25 + 0.3 * PLAN.sleepy(T),
          doze: !between && !peerAway && a.doze === 0 && ta > 12 ? 0.15 + 0.7 * PLAN.sleepy(T) : 0,
          hum: 0.25 + 0.3 * T.energy,
          affection: o.n.eye && ta > 6 && !beats ? 0.25 + 0.35 * (1 - T.grump) : 0
        };
        if (a.doze) { w.nothing += 2; w.wake = 0.5; }
        let s = 0; for (const k in w) s += Math.max(0, w[k]); let x = Math.random() * s, pickd = 'nothing';
        for (const k in w) { if ((x -= Math.max(0, w[k])) <= 0) { pickd = k; break; } }
        const gap = rnd(3, 9) * (1 + PLAN.sleepy(T) * 0.6) * speedK();
        a.next = t + gap;
        if (pickd === 'glance') lookAtOther(a, rnd(1.2, 3.4) * (1.3 - T.shyness * 0.6));
        else if (pickd === 'around') { const an = rnd(0, Math.PI); lookDir(a, Math.cos(an) * 0.8, -Math.sin(an) * 0.6 * (Math.random() < 0.5 ? 1 : -0.6), rnd(1, 2.4)); }
        else if (pickd === 'lean') { a.lean = a.lean > 0.035 * sz ? 0.02 * sz : rnd(0.05, 0.09) * sz; a.gx = d * a.lean; if (a.lean > 0.04 * sz) lookAtOther(a, 1.5); }
        else if (pickd === 'sigh') { a.gs = 1.04; a.lidGoal = 0.35; soon(a, 0.8, () => { a.gs = 0.985; a.vq += 1; }); soon(a, 1.6, () => { a.gs = 1; a.lidGoal = baseLid(a); }); }
        else if (pickd === 'doze') { a.doze = 0.45; a.lidGoal = baseLid(a); a.gr = 0.03 * d; lookDir(a, 0, 0.45, gap); }
        else if (pickd === 'wake') { a.doze = 0; a.gr = 0; a.lidGoal = baseLid(a); pupil(a, 1.1, 1.6); a.vy -= 80; lookAtOther(a, 1.5); }
        else if (pickd === 'hum') { const k = rnd(0.025, 0.045) * d; a.gr = k; soon(a, 0.9, () => { a.gr = -k * 0.8; }); soon(a, 1.8, () => { a.gr = k * 0.5; }); soon(a, 2.6, () => { a.gr = 0; }); }
        else if (pickd === 'affection') {
          lookAtOther(a, 2.8);
          soon(a, 0.6, () => {
            if (Math.random() < 0.75) {
              blink(a, true); mood(a, 0.15, 0);
              if (!o.move && !o.doze) { lookAtOther(o, 2.4); soon(o, rnd(0.3, 0.7), () => { blink(o, true); mood(o, 0.12, 0); }); soon(o, 2, () => mood(o, 0, 0)); }
              soon(a, 1.8, () => mood(a, 0, 0));
              if (Math.random() < 0.35) { a.gx = d * (a.lean + 0.06 * sz); soon(a, 2.2, () => { a.gx = d * a.lean; }); }
            }
          });
        }
      }
    }

    // ----- goofing around: one starts something silly; the other reacts its own way -----
    function behaveGoof(t, ta) {
      const p = act.p, I = byRole(act.init), O = other(I), dur = act.dur, k = speedK();
      if (!ast.started) {
        ast.started = true;
        lookAtOther(I, 0.9); mood(I, 0.2, 0); pupil(I, 1.2);
        soon(O, 0.4, () => { lookAtOther(O, 1); });
      }
      if (!ast.moved && ta >= 0.9 * k) { ast.moved = true; mood(I, 0, 0); startMove(I, p.move, p.amp, 1); }
      if (!ast.reacted && ta >= (0.9 + p.delay) * k) {
        ast.reacted = true;
        if (p.reaction === 'join') startMove(O, p.joinMove, p.joinAmp, p.joinSpeed);
        else startMove(O, p.reaction, 1, 1);
      }
      if (!ast.ack && ast.moved && !I.move) { ast.ack = true; lookAtOther(I, 1.6); if (['join', 'amused', 'cheer'].includes(p.reaction)) { mood(I, 0.3, 0); soon(I, 1.2, () => mood(I, 0, 0)); } else if (p.reaction === 'confused' || p.reaction === 'unimpressed') { I.gr = 0.08 * dirTo(I); soon(I, 1, () => { I.gr = 0; }); } }
      if (p.finale && !ast.fin && ta >= dur - 2.4 * k && !I.move && !O.move) {
        ast.fin = true;
        lookAtOther(I, 1.5); lookAtOther(O, 1.5);
        soon(I, rnd(0, 0.2), () => hop(I, 0.06)); soon(O, rnd(0.15, 0.5), () => { if (O.T.energy > 0.45) hop(O, 0.05); else blink(O, true); });
      }
      if (!ast.done && ta >= dur - 0.6) { ast.done = true; relax(I); relax(O); }
    }


    // ======================================================================================
    // 4.7 · Hangout 2.0, the Playdate: tug of war, tag, bubbles, dance off, curious discoveries, mischief, and the
    // small affectionate / annoying things in between. Everything that matters comes from PLAN (both phones agree);
    // everything here only draws it. Owners cheer, pop and poke; those travel as tiny 'push' / 'pop' / 'obj' notes.
    // ======================================================================================
    let frameDt = 1 / 30, hold = null;
    const freshToys = () => ({ rope: null, obj: null, pebble: null, kids: [], fadeB: [], conf: [], cheers: [], zaps: [], blush: [], chain: [] });
    let toys = freshToys();
    const capArr = (arr, n) => { if (arr.length > n) arr.splice(0, arr.length - n); };
    // role frame: u = 0 at Eye a's spot, u = 1 at Eye b's spot, so both phones mean the same place
    const uX = (u) => { const m = A.me.n.x, o = A.them.n.x; return m + (o - m) * (S.role === 'a' ? u : 1 - u); };
    // own frame: s = 0 at this Eye's spot, s = 1 at the other's spot (negative: backing away)
    const sToX = (a, s) => uX(a.role === 'a' ? s : 1 - s);
    function goS(a, s) { a.gx = (sToX(a, s) - a.n.x) / ampK(); }
    const homeY = () => A.me.n.y;
    const E = (ta) => (id, at, fn) => { if (!ast.ev[id] && ta >= at) { ast.ev[id] = 1; try { fn(); } catch (e) { console.error(e); } } };
    const comp = (c) => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return c.map((v) => clamp(mx + mn - v, 60, 255)); };
    const midPt = () => ({ x: (pos(A.me).x + pos(A.them).x) / 2, y: (pos(A.me).y + pos(A.them).y) / 2 });
    function burst(x, y, n, cols, spd, life) {
      const t = nowS();
      for (let i = 0; i < n; i++) { const an = rnd(0, TAU), v = rnd(0.4, 1) * (spd || 140); sparks.push({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 40, t0: t, d: rnd(0.5, 1) * (life || 0.9), col: cols[i % cols.length] }); }
      capArr(sparks, 220);
    }
    function blushOn(a, secs) { toys.blush.push({ a, t0: nowS(), d: secs || 2 }); capArr(toys.blush, 4); }

    // ---------- the owners: cheering their own Eye ----------
    function encourage(a, amt, remote, quietFx) {
      if (!a || !act) return;
      a.boost = Math.min(1.6, a.boost + amt);
      if (!quietFx || Math.random() < 0.35) {
        const p = pos(a), sz = size(a), t = nowS(), col = (a.n.color || [200, 222, 230]).map((v) => mix(v, 255, 0.35));
        for (let i = 0; i < (quietFx ? 1 : 4); i++) toys.cheers.push({ x: p.x + rnd(-0.32, 0.32) * sz, y: p.y + sz * rnd(0.18, 0.4), vx: rnd(-18, 18), vy: -rnd(70, 130), t0: t, d: rnd(0.6, 1.1), col });
        capArr(toys.cheers, 90);
      }
      if (!quietFx) { pupil(a, 1.28, 0.9); if (!a.air && !a.move && Math.random() < 0.5 + 0.4 * a.T.energy) hop(a, 0.035 + 0.03 * a.T.energy); }
      if (!remote) { const ck = cheerOf(actK); ck[a.role] = Math.min(40, ck[a.role] + amt); queuePush(act.i, actK); }
    }
    function theirPush(i, w, k) {
      if (!act || act.i !== i || !A.me) return;
      const ck = cheerOf(actK), d = k - ck[w];
      if (d > 0.05) { ck[w] = k; encourage(byRole(w), Math.min(1.2, d), true); }
    }
    function theirRes(i, r) {
      if (!act || act.i !== i || act.kind !== 'tug' || ast.revealed) return;
      if (!['win', 'letgo', 'tie'].includes(r.k)) return;
      if (r.k !== 'tie' && r.w !== 'a' && r.w !== 'b') return;
      S.res[actK] = { k: r.k, w: r.w, how: r.how === 'slip' ? 'slip' : 'drag' };
    }

    // ---------- an owner nudged (Play / Tease / Surprise): their Eye looks down at its person first ----------
    function cued(c, mine) {
      if (!A.me || !S) return;
      if (S.plan.verdict(c.by, c.n) === false) { if (mine) say('They are in the middle of something. Try again in a moment.', false); return; }
      const a = byRole(c.by), o = other(a), T = a.T;
      a.move = null; lookDir(a, 0, 0.95, 0.75); pupil(a, 1.32, 1.6);
      if (c.k === 'tease') soon(a, 0.45, () => { mood(a, a.X.mischief > 0.5 ? 0.38 : 0.12, 0); lookAtOther(a, 1.1); if (a.X.mischief < 0.36) blink(a, true); });
      else if (c.k === 'surprise') { soon(a, 0.4, () => { mood(a, 0, 0.5); lookDir(a, 0, -0.7, 0.9); }); soon(o, 0.7, () => { const m = midPt(); look(o, m.x, m.y - size(o) * 0.5, 1); pupil(o, 1.2, 1); }); }
      else soon(a, 0.4, () => { if (T.energy > 0.5) hop(a, 0.07); else if (T.shyness > 0.6) blink(a, true); else a.vq += 1.2; lookAtOther(a, 1.1); soon(o, 0.35, () => lookAtOther(o, 1)); });
      Sfx.play('pop', T);
      if (!mine) { const txt = { play: `${S.nm} wants them to play.`, tease: `${S.nm} put their Eye up to something.`, surprise: `${S.nm} conjured a surprise.` }[c.k]; if (txt) { say(txt, false); later(() => { if (S && S.phase === 'live') say('', false); }, 2600); } }
      later(() => refresh(), PLAN.CUE_GAP * 1000 + 300);
      refresh();
    }

    // ---------- shared response scripts (mischief and the little moments between) ----------
    // how the other Eye answers a prank: retaliate · investigate · annoyed · giggle · sulk (+ comfort)
    function respond(I, O, kind, comfort, small) {
      const dI = dirTo(I), dO = dirTo(O), sz = size(O), k = small ? 0.6 : 1;
      if (kind === 'retaliate') {
        lookAtOther(O, 1.2); mood(O, 0.42, 0); pupil(O, 0.95);
        soon(O, 0.5, () => { crouch(O, 0.6); });
        soon(O, 0.75, () => { O.kx = 200; O.gx = dO * 0.16 * sz * k; Sfx.play('pop', O.T); });
        soon(O, 0.95, () => { O.gx = 0; I.vq += 2.4; I.vx -= dI * 160; mood(I, 0, 0.85); pupil(I, 0.75, -2); try { I.n.eye.poke(-dI * 0.3, -0.1, nowS()); } catch (e) {} });
        soon(O, 1.3, () => { O.kx = 60; mood(O, 0.3, 0); });
        soon(I, 1.6, () => { mood(I, 0, 0); startMove(I, 'amused', 0.7, 1.1); });
        soon(O, 1.9, () => { if (O.T.grump < 0.7) startMove(O, 'amused', 0.6, 1.2); else mood(O, 0, 0); });
      } else if (kind === 'investigate') {
        lookAtOther(O, 2.6); O.kx = 40; O.gx = dO * 0.12 * sz * k; mood(O, 0.22, 0); pupil(O, 0.9);
        soon(I, 0.3, () => lookDir(I, -dI * 0.6, -0.5, 0.8));
        soon(I, 1.1, () => lookAtOther(I, 0.3));
        soon(I, 1.4, () => lookDir(I, -dI * 0.7, 0.2, 0.6));
        soon(I, 2.0, () => { startMove(I, 'amused', 0.8, 1); });
        soon(O, 2.2, () => { O.gx = 0; O.kx = 60; mood(O, 0.36, 0); blink(O, true); });
        soon(O, 3.2, () => mood(O, 0, 0));
      } else if (kind === 'annoyed') {
        lookAtOther(O, 3); mood(O, 0.46, 0); O.gr = -0.07 * dO; pupil(O, 0.9);
        soon(I, 0.6, () => { lookDir(I, 0, 0.6, 1.2); I.gs = 0.95; });
        soon(O, 1.8, () => { O.gr = 0; startMove(O, 'unimpressed', 1, 1); });
        soon(I, 2.0, () => { I.gs = 1; lookAtOther(I, 1); });
        soon(O, 3.6, () => mood(O, 0, 0));
      } else if (kind === 'giggle') {
        startMove(O, 'amused', 0.8 * k + 0.2, 1);
        soon(I, 0.4, () => startMove(I, 'amused', 0.7, 1.15));
      } else {                                                   // sulk
        O.gs = 0.86; lookDir(O, -dO * 0.6, 0.6, 2.4); O.lidGoal = 0.42; mood(O, 0.2, 0);
        soon(I, 0.8, () => { lookAtOther(I, 1.6); pupil(I, 1.2); mood(I, 0, 0); });
        if (comfort) {
          soon(I, 1.6, () => { I.kx = 40; I.gx = dI * 0.1 * sz; blink(I, true); O.vq += 1; });
          soon(O, 2.4, () => { lookAtOther(O, 1.6); blink(O, true); O.gs = 1; O.lidGoal = baseLid(O); mood(O, 0.15, 0); });
          soon(I, 3.4, () => { I.gx = 0; I.kx = 60; mood(I, 0.15, 0); });
          soon(O, 3.8, () => { mood(O, 0, 0); mood(I, 0, 0); });
        } else soon(O, 2.6 + 2 * (1 - O.X.recover), () => { O.gs = 1; O.lidGoal = baseLid(O); mood(O, 0, 0); lookAtOther(O, 1); });
      }
    }

    // ---------- mischief: one Eye causes a little trouble, the other answers in character ----------
    function behaveMischief(t, ta) {
      const p = act.p, ev = E(ta), I = byRole(act.init), O = other(I), h = p.hes || 0, sz = size(I), d = dirTo(I), dO = dirTo(O);
      const tr = p.trick;
      if (tr === 'poke') {
        ev('plot', 0, () => { lookAtOther(I, 1.4); mood(I, 0.36, 0); pupil(I, 1.25); lookDir(O, -dO * 0.6, 0.3, 2.2 + h); });
        if (ta > 0.3 + h && ta < 1.7 + h) { const k = ease((ta - 0.3 - h) / 1.3); I.kx = 30; I.gx = d * 0.11 * sz * k; I.gs = 0.94; I.gq = 0.06; if (t > I.next) { I.next = t + 0.5; lookAtOther(I, 0.5); } }
        ev('poke', 1.7 + h, () => { I.kx = 240; I.gx = d * 0.2 * sz; Sfx.play('pop', I.T); soon(O, 0.08, () => { O.vq += 2.6; O.vx -= dO * 170; mood(O, 0, 0.9); pupil(O, 0.7, -2.5); try { O.n.eye.poke(-dO * 0.35, -0.1, nowS()); } catch (e) {} buzz(6); }); });
        ev('innocent', 1.9 + h, () => { I.kx = 90; I.gx = -d * 0.02 * sz; I.gs = 1; I.gq = 0; mood(I, 0.1, 0); lookDir(I, -d * 0.5, -0.75, 2.2); I.whistle = t + 2; });
        ev('resp', 2.7 + h, () => { I.whistle = 0; respond(I, O, p.resp, p.comfort); });
      } else if (tr === 'startle') {
        ev('plot', 0, () => { lookAtOther(I, 1); mood(I, 0.36, 0); });
        ev('duck', 0.4 + h * 0.5, () => { I.ky = 60; I.gy = 0.34 * sz; I.gs = 0.62; I.lidGoal = 0.3; lookDir(O, -dO * 0.4, 0.4, 1.2); });
        ev('where', 1.0 + h, () => { look(O, pos(I).x, pos(I).y - sz * 0.3, 0.8); pupil(O, 0.9); mood(O, 0.15, 0); });
        ev('lean', 1.6 + h, () => { O.kx = 40; O.gx = dO * 0.07 * sz; lookDir(O, dO * 0.7, 0.5, 1); });
        ev('boo', 2.3 + h, () => { I.ky = 160; I.gy = 0; I.gs = 1.18; hop(I, 0.1); pupil(I, 1.5, 2); mood(I, 0, 0.9); I.lidGoal = 0; Sfx.play('boo', I.T);
          soon(O, 0.06, () => { O.kx = 120; O.gx = -dO * 0.1 * sz; hop(O, 0.13); pupil(O, 0.6, -3); mood(O, 0, 1); O.vr += 5 * dO; buzz([8, 30, 8]); }); });
        ev('settle', 2.9 + h, () => { I.gs = 1; I.ky = 90; mood(I, 0.3, 0); });
        ev('resp', 3.3 + h, () => { O.gx = 0; O.kx = 60; mood(O, 0, 0); respond(I, O, p.resp, p.comfort); });
      } else if (tr === 'steal') {
        ev('toy', 0, () => { const hp = holdPt(O); toys.pebble = { x: hp.x, y: hp.y, tx: hp.x, ty: hp.y, holder: O, t0: t, col: (O.n.color || [200, 222, 230]).map((v) => mix(v, 255, 0.3)), a: 0 }; Sfx.play('conjure'); look(O, hp.x, hp.y, 1.6); pupil(O, 1.25, 1); soon(I, 0.6, () => { look(I, hp.x, hp.y, 1.4); mood(I, 0.3, 0); }); });
        if (ta > 1.8 + h && ta < 2.6 + h) { I.kx = 30; I.gx = d * 0.09 * sz; I.gs = 0.95; }
        ev('snatch', 2.6 + h, () => { const pb = toys.pebble; if (pb) { pb.holder = I; } I.kx = 120; I.gx = -d * 0.03 * sz; I.gs = 1; mood(I, 0.38, 0); I.gr = 0.08 * d; lookDir(I, -d * 0.5, -0.6, 1.6); Sfx.play('toss');
          soon(O, 0.2, () => { lookDir(O, 0, -0.6, 0.6); pupil(O, 0.8, -1.5); mood(O, 0, 0.6); }); soon(O, 0.8, () => lookAtOther(O, 1)); soon(I, 1.2, () => { I.gr = 0; }); });
        ev('resp', 3.4 + h, () => {
          const r = p.resp, giveBack = (dl) => soon(I, dl, () => { if (toys.pebble) { toys.pebble.holder = O; Sfx.play('toss'); } lookAtOther(I, 1); });
          if (r === 'retaliate') soon(O, 0.6, () => { if (toys.pebble) toys.pebble.holder = O; O.kx = 160; O.gx = dO * 0.12 * sz; Sfx.play('pop', O.T); soon(O, 0.3, () => { O.gx = 0; O.kx = 60; mood(O, 0.35, 0); }); soon(I, 0.4, () => { mood(I, 0, 0.7); pupil(I, 0.8, -1.5); }); soon(I, 1.4, () => startMove(I, 'amused', 0.6, 1.1)); });
          else if (r === 'investigate') { respond(I, O, 'investigate', 0); giveBack(1.9); }
          else if (r === 'annoyed') { respond(I, O, 'annoyed', 0); giveBack(1.3); }
          else if (r === 'giggle') { respond(I, O, 'giggle', 0); giveBack(1.0); }
          else { respond(I, O, 'sulk', p.comfort); giveBack(p.comfort ? 1.3 : 2.2); }
        });
        ev('drop', act.dur - 1.0, () => { const pb = toys.pebble; if (pb) { pb.fade = nowS(); } });
      } else if (tr === 'fakesleep') {
        ev('nod', 0, () => { I.lidGoal = 0.88; I.doze = 0.5; I.gr = 0.03 * d; I.gs = 0.98; lookDir(I, 0, 0.4, 3); });
        ev('see', 1.4, () => { lookAtOther(O, 1.4); pupil(O, 1.15); });
        ev('lean1', 2.0, () => { O.kx = 35; O.gx = dO * 0.1 * sz; lookAtOther(O, 1.2); });
        ev('lean2', 2.6 + h * 0.5, () => { O.gx = dO * 0.15 * sz; pupil(O, 1.3); O.gs = 1.03; });
        ev('peek', 2.9 + h * 0.5, () => { I.lidGoal = 0.55; });
        ev('wake', 3.3 + h * 0.5, () => { I.doze = 0; I.lidGoal = 0; I.gr = 0; I.gs = 1.08; pupil(I, 1.5, 2); mood(I, 0, 0.8); hop(I, 0.06); Sfx.play('boo', I.T);
          soon(O, 0.05, () => { O.kx = 140; O.gx = -dO * 0.05 * sz; O.gs = 1; hop(O, 0.12); pupil(O, 0.6, -3); mood(O, 0, 1); buzz(8); }); });
        ev('resp', 4.1 + h * 0.5, () => { I.gs = 1; O.kx = 60; O.gx = 0; mood(O, 0, 0); mood(I, 0.3, 0); respond(I, O, p.resp, p.comfort); });
      } else if (tr === 'bump') {
        ev('eye', 0, () => { lookAtOther(I, 1); mood(I, 0.3, 0); crouch(I, 0.6); });
        ev('go', 0.6 + h, () => { I.kx = 160; I.gx = d * 0.15 * sz; hop(I, 0.08); });
        ev('hit', 0.85 + h, () => { O.vx -= dO * 230; O.vq += 2.4; I.vq += 1.6; mood(O, 0, 0.8); pupil(O, 0.75, -2); Sfx.play('boing', O.T); buzz(6); });
        ev('back', 1.15 + h, () => { I.gx = 0; I.kx = 60; startMove(I, 'amused', 0.6, 1.2); });
        ev('resp', 1.9 + h, () => respond(I, O, p.resp, p.comfort));
      } else {                                                   // nudge: too sweet to cause trouble
        ev('look', 0, () => { lookDir(I, 0, 0.9, 0.8); blink(I, true); });
        ev('lean', 0.9, () => { I.kx = 40; I.gx = d * 0.1 * sz; lookAtOther(I, 2); blink(I, true); O.vq += 0.8; });
        ev('back', 1.5, () => { lookAtOther(O, 1.8); blink(O, true); mood(O, 0.15, 0); });
        ev('rel', 2.8, () => { I.gx = 0; I.kx = 60; mood(O, 0, 0); });
        ev('resp', 3.2, () => { if (p.resp === 'annoyed') { mood(O, 0.35, 0); O.gx = -dO * 0.04 * sz; soon(O, 1.4, () => { O.gx = 0; mood(O, 0, 0); }); } else startMove(O, 'amused', 0.5, 1.2); });
      }
      if (I.whistle && t < I.whistle && !I.move) I.gr = Math.sin(t * 5.5) * 0.05;         // "who, me?"
      ev('settle', act.dur - 0.7, () => { for (const a of [I, O]) { a.kx = 60; a.ky = 90; relax(a); a.gs = 1; mood(a, 0, 0); } });
    }

    // ---------- company beats (v3): small shared moments, the same on both phones ----------
    function companyBeat(b) {
      const W = byRole(b.who), O = other(W), d = dirTo(W), dO = dirTo(O), sz = size(W);
      if (W.move || O.move) return;
      W.doze = 0; W.next = nowS() + 4; O.next = nowS() + 4;
      if (b.k === 'nudge') {
        W.kx = 35; W.lean = 0.09 * sz; W.gx = d * W.lean; lookAtOther(W, 2);
        soon(O, 0.5, () => { O.vq += 0.9; lookAtOther(O, 1.8); });
        soon(W, 0.9, () => { blink(W, true); mood(W, 0.15, 0); }); soon(O, 1.2, () => { blink(O, true); mood(O, 0.15, 0); });
        soon(W, 2.6, () => { W.lean = 0.03 * sz; W.gx = d * W.lean; W.kx = 60; mood(W, 0, 0); mood(O, 0, 0); });
      } else if (b.k === 'blinks') {
        lookAtOther(W, 2.4); soon(W, 0.4, () => blink(W, true));
        soon(O, 0.5, () => lookAtOther(O, 2)); soon(O, 0.95, () => blink(O, true));
        if (W.X.affection > 0.55) soon(W, 1.7, () => blink(W, true));
      } else if (b.k === 'lean') {
        for (const a of [W, O]) { a.kx = 30; a.lean = 0.07 * size(a); a.gx = dirTo(a) * a.lean; }
        soon(W, 0.8, () => lookAtOther(W, 1.6)); soon(O, 1.2, () => lookAtOther(O, 1.6));
        soon(W, 4.2, () => { for (const a of [W, O]) { a.lean = 0.03 * size(a); a.gx = dirTo(a) * a.lean; a.kx = 60; } });
      } else if (b.k === 'poke') {
        lookAtOther(W, 0.6); mood(W, 0.32, 0); W.kx = 35; W.gx = d * 0.08 * sz;
        soon(W, 0.7, () => { W.kx = 220; W.gx = d * 0.15 * sz; soon(O, 0.08, () => { O.vq += 1.8; mood(O, 0, 0.7); pupil(O, 0.8, -1.5); try { O.n.eye.poke(-dO * 0.25, 0, nowS()); } catch (e) {} }); Sfx.play('pop', W.T); });
        soon(W, 0.9, () => { W.kx = 90; W.gx = 0; mood(W, 0.1, 0); lookDir(W, -d * 0.5, -0.6, 1.6); });
        soon(O, 1.4, () => { mood(O, 0, 0); lookAtOther(O, 1.4); if (O.T.grump > 0.55) mood(O, 0.4, 0); else startMove(O, 'amused', 0.5, 1.2); });
        soon(W, 2.6, () => { W.kx = 60; mood(W, 0, 0); mood(O, 0, 0); lookAtOther(W, 1); });
      } else if (b.k === 'fakesleep') {
        W.lidGoal = 0.82; W.doze = 0.4; lookDir(W, 0, 0.4, 2.4);
        soon(O, 0.9, () => lookAtOther(O, 1)); soon(O, 1.8, () => { lookAtOther(O, 1.2); pupil(O, 1.15); });
        soon(W, 2.2, () => { W.lidGoal = 0.5; lookAtOther(W, 0.8); });
        soon(O, 2.45, () => { pupil(O, 1.35, 1.2); mood(O, 0.3, 0); blink(O, false); });
        soon(W, 2.8, () => { W.doze = 0; W.lidGoal = baseLid(W); mood(W, 0.3, 0); blink(W, true); });
        soon(W, 3.8, () => { mood(W, 0, 0); mood(O, 0, 0); });
      } else if (b.k === 'startle') {
        mood(W, 0.34, 0); lookAtOther(W, 0.9); W.gs = 0.9;
        soon(W, 0.8, () => { W.gs = 1.12; pupil(W, 1.45, 2); mood(W, 0, 0.8); hop(W, 0.06); Sfx.play('boo', W.T); soon(O, 0.05, () => { O.doze = 0; hop(O, 0.09); pupil(O, 0.65, -2.5); mood(O, 0, 0.95); }); });
        soon(W, 1.3, () => { W.gs = 1; startMove(W, 'amused', 0.6, 1.2); });
        soon(O, 1.6, () => { mood(O, 0, 0); if (O.T.grump > 0.5) { mood(O, 0.42, 0); lookAtOther(O, 2); soon(O, 2, () => mood(O, 0, 0)); } else startMove(O, 'amused', 0.5, 1.2); });
      } else {                                                   // gaze: one looks at something, the other follows its eyes
        const an = rnd(-0.9, 0.9), gx = Math.sin(an) * 0.8, gy = -0.55 - Math.random() * 0.3;
        lookDir(W, gx, gy, 1.8); pupil(W, 1.2);
        soon(O, 0.55, () => { lookAtOther(O, 0.4); }); soon(O, 0.95, () => { lookDir(O, gx, gy, 1.4); pupil(O, 1.2); });
        soon(W, 2.0, () => { lookAtOther(W, 1.2); pupil(W, 1); }); soon(O, 2.2, () => { lookAtOther(O, 1.2); pupil(O, 1); blink(O, true); });
      }
    }

    // ---------- tug of war ----------
    function behaveTug(t, ta) {
      const p = act.p, ev = E(ta), Aa = byRole('a'), Ab = byRole('b'), dt = frameDt;
      if (!toys.rope) toys.rope = { P: 0, v: 0, on: 0, gone: 0, t0: t };
      const R = toys.rope;
      ev('see', 0, () => { for (const a of [Aa, Ab]) { lookDir(a, dirTo(a) * 0.35, 0.1, 0.8); pupil(a, 1.3, 1.5); mood(a, 0, 0.4); } Sfx.play('conjure'); });
      ev('grab', 0.8, () => { for (const a of [Aa, Ab]) { crouch(a, 0.9); mood(a, 0.22, 0); lookAtOther(a, 1.2); if (a.T.shyness > 0.62) { lookDir(a, dirTo(a) * 0.5, 0.35, 0.6); soon(a, 0.5, () => lookAtOther(a, 0.8)); } } });
      R.on = Math.min(1, R.on + dt / 0.8);
      const pulling = ta >= 1.6 && ta < p.rev + 0.4;
      if (pulling) {
        let w = null; for (const x of p.waves) if (x.t <= ta) w = x;
        const base = w ? (w.lead === 'a' ? 1 : -1) * w.k * 0.55 : 0;
        const cheer = clamp((Aa.boost - Ab.boost) * 0.35, -0.4, 0.4);
        const goal = clamp(base + cheer + Math.sin(ta * 7.3) * 0.07 + Math.sin(ta * 3.1 + 1) * 0.06, -0.9, 0.9);
        R.v += ((goal - R.P) * 30 - R.v * 7) * dt; R.P = clamp(R.P + R.v * dt, -1, 1);
        if (w && !ast.ev['w' + w.t]) {
          ast.ev['w' + w.t] = 1;
          const lead = byRole(w.lead), lag = other(lead);
          pupil(lead, 0.85); mood(lead, 0.42, 0); lead.vq += 1.2 * w.k;
          mood(lag, 0.1, 0.45); pupil(lag, 1.2, 1); lag.vr += 1.5 * dirTo(lag);
          Sfx.play('pull', w.k);
          soon(lag, 0.5, () => mood(lag, 0.36, 0));
        }
        if (hold && !A.me.move) encourage(A.me, dt * 0.9, false, true);
      }
      // the inviter's phone folds both owners' cheering into the outcome and tells the other phone
      ev('decide', p.rev - 2.5, () => {
        if (S.role !== 'a' || S.res[actK]) return;
        const ck = cheerOf(actK), r = PLAN.tugResult(p, ck.a, ck.b); S.res[actK] = r;
        if (v3()) { const s = S, m = { o: 'res', id: S.id, i: act.i, r }; send(m); later(() => { if (S === s && S.phase === 'live') send(m); }, 700); }
      });
      ev('reveal', p.rev + 0.4, () => tugReveal(t, S.res[actK] || p.res));
      if (!ast.revealed) {
        const dirA = Math.sign(Aa.n.x - Ab.n.x) || -1;
        for (const a of [Aa, Ab]) {
          if (a.move) continue;
          const sz = size(a), side = a.role === 'a' ? 1 : -1;
          const eff = pulling ? clamp(0.55 + R.P * side * 0.55 + a.boost * 0.3, 0.2, 1.3) : ta >= 0.8 ? 0.35 : 0;
          a.kx = 80;
          a.gx = -dirTo(a) * (0.04 + 0.08 * eff) * sz + dirA * R.P * 0.16 * sz;
          a.gr = -dirTo(a) * 0.13 * eff + Math.sin(t * 13 + a.ph) * 0.02 * eff;
          a.gsx = mix(a.gsx, 0.07 * eff, Math.min(1, dt * 6)); a.gq = 0.04 * eff;
          if (pulling && t > a.next) { a.next = t + rnd(0.8, 2) * (1.3 - a.X.attention * 0.5); if (Math.random() < 0.6) lookAtOther(a, 0.8); else { const m = ropeMid(); look(a, m.x, m.y, 0.6); } if (a.boost > 0.6 && Math.random() < 0.4) lookDir(a, 0, 0.9, 0.4); }
        }
      } else R.on = Math.max(0, R.on - dt * 2.5);
      ev('relax', act.dur - 0.6, () => { for (const a of [Aa, Ab]) { a.kx = 60; a.gsx = 0; relax(a); mood(a, 0, 0); } });
    }
    function gripPt(a) { const p = pos(a), sz = size(a); return { x: p.x + dirTo(a) * sz * 0.33 * a.s, y: p.y + sz * 0.04 }; }
    function ropeMid() { const ga = gripPt(A.me), gb = gripPt(A.them); return { x: (ga.x + gb.x) / 2, y: (ga.y + gb.y) / 2 }; }
    function tugReveal(t, r) {
      ast.revealed = true; ast.result = r;
      const Aa = byRole('a'), Ab = byRole('b'), m = ropeMid(), ca = A.me.n.color || [111, 193, 202], cb = A.them.n.color || [200, 222, 230];
      for (const a of [Aa, Ab]) { a.gsx = 0; a.gq = 0; a.gr = 0; a.kx = 110; }
      burst(m.x, m.y, 26, [ca, cb, [255, 255, 255]], 170, 0.9);
      Sfx.play('snap'); buzz(10);
      const fallBack = (a, k) => { a.gx = -dirTo(a) * 0.2 * size(a) * k; a.vr -= dirTo(a) * 6 * k; hop(a, 0.08 * k); mood(a, 0, 0.85); pupil(a, 0.75, -2); soon(a, 0.6, () => { a.vq += 2.2; Sfx.play('boing', a.T); }); };
      const tumbleTo = (a) => { a.gx = dirTo(a) * 0.22 * size(a); hop(a, 0.12); a.spin = { t0: nowS(), d: 0.7, from: a.r, by: dirTo(a) * TAU }; mood(a, 0, 0.9); soon(a, 0.75, () => { a.vq += 2.6; Sfx.play('boing', a.T); }); };
      if (r.k === 'tie') {
        for (const a of [Aa, Ab]) fallBack(a, 0.6);
        soon(Aa, 1.3, () => { for (const a of [Aa, Ab]) { a.gx = 0; a.kx = 60; lookAtOther(a, 1.6); mood(a, 0, 0); } });
        soon(Aa, 1.8, () => { for (const a of [Aa, Ab]) { if (a.T.energy > 0.5) startMove(a, 'cheer', 0.8, 1); else blink(a, true); } });
        return;
      }
      if (r.k === 'letgo') {
        const J = byRole(r.w), V = other(J);
        J.gx = 0; startMove(J, 'amused', 1, 1);
        fallBack(V, 1);
        soon(V, 1.4, () => { V.gx = 0; V.kx = 60; mood(V, 0, 0); lookAtOther(V, 2); });
        soon(V, 1.7, () => {
          if (V.X.compete > 0.55 && V.T.shyness < 0.55) { respond(J, V, 'retaliate', 0); }
          else if (V.T.grump > 0.55) { respond(J, V, 'annoyed', 0); soon(J, 0.5, () => { lookDir(J, -dirTo(J) * 0.5, -0.7, 1.6); J.whistle = nowS() + 1.6; }); }
          else if (V.T.shyness > 0.62) { V.gs = 0.9; lookDir(V, -dirTo(V) * 0.6, 0.5, 1.4); blushOn(V, 2); soon(V, 1.6, () => { V.gs = 1; startMove(V, 'amused', 0.5, 1.2); }); }
          else startMove(V, 'amused', 0.8, 1);
        });
        return;
      }
      const Wn = byRole(r.w), L = other(Wn);
      if (r.how === 'slip') {                                      // the loser's grip slips: the winner falls over backwards
        fallBack(Wn, 1);
        lookDir(L, dirTo(L) * 0.4, 0.5, 1); mood(L, 0, 0.7); pupil(L, 0.85);
        soon(L, 0.9, () => { blink(L, true); L.gs = 0.93; mood(L, 0.25, 0); if (L.T.shyness > 0.5) blushOn(L, 1.8); });
      } else { tumbleTo(L); Wn.gx = -dirTo(Wn) * 0.09 * size(Wn); Wn.vq += 2; }
      soon(Wn, 1.3, () => {
        Wn.gx = 0; Wn.kx = 60;
        if (Wn.T.energy > 0.55 && Wn.T.shyness < 0.6) startMove(Wn, 'cheer', 1, 1);
        else if (Wn.T.grump > 0.5 || Wn.T.drama > 0.6) { mood(Wn, 0.34, 0); Wn.gr = 0.1 * dirTo(Wn); blink(Wn, true); soon(Wn, 1.3, () => { Wn.gr = 0; mood(Wn, 0, 0); }); }
        else if (Wn.T.shyness > 0.6) { hop(Wn, 0.04); lookDir(Wn, -dirTo(Wn) * 0.5, 0.4, 1); }
        else startMove(Wn, 'amused', 0.7, 1);
      });
      const sulks = (L.T.shyness > 0.6 || L.T.drama > 0.6) && L.X.recover < 0.55;
      soon(L, 1.5, () => {
        L.gx = 0; L.kx = 60; L.gs = 1;
        if (L.T.energy > 0.6 && L.X.recover > 0.6) { hop(L, 0.08); soon(L, 0.4, () => hop(L, 0.06)); lookAtOther(L, 1.4); pupil(L, 1.4, 2); mood(L, 0, 0.4); soon(L, 1.2, () => mood(L, 0, 0)); }   // "again!"
        else if (L.T.grump > 0.55) { mood(L, 0.46, 0); lookAtOther(L, 2.6); L.gr = -0.06 * dirTo(L); soon(L, 2.2, () => { L.gr = 0; mood(L, 0, 0); }); }
        else if (L.T.drama > 0.6) { L.lidGoal = 0.6; L.gs = 0.9; L.gq = 0.12; startMove(L, 'wobble', 0.6, 0.8); soon(L, 1.6 + 2 * (1 - L.X.recover), () => { L.lidGoal = baseLid(L); L.gs = 1; L.gq = 0; }); }
        else if (L.T.shyness > 0.6) { L.gs = 0.86; lookDir(L, -dirTo(L) * 0.6, 0.55, 1.8); soon(L, 1.4 + 2 * (1 - L.X.recover), () => { L.gs = 1; lookAtOther(L, 1); }); }
        else startMove(L, 'unimpressed', 1, 1);
      });
      if (sulks && Wn.X.affection > 0.5) soon(Wn, 3.0, () => {                          // the winner comforts its companion
        Wn.kx = 40; Wn.gx = dirTo(Wn) * 0.1 * size(Wn); lookAtOther(Wn, 2); blink(Wn, true);
        soon(L, 0.6, () => { L.vq += 1; lookAtOther(L, 1.6); blink(L, true); L.gs = 1; L.gq = 0; L.lidGoal = baseLid(L); mood(L, 0.15, 0); });
        soon(Wn, 1.8, () => { Wn.gx = 0; Wn.kx = 60; mood(L, 0, 0); });
      });
    }

    // ---------- tag ----------
    function behaveTag(t, ta) {
      const p = act.p, ev = E(ta), I = byRole(act.init), O = other(I);
      if (!ast.s) ast.s = { a: 0, b: 0 };
      const S2 = ast.s;
      if (!ast.hid) ast.hid = {};
      for (const a of [I, O]) { a.gs = ast.hid[a.role] ? Math.min(a.gs, 0.74) : 0.74; a.kx = (70 + 45 * a.T.energy + a.boost * 70) / speedK(); a.ky = 120; }
      // the opener: one bumps the other and darts away
      if (ta < 1.8) {
        ev('eye', 0, () => { lookAtOther(I, 1); mood(I, 0.32, 0); pupil(I, 1.25); crouch(I, 0.6); lookDir(O, -dirTo(O) * 0.4, 0.3, 0.6); });
        if (ta > 0.2 && ta < 0.62) S2[I.role] = mix(0, 0.5, ease((ta - 0.2) / 0.4));
        ev('bump', 0.62, () => { O.vq += 2.4; O.vx -= dirTo(O) * 160; mood(O, 0, 0.85); pupil(O, 0.75, -2); try { O.n.eye.poke(-dirTo(O) * 0.3, 0, nowS()); } catch (e) {} Sfx.play('pop', I.T); });
        if (ta >= 0.62) S2[I.role] = -0.12;
        ev('flee', 0.7, () => { mood(I, 0.3, 0); startMove(I, 'amused', 0.5, 1.4); });
        ev('it', 1.1, () => { lookAtOther(O, 2); mood(O, 0.3, 0); pupil(O, 1.3, 1.5); crouch(O, 0.8); });
      }
      let leg = null; for (const l of p.legs) if (l.t <= ta) leg = l;
      const ending = ta >= act.dur - 2.6;
      if (leg && !ending && ta < leg.t + leg.d) {
        const k = (ta - leg.t) / leg.d, it = byRole(leg.it), run = other(it), id = 'L' + leg.t;
        ev(id + 's', leg.t, () => { ast.legS = { it: S2[it.role], run: S2[run.role] }; lookAtOther(it, leg.d); mood(it, 0.3, 0); });
        const s0 = ast.legS || { it: S2[it.role], run: S2[run.role] };
        if (leg.k === 'chase') {
          S2[run.role] = mix(s0.run, -0.32, ease(clamp(k / 0.6)));
          const reach = 1 - S2[run.role] - (leg.caught ? 0.48 : 0.72);
          S2[it.role] = mix(s0.it, reach, ease(clamp(k / 0.85)));
          ev(id + 'r', leg.t + 0.05, () => { lookAtOther(run, 0.5); mood(run, 0, 0.6); pupil(run, 1.3, 1.5); });
          if (!leg.caught) {
            ev(id + 'd', leg.t + leg.d * 0.6, () => { run.gy = leg.dy * 0.34 * size(run); Sfx.play('spin'); });
            ev(id + 'o', leg.t + leg.d * 0.7, () => { mood(it, 0.15, 0); startMove(it, 'confused', 0.7, 1.4); });
            ev(id + 'g', leg.t + leg.d * 0.78, () => startMove(run, 'amused', 0.6, 1.3));
            ev(id + 'b', leg.t + leg.d * 0.92, () => { run.gy = 0; });
          } else ev(id + 'c', leg.t + leg.d * 0.86, () => {
            run.vq += 2.6; run.vx += -dirTo(run) * 120; hop(run, 0.06); try { run.n.eye.poke(-dirTo(run) * 0.3, 0, nowS()); } catch (e) {} Sfx.play('pop', it.T); buzz(6);
            soon(it, 0.1, () => { startMove(it, 'cheer', 0.6, 1.3); });
            soon(run, 0.4, () => { if (run.T.grump > 0.55) mood(run, 0.42, 0); else mood(run, 0.2, 0.3); lookAtOther(run, 1.4); });
            soon(run, 1.1, () => { mood(run, 0.3, 0); crouch(run, 0.8); });        // its turn now
          });
        } else if (leg.k === 'feint') {
          const kk = clamp((k - 0.15) / 0.25);
          S2[it.role] = k < 0.6 ? mix(s0.it, s0.it + 0.3, ease(kk)) : mix(s0.it + 0.3, s0.it, ease((k - 0.6) / 0.4));
          ev(id + 'f', leg.t + leg.d * 0.3, () => { it.vq += 2; run.vx += -dirTo(run) * 110; hop(run, 0.08); mood(run, 0, 0.85); pupil(run, 0.75, -2); S2[run.role] = s0.run - 0.1; });
          ev(id + 'm', leg.t + leg.d * 0.45, () => { mood(it, 0.36, 0); it.gr = 0.08 * dirTo(it); soon(it, 0.8, () => { it.gr = 0; }); });
          ev(id + 'n', leg.t + leg.d * 0.7, () => { mood(run, 0.3, 0); mood(it, 0, 0); });
        } else if (leg.k === 'hide' || leg.k === 'surprise') {
          const sz = size(run);
          if (k < 0.3) { ast.hid[run.role] = 1; S2[run.role] = mix(s0.run, -0.3, ease(k / 0.3)); run.gy = 0.36 * sz * ease(k / 0.3); run.gs = mix(0.74, 0.55, ease(k / 0.3)); run.lidGoal = 0.4; }
          ev(id + 'h', leg.t + 0.05, () => { lookDir(run, 0, -0.4, leg.d * 0.5); });
          if (k > 0.25 && k < 0.75) { S2[it.role] = mix(s0.it, 0.4, ease((k - 0.25) / 0.3)); if (t > it.next) { it.next = t + 0.55; lookDir(it, (Math.random() < 0.5 ? -1 : 1) * rnd(0.4, 0.9), rnd(-0.6, 0.4), 0.5); pupil(it, 0.9); } }
          if (leg.k === 'hide') {
            ev(id + 'x', leg.t + leg.d * 0.78, () => { look(it, pos(run).x, pos(run).y, 1.2); pupil(it, 1.4, 2); mood(it, 0, 0.6); soon(it, 0.5, () => startMove(it, 'cheer', 0.5, 1.3)); });
            ev(id + 'y', leg.t + leg.d * 0.82, () => { ast.hid = {}; run.gy = 0; run.gs = 0.74; run.lidGoal = baseLid(run); hop(run, 0.07); mood(run, 0, 0.7); soon(run, 0.6, () => startMove(run, 'amused', 0.6, 1.2)); });
          } else {
            ev(id + 'x', leg.t + leg.d * 0.55, () => { ast.hid = {}; run.gy = 0; run.gs = 0.8; run.lidGoal = 0; run.kx = 260; S2[run.role] = 1 - S2[it.role] - 0.46; hop(run, 0.12); mood(run, 0, 0.9); pupil(run, 1.5, 2); Sfx.play('boo', run.T); });
            ev(id + 'y', leg.t + leg.d * 0.62, () => { hop(it, 0.14); it.vx += -dirTo(it) * 200; pupil(it, 0.6, -3); mood(it, 0, 1); it.vr += 5 * dirTo(it); buzz([8, 30, 8]); });
            ev(id + 'z', leg.t + leg.d * 0.75, () => { S2[run.role] = 0.05; mood(it, 0, 0); if (it.T.grump > 0.55) respond(run, it, 'annoyed', 0, true); else if (it.T.drama > 0.6) startMove(it, 'wobble', 0.8, 1); else startMove(it, 'amused', 0.7, 1); soon(run, 0.3, () => startMove(run, 'amused', 0.7, 1.1)); });
          }
        } else {                                                   // collide
          if (k < 0.42) { S2[it.role] = mix(s0.it, 0.42, ease(k / 0.42)); S2[run.role] = mix(s0.run, 0.42, ease(k / 0.42)); }
          ev(id + 'k', leg.t + leg.d * 0.42, () => { for (const a of [it, run]) { a.vq += 3; hop(a, 0.06); a.vr += (a === it ? 5 : -5) * dirTo(a); mood(a, 0, 0.9); pupil(a, 0.7, -2.5); } Sfx.play('boing', it.T); buzz([8, 30, 8]); const m = midPt(); burst(m.x, m.y, 10, [[255, 255, 255]], 90, 0.6); });
          if (k >= 0.45) { const kk = ease((k - 0.45) / 0.25); S2[it.role] = mix(0.42, 0.04, kk); S2[run.role] = mix(0.42, 0.04, kk); }
          ev(id + 'z', leg.t + leg.d * 0.58, () => { startMove(it, 'roll', 0.6, 1.2); soon(run, 0.15, () => startMove(run, 'roll', 0.6, 1.1)); });
        }
      } else if (ending) {
        ev('home', act.dur - 2.6, () => { S2.a = 0; S2.b = 0; for (const a of [I, O]) { a.gy = 0; a.gs = 1; a.lidGoal = baseLid(a); lookAtOther(a, 1.4); } });
        ev('pant', act.dur - 2.0, () => { const L = byRole(p.end), Wn = other(L); if (L.T.grump > 0.55) startMove(L, 'unimpressed', 1, 1); else if (L.T.energy > 0.6) { hop(L, 0.06); soon(L, 0.35, () => hop(L, 0.05)); } else blink(L, true); soon(Wn, 0.5, () => startMove(Wn, 'amused', 0.6, 1.2)); });
        if (ta > act.dur - 2.4) for (const a of [I, O]) if (!a.move) a.gq = Math.sin(t * 9 + a.ph) * 0.03;
      } else if (leg && ta >= leg.t + leg.d) {                    // catching their breath between dashes
        for (const a of [I, O]) if (!a.move) { a.gq = Math.sin(t * 8 + a.ph) * 0.025; if (t > a.next) { a.next = t + rnd(0.5, 1); lookAtOther(a, 0.8); } }
      }
      for (const a of [I, O]) goS(a, S2[a.role]);
    }

    // ---------- bubble party ----------
    function behaveBubbles(t, ta) {
      const p = act.p;
      if (!ast.bub) ast.bub = p.b.map((b) => ({ ...b, st: 'wait', px: 0, py: 0, r: 0 }));
      const B = stage(), top = B ? B.top : 60, sz = size(A.me), y0 = homeY() - sz * 0.3, R0 = clamp(sz * 0.1, 12, 26);
      for (const b of ast.bub) {
        if (b.st === 'wait' && ta >= b.t - 0.35 && !b.conj) { b.conj = 1; const a = byRole(b.from); if (!a.move) { a.gs = 1.06; pupil(a, 1.3, 1.2); mood(a, 0, 0.35); lookDir(a, 0, -0.8, 0.8); soon(a, 0.45, () => { a.gs = 1; mood(a, 0, 0); }); } }
        if (b.st === 'wait' && ta >= b.t) { b.st = 'float'; Sfx.play('bloop', byRole(b.from).T); }
        if (b.st !== 'float') continue;
        const age = ta - b.t, life = 8.5 / b.sp, u = b.x + 0.06 * Math.sin(age * 1.3 * b.sp + b.ph);
        b.px = uX(u); b.py = mix(y0, top - 24, age / life) + Math.sin(age * 2.1 + b.ph) * 4; b.r = R0 * b.s * easeOut(clamp(age / 0.6));
        if (age > life) { b.st = 'gone'; continue; }
        if (b.by && !b.tried) {
          const a = byRole(b.by);
          if (ta >= b.pt - 0.7 && !b.aim) { b.aim = 1; if (!a.move) { look(a, b.px, b.py, 0.8); crouch(a, 0.8); pupil(a, 1.35, 1.5); mood(a, 0.25, 0); } }
          if (ta >= b.pt) {
            b.tried = 1;
            if (!a.move) { hop(a, 0.09 + 0.05 * a.T.energy); a.gx = clamp((b.px - pos(a).x) / size(a), -0.5, 0.5) * size(a) * 0.35; soon(a, 0.7, () => { a.gx = 0; mood(a, 0, 0); }); }
            toys.zaps.push({ a, x1: b.px, y1: b.py, t0: t, col: comp(a.n.color || [200, 222, 230]) }); capArr(toys.zaps, 6);
            popBubble(b, 'eye', a);
          }
        }
      }
      for (const a of [A.me, A.them]) {
        if (a.move) continue;
        if (t > a.next) {
          const live = ast.bub.filter((b) => b.st === 'float');
          a.next = t + rnd(0.7, 1.8) * (1.3 - a.X.attention * 0.6);
          a.fav = live.length ? live[Math.floor(Math.random() * live.length)] : null;
          if (Math.random() < 0.18) { a.fav = null; lookAtOther(a, 0.9); }
          if (a.T.energy > 0.62 && Math.random() < 0.25) hop(a, 0.04);
        }
        if (a.fav && a.fav.st === 'float') { look(a, a.fav.px, a.fav.py, 0.25); a.gx = clamp((a.fav.px - a.n.x) / size(a), -1, 1) * 0.05 * size(a) * (0.5 + a.T.curiosity); }
      }
      if (!ast.ev.end && ta >= act.dur - 1.2) { ast.ev.end = 1; for (const a of [A.me, A.them]) { a.gx = 0; soon(a, rnd(0.2, 0.6), () => blink(a, true)); } }
    }
    const allBubbles = () => (act && act.kind === 'bubbles' && ast.bub ? ast.bub : []).concat(toys.kids);
    function popBubble(b, who, a) {
      if (!b || b.st !== 'float') return false;
      b.st = 'popped';
      const x = b.px, y = b.py, R = Math.max(6, b.r), ca = A.me.n.color || [111, 193, 202], cb = A.them.n.color || [200, 222, 230];
      rings.push({ x, y, t0: nowS(), col: [230, 240, 245], r0: R * 0.9 }); capArr(rings, 20);
      burst(x, y, 6, [[235, 245, 250]], 70, 0.45);
      Sfx.play('popb', R);
      if (who === 'me' && act) queuePop(act.i, b.k);
      // someone else popped the one an Eye was going for
      if (who !== 'eye' && b.by && !b.tried) {
        b.tried = 1; const e = byRole(b.by);
        if (!e.move) {
          if (e.T.grump > 0.55) { mood(e, 0.42, 0); if (who === 'me' && e === A.me) lookDir(e, 0, 0.9, 1.2); else lookAtOther(e, 1.2); soon(e, 1.4, () => mood(e, 0, 0)); }
          else if (e.T.energy > 0.55) startMove(e, 'amused', 0.6, 1.2);
          else { mood(e, 0, 0.6); pupil(e, 0.85, -1); soon(e, 0.8, () => mood(e, 0, 0)); }
        }
      }
      const near = (e) => Math.hypot(pos(e).x - x, pos(e).y - y) < size(e) * 1.3;
      if (b.kd === 'sparkle') { burst(x, y, 18, [[255, 246, 214], [255, 255, 255]], 60, 1.4); for (const e of [A.me, A.them]) soon(e, rnd(0.1, 0.3), () => { pupil(e, 1.3, 1); }); }
      else if (b.kd === 'burst') {
        const cols = [ca, cb, comp(ca), comp(cb), [255, 214, 160], [190, 160, 255]];
        burst(x, y, 26, cols, 190, 1.1); Sfx.play('confetti');
        for (const e of [A.me, A.them]) if (near(e) && !e.move) soon(e, 0.05, () => { if (e.T.shyness > 0.6) { e.gx = -dirTo(e) * 0.05 * size(e); hop(e, 0.06); mood(e, 0, 0.8); soon(e, 0.8, () => { e.gx = 0; mood(e, 0, 0); }); } else if (e.T.drama > 0.6) startMove(e, 'wobble', 0.7, 1.1); else if (e.T.energy > 0.5) startMove(e, 'cheer', 0.7, 1.1); });
      } else if (b.kd === 'flies') {
        for (let j = 0; j < 3; j++) { const f = fly(x + rnd(-10, 10), y + rnd(-10, 10), 'wander', 0); f.r *= 0.6; f.a = 0.6; f.until = nowS() + 6; flies.push(f); }
        capArr(flies, 28); Sfx.play('chime');
      } else if (b.kd === 'more') {
        for (let j = 0; j < 3; j++) toys.kids.push({ k: 1000 + b.k * 10 + j, st: 'float', px: x, py: y, vx: (j - 1) * 46 + rnd(-8, 8), vy: -rnd(30, 60), r: R * 0.55, t0: nowS(), ph: rnd(0, TAU) });
        capArr(toys.kids, 18);
      } else if (b.kd === 'chain') {
        const rest = allBubbles().filter((o) => o !== b && o.st === 'float' && o.k < 1000).sort((p1, p2) => p1.k - p2.k).slice(0, 2);
        rest.forEach((o, j) => toys.chain.push({ b: o, at: nowS() + 0.25 * (j + 1) }));
        for (const e of [A.me, A.them]) soon(e, 0.3, () => { pupil(e, 1.4, 2); mood(e, 0, 0.6); soon(e, 0.9, () => mood(e, 0, 0)); });
      }
      return true;
    }
    function theirPops(i, list) {
      if (!act || act.i !== i || act.kind !== 'bubbles') return;
      const all = allBubbles();
      for (const k of list) { const b = all.find((x) => x.k === k); if (b) popBubble(b, 'them'); }
    }

    // ---------- dance off ----------
    function behaveDance(t, ta) {
      const p = act.p, ev = E(ta), I = byRole(act.init), Rr = other(I);
      ev('start', 0, () => { lookAtOther(I, 1); mood(I, 0.25, 0); pupil(I, 1.3, 1.4); crouch(I, 0.5); soon(Rr, 0.3, () => lookAtOther(Rr, 1.4)); });
      p.turns.forEach((tu, j) => ev('turn' + j, tu.t, () => danceTurn(tu, j)));
      for (const a of [I, Rr]) {
        if (a.move || a.spin) { a.trailOn = true; continue; }
        a.trailOn = false;
        if (t > a.next) { a.next = t + rnd(0.9, 1.8); lookAtOther(a, 1); }
        const bob = a === I || p.style === 'eager' ? a.T.energy * 0.6 + 0.25 : p.style === 'reluctant' && ta > act.dur * 0.5 ? 0.2 : 0;
        if (bob && motionMode() === 'on') a.gq = Math.sin(ta * TAU * 1.05 + (a === I ? 0 : 1.3)) * 0.035 * bob;
      }
      ev('fin', p.fin, () => danceFinale());
      ev('end', act.dur - 0.7, () => { for (const a of [I, Rr]) { a.trailOn = false; relax(a); mood(a, 0, 0); } });
    }
    function danceTurn(tu, j) {
      const a = byRole(tu.who), o = other(a), st = act.p.style, resp = a.role !== act.init, firstResp = resp && !ast.didResp;
      if (resp) ast.didResp = true;
      let amp = tu.amp * (1 + Math.min(1, a.boost) * 0.4), delay = 0;
      if (resp && st === 'reluctant' && firstResp) { amp *= 0.45; delay = 0.6; lookDir(a, 0, 0.9, 0.6); }
      if (resp && st === 'embarrassed') {
        amp *= a.boost > 0.4 ? 0.75 : 0.4;
        if (firstResp) { soon(a, 1.6, () => { a.gs = 0.86; lookDir(a, -dirTo(a) * 0.7, 0.5, 1.4); mood(a, 0.3, 0); blushOn(a, 2.2); }); soon(a, 3, () => { a.gs = 1; mood(a, 0, 0); }); }
      }
      if (resp && st === 'unimpressed') {
        if (firstResp) { startMove(a, 'unimpressed', 1, 1); return; }
        if (j >= act.p.turns.length - 2) { amp = 1.25; soon(a, 2.0, () => { mood(a, 0.32, 0); a.gr = 0.1 * dirTo(a); blink(a, true); soon(a, 1.2, () => { a.gr = 0; mood(a, 0, 0); }); }); }
        else amp *= 0.55;
      }
      const go = () => {
        startMove(a, tu.mv, amp, 1); a.trailOn = true;
        if (a.boost > 0.8) soon(a, 1.9, () => { if (!a.move) startMove(a, a.T.energy > 0.5 ? 'bounce' : 'shimmy', 0.6, 1.2); });   // cheered on: one more flourish
        soon(o, 0.4, () => { if (o.move) return; lookAtOther(o, 1.4); if (o.T.grump > 0.6) mood(o, 0.3, 0); else if (amp > 1.0) { pupil(o, 1.35, 1.5); mood(o, 0, 0.4); } });
        soon(o, 1.7, () => { if (!o.move) mood(o, 0, 0); });
      };
      if (delay) soon(a, delay, go); else go();
    }
    function danceFinale() {
      const p = act.p, I = byRole(act.init), Rr = other(I);
      if (p.together) {
        for (const a of [I, Rr]) {
          a.move = null; crouch(a, 0.8);
          soon(a, 0.25, () => { hop(a, 0.14); a.spin = { t0: nowS(), d: 0.8, from: a.r, by: dirTo(a) * TAU }; a.trailOn = true; });
          soon(a, 1.3, () => { lookAtOther(a, 1.6); blink(a, true); mood(a, 0.3, 0); });
          soon(a, 2.6, () => { mood(a, 0, 0); a.trailOn = false; });
        }
        Sfx.play('spin');
        soon(I, 0.75, () => { const m = midPt(); burst(m.x, m.y - size(I) * 0.4, 20, [comp(I.n.color || [111, 193, 202]), comp(Rr.n.color || [200, 222, 230]), [255, 255, 255]], 120, 1.1); Sfx.play('chime'); });
      } else {
        startMove(I, 'twirl', 1.1, 1);
        soon(Rr, 0.6, () => {
          if (p.style === 'embarrassed') { lookDir(Rr, dirTo(Rr) * 0.6, 0.4, 1); blink(Rr, true); soon(Rr, 1.4, () => hop(Rr, 0.04)); }
          else if (p.style === 'unimpressed') { blink(Rr, true); soon(Rr, 0.9, () => blink(Rr, true)); }
          else startMove(Rr, 'cheer', 1, 1);
        });
      }
    }

    // ---------- curious discoveries ----------
    function behaveDiscover(t, ta) {
      const p = act.p, ev = E(ta), F1 = byRole(p.first), F2 = other(F1), B = stage(), sz = size(A.me), dt = frameDt;
      if (!toys.obj && !ast.objMade) {
        ast.objMade = true;
        const mx = (A.me.n.x + A.them.n.x) / 2, hy = homeY(); let oy = hy - sz * 0.56; if (B && oy < B.top + 26) oy = hy + sz * 0.56;
        toys.obj = { kind: p.obj, x: mx, y: oy, x0: mx, y0: oy, st: 'form', t0: t, sh: 0, glow: 0, r: clamp(sz * 0.085, 10, 20), vx: 0, vy: 0, form: 0, rng: mulberry32(p.oseed), seen: 0 };
        for (let i = 0; i < 14; i++) motes.push({ x: mx + rnd(-1, 1) * sz * 0.6, y: oy + rnd(-0.5, 0.5) * sz, tx: () => ({ x: toys.obj ? toys.obj.x : mx, y: toys.obj ? toys.obj.y : oy }), t0: t + rnd(0, 0.5), d: rnd(0.7, 1.1), col: [230, 236, 255] });
        Sfx.play('shimmer');
      }
      const O = toys.obj;
      if (!O) { ev('end', act.dur - 0.8, () => { for (const a of [F1, F2]) { a.kx = 60; a.gs = 1; relax(a); mood(a, 0, 0); } }); return; }
      O.form = Math.min(1, O.form + dt / 1.3);
      ev('n1', 0.8, () => { look(F1, O.x, O.y, 1.4); pupil(F1, 1.4, 2); mood(F1, 0, 0.6); if (F1.T.energy > 0.55) hop(F1, 0.05); soon(F1, 1.1, () => { lookAtOther(F1, 0.6); mood(F1, 0, 0.3); }); });
      ev('n2', 1.5, () => { look(F2, O.x, O.y, 1.2); if (F2.T.shyness > 0.6) { F2.gs = 0.9; F2.gx = -dirTo(F2) * 0.06 * size(F2); hop(F2, 0.05); soon(F2, 0.9, () => lookAtOther(F2, 0.7)); } else { pupil(F2, 1.3, 1.5); mood(F2, 0, 0.5); } });
      if (ta < p.rev) {
        const inv = ta >= 1.8, close = ta >= p.rev - 1.2;
        for (const a of [F1, F2]) {
          if (a.move) continue;
          const keen = a === F1 ? 0.5 + a.T.curiosity * 0.6 : (0.25 + a.T.curiosity * 0.5) * (1 - 0.6 * a.T.shyness) * clamp((ta - 2.5) / 3);
          if (inv) { a.kx = 30; a.gx = (O.x - a.n.x) * (close ? 0.36 : 0.26) * keen + Math.sin(t * 2.2 + a.ph) * 0.012 * size(a); a.gy = (O.y - a.n.y) * 0.12 * keen; }
          if (inv && t > a.next) { a.next = t + rnd(0.7, 1.6) * (1.3 - a.X.attention * 0.5); if (Math.random() < 0.28) lookAtOther(a, 0.6); else look(a, O.x, O.y, 0.9); }
          if (close) { pupil(a, 1.45); mood(a, 0, 0.45); }
        }
        if (close) O.glow = Math.min(1, O.glow + dt / 1.2);
        p.twitch.forEach((tw, j) => ev('tw' + j, tw, () => {
          O.sh = 0.6 + 0.2 * j; Sfx.play('twitch', j);
          for (const a of [F1, F2]) if (!a.move) { a.vq += 1.2; hop(a, 0.03 + 0.04 * a.T.shyness); mood(a, 0, 0.7); a.gx -= (O.x - a.n.x) * 0.1 * (0.5 + a.T.shyness); soon(a, 0.6, () => mood(a, 0, 0.2)); }
        }));
      }
      ev('reveal', p.rev, () => revealObj(t));
      if (ast.ev.reveal) afterReveal(t, ta);
      ev('end', act.dur - 0.8, () => { for (const a of [F1, F2]) { a.kx = 60; a.gs = 1; relax(a); mood(a, 0, 0); } if (toys.obj) toys.obj.fade = toys.obj.fade || nowS(); });
    }
    function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function revealObj(t) {
      const O = toys.obj, p = act.p, F1 = byRole(p.first), F2 = other(F1), ca = A.me.n.color || [111, 193, 202], cb = A.them.n.color || [200, 222, 230];
      if (!O) return;
      O.rt = t; O.glow = 1; buzz(8);
      for (const a of [F1, F2]) { a.kx = 90; a.gx = 0; a.gy = 0; }
      if (O.kind === 'egg') {
        O.st = 'hatch'; Sfx.play('crack');
        soon(F1, 0.5, () => { for (let j = 0; j < 6; j++) { const f = fly(O.x + rnd(-8, 8), O.y + rnd(-8, 8), 'wander', 0); f.a = 0.7; f.vx = rnd(-90, 90); f.vy = rnd(-90, 30); f.until = nowS() + 7; flies.push(f); } capArr(flies, 28); burst(O.x, O.y, 12, [[255, 246, 214]], 90, 0.8); Sfx.play('chime'); });
        for (const a of [F1, F2]) soon(a, rnd(0.6, 0.9), () => { pupil(a, 1.45, 2); mood(a, 0.3, 0.3); if (a.T.energy > 0.55) startMove(a, 'cheer', 0.8, 1); });
      } else if (O.kind === 'orb') {
        O.st = 'bounce'; const r = O.rng; O.vx = (r() < 0.5 ? -1 : 1) * (240 + 160 * r()); O.vy = -(380 + 200 * r()); O.bonk = 0; Sfx.play('boing', F1.T);
        for (const a of [F1, F2]) { mood(a, 0, 0.9); pupil(a, 0.8, -2); hop(a, 0.05); }
      } else if (O.kind === 'critter') {
        O.st = 'scurry'; O.path = []; const r = O.rng;
        let u = 0.5, tt = 0.2; for (let j = 0; j < 5; j++) { u = j % 2 ? 0.15 + 0.25 * r() : 0.6 + 0.25 * r(); O.path.push({ t: tt, u, y: (r() - 0.3) * 0.5 }); tt += 0.6 + 0.6 * r(); }
        O.path.push({ t: tt + 0.2, u: r() < 0.5 ? -0.9 : 1.9, y: 0.1 }); O.exitAt = tt + 0.8;
        Sfx.play('giggle', { energy: 0.95, shyness: 0.1 });
        for (const a of [F1, F2]) { pupil(a, 1.4, 2); mood(a, 0, 0.8); if (a.T.shyness > 0.6) { a.gx = -dirTo(a) * 0.08 * size(a); hop(a, 0.06); } }
      } else if (O.kind === 'crystal') {
        O.st = 'gone'; Sfx.play('confetti');
        const cols = [ca, cb, comp(ca), comp(cb), [255, 220, 150], [200, 170, 255], [160, 255, 210]];
        for (let j = 0; j < 46; j++) { const an = rnd(-Math.PI, 0), v = rnd(160, 380); toys.conf.push({ x: O.x, y: O.y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, rot: rnd(0, TAU), vr: rnd(-9, 9), w: rnd(4, 8), h: rnd(2, 4), col: cols[j % cols.length], t0: t, d: rnd(1.6, 2.6) }); }
        capArr(toys.conf, 120);
        for (const a of [F1, F2]) soon(a, 0.1, () => { if (a.T.shyness > 0.62) { hop(a, 0.07); mood(a, 0, 0.9); a.gx = -dirTo(a) * 0.06 * size(a); soon(a, 1, () => { a.gx = 0; startMove(a, 'amused', 0.5, 1.2); }); } else startMove(a, a.T.energy > 0.45 ? 'cheer' : 'amused', 0.9, 1); });
      } else {                                                   // magnet: pulls both Eyes in until they squish together
        O.st = 'pull'; Sfx.play('whoosh');
        for (const a of [F1, F2]) { a.kx = 140; a.gx = (O.x - a.n.x) * 0.62; a.gy = (O.y - a.n.y) * 0.18; mood(a, 0, 0.9); pupil(a, 0.85, -1.5); }
        soon(F1, 0.5, () => { for (const a of [F1, F2]) { a.vq += 2.5; a.gsx = -0.08; } Sfx.play('boing', F1.T); buzz(8); });
        soon(F1, 1.0, () => { for (const a of [F1, F2]) { lookDir(a, -dirTo(a) * 0.7, 0.4, 1.4); mood(a, 0.28, 0); a.lidGoal = 0.25; if (a.T.shyness > 0.4) blushOn(a, 2); } });
        soon(F1, 2.3, () => { if (toys.obj) { toys.obj.st = 'gone'; burst(toys.obj.x, toys.obj.y, 14, [[255, 255, 255]], 120, 0.7); } Sfx.play('pop', F1.T); for (const a of [F1, F2]) { a.gsx = 0; a.gx = -dirTo(a) * 0.04 * size(a); a.gy = 0; hop(a, 0.07); a.lidGoal = baseLid(a); } });
        soon(F1, 3.0, () => { for (const a of [F1, F2]) { a.gx = 0; a.kx = 60; lookAtOther(a, 1.4); mood(a, 0, 0); } soon(F2, 0.4, () => blink(F2, true)); soon(F1, 0.6, () => blink(F1, true)); });
      }
    }
    function afterReveal(t, ta) {
      const O = toys.obj; if (!O) return;
      const dt = frameDt, p = act.p, F1 = byRole(p.first), F2 = other(F1), B = stage(), W = innerWidth, since = t - O.rt;
      if (O.st === 'hatch') { if (since > 1.6) { O.st = 'shell'; O.fade = O.fade || nowS(); } for (const a of [F1, F2]) if (!a.move && t > a.next) { a.next = t + rnd(0.7, 1.4); const fs = flies.filter((f) => f.until); if (fs.length) { const f = fs[Math.floor(Math.random() * fs.length)]; look(a, f.x, f.y, 0.8); } } }
      else if (O.st === 'bounce') {
        O.vy += 1300 * dt; O.x += O.vx * dt; O.y += O.vy * dt;
        const top = B ? B.top + O.r : O.r, bot = B ? B.bottom - O.r : innerHeight - 80;
        if (O.x < O.r || O.x > W - O.r) { O.vx = -O.vx * 0.9; O.x = clamp(O.x, O.r, W - O.r); Sfx.play('boing', { energy: 0.9, shyness: 0 }); }
        if (O.y > bot) { O.y = bot; O.vy = -Math.max(380, Math.abs(O.vy) * 0.82); }
        if (O.y < top) { O.y = top; O.vy = Math.abs(O.vy); }
        for (const a of [F1, F2]) {
          look(a, O.x, O.y, 0.2);
          if (Math.hypot(pos(a).x - O.x, pos(a).y - O.y) < size(a) * 0.42 && t - (a.bonkAt || 0) > 0.8) { a.bonkAt = t; a.vq += 2.4; hop(a, 0.06); mood(a, 0, 0.9); pupil(a, 0.7, -2); O.vx = -O.vx; O.vy = -420; Sfx.play('pop', a.T); soon(a, 0.7, () => { if (a.T.grump > 0.55) mood(a, 0.4, 0); else startMove(a, 'amused', 0.5, 1.2); }); }
        }
        if (since > 4.6) { O.st = 'gone'; burst(O.x, O.y, 16, [[255, 255, 255], comp(F1.n.color || [111, 193, 202])], 110, 0.8); Sfx.play('absorb'); for (const a of [F1, F2]) soon(a, 0.4, () => { lookAtOther(a, 1.2); blink(a, true); }); }
      } else if (O.st === 'scurry') {
        let a0 = O.path[0], a1 = O.path[0];
        for (let j = 0; j < O.path.length; j++) { if (O.path[j].t <= since) a0 = O.path[j]; if (O.path[j].t > since) { a1 = O.path[j]; break; } a1 = O.path[j]; }
        const k = a1 === a0 ? 1 : ease((since - a0.t) / Math.max(0.1, a1.t - a0.t));
        O.x = uX(mix(a0.u, a1.u, k)); O.y = homeY() + size(A.me) * mix(a0.y, a1.y, k) * 0.9 + Math.abs(Math.sin(since * 22)) * -3;
        for (const a of [F1, F2]) {
          if (a.move) continue;
          look(a, O.x, O.y, 0.2);
          if (a.T.energy > 0.55 && !a.air && Math.random() < dt * 2) { a.kx = 90; a.gx = clamp((O.x - a.n.x) * 0.25, -0.2 * size(a), 0.2 * size(a)); hop(a, 0.05); }
        }
        if (since > O.exitAt) { O.st = 'gone'; for (const a of [F1, F2]) soon(a, 0.3, () => { a.gx = 0; lookAtOther(a, 1.2); mood(a, 0, 0.3); soon(a, 0.6, () => blink(a, true)); }); }
      }
      if (O.st === 'gone' || O.st === 'shell') O.fade = O.fade || (O.st === 'gone' ? nowS() : 0);
    }
    function objTouched(mine) {
      const O = toys.obj; if (!O || !act) return;
      const t = nowS();
      if (mine) { if (t - (O.lastTap || 0) < 0.25) return; O.lastTap = t; if (t - (O.sentAt || 0) > 1.5) { O.sentAt = t; sendPart({ o: 'obj', id: S.id, i: act.i }); } }
      if (O.st === 'form' || !O.rt) {
        O.sh = Math.min(1.2, O.sh + 0.5); O.glow = Math.min(1, O.glow + 0.25); Sfx.play('twitch', 0);
        for (const a of [A.me, A.them]) if (!a.move) { look(a, O.x, O.y, 0.8); a.vq += 0.8; mood(a, 0, 0.5); soon(a, 0.6, () => mood(a, 0, 0)); }
      } else if (O.st === 'bounce') { O.vy = -520; O.vx *= 1.1; }
      else if (O.st === 'scurry') { O.exitAt = Math.max(0, (t - O.rt) + 0.3); }
    }
    function theirObj(i) { if (act && act.i === i && act.kind === 'discover') objTouched(false); }

    const PLAY = { tug: behaveTug, tag: behaveTag, bubbles: behaveBubbles, dance: behaveDance, discover: behaveDiscover, mischief: behaveMischief };
    function wrapUp(t) {
      ast.wrapped = true;
      for (const a of [A.me, A.them]) { a.kx = 60; a.ky = 90; a.gsx = 0; a.gs = 1; a.gy = 0; a.trailOn = false; relax(a); }
    }
    function clearToys(t, prevAst) {
      const R = toys.rope; toys.rope = null;
      if (R && R.on > 0.1 && A.me) { const m = ropeMid(); burst(m.x, m.y, 8, [[255, 255, 255]], 60, 0.5); }
      if (toys.obj && toys.obj.st !== 'gone') { burst(toys.obj.x, toys.obj.y, 10, [[240, 240, 255]], 70, 0.6); }
      toys.obj = null; toys.pebble = null; toys.chain = [];
      const bubs = (prevAst && prevAst.bub ? prevAst.bub : []).concat(toys.kids).filter((b) => b.st === 'float');
      bubs.forEach((b) => toys.fadeB.push({ px: b.px, py: b.py, r: b.r, t0: t })); capArr(toys.fadeB, 30);
      toys.kids = [];
    }
    function stepToys(t, dt) {
      const W = innerWidth, B = stage(), top = B ? B.top : 60;
      toys.cheers = toys.cheers.filter((c) => t - c.t0 < c.d);
      for (const c of toys.cheers) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy *= 1 - dt * 1.2; }
      toys.conf = toys.conf.filter((c) => t - c.t0 < c.d);
      for (const c of toys.conf) { c.vy += 620 * dt; c.vx *= 1 - dt * 1.4; c.vy *= 1 - dt * 0.6; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; }
      toys.zaps = toys.zaps.filter((z) => t - z.t0 < 0.35);
      toys.blush = toys.blush.filter((b) => t - b.t0 < b.d);
      toys.fadeB = toys.fadeB.filter((b) => t - b.t0 < 0.6);
      for (const k of toys.kids) {
        if (k.st !== 'float') continue;
        k.vx *= 1 - dt * 0.8; k.vy = k.vy * (1 - dt * 0.5) - 24 * dt; k.px += k.vx * dt; k.py += k.vy * dt + Math.sin(t * 2.4 + k.ph) * 0.3;
        k.px = clamp(k.px, 10, W - 10);
        if (k.py < top - 20 || t - k.t0 > 7) k.st = 'gone';
      }
      toys.kids = toys.kids.filter((k) => k.st === 'float');
      for (let j = toys.chain.length - 1; j >= 0; j--) if (t >= toys.chain[j].at) { const c = toys.chain[j]; toys.chain.splice(j, 1); popBubble(c.b, 'chain'); }
      const pb = toys.pebble;
      if (pb) {
        const hp = holdPt(pb.holder); pb.a = Math.min(1, pb.a + dt * 3);
        pb.x = mix(pb.x, hp.x + Math.sin(t * 1.7) * 3, Math.min(1, dt * 9)); pb.y = mix(pb.y, hp.y + Math.sin(t * 2.3) * 3 - Math.abs(pb.x - hp.x) * 0.25, Math.min(1, dt * 9));
        if (pb.fade && t - pb.fade > 0.5) toys.pebble = null;
      }
      const O = toys.obj;
      if (O) { O.sh = Math.max(0, O.sh - dt * 1.8); if (O.fade && t - O.fade > 0.6) toys.obj = null; }
      for (const f of flies) if (f.until && t > f.until && f.mode !== 'leave') { f.mode = 'leave'; f.vy = -rnd(30, 60); }
    }

    // ---------- owner touch during the new activities ----------
    function touchPlay(p, ev) {
      if (!act || !PLAY[act.kind] || elapsed() - act.start > act.dur) return false;
      const k = act.kind;
      if (k === 'bubbles') {
        const hit = allBubbles().filter((b) => b.st === 'float' && Math.hypot(p.x - b.px, p.y - b.py) < Math.max(28, b.r * 1.45)).sort((b1, b2) => Math.hypot(p.x - b1.px, p.y - b1.py) - Math.hypot(p.x - b2.px, p.y - b2.py))[0];
        if (hit) { popBubble(hit, 'me'); return true; }
        return false;
      }
      if (k === 'discover') {
        const O = toys.obj;
        if (O && O.st !== 'gone' && Math.hypot(p.x - O.x, p.y - O.y) < Math.max(40, O.r * 2.6)) { objTouched(true); return true; }
        return false;
      }
      const onThem = Math.hypot(p.x - pos(A.them).x, p.y - pos(A.them).y) < size(A.them) * 0.45;
      if (k === 'tug') { if (!ast.revealed) { hold = { id: ev.pointerId }; encourage(A.me, 0.35, false); return true; } return false; }
      if ((k === 'tag' || k === 'dance') && !onThem) { encourage(A.me, 0.5, false); return true; }
      return false;
    }

    // ----- fireflies: winking lights to follow, chase and pounce at; some travel through the doorway -----
    function spawnFlies(cur) {
      flies = flies.filter((f) => f.mode === 'leave');
      const c = cur.p, W = innerWidth, pa = pos(A.me);
      for (let i = 0; i < c.count; i++) flies.push(fly(W * rnd(0.12, 0.88), mix(seamY + 40, pa.y - size(A.me) * 0.2, Math.random()), 'enter', i / c.count));
      ast.cross = c.cross.map((x) => ({ ...x, done: false, landed: false }));
    }
    function fly(x, y, mode, k) {
      const ca = A.me.n.color || [111, 193, 202], cb = A.them.n.color || [200, 222, 230], m = Math.random();
      const col = [mix(ca[0], cb[0], m), mix(ca[1], cb[1], m), mix(ca[2], cb[2], m)].map((v) => mix(v, 255, 0.35));
      return { x, y: mode === 'enter' ? y + 30 : y, vx: rnd(-20, 20), vy: rnd(-20, 10), ph: rnd(0, TAU), f1: rnd(0.3, 0.7), f2: rnd(0.2, 0.5), col, a: 0, mode: 'wander', t0: nowS() + (k || 0) * 1.2,
        blinkAt: nowS() + rnd(1, 5), blink: 0, r: rnd(2.4, 3.6), perch: null, life: 0 };
    }
    function perchPt(a) { const p = pos(a); return { x: p.x, y: p.y - size(a) * 0.46 * a.yd }; }
    function behaveFlies(t, ta) {
      const dur = act.dur, W = innerWidth;
      for (const c of ast.cross || []) {
        if (!c.done && ta >= c.t) {
          c.done = true;
          if (c.from === S.role) {                         // one of ours drifts up through the doorway to their phone
            const cand = flies.filter((f) => f.mode === 'wander' && !f.perch).sort((f1, f2) => f1.y - f2.y)[0];
            if (cand) { cand.mode = 'leave'; cand.vy = -50; cand.cross = true; for (const a of [A.me, A.them]) look(a, cand.x, cand.y, 1.4); }
          }
        }
        if (!c.landed && c.from !== S.role && ta >= c.t + 1.6) {   // one of theirs comes in through the doorway
          c.landed = true;
          const f = fly(clamp(pos(A.them).x + rnd(-90, 90), 20, W - 20), seamY - 6, 'wander', 0);
          f.vy = 60; f.mode = 'arrive'; f.a = 0.4; flies.push(f); seamFlash = Math.max(seamFlash, 0.6);
          Sfx.play('chime');
          for (const a of [A.me, A.them]) { soon(a, a === A.me ? 0.1 : rnd(0.3, 0.6), () => { pupil(a, 1.3, 1.8); mood(a, 0, 0.4); soon(a, 1, () => mood(a, 0, 0)); }); }
        }
      }
      if (!ast.ending && ta >= dur - 3.2) {
        ast.ending = true;
        flies.forEach((f) => { f.mode = 'leave'; f.vy = -rnd(25, 55); f.perch = null; });
        for (const a of [A.me, A.them]) { soon(a, rnd(1.4, 2.4), () => { blink(a, true); relax(a); }); }
      }
      for (const a of [A.me, A.them]) {
        if (a.move) continue;
        const live = flies.filter((f) => f.mode !== 'leave' || f.cross);
        if (!live.length) continue;
        if (!a.fav || !flies.includes(a.fav) || t > a.favUntil) { a.fav = live[Math.floor(Math.random() * live.length)]; a.favUntil = t + rnd(1.6, 4) * (1.2 - a.T.curiosity * 0.5); }
        const f = a.fav, p = pos(a), sz = size(a);
        look(a, f.x, f.y, 0.25);
        if (!ast.ending) {
          const dx = clamp((f.x - p.x) / sz, -1, 1), dyl = clamp(((f.y - p.y) * a.yd) / sz, -1, 1);   // dyl: in its own frame
          a.gx = dx * 0.16 * sz * (0.5 + a.T.curiosity); a.gy = a.lean + Math.max(-0.1 * sz, dyl * 0.06 * sz);
          if (t > a.next && !a.air) {
            a.next = t + rnd(3, 7) * (1.4 - a.T.energy * 0.6) * speedK();
            const near = Math.hypot(f.x - p.x, f.y - p.y) < sz * 1.3;
            if (near && Math.random() < 0.35 + 0.5 * a.T.energy) {
              crouch(a, 1); pupil(a, 1.4, 2);
              soon(a, 0.22, () => { hop(a, 0.1 + 0.05 * a.T.energy); a.vx += dx * 260; f.vx += Math.sign(f.x - p.x || 1) * rnd(90, 150); f.vy -= rnd(60, 120) * a.yd; soon(a, 0.6, () => { pupil(a, 1); mood(a, 0.2, 0); soon(a, 0.8, () => mood(a, 0, 0)); }); });
            } else if (Math.random() < 0.25 && !flies.some((g) => g.perch)) {
              // a firefly settles on top of the Eye; it looks up at it and blinks it away
              f.perch = a; f.perchUntil = t + rnd(2.2, 3.6); f.mode = 'perch';
              soon(a, 0.5, () => { lookDir(a, 0, -1, 2.2); pupil(a, 1.25); });
              soon(a, (f.perchUntil - t) - 0.15, () => { blink(a, false); });
            }
          }
        }
      }
    }
    function stepFlies(t, dt) {
      if (!flies.length) return;
      const W = innerWidth, H = innerHeight, pa = A.me && pos(A.me);
      const cx = W / 2, cy = pa ? mix(seamY, pa.y, 0.55) : H * 0.4;
      const sp = 1 / speedK();
      for (const f of flies) {
        f.life += dt;
        if (t < f.t0) continue;
        if (f.mode === 'perch' && f.perch) {
          const p = perchPt(f.perch), tx = p.x + Math.sin(t * 2 + f.ph) * 4;
          f.x = mix(f.x, tx, Math.min(1, dt * 5)); f.y = mix(f.y, p.y, Math.min(1, dt * 5)); f.a = Math.min(1, f.a + dt * 2);
          if (t > f.perchUntil) { f.mode = 'wander'; f.perch = null; f.vy = 90; f.vx = rnd(-60, 60); }
        } else {
          const ax = Math.sin(t * f.f1 + f.ph) * 26 + Math.sin(t * f.f2 * 1.7 + f.ph * 2) * 14;
          const ay = Math.cos(t * f.f2 + f.ph * 1.3) * 22 + Math.sin(t * f.f1 * 1.3) * 10;
          if (f.mode === 'leave') { f.vy -= 70 * dt; f.vx *= 0.99; if (f.y < seamY - 30) f.dead = true; if (!f.cross) f.a = Math.max(0, f.a - dt * 0.35); }
          else {
            if (f.mode === 'arrive' && f.life > 1.6) f.mode = 'wander';
            f.vx += (ax + (cx - f.x) * 0.22) * dt; f.vy += (ay + (cy - f.y) * 0.25) * dt;
            f.vx *= 1 - dt * 0.9; f.vy *= 1 - dt * 0.9;
            f.a = Math.min(1, f.a + dt * 0.8);
          }
          f.x += f.vx * dt * sp; f.y += f.vy * dt * sp;
          if (f.mode !== 'leave') { f.x = clamp(f.x, 10, W - 10); f.y = clamp(f.y, f.mode === 'arrive' ? seamY - 10 : seamY + 14, H - 60); }
        }
        if (t > f.blinkAt) { f.blink = t; f.blinkAt = t + rnd(1.5, 6); }
        if (f.a <= 0 && f.mode === 'leave') f.dead = true;
      }
      flies = flies.filter((f) => !f.dead);
    }

    // ----- catch: one ball, one owner. It only exists on the screen of the phone whose Eye has it (or in the
    //       air between your Eye and the doorway). When theirs has it, light spills through the doorway. -----
    function relayBusy() {
      if (!S) return true;
      const lim = relayLimited();
      if (lim && nowS() - toldRelay > 60) { toldRelay = nowS(); say('The messaging relay asked for a breather, so your Eye is keeping the ball for now.', false); }
      return lim || !budgetOk();
    }
    function startCatch(cur, t) {
      ast.owner = cur.init; ast.n = 0;
      const H = byRole(cur.init), mine = H === A.me;
      ball = { st: mine ? 'conjure' : 'theirs', holder: H, t0: t, x: 0, y: 0, vx: 0, vy: 0, oy: 0, ov: 0, sc: 0, spin: 0, trail: [], nextPlay: t + rnd(1.5, 2.5), col: H.n.color || [200, 222, 230], glow: 0 };
      if (mine) {
        const hp = holdPt(H);
        for (let i = 0; i < 16; i++) { const an = rnd(0, TAU), r = rnd(30, 70); sparks.push({ x: hp.x + Math.cos(an) * r, y: hp.y + Math.sin(an) * r, tx: hp.x, ty: hp.y, vx: 0, vy: 0, t0: t + rnd(0, 0.5), d: 0.8, conv: true, col: ball.col }); }
        lookDir(H, 0, -0.9, 1.4); pupil(H, 1.3, 1.6); mood(H, 0, 0.4); Sfx.play('conjure');
        ast.holdUntil = t + rnd(2.6, 4.2) * (1.2 - 0.4 * H.T.energy);
        soon(A.them, rnd(0.4, 0.9), () => { look(A.them, hp.x, hp.y, 1.5); pupil(A.them, 1.2, 1); });
      } else {
        // theirs is making one on their phone: the doorway brightens and their Eye looks at it
        look(H, holdPt(H).x, holdPt(H).y, 1.4); pupil(H, 1.3, 1.6);
        soon(A.me, rnd(0.4, 0.9), () => { look(A.me, holdPt(A.them).x, holdPt(A.them).y, 1.4); pupil(A.me, 1.2, 1); });
      }
    }
    function holdPt(a) { const p = pos(a), sz = size(a); return { x: p.x + dirTo(a) * sz * 0.04, y: p.y - sz * 0.55 }; }
    const ballR = () => clamp(size(A.me) * 0.065, 9, 16);
    function behaveCatch(t, ta) {
      if (!ball) { behaveCompany(t, ta, false, true); return; }
      const dur = act.dur, b = ball, late = ta >= dur;
      const M = A.me, T = A.them;
      if (b.st === 'conjure' && t - b.t0 > 1.2 * speedK()) { b.st = 'held'; mood(M, 0, 0); }
      if (b.st === 'held') {
        const hp = holdPt(M);
        if (t > b.nextPlay) {
          b.nextPlay = t + rnd(1.2, 2.6);
          const r = Math.random();
          if (r < 0.45) b.ov = -rnd(220, 320);
          else if (r < 0.7) { M.gr = 0.09 * (Math.random() < 0.5 ? -1 : 1); soon(M, 0.8, () => { M.gr = 0; }); }
          else pupil(M, 1.35, 1.2);
        }
        look(M, hp.x, hp.y + b.oy - 6, 0.3);
        if (!T.move && t > T.next) { T.next = t + rnd(1.5, 3.5); if (Math.random() < 0.7) look(T, hp.x, hp.y, rnd(1, 2)); else lookAtOther(T, 1); }
        if (late) { absorb(t); return; }
        if (ast.owner === S.role && t > ast.holdUntil && ta < dur - 4.5 && !relayBusy()) throwBall(t, 0.5 + Math.random() * 0.5, false);
        else if (ast.owner === S.role && t > ast.holdUntil) ast.holdUntil = t + 3;
        if (ast.owner === S.role && !toldFlick && ta < dur - 6 && !relayLimited()) { toldFlick = true; say('Your Eye has the ball. Flick it over, or let it throw.', false); }
      }
      if (b.st === 'theirs') {
        // over on their phone: their Eye plays with it beyond the doorway; yours waits for it
        if (t > b.nextPlay) { b.nextPlay = t + rnd(1.3, 2.8); b.glow = 1; if (Math.random() < 0.5) T.vy += 70; else pupil(T, 1.35, 1.2); }
        look(T, holdPt(T).x, holdPt(T).y, 0.3);
        if (!M.move && t > M.next) { M.next = t + rnd(1.5, 3.2); if (Math.random() < 0.7) look(M, holdPt(T).x, holdPt(T).y, rnd(1, 2)); else lookAtOther(M, 1); }
        if (late) { absorb(t); return; }
      }
      if (b.st === 'drag' && late) { b.st = 'held'; absorb(t); }
      if (b.st === 'windup' && t - b.t0 > 0.42 * speedK()) launch(t);
      if (b.st === 'twindup' && t - b.t0 > 0.42 * speedK()) comeIn(t);
      if (b.landed) { b.landed = false; if (late) absorb(t); }
    }
    function throwBall(t, power, user, vx, vy) {
      const b = ball; if (!b || !(b.st === 'held' || b.st === 'drag')) return false;
      if (relayBusy()) return false;
      ast.n += 1; ast.owner = S.role === 'a' ? 'b' : 'a';
      b.power = power; b.user = user;
      const n = ast.n, m = { o: 'toss', id: S.id, i: act.i, n, p: Math.round(power * 100) / 100, u: user ? 1 : 0 };
      const s = S;
      sendSoft(m, true).then((ok) => { if (!ok && S === s && S.phase === 'live') setTimeout(() => { if (S === s && S.phase === 'live' && act && act.i === m.i) sendSoft(m, true); }, 2500); });
      if (user) { b.st = 'windup'; b.uvx = vx; b.uvy = vy; launch(t); return true; }
      b.st = 'windup'; b.t0 = t;
      crouch(A.me, 1.1); A.me.gs = 0.97; pupil(A.me, 1.25);
      look(A.me, holdPt(A.me).x, holdPt(A.me).y - 40, 0.5);
      return true;
    }
    function launch(t) {
      const b = ball, M = A.me, hp = holdPt(M), tp = pos(A.them);
      b.st = 'out'; b.t0 = t; b.x = hp.x; b.y = hp.y + b.oy; b.oy = 0; b.ov = 0; b.trail = [];
      if (b.uvx != null) { b.vx = clamp(b.uvx, -700, 700); b.vy = Math.min(-900, b.uvy); b.uvx = b.uvy = null; }
      else {
        // aim beside their Eye at the doorway
        const tx = tp.x + (Math.random() < 0.5 ? -1 : 1) * size(A.them) * rnd(0.2, 0.45), up = 1250 + 450 * b.power;
        const tFly = Math.max(0.2, (-up + Math.sqrt(Math.max(0, up * up - 2 * 1500 * (b.y - seamY)))) / -1500) || 0.45;
        b.vx = (tx - b.x) / Math.max(0.25, Math.abs(tFly)); b.vy = -up;
      }
      M.gs = 1; M.vq -= 3.2; M.vy -= 120;
      look(M, b.x + b.vx * 0.2, seamY, 0.9); mood(M, 0, 0.3); soon(M, 0.7, () => mood(M, 0, 0));
      soon(A.them, 0.1, () => { look(A.them, b.x, b.y - 80, 0.8); pupil(A.them, 1.3, 1.5); mood(A.them, 0, 0.35); });
      Sfx.play('toss');
    }
    // their throw lands in your world: in through the doorway, down to your Eye
    function comeIn(t) {
      const b = ball, T = A.them, tp = pos(T);
      T.vq -= 3; T.vy -= 140;                                  // they let go (toward you)
      b.st = 'in'; b.t0 = t; b.holder = null; b.trail = []; b.sc = 1;
      b.ex = clamp(tp.x + rnd(-0.35, 0.35) * size(T), 18, innerWidth - 18); b.ey = Math.max(seamY + 12, holdPt(T).y - size(T) * 0.25); b.dur = 0.85 * speedK();
      b.fum = PLAN.fumble(S.seed, act.i, ast.n, A.me.T);
      b.col = T.n.color || b.col;
      seamFlash = 1; Sfx.play('incoming');
      look(A.me, b.ex, b.ey + 20, 0.6); pupil(A.me, 1.3, 1.6);
    }
    function stepBall(t, dt) {
      const b = ball; if (!b) return;
      b.spin += dt * (b.st === 'out' || b.st === 'in' ? 9 : 1.6);
      b.glow = Math.max(0, (b.glow || 0) - dt * 1.4);
      if (b.st === 'theirs' || b.st === 'twindup') {
        const hp = holdPt(A.them);
        b.x = hp.x + Math.sin(t * 1.3) * 3;
        b.y = hp.y - (b.glow || 0) * 12 + Math.sin(t * 2.1) * 2;
        b.sc = 1; b.col = A.them.n.color || b.col;
      }
      if (b.st === 'conjure' || b.st === 'held' || b.st === 'windup') {
        const hp = holdPt(A.me);
        b.sc = b.st === 'conjure' ? easeOut((t - b.t0) / (1.1 * speedK())) : 1;
        b.ov += 1600 * dt; b.oy += b.ov * dt; if (b.oy > 0) { b.oy = 0; b.ov = b.ov > 120 ? -b.ov * 0.25 : 0; if (b.ov) A.me.vq += 0.6; }
        const wob = b.st === 'windup' ? size(A.me) * 0.08 : 0;
        b.x = mix(b.x || hp.x, hp.x + Math.sin(t * 1.3) * 3, Math.min(1, dt * 12)); b.y = mix(b.y || hp.y, hp.y + b.oy + wob + Math.sin(t * 2.1) * 2, Math.min(1, dt * 12));
      } else if (b.st === 'drag') {
        b.x = mix(b.x, b.px, Math.min(1, dt * 18)); b.y = mix(b.y, b.py, Math.min(1, dt * 18));
        look(A.me, b.x, b.y, 0.25);
      } else if (b.st === 'out') {
        b.vy += 1500 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        b.trail.push([b.x, b.y]); if (b.trail.length > 9) b.trail.shift();
        look(A.them, b.x, b.y, 0.25);
        if (b.y < seamY - 18 || t - b.t0 > 1.6) {
          // through the doorway: it's on their phone now
          b.st = 'over'; b.t0 = t; b.trail = []; seamFlash = 1;
          b.fum = PLAN.fumble(S.seed, act.i, ast.n, A.them.T);
        }
      } else if (b.st === 'over') {
        // their Eye catches it on their side (or fumbles it): seen here as a reaction through the doorway
        if (!b.reacted && t - b.t0 > 0.45 * speedK()) {
          b.reacted = true; const T = A.them;
          if (b.fum) { T.vr += 4; mood(T, 0, 0.8); pupil(T, 0.75, -2.5); T.vq += 2; T.vy += 120; soon(T, 1, () => { mood(T, 0.3, 0); lookAtOther(T, 1); }); soon(T, 2, () => mood(T, 0, 0)); soon(A.me, rnd(0.3, 0.6), () => { if (A.me.T.grump > 0.6) mood(A.me, 0.35, 0); else startMove(A.me, 'amused', 0.6, 1.2); }); }
          else { T.vy += 170; T.vq += 1.6; pupil(T, 1.3, 1.2); mood(T, 0.3, 0); soon(T, 0.7, () => mood(T, 0, 0)); }
        }
        if (t - b.t0 > (b.fum ? 2 : 0.9) * speedK()) { b.st = 'theirs'; b.holder = A.them; b.reacted = false; b.nextPlay = t + rnd(1, 2); b.landed = true; }
      } else if (b.st === 'in') {
        const cp = holdPt(A.me), k = clamp((t - b.t0) / b.dur);
        b.x = mix(b.ex, cp.x, easeOut(k)); b.y = mix(b.ey, cp.y, k) - Math.sin(Math.PI * k) * Math.min(50, Math.max(0, b.ey - seamY - 10));
        b.trail.push([b.x, b.y]); if (b.trail.length > 9) b.trail.shift();
        look(A.me, b.x, b.y, 0.25); look(A.them, b.x, b.y, 0.25);
        if (k > 0.55 && !b.antic) { b.antic = true; crouch(A.me, 0.5); pupil(A.me, 1.35, 1.5); mood(A.me, 0, 0.35); }
        if (k >= 1) land(t);
      } else if (b.st === 'fumble') {
        const M = A.me, p = pos(M), floor = p.y + size(M) * 0.5;
        b.vy += 1400 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 1 - dt * 0.8;
        if (b.y > floor) { b.y = floor; if (Math.abs(b.vy) > 160) b.vy = -b.vy * 0.45; else b.vy = 0; }
        b.x = clamp(b.x, 12, innerWidth - 12);
        look(M, b.x, b.y, 0.25);
        if (!b.scoop && t - b.t0 > 1.15 * speedK()) { b.scoop = t; const dx = clamp((b.x - p.x) / size(M), -0.6, 0.6); M.gx = dx * size(M) * 0.4; hop(M, 0.05); }
        if (b.scoop && t - b.scoop > 0.45 * speedK()) {
          M.gx = 0; b.st = 'held'; b.holder = M; b.ov = -260; b.nextPlay = t + rnd(1.2, 2.2); b.landed = true;
          const sheepish = M.T.shyness > 0.55 ? () => { lookDir(M, -0.6, 0.5, 0.9); mood(M, 0.25, 0); } : M.T.grump > 0.55 ? () => mood(M, 0.4, 0) : () => { mood(M, 0.35, 0); hop(M, 0.04); };
          sheepish(); soon(M, 1.2, () => { mood(M, 0, 0); lookAtOther(M, 1); });
          gotIt(t);
        }
      } else if (b.st === 'absorb') {
        const a = b.holder;
        if (a === A.them) {                                    // theirs keeps it: the light at the doorway fades
          const k = clamp((t - b.t0) / (0.9 * speedK())); b.sc = 1 - k;
          if (k >= 1) { pupil(a, 1.4, 2); soon(a, 0.25, () => blink(a, true)); soon(a, 1.2, () => pupil(a, 1)); ball = null; }
          return;
        }
        const p = pos(a), e = a.n.eye, sz = size(a), k = clamp((t - b.t0) / (0.7 * speedK()));
        const px = p.x + (e ? e.gaze.x * sz * 0.18 : 0), py = p.y + (e ? e.gaze.y * sz * 0.14 : 0);
        b.x = mix(b.x, px, easeOut(k)); b.y = mix(b.y, py, easeOut(k)); b.sc = 1 - k;
        if (k >= 1) { rings.push({ x: px, y: py, t0: t, col: b.col, r0: sz * 0.12 }); pupil(a, 1.4, 2.5); a.vq += 1.8; soon(a, 0.25, () => blink(a, true)); soon(a, 1.2, () => pupil(a, 1)); Sfx.play('absorb'); ball = null; }
      }
    }
    function land(t) {
      const b = ball, M = A.me;
      b.antic = false; b.trail = [];
      if (b.fum) {
        b.st = 'fumble'; b.t0 = t; b.scoop = 0;
        b.vx = rnd(-1, 1) * rnd(140, 220); b.vy = -rnd(380, 520);
        M.vr += 4; mood(M, 0, 0.8); pupil(M, 0.75, -2.5); M.vq += 2;
        Sfx.play('fumble'); buzz([6, 40, 6]);
        soon(A.them, rnd(0.3, 0.6), () => { if (A.them.T.grump > 0.6) { mood(A.them, 0.35, 0); soon(A.them, 1, () => mood(A.them, 0, 0)); } else startMove(A.them, 'amused', 0.6, 1.2); });
        return;
      }
      b.st = 'held'; b.holder = M; b.ov = -180; b.nextPlay = t + rnd(1, 2); b.landed = true;
      M.vy += 140; M.vq += 2; pupil(M, 1.3, 1.2); mood(M, 0.3, 0); soon(M, 0.7, () => mood(M, 0, 0));
      rings.push({ x: b.x, y: b.y, t0: t, col: b.col, r0: ballR() });
      Sfx.play('catch', M.T); buzz(8);
      gotIt(t);
    }
    function gotIt(t) { if (ast.owner === S.role) ast.holdUntil = t + rnd(2.2, 5) * (1.25 - 0.5 * A.me.T.energy) * speedK() * (elapsed() > 900 ? 1.4 : 1); }
    function absorb(t) {
      if (!ball || ball.st === 'absorb') return;
      if (!ball.holder) { ballGone(); return; }
      ball.st = 'absorb'; ball.t0 = t;
      if (ball.holder === A.me) lookDir(A.me, 0, -0.6, 0.6); else look(A.them, pos(A.them).x, seamY - 30, 0.8);
    }
    function ballGone() {
      if (!ball) return;
      if (ball.st !== 'theirs' && ball.st !== 'over') for (let i = 0; i < 10; i++) sparks.push({ x: ball.x, y: ball.y, vx: rnd(-90, 90), vy: rnd(-120, 40), t0: nowS(), d: rnd(0.5, 0.9), col: ball.col });
      ball = null;
    }
    // their phone threw: toss {i, n}
    function theirToss(m) {
      if (!S || S.phase !== 'live' || !act) return;
      const i = Number(m.i) | 0, n = Number(m.n) | 0;
      const key = i + ':' + n; if (S.tossIn[key]) return; S.tossIn[key] = 1;
      if (act.i !== i || act.kind !== 'catch') return;
      const ta = elapsed() - act.start;
      if (ta > act.dur + 1) return;
      if (n <= ast.n) return;
      const t = nowS();
      // wherever this phone last saw the ball, it is now with their Eye, about to come through the doorway
      if (!ball) ball = { st: 'theirs', holder: A.them, t0: t, x: 0, y: 0, vx: 0, vy: 0, oy: 0, ov: 0, sc: 1, spin: 0, trail: [], nextPlay: t + 9, col: A.them.n.color || [200, 222, 230], glow: 0 };
      ball.st = 'twindup'; ball.t0 = t; ball.holder = A.them; ball.trail = []; ball.reacted = false; ball.glow = 1;
      ast.n = n; ast.owner = S.role;
      crouch(A.them, 1.1); look(A.them, holdPt(A.them).x, holdPt(A.them).y, 0.5);
      if (m.u) A.them.vq += 0.8;
    }

    // ---------- farewell ----------
    function farewell(who) {
      farewellAt = nowS(); farewellWho = who;
      if (ball) absorb(nowS());
      flies.forEach((f) => { f.mode = 'leave'; f.vy = -rnd(30, 60); f.perch = null; });
      refresh();
    }
    function stepFarewell(t) {
      if (!A.me) return;
      const first = farewellWho === 'me' ? A.me : A.them, second = other(first);
      if (!ast.fw || ast.fw !== farewellAt) {
        ast.fw = farewellAt;
        for (const a of [A.me, A.them]) { a.lean = 0; a.away = 0; relax(a); a.doze = 0; }
        startMove(first, 'wave', 1, 1);
        soon(second, rnd(0.35, 0.7), () => startMove(second, 'wave', rnd(0.7, 1), rnd(0.85, 1.15)));
        // then their Eye leans back out through the doorway
        soon(A.them, 2.1, () => { A.them.away = 0.85 * size(A.them); A.them.gx = -dirTo(A.them) * A.them.away; seamFlash = 0.8; });
      }
    }
    function peerAway(on) {
      if (!A.them) return;
      if (on) { if (ball && ball.holder === A.them) absorb(nowS()); A.them.move = null; A.them.doze = 0.6; refresh(); say(`${S.nm} stepped away. Their Eye is dozing until they're back.`, true); }
      else { const a = A.them; a.doze = 0; a.lidGoal = baseLid(a); pupil(a, 1.3, 2); hop(a, 0.08); lookAtOther(a, 1.5); soon(A.me, 0.3, () => { lookAtOther(A.me, 1.5); pupil(A.me, 1.25, 1.5); hop(A.me, 0.05); Sfx.play('hello', A.me.T); }); say('', false); refresh(); }
    }
    function wokeUp() { if (A.me) { A.me.doze = 0; pupil(A.me, 1.2, 1.5); lookAtOther(A.me, 1.2); } lastT = 0; }

    // ---------- touch: tap an Eye to tease it; flick the ball when it's yours ----------
    function tease(a, fromRemote) {
      const t = nowS(); if (!a || t - a.tapAt < 0.6) return; a.tapAt = t;
      const e = a.n.eye, d = dirTo(a);
      if (e && e.poke) { try { e.poke(-d * 0.3, -0.2 * a.yd, t); } catch (err) {} }
      const w = a.w;
      if (w === 'hyper' || w === 'curious') hop(a, 0.08);
      else if (w === 'shy') { a.gs = 0.92; soon(a, 0.9, () => { a.gs = 1; }); }
      else if (w === 'grumpy' || w === 'smug') { a.gr = 0.07 * d; soon(a, 0.18, () => { a.gr = -0.07 * d; }); soon(a, 0.36, () => { a.gr = 0; }); }
      else if (w === 'dramatic') startMove(a, 'wobble', 0.9, 1.1);
      else if (w === 'sleepy') { a.doze = 0; a.vy -= 60; soon(a, 0.6, () => blink(a, true)); }
      else a.vq += 2.2;
      a.doze = 0;
      Sfx.play('pop', a.T);
      const o = other(a);
      if (o && !o.move) soon(o, rnd(0.25, 0.5), () => { lookAtOther(o, 1.4); if (Math.random() < 0.55 && o.T.grump < 0.65) startMove(o, 'amused', 0.5, 1.2); });
      if (!fromRemote && S && S.phase === 'live' && Date.now() - S.lastTapSent > 4000) { S.lastTapSent = Date.now(); sendSoft({ o: 'tap', id: S.id, w: a.role }); }
    }
    function remoteTap(role) { if (!A.me) return; tease(byRole(role), true); }
    function bindInput() {
      const el = document.getElementById('eyesContact'); if (!el) return;
      let drag = null;
      const local = (ev) => { const r = el.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
      const ignore = (ev) => !!(ev.target && ev.target.closest && ev.target.closest('.ec-top, .ec-panel, .ec-drawer, .ec-guide, .ec-toast'));
      const down = (ev) => {
        Sfx.unlock();
        if (!S || S.phase !== 'live' || !A.me || ignore(ev)) return;
        const p = local(ev);
        if (ball && ball.holder === A.me && ball.st === 'held' && Math.hypot(p.x - ball.x, p.y - ball.y) < Math.max(48, ballR() * 3.4)) {
          drag = { id: ev.pointerId, pts: [[p.x, p.y, ev.timeStamp]] };
          ball.st = 'drag'; ball.px = p.x; ball.py = p.y;
          try { el.setPointerCapture(ev.pointerId); } catch (e) {}
          ev.preventDefault();
          return;
        }
        if (touchPlay(p, ev)) { ev.preventDefault(); return; }               // 4.7: pop, poke the object, cheer
        for (const a of [A.me, A.them]) { const q = pos(a); if (Math.hypot(p.x - q.x, p.y - q.y) < size(a) * 0.45 && (a === A.me || p.y > seamY)) { tease(a, false); return; } }
      };
      const move = (ev) => {
        if (!drag || ev.pointerId !== drag.id || !ball || ball.st !== 'drag') return;
        const p = local(ev); ball.px = p.x; ball.py = Math.max(seamY + 10, p.y);
        drag.pts.push([p.x, p.y, ev.timeStamp]); if (drag.pts.length > 8) drag.pts.shift();
      };
      const up = (ev) => {
        if (hold && ev.pointerId === hold.id) hold = null;
        if (!drag || ev.pointerId !== drag.id) return;
        const pts = drag.pts; drag = null;
        if (!ball || ball.st !== 'drag') return;
        const a = pts[0], b = pts[pts.length - 1], dtm = Math.max(16, b[2] - a[2]) / 1000;
        const vx = (b[0] - a[0]) / dtm, vy = (b[1] - a[1]) / dtm;
        const ta = elapsed() - act.start;
        const thrown = vy < -380 && Math.hypot(vx, vy) > 480 && act.kind === 'catch' && ta < act.dur - 2.5 && ast.owner === S.role && throwBall(nowS(), clamp(-vy / 2400, 0.3, 1), true, vx * 0.6, vy * 0.9);
        if (!thrown && ball && ball.st === 'drag') { ball.st = 'held'; ball.ov = -160; A.me.vq += 0.8; lookAtOther(A.me, 0.8); }
      };
      el.dataset.hangout = '1';
      el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      input = { off() { delete el.dataset.hangout; el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); } };
    }

    // ---------- the invitation, inside the Meeting Space ----------
    function behaveInvite(t, m, th) {
      if (!card) return false;
      if (th.eye && t > (th.ctl.until || 0)) { host().lookAt(th, host().pos(m).x, host().pos(m).y, 1.2); th.eye.pupilGoal = 1.15; }
      if (m.eye && t > (m.ctl.until || 0)) { if (Math.random() < 0.6) host().lookAt(m, host().pos(th).x, host().pos(th).y, rnd(0.8, 1.6)); else { m.eye.setTarget(0, 0.1); m.eye.reactUntil = t + 0.8; m.ctl.until = t + 0.8; } }
      return true;
    }
    function panelInvite(p) {
      if (!card) return false;
      p.innerHTML = `<div class="eh-ask"><p><b>${esc(friendName(card.f))}</b>'s Eye wants to hang out.</p><div class="ec-actions"><button type="button" class="ec-btn" data-h="no">Not now</button><button type="button" class="ec-btn ec-primary" data-h="yes">Hang out</button></div></div>`;
      p.querySelector('[data-h=no]').onclick = decline;
      p.querySelector('[data-h=yes]').onclick = acceptInvite;
      return true;
    }
    // ---------- the panel while it runs: a quiet line, a passing tip, sound, and a way out ----------
    function panel(p) {
      if (!S) return false;
      const ph = S.phase, live = ph === 'live', nm = esc(S.nm);
      const label = ph === 'asking' ? (S.askSent ? `Waiting for ${nm}'s Eye…` : 'Inviting…') : ph === 'answering' ? 'Heading over…'
        : ph === 'leaving' ? 'Saying goodbye…' : live ? (S.peerAway ? `${nm} stepped away` : `Hanging out with ${nm}`) : '';
      const tip = live && nowS() < tipUntil ? (S.v >= 3 ? '<p class="eh-tip">Leave them be, or join in: tap an Eye, pop what floats, cheer yours on. Play, Tease and Surprise nudge your Eye; it decides the rest.</p>'
        : '<p class="eh-tip">Leave them be, or tap an Eye to tease it. When the ball is yours, flick it up to send it to your friend.</p>') : '';
      let nudges = '';
      if (live && S.v >= 3) {
        const why = cueBlock(), off = !!why;
        const G = { play: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="4.2"/><path d="M8.5 6.5l1.2 1.6M15.5 6.5l-1.2 1.6M12 4.5v2"/></svg>',
          tease: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15c2-4 4-4 6 0s4 4 6 0"/><circle cx="18.5" cy="7.5" r="1.4"/></svg>',
          surprise: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5l1.6 4.4 4.4 1.6-4.4 1.6L12 16.5l-1.6-4.4L6 10.5l4.4-1.6z"/><path d="M18 16.5v3M16.5 18h3"/></svg>' };
        const L = { play: 'Play', tease: 'Tease', surprise: 'Surprise' };
        const tipFor = { cool: 'resting a moment', away: 'their friend stepped away', arrive: 'still saying hello', relay: 'the relay needs a breather' }[why] || '';
        nudges = `<div class="eh-nudge${off ? ' eh-nudge-off' : ''}" role="group" aria-label="Nudge your Eye">${['play', 'tease', 'surprise'].map((k) => `<button type="button" class="eh-n" data-n="${k}"${off ? ' aria-disabled="true"' : ''} aria-label="${L[k]}${tipFor ? ` (${tipFor})` : ''}">${G[k]}<span>${L[k]}</span></button>`).join('')}</div>`;
      }
      const btn = ph === 'asking' ? 'Never mind' : ph === 'answering' || live ? 'Say goodbye' : '';
      const snd = live || ph === 'leaving' ? `<button type="button" class="ec-btn ec-small eh-snd${Sfx.muted() ? ' eh-snd-off' : ''}" data-h="snd" aria-label="${Sfx.muted() ? 'Hangout sound is off. Turn it on' : 'Hangout sound is on. Mute it'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="spk" d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path class="on" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="off" d="M16 9.5l5 5M21 9.5l-5 5"/></svg></button>` : '';
      p.innerHTML = `<div class="eh-live${ph === 'over' ? ' eh-over' : ''}"><p class="ec-hint">${label}</p>${tip}${nudges}<div class="eh-row">${btn ? `<button type="button" class="ec-btn ec-small" data-h="bye">${btn}</button>` : ''}${snd}</div></div>`;
      const b = p.querySelector('[data-h=bye]'); if (b) b.onclick = () => sayGoodbye();
      p.querySelectorAll('[data-n]').forEach((b) => { b.onclick = () => {
        Sfx.unlock();
        const k = b.dataset.n, why = cueBlock();
        if (why) { b.classList.remove('eh-n-no'); void b.offsetWidth; b.classList.add('eh-n-no'); return; }
        if (nudge(k)) { b.classList.add('eh-n-go'); }
        refresh();
      }; });
      const sb = p.querySelector('[data-h=snd]'); if (sb) sb.onclick = () => { Sfx.unlock(); Sfx.setMuted(!Sfx.muted()); refresh(); };
      if (tip) setTimeout(() => { const el = p.querySelector('.eh-tip'); if (el) el.classList.add('eh-tip-out'); }, Math.max(0, (tipUntil - nowS()) * 1000));
      return true;
    }

    // ---------- drawing (the effects layer) ----------
    function sky(g, t, tools) {
      if (!fx || !fx.isConnected) { if (S && S.phase !== 'asking' && S.phase !== 'answering' && attached && !attached.invite) ensureFx(); if (!fx) return; }
      if (!sizeFx()) return;
      const c = fg;
      // Both Eyes are fully visible; discard any inherited doorway clipping.
      if (A.them && A.them.n.el.style.clipPath) A.them.n.el.style.clipPath = '';
      if (!S || !A.me) { if (drew) { c.clearRect(0, 0, fW, fH); drew = false; } return; }
      c.clearRect(0, 0, fW, fH); drew = true;
      const rgba = tools.rgba, ca = A.me.n.color || [111, 193, 202], cb = A.them.n.color || [200, 222, 230];
      c.globalCompositeOperation = 'lighter';
      const fade = (y) => clamp((y - (seamY - 14)) / 24);       // things fade as they pass through the doorway
      motes = motes.filter((m) => t - m.t0 < m.d + 0.2);
      for (const m of motes) {
        const k = clamp((t - m.t0) / m.d); if (k <= 0) continue;
        const p = m.tx(), x = mix(m.x, p.x, easeOut(k)), y = mix(m.y, p.y, easeOut(k));
        glow(c, x, y, 2 + 2 * (1 - k), m.col, 0.8 * Math.sin(Math.PI * k), rgba);
      }
      for (const f of flies) {
        if (t < f.t0 || f.a <= 0.01) continue;
        const bk = f.blink ? clamp((t - f.blink) / 0.22) : 1, lid = bk < 1 ? Math.sin(Math.PI * bk) : 0;
        const tw = 0.75 + 0.25 * Math.sin(t * 3 + f.ph), a = f.a * tw * (1 - 0.85 * lid) * fade(f.y);
        if (a <= 0.01) continue;
        glow(c, f.x, f.y, f.r * 4.5, f.col, 0.3 * a, rgba);
        c.fillStyle = rgba(f.col.map((v) => mix(v, 255, 0.5)), 0.95 * a);
        c.beginPath(); c.ellipse(f.x, f.y, f.r * 1.25, Math.max(0.3, f.r * 0.62 * (1 - lid)), Math.sin(t * 0.7 + f.ph) * 0.4, 0, TAU); c.fill();
      }
      if (ball && ['conjure', 'held', 'drag', 'windup', 'out', 'in', 'fumble', 'theirs', 'twindup'].includes(ball.st) || (ball && ball.st === 'absorb' && ball.holder === A.me)) {
        const b = ball, R = ballR() * (b.sc == null ? 1 : b.sc), fa = fade(b.y);
        if (R > 0.3 && fa > 0.01) {
          for (let i = 0; i < b.trail.length; i++) { const [x, y] = b.trail[i], k = (i + 1) / b.trail.length; glow(c, x, y, R * (0.5 + 0.6 * k), b.col, 0.16 * k * fade(y), rgba); }
          glow(c, b.x, b.y, R * 3.4, b.col, 0.32 * fa, rgba);
          const gr = c.createRadialGradient(b.x - R * 0.3, b.y - R * 0.3, R * 0.1, b.x, b.y, R);
          gr.addColorStop(0, `rgba(255,255,255,${0.98 * fa})`); gr.addColorStop(0.45, rgba(b.col.map((v) => mix(v, 255, 0.55)), 0.95 * fa)); gr.addColorStop(1, rgba(b.col, 0.15 * fa));
          c.fillStyle = gr; c.beginPath(); c.arc(b.x, b.y, R, 0, TAU); c.fill();
          c.fillStyle = `rgba(255,255,255,${0.85 * fa})`; c.beginPath(); c.arc(b.x + Math.cos(b.spin) * R * 0.55, b.y + Math.sin(b.spin) * R * 0.3, Math.max(0.8, R * 0.14), 0, TAU); c.fill();
        }
      }
      rings = rings.filter((r) => t - r.t0 < 0.7);
      for (const r of rings) { const k = (t - r.t0) / 0.7; c.strokeStyle = rgba(r.col, 0.45 * (1 - k)); c.lineWidth = 1.5; c.beginPath(); c.arc(r.x, r.y, r.r0 + k * 26, 0, TAU); c.stroke(); }
      sparks = sparks.filter((s) => t - s.t0 < s.d);
      for (const s of sparks) {
        const k = (t - s.t0) / s.d; if (k < 0) continue;
        let x, y;
        if (s.conv) { x = mix(s.x, ball ? ball.x : s.tx, easeOut(k)); y = mix(s.y, ball ? ball.y : s.ty, easeOut(k)); }
        else { x = s.x + s.vx * k * s.d; y = s.y + s.vy * k * s.d + 120 * k * k; }
        glow(c, x, y, 2.4, s.col, 0.7 * Math.sin(Math.PI * k), rgba);
      }
      drawPlay(c, t, rgba, ca, cb);
      c.globalCompositeOperation = 'source-over';
    }
    function drawPlay(c, t, rgba, ca, cb) {
      const W = innerWidth;
      // energy trails behind dancing Eyes, in each Eye's complementary colour
      for (const a of [A.me, A.them]) {
        const tr = a.trail; if (tr.length < 2) continue;
        const col = comp(a.n.color || [200, 222, 230]), sz = size(a);
        for (let i = 0; i < tr.length; i++) { const k = (i + 1) / tr.length, age = t - tr[i][2]; glow(c, tr[i][0], tr[i][1], sz * (0.08 + 0.14 * k), col, 0.11 * k * clamp(1 - age * 1.6), rgba); }
      }
      // the glowing strand for tug of war
      const R = toys.rope;
      if (R && R.on > 0.01 && A.me) {
        const ga = gripPt(byRole('a')), gb = gripPt(byRole('b')), ten = clamp(Math.abs(R.P) * 1.2 + (elapsed() - act.start > 1.6 ? 0.45 : 0), 0, 1);
        const mx = mix(ga.x, gb.x, 0.5) + 0, my = (ga.y + gb.y) / 2 + (1 - ten) * 16 + Math.sin(t * 31) * 1.6 * ten;
        const k = R.on;
        const colA = byRole('a').n.color || ca, colB = byRole('b').n.color || cb;
        const gr = c.createLinearGradient(ga.x, 0, gb.x === ga.x ? ga.x + 1 : gb.x, 0);
        gr.addColorStop(0, rgba(colA.map((v) => mix(v, 255, 0.3)), 0.9 * k)); gr.addColorStop(1, rgba(colB.map((v) => mix(v, 255, 0.3)), 0.9 * k));
        c.lineCap = 'round';
        for (const [lw, al] of [[9, 0.12], [4, 0.3], [1.6, 1]]) {
          c.globalAlpha = al; c.strokeStyle = gr; c.lineWidth = lw;
          c.beginPath();
          if (k >= 0.99) { c.moveTo(ga.x, ga.y); c.quadraticCurveTo(mx, my, gb.x, gb.y); }
          else for (const g0 of [ga, gb]) { c.moveTo(g0.x, g0.y); c.quadraticCurveTo(mix(g0.x, mx, 0.5 * k), mix(g0.y, my, 0.6 * k), mix(g0.x, mx, k), mix(g0.y, my, k)); }   // it grows out of both Eyes
          c.stroke();
        }
        c.globalAlpha = 1;
        // the knot in the middle shows who is winning
        const knot = { x: mix(mx, R.P > 0 ? (byRole('a').n.x) : (byRole('b').n.x), Math.abs(R.P) * 0.25), y: my - (1 - ten) * 8 };
        if (k >= 0.99) glow(c, knot.x, knot.y, 10 + 6 * ten, [255, 255, 255], 0.5 * k, rgba);
        if (ten > 0.6 && Math.random() < 0.3) sparks.push({ x: mix(ga.x, gb.x, Math.random()), y: my + rnd(-3, 3), vx: rnd(-20, 20), vy: rnd(-40, 10), t0: t, d: 0.4, col: [255, 255, 255] });
      }
      // bubbles: thin iridescent skins with a highlight
      const bubs = allBubbles();
      for (const b of bubs) { if (b.st !== 'float' || b.r < 1) continue; drawBubble(c, b.px, b.py, b.r, 1, t, ca, cb, rgba); }
      for (const b of toys.fadeB) { const k = (t - b.t0) / 0.6; drawBubble(c, b.px, b.py - k * 10, b.r * (1 + k * 0.2), 1 - k, t, ca, cb, rgba); }
      for (const z of toys.zaps) { const k = (t - z.t0) / 0.35, p = pos(z.a); c.strokeStyle = rgba(z.col, 0.55 * (1 - k)); c.lineWidth = 2; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(mix(p.x, z.x1, Math.min(1, k * 3)), mix(p.y, z.y1, Math.min(1, k * 3))); c.stroke(); }
      // the pebble someone steals
      const pb = toys.pebble;
      if (pb) { const al = pb.a * (pb.fade ? clamp(1 - (t - pb.fade) / 0.5) : 1); glow(c, pb.x, pb.y, 16, pb.col, 0.35 * al, rgba); c.fillStyle = rgba(pb.col.map((v) => mix(v, 255, 0.5)), 0.95 * al); c.beginPath(); c.arc(pb.x, pb.y, 5, 0, TAU); c.fill(); }
      // the mysterious object
      const O = toys.obj;
      if (O) drawObj(c, O, t, rgba, ca, cb);
      // confetti
      for (const f of toys.conf) {
        const k = (t - f.t0) / f.d, al = k > 0.7 ? (1 - k) / 0.3 : 1;
        c.save(); c.translate(f.x, f.y); c.rotate(f.rot); c.scale(1, Math.abs(Math.cos(f.rot * 1.3)) * 0.8 + 0.2);
        c.fillStyle = rgba(f.col, 0.9 * al); c.fillRect(-f.w / 2, -f.h / 2, f.w, f.h); c.restore();
      }
      // owners' cheering
      for (const s of toys.cheers) { const k = (t - s.t0) / s.d; glow(c, s.x, s.y, 3.2, s.col, 0.75 * Math.sin(Math.PI * clamp(k)), rgba); }
      // a little rosy glow when an Eye is embarrassed
      for (const b of toys.blush) { const k = (t - b.t0) / b.d, al = 0.22 * Math.sin(Math.PI * clamp(k)), p = pos(b.a), sz = size(b.a); for (const sd of [-1, 1]) glow(c, p.x + sd * sz * 0.2, p.y + sz * 0.14, sz * 0.09, [255, 130, 150], al, rgba); }
      void W;
    }
    function drawBubble(c, x, y, r, al, t, ca, cb, rgba) {
      if (al <= 0.01) return;
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.05 * al})`); g.addColorStop(0.75, rgba(ca, 0.06 * al)); g.addColorStop(1, rgba(cb, 0.22 * al));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.lineWidth = 1.2;
      c.strokeStyle = rgba(ca.map((v) => mix(v, 255, 0.5)), 0.55 * al); c.beginPath(); c.arc(x, y, r, t * 0.8, t * 0.8 + Math.PI * 1.1); c.stroke();
      c.strokeStyle = rgba(comp(cb).map((v) => mix(v, 255, 0.4)), 0.45 * al); c.beginPath(); c.arc(x, y, r, t * 0.8 + Math.PI * 1.1, t * 0.8 + TAU); c.stroke();
      c.fillStyle = `rgba(255,255,255,${0.7 * al})`; c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.4, r * 0.18, r * 0.09, -0.7, 0, TAU); c.fill();
    }
    function drawObj(c, O, t, rgba, ca, cb) {
      const al = (O.fade ? clamp(1 - (t - O.fade) / 0.6) : 1) * easeOut(O.form);
      if (al <= 0.01) return;
      const sh = O.sh * Math.sin(t * 46) * 3, x = O.x + sh, y = O.y + Math.sin(t * 1.6) * 2 * (O.rt ? 0 : 1), r = O.r * (0.6 + 0.4 * easeOut(O.form));
      const tint = comp(mix3(ca, cb)), halo = 0.25 + 0.35 * O.glow + 0.1 * Math.sin(t * 3.2);
      if (O.st !== 'gone') glow(c, x, y, r * (3 + 1.5 * O.glow), tint, halo * al, rgba);
      if (O.kind === 'egg' && O.st !== 'gone') {
        const cracked = O.st === 'hatch' || O.st === 'shell', open = O.rt ? clamp((t - O.rt) / 0.6) : 0;
        const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.3);
        g.addColorStop(0, rgba([255, 250, 236], 0.95 * al)); g.addColorStop(1, rgba(tint, 0.35 * al)); c.fillStyle = g;
        if (!cracked) { c.beginPath(); c.ellipse(x, y, r * 0.82, r * 1.06, 0, 0, TAU); c.fill(); }
        else for (const sd of [-1, 1]) { c.save(); c.translate(x + sd * open * r * 0.7, y + open * r * 0.5); c.rotate(sd * open * 0.8); c.beginPath(); c.ellipse(0, 0, r * 0.82, r * 1.06, 0, sd < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, sd < 0 ? Math.PI * 1.5 : Math.PI * 0.5); c.fill(); c.restore(); }
        if (!cracked && O.glow > 0.4) { c.strokeStyle = rgba(tint, 0.6 * O.glow * al); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - r * 0.5, y - r * 0.1); c.lineTo(x - r * 0.15, y + r * 0.12); c.lineTo(x + r * 0.15, y - r * 0.12); c.lineTo(x + r * 0.5, y + r * 0.08); c.stroke(); }
      } else if (O.kind === 'orb' && O.st !== 'gone') {
        const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); g.addColorStop(0, rgba([255, 255, 255], 0.95 * al)); g.addColorStop(0.5, rgba(tint.map((v) => mix(v, 255, 0.4)), 0.85 * al)); g.addColorStop(1, rgba(tint, 0.2 * al));
        c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
        c.strokeStyle = rgba(tint, 0.5 * al); c.lineWidth = 1; c.beginPath(); c.arc(x, y, r * (1.25 + 0.15 * Math.sin(t * 5)), 0, TAU); c.stroke();
      } else if (O.kind === 'critter' && O.st !== 'gone') {
        const run = O.st === 'scurry', bob = run ? Math.abs(Math.sin(t * 22)) * 2 : 0;
        c.fillStyle = rgba(tint.map((v) => mix(v, 255, 0.35)), 0.95 * al);
        c.beginPath(); c.ellipse(x, y - bob, r * 0.9, r * 0.7, 0, 0, TAU); c.fill();
        c.strokeStyle = rgba(tint, 0.7 * al); c.lineWidth = 1.4;
        for (let j = 0; j < 4; j++) { const lx = x + (j - 1.5) * r * 0.42, ph = run ? Math.sin(t * 28 + j * 1.7) * r * 0.3 : 0; c.beginPath(); c.moveTo(lx, y + r * 0.45 - bob); c.lineTo(lx + ph, y + r * 0.95); c.stroke(); }
        const look = O.st === 'scurry' && O.path ? Math.sign(uX(O.path[O.path.length - 1].u) - x) : 0;
        c.fillStyle = `rgba(10,16,20,${0.9 * al})`; for (const sd of [-1, 1]) { c.beginPath(); c.arc(x + sd * r * 0.3 + look * r * 0.18, y - r * 0.12 - bob, r * 0.13, 0, TAU); c.fill(); }
      } else if (O.kind === 'crystal' && O.st !== 'gone') {
        c.fillStyle = rgba(tint.map((v) => mix(v, 255, 0.45)), 0.85 * al); c.strokeStyle = rgba([255, 255, 255], 0.7 * al); c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, y - r * 1.3); c.lineTo(x + r * 0.75, y - r * 0.2); c.lineTo(x + r * 0.4, y + r * 1.0); c.lineTo(x - r * 0.4, y + r * 1.0); c.lineTo(x - r * 0.75, y - r * 0.2); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(x, y - r * 1.3); c.lineTo(x, y + r * 1.0); c.moveTo(x - r * 0.75, y - r * 0.2); c.lineTo(x + r * 0.75, y - r * 0.2); c.stroke();
      } else if (O.kind === 'magnet' && O.st !== 'gone') {
        const pull = O.st === 'pull';
        c.strokeStyle = rgba(tint.map((v) => mix(v, 255, 0.4)), 0.9 * al); c.lineWidth = r * 0.42;
        c.beginPath(); c.arc(x, y, r * 0.75, 0, TAU); c.stroke();
        c.lineWidth = 1;
        for (let j = 0; j < 3; j++) { const k = ((t * (pull ? 1.6 : 0.7) + j / 3) % 1); c.strokeStyle = rgba(tint, 0.4 * (1 - k) * al); c.beginPath(); c.arc(x, y, r * (1 + (pull ? 1 - k : k) * 2.6), 0, TAU); c.stroke(); }
      }
    }
    const mix3 = (a, b) => [0, 1, 2].map((i) => (a[i] + b[i]) / 2);
    function glow(c, x, y, r, col, a, rgba) {
      if (a <= 0.003 || r <= 0) return;
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }

    return { attach, attachInvite, dropInvite, detach, refresh, start, end, theirToss, remoteTap, farewell, peerAway, wokeUp,
      cued, theirPush, theirPops, theirObj, theirRes,
      _play: () => ({ act: act && { i: act.i, kind: act.kind, key: actK, cue: act.cue || '', p: act.p }, revealed: !!ast.revealed, result: ast.result || null, rope: toys.rope && { P: toys.rope.P, on: toys.rope.on },
        bub: ast.bub ? ast.bub.map((b) => ({ k: b.k, st: b.st, x: b.px, y: b.py, r: b.r })) : [], kids: toys.kids.length, obj: toys.obj && { kind: toys.obj.kind, st: toys.obj.st, x: toys.obj.x, y: toys.obj.y },
        counts: { sparks: sparks.length, flies: flies.length, conf: toys.conf.length, cheers: toys.cheers.length, rings: rings.length, motes: motes.length, zaps: toys.zaps.length },
        me: A.me && { x: A.me.n.mx, y: A.me.n.my, s: A.me.s, boost: A.me.boost, move: A.me.move && A.me.move.name }, them: A.them && { x: A.them.n.mx, y: A.them.n.my, move: A.them.move && A.them.move.name } }),
      _touch: (x, y) => touchPlay({ x, y }, { pointerId: 99 }), _release: () => { hold = null; },
      _state: () => ({ act, ball: ball && { st: ball.st, holder: ball.holder && ball.holder.key, n: ast.n, owner: ast.owner }, flies: flies.length, seamY, me: A.me && { x: A.me.x, y: A.me.y, q: A.me.q, r: A.me.r, move: A.me.move && A.me.move.name }, them: A.them && { move: A.them.move && A.them.move.name, clip: A.them.n.el.style.clipPath } }),
      _flick: (vx, vy) => { if (ball && ball.holder === A.me && ball.st === 'held') { ball.st = 'drag'; const ok = throwBall(nowS(), 0.8, true, vx, vy); if (!ok) ball.st = 'held'; return ok; } return false; },
      _tap: (who) => tease(who === 'me' ? A.me : A.them, false) };
  })();

  // ======================================================================================
  // the invitation card (when you're not already in their Meeting Space)
  // ======================================================================================
  const Card = (() => {
    let el = null, eye = null, loop = 0, tick = 0;
    function show(c) {
      hide();
      const f = c.f, nm = friendName(f);
      let dna = null; try { dna = f.profile && D() ? D().friendDNA(f.profile) : null; } catch (e) {}
      el = document.createElement('div');
      el.id = 'eyesHangoutCall'; el.className = 'ehc'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `${nm}'s Eye wants to hang out`);
      el.innerHTML = `<div class="ehc-card"><canvas class="ehc-eye" aria-hidden="true"></canvas>
        <div class="ehc-txt"><p class="ehc-k">HANGOUT</p><p class="ehc-l"><b></b>'s Eye wants to come over and hang out with <span></span>.</p></div>
        <div class="ehc-row"><button type="button" class="ehc-no">Not now</button><button type="button" class="ehc-yes">Hang out</button></div>
        <i class="ehc-time" aria-hidden="true"></i></div>`;
      el.querySelector('.ehc-l b').textContent = nm; el.querySelector('.ehc-l span').textContent = myName();
      document.body.appendChild(el);
      el.querySelector('.ehc-no').onclick = decline;
      el.querySelector('.ehc-yes').onclick = acceptInvite;
      const bar = el.querySelector('.ehc-time');
      tick = setInterval(() => { if (el) bar.style.transform = `scaleX(${clamp((c.until - Date.now()) / ASK_MS).toFixed(3)})`; }, 250);
      const cv = el.querySelector('canvas');
      if (dna && root.HavenEye) {
        try { const col = D().mapColor(111, 193, 202, dna); el.style.setProperty('--c', col.map((x) => x | 0).join(',')); } catch (e) {}
        const px = Math.round(56 * Math.min(2, devicePixelRatio || 1)); cv.width = cv.height = px;
        eye = new HavenEye(dna, cv); eye.setTarget(-0.55, 0.2); eye.reactUntil = nowS() + 999; eye.pupilGoal = 1.15;
        const m = motionMode();
        let hopT = nowS() + 1.5;
        const step = () => {
          loop = 0; if (!el || !eye) return; const t = nowS();
          if (Math.random() < 0.01) eye.setTarget(-0.55 + (Math.random() - 0.5) * 0.3, 0.2 + (Math.random() - 0.5) * 0.2);
          // it bobs at your screen's edge now and then, hopeful
          if (m === 'on' && t > hopT) { hopT = t + rnd(2.5, 4.5); cv.classList.remove('ehc-hop'); void cv.offsetWidth; cv.classList.add('ehc-hop'); }
          eye.step(t, 1 / 30); eye.draw(t);
          if (m !== 'off') loop = setTimeout(step, m === 'gentle' ? 50 : 33);
        };
        step();
      } else cv.hidden = true;
    }
    function hide() { clearInterval(tick); clearTimeout(loop); loop = 0; eye = null; if (el) { el.remove(); el = null; } }
    return { show, hide, isOpen: () => !!el };
  })();

  // ======================================================================================
  // the Meeting Space button
  // ======================================================================================
  function slot(box, b, ctx) {
    if (!box) return;
    box.innerHTML = '';
    if (!b || !F()) return;
    const sayIt = (ctx && ctx.say) || flash;
    const up = b.native && F().nativeUpgrade ? F().nativeUpgrade() : null;
    const f = b.native ? up : b.f;
    let why = '';
    if (b.native && !(up && up.peer && F().supportsDirect(up, 'hangout'))) why = 'Hangout needs both Eyes on EYES 4.5 (Android) or 2.5 (iPhone), open at the same time once so your first Eye Contact can upgrade. Your link stays exactly as it is.';
    else if (!f || !f.peer) why = 'Their Eye has to arrive first.';
    else if (!F().hangoutVia(f)) why = `${friendName(f)}'s EYES needs the Hangout update (Android 4.5 or iPhone 2.5) to hang out. Pulse, Spark, Calm and Battle still work.`;
    else if (!f.profile && !(b.native && b.profile)) why = 'Their Eye is still introducing itself.';
    else if (motionMode() === 'off') why = 'Hangout needs motion. Choose On or Gentle in The Optic → Motion.';
    if (f && b.native && !f.profile && b.profile) f.profile = b.profile;
    // 4.5.1: say once that this is new, and show when their Eye is awake right now (the best moment to ask)
    let fresh = false, awake = false;
    if (!why) {
      try { fresh = !localStorage.getItem('eyes.hangout.hint.v1'); } catch (e) {}
      try { const pr = F().presence && F().presence(F().hangoutVia(f) || f); awake = !!(pr && (pr.tier === 'online' || pr === 'online')); } catch (e) {}
    }
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ec-hangout' + (why ? ' ec-hangout-off' : '') + (fresh ? ' ec-hangout-new' : '') + (awake ? ' ec-hangout-awake' : '');
    btn.innerHTML = `<i class="ec-hangout-g" aria-hidden="true"><i></i></i><span>Hang out</span>${awake ? '<small>awake now</small>' : fresh ? '<small>new</small>' : ''}`;
    btn.setAttribute('aria-label', why ? `Hang out (not available): ${why}` : `Hang out: invite ${friendName(f)}'s Eye over${awake ? '. Their Eye is awake now' : ''}`);
    btn.onclick = () => {
      if (why) { sayIt(why); return; }
      if (S) { sayIt('One Hangout at a time.'); return; }
      if (busyElsewhere()) { sayIt('Finish the duel first.'); return; }
      invite(f);
    };
    box.appendChild(btn);
    if (fresh && !slot.told) { slot.told = true; setTimeout(() => { if (btn.isConnected && !S) sayIt(`New: your Eyes can hang out. Tap Hang out to invite ${friendName(f)}'s Eye over for as long as you both like.`, true); }, 900); }
  }

  // ======================================================================================
  // boot
  // ======================================================================================
  function boot() {
    const Fr = F(); if (!Fr || !Fr.on) return;
    Fr.on('hangout', onHangout);
    // a friend still on Mirror (EYES 4.4 / 2.4) asked: answer at once so their phone doesn't wait, and say why here
    Fr.on('mirror', (f, m) => {
      if (!m || m.o !== 'ask' || !ID_RE.test(String(m.id || '')) || oldAsks.has(m.id)) return;
      oldAsks.add(m.id);
      try { if (F().mirror) F().mirror(f, { o: 'no', id: m.id, why: 'busy' }); } catch (e) {}
      say(`${friendName(f)}'s Eye asked to Mirror from an older EYES. Mirror is now Hangout; once ${friendName(f)} updates, your Eyes can hang out.`);
    });
    Fr.on('removed', (f) => { if (card && card.f && card.f.code === f.code) hideInvite(); if (S && S.code === f.code) over('lost'); });
    if (root.Haven && Haven.back) { const orig = Haven.back.bind(Haven); Haven.back = () => { if (Card.isOpen()) { decline(); return true; } return orig(); }; }
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && Card.isOpen()) { e.stopImmediatePropagation(); decline(); } }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  root.EyesHangout = {
    slot, invite, PLAN, canHang,
    busy: () => !!S || !!card,
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    _debug: { session: () => S, card: () => card, accept: acceptInvite, decline, stop, goodbye: sayGoodbye, state: () => Ctl._state(), flick: (vx, vy) => Ctl._flick(vx, vy), tap: (w) => Ctl._tap(w), elapsed,
      timing: (o) => Object.assign(TM, o || {}),
      play: () => Ctl._play(), touch: (x, y) => Ctl._touch(x, y), release: () => Ctl._release(), nudge: (k) => nudge(k), cueBlock: () => cueBlock(),
      skipTo: (sec) => { if (S && S.t0ms) S.t0ms = Date.now() - sec * 1000; } }
  };
})(window);
