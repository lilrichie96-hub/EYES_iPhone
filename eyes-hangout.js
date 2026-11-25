/* EYES 4.5 · Hangout (replaces Mirror). Two friends' Eyes visit each other. Shared by Android and iPhone.
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
     in battery saver or ≤ 15 % and not charging. Nothing runs while EYES is hidden. */
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
    const MOVES = ['bounce', 'spin', 'wobble', 'peek', 'roll', 'puff'];
    const REACTIONS = ['join', 'confused', 'surprised', 'amused'];
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
    function moveWeights(T) {
      return { bounce: 0.4 + 1.2 * T.energy, spin: 0.2 + 0.8 * T.drama + 0.4 * T.energy, wobble: 0.4 + 0.6 * T.drama, peek: 0.3 + 1.1 * T.shyness,
        roll: 0.2 + 1.1 * T.grump + 0.3 * (1 - T.shyness) * T.grump, puff: 0.3 + 0.7 * T.drama + 0.3 * T.curiosity };
    }
    function reactionWeights(T) {
      return { join: 0.35 + 0.8 * T.energy + 0.5 * T.curiosity - 0.3 * T.grump, confused: 0.25 + 0.7 * T.grump + 0.3 * sleepy(T),
        surprised: 0.2 + 0.7 * T.shyness + 0.4 * T.drama, amused: 0.35 + 0.6 * T.curiosity + 0.3 * (1 - T.shyness) };
    }
    // the whole Hangout as a lazily grown list of activities (start / dur in seconds from going live)
    function schedule(seed, Ta, Tb) {
      Ta = { ...NEUTRAL, ...Ta }; Tb = { ...NEUTRAL, ...Tb };
      const r0 = mulberry(seed >>> 0);
      const first = bold(Ta) + (r0() - 0.5) * 0.2 >= bold(Tb) ? 'a' : 'b';
      const list = [{ i: 0, kind: 'arrive', start: 0, dur: 5.2, init: first, p: {} }];
      const avg = (k) => (Ta[k] + Tb[k]) / 2;
      let lastCatch = -9;
      function grow() {
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
          p.move = pick(r, moveWeights(Ti));
          p.reaction = pick(r, reactionWeights(To));
          p.amp = 0.75 + 0.35 * Ti.drama + 0.15 * r();
          p.joinMove = r() < 0.7 ? p.move : pick(r, moveWeights(To));    // joining in, its own way
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
        first, Ta, Tb,
        at(i) { while (list.length <= i) grow(); return list[i]; },
        find(t, from) { let i = Math.max(0, from | 0); while (i > 0 && this.at(i).start > t) i--; while (this.at(i + 1).start <= t) i++; return this.at(i); }
      };
    }
    // does the Eye of `role` fumble toss n of catch i? (both phones agree)
    function fumble(seed, i, n, T) {
      const r = mulberry((seed ^ Math.imul(i + 7, 0x85ebca6b) ^ Math.imul(n + 3, 0xc2b2ae35)) >>> 0);
      r();
      const p = clamp(0.08 + 0.14 * T.shyness + 0.16 * sleepy(T) + 0.1 * T.drama - 0.08 * T.curiosity, 0.05, 0.36);
      return r() < p;
    }
    return { seedOf, pack, unpack, word, schedule, fumble, sleepy, MOVES, REACTIONS, NEUTRAL, VERSION: 1 };
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
    S = newSession(f, 'a', rid(10));
    if (F().probe) F().probe(f);
    const ask = { o: 'ask', id: S.id, sd: S.sdMine, tm: S.tmMine, w: S.wMine, nm: myName().slice(0, 16), v: PLAN.VERSION };
    const s = S;
    Ctl.attach();
    say(`Inviting ${S.nm}'s Eye over…`, true);
    send(ask).then((ok) => {
      if (S !== s || S.phase !== 'asking') return;
      if (!ok) { over('failed'); return; }
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
      S.sdTheirs = m.sd; S.tmTheirs = m.tm; S.wTheirs = PLAN.word(m.w);
      go();
      send({ o: 'hi', id: S.id });                          // so the accepter knows we're here too
      return;
    }
    if (o === 'no' && S.phase === 'asking') { clearTimers(); over(m.why === 'busy' ? 'busy' : m.why === 'still' ? 'still' : 'declined'); return; }
    if (S.phase !== 'live') { if (o === 'bye' && ['asking', 'answering'].includes(S.phase)) over('left'); return; }
    if (o === 'toss') { Ctl.theirToss(m); return; }
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
    if (!c.isOpen() || c.focus() !== c0.key) c.meet(c0.key);
    S = newSession(c0.f, 'b', c0.id);
    accept(c0.m, false);
  }
  function accept(m, crossed) {
    S.sdTheirs = m.sd; S.tmTheirs = m.tm; S.wTheirs = PLAN.word(m.w);
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
    S.plan = PLAN.schedule(S.seed, Ta, Tb);
    S.phase = 'live'; S.t0ms = Date.now(); S.lastHeard = Date.now();
    say('');
    Ctl.start();
    watch();
  }
  // the quiet watchdog: one timer every 5 s, no networking unless something is actually due
  function watch() {
    const s = S;
    later(() => {
      if (S !== s || S.phase !== 'live') return;
      const now = Date.now();
      if (document.visibilityState === 'visible' && !S.hiddenAt) {
        if (now - S.lastSent > TM.hi) send({ o: 'hi', id: S.id });
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
      faded: 'That invitation had already faded.',
      quiet: `${nm}'s Eye went quiet, so the Hangout ended there.`,
      lost: `Lost touch with ${nm}'s Eye. Check your connection.`,
      cancelled: '', away: '', stopped: '', closed: ''
    }[why];
    if (text) say(text, false);
    emit('end', { friend: s.f, result: why, was, seconds: Math.round(secs) });
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
      return;
    }
    if (card && Date.now() > card.until) hideInvite();
    if (S && S.phase === 'live' && S.hiddenAt) {
      const gone = Date.now() - S.hiddenAt; S.hiddenAt = 0;
      if (gone > TM.hiddenMax) { stop('away'); return; }
      S.lastHeard = Math.max(S.lastHeard, Date.now() - 30000);   // don't count our own absence as their silence
      send({ o: 'back', id: S.id });
      Ctl.wokeUp();
    }
  });
  addEventListener('offline', () => { if (S && S.phase === 'live' && !S.offlineAt) S.offlineAt = Date.now(); });
  addEventListener('online', () => { if (S) S.offlineAt = 0; });

  // ======================================================================================
  // the controller: draws the Hangout with the Meeting Space's own two Eyes
  // ======================================================================================
  const Ctl = (() => {
    let attached = null, me = null, them = null, endAt = 0, endWhy = '';
    let fx = null, fg = null, fW = 0, fH = 0, fdpr = 1, lastT = 0, input = null, drew = false;
    const A = { me: null, them: null };                 // actors
    let act = null, actI = -1, ast = {};                // current activity and its local state
    let ball = null, flies = [], sparks = [], rings = [], motes = [];
    let farewellAt = 0, farewellWho = '', arrived = 0, tipUntil = 0, toldFlick = false;
    const host = () => C();
    const G = 2600;                                      // px/s², for hops

    // ---------- attach / detach ----------
    function attach() {
      const c = host(); if (!c) return;
      const obj = { layout: true, behave, sky, panel, busy, onClose, back: onBack };
      if (attached && attached.invite) attached = null;
      if (c.attach(obj)) { attached = obj; reset(); }
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
    function reset() { A.me = A.them = null; act = null; actI = -1; ast = {}; ball = null; flies = []; sparks = []; rings = []; motes = []; endAt = 0; farewellAt = 0; arrived = 0; lastT = 0; }
    function teardown() {
      if (fx) { fx.remove(); fx = fg = null; }
      if (input) { input.off(); input = null; }
      reset();
    }
    function start() { reset(); tipUntil = nowS() + 14; ensureFx(); bindInput(); refresh(); }
    function end(why) { endAt = nowS(); endWhy = why; refresh(); }
    function busy() {
      if (!S || lowPower()) return false;
      if (S.phase === 'leaving' || (S.phase === 'over' && nowS() - endAt < 1.6)) return true;
      if (ball && ball.st !== 'held') return true;          // a ball in the air (a held one bobs fine at 30 fps)
      if (sparks.length || rings.length || motes.length) return true;
      if (act && (act.kind === 'arrive' || act.kind === 'goof')) return true;
      return !!(A.me && A.them && (A.me.air || A.them.air || A.me.move || A.them.move));
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
    function actor(key, n) {
      const myRole = S.role, role = key === 'me' ? myRole : (myRole === 'a' ? 'b' : 'a');
      const T = { ...PLAN.NEUTRAL, ...(role === 'a' ? S.plan.Ta : S.plan.Tb) };
      return { key, role, n, T, w: role === 'a' ? S.wa : S.wb,
        x: 0, y: 0, r: 0, s: 1, q: 0, vx: 0, vy: 0, vr: 0, vs: 0, vq: 0, gx: 0, gy: 0, gr: 0, gs: 1, gq: 0,
        air: false, jy: 0, jv: 0, spin: null, lid: 0, lidGoal: 0.1, next: nowS() + rnd(1.5, 4), todo: [], move: null, fav: null,
        breathe: rnd(3.2, 4.6), ph: rnd(0, TAU), tapAt: 0, doze: 0, lean: 0 };
    }
    const other = (a) => (a === A.me ? A.them : A.me);
    const byRole = (role) => (A.me && A.me.role === role ? A.me : A.them);
    const pos = (a) => host().pos(a.n);
    const size = (a) => a.n.size || 120;
    const dirTo = (a) => { const p = pos(a), q = pos(other(a)); return Math.sign(q.x - p.x) || 1; };
    const soon = (a, dt, fn) => a.todo.push({ at: nowS() + dt * speedK(), fn });
    const speedK = () => (S && S.gentle ? 1.35 : 1);
    const ampK = () => (S && S.gentle ? 0.55 : 1);
    function look(a, x, y, hold) { host().lookAt(a.n, x, y, hold || 0.3); }
    function lookAtOther(a, hold) { const p = pos(other(a)); look(a, p.x, p.y - size(other(a)) * 0.05, hold || 1); }
    function lookDir(a, gx, gy, hold) { const e = a.n.eye; if (!e) return; e.setTarget(clamp(gx, -1, 1), clamp(gy, -1, 1)); e.reactUntil = nowS() + (hold || 0.6); a.n.ctl.until = nowS() + (hold || 0.6); }
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
    function relax(a) { a.gx = a.lean; a.gy = 0; a.gr = 0; a.gs = 1; a.gq = 0; a.lidGoal = baseLid(a); }
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
      spring(a, 'x', 60, 0.55, dt); spring(a, 'y', 90, 0.5, dt); spring(a, 's', 70, 0.55, dt); spring(a, 'q', 300, 0.2, dt);
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
      n.mx = a.x * k; n.my = (a.y + a.jy) * k + a.q * sz * 0.3; n.rot = a.r * (a.spin ? 1 : k); n.ms = 1 + (a.s - 1 + br) * k; n.sq = a.q * k;
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
          once(m, 1, u >= 0, () => { hop(a, 0.17 * A0); lookDir(a, d * 0.2, -0.4, 0.6); });
          once(m, 2, u >= 0.5, () => { a.air = false; a.jy = 0; hop(a, 0.12 * A0); });
          once(m, 3, u >= 0.92, () => { a.air = false; a.jy = 0; hop(a, 0.07 * A0); lookAtOther(a, 1.2); });
          if (u > 1.6) a.move = null; break;
        case 'spin':
          if (u < 0.32) { a.gr = -0.38 * A0 * d; a.gq = 0.12; }
          once(m, 1, u >= 0.32, () => { a.gq = 0; hop(a, 0.08 * A0); a.spin = { t0: nowS(), d: 0.75 / m.sp, from: a.r, by: d * (TAU + 0.38 * A0) }; a.gr = 0; });
          once(m, 2, u >= 1.15, () => { const e = a.n.eye; if (e) { e.dartBurst = 3; e.nextDart = 0; e.reactUntil = 0; } pupil(a, 0.85, -1); });
          once(m, 3, u >= 1.9, () => { pupil(a, 1); lookAtOther(a, 1); dblink(a); });
          if (u > 2) a.move = null; break;
        case 'wobble':
          if (u < 1.5) { const dec = Math.exp(-u * 1.7); a.q = 0.17 * A0 * Math.sin(u * 21) * dec; a.vq = 0; a.gr = 0.07 * A0 * Math.sin(u * 13 + 0.6) * dec; }
          once(m, 1, u >= 0, () => { pupil(a, 1.2, 1.5); mood(a, 0, 0.3); });
          once(m, 2, u >= 1.5, () => { a.gr = 0; mood(a, 0.25, 0); lookAtOther(a, 1); });
          once(m, 3, u >= 2.1, () => mood(a, 0, 0));
          if (u > 2.2) a.move = null; break;
        case 'peek':
          once(m, 1, u >= 0, () => { a.gy = 0.3 * sz * A0; a.gs = 0.8; a.lidGoal = 0.32; lookAtOther(a, 1.4); });
          once(m, 2, u >= 1.25, () => { a.gy = 0; a.gs = 1.04; a.lidGoal = 0; hop(a, 0.12 * A0); mood(a, 0, 0.75); pupil(a, 1.35, 2.5); });
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
        case 'confused':
          once(m, 1, u >= 0, () => { a.gr = 0.16 * d; lookDir(a, -d * 0.55, -0.6, 0.9); pupil(a, 0.85); mood(a, 0.15, 0); });
          once(m, 2, u >= 0.95, () => { lookAtOther(a, 0.9); });
          once(m, 3, u >= 1.45, () => { a.gr = -0.1 * d; lookDir(a, d * 0.3, -0.7, 0.6); });
          once(m, 4, u >= 2.2, () => { a.gr = 0; pupil(a, 1); mood(a, 0, 0); blink(a); lookAtOther(a, 1); });
          if (u > 2.4) a.move = null; break;
        case 'surprised':
          once(m, 1, u >= 0, () => { mood(a, 0, 0.85); pupil(a, 0.7, -3); a.gx = a.lean - d * 0.12 * sz; hop(a, 0.06); });
          once(m, 2, u >= 0.5, () => pupil(a, 1.3, 1.5));
          once(m, 3, u >= 0.95, () => dblink(a));
          once(m, 4, u >= 1.9, () => { mood(a, 0, 0); pupil(a, 1); a.gx = a.lean; });
          if (u > 2) a.move = null; break;
        case 'amused':
          once(m, 1, u >= 0, () => { mood(a, 0.42, 0); pupil(a, 1.3, 1); });
          if (u < 1.25) { const k = Math.floor(u / 0.16); once(m, 'g' + k, true, () => { a.vy -= 95 * (1 - u / 1.4); a.vq += 0.7; }); }
          once(m, 2, u >= 1.4, () => { blink(a, true); });
          once(m, 3, u >= 2, () => { mood(a, 0, 0); pupil(a, 1); });
          if (u > 2.1) a.move = null; break;
        case 'wave':                                       // goodbye: a little waggle, a nod and a slow blink
          if (u < 1.3) a.gr = 0.11 * Math.sin(u * 11) * (1 - u / 1.3) * d; else a.gr = 0;
          once(m, 1, u >= 0, () => { lookAtOther(a, 2.4); pupil(a, 1.2, 1); mood(a, 0.18, 0); });
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
        // not together yet: each Eye is just itself, yours keeps looking over
        if (m.eye && t > (m.ctl.until || 0)) { if (Math.random() < 0.7) host().lookAt(m, host().pos(th).x, host().pos(th).y, rnd(1, 2.2)); else { m.eye.setTarget(rnd(-0.2, 0.2), 0.15); m.eye.reactUntil = t + 0.9; m.ctl.until = t + 0.9; } }
        return false;
      }
      if (!S.plan) return false;
      S.gentle = gentle || motionMode() === 'gentle';
      const dt = clamp(lastT ? t - lastT : 1 / 30, 0, 0.05); lastT = t;
      if (!A.me || A.me.n !== m) { A.me = actor('me', m); A.them = actor('them', th); arrived = t; }
      if (S.phase === 'over') {
        const k = t - endAt;
        for (const a of [A.me, A.them]) { relax(a); a.lean = 0; stepActor(a, t, dt); }
        if (ball && ball.st !== 'absorb') ballGone();
        return k < END_HOLD_MS / 1000;
      }
      if (S.phase === 'leaving') { stepFarewell(t); for (const a of [A.me, A.them]) stepActor(a, t, dt); stepBall(t, dt); stepFlies(t, dt); return true; }
      // which activity are we in?
      const tt = elapsed(), cur = S.plan.find(tt, actI);
      if (cur.i !== actI) enter(cur, t);
      const ta = tt - act.start, inAct = ta < act.dur;
      if (S.peerAway) behaveCompany(t, ta, true);
      else if (!inAct) { if (act.kind === 'catch' && ball) behaveCatch(t, ta); else behaveCompany(t, ta, false, true); }
      else if (act.kind === 'arrive') behaveArrive(t, ta);
      else if (act.kind === 'company') behaveCompany(t, ta);
      else if (act.kind === 'fireflies') behaveFlies(t, ta);
      else if (act.kind === 'goof') behaveGoof(t, ta);
      else behaveCatch(t, ta);
      for (const a of [A.me, A.them]) stepActor(a, t, dt);
      stepBall(t, dt); stepFlies(t, dt);
      return true;
    }
    function enter(cur, t) {
      const prev = act;
      act = cur; actI = cur.i; ast = { t0: t };
      if (prev && prev.kind === 'fireflies') flies.forEach((f) => { if (f.mode !== 'leave') { f.mode = 'leave'; f.vy = -rnd(30, 60); } });
      if (prev && prev.kind === 'catch' && ball) ballGone();
      for (const a of [A.me, A.them]) { a.move = null; a.fav = null; a.next = t + rnd(1, 3); if (cur.kind !== 'company') a.doze = 0; }
      if (cur.kind === 'fireflies') spawnFlies(cur);
      if (cur.kind === 'catch') startCatch(cur, t);
    }

    // ----- arrival: they notice each other, perk up and say hello their own way -----
    function behaveArrive(t, ta) {
      if (!ast.init) {
        ast.init = true;
        const mine = elapsed() < 3;                       // the start of the Hangout, not a jump into the middle
        for (const a of [A.me, A.them]) {
          const d = dirTo(a), sz = size(a);
          if (mine) { a.x = -d * 0.22 * sz; a.s = 0.88; a.lid = 0.3; }
          a.lean = 0; a.gx = 0; a.gs = 1;
          a.delay = a === A.me ? rnd(0, 0.25) : rnd(0.25, 0.65);
          lookDir(a, -d * 0.6, 0.4, 0.4 + a.delay);
        }
        // a few motes gather around their Eye: they've arrived
        const p = pos(A.them), sz = size(A.them);
        for (let i = 0; i < 14; i++) { const an = rnd(0, TAU), r = sz * rnd(0.5, 0.9); motes.push({ x: p.x + Math.cos(an) * r, y: p.y + Math.sin(an) * r, tx: () => pos(A.them), t0: t + rnd(0, 0.4), d: rnd(0.6, 1), col: A.them.n.color || [200, 222, 230] }); }
      }
      for (const a of [A.me, A.them]) {
        const u = ta - a.delay, d = dirTo(a), sz = size(a);
        if (!a.fired) a.fired = {};
        const fire = (id, at, fn) => { if (!a.fired[id] && u >= at) { a.fired[id] = true; fn(); } };
        fire('notice', 0.35, () => { lookAtOther(a, 1.6); pupil(a, 1.3, 2.2); mood(a, 0, 0.55); a.lidGoal = 0; hop(a, 0.11 + 0.06 * a.T.energy); });
        fire('hello', 1.3, () => {
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
        fire('settle', 3.6, () => { a.lean = d * 0.03 * sz; relax(a); lookAtOther(a, 1.2); });
      }
    }

    // ----- company: relaxed, mostly quiet, glances, leaning, shared slow blinks, dozing -----
    function behaveCompany(t, ta, peerAway, between) {
      for (const a of [A.me, A.them]) {
        if (a.move) continue;
        const o = other(a), sz = size(a), d = dirTo(a);
        if (peerAway && a === A.them) {                      // they left EYES for a moment: their Eye dozes
          a.lidGoal = 0.78; a.gs = 0.97; a.gr = 0.02 * Math.sin(t * 0.5); a.gx = 0;
          if (t > a.next) { lookDir(a, rnd(-0.2, 0.2), 0.5, 4); a.next = t + rnd(4, 8); }
          continue;
        }
        if (a.lidGoal > baseLid(a) + 0.05 && !a.doze) a.lidGoal = baseLid(a);
        if (t < a.next) continue;
        // comfortable inactivity: most of the time nothing happens at all
        const T = a.T, quietK = between ? 0.5 : 1;
        const w = {
          nothing: (1.3 + 0.8 * (1 - T.energy)) * quietK,
          glance: 0.9 + 0.6 * T.curiosity - 0.3 * T.shyness,
          around: 0.5 + 0.5 * T.curiosity,
          lean: a.lean ? 0.2 : 0.35 + 0.4 * (1 - T.shyness),
          sigh: 0.25 + 0.3 * PLAN.sleepy(T),
          doze: !between && !peerAway && a.doze === 0 && ta > 12 ? 0.15 + 0.7 * PLAN.sleepy(T) : 0,
          hum: 0.25 + 0.3 * T.energy,
          affection: o.n.eye && o.n.ctl && ta > 6 ? 0.25 + 0.35 * (1 - T.grump) : 0
        };
        if (a.doze) { w.nothing += 2; w.wake = 0.5; }
        let s = 0; for (const k in w) s += Math.max(0, w[k]); let x = Math.random() * s, pickd = 'nothing';
        for (const k in w) { if ((x -= Math.max(0, w[k])) <= 0) { pickd = k; break; } }
        const gap = rnd(3, 9) * (1 + PLAN.sleepy(T) * 0.6) * speedK();
        a.next = t + gap;
        if (pickd === 'glance') lookAtOther(a, rnd(1.2, 3.4) * (1.3 - T.shyness * 0.6));
        else if (pickd === 'around') { const an = rnd(-Math.PI, 0); lookDir(a, Math.cos(an) * 0.8, Math.sin(an) * 0.6, rnd(1, 2.4)); }
        else if (pickd === 'lean') { a.lean = a.lean ? 0 : d * rnd(0.05, 0.09) * sz; a.gx = a.lean; if (a.lean) lookAtOther(a, 1.5); }
        else if (pickd === 'sigh') { a.gs = 1.04; a.lidGoal = 0.35; soon(a, 0.8, () => { a.gs = 0.985; a.vq += 1; }); soon(a, 1.6, () => { a.gs = 1; a.lidGoal = baseLid(a); }); }
        else if (pickd === 'doze') { a.doze = 0.45; a.lidGoal = baseLid(a); a.gr = 0.03 * d; lookDir(a, 0, 0.45, gap); }
        else if (pickd === 'wake') { a.doze = 0; a.gr = 0; a.lidGoal = baseLid(a); pupil(a, 1.1, 1.6); a.vy -= 80; lookAtOther(a, 1.5); }
        else if (pickd === 'hum') { const k = rnd(0.025, 0.045) * d; a.gr = k; soon(a, 0.9, () => { a.gr = -k * 0.8; }); soon(a, 1.8, () => { a.gr = k * 0.5; }); soon(a, 2.6, () => { a.gr = 0; }); }
        else if (pickd === 'affection') {
          // look over; if the other is looking back, a shared slow blink (each a beat apart, never in unison)
          lookAtOther(a, 2.8);
          soon(a, 0.6, () => {
            const oe = o.n.eye;
            const watching = oe && Math.abs(oe.target.x - Math.sign(pos(a).x - pos(o).x) * 0.8) < 0.7;
            if (watching || Math.random() < 0.4) {
              blink(a, true); mood(a, 0.15, 0);
              if (!o.move && !o.doze) { lookAtOther(o, 2.4); soon(o, rnd(0.3, 0.7), () => { blink(o, true); mood(o, 0.12, 0); }); soon(o, 2, () => mood(o, 0, 0)); }
              soon(a, 1.8, () => mood(a, 0, 0));
              if (Math.random() < 0.35) { a.gx = a.lean + d * 0.06 * sz; soon(a, 2.2, () => { a.gx = a.lean; }); }
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
      if (!ast.ack && ast.moved && !I.move) { ast.ack = true; lookAtOther(I, 1.6); if (p.reaction === 'join' || p.reaction === 'amused') { mood(I, 0.3, 0); soon(I, 1.2, () => mood(I, 0, 0)); } else if (p.reaction === 'confused') { I.gr = 0.08 * dirTo(I); soon(I, 1, () => { I.gr = 0; }); } }
      if (p.finale && !ast.fin && ta >= dur - 2.4 * k && !I.move && !O.move) {
        ast.fin = true;
        lookAtOther(I, 1.5); lookAtOther(O, 1.5);
        soon(I, rnd(0, 0.2), () => hop(I, 0.06)); soon(O, rnd(0.15, 0.5), () => { if (O.T.energy > 0.45) hop(O, 0.05); else blink(O, true); });
      }
      if (!ast.done && ta >= dur - 0.6) { ast.done = true; relax(I); relax(O); }
    }

    // ----- fireflies: winking lights to follow, chase and pounce at; some travel between phones -----
    function spawnFlies(cur) {
      flies = flies.filter((f) => f.mode === 'leave');
      const c = cur.p, W = innerWidth, H = innerHeight, pa = pos(A.me), pb = pos(A.them);
      const cy = (pa.y + pb.y) / 2, cx = (pa.x + pb.x) / 2;
      for (let i = 0; i < c.count; i++) {
        const k = i / c.count;
        flies.push(fly(cx + (Math.random() - 0.5) * W * 0.8, cy - H * rnd(0.05, 0.3), 'enter', k));
      }
      ast.cross = c.cross.map((x) => ({ ...x, done: false, landed: false }));
    }
    function fly(x, y, mode, k) {
      const ca = A.me.n.color || [111, 193, 202], cb = A.them.n.color || [200, 222, 230], m = Math.random();
      const col = [mix(ca[0], cb[0], m), mix(ca[1], cb[1], m), mix(ca[2], cb[2], m)].map((v) => mix(v, 255, 0.35));
      return { x, y: mode === 'enter' ? y + 30 : y, vx: rnd(-20, 20), vy: rnd(-20, 10), ph: rnd(0, TAU), f1: rnd(0.3, 0.7), f2: rnd(0.2, 0.5), col, a: 0, mode: 'wander', t0: nowS() + (k || 0) * 1.2,
        blinkAt: nowS() + rnd(1, 5), blink: 0, r: rnd(2.2, 3.4), perch: null, life: 0 };
    }
    function behaveFlies(t, ta) {
      const dur = act.dur, W = innerWidth;
      // crossings between phones (planned, so both phones agree)
      for (const c of ast.cross || []) {
        if (!c.done && ta >= c.t) {
          c.done = true;
          if (c.from === S.role) {                         // one of ours goes over to their phone, off the top
            const pa = pos(A.me), cand = flies.filter((f) => f.mode === 'wander' && !f.perch).sort((f1, f2) => Math.abs(f1.x - pa.x) - Math.abs(f2.x - pa.x))[0];
            if (cand) { cand.mode = 'leave'; cand.vy = -40; cand.cross = true; for (const a of [A.me, A.them]) look(a, cand.x, cand.y, 1.2); }
          }
        }
        if (!c.landed && c.from !== S.role && ta >= c.t + 1.6) {   // one of theirs drops in from the top
          c.landed = true;
          const pa = pos(A.me), f = fly(clamp(pa.x + rnd(-40, 80), 20, W - 20), -12, 'wander', 0);
          f.vy = 55; f.mode = 'arrive'; f.a = 0.2; flies.push(f);
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
        // lean after it, and now and then pounce
        if (!ast.ending) {
          const dx = clamp((f.x - p.x) / sz, -1, 1), dy = clamp((f.y - p.y) / sz, -1, 1);
          a.gx = a.lean + dx * 0.16 * sz * (0.5 + a.T.curiosity); a.gy = Math.max(-0.1 * sz, dy * 0.06 * sz);
          if (t > a.next && !a.air) {
            a.next = t + rnd(3, 7) * (1.4 - a.T.energy * 0.6) * speedK();
            const near = Math.hypot(f.x - p.x, f.y - p.y) < sz * 1.3;
            if (near && Math.random() < 0.35 + 0.5 * a.T.energy) {
              crouch(a, 1); pupil(a, 1.4, 2);
              soon(a, 0.22, () => { hop(a, 0.1 + 0.05 * a.T.energy); a.vx += dx * 260; f.vx += Math.sign(f.x - p.x || 1) * rnd(90, 150); f.vy -= rnd(60, 120); soon(a, 0.6, () => { pupil(a, 1); mood(a, 0.2, 0); soon(a, 0.8, () => mood(a, 0, 0)); }); });
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
      const W = innerWidth, H = innerHeight, pa = A.me && pos(A.me), pb = A.them && pos(A.them);
      const cx = pa ? (pa.x + pb.x) / 2 : W / 2, cy = pa ? (pa.y + pb.y) / 2 - H * 0.08 : H * 0.4;
      const sp = 1 / speedK();
      for (const f of flies) {
        f.life += dt;
        if (t < f.t0) continue;
        if (f.mode === 'perch' && f.perch) {
          const p = pos(f.perch), tx = p.x + Math.sin(t * 2 + f.ph) * 4, ty = p.y - size(f.perch) * 0.47;
          f.x = mix(f.x, tx, Math.min(1, dt * 5)); f.y = mix(f.y, ty, Math.min(1, dt * 5)); f.a = Math.min(1, f.a + dt * 2);
          if (t > f.perchUntil) { f.mode = 'wander'; f.perch = null; f.vy = -90; f.vx = rnd(-60, 60); }
        } else {
          // wander: a soft curl of sines, pulled gently toward the space around the two Eyes
          const ax = Math.sin(t * f.f1 + f.ph) * 26 + Math.sin(t * f.f2 * 1.7 + f.ph * 2) * 14;
          const ay = Math.cos(t * f.f2 + f.ph * 1.3) * 22 + Math.sin(t * f.f1 * 1.3) * 10;
          if (f.mode === 'leave') { f.vy -= 70 * dt; f.vx *= 0.99; if (f.y < -24) f.dead = true; if (!f.cross) f.a = Math.max(0, f.a - dt * 0.35); }
          else {
            if (f.mode === 'arrive' && f.life > 1.6) f.mode = 'wander';
            f.vx += (ax + (cx - f.x) * 0.25) * dt; f.vy += (ay + (cy - f.y) * 0.25) * dt;
            f.vx *= 1 - dt * 0.9; f.vy *= 1 - dt * 0.9;
            f.a = Math.min(1, f.a + dt * 0.8);
          }
          f.x += f.vx * dt * sp; f.y += f.vy * dt * sp;
          if (f.mode !== 'leave') { f.x = clamp(f.x, 10, W - 10); f.y = clamp(f.y, 40, H - 60); }
        }
        // they wink: a little lid closes over each light now and then
        if (t > f.blinkAt) { f.blink = t; f.blinkAt = t + rnd(1.5, 6); }
        if (f.a <= 0 && f.mode === 'leave') f.dead = true;
      }
      flies = flies.filter((f) => !f.dead);
    }

    // ----- catch: one ball, one owner -----
    function startCatch(cur, t) {
      ast.owner = cur.init; ast.n = 0;
      const H = byRole(cur.init);
      ball = { st: 'conjure', holder: H, t0: t, x: 0, y: 0, vx: 0, vy: 0, oy: 0, ov: 0, sc: 0, spin: 0, trail: [], heldAt: t, nextPlay: t + rnd(1.5, 2.5), col: H.n.color || [200, 222, 230] };
      const hp = holdPt(H);
      for (let i = 0; i < 16; i++) { const an = rnd(0, TAU), r = rnd(30, 70); sparks.push({ x: hp.x + Math.cos(an) * r, y: hp.y + Math.sin(an) * r, tx: hp.x, ty: hp.y, vx: 0, vy: 0, t0: t + rnd(0, 0.5), d: 0.8, conv: true, col: ball.col }); }
      lookDir(H, 0, -0.9, 1.4); pupil(H, 1.3, 1.6); mood(H, 0, 0.4);
      soon(other(H), rnd(0.4, 0.9), () => { look(other(H), hp.x, hp.y, 1.5); pupil(other(H), 1.2, 1); });
      if (H === A.me) ast.holdUntil = t + rnd(2.6, 4.2) * (1.2 - 0.4 * H.T.energy);
    }
    function holdPt(a) { const p = pos(a), sz = size(a); return { x: p.x + dirTo(a) * sz * 0.04, y: p.y - sz * 0.55 }; }
    const ballR = (a) => clamp(size(a || A.me) * 0.07, 8, 15);
    function behaveCatch(t, ta) {
      if (!ball) { behaveCompany(t, ta, false, true); return; }
      const dur = act.dur, b = ball, H = b.holder, O = H ? other(H) : null;
      const late = ta >= dur;
      if (b.st === 'conjure' && t - b.t0 > 1.2 * speedK()) { b.st = 'held'; b.heldAt = t; mood(H, 0, 0); }
      if (b.st === 'held') {
        // the holder examines and plays with it; the other watches, a little impatient
        const hp = holdPt(H);
        if (t > b.nextPlay) {
          b.nextPlay = t + rnd(1.2, 2.6);
          const r = Math.random();
          if (r < 0.45) { b.ov = -rnd(220, 320); }           // a small juggle on top of its head
          else if (r < 0.7) { H.gr = 0.09 * (Math.random() < 0.5 ? -1 : 1); soon(H, 0.8, () => { H.gr = 0; }); }   // tilting to study it
          else { pupil(H, 1.35, 1.2); }
        }
        look(H, hp.x, hp.y + b.oy - 6, 0.3);
        if (O && !O.move && t > O.next) { O.next = t + rnd(1.5, 3.5); if (Math.random() < 0.7) look(O, hp.x, hp.y, rnd(1, 2)); else lookAtOther(O, 1); }
        if (late) { absorb(t); return; }
        // my Eye decides when to throw (theirs throws when their phone says so)
        if (H === A.me && ast.owner === S.role && t > ast.holdUntil && ta < dur - 4.5) throwBall(t, 0.5 + Math.random() * 0.5, false);
        if (H === A.me && ast.owner === S.role && !toldFlick && ta < dur - 6) { toldFlick = true; say('Your Eye has the ball. Flick it over, or let it throw.', false); }
      }
      if (b.st === 'drag' && late) { b.st = 'held'; absorb(t); }
      if (b.st === 'windup' && t - b.t0 > 0.42 * speedK()) launch(t);
      if (b.landed) { b.landed = false; if (late) absorb(t); }
    }
    function throwBall(t, power, user, vx, vy) {
      const b = ball; if (!b || !(b.st === 'held' || b.st === 'drag')) return;
      const H = b.holder;
      ast.n += 1; ast.owner = H === A.me ? (S.role === 'a' ? 'b' : 'a') : S.role;
      b.power = power; b.user = user;
      if (H === A.me) {
        const n = ast.n, m = { o: 'toss', id: S.id, i: act.i, n, p: Math.round(power * 100) / 100, u: user ? 1 : 0 };
        const s = S;
        send(m).then((ok) => { if (!ok && S === s && S.phase === 'live') setTimeout(() => { if (S === s && S.phase === 'live' && act && act.i === m.i) send(m); }, 2500); });
      }
      if (user) { b.st = 'windup'; b.t0 = t - 10; b.uvx = vx; b.uvy = vy; launch(t); return; }
      b.st = 'windup'; b.t0 = t;
      crouch(H, 1.1); H.gs = 0.97; pupil(H, 1.25);
      look(H, holdPt(H).x, holdPt(H).y - 40, 0.5);
    }
    function launch(t) {
      const b = ball, H = b.holder, hp = holdPt(H), d = dirTo(H);
      b.st = 'out'; b.t0 = t; b.x = hp.x; b.y = hp.y + b.oy; b.oy = 0; b.ov = 0;
      if (b.uvx != null) { b.vx = clamp(b.uvx, -900, 900); b.vy = Math.min(-900, b.uvy); b.uvx = b.uvy = null; }
      else { b.vx = d * rnd(90, 200) * (0.6 + b.power); b.vy = -(1250 + 450 * b.power); }
      H.gs = 1; H.vq -= 3.2; H.vy -= 120;                      // stretch up as it lets go
      look(H, b.x + b.vx * 0.2, 0, 0.9); mood(H, 0, 0.3); soon(H, 0.7, () => mood(H, 0, 0));
      const O = other(H); soon(O, 0.12, () => { look(O, b.x, 0, 0.8); pupil(O, 1.3, 1.5); });
      b.to = O; b.col0 = b.col;
    }
    function stepBall(t, dt) {
      const b = ball; if (!b) return;
      b.spin += dt * (b.st === 'out' || b.st === 'in' ? 9 : 1.6);
      if (b.st === 'conjure' || b.st === 'held' || b.st === 'windup') {
        const hp = holdPt(b.holder);
        if (b.st === 'conjure') b.sc = easeOut((t - b.t0) / (1.1 * speedK()));
        else b.sc = 1;
        b.ov += 1600 * dt; b.oy += b.ov * dt; if (b.oy > 0) { b.oy = 0; b.ov = b.ov > 120 ? -b.ov * 0.25 : 0; if (b.ov) { b.holder.vq += 0.6; } }
        const wob = b.st === 'windup' ? 0.4 * size(b.holder) * 0.2 : 0;
        b.x = mix(b.x || hp.x, hp.x + Math.sin(t * 1.3) * 3, Math.min(1, dt * 12)); b.y = mix(b.y || hp.y, hp.y + b.oy + wob + Math.sin(t * 2.1) * 2, Math.min(1, dt * 12));
      } else if (b.st === 'drag') {
        b.x = mix(b.x, b.px, Math.min(1, dt * 18)); b.y = mix(b.y, b.py, Math.min(1, dt * 18));
        look(b.holder, b.x, b.y, 0.25);
      } else if (b.st === 'out') {
        b.vy += 1500 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        b.trail.push([b.x, b.y]); if (b.trail.length > 9) b.trail.shift();
        if (b.y < -40 || t - b.t0 > 1.6) { b.st = 'gap'; b.t0 = t; b.trail = []; }
      } else if (b.st === 'gap') {
        // over to the other phone: it's off this screen for a moment
        if (t - b.t0 > 0.32 * speedK()) {
          b.st = 'in'; b.t0 = t; b.holder = null;
          const to = b.to, cp = holdPt(to), from = other(to), fp = pos(from);
          b.ex = clamp(cp.x + (fp.x - cp.x) * 0.3 + rnd(-20, 20), 16, innerWidth - 16); b.ey = -36; b.dur = 0.78 * speedK();
          b.fum = PLAN.fumble(S.seed, act.i, ast.n, to.T);
          b.col = to.n.color || b.col;
        }
      } else if (b.st === 'in') {
        const to = b.to, cp = holdPt(to), k = clamp((t - b.t0) / b.dur);
        b.x = mix(b.ex, cp.x, easeOut(k)); b.y = mix(b.ey, cp.y, k * k);
        b.trail.push([b.x, b.y]); if (b.trail.length > 9) b.trail.shift();
        look(to, b.x, b.y, 0.25);
        if (k > 0.55 && !b.antic) { b.antic = true; crouch(to, 0.5); pupil(to, 1.35, 1.5); mood(to, 0, 0.35); }
        if (k >= 1) land(t);
      } else if (b.st === 'fumble') {
        const to = b.to, p = pos(to), floor = p.y + size(to) * 0.5;
        b.vy += 1400 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 1 - dt * 0.8;
        if (b.y > floor) { b.y = floor; if (Math.abs(b.vy) > 160) { b.vy = -b.vy * 0.45; } else b.vy = 0; }
        b.x = clamp(b.x, 12, innerWidth - 12);
        look(to, b.x, b.y, 0.25);
        if (!b.scoop && t - b.t0 > 1.15 * speedK()) {
          b.scoop = t; const dx = clamp((b.x - p.x) / size(to), -0.6, 0.6);
          to.gx = to.lean + dx * size(to) * 0.4; hop(to, 0.05);
        }
        if (b.scoop && t - b.scoop > 0.45 * speedK()) {
          to.gx = to.lean; b.st = 'held'; b.holder = to; b.heldAt = t; b.ov = -260; b.nextPlay = t + rnd(1.2, 2.2); b.landed = true;
          const sheepish = to.T.shyness > 0.55 ? () => { lookDir(to, -dirTo(to) * 0.6, 0.5, 0.9); mood(to, 0.25, 0); } : to.T.grump > 0.55 ? () => mood(to, 0.4, 0) : () => { mood(to, 0.35, 0); hop(to, 0.04); };
          sheepish(); soon(to, 1.2, () => { mood(to, 0, 0); lookAtOther(to, 1); });
          gotIt(to, t);
        }
      } else if (b.st === 'absorb') {
        const a = b.holder, p = pos(a), e = a.n.eye, sz = size(a), k = clamp((t - b.t0) / (0.7 * speedK()));
        const px = p.x + (e ? e.gaze.x * sz * 0.18 : 0), py = p.y + (e ? e.gaze.y * sz * 0.14 : 0);
        b.x = mix(b.x, px, easeOut(k)); b.y = mix(b.y, py, easeOut(k)); b.sc = 1 - k;
        if (k >= 1) { rings.push({ x: px, y: py, t0: t, col: b.col, r0: sz * 0.12 }); pupil(a, 1.4, 2.5); a.vq += 1.8; soon(a, 0.25, () => blink(a, true)); soon(a, 1.2, () => pupil(a, 1)); ball = null; }
      }
    }
    function land(t) {
      const b = ball, to = b.to, from = other(to);
      b.antic = false; b.trail = [];
      if (b.fum) {
        b.st = 'fumble'; b.t0 = t; b.scoop = 0;
        b.vx = dirTo(from) * -rnd(120, 220); b.vy = -rnd(380, 520);
        to.vr += dirTo(to) * 4; mood(to, 0, 0.8); pupil(to, 0.75, -2.5); to.vq += 2;
        soon(from, rnd(0.3, 0.6), () => { if (from.T.grump > 0.6) { mood(from, 0.35, 0); soon(from, 1, () => mood(from, 0, 0)); } else startMove(from, 'amused', 0.6, 1.2); });
        return;
      }
      b.st = 'held'; b.holder = to; b.heldAt = t; b.ov = -180; b.nextPlay = t + rnd(1, 2); b.landed = true;
      to.vy += 140; to.vq += 2; pupil(to, 1.3, 1.2); mood(to, 0.3, 0); soon(to, 0.7, () => mood(to, 0, 0));
      rings.push({ x: b.x, y: b.y, t0: t, col: b.col, r0: ballR(to) });
      gotIt(to, t);
    }
    function gotIt(to, t) {
      if (to === A.me && ast.owner === S.role) ast.holdUntil = t + rnd(2.2, 5) * (1.25 - 0.5 * to.T.energy) * speedK();
    }
    function absorb(t) {
      if (!ball || ball.st === 'absorb') return;
      if (!ball.holder) { ballGone(); return; }
      ball.st = 'absorb'; ball.t0 = t;
      lookDir(ball.holder, 0, -0.6, 0.6);
    }
    function ballGone() {
      if (!ball) return;
      for (let i = 0; i < 10; i++) sparks.push({ x: ball.x, y: ball.y, vx: rnd(-90, 90), vy: rnd(-120, 40), t0: nowS(), d: rnd(0.5, 0.9), col: ball.col });
      ball = null;
    }
    // their phone threw: toss {i, n}
    function theirToss(m) {
      if (!S || S.phase !== 'live' || !act) return;
      const i = Number(m.i) | 0, n = Number(m.n) | 0;
      const key = i + ':' + n; if (S.tossIn[key]) return; S.tossIn[key] = 1;
      if (act.i !== i || act.kind !== 'catch') return;            // late, early or from another catch: ignore
      const ta = elapsed() - act.start;
      if (ta > act.dur + 1) return;
      if (n <= ast.n) return;                                       // an older copy
      const t = nowS();
      const TH = A.them;
      // wherever this phone last saw the ball, it is now in their Eye's hands, about to be thrown
      if (!ball) ball = { st: 'held', holder: TH, t0: t, x: holdPt(TH).x, y: holdPt(TH).y, vx: 0, vy: 0, oy: 0, ov: 0, sc: 1, spin: 0, trail: [], nextPlay: t + 9, col: TH.n.color || [200, 222, 230] };
      if (ball.st !== 'held' || ball.holder !== TH) { ball.st = 'held'; ball.holder = TH; ball.sc = 1; ball.trail = []; ball.oy = 0; ball.ov = 0; }
      ast.n = n - 1;                                                 // throwBall counts it up to n
      throwBall(t, clamp(Number(m.p) || 0.6, 0, 1), false);
      if (m.u) { TH.vq += 0.8; }                                     // a person flicked it: a little extra snap
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
        for (const a of [A.me, A.them]) { a.lean = 0; relax(a); a.doze = 0; }
        startMove(first, 'wave', 1, 1);
        soon(second, rnd(0.35, 0.7), () => startMove(second, 'wave', rnd(0.7, 1), rnd(0.85, 1.15)));
      }
    }
    function peerAway(on) {
      if (!A.them) return;
      if (on) { if (ball) absorb(nowS()); A.them.move = null; A.them.doze = 0.6; refresh(); say(`${S.nm} stepped away. Their Eye is dozing until they're back.`, true); }
      else { const a = A.them; a.doze = 0; a.lidGoal = baseLid(a); pupil(a, 1.3, 2); hop(a, 0.08); lookAtOther(a, 1.5); soon(A.me, 0.3, () => { lookAtOther(A.me, 1.5); pupil(A.me, 1.25, 1.5); hop(A.me, 0.05); }); say('', false); refresh(); }
    }
    function wokeUp() { if (A.me) { A.me.doze = 0; pupil(A.me, 1.2, 1.5); lookAtOther(A.me, 1.2); } lastT = 0; }

    // ---------- touch: tap an Eye to tease it; flick the ball when it's yours ----------
    function tease(a, fromRemote) {
      const t = nowS(); if (!a || t - a.tapAt < 0.6) return; a.tapAt = t;
      const e = a.n.eye, d = dirTo(a);
      if (e && e.poke) { try { e.poke(-d * 0.3, -0.2, t); } catch (err) {} }
      const w = a.w;
      if (w === 'hyper' || w === 'curious') hop(a, 0.08);
      else if (w === 'shy') { a.gs = 0.92; soon(a, 0.9, () => { a.gs = 1; }); }
      else if (w === 'grumpy' || w === 'smug') { a.gr = 0.07 * d; soon(a, 0.18, () => { a.gr = -0.07 * d; }); soon(a, 0.36, () => { a.gr = 0; }); }
      else if (w === 'dramatic') startMove(a, 'wobble', 0.9, 1.1);
      else if (w === 'sleepy') { a.doze = 0; a.vy -= 60; soon(a, 0.6, () => blink(a, true)); }
      else { a.vq += 2.2; }
      a.doze = 0;
      const o = other(a);
      if (o && !o.move) soon(o, rnd(0.25, 0.5), () => { lookAtOther(o, 1.4); if (Math.random() < 0.55 && o.T.grump < 0.65) startMove(o, 'amused', 0.5, 1.2); });
      if (!fromRemote && S && S.phase === 'live' && Date.now() - S.lastTapSent > 4000) { S.lastTapSent = Date.now(); send({ o: 'tap', id: S.id, w: a.role }); }
    }
    function remoteTap(role) { if (!A.me) return; tease(byRole(role), true); }
    function bindInput() {
      const el = document.getElementById('eyesContact'); if (!el) return;
      let drag = null;
      const local = (ev) => { const r = el.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
      const ignore = (ev) => !!(ev.target && ev.target.closest && ev.target.closest('.ec-top, .ec-panel, .ec-drawer, .ec-guide, .ec-toast'));
      const down = (ev) => {
        if (!S || S.phase !== 'live' || !A.me || ignore(ev)) return;
        const p = local(ev);
        if (ball && ball.holder === A.me && ball.st === 'held' && Math.hypot(p.x - ball.x, p.y - ball.y) < Math.max(46, ballR() * 3.2)) {
          drag = { id: ev.pointerId, pts: [[p.x, p.y, ev.timeStamp]] };
          ball.st = 'drag'; ball.px = p.x; ball.py = p.y;
          try { el.setPointerCapture(ev.pointerId); } catch (e) {}
          ev.preventDefault();
          return;
        }
        for (const a of [A.me, A.them]) { const q = pos(a); if (Math.hypot(p.x - q.x, p.y - q.y) < size(a) * 0.45) { tease(a, false); return; } }
      };
      const move = (ev) => {
        if (!drag || ev.pointerId !== drag.id || !ball || ball.st !== 'drag') return;
        const p = local(ev); ball.px = p.x; ball.py = p.y;
        drag.pts.push([p.x, p.y, ev.timeStamp]); if (drag.pts.length > 8) drag.pts.shift();
      };
      const up = (ev) => {
        if (!drag || ev.pointerId !== drag.id) return;
        const pts = drag.pts; drag = null;
        if (!ball || ball.st !== 'drag') return;
        const a = pts[0], b = pts[pts.length - 1], dtm = Math.max(16, b[2] - a[2]) / 1000;
        const vx = (b[0] - a[0]) / dtm, vy = (b[1] - a[1]) / dtm;
        const ta = elapsed() - act.start;
        if (vy < -380 && Math.hypot(vx, vy) > 480 && act.kind === 'catch' && ta < act.dur - 2.5 && ast.owner === S.role) {
          throwBall(nowS(), clamp(-vy / 2400, 0.3, 1), true, vx * 0.6, vy * 0.9);
        } else { ball.st = 'held'; ball.ov = -160; A.me.vq += 0.8; lookAtOther(A.me, 0.8); }
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
    // ---------- the panel while it runs: a quiet line and a way out ----------
    function panel(p) {
      if (!S) return false;
      const ph = S.phase, live = ph === 'live', nm = esc(S.nm);
      const label = ph === 'asking' ? (S.askSent ? `Waiting for ${nm}'s Eye…` : 'Inviting…') : ph === 'answering' ? 'Heading over…'
        : ph === 'leaving' ? 'Saying goodbye…' : live ? (S.peerAway ? `${nm} stepped away` : `Hanging out with ${nm}`) : '';
      const tip = live && nowS() < tipUntil ? '<p class="eh-tip">Leave them be, or tap an Eye to tease it. When the ball is yours, flick it over.</p>' : '';
      const btn = ph === 'asking' ? 'Never mind' : ph === 'answering' || live ? 'Say goodbye' : '';
      p.innerHTML = `<div class="eh-live${ph === 'over' ? ' eh-over' : ''}"><p class="ec-hint">${label}</p>${tip}${btn ? `<button type="button" class="ec-btn ec-small" data-h="bye">${btn}</button>` : ''}</div>`;
      const b = p.querySelector('[data-h=bye]'); if (b) b.onclick = () => sayGoodbye();
      if (tip) setTimeout(() => { const el = p.querySelector('.eh-tip'); if (el) el.classList.add('eh-tip-out'); }, Math.max(0, (tipUntil - nowS()) * 1000));
      return true;
    }

    // ---------- drawing (the effects layer) ----------
    function sky(g, t, tools) {
      if (!fx || !fx.isConnected) { if (S && S.phase !== 'asking' && S.phase !== 'answering' && attached && !attached.invite) ensureFx(); if (!fx) return; }
      if (!sizeFx()) return;
      const c = fg;
      const any = !!(S && A.me && (ball || flies.length || sparks.length || rings.length || motes.length));
      if (!any) { if (drew) { c.clearRect(0, 0, fW, fH); drew = false; } return; }
      c.clearRect(0, 0, fW, fH); drew = true;
      c.globalCompositeOperation = 'lighter';
      const rgba = tools.rgba;
      // arrival motes
      motes = motes.filter((m) => t - m.t0 < m.d + 0.2);
      for (const m of motes) {
        const k = clamp((t - m.t0) / m.d); if (k <= 0) continue;
        const p = m.tx(), x = mix(m.x, p.x, easeOut(k)), y = mix(m.y, p.y, easeOut(k));
        glow(c, x, y, 2 + 2 * (1 - k), m.col, 0.8 * Math.sin(Math.PI * k), rgba);
      }
      // fireflies: little winking almonds of light, tinted by both Eyes
      for (const f of flies) {
        if (t < f.t0 || f.a <= 0.01) continue;
        const bk = f.blink ? clamp((t - f.blink) / 0.22) : 1, lid = bk < 1 ? Math.sin(Math.PI * bk) : 0;
        const tw = 0.75 + 0.25 * Math.sin(t * 3 + f.ph), a = f.a * tw * (1 - 0.85 * lid);
        glow(c, f.x, f.y, f.r * 4.5, f.col, 0.28 * a, rgba);
        c.fillStyle = rgba(f.col.map((v) => mix(v, 255, 0.5)), 0.95 * a);
        c.beginPath(); c.ellipse(f.x, f.y, f.r * 1.25, Math.max(0.3, f.r * 0.62 * (1 - lid)), Math.sin(t * 0.7 + f.ph) * 0.4, 0, TAU); c.fill();
      }
      // the ball, its trail and catch ripples
      if (ball) {
        const b = ball, R = ballR(b.holder || b.to) * (b.sc == null ? 1 : b.sc);
        if (b.st !== 'gap' && R > 0.3) {
          for (let i = 0; i < b.trail.length; i++) { const [x, y] = b.trail[i], k = (i + 1) / b.trail.length; glow(c, x, y, R * (0.5 + 0.6 * k), b.col, 0.16 * k, rgba); }
          glow(c, b.x, b.y, R * 3.4, b.col, 0.32, rgba);
          const gr = c.createRadialGradient(b.x - R * 0.3, b.y - R * 0.3, R * 0.1, b.x, b.y, R);
          gr.addColorStop(0, 'rgba(255,255,255,0.98)'); gr.addColorStop(0.45, rgba(b.col.map((v) => mix(v, 255, 0.55)), 0.95)); gr.addColorStop(1, rgba(b.col, 0.15));
          c.fillStyle = gr; c.beginPath(); c.arc(b.x, b.y, R, 0, TAU); c.fill();
          // a tiny glint orbits it, so it reads as spinning
          c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(b.x + Math.cos(b.spin) * R * 0.55, b.y + Math.sin(b.spin) * R * 0.3, Math.max(0.8, R * 0.14), 0, TAU); c.fill();
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
      c.globalCompositeOperation = 'source-over';
    }
    function glow(c, x, y, r, col, a, rgba) {
      if (a <= 0.003 || r <= 0) return;
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }

    return { attach, attachInvite, dropInvite, detach, refresh, start, end, theirToss, remoteTap, farewell, peerAway, wokeUp,
      _state: () => ({ act, ball: ball && { st: ball.st, holder: ball.holder && ball.holder.key, n: ast.n, owner: ast.owner }, flies: flies.length, me: A.me && { x: A.me.x, y: A.me.y, q: A.me.q, r: A.me.r, move: A.me.move && A.me.move.name }, them: A.them && { move: A.them.move && A.them.move.name } }),
      _flick: (vx, vy) => { if (ball && ball.holder === A.me && ball.st === 'held') { ball.st = 'drag'; throwBall(nowS(), 0.8, true, vx, vy); return true; } return false; },
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
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ec-hangout' + (why ? ' ec-hangout-off' : '');
    btn.innerHTML = '<i class="ec-hangout-g" aria-hidden="true"><i></i></i><span>Hang out</span>';
    btn.setAttribute('aria-label', why ? `Hang out (not available): ${why}` : `Hang out: invite ${friendName(f)}'s Eye over`);
    btn.onclick = () => {
      if (why) { sayIt(why); return; }
      if (S) { sayIt('One Hangout at a time.'); return; }
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
      skipTo: (sec) => { if (S && S.t0ms) S.t0ms = Date.now() - sec * 1000; } }
  };
})(window);
