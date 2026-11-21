/* EYES 4.4 · Mirror: two friends' Eyes meet, study and imitate each other. Shared by Android and iPhone.
   Loads after eyes-friends.js, eyes-contact.js and eyes-duel.js.

   It is not a call, a game or a chat. It happens inside the Meeting Space, with the two real Eyes already there:
   one Eye invites, the other accepts, and for about twenty seconds they turn toward each other, follow each
   other's pupils, take turns at a small gesture the other tries to copy, and settle into one shared moment
   before they part. Temperament decides how: a shy Eye hesitates, a smug one holds the stare and may break the
   copy on purpose, a curious one is eager, a sleepy one is slow and struggles to keep up, a hyper one overdoes it.

   Both phones agree on what happens without either being "the server":
     PLAN(seed, a, b) is a pure function. seed = hash(inviter's half ‖ accepter's half). a and b are each Eye's
     temperament dials and first word, carried in the ask / yes messages, so both phones feed it the same inputs
     even if one has an older copy of the other's profile. Each phone draws both Eyes from the same plan.
   Protocol: EyesFriends.mirror(f, m), kind 'mirror', only for friends that advertised the 'mirror' capability.
     m.o = 'ask' {id, sd, tm, w, nm} · 'yes' {id, sd, tm, w} · 'no' {id, why} · 'cancel' {id} · 'beat' {id, i} · 'bye' {id, why}
   Honesty:
     - Nothing synchronized is shown before a real 'yes' (the inviter) / before the relay took our 'yes' (the
       accepter). Until then each Eye is just itself.
     - The plan has barriers. Each phone says 'beat i' when it starts act i (2..5). Act i+1 waits for the other's
       beat i. The shared moment at the end (act 5) plays only after their beat 4, and "you mirrored each other" is
       only said, and kept in history, after their beat 5. Silence longer than 7 s ends it, said plainly.
   Traffic: ask (+ a re-send every 20 s while waiting) · yes · 4 beats each · bye. No streaming, no heartbeats.
   Nothing about a Mirror is kept except, once it really completed, stats.mirrors and firsts.mirror in that
   friendship's history (eyes.friends.v1, inside the encrypted Eye Passport). No scores, no streaks.
   Motion: Gentle is slower and smaller; Off can't animate two Eyes, so Mirror says so instead of pretending.
   Battery: in battery saver (or ≤ 15 % and not charging) the Meeting Space keeps its calm 30 fps. */
'use strict';
(function (root) {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const F = () => root.EyesFriends, D = () => root.HavenDNA, C = () => root.EyesContact;
  const nowS = () => performance.now() / 1000;
  const ID_RE = /^[A-Za-z0-9_-]{6,16}$/, SD_RE = /^[A-Za-z0-9_-]{6,16}$/;
  const ASK_MS = 60000, RESEND_MS = 20000, HOLD_MAX = 7, END_HOLD_MS = 1600;
  const rid = (n) => { const a = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (const x of a) s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[x & 63]; return s; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ======================================================================================
  // PLAN: pure, deterministic, shared by both phones
  // ======================================================================================
  const PLAN = (() => {
    const DIALS = ['curiosity', 'shyness', 'energy', 'grump', 'drama'];
    const WORDS = ['curious', 'shy', 'hyper', 'sleepy', 'grumpy', 'dramatic', 'calm', 'smug'];
    const NEUTRAL = { curiosity: 0.5, shyness: 0.5, energy: 0.5, grump: 0.3, drama: 0.4 };
    function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function seedOf(sa, sb) { let h = 0x811c9dc5; const s = 'MIRROR1·' + String(sa) + '·' + String(sb); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    // what travels on the wire: five dials at two decimals and a first word
    const pack = (T) => DIALS.map((k) => Math.round(clamp(Number(T && T[k]) || 0) * 100) / 100);
    function unpack(tm) {
      if (!Array.isArray(tm) || tm.length !== 5 || !tm.every((x) => Number.isFinite(Number(x)))) return { ...NEUTRAL };
      const T = {}; DIALS.forEach((k, i) => { T[k] = Math.round(clamp(Number(tm[i])) * 100) / 100; }); return T;
    }
    const word = (w) => (WORDS.includes(w) ? w : 'calm');
    // gestures, in the facing frame: gf = toward the other Eye (+) / away (−), gu = up (−) / down (+)
    const G = {
      up: { d: 1.3, keys: [[0, {}], [0.35, { gu: -0.8 }], [0.9, { gu: -0.8 }], [1.3, {}]] },
      down: { d: 1.4, keys: [[0, {}], [0.4, { gu: 0.72, sq: 0.18 }], [1.0, { gu: 0.72, sq: 0.18 }], [1.4, {}]] },
      away: { d: 1.35, keys: [[0, {}], [0.32, { gf: -1.7, gu: 0.1 }], [0.85, { gf: -1.7, gu: 0.1 }], [1.35, {}]] },
      roll: { d: 1.7, keys: (() => { const k = [[0, {}]]; for (let i = 1; i <= 10; i++) { const a = (i / 10) * TAU; k.push([0.1 + i * 0.14, { gf: 0.9 * Math.cos(a) - 0.9, gu: -0.75 * Math.sin(a) }]); } k.push([1.7, {}]); return k; })() },
      blink2: { d: 1.1, keys: [[0, {}], [0.15, { wd: 0.2 }], [0.8, { wd: 0.2 }], [1.1, {}]], blinks: [[0.25, 0], [0.5, 0]] },
      slowblink: { d: 1.6, keys: [[0, {}], [0.3, { sq: 0.18 }], [1.2, { sq: 0.18 }], [1.6, {}]], blinks: [[0.45, 1]] },
      squint: { d: 1.4, keys: [[0, {}], [0.3, { sq: 0.6, pu: -0.12 }], [1.0, { sq: 0.6, pu: -0.12 }], [1.4, {}]] },
      wide: { d: 1.4, keys: [[0, {}], [0.25, { wd: 0.65, pu: 0.4 }], [1.0, { wd: 0.65, pu: 0.4 }], [1.4, {}]] },
      tilt: { d: 1.5, keys: [[0, {}], [0.35, { rot: 0.13, gu: -0.1 }], [1.05, { rot: 0.13, gu: -0.1 }], [1.5, {}]] },
      bob: { d: 1.2, keys: [[0, {}], [0.16, { bob: -1 }], [0.32, { bob: 0.15 }], [0.48, { bob: -0.8 }], [0.66, { bob: 0.1 }], [0.85, {}], [1.2, {}]] }
    };
    const NAMES = Object.keys(G);
    function weights(T) {
      const smug = (1 - T.shyness) * T.grump, calm = (1 - Math.abs(T.energy - 0.5) * 2) * (1 - T.drama);
      return { up: 0.6 + T.curiosity, down: 0.35 + 1.2 * T.shyness, away: 0.35 + T.shyness, roll: 0.15 + T.energy + 0.6 * T.drama,
        blink2: 0.3 + T.drama, slowblink: 0.3 + 0.9 * (1 - T.energy) + 0.6 * smug, squint: 0.2 + 1.2 * T.grump,
        wide: 0.3 + 0.8 * T.curiosity + 0.6 * T.drama, tilt: 0.3 + smug + calm, bob: 0.15 + 1.2 * T.energy };
    }
    function pick(r, w, not) { const e = Object.entries(w).filter(([k]) => !not.includes(k)); let s = e.reduce((a, x) => a + x[1], 0), x = r() * s; for (const [k, v] of e) if ((x -= v) <= 0) return k; return e[0][0]; }
    // how an Eye copies, from its dials (never a lookup table)
    function copyStyle(T, w, r, refuseLeft) {
      const smug = (1 - T.shyness) * T.grump, sleepy = clamp((0.42 - T.energy) * 2.4), hyper = clamp((T.energy - 0.66) * 3);
      const lag = 0.22 + 0.5 * (1 - T.energy) + 0.22 * T.shyness + 0.35 * sleepy + 0.1 * r();
      let amp = clamp(0.55 + 0.32 * T.curiosity + 0.12 * (1 - T.grump) - 0.25 * sleepy + 0.08 * r(), 0.3, 1);
      const hesitate = T.shyness > 0.55 && r() < 0.15 + 0.6 * T.shyness;
      const refuse = refuseLeft > 0 && (smug > 0.3 || w === 'smug' || w === 'grumpy') && r() < 0.08 + 0.45 * smug;
      const over = hyper > 0 ? 1 + 0.45 * hyper : 1;
      if (hesitate) amp *= 0.72;
      const quality = refuse ? 0 : clamp(amp * (over > 1 ? 0.92 : 1) - (sleepy > 0.4 ? 0.15 : 0));
      return { lag, amp, hesitate, refuse, over, sleepy, eager: T.curiosity > 0.62 && !hesitate, quality };
    }
    // the whole encounter: acts with start times (s, before Gentle's stretch)
    function plan(seed, A, B, opts = {}) {
      const r = mulberry(seed >>> 0), Ta = { ...NEUTRAL, ...A.T }, Tb = { ...NEUTRAL, ...B.T }, wa = word(A.w), wb = word(B.w);
      const k = opts.gentle ? 1.3 : 1;
      const acts = [];
      let t = 0;
      const add = (name, d, x = {}) => { acts.push({ i: acts.length, name, start: t, dur: d * k, ...x }); t += d * k; };
      // who opens: the bolder Eye (less shy, more energy), with a little luck
      const bold = (T) => (1 - T.shyness) * 0.6 + T.energy * 0.3 + T.curiosity * 0.1;
      const first = bold(Ta) + (r() - 0.5) * 0.2 >= bold(Tb) ? 'a' : 'b';
      add('approach', 2.6 + 0.6 * Math.max(Ta.shyness, Tb.shyness));
      add('study', 3.4 + 0.8 * Math.max(Ta.curiosity, Tb.curiosity));
      let refuseLeft = { a: 1, b: 1 }, prev = [];
      const rounds = [];
      for (let i = 0; i < 3; i++) {
        const leader = i % 2 === 0 ? first : first === 'a' ? 'b' : 'a', follower = leader === 'a' ? 'b' : 'a';
        const TL = leader === 'a' ? Ta : Tb, TF = follower === 'a' ? Ta : Tb, wF = follower === 'a' ? wa : wb;
        const avoid = prev.slice(-2).concat(opts.gentle ? ['roll'] : []);
        const g = pick(r, weights(TL), avoid); prev.push(g);
        const cs = copyStyle(TF, wF, r, refuseLeft[follower]);
        if (cs.refuse) refuseLeft[follower]--;
        const d = G[g].d + cs.lag + (cs.hesitate ? 0.6 : 0) + 1.6;
        rounds.push({ leader, follower, g, ...cs });
        add('round', d, { round: i, leader, follower, g, copy: cs });
      }
      const slowest = Math.max(clamp((0.42 - Ta.energy) * 2.4), clamp((0.42 - Tb.energy) * 2.4));
      add('sync', 2.8 + 0.5 * slowest, { lagA: clamp((0.42 - Ta.energy) * 2.4) * 0.38, lagB: clamp((0.42 - Tb.energy) * 2.4) * 0.38 });
      add('part', 2.1);
      const score = rounds.reduce((s, x) => s + x.quality, 0) / rounds.length;
      return { seed, acts, total: t, first, rounds, score, wa, wb, Ta, Tb, gentle: !!opts.gentle };
    }
    // channel values of a gesture at local time τ (s)
    // keyframes: [[u, {ch: v}], …] eased between keys (the same rule as presence.js scripted reactions)
    function sample(keys, u) {
      if (u <= keys[0][0]) return keys[0][1];
      for (let i = 0; i < keys.length - 1; i++) {
        const [a0, av] = keys[i], [b0, bv] = keys[i + 1];
        if (u <= b0) { const k = ease((u - a0) / Math.max(0.0001, b0 - a0)), out = {}; for (const c of new Set([...Object.keys(av), ...Object.keys(bv)])) out[c] = mix(av[c] || 0, bv[c] || 0, k); return out; }
      }
      return keys[keys.length - 1][1];
    }
    function gesture(name, tau) { const g = G[name]; return g ? sample(g.keys, clamp(tau / g.d)) : {}; }
    // rescale gesture keys to 0..1 once
    for (const n of NAMES) G[n].keys = G[n].keys.map(([t, v]) => [t / G[n].d, v]);
    return { plan, seedOf, pack, unpack, word, gesture, G, NAMES, copyStyle, weights, VERSION: 1 };
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
  const canMirror = (f) => !!(f && f.peer && F() && F().CAPS.includes('mirror') && F().mirrorVia && F().mirrorVia(f));
  const keyOf = (f) => (C() && C().keyOf ? C().keyOf(f) : f && f.code);
  const send = (f, m) => (F() && F().mirror ? F().mirror(f, m) : Promise.resolve(false));
  const listeners = {};
  const emit = (n, ...a) => (listeners[n] || []).forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } });
  function historyOf(f) {                               // where this friendship's history lives
    if (!f || !F()) return null;
    if (f.companion && f.parent === 'native') return F().native();
    if (f.companion) return F().list().find((x) => x.code === f.parent) || null;
    return f;
  }

  // ======================================================================================
  // the session (one Mirror at a time)
  // ======================================================================================
  let S = null, card = null;
  const answered = new Set();
  let timers = [];
  const later = (fn, ms) => { const id = setTimeout(() => { timers = timers.filter((x) => x !== id); fn(); }, ms); timers.push(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  function newSession(f, role, id) {
    const d = myDna();
    return { f, code: f.code, key: keyOf(f), role, id, phase: role === 'a' ? 'asking' : 'answering', sdMine: rid(10), sdTheirs: null,
      tmMine: PLAN.pack(d && d.T), wMine: PLAN.word(d && d.firstWord), tmTheirs: null, wTheirs: 'calm', nm: friendName(f),
      plan: null, t0: 0, held: 0, holdAt: 0, act: -1, beatMine: -1, beatTheirs: -1, result: null, lastHeard: Date.now() };
  }
  function busyElsewhere() {
    if (root.EyesDuel && EyesDuel.isOpen && EyesDuel.isOpen()) return 'busy';
    if (root.EyesDuel && EyesDuel._debug && EyesDuel._debug.call && EyesDuel._debug.call()) return 'busy';
    return '';
  }

  // ---------- inviting (from the Meeting Space) ----------
  function invite(f) {
    if (!f || S || !canMirror(f)) return false;
    if (motionMode() === 'off') { say("Mirror needs motion. Choose On or Gentle in The Optic → Motion."); return false; }
    const c = C(); if (!c || c.focus() !== keyOf(f)) return false;
    S = newSession(f, 'a', rid(10));
    S.askedAt = Date.now();
    if (F().probe) F().probe(f);
    const ask = { o: 'ask', id: S.id, sd: S.sdMine, tm: S.tmMine, w: S.wMine, nm: myName().slice(0, 16), v: PLAN.VERSION };
    const s = S;
    Ctl.attach();
    say(`Asking ${S.nm}'s Eye…`, true);
    send(f, ask).then((ok) => {
      if (S !== s || S.phase !== 'asking') return;
      if (!ok) { over('failed'); return; }
      S.sent = true; Ctl.refresh();
      say(`${S.nm}'s Eye has a minute to answer.`, true);
      const again = () => later(() => { if (S === s && S.phase === 'asking') { send(S.f, ask); again(); } }, RESEND_MS);
      again();
      later(() => { if (S === s && S.phase === 'asking') { send(S.f, { o: 'cancel', id: S.id }); over('timeout'); } }, ASK_MS);
    });
    return true;
  }
  function cancelAsk() {
    if (!S || S.phase !== 'asking') return;
    send(S.f, { o: 'cancel', id: S.id });
    over('cancelled');
  }

  // ---------- incoming ----------
  function onMirror(f, m, t) {
    if (!m || typeof m.o !== 'string' || !ID_RE.test(String(m.id || ''))) return;
    const o = m.o, id = m.id;
    if (S && S.code === f.code && S.id === id) S.lastHeard = Date.now();
    if (o === 'ask') {
      if (!SD_RE.test(String(m.sd || ''))) return;
      if (Date.now() - t > ASK_MS) return;
      if (card && card.id === id) return;                    // the same invitation, re-sent
      if (answered.has(id)) return;
      if (S && S.id === id) return;
      if (S && S.code === f.code && S.phase === 'asking') {
        // both reached at once: the smaller id is the one Mirror, the other quietly becomes the answer
        if (id < S.id) { clearTimers(); const back = S; S = null; Ctl.detach(true); void back; S = newSession(f, 'b', id); return accept(m, true); }
        return;
      }
      const why = S ? 'busy' : busyElsewhere() || (motionMode() === 'off' ? 'still' : '');
      if (why) { send(f, { o: 'no', id, why }); if (why === 'still') flash(`${friendName(f)}'s Eye wanted to mirror yours. Mirror needs motion turned on.`); return; }
      showInvite(f, m, t);
      return;
    }
    if (o === 'cancel') {
      if (card && card.id === id) hideInvite(`${friendName(f)}'s Eye stopped waiting.`);
      if (S && S.id === id) { if (S.phase === 'answering') over('faded'); else if (S.phase === 'live' && S.role === 'b') over('faded'); }
      return;
    }
    if (!S || S.id !== id || S.code !== f.code) return;
    if (o === 'yes' && S.role === 'a' && S.phase === 'asking') {
      if (!SD_RE.test(String(m.sd || ''))) return;
      clearTimers();
      S.sdTheirs = m.sd; S.tmTheirs = m.tm; S.wTheirs = PLAN.word(m.w);
      go();
      return;
    }
    if (o === 'no' && S.phase === 'asking') { clearTimers(); over(m.why === 'busy' ? 'busy' : m.why === 'still' ? 'still' : 'declined'); return; }
    if (o === 'beat') { const i = Number(m.i) | 0; if (i >= 2 && i <= 5 && i > S.beatTheirs) { S.beatTheirs = i; } return; }
    if (o === 'bye' && ['live', 'answering', 'asking'].includes(S.phase)) { over('left'); return; }
  }

  // ---------- answering ----------
  function showInvite(f, m, t) {
    hideInvite();
    const left = Math.max(5000, ASK_MS - Math.max(0, Date.now() - t));
    card = { f, id: m.id, m, t, until: Date.now() + left, key: keyOf(f) };
    card.timer = setTimeout(() => { if (card && card.id === m.id) hideInvite(); }, left);
    const c = C();
    // already looking at each other in their Meeting Space: the invitation shows right there
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
    send(card.f, { o: 'no', id: card.id, why: 'no' });
    hideInvite();
  }
  function acceptInvite() {
    if (!card || S) return;
    const c0 = card; hideInvite();
    if (Date.now() > c0.until) { flash('That invitation already faded.'); return; }
    if (motionMode() === 'off') { send(c0.f, { o: 'no', id: c0.id, why: 'still' }); flash('Mirror needs motion. Choose On or Gentle in The Optic → Motion.'); return; }
    const c = C(); if (!c) return;
    if (!c.isOpen() || c.focus() !== c0.key) c.meet(c0.key);
    S = newSession(c0.f, 'b', c0.id);
    accept(c0.m, false);
  }
  function accept(m, crossed) {
    S.sdTheirs = m.sd; S.tmTheirs = m.tm; S.wTheirs = PLAN.word(m.w);
    const c = C();
    if (!c || c.focus() !== S.key) { if (c) c.meet(S.key); }
    Ctl.attach();
    say(crossed ? 'You both reached for a Mirror at once.' : `Answering ${S.nm}'s Eye…`, true);
    const s = S;
    send(S.f, { o: 'yes', id: S.id, sd: S.sdMine, tm: S.tmMine, w: S.wMine, v: PLAN.VERSION }).then((ok) => {
      if (S !== s || S.phase !== 'answering') return;
      if (!ok) { over('failed'); return; }
      go();
    });
  }

  // ---------- live ----------
  function go() {
    const a = S.role === 'a' ? { T: PLAN.unpack(S.tmMine), w: S.wMine } : { T: PLAN.unpack(S.tmTheirs), w: S.wTheirs };
    const b = S.role === 'a' ? { T: PLAN.unpack(S.tmTheirs), w: S.wTheirs } : { T: PLAN.unpack(S.tmMine), w: S.wMine };
    const seed = S.role === 'a' ? PLAN.seedOf(S.sdMine, S.sdTheirs) : PLAN.seedOf(S.sdTheirs, S.sdMine);
    S.gentle = motionMode() === 'gentle';
    // the plan's events never depend on Gentle (both phones must agree); only its pace does, per phone
    S.plan = PLAN.plan(seed, a, b, { gentle: false });
    S.k = S.gentle ? 1.3 : 1;
    S.phase = 'live'; S.t0 = nowS(); S.held = 0; S.act = -1; S.startedAt = Date.now();
    say('');
    Ctl.start();
  }
  // the session clock, paused while waiting at a barrier
  const clock = () => (S ? (nowS() - S.t0 - S.held - (S.holdAt ? nowS() - S.holdAt : 0)) / (S.k || 1) : 0);
  function actAt(tt) { const A = S.plan.acts; for (let i = A.length - 1; i >= 0; i--) if (tt >= A[i].start) return A[i]; return A[0]; }
  // called every frame while live: moves through acts, honours barriers, sends beats
  function tick() {
    if (!S || S.phase !== 'live') return null;
    let tt = clock();
    const acts = S.plan.acts;
    if (tt >= S.plan.total) { finish(); return null; }
    const a = actAt(tt);
    if (a.i !== S.act) {
      // a barrier: act i (3..5) needs their beat i-1
      const need = a.i >= 3 && a.i <= 5 ? a.i - 1 : -1;
      if (need >= 0 && S.beatTheirs < need) {
        if (!S.holdAt) { S.holdAt = nowS(); S.holdFor = a.i; }
        if (nowS() - S.holdAt > HOLD_MAX) { over(F().connection(S.f) === 'online' ? 'quiet' : 'lost'); return null; }
        return { act: acts[a.i - 1], u: 1, hold: true, tt: a.start - 0.0001 };
      }
      if (S.holdAt) { S.held += nowS() - S.holdAt; S.holdAt = 0; tt = clock(); }
      S.act = a.i;
      if (a.i >= 2 && a.i <= 5 && S.beatMine < a.i) { S.beatMine = a.i; send(S.f, { o: 'beat', id: S.id, i: a.i }); }
      Ctl.onAct(a);
    }
    return { act: a, u: clamp((tt - a.start) / a.dur), tau: tt - a.start, tt, hold: false };
  }
  function finish() {
    if (!S || S.phase !== 'live') return;
    // only now, and only if their Eye reached the shared moment too, is it a Mirror you both had
    if (S.beatTheirs >= 5) over('done');
    else over('unconfirmed');
  }
  function over(why) {
    if (!S || S.phase === 'over') return;
    clearTimers();
    const s = S, was = S.phase;
    S.phase = 'over'; S.result = why;
    if (why === 'done') {
      const h = historyOf(s.f);
      if (h) { h.stats = h.stats || {}; h.firsts = h.firsts || {}; h.stats.mirrors = (h.stats.mirrors || 0) + 1; if (!h.firsts.mirror) h.firsts.mirror = Date.now(); try { F().touch(); } catch (e) {} }
    }
    const nm = s.nm;
    const text = {
      done: `${myName()} and ${nm} mirrored each other.`,
      unconfirmed: `That was nearly it. ${nm}'s Eye drifted off before the very end.`,
      declined: `${nm}'s Eye would rather not right now. That's fine.`,
      busy: `${nm}'s Eye is busy with something else right now.`,
      still: `${nm} has Motion turned off, so their Eye can't mirror right now.`,
      timeout: `No answer. ${nm}'s Eye might be resting.`,
      cancelled: '',
      failed: "Your Eye's invitation couldn't leave this phone. Check your connection.",
      faded: 'That invitation had already faded.',
      left: `${nm}'s Eye had to go.`,
      quiet: `${nm}'s Eye went quiet, so the Mirror stopped there.`,
      lost: `Lost touch with ${nm}'s Eye. Check your connection.`,
      away: '',
      stopped: '',
      closed: ''
    }[why];
    if (text) say(text, false);
    emit('end', { friend: s.f, result: why, was });
    Ctl.end(why);
    later(() => { if (S === s) { S = null; Ctl.detach(); } }, ['cancelled', 'closed', 'away', 'stopped'].includes(why) ? 60 : END_HOLD_MS);
  }
  function stop(why) {                                          // the owner stopped, closed or left
    if (!S) return;
    if (S.phase === 'asking') return cancelAsk();
    if (S.phase === 'live' || S.phase === 'answering') send(S.f, { o: 'bye', id: S.id, why: why || 'stop' });
    over(why === 'close' || why === 'mode' ? 'closed' : why === 'away' ? 'away' : 'stopped');
  }
  function say(text, hold) { const c = C(); if (c && c.isOpen() && c.say) c.say(text, hold); else if (text) flash(text); }
  function flash(text) { if (root.EyesSocial && EyesSocial.caption) EyesSocial.caption(text, 4200); }

  // leaving EYES mid-Mirror ends it, and says so to the other Eye (one message, sent as the page goes)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (S) stop('away'); return; }
    if (card && Date.now() > card.until) hideInvite();
  });
  addEventListener('offline', () => { if (S && S.phase === 'live') over('lost'); });

  // ======================================================================================
  // the controller: draws the encounter with the Meeting Space's own two Eyes
  // ======================================================================================
  const Ctl = (() => {
    let attached = null, me = null, them = null, endAt = 0, endWhy = '', sync = 0, beams = [], hist = [], lastAct = null;
    const st = { me: {}, them: {} };
    function host() { return C(); }
    function attach() {
      const c = host(); if (!c) return;
      const obj = { layout: true, behave, sky, panel, busy: () => !!S && !lowPower(), onClose };
      if (attached && attached.invite) { attached = null; }
      if (c.attach(obj)) { attached = obj; sync = 0; beams = []; endAt = 0; st.me = {}; st.them = {}; }
    }
    // an invitation shown inside the Meeting Space: their Eye looks at yours, expectantly; nothing else changes
    function attachInvite() {
      const c = host(); if (!c || S) return;
      const obj = { invite: true, layout: false, behave: behaveInvite, panel: panelInvite, onClose: () => { attached = null; } };
      if (c.attach(obj)) attached = obj;
    }
    function dropInvite() { if (attached && attached.invite) { const c = host(); const a = attached; attached = null; if (c) c.detach(a); } }
    function detach(silent) { const c = host(); const a = attached; attached = null; if (c && a) c.detach(a); if (!silent && c) c.panelRefresh(); }
    function refresh() { const c = host(); if (c) c.panelRefresh(); }
    function onClose(why) {
      const a = attached; attached = null;
      if (a && a.invite) return;
      if (S) stop(why);
    }
    function start() { lastAct = null; hist = []; sync = 0; st.me = {}; st.them = {}; refresh(); }
    function onAct(a) { lastAct = a; if (a.name === 'round') beams.push({ t0: nowS() + (a.copy.lag + 0.25) * (S.k || 1), from: a.leader, kind: a.g }); }
    function end(why) { endAt = nowS(); endWhy = why; refresh(); }
    // ----- small tools -----
    const side = (n) => (n === me ? 'me' : 'them');
    const roleOf = (who) => (S.role === 'a' ? (who === 'a' ? me : them) : (who === 'a' ? them : me));
    const T = (n) => (n && n.dna ? n.dna.T : { curiosity: 0.5, shyness: 0.5, energy: 0.5, grump: 0.3, drama: 0.4 });
    const Tplan = (n) => (S && S.plan ? ((n === me) === (S.role === 'a') ? S.plan.Ta : S.plan.Tb) : T(n));
    function facing(n, other) {
      const c = host(), p = c.pos(n), q = c.pos(other), dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
      return { x: dx / L, y: dy / L, L };
    }
    // facing-frame gaze → this Eye's gaze target
    function aim(n, other, gf, gu, hold) {
      if (!n.eye) return;
      const f = facing(n, other);
      const x = f.x * gf * 0.92 - f.y * 0.0, y = f.y * gf * 0.72 + gu * 0.72;
      n.eye.setTarget(clamp(x, -1, 1), clamp(y, -1, 1));
      n.eye.reactUntil = nowS() + (hold || 0.25);
      n.ctl.until = nowS() + (hold || 0.25);
    }
    const blinkOnce = (n, slow) => { if (n.eye && n.eye.blinkT < 0) { n.eye.blinkT = nowS(); n.eye.slowBlink = !!slow; n.eye.blinkQueue = 0; } };
    function body(n, gentle, mx, my, rot, ms, rate = 0.12) {
      const k = gentle ? 0.4 : 1;
      n.mx = mix(n.mx || 0, mx * k, rate); n.my = mix(n.my || 0, my * k, rate); n.rot = mix(n.rot || 0, rot * k, rate); n.ms = mix(n.ms || 1, 1 + ((ms || 1) - 1) * k, rate);
    }
    // ----- the invitation, inside the Meeting Space -----
    function behaveInvite(t, m, th, gentle) {
      if (!card) return false;
      me = m; them = th;
      // their Eye looks at yours and waits; yours glances between it and you
      if (th.eye && t > (th.ctl.until || 0)) { aim(th, m, 1, -0.05, 1.2); th.eye.pupilGoal = 1.15; }
      if (m.eye && t > (m.ctl.until || 0)) { if (Math.random() < 0.6) aim(m, th, 1, 0, mix(0.8, 1.6, Math.random())); else { m.eye.setTarget(0, 0.1); m.eye.reactUntil = t + 0.8; m.ctl.until = t + 0.8; } }
      return true;
    }
    function panelInvite(p) {
      if (!card) return false;
      p.innerHTML = `<div class="ec-mirror-ask"><p><b>${esc(friendName(card.f))}</b>'s Eye wants to mirror yours.</p><div class="ec-actions"><button type="button" class="ec-btn" data-m="no">Not now</button><button type="button" class="ec-btn ec-primary" data-m="yes">Mirror</button></div></div>`;
      p.querySelector('[data-m=no]').onclick = decline;
      p.querySelector('[data-m=yes]').onclick = acceptInvite;
      return true;
    }
    // ----- the panel while it runs -----
    function panel(p) {
      if (!S) return false;
      const live = S.phase === 'live', asking = S.phase === 'asking', answering = S.phase === 'answering', done = S.phase === 'over';
      const label = asking ? (S.sent ? `Waiting for ${esc(S.nm)}'s Eye…` : 'Inviting…') : answering ? 'Answering…' : live ? `Mirroring with ${esc(S.nm)}` : '';
      p.innerHTML = `<div class="ec-mirror-live${done ? ' ec-mirror-over' : ''}"><p class="ec-hint">${label}</p>${done ? '' : `<button type="button" class="ec-btn ec-small" data-m="stop">${asking ? 'Never mind' : 'Stop'}</button>`}</div>`;
      const b = p.querySelector('[data-m=stop]'); if (b) b.onclick = () => stop('stop');
      return true;
    }
    // ----- every frame -----
    function behave(t, m, th, gentle) {
      me = m; them = th;
      if (!S) return false;
      const g = gentle || (S && S.gentle);
      if (S.phase === 'asking' || S.phase === 'answering') {
        // not synchronized yet: each Eye is just itself, but yours keeps looking over (it asked, or it's answering)
        if (m.eye && t > (m.ctl.until || 0)) { if (Math.random() < 0.7) aim(m, th, 1, 0, mix(1, 2.2, Math.random())); else { m.eye.setTarget((Math.random() - 0.5) * 0.4, 0.15); m.eye.reactUntil = t + 0.9; m.ctl.until = t + 0.9; } }
        body(m, g, 0, 0, 0, 1); body(th, g, 0, 0, 0, 1);
        return false;                                         // their Eye keeps its ordinary Meeting Space life
      }
      if (S.phase === 'over') return behaveEnd(t, m, th, g);
      const s = tick(); if (!s || !S || S.phase !== 'live') return true;
      const a = s.act;
      if (s.hold) return behaveHold(t, m, th, g);
      if (a.name === 'approach') approach(s, m, th, g);
      else if (a.name === 'study') study(s, m, th, g);
      else if (a.name === 'round') round(s, a, m, th, g);
      else if (a.name === 'sync') together(s, a, m, th, g);
      else part(s, m, th, g);
      return true;
    }
    function approach(s, m, th, g) {
      const u = s.u;
      sync = mix(sync, 0.15 * u, 0.05);
      for (const [n, o] of [[m, th], [th, m]]) {
        const Tn = Tplan(n), shy = Tn.shyness, f = facing(n, o);
        // a shy Eye starts looking away and comes round slowly; a bold one turns straight away
        const turn = ease((u - shy * 0.45) / Math.max(0.2, 1 - shy * 0.45));
        const away = (1 - turn) * (0.6 + 0.6 * shy);
        aim(n, o, mix(-0.7, 0.95, turn) - away * 0.2, (shy > 0.55 ? 0.35 : -0.05) * (1 - turn));
        if (n.eye) n.eye.pupilGoal = 1 + 0.15 * turn * Tn.curiosity;
        const lean = 0.05 * f.L * ease(u) * (0.6 + 0.4 * Tn.curiosity) * (1 - 0.5 * shy);
        body(n, g, f.x * lean, f.y * lean, 0, 1, 0.08);
        if (n.eye) n.eye.closeK = mix(n.eye.closeK || 0, clamp((0.42 - Tn.energy) * 0.5), 0.05);
      }
    }
    // they study each other: each pupil follows where the other's pupil is
    function study(s, m, th, g) {
      const c = host();
      sync = mix(sync, 0.28, 0.04);
      for (const [n, o] of [[m, th], [th, m]]) {
        const Tn = Tplan(n), f = facing(n, o), sn = st[side(n)];
        if (!n.eye || !o.eye) continue;
        // where the other's pupil is right now, in screen space
        const op = c.pos(o), rad = o.size * 0.22, px = op.x + o.eye.gaze.x * rad, py = op.y + o.eye.gaze.y * rad;
        if (!sn.next || nowS() > sn.next) {
          // an investigating glance: a little up/down the other Eye, more often for a curious one
          sn.off = { x: (Math.random() - 0.5) * 0.5 * o.size, y: (Math.random() - 0.5) * 0.6 * o.size };
          sn.next = nowS() + mix(0.5, 1.5, Math.random()) * (1.35 - 0.7 * Tn.curiosity) * (1 + (g ? 0.5 : 0));
          if (Tn.shyness > 0.62 && Math.random() < 0.35) { sn.off = { x: -f.x * o.size * 1.8, y: o.size * 0.9 }; sn.next = nowS() + 0.7; }
        }
        c.lookAt(n, px + sn.off.x, py + sn.off.y, 0.3);
        n.eye.pupilGoal = 1 + (0.1 + 0.25 * Tn.curiosity) * (o.eye.pupil > 1.05 ? 1.2 : 1);
        const lean = 0.06 * f.L * (0.5 + 0.5 * Tn.curiosity) * (1 - 0.5 * Tn.shyness);
        body(n, g, f.x * lean, f.y * lean + Math.sin(nowS() * 1.3 + (n === m ? 0 : 1.7)) * 1.5, 0, 1, 0.06);
      }
    }
    // a round: the leader does a small thing, the follower tries to copy it (in the mirror: toward stays toward)
    function round(s, a, m, th, g) {
      const L = roleOf(a.leader), Fo = roleOf(a.follower), cp = a.copy, k = S.k || 1, tau = s.tau;  // tau in plan seconds
      const gd = PLAN.G[a.g].d, amp = g ? 0.75 : 1;
      sync = mix(sync, 0.32 + 0.2 * (tau > gd + cp.lag ? cp.quality : 0), 0.04);
      // leader
      const gl = PLAN.gesture(a.g, tau, g);
      lead(L, Fo, gl, g, amp, tau, PLAN.G[a.g], 0);
      // follower
      let ft = tau - cp.lag - (cp.hesitate ? 0.6 : 0);
      if (cp.hesitate && tau > cp.lag * 0.5 && tau < cp.lag + 0.6) { aim(Fo, L, -0.9, 0.45); body(Fo, g, 0, 0, -0.04, 1); }
      else if (cp.refuse) {
        // a smug Eye won't play along: it holds your stare, squints a little, and blinks slowly when it's done
        aim(Fo, L, 1, -0.05);
        if (Fo.eye) { Fo.eye.moodGoal.squint = tau > cp.lag ? 0.32 : 0; Fo.eye.pupilGoal = 0.92; }
        if (tau > gd + cp.lag && !st[side(Fo)].refBlink) { st[side(Fo)].refBlink = a.i; blinkOnce(Fo, true); }
        body(Fo, g, 0, 0, 0.05 * Math.sin(Math.PI * clamp((tau - cp.lag) / gd)), 1);
      } else if (ft >= 0 && ft <= gd * (cp.sleepy > 0.4 ? 1.25 : 1)) {
        const fg = PLAN.gesture(a.g, ft / (cp.sleepy > 0.4 ? 1.25 : 1), g);
        lead(Fo, L, fg, g, amp * cp.amp * cp.over, ft, PLAN.G[a.g], 1);
      } else {
        aim(Fo, L, 1, 0);
        if (Fo.eye) { Fo.eye.moodGoal.squint = 0; Fo.eye.moodGoal.wide = 0; Fo.eye.pupilGoal = 1.05; }
        body(Fo, g, 0, 0, 0, 1);
      }
      // the leader answers what it saw: pleased, patient, or a little miffed
      const after = tau - (gd + cp.lag + (cp.hesitate ? 0.6 : 0));
      if (after > 0.15 && L.eye) {
        const TL = Tplan(L), sl = st[side(L)];
        if (sl.reacted !== a.i) {
          sl.reacted = a.i;
          if (cp.refuse) { if (TL.shyness > 0.6) { aim(L, Fo, -0.8, 0.4, 1); } else { L.eye.moodGoal.squint = 0.35; later(() => { if (L.eye) L.eye.moodGoal.squint = 0; }, 900); } }
          else if (cp.quality > 0.7) { L.eye.pupilV += 1.4; L.eye.pupilGoal = 1.25; if (TL.energy > 0.6 && !g) sl.hop = nowS(); }
          else blinkOnce(L, true);
        }
        if (sl.hop) { const h = nowS() - sl.hop; body(L, g, 0, -Math.abs(Math.sin(h * 9)) * 6 * Math.exp(-h * 3), 0, 1, 0.35); if (h > 0.9) sl.hop = 0; }
      }
    }
    // perform a gesture's channels on an Eye
    function lead(n, o, gv, g, amp, tau, G, isCopy) {
      if (!n || !n.eye) return;
      const gf = 1 + (gv.gf || 0) * amp, gu = (gv.gu || 0) * amp * (g ? 0.8 : 1);
      aim(n, o, gf, gu);
      n.eye.moodGoal.squint = clamp((gv.sq || 0) * amp);
      n.eye.moodGoal.wide = clamp((gv.wd || 0) * amp);
      n.eye.pupilGoal = 1 + (gv.pu || 0) * amp;
      if (G.blinks) {
        const key = (isCopy ? 'c' : 'l') + G.d;
        const sx = st[side(n)]; sx.fired = sx.fired || {};
        G.blinks.forEach(([bt, slow], i) => { const id = key + ':' + i + ':' + (lastAct ? lastAct.i : 0); if (!sx.fired[id] && tau >= bt * G.d) { sx.fired[id] = true; n.eye.blinkT = nowS(); n.eye.slowBlink = !!slow; n.eye.blinkQueue = 0; } });
      }
      const bob = (gv.bob || 0) * amp * n.size * 0.06, rot = (gv.rot || 0) * amp * (n === me ? 1 : -1);
      body(n, g, 0, bob, rot, 1, 0.3);
    }
    // the shared moment: only reached after their Eye's beat 4 (the barrier in tick)
    function together(s, a, m, th, g) {
      const tau = s.tau, u = s.u;
      sync = mix(sync, 1, 0.05);
      const shared = Math.sin((tau / 1.4) * TAU);               // one breath for both
      for (const [n, o] of [[m, th], [th, m]]) {
        if (!n.eye) continue;
        const lag = (n === me) === (S.role === 'a') ? a.lagA : a.lagB;
        const f = facing(n, o);
        aim(n, o, 1, 0);
        n.eye.pupilGoal = 1.22; n.eye.moodGoal.squint = 0.08; n.eye.moodGoal.wide = 0;
        n.eye.closeK = mix(n.eye.closeK || 0, lag > 0.2 ? 0.18 : 0.04, 0.06);
        // the blink they share; a sleepy Eye is a beat late, then catches up
        const sn = st[side(n)];
        if (!sn.syncBlink && tau >= 0.9 + lag) { sn.syncBlink = true; blinkOnce(n, true); }
        if (lag > 0.2 && !sn.catchBlink && tau >= 1.9) { sn.catchBlink = true; blinkOnce(n, false); }
        const lean = 0.1 * f.L * ease(u / 0.4) * (1 - ease((u - 0.82) / 0.18));
        const br = mix(1, 1 + 0.025 * Math.sin((tau - lag) / 1.4 * TAU), ease(u / 0.3));
        body(n, g, f.x * lean, f.y * lean, 0, br, 0.08);
      }
      void shared;
    }
    function part(s, m, th, g) {
      const u = s.u;
      sync = mix(sync, 0, 0.04);
      for (const [n, o] of [[m, th], [th, m]]) {
        if (!n.eye) continue;
        const Tn = Tplan(n), late = (1 - Tn.shyness) * Tn.grump > 0.3 ? 0.35 : 0, sn = st[side(n)];
        if (u < 0.15 + late) aim(n, o, 1, 0, 0.3);
        else { if (!sn.partDir) sn.partDir = { gf: -0.4 - Math.random() * 0.4, gu: Tn.shyness > 0.55 ? 0.5 : (Math.random() - 0.5) * 0.6 }; aim(n, o, sn.partDir.gf, sn.partDir.gu, 0.5); }
        n.eye.pupilGoal = 1; n.eye.moodGoal.squint = 0;
        n.eye.closeK = mix(n.eye.closeK || 0, 0, 0.05);
        body(n, g, 0, 0, 0, 1, 0.06);
      }
    }
    function behaveHold(t, m, th, g) {
      // waiting for their Eye to catch up: yours keeps looking; theirs seems a little elsewhere (we don't know why)
      aim(m, th, 1, 0, 0.3);
      if (th.eye) { th.eye.closeK = mix(th.eye.closeK || 0, 0.22, 0.03); if (t > (th.ctl.until || 0)) { th.eye.setTarget((Math.random() - 0.5) * 0.6, 0.3); th.eye.reactUntil = t + 1.1; th.ctl.until = t + 1.1; } }
      body(m, g, 0, 0, 0, 1, 0.05); body(th, g, 0, 0, 0, 1, 0.05);
      sync = mix(sync, 0.12, 0.03);
      if (S && S.holdAt && nowS() - S.holdAt > 2.5 && !S.saidHold) { S.saidHold = true; say(`Waiting for ${S.nm}'s Eye…`, true); }
      return true;
    }
    function behaveEnd(t, m, th, g) {
      const k = nowS() - endAt;
      body(m, g, 0, 0, 0, 1, 0.08); body(th, g, 0, 0, 0, 1, 0.08);
      sync = mix(sync, 0, 0.05);
      if (['declined', 'left', 'quiet', 'lost', 'timeout', 'busy', 'still', 'unconfirmed', 'faded'].includes(endWhy) && th.eye) {
        // their Eye drifts back to its own life; nothing dramatic
        if (k < 0.1) { th.eye.setTarget(0.5, 0.35); th.eye.reactUntil = t + 1.2; }
        th.eye.closeK = mix(th.eye.closeK || 0, endWhy === 'timeout' || endWhy === 'quiet' ? 0.4 : 0.15, 0.04);
      }
      return k < END_HOLD_MS / 1000;
    }
    // ----- the light between them -----
    function sky(g, t, tools) {
      if (!S || !me || !them || S.phase === 'asking' || S.phase === 'answering' || !me.eye || !them.eye) return;
      const c = host(), a = c.pos(me), b = c.pos(them), myC = tools.myColor, thC = them.color || [200, 222, 230];
      const ra = me.size * 0.36, rb = them.size * 0.36, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      const ax = a.x + ux * ra, ay = a.y + uy * ra, bx = b.x - ux * rb, by = b.y - uy * rb;
      const k = clamp(sync) * (S.phase === 'over' ? clamp(1 - (nowS() - endAt) / 1.2) : 1);
      if (k < 0.01) return;
      g.save(); g.globalCompositeOperation = 'lighter';
      const gr = g.createLinearGradient(ax, ay, bx, by);
      gr.addColorStop(0, tools.rgba(myC, 0.08 + 0.35 * k)); gr.addColorStop(1, tools.rgba(thC, 0.08 + 0.35 * k));
      g.strokeStyle = gr; g.lineCap = 'round';
      const sag = 6 * (1 - k);
      g.lineWidth = 1 + 2.5 * k; g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by); g.stroke();
      g.globalAlpha = 0.22 * k; g.lineWidth = 9 * k + 2; g.stroke(); g.globalAlpha = 1;
      // a gesture passes along the thread, from the one who did it to the one who copies
      const now = nowS();
      beams = beams.filter((x) => now - x.t0 < 1.4);
      for (const bm of beams) {
        const q = (now - bm.t0) / 1.1; if (q < 0 || q > 1) continue;
        const fromMe = roleOf(bm.from) === me, x0 = fromMe ? ax : bx, y0 = fromMe ? ay : by, x1 = fromMe ? bx : ax, y1 = fromMe ? by : ay;
        const e = ease(q), px = mix(x0, x1, e), py = mix(y0, y1, e) + sag * Math.sin(Math.PI * e) * 0.5;
        tools.glow(g, px, py, 3.5, fromMe ? myC : thC, 0.9 * Math.sin(Math.PI * q));
      }
      // the shared moment: a slow bloom around both, breathing together
      if (S.phase === 'live' && S.act >= 5 && lastAct && lastAct.name === 'sync') {
        const tt = clock() - lastAct.start, br = 0.5 + 0.5 * Math.sin((tt / 1.4) * TAU), on = ease(tt / 0.8) * (1 - ease((tt - lastAct.dur + 0.6) / 0.6));
        tools.glow(g, (a.x + b.x) / 2, (a.y + b.y) / 2, 10 + 8 * br, [(myC[0] + thC[0]) / 2, (myC[1] + thC[1]) / 2, (myC[2] + thC[2]) / 2], 0.35 * on);
        for (const [p, cc, r0] of [[a, myC, me.size], [b, thC, them.size]]) {
          g.strokeStyle = tools.rgba(cc, 0.16 * on * (0.6 + 0.4 * br)); g.lineWidth = 1.5;
          g.beginPath(); g.arc(p.x, p.y, r0 * (0.4 + 0.03 * br), 0, TAU); g.stroke();
        }
      }
      g.restore();
    }
    return { attach, attachInvite, dropInvite, detach, refresh, start, onAct, end, _sync: () => sync };
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
      el.id = 'eyesMirrorCall'; el.className = 'emc'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `${nm}'s Eye wants to mirror yours`);
      el.innerHTML = `<div class="emc-card"><canvas class="emc-eye" aria-hidden="true"></canvas>
        <div class="emc-txt"><p class="emc-k">MIRROR</p><p class="emc-l"><b></b>'s Eye wants to mirror <span></span>.</p></div>
        <div class="emc-row"><button type="button" class="emc-no">Not now</button><button type="button" class="emc-yes">Mirror</button></div>
        <i class="emc-time" aria-hidden="true"></i></div>`;
      el.querySelector('.emc-l b').textContent = nm; el.querySelector('.emc-l span').textContent = myName();
      document.body.appendChild(el);
      el.querySelector('.emc-no').onclick = decline;
      el.querySelector('.emc-yes').onclick = acceptInvite;
      const bar = el.querySelector('.emc-time');
      tick = setInterval(() => { if (el) bar.style.transform = `scaleX(${clamp((c.until - Date.now()) / ASK_MS).toFixed(3)})`; }, 250);
      const cv = el.querySelector('canvas');
      if (dna && root.HavenEye) {
        try { const col = D().mapColor(111, 193, 202, dna); el.style.setProperty('--c', col.map((x) => x | 0).join(',')); } catch (e) {}
        const px = Math.round(56 * Math.min(2, devicePixelRatio || 1)); cv.width = cv.height = px;
        eye = new HavenEye(dna, cv); eye.setTarget(-0.55, 0.2); eye.reactUntil = nowS() + 999; eye.pupilGoal = 1.15;
        const m = motionMode();
        const step = () => { loop = 0; if (!el || !eye) return; const t = nowS(); if (Math.random() < 0.01) eye.setTarget(-0.55 + (Math.random() - 0.5) * 0.3, 0.2 + (Math.random() - 0.5) * 0.2); eye.step(t, 1 / 30); eye.draw(t); if (m !== 'off') loop = setTimeout(step, m === 'gentle' ? 50 : 33); };
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
    if (b.native && !(up && up.peer && F().supportsDirect(up, 'mirror'))) why = "Mirror needs both Eyes on EYES 4.4 (Android) or 2.4 (iPhone), open at the same time once so your first Eye Contact can upgrade. Your link stays exactly as it is.";
    else if (!f || !f.peer) why = 'Their Eye has to arrive first.';
    else if (!F().mirrorVia(f)) why = `${friendName(f)}'s EYES needs the Distant Connections update (Android 4.4 or iPhone 2.4) to mirror.`;
    else if (!f.profile && !(b.native && b.profile)) why = 'Their Eye is still introducing itself.';
    else if (motionMode() === 'off') why = 'Mirror needs motion. Choose On or Gentle in The Optic → Motion.';
    if (f && b.native && !f.profile && b.profile) f.profile = b.profile;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ec-mirror' + (why ? ' ec-mirror-off' : '');
    btn.innerHTML = '<i class="ec-mirror-g" aria-hidden="true"><i></i></i><span>Mirror</span>';
    btn.setAttribute('aria-label', why ? `Mirror (not available): ${why}` : `Mirror: invite ${friendName(f)}'s Eye to mirror yours`);
    btn.onclick = () => {
      if (why) { sayIt(why); return; }
      if (S) { sayIt('One Mirror at a time.'); return; }
      if (busyElsewhere()) { sayIt('Finish the duel first.'); return; }
      invite(f);
    };
    box.appendChild(btn);
  }

  // ======================================================================================
  // boot
  // ======================================================================================
  function boot() {
    const Fr = F(); if (!Fr || !Fr.on) return;
    Fr.on('mirror', onMirror);
    Fr.on('removed', (f) => { if (card && card.f && card.f.code === f.code) hideInvite(); if (S && S.code === f.code) over('lost'); });
    if (root.Haven && Haven.back) { const orig = Haven.back.bind(Haven); Haven.back = () => { if (Card.isOpen()) { decline(); return true; } return orig(); }; }
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && Card.isOpen()) { e.stopImmediatePropagation(); decline(); } }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  root.EyesMirror = {
    slot, invite, PLAN, canMirror,
    busy: () => !!S || !!card,
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    _debug: { session: () => S, card: () => card, accept: acceptInvite, decline, stop, sync: () => Ctl._sync(), clock }
  };
})(window);
