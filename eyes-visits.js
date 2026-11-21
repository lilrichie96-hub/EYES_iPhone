/* EYES 4.4 · Distant Visits. Shared by Android and iPhone. Loads after eyes-friends.js and launcher.js.

   A friend's signal that arrived while this Eye wasn't listening (eyes-friends.js 'waiting') is not shown as an
   old notification. When the owner comes back and isn't busy with anything, their Eye notices a small light in
   the friend's corner, the friend's real Eye (their DNA, the same renderer) emerges from it, the two acknowledge
   each other, and the visitor goes back into its light. Then the home screen is exactly as it was.

   Rules
   - Waits for a quiet home screen: Haven.livingHost().quiet() (no panel, folder, ring, drag, finger, notification
     card, call/alarm, music controls, Eye Contact, duel, game, sleep or more important reaction). It looks for a
     quiet moment for 60 s after each return; otherwise it waits for the next return. Nothing is ever forced.
   - Anything real that happens during a visit wins: the home Eye's body goes to whatever happened (the reaction
     director's priorities) and the visitor slips away early. A touch anywhere does the same.
   - One visit per friend however many signals they sent (they're folded together and make the visit a little
     fuller), at most 3 friends per return, 1.4 s apart. A signal older than 12 h (ntfy's own limit) no longer
     visits; it stays listed under "while you were away" in their Meeting Space.
   - Honest: the sender's 'later' ack (Friends.felt) is sent only when the two Eyes actually acknowledged each
     other on this screen, or when the owner opened that friend's Meeting Space (which replays them). A visit
     that was cut short before that stays waiting, once.
   - No pressure: no badge, no reminder, no reply button, no streak. A short caption names who came by.
   - Motion: Gentle keeps it, slower and smaller. Off shows the visitor still in its corner for a few seconds.
   - Kept in eyes.visits.v1 (inside the encrypted Eye Passport like every eyes.* key). Each friendship's history
     gains stats.visits and firsts.visit (in eyes.friends.v1). */
'use strict';
(function (root) {
  const KEY = 'eyes.visits.v1', EXPIRE_MS = 12 * 3600000, MAX_PER_RETURN = 3, LOOK_MS = 60000, GAP_MS = 1400, MAX_TRIES = 2;
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const F = () => root.EyesFriends;
  // the friend's side, up and to the left (a little lower than the signal cameo, clear of the clock and date)
  const FRIEND = (() => { const x = -0.62, y = -0.78, l = Math.hypot(x, y); return { x: x / l, y: y / l }; })();
  const KINDS = ['pulse', 'spark', 'calm'];
  const KIND_RGB = { pulse: null, spark: [255, 206, 128], calm: [150, 196, 255] };
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashStr(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const NEUTRAL_T = { curiosity: 0.5, shyness: 0.5, energy: 0.5, grump: 0.3, drama: 0.4 };

  // ======================================================================================
  // the plan: a pure function, so every visit differs for reasons (temperaments, kind, count, time, familiarity)
  // ======================================================================================
  // host: the receiving Eye's temperament · guest: the visitor's · w: { pulse, spark, calm } counts
  function plan({ host, guest, w, seed, night = false, familiar = 0 }) {
    const H = { ...NEUTRAL_T, ...(host || {}) }, V = { ...NEUTRAL_T, ...(guest || {}) }, r = mulberry(seed >>> 0);
    const total = KINDS.reduce((a, k) => a + (w[k] || 0), 0) || 1;
    // the visit's character: the most-sent kind; ties go to the warmer (spark > pulse > calm)
    const kind = ['spark', 'pulse', 'calm'].reduce((a, k) => ((w[k] || 0) > (w[a] || 0) ? k : a), 'spark') || 'pulse';
    const many = clamp((total - 1) / 4);                         // 0 for one signal, 1 for five or more
    const smug = (1 - H.shyness) * H.grump, sleepy = clamp((0.45 - H.energy) * 2.2), hyper = clamp((H.energy - 0.6) * 2.5);
    const vShy = V.shyness, vHyper = clamp((V.energy - 0.6) * 2.5), vSleepy = clamp((0.45 - V.energy) * 2.2);
    const base = { pulse: 6200, spark: 5400, calm: 8000 }[kind];
    const dur = Math.round(base * (1 + 0.16 * sleepy + 0.1 * vSleepy - 0.08 * vHyper) * (night ? 1.1 : 1) * (1 + 0.12 * many) * mix(0.94, 1.06, r()));
    // phases (u = 0..1): sense the light · the visitor emerges · they acknowledge each other · it goes
    const ph = { pulse: [0.16, 0.34, 0.72], spark: [0.12, 0.28, 0.7], calm: [0.18, 0.4, 0.74] }[kind].slice();
    // a familiar visitor is recognised sooner; a sleepy Eye takes longer to notice anything
    const notice = clamp(0.04 + 0.05 * sleepy - 0.025 * familiar + 0.02 * r(), 0.02, 0.1);
    ph[0] = clamp(ph[0] + 0.03 * sleepy - 0.03 * familiar, 0.08, 0.24);
    const ack = ph[1] + 0.1;                                      // the moment both Eyes have acknowledged each other
    // where it looks (eye units): the light far out, the visitor closer in
    const Gf = { x: FRIEND.x * 0.98, y: FRIEND.y * 0.86 }, G = { x: FRIEND.x * 0.86, y: FRIEND.y * 0.7 };
    const jit = () => (r() - 0.5) * 0.12;
    const gaze = [[notice, { x: Gf.x * 0.7, y: Gf.y * 0.7 }]];
    const lids = [[0, {}], [notice, { up: -0.06 - 0.04 * H.curiosity, pupil: 0.06 + 0.1 * H.curiosity }]];
    const body = [[0, {}], [notice + 0.04, { x: -2 * H.curiosity, y: -1.6 * H.curiosity, focus: 0.06 }]];
    const blinks = [];
    // sense: a shy Eye looks, looks away, then looks again; a curious one just stares at the light
    if (H.shyness > 0.55 && r() < 0.35 + H.shyness * 0.6 && familiar < 0.8) {
      gaze.push([ph[0] - 0.035, { x: 0.18 + jit(), y: 0.42 }], [ph[0] + 0.05, { x: Gf.x * 0.85, y: Gf.y * 0.8 }]);
      lids.push([ph[0] - 0.03, { up: 0.16, low: 0.04 }]);
      body.push([ph[0] - 0.03, { tilt: -0.035, x: 1.4 }]);
    } else gaze.push([ph[0], { x: Gf.x, y: Gf.y }]);
    gaze.push([ph[1], { x: G.x, y: G.y }]);
    lids.push([ph[0] + 0.06, { up: -0.1 - 0.05 * H.drama, pupil: 0.12 + 0.14 * H.curiosity + 0.08 * H.drama }]);
    body.push([ph[1], { x: -2.6 * H.curiosity - 0.6, y: -2.2 * H.curiosity, focus: 0.1, glow: 0.06, tilt: -0.025 * H.drama }]);
    // acknowledge: what each kind is, in this particular Eye's way
    const g0 = ph[1], g1 = ph[2], gl = g1 - g0;
    if (kind === 'pulse') {
      const beats = 1 + Math.round(many * 2);
      for (let i = 0; i < beats; i++) {
        const at = g0 + gl * (0.15 + i * 0.22);
        body.push([at - 0.02, { x: -2, y: -1.5, sx: 0, sy: 0, glow: 0.06, focus: 0.1 }], [at, { x: -2, y: -1.5, sx: 0.05, sy: 0.045, glow: 0.22, focus: 0.14 }], [at + 0.04, { x: -2, y: -1.5, glow: 0.08, focus: 0.1 }]);
      }
      blinks.push([g0 + gl * (0.12 + 0.12 * r()), true]);           // the mutual slow blink: "I see you"
      lids.push([g0 + gl * 0.5, { up: 0.04 + 0.12 * sleepy - 0.05 * H.energy, pupil: 0.2 + 0.1 * H.drama }]);
    } else if (kind === 'spark') {
      const hops = Math.round(1 + 2 * clamp(H.energy * 0.8 + H.drama * 0.4) + many);
      for (let i = 0; i < hops; i++) {
        const at = g0 + gl * (0.12 + i * (0.6 / Math.max(1, hops)));
        const k = (0.45 + 0.7 * H.energy + 0.3 * hyper) * (1 - 0.5 * sleepy);
        body.push([at, { x: -1.5, y: -1, focus: 0.12 }], [at + 0.03, { x: -1.5, y: -7 * k, sy: 0.05 * k, sx: -0.02 * k, glow: 0.2, focus: 0.14 }], [at + 0.07, { x: -1.5, y: 0, sy: -0.02 * k, sx: 0.02 * k, glow: 0.1 }]);
      }
      // playful glances: at the visitor, at its sparks, back again
      gaze.push([g0 + gl * 0.3, { x: G.x + 0.16 + jit(), y: G.y + 0.12 }], [g0 + gl * 0.48, { x: G.x, y: G.y }]);
      if (H.curiosity > 0.5) gaze.push([g0 + gl * 0.66, { x: G.x * 0.6 + jit(), y: G.y * 0.5 + 0.1 }], [g0 + gl * 0.82, { x: G.x, y: G.y }]);
      lids.push([g0 + gl * 0.2, { up: -0.14 - 0.08 * H.drama, low: 0.25 + 0.15 * H.energy, pupil: 0.26 + 0.18 * H.drama }]);
      if (H.drama > 0.55 || r() < 0.3) blinks.push([g0 + gl * 0.08, false], [g0 + gl * 0.15, false]);
      else blinks.push([g0 + gl * 0.1, false]);
    } else {
      // calm: slower, comforting: settles lower, lids soften, a long slow blink together
      lids.push([g0 + gl * 0.3, { up: 0.16 + 0.1 * sleepy, low: 0.1, pupil: 0.1 }], [g0 + gl * 0.8, { up: 0.24 + 0.12 * sleepy, low: 0.12, pupil: 0.08 }]);
      body.push([g0 + gl * 0.4, { y: 3.2, sx: 0.03, sy: -0.03, glow: 0.12, focus: 0.04 }], [g0 + gl * 0.85, { y: 3.6, sx: 0.035, sy: -0.035, glow: 0.1 }]);
      blinks.push([g0 + gl * (0.25 + 0.1 * r()), true]);
      if (sleepy > 0.3 || r() < 0.4) blinks.push([g0 + gl * 0.75, true]);
    }
    // temperament on top: never a fixed script
    if (smug > 0.32) {                                            // holds the gaze, a slow knowing blink, a tilt
      body.push([g0 + gl * 0.55, { x: -2, tilt: 0.05 + 0.03 * smug, glow: 0.08 }]);
      if (!blinks.some((b) => b[1])) blinks.push([g0 + gl * 0.55, true]);
    }
    if (H.grump > 0.6) {                                          // a squint first, that softens (most with calm)
      lids.unshift([g0 - 0.02, { up: 0.1, low: 0.06 }]);
      lids.push([g0 + 0.02, { up: 0.24, low: 0.18, pupil: -0.06 }], [g0 + gl * (kind === 'calm' ? 0.45 : 0.7), { up: 0.08, low: 0.05, pupil: 0.06 }]);
    }
    if (H.shyness > 0.62 && kind !== 'calm') {                    // caught looking: a quick glance down mid-greeting
      const at = g0 + gl * (0.35 + 0.2 * r());
      gaze.push([at, { x: 0.12 + jit(), y: 0.38 }], [at + 0.07, { x: G.x, y: G.y }]);
    }
    // it goes: watch it back into its light, then come home to you
    gaze.push([g1, { x: G.x, y: G.y }], [g1 + (1 - g1) * 0.45, { x: Gf.x * 0.92, y: Gf.y * 0.88 }], [g1 + (1 - g1) * 0.8, { x: jit() * 0.5, y: 0.04 }], [1, { x: 0, y: 0 }]);
    lids.push([g1 + (1 - g1) * 0.5, { up: kind === 'calm' ? 0.12 : 0.02, pupil: 0.06 }], [1, {}]);
    body.push([g1 + (1 - g1) * 0.3, { x: -1.4, y: -1, focus: 0.05, glow: 0.04 }], [1, {}]);
    if (r() < 0.4 + 0.4 * H.content) blinks.push([g1 + (1 - g1) * 0.82, false]);
    const sort = (a) => a.sort((x, y) => x[0] - y[0]);
    // the visitor: what it does, in its own way
    const guestPlan = {
      stop: 1.95 + 0.3 * vShy + 0.08 * r(),                       // how close it dares to come (in eye radii from the centre)
      overshoot: vHyper * 0.22 + (kind === 'spark' ? 0.08 : 0),
      search: vShy > 0.6 ? 0.25 : 0.55 + 0.3 * V.curiosity,       // how much it looks around before it finds your Eye
      lookBack: vShy < 0.6 && r() < 0.75,                         // one last glance before it goes
      slow: vSleepy,
      squint: (1 - V.shyness) * V.grump > 0.35 ? 0.35 : 0,
      dilate: 0.1 + 0.25 * V.curiosity + 0.15 * V.drama
    };
    return { kind, dur, ph, notice, ack, many, total, w: { ...w }, guest: guestPlan, script: { gaze: sort(gaze), lids: sort(lids), body: sort(body), blinks: sort(blinks) } };
  }

  // ======================================================================================
  // the queue
  // ======================================================================================
  const store = (() => {
    let s = null; try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!s || s.v !== 1 || typeof s.q !== 'object' || !s.q) s = { v: 1, q: {} };
    return s;
  })();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  function add(f, w) {
    if (!f || f.companion || !f.code || !w || !KINDS.includes(w.k)) return;
    const t = Number(w.t) || Date.now();
    if (Date.now() - t > EXPIRE_MS) return;
    const e = store.q[f.code] || (store.q[f.code] = { k: {}, first: t, last: t, n: [], tries: 0 });
    if (w.n && e.n.includes(w.n)) return;                         // the same signal twice is still one
    e.k[w.k] = (e.k[w.k] || 0) + 1; e.first = Math.min(e.first, t); e.last = Math.max(e.last, t);
    if (w.n) { e.n.push(w.n); e.n = e.n.slice(-12); }
    persist();
    soon(2500);                                                   // a backlog arrives in a burst: gather it first
  }
  function prune() {
    const fr = F(); let changed = false;
    for (const code of Object.keys(store.q)) {
      const e = store.q[code], f = fr && fr.list().find((x) => x.code === code);
      if (!f || !e || Date.now() - (e.last || 0) > EXPIRE_MS || (e.tries || 0) >= MAX_TRIES) { delete store.q[code]; changed = true; }
    }
    if (changed) persist();
  }
  function consume(code, felt) {
    const e = store.q[code]; if (!e) return;
    delete store.q[code]; persist();
    const f = F() && F().list().find((x) => x.code === code);
    if (f && felt) {
      try { F().felt(f, e.n); } catch (err) {}
      f.stats = f.stats || {}; f.firsts = f.firsts || {};
      f.stats.visits = (f.stats.visits || 0) + 1; if (!f.firsts.visit) f.firsts.visit = Date.now();
      try { F().touch(); } catch (err) {}
    }
  }
  const pending = () => Object.keys(store.q).length;

  // ======================================================================================
  // when: a quiet moment after a return
  // ======================================================================================
  let host = null, returnAt = Date.now(), lookT = 0, run = null, shownThisReturn = 0, nextAt = 0;
  const getHost = () => { if (host) return host; try { host = root.Haven && Haven.livingHost ? Haven.livingHost() : null; } catch (e) { host = null; } return host; };
  function otherScene() {
    if (root.EyesContact && EyesContact.isOpen && EyesContact.isOpen()) return 'contact';
    if (root.EyesDuel && EyesDuel.isOpen && EyesDuel.isOpen()) return 'duel';
    if (root.EyesDuel && EyesDuel._debug && EyesDuel._debug.call && EyesDuel._debug.call()) return 'duel-call';
    if (root.EyesMirror && EyesMirror.busy && EyesMirror.busy()) return 'mirror';
    if (document.getElementById('eyesSheet')) return 'sheet';
    if (root.HavenDNA && !HavenDNA.has()) return 'unborn';
    return '';
  }
  function soon(ms) { clearTimeout(lookT); lookT = setTimeout(look, ms); }
  function look() {
    clearTimeout(lookT);
    if (run || document.visibilityState !== 'visible') return;
    prune();
    if (!pending()) return;
    if (shownThisReturn >= MAX_PER_RETURN) return;
    if (Date.now() - returnAt > LOOK_MS) return;                  // not this time: it waits for the next return
    if (Date.now() < nextAt) return soon(nextAt - Date.now() + 30);
    const h = getHost(); if (!h) return soon(1500);
    const why = h.quiet() || otherScene();
    if (why) return soon(why === 'hidden' ? 4000 : 1200);
    begin();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { returnAt = Date.now(); shownThisReturn = 0; soon(1900); }
    else { clearTimeout(lookT); if (run) stop(false); }
  });
  // a touch anywhere: the visitor slips away (the touch itself is never taken)
  addEventListener('pointerdown', () => { if (run && run.phase !== 'leaving') leave('touch'); }, true);

  // ======================================================================================
  // the visit
  // ======================================================================================
  function begin() {
    const h = getHost(), fr = F(); if (!h || !fr) return;
    // the most recent caller first
    const codes = Object.keys(store.q).sort((a, b) => store.q[b].last - store.q[a].last);
    let f = null, e = null;
    for (const c of codes) { const x = fr.list().find((y) => y.code === c); if (x && x.profile) { f = x; e = store.q[c]; break; } }
    if (!f) return;
    let dna = null; try { dna = root.HavenDNA.friendDNA(f.profile); } catch (err) {}
    if (!dna) { delete store.q[f.code]; persist(); return soon(400); }
    const own = root.HavenDNA && HavenDNA.dna && HavenDNA.dna();
    const core = h.core, t = h.now(), hour = new Date().getHours();
    const P = plan({ host: own && own.T, guest: dna.T, w: e.k, seed: hashStr(f.code + ':' + e.n.join('') + ':' + e.last), night: hour >= 21 || hour < 6, familiar: clamp(((f.stats && f.stats.visits) || 0) / 10) });
    e.tries = (e.tries || 0) + 1; persist();
    run = { f, code: f.code, dna, P, t0: t, lastT: e.last, phase: 'visiting', still: !core.motion, felt: false, eye: null, cv: null, last: 0, tag: null, own };
    shownThisReturn++;
    if (run.still) {                                              // Motion Off: no movement, just their Eye in its corner for a moment
      run.dur = 3800; h.draw();
      run.stillT = setTimeout(() => { if (run) { feltNow(); end(); h.draw(); } }, run.dur);
      caption();
      return;
    }
    const ok = core.react('visit', t, false, { x: FRIEND.x, y: FRIEND.y }, { script: P.script, duration: P.dur });
    if (!ok || !core.reaction || core.reaction.name !== 'visit') { run = null; shownThisReturn--; e.tries--; persist(); return soon(1500); }
    run.tag = core.reaction; run.dur = core.reaction.duration;   // Gentle stretches it; the visitor follows the same clock
    h.schedule();
  }
  function feltNow() { if (!run || run.felt) return; run.felt = true; consume(run.code, true); }
  function caption() {
    if (!run || !root.EyesSocial || !EyesSocial.caption) return;
    const f = run.f, nm = f.nick || (f.profile && f.profile.name) || 'Your friend';
    const mins = Math.max(0, Math.round((Date.now() - (run.lastT || Date.now())) / 60000));
    const when = mins < 2 ? 'just now' : mins < 60 ? mins + ' min ago' : Math.round(mins / 60) + ' h ago';
    EyesSocial.caption(`${nm}'s Eye came by · ${when}`, 3200);
  }
  // something real happened: the visitor slips away quickly, the home Eye is already elsewhere
  function leave(why) {
    if (!run || run.phase === 'leaving' || run.still) return;
    const h = getHost(), t = h ? h.now() : 0;
    run.phase = 'leaving'; run.leaveAt = t; run.leaveWhy = why;
    run.leaveFrom = state(t);
    if (h) h.schedule();
  }
  function stop(drawn) {
    if (!run) return;
    clearTimeout(run.stillT);
    // already acknowledged: it counts. Cut short before that: it stays waiting (once more at most)
    const e = store.q[run.code];
    if (e && !run.felt && (e.tries || 0) >= MAX_TRIES) { delete store.q[run.code]; persist(); }   // it tried twice: it lets go (still listed in their Meeting Space)
    run = null; nextAt = Date.now() + GAP_MS;
    if (drawn !== false) soon(GAP_MS);
  }
  function end() {
    const was = run; stop();
    if (was && was.felt && !was.still) setTimeout(() => { if (!run) captionFor(was); }, 200);
  }
  function captionFor(r) { const keep = run; run = r; caption(); run = keep; }

  // where everything is at time t (pure from the plan; used by paint)
  function state(t) {
    const r = run, P = r.P, u = clamp((t - r.t0) / r.dur), [s1, s2, s3] = P.ph, G = P.guest;
    const out = { u };
    // the light: appears far out, grows, waits behind the visitor, takes it back, then drifts off
    const far = 3.05, near = G.stop;
    if (u < s1) { out.light = ease(u / s1) * (0.65 + 0.35 * Math.sin(u * 40) * 0.2); out.dist = far; out.show = 0; }
    else if (u < s2) {
      const k = (u - s1) / (s2 - s1), e = easeOut(k), over = G.overshoot * Math.sin(Math.PI * clamp(k * 1.15)) * (1 - k);
      out.light = mix(1, 0.45, e); out.show = ease(k / 0.7); out.dist = mix(far, near, e) - over;
    } else if (u < s3) { out.light = 0.4; out.show = 1; out.dist = near; }
    else {
      const k = (u - s3) / (1 - s3);
      out.show = 1 - ease(k / 0.62); out.dist = mix(near, far + 0.15, ease(k / 0.7)); out.light = k < 0.6 ? mix(0.45, 0.9, ease(k / 0.6)) : 0.9 * (1 - ease((k - 0.6) / 0.4));
      out.drift = ease((k - 0.55) / 0.45);
    }
    if (r.phase === 'leaving' && r.leaveFrom) {
      const k = clamp((t - r.leaveAt) / 520);
      out.show = r.leaveFrom.show * (1 - ease(k)); out.light = r.leaveFrom.light * (1 - ease(k)); out.dist = mix(r.leaveFrom.dist, far + 0.2, ease(k)); out.done = k >= 1;
    }
    return out;
  }
  function stepGuest(e, s, u, nowS) {
    const r = run, P = r.P, G = P.guest, [s1, s2, s3] = P.ph;
    const toHost = { x: -FRIEND.x * 0.86, y: -FRIEND.y * 0.74 };
    e.auto = true; e.reactUntil = nowS + 0.3;
    if (u < s2 - 0.04 && !r.found) {
      // still looking for your Eye: a few glances around, more for a curious visitor
      if (!r.nextSearch || nowS > r.nextSearch) {
        const a = Math.random() * TAU, k = G.search;
        e.setTarget(Math.cos(a) * 0.7 * k + toHost.x * (1 - k), Math.sin(a) * 0.5 * k + toHost.y * (1 - k));
        r.nextSearch = nowS + mix(0.28, 0.55, Math.random()) * (1 + G.slow);
      }
    } else if (u < s3 + (1 - s3) * 0.2 || (G.lookBack && u < s3 + (1 - s3) * 0.42)) {
      if (!r.found) { r.found = true; e.pupilV += 1.6; e.pupilGoal = 1 + G.dilate; e.moodGoal.squint = G.squint; }
      e.setTarget(toHost.x, toHost.y);
    } else { e.setTarget(FRIEND.x * 0.6, FRIEND.y * 0.5); e.pupilGoal = 1; e.moodGoal.squint = 0; }
    // its side of the greeting
    const ack = s2 + (s3 - s2) * 0.12;
    if (!r.guestBlinked && u >= ack) { r.guestBlinked = true; e.blinkT = nowS + (P.kind === 'spark' ? 0 : 0.08); e.slowBlink = P.kind !== 'spark'; e.blinkQueue = P.kind === 'spark' && Math.random() < 0.5 ? 1 : 0; }
    if (P.kind === 'calm') e.closeK = u > s2 && u < s3 ? 0.28 + 0.2 * G.slow : 0;
    else e.closeK = G.slow * 0.25;
  }

  // ======================================================================================
  // painting (called from the launcher's draw, after the eye and before link light)
  // ======================================================================================
  const glow = (ctx, x, y, rad, rgb, a) => {
    if (a <= 0.004 || rad <= 0.5) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${rgb.join(',')},${clamp(a)})`); g.addColorStop(0.35, `rgba(${rgb.join(',')},${clamp(a * 0.45)})`); g.addColorStop(1, `rgba(${rgb.join(',')},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  };
  const lift = (rgb, k) => rgb.map((c) => Math.round(c + (255 - c) * k));
  function paint(ctx, { t, cx, cy, size }) {
    if (!run) return;
    const h = getHost(), r = run, P = r.P;
    const accent = lift(r.dna.accent || [160, 210, 220], 0.25), kindRgb = KIND_RGB[P.kind] || accent;
    const gentle = h && h.core.gentle, still = r.still;
    // preempted by something that matters more: let it go
    if (!still && r.phase !== 'leaving' && h && h.core.reaction !== r.tag) leave('preempted');
    const s = still ? { u: 0.5, light: 0.35, show: 0.85, dist: P.guest.stop + 0.1 } : state(t);
    if (!still && r.phase !== 'leaving' && s.u >= P.ack) feltNow();
    const nowS = performance.now() / 1000;
    const x = cx + FRIEND.x * size * s.dist + (s.drift ? -s.drift * size * 0.5 : 0), y = cy + FRIEND.y * size * s.dist + (s.drift ? -s.drift * size * 0.6 : 0);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    // the light it travels in
    const tw = still ? 1 : 0.82 + 0.18 * Math.sin(t / 170) * Math.sin(t / 61);
    const lx = cx + FRIEND.x * size * (s.show > 0.05 ? Math.max(s.dist, 2.65) : s.dist), ly = cy + FRIEND.y * size * (s.show > 0.05 ? Math.max(s.dist, 2.65) : s.dist);
    glow(ctx, lx, ly, size * (0.34 + 0.18 * s.light), accent, 0.42 * s.light * tw);
    glow(ctx, lx, ly, size * 0.07, [255, 250, 236], 0.85 * s.light * tw);
    ctx.restore();
    // the visitor itself: their real Eye, grown from their DNA, drawn by the same renderer
    if (s.show > 0.01 && root.HavenEye) {
      const fr = size * 0.62 * mix(0.35, 1, ease(s.show)), dw = (fr / 0.36);
      const dpr = Math.min(2, root.devicePixelRatio || 1), S = Math.max(16, Math.round(size * 0.62 / 0.36 * dpr));
      if (!r.cv) { r.cv = document.createElement('canvas'); r.cv.width = r.cv.height = S; r.eye = new HavenEye(r.dna, r.cv); r.eye.auto = true; r.eye.setTarget(FRIEND.x * 0.6, FRIEND.y * 0.5); }
      const e = r.eye, dt = clamp(nowS - (r.last || nowS), 0, 0.05) || 0.016; r.last = nowS;
      if (!still) stepGuest(e, s, s.u, nowS); else { e.setTarget(-FRIEND.x * 0.8, -FRIEND.y * 0.7); e.reactUntil = nowS + 1; }
      e.step(nowS, dt); e.draw(nowS);
      // its own body: a little hop for sparks, a heartbeat for pulses, a slow settle for calm
      let bob = 0, sc = 1;
      if (!still && s.u > P.ph[1] && s.u < P.ph[2] && r.phase !== 'leaving') {
        const k = (s.u - P.ph[1]) / (P.ph[2] - P.ph[1]);
        if (P.kind === 'spark') bob = -Math.abs(Math.sin(Math.PI * k * (2 + Math.round(P.many * 2)))) * size * 0.07 * (1 - k * 0.5) * (gentle ? 0.35 : 1);
        else if (P.kind === 'pulse') { const beat = Math.exp(-Math.pow((k - 0.2) / 0.05, 2)) + 0.8 * Math.exp(-Math.pow((k - 0.27) / 0.04, 2)); sc = 1 + 0.05 * beat * (gentle ? 0.5 : 1); }
        else bob = size * 0.02 * Math.sin(Math.PI * k);
      }
      ctx.save();
      ctx.globalAlpha = clamp(s.show * (still ? 0.9 : 1));
      ctx.beginPath(); ctx.arc(x, y + bob, dw * 0.47 * sc, 0, TAU); ctx.clip();
      ctx.drawImage(r.cv, x - (dw * sc) / 2, y + bob - (dw * sc) / 2, dw * sc, dw * sc);
      ctx.restore();
      // what passes between them
      if (!still && r.phase !== 'leaving') paintBetween(ctx, { t, x, y: y + bob, cx, cy, size, s, kindRgb, accent, gentle });
    }
    if (s.done || (!still && s.u >= 1)) { if (!run.felt && run.phase === 'leaving' && s.u >= P.ack) feltNow(); end(); if (h) h.schedule(); return; }
    if (h && !still) h.schedule();
  }
  function paintBetween(ctx, { t, x, y, cx, cy, size, s, kindRgb, accent, gentle }) {
    const P = run.P, [, s2, s3] = P.ph;
    if (s.u < s2 || s.u > s3 + 0.06) return;
    const k = clamp((s.u - s2) / (s3 - s2));
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const n = gentle ? 1 : 1;
    if (P.kind === 'spark') {
      const count = Math.round(4 + 4 * P.many) * n;
      for (let i = 0; i < count; i++) {
        const st = 0.08 + i * (0.55 / count), q = clamp((k - st) / 0.32);
        if (q <= 0 || q >= 1) continue;
        const bend = (i % 2 ? 1 : -1) * size * (0.25 + 0.1 * (i % 3)), mx = (x + cx) / 2 - FRIEND.y * bend, my = (y + cy) / 2 + FRIEND.x * bend;
        const qq = easeOut(q), px = (1 - qq) * (1 - qq) * x + 2 * (1 - qq) * qq * mx + qq * qq * (cx + FRIEND.x * size * 0.9), py = (1 - qq) * (1 - qq) * y + 2 * (1 - qq) * qq * my + qq * qq * (cy + FRIEND.y * size * 0.9);
        glow(ctx, px, py, size * 0.09, kindRgb, 0.85 * (1 - q) * (0.6 + 0.4 * Math.sin(t / 40 + i)));
      }
    } else if (P.kind === 'pulse') {
      const beats = 1 + Math.round(P.many * 2);
      for (let i = 0; i < beats; i++) {
        const q = clamp((k - (0.15 + i * 0.22) + 0.03) / 0.3);
        if (q <= 0 || q >= 1) continue;
        ctx.beginPath(); ctx.arc(x, y, size * (0.5 + 0.9 * easeOut(q)), 0, TAU); ctx.lineWidth = size * 0.05 * (1 - q); ctx.strokeStyle = `rgba(${accent.join(',')},${0.4 * (1 - q)})`; ctx.stroke();
        glow(ctx, cx, cy, size * 1.4, accent, 0.18 * Math.sin(Math.PI * q));
      }
    } else {
      const q = ease(k / 0.7), mx = mix(x, cx, q), my = mix(y, cy - size * 0.2, q);
      glow(ctx, mx, my, size * (0.9 + 0.8 * q), kindRgb, 0.22 * Math.sin(Math.PI * clamp(k / 0.95)));
    }
    ctx.restore();
  }

  // ======================================================================================
  // boot
  // ======================================================================================
  function boot() {
    const fr = F(); if (!fr || !fr.on) return;
    fr.on('waiting', (f, w) => add(f, w));
    fr.on('removed', (f) => { if (store.q[f.code]) { delete store.q[f.code]; persist(); } if (run && run.code === f.code) leave('removed'); });
    soon(3600);                                                   // a cold start is a return too (after the greeting)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  root.EyesVisits = {
    plan,
    active: () => !!run,
    paint,
    pending,
    // the Meeting Space replayed their signals: that's them seen too
    seen(f) { if (f && store.q[f.code]) { if (run && run.code === f.code) leave('seen'); consume(f.code, true); } },
    queue: () => JSON.parse(JSON.stringify(store.q)),
    _debug: { look, begin, run: () => run, store, add, prune, reset: () => { shownThisReturn = 0; returnAt = Date.now(); nextAt = 0; } }
  };
})(window);
