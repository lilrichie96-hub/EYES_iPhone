/* EYES 4.2 · Battle Lite: two Eyes, one quick cosmic duel. Shared by Android and iPhone.
   Loads after eyes-friends.js and eyes-contact.js.

   What it is: a side activity of Eye Contact. A friend's Eye can be challenged from the Meeting Space, they
   accept or decline, then both phones play a short turn-based duel with their real Eyes. Nothing it does is
   saved: no stats, no levels, no penalties. Afterwards both Eyes go straight back to normal life.

   The rules (RULES below) are a small pure function. Both phones run it on the same inputs, so they always
   agree without either phone being "the server":
     - HP 90 each, Charge 0–4 (start 1). One action per round, chosen at the same time:
       Glare (12–16 damage) · Blink (takes ×0.3, +1 Charge) · Charge (+2 Charge, takes ×1.25) ·
       Special (costs 3 Charge, one per temperament family, see ARCH).
     - If both Eyes drop in the same round, the one with more left standing wins; a perfect tie is a draw.
     - From round 8 everything hits ×1.5 ("the cosmos grows impatient"); round 12 is the last.
     - Randomness comes from a seed both phones built together (half each), mixed with the round.
     - Every move message carries a hash of the state before that round. If the two phones ever disagree,
       the duel ends with no winner rather than showing something that isn't true.

   Protocol: EyesFriends.duel(f, d), kind 'duel', only for friends that advertised the 'duel' capability.
     d.o = 'ask' {id, sd, ar, nm} · 'yes' {id, sd, ar, nm} · 'no' {id, why} · 'cancel' {id} ·
           'mv' {id, r, m, h} · 'bye' {id}
   Honesty: a challenge says "sent" only when the relay took it, the duel starts only on a real 'yes', an
   opponent's move is only ever shown after both moves are in, and silence is reported as silence.

   Sound: synthesized in code (no files), only inside a duel and as one soft chirp when a challenge arrives. On by
   default; the speaker button in the duel's header mutes it and is remembered (eyes.duel.sound). Never on the home screen.

   Phase 2 hooks (not built): EyesDuel.on('end', fn) gets {friend, result, rounds, mySpecial, theirSpecial};
   HOOKS.rematch / HOOKS.history are left null on purpose. */
'use strict';
(function (root) {
  // ======================================================================================
  // RULES: pure, deterministic, shared by both phones
  // ======================================================================================
  const RULES = (() => {
    const HP = 90, MAXC = 4, COST = 3, START_C = 1, SUDDEN = 8, CAP = 12;
    const ARCH = { grumpy: 'glower', smug: 'glower', shy: 'peek', calm: 'clear', curious: 'clear', hyper: 'flurry', dramatic: 'flurry', sleepy: 'dream' };
    const SPECIAL = { grumpy: 'Stink Eye', smug: 'Smug Stare', shy: 'Peekaboo', calm: 'Clear Sight', curious: 'Deep Look', hyper: 'Flicker Flurry', dramatic: 'Razzle Dazzle', sleepy: 'Dream Beam' };
    const HINT = { glower: 'one huge glare', peek: 'hide, then strike back', clear: 'a true hit that heals', flurry: 'a burst of tiny glares', dream: 'doze now, beam next turn' };
    const MOVES = ['glare', 'blink', 'charge', 'special'];
    const ATTACKS = ['glare', 'glower', 'clear', 'flurry', 'beam'];
    const word = (w) => (ARCH[w] ? w : 'calm');
    function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function seedOf(sa, sb) { let h = 0x811c9dc5; const s = String(sa) + '·' + String(sb); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    const side = () => ({ hp: HP, c: START_C, dream: 0 });
    function start() { return { r: 1, a: side(), b: side(), over: null, why: null }; }
    function legal(st, m) {
      if (st.dream) return 'beam';
      if (!MOVES.includes(m)) return 'blink';
      if (m === 'special' && st.c < COST) return 'blink';
      return m;
    }
    // v2 adds its version to the hash, so two phones that somehow disagree on the rules stop with no winner
    const hash = (s, rv) => s.r + ':' + [s.a, s.b].map((x) => x.hp + '.' + x.c + '.' + x.dream).join('|') + (rv >= 2 ? '|v' + rv : '');
    const clone = (s) => ({ r: s.r, a: { ...s.a }, b: { ...s.b }, over: s.over, why: s.why });
    function act(m, w) { return m === 'special' ? ARCH[word(w)] : m; }
    function guard(a) { return a === 'blink' ? 0.3 : a === 'charge' ? 1.25 : a === 'dream' ? 0.5 : a === 'peek' ? 0 : 1; }
    // rv: the rules version both phones agreed on (1 = 4.2.0/4.2.1, 2 = 4.2.2). Both phones always use the same one.
    function hit(X, Y, rnd, mult, rv) {
      const ev = { act: X.act, m: X.m, dmg: 0, hits: [], heal: 0, counter: false, poke: false, blocked: Y.act === 'blink', dodged: false };
      const gY = guard(Y.act), dmg = (base, f) => Math.round(base * f * mult);
      switch (X.act) {
        case 'glare': ev.dmg = dmg(12 + Math.floor(rnd() * 5), gY); break;
        case 'glower': ev.dmg = dmg(32 + Math.floor(rnd() * 5), Y.act === 'blink' ? 0.5 : gY); break;
        case 'clear': ev.dmg = dmg(22, Y.act === 'blink' ? 1 : gY); ev.heal = 10; ev.pierce = Y.act === 'blink'; break;
        case 'flurry': for (let i = 0; i < 4; i++) { const d = dmg(6 + Math.floor(rnd() * 5), Y.act === 'blink' ? 0.6 : gY); ev.hits.push(d); ev.dmg += d; } break;
        case 'beam': ev.dmg = dmg(36, Y.act === 'blink' ? 0.5 : gY); break;
        case 'peek':
          if (ATTACKS.includes(Y.act)) { ev.dmg = dmg(22, 1); ev.counter = true; }
          // 4.2.2 (rules v2): a poke peeks past a Blink and is a little sharper; v1 is unchanged
          else if (rv >= 2) { ev.dmg = dmg(10, Y.act === 'blink' ? 1 : gY); ev.poke = true; ev.pierce = Y.act === 'blink'; }
          else { ev.dmg = dmg(8, gY); ev.poke = true; }
          break;
        case 'dream': ev.heal = 6; break;
        default: break;
      }
      if (ATTACKS.includes(X.act) && gY === 0) ev.dodged = true;
      return ev;
    }
    // One round. Both moves are applied at the same moment, so nobody needs to go first.
    function resolve(s0, ma, mb, seed, wa, wb, rv = 1) {
      const s = clone(s0), rnd = mulberry((seed ^ Math.imul(s.r, 2654435761)) >>> 0), mult = s.r >= SUDDEN ? 1.5 : 1;
      const A = { st: s.a, w: word(wa) }, B = { st: s.b, w: word(wb) };
      A.m = legal(s.a, ma); B.m = legal(s.b, mb);
      A.act = A.m === 'beam' ? 'beam' : act(A.m, A.w); B.act = B.m === 'beam' ? 'beam' : act(B.m, B.w);
      const ea = hit(A, B, rnd, mult, rv), eb = hit(B, A, rnd, mult, rv);
      [[A, ea, eb], [B, eb, ea]].forEach(([X, mine, theirs]) => {
        const st = X.st;
        if (X.m === 'special' && X.act !== 'beam') st.c -= COST;
        // 4.2.2 (rules v2): a Peekaboo that found nothing to strike back at keeps most of its Charge
        if (rv >= 2 && X.act === 'peek' && mine.poke) { st.c += 2; mine.refund = 2; }
        if (X.act === 'charge') st.c += 2;
        if (X.act === 'blink') st.c += 1;
        st.c = Math.max(0, Math.min(MAXC, st.c));
        st.dream = X.act === 'dream' ? 1 : 0;
        mine.gain = X.act === 'charge' ? 2 : X.act === 'blink' ? 1 : 0;
        X.raw = Math.min(HP, st.hp + mine.heal) - theirs.dmg;
        st.hp = Math.max(0, X.raw);
      });
      // both down at once: whoever had more left standing takes it (a true tie is a draw)
      if (s.a.hp <= 0 && s.b.hp <= 0) { s.over = A.raw === B.raw ? 'draw' : A.raw > B.raw ? 'a' : 'b'; s.why = 'ko'; }
      else if (s.a.hp <= 0) { s.over = 'b'; s.why = 'ko'; }
      else if (s.b.hp <= 0) { s.over = 'a'; s.why = 'ko'; }
      else if (s.r >= CAP) { s.over = s.a.hp === s.b.hp ? 'draw' : s.a.hp > s.b.hp ? 'a' : 'b'; s.why = 'time'; }
      const r = s.r;
      if (!s.over) s.r++;
      return { state: s, round: r, sudden: mult > 1, ev: { a: ea, b: eb } };
    }
    const VERSION = 2;                       // the newest rules this phone can play
    return { HP, MAXC, COST, START_C, SUDDEN, CAP, ARCH, SPECIAL, HINT, MOVES, VERSION, word, start, legal, hash, resolve, seedOf, mulberry, act };
  })();

  // ======================================================================================
  // helpers
  // ======================================================================================
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const F = () => root.EyesFriends;
  const D = () => root.HavenDNA;
  const nowS = () => performance.now() / 1000;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
  const ID_RE = /^[A-Za-z0-9_-]{6,16}$/;
  const SD_RE = /^[A-Za-z0-9_-]{6,16}$/;
  const rid = (n) => { const a = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (const x of a) s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[x & 63]; return s; };
  // 4.2.2: a challenge to an Eye that understands 'duel2' stays open 90 s (the live window of the protocol)
  // and is re-sent every 20 s, so an Eye that opens EYES partway through still sees it. Older Eyes keep 40 s.
  const ASK_MS = 40000, ASK2_MS = 90000, ASK_RESEND_MS = 20000, PICK_S = 12, QUIET_MS = 35000, RESEND_MS = 5000;
  const listeners = {};
  const emit = (n, ...a) => (listeners[n] || []).forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } });
  const HOOKS = { rematch: null, history: null };          // Phase 2: deliberately empty

  function motionMode() {
    try { const d = root.Haven && Haven.diagnostics(); if (d && d.motion === false) return 'off'; if (d && d.gentle) return 'gentle'; } catch (e) {}
    if (document.documentElement.dataset.motion === 'off') return 'off';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'gentle';
    return 'on';
  }
  const myDna = () => (D() && D().has() ? D().dna() : null);
  const myWord = () => { const d = myDna(); return RULES.word(d && d.firstWord); };
  const myName = () => { const d = myDna(); return (d && d.name) || 'Your Eye'; };
  const friendName = (f) => (f && (f.nick || (f.profile && f.profile.name))) || 'Their Eye';
  function friendDna(f) { if (!f || !f.profile || !D()) return null; try { return D().friendDNA(f.profile); } catch (e) { return null; } }
  function colorOf(dna) { try { return D().mapColor(111, 193, 202, dna); } catch (e) { return [111, 193, 202]; } }
  const findFriend = (code) => (F() ? (F().byCode ? F().byCode(code) : F().list().find((x) => x.code === code)) : null);
  const askWindow = (f) => (F() && F().duelSupports && F().duelSupports(f, 'duel2') ? ASK2_MS : ASK_MS);
  // where to go back to after a duel: the Meeting Space node (the native link's companion lives at 'native')
  const homeKey = (f) => (f && f.companion && f.parent === 'native' ? 'native' : f && f.companion ? f.parent : f && f.code);
  const canDuel = (f) => !!(f && f.peer && F() && F().supports(f, 'duel') && F().CAPS.includes('duel'));

  // ======================================================================================
  // the session (one duel at a time)
  // ======================================================================================
  let S = null;              // current duel session
  let call = null;           // incoming challenge card
  let timers = [];
  const later = (fn, ms) => { const id = setTimeout(() => { timers = timers.filter((x) => x !== id); fn(); }, ms); timers.push(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const send = (f, d) => (F() ? F().duel(f, d) : Promise.resolve(false));

  function newSession(f, role, id) {
    return { f, code: f.code, role, id, phase: 'asking', sdMine: rid(10), sdTheirs: null, wMine: myWord(), wTheirs: 'calm', nmTheirs: friendName(f),
      state: RULES.start(), seed: 0, mine: {}, theirs: {}, their: {}, lockedAt: 0, lastHeard: Date.now(), result: null, returnTo: null, startedAt: 0, rv: 1 };
  }
  const roleKey = (mine) => (mine ? S.role : S.role === 'a' ? 'b' : 'a');
  const meSt = () => S.state[roleKey(true)], themSt = () => S.state[roleKey(false)];

  // ---------- challenge (from the Meeting Space) ----------
  function challenge(f) {
    if (!f || S) return false;
    if (!canDuel(f)) return false;
    Sfx.unlock();
    const fromContact = !!(root.EyesContact && EyesContact.isOpen());
    S = newSession(f, 'a', rid(10));
    S.returnTo = fromContact ? homeKey(f) : null;
    S.window = askWindow(f);
    if (fromContact) EyesContact.close();
    Scene.open();
    Scene.asking();
    if (F().probe) F().probe(f);
    const ask = { o: 'ask', id: S.id, sd: S.sdMine, ar: S.wMine, nm: myName().slice(0, 16) };
    if (S.window === ASK2_MS) { ask.w = 90; ask.rv = RULES.VERSION; }     // older Eyes ignore both and play v1
    const s = S;
    send(f, ask).then((ok) => {
      if (S !== s || S.phase !== 'asking') return;
      if (!ok) { Scene.askFailed(); return; }
      S.askedAt = Date.now();
      Scene.askSent(); Sfx.play('look');
      if (S.window === ASK2_MS) {
        const again = () => later(() => { if (S === s && S.phase === 'asking') { send(S.f, ask); again(); } }, ASK_RESEND_MS);
        again();
      }
      S.askT = later(() => {
        if (S !== s || S.phase !== 'asking') return;
        send(S.f, { o: 'cancel', id: S.id });
        Scene.askTimeout();
      }, S.window);
    });
    return true;
  }
  function cancelAsk() {
    if (!S || S.phase !== 'asking') return;
    send(S.f, { o: 'cancel', id: S.id });
    finish();
  }

  // ---------- incoming ----------
  function onDuel(f, d, t) {
    if (!d || typeof d.o !== 'string' || !ID_RE.test(String(d.id || ''))) return;
    const o = d.o, id = d.id;
    if (f && f.companion && f.parent === 'native' && !f.profile && root.HavenFriend && HavenFriend.profile) { try { f.profile = HavenFriend.profile() || null; } catch (e) {} }
    if (S && S.code === f.code) S.lastHeard = Date.now();
    if (o === 'ask') {
      if (!SD_RE.test(String(d.sd || ''))) return;
      if (Date.now() - t > (d.w === 90 ? ASK2_MS : ASK_MS)) return;
      if (call && call.id === id && call.code === f.code) return;          // 4.2.2: the same challenge, re-sent
      if (answered.has(id)) return;                                        // already declined or faded here
      if (S && S.id === id) return;
      if (S && S.code === f.code && S.phase === 'asking') {
        // both reached at once: the smaller id is the one duel; the other side quietly drops its own
        if (id < S.id) { clearTimeout(S.askT); const back = S.returnTo; S = newSession(f, 'b', id); S.returnTo = back || homeKey(f); Scene.toast('You both reached for a duel at once.'); return accept(d, true); }
        return;
      }
      if (S || (call && call.code !== f.code)) { send(f, { o: 'no', id, why: 'busy' }); return; }
      showCall(f, d, t);
      return;
    }
    if (o === 'cancel') {
      if (call && call.id === id) hideCall(`${friendName(f)} withdrew the challenge.`);
      if (S && S.id === id && S.phase === 'asking') finish(null);
      // 4.2.2: their challenge had already faded on their side as we said yes: no duel, said plainly
      else if (S && S.id === id && S.role === 'b' && ['intro', 'pick', 'wait'].includes(S.phase) && S.state.r === 1 && !S.their[1]) end(null, 'faded');
      return;
    }
    if (!S || S.id !== id || S.code !== f.code) return;
    if (o === 'yes' && S.role === 'a' && S.phase === 'asking') {
      if (!SD_RE.test(String(d.sd || ''))) return;
      clearTimeout(S.askT);
      S.sdTheirs = d.sd; S.wTheirs = RULES.word(d.ar);
      S.seed = RULES.seedOf(S.sdMine, S.sdTheirs);
      // the answer says which rules it will play: the lower of the two phones' versions
      S.rv = d.rv === 2 && S.window === ASK2_MS ? 2 : 1;
      begin();
      return;
    }
    if (o === 'no' && S.phase === 'asking') { clearTimeout(S.askT); Scene.declined(d.why === 'busy'); return; }
    if (o === 'mv') {
      const r = Number(d.r) | 0;
      if (r < 1 || r > RULES.CAP || !RULES.MOVES.concat('beam').includes(d.m) || typeof d.h !== 'string') return;
      if (S.their[r]) return;
      S.their[r] = { m: d.m, h: d.h };
      if (S.phase === 'pick' && r === S.state.r) Scene.theyChose();
      if (S.phase === 'wait' && r === S.state.r) settle();
      return;
    }
    if (o === 'bye' && ['intro', 'pick', 'wait', 'play'].includes(S.phase)) { end(S.role, 'bye'); return; }
  }
  function showCall(f, d, t) {
    hideCall();
    // measured on this phone's clock, so a phone whose clock runs fast or slow can't make it vanish early
    const left = Math.max(5000, (d.w === 90 ? ASK2_MS : ASK_MS) - Math.max(0, Date.now() - t));
    call = { code: f.code, id: d.id, d, f, t, until: Date.now() + left };
    Call.show(call);
    Sfx.play('look');
    call.timer = setTimeout(() => { if (call && call.id === d.id) hideCall(); }, Math.max(1000, call.until - Date.now()));
  }
  const answered = new Set();             // 4.2.2: challenge ids this phone already turned down (re-sends stay quiet)
  function hideCall(note) { if (!call) return; clearTimeout(call.timer); answered.add(call.id); if (answered.size > 40) answered.delete(answered.values().next().value); Call.hide(note); call = null; }
  function decline() {
    if (!call) return;
    send(call.f, { o: 'no', id: call.id, why: 'no' });
    hideCall();
  }
  function acceptCall() {
    if (!call || S) return;
    Sfx.unlock();
    const c = call; hideCall();
    if (Date.now() > c.until) { flash('That challenge already faded.'); return; }
    const fromContact = !!(root.EyesContact && EyesContact.isOpen());
    S = newSession(c.f, 'b', c.id);
    S.returnTo = homeKey(c.f);
    if (fromContact) EyesContact.close();
    accept(c.d, false);
  }
  function accept(d, crossed) {
    S.sdTheirs = d.sd; S.wTheirs = RULES.word(d.ar);
    S.rv = d.rv === 2 ? Math.min(2, RULES.VERSION) : 1;
    S.seed = RULES.seedOf(S.sdTheirs, S.sdMine);                 // challenger's half first, on both phones
    if (!Scene.isOpen()) Scene.open();
    Scene.answering(crossed);
    const s = S;
    const yes = { o: 'yes', id: S.id, sd: S.sdMine, ar: S.wMine, nm: myName().slice(0, 16) };
    if (S.rv >= 2) yes.rv = S.rv;
    send(S.f, yes).then((ok) => {
      if (S !== s) return;
      if (!ok) { Scene.answerFailed(); return; }
      begin();
    });
  }

  // ---------- the match ----------
  function begin() {
    S.phase = 'intro'; S.startedAt = Date.now(); S.lastHeard = Date.now();
    Scene.intro(() => { if (S && S.phase === 'intro') round(); });
  }
  function round() {
    if (!S) return;
    S.phase = 'pick';
    const r = S.state.r;
    Scene.pick(r);
    const forced = RULES.legal(meSt(), 'glare') === 'beam';
    if (forced) { later(() => { if (S && S.phase === 'pick' && S.state.r === r) lock('beam', 'auto'); }, motionMode() === 'off' ? 300 : 1300); return; }
    S.pickT = later(() => { if (S && S.phase === 'pick' && S.state.r === r) lock('blink', 'timeout'); }, (motionMode() === 'gentle' ? PICK_S + 3 : PICK_S) * 1000);
  }
  function lock(m, how) {
    if (!S || S.phase !== 'pick') return;
    clearTimeout(S.pickT);
    const r = S.state.r, mv = RULES.legal(meSt(), m);
    S.mine[r] = mv; S.lockedAt = Date.now();
    const msg = { o: 'mv', id: S.id, r, m: mv, h: RULES.hash(S.state, S.rv) };
    const push = () => send(S.f, msg);
    push();
    S.phase = 'wait';
    Scene.locked(mv, how);
    // keep saying it until their move arrives; silence for long enough is reported as silence
    const s = S;
    const resend = () => later(() => {
      if (S !== s || S.phase !== 'wait' || S.state.r !== r) return;
      if (Date.now() - S.lockedAt > QUIET_MS) return quiet();
      push(); resend();
    }, RESEND_MS);
    resend();
    if (S.their[r]) settle();
  }
  function settle() {
    if (!S || S.phase !== 'wait') return;
    const r = S.state.r, theirs = S.their[r];
    if (!theirs || !S.mine[r]) return;
    if (theirs.h !== RULES.hash(S.state, S.rv)) { end(null, 'desync'); return; }
    const ma = S.role === 'a' ? S.mine[r] : theirs.m, mb = S.role === 'a' ? theirs.m : S.mine[r];
    const wa = S.role === 'a' ? S.wMine : S.wTheirs, wb = S.role === 'a' ? S.wTheirs : S.wMine;
    const out = RULES.resolve(S.state, ma, mb, S.seed, wa, wb, S.rv);
    S.phase = 'play';
    const before = S.state; S.state = out.state;
    Scene.play(out, before, () => {
      if (!S || S.phase !== 'play') return;
      if (out.state.over) end(out.state.over === 'draw' ? 'draw' : out.state.over, out.state.why);
      else round();
    });
  }
  // 4.2.2: silence is never a win. The other phone can't see the same silence, so claiming victory here
  // could show two winners. It is reported as silence, with no winner.
  function quiet() {
    if (!S) return;
    const online = F() && F().connection(S.f) === 'online';
    end(null, online ? 'quiet' : 'lost');
  }
  function surrender() {
    if (!S) return;
    if (S.phase === 'asking') return cancelAsk();
    if (S.phase === 'over') return finish(S.returnTo);
    send(S.f, { o: 'bye', id: S.id });
    end(S.role === 'a' ? 'b' : 'a', 'bow');
  }
  // winner: 'a' | 'b' | 'draw' | null (no contest)
  function end(winner, why) {
    if (!S || S.phase === 'over') return;
    clearTimeout(S.pickT);
    S.phase = 'over';
    const res = winner === 'draw' ? 'draw' : winner == null ? 'none' : winner === S.role ? 'win' : 'loss';
    S.result = { res, why };
    Scene.over(res, why);
    emit('end', { friend: S.f, result: res, why, rounds: S.state.r, mySpecial: RULES.SPECIAL[S.wMine], theirSpecial: RULES.SPECIAL[S.wTheirs] });
  }
  function finish(returnTo) {
    clearTimers();
    const back = returnTo !== undefined ? returnTo : S && S.returnTo;
    S = null;
    Scene.close();
    if (back && root.EyesContact && (back === 'native' || findFriend(back))) EyesContact.meet(back);
    else { try { root.Haven && Haven.holdHome && Haven.holdHome(false); } catch (e) {} }
  }
  function flash(text) { if (root.EyesSocial && EyesSocial.caption) EyesSocial.caption(text); }

  // leaving EYES mid-duel: when it comes back after a while, that duel is over
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); Sfx.sleep(); return; }
    const away = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
    if (call && Date.now() > call.until) hideCall();
    if (!S) return;
    Scene.wake();
    if (away > 25000) {
      if (S.phase === 'asking') { send(S.f, { o: 'cancel', id: S.id }); Scene.askTimeout(); }
      else if (['intro', 'pick', 'wait', 'play'].includes(S.phase)) { send(S.f, { o: 'bye', id: S.id }); end(null, 'away'); }
    }
  });

  // ======================================================================================
  // sound: synthesized, nothing loaded. Only inside a duel (and one soft chirp for a challenge), never the home screen.
  // On by default; the speaker button in the duel remembers your choice (eyes.duel.sound).
  // ======================================================================================
  const Sfx = (() => {
    const KEY = 'eyes.duel.sound';
    let ac = null, master = null, noiseBuf = null, on = true;
    try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) {}
    const played = [];                                   // for tests
    function ensure() {
      if (!on) return null;
      try {
        if (!ac) {
          const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
          ac = new AC();
          master = ac.createGain(); master.gain.value = 0.42;
          const comp = ac.createDynamicsCompressor(); master.connect(comp).connect(ac.destination);
          noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
          const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ac.state === 'suspended') ac.resume();
      } catch (e) { ac = null; }
      return ac;
    }
    // call from a tap so iPhone lets the page make sound
    function unlock() { if (on) ensure(); }
    const env = (g, t, a, peak, rel) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel); };
    function tone(t, { f0, f1, dur, type = 'sine', peak = 0.3, a = 0.008, vib = 0, vibHz = 0, filter = null }) {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      let node = o;
      if (filter) { const fl = ac.createBiquadFilter(); fl.type = filter.type; fl.Q.value = filter.q || 1; fl.frequency.setValueAtTime(filter.f0, t); if (filter.f1) fl.frequency.exponentialRampToValueAtTime(filter.f1, t + dur); node.connect(fl); node = fl; }
      if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = vibHz; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + a + 0.05); }
      env(g, t, a, peak, dur); node.connect(g).connect(master); o.start(t); o.stop(t + a + dur + 0.05);
    }
    function noise(t, dur, type, f0, f1, peak, q = 1) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ac.createGain(); env(g, t, 0.004, peak, dur);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05);
    }
    const SOUNDS = {
      // a curious little "hm?": a challenge going out or arriving
      look: (t) => { tone(t, { f0: 520, f1: 600, dur: 0.12, type: 'triangle', peak: 0.16 }); tone(t + 0.13, { f0: 640, f1: 820, dur: 0.16, type: 'triangle', peak: 0.16 }); },
      // the two Eyes square up: a low swell, then "Stare!"
      intro: (t) => { [55, 55.7, 82.5].forEach((hz, i) => tone(t, { f0: hz, f1: hz * 1.5, dur: 1.3, type: i === 2 ? 'triangle' : 'sawtooth', peak: 0.12, a: 0.5, filter: { type: 'lowpass', f0: 160, f1: 1400, q: 5 } })); noise(t + 0.3, 0.6, 'bandpass', 400, 3000, 0.08, 2); },
      stare: (t) => { tone(t, { f0: 880, dur: 0.5, type: 'triangle', peak: 0.2 }); tone(t, { f0: 1320, dur: 0.6, type: 'sine', peak: 0.12 }); tone(t + 0.06, { f0: 1760, dur: 0.4, type: 'sine', peak: 0.06 }); },
      lock: (t) => { tone(t, { f0: 1200, f1: 900, dur: 0.05, type: 'triangle', peak: 0.1 }); },
      // moves
      glare: (t) => { tone(t, { f0: 1100, f1: 260, dur: 0.22, type: 'sawtooth', peak: 0.3, filter: { type: 'lowpass', f0: 4200, f1: 900, q: 4 } }); tone(t, { f0: 660, f1: 180, dur: 0.18, type: 'triangle', peak: 0.16 }); noise(t, 0.08, 'highpass', 3000, 6000, 0.1); },
      blink: (t) => { tone(t, { f0: 330, f1: 520, dur: 0.35, type: 'sine', peak: 0.14, a: 0.05 }); tone(t + 0.05, { f0: 660, f1: 990, dur: 0.4, type: 'sine', peak: 0.06, a: 0.08, vib: 8, vibHz: 9 }); },
      charge: (t) => { tone(t, { f0: 220, f1: 880, dur: 0.75, type: 'triangle', peak: 0.13, a: 0.15, vib: 14, vibHz: 11 }); for (let i = 0; i < 4; i++) tone(t + 0.2 + i * 0.13, { f0: 1500 + i * 260, dur: 0.08, type: 'sine', peak: 0.05 }); },
      glower: (t) => { tone(t, { f0: 210, f1: 60, dur: 0.5, type: 'sawtooth', peak: 0.24, filter: { type: 'lowpass', f0: 1800, f1: 200, q: 6 } }); tone(t, { f0: 70, f1: 40, dur: 0.5, type: 'sine', peak: 0.3 }); noise(t, 0.3, 'lowpass', 2500, 200, 0.18); },
      clear: (t) => { tone(t, { f0: 1760, dur: 0.35, type: 'sine', peak: 0.16 }); tone(t, { f0: 2640, dur: 0.25, type: 'sine', peak: 0.07 }); tone(t + 0.04, { f0: 3520, dur: 0.15, type: 'sine', peak: 0.04 }); },
      flurry: (t) => { for (let i = 0; i < 4; i++) tone(t + i * 0.09, { f0: 1300 + Math.random() * 500, f1: 500, dur: 0.07, type: 'square', peak: 0.1, filter: { type: 'lowpass', f0: 3200, q: 2 } }); },
      hide: (t) => { tone(t, { f0: 900, f1: 260, dur: 0.16, type: 'sine', peak: 0.14 }); },
      peek: (t) => { tone(t, { f0: 300, f1: 1100, dur: 0.12, type: 'sine', peak: 0.16 }); tone(t + 0.1, { f0: 1100, f1: 500, dur: 0.12, type: 'triangle', peak: 0.12 }); },
      doze: (t) => { tone(t, { f0: 520, f1: 240, dur: 1.1, type: 'sine', peak: 0.12, a: 0.1, vib: 10, vibHz: 3 }); },
      beam: (t) => { tone(t, { f0: 110, f1: 520, dur: 0.75, type: 'sawtooth', peak: 0.22, a: 0.04, filter: { type: 'lowpass', f0: 300, f1: 3500, q: 8 } }); tone(t, { f0: 55, f1: 80, dur: 0.8, type: 'sine', peak: 0.28 }); noise(t + 0.1, 0.6, 'bandpass', 600, 2500, 0.12, 1.5); },
      heal: (t) => { [660, 880, 1100].forEach((hz, i) => tone(t + i * 0.08, { f0: hz, dur: 0.22, type: 'sine', peak: 0.07 })); },
      // landing
      hit: (t) => { tone(t, { f0: 150, f1: 50, dur: 0.18, type: 'sine', peak: 0.32 }); noise(t, 0.07, 'lowpass', 2200, 300, 0.16); },
      bighit: (t) => { tone(t, { f0: 120, f1: 36, dur: 0.38, type: 'sine', peak: 0.45 }); noise(t, 0.25, 'lowpass', 3000, 120, 0.3); noise(t, 0.05, 'highpass', 3000, 7000, 0.12); },
      blocked: (t) => { tone(t, { f0: 180, f1: 120, dur: 0.1, type: 'sine', peak: 0.16 }); noise(t, 0.06, 'lowpass', 900, 300, 0.1); },
      miss: (t) => { noise(t, 0.22, 'bandpass', 3000, 600, 0.1, 3); },
      sudden: (t) => { tone(t, { f0: 98, dur: 1.4, type: 'triangle', peak: 0.16, a: 0.02 }); tone(t, { f0: 147, dur: 1.2, type: 'sine', peak: 0.1, a: 0.02 }); },
      // the end
      win: (t) => { [523, 659, 784, 1047].forEach((hz, i) => tone(t + i * 0.1, { f0: hz, dur: i === 3 ? 0.6 : 0.18, type: 'triangle', peak: 0.16 })); tone(t + 0.3, { f0: 2093, dur: 0.5, type: 'sine', peak: 0.05 }); },
      lose: (t) => { tone(t, { f0: 392, f1: 370, dur: 0.32, type: 'triangle', peak: 0.14 }); tone(t + 0.36, { f0: 349, f1: 262, dur: 0.7, type: 'triangle', peak: 0.14, vib: 6, vibHz: 6 }); },
      dizzy: (t) => { tone(t, { f0: 700, f1: 220, dur: 0.9, type: 'sine', peak: 0.13, vib: 40, vibHz: 7 }); },
      draw: (t) => { tone(t, { f0: 440, f1: 330, dur: 0.5, type: 'triangle', peak: 0.12 }); tone(t + 0.1, { f0: 660, f1: 495, dur: 0.5, type: 'triangle', peak: 0.08 }); }
    };
    function play(name, delay = 0) {
      if (!on || !SOUNDS[name]) return;
      const a = ensure(); if (!a || a.state === 'closed') return;
      played.push(name); if (played.length > 200) played.shift();
      try { SOUNDS[name](a.currentTime + 0.01 + delay); } catch (e) {}
    }
    function set(v) { on = !!v; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {} if (on) ensure(); else if (ac) { try { ac.suspend(); } catch (e) {} } }
    function sleep() { if (ac && ac.state === 'running') { try { ac.suspend(); } catch (e) {} } }
    return { play, unlock, set, sleep, isOn: () => on, _played: played };
  })();

  // ======================================================================================
  // the incoming challenge card (shows over anything)
  // ======================================================================================
  const Call = (() => {
    let el = null, eye = null, raf = 0, tick = 0;
    function show(c) {
      hide();
      const nm = friendName(c.f), dna = friendDna(c.f);
      el = document.createElement('div');
      el.id = 'eyesDuelCall'; el.className = 'edc'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', `${nm} challenges your Eye to a duel`);
      el.innerHTML = `<div class="edc-card"><canvas class="edc-eye" aria-hidden="true"></canvas>
        <div class="edc-txt"><p class="edc-k">EYE DUEL</p><p class="edc-l"><b></b> is giving <span></span> a look.</p></div>
        <div class="edc-row"><button type="button" class="edc-no">Not now</button><button type="button" class="edc-yes">Stare back</button></div>
        <i class="edc-time" aria-hidden="true"></i></div>`;
      el.querySelector('.edc-l b').textContent = nm; el.querySelector('.edc-l span').textContent = myName();
      document.body.appendChild(el);
      if (dna) el.style.setProperty('--c', colorOf(dna).map((x) => x | 0).join(','));
      el.querySelector('.edc-no').onclick = decline;
      el.querySelector('.edc-yes').onclick = acceptCall;
      const bar = el.querySelector('.edc-time');
      tick = setInterval(() => { if (!el) return; bar.style.transform = `scaleX(${clamp((c.until - Date.now()) / ASK_MS).toFixed(3)})`; }, 250);
      const cv = el.querySelector('canvas');
      if (dna && root.HavenEye) {
        const px = Math.round(64 * Math.min(2, devicePixelRatio || 1)); cv.width = cv.height = px;
        eye = new HavenEye(dna, cv); eye.moodGoal.squint = 0.5; eye.setTarget(0.5, 0.25); eye.reactUntil = nowS() + 999;
        const m = motionMode();
        const loop = () => { raf = 0; if (!el || !eye) return; const t = nowS(); eye.step(t, 1 / 30); eye.draw(t); if (m !== 'off') raf = setTimeout(loop, m === 'gentle' ? 50 : 33); };
        loop();
      } else cv.hidden = true;
      try { el.querySelector('.edc-yes').focus({ preventScroll: true }); } catch (e) {}
    }
    function hide(note) {
      clearInterval(tick); clearTimeout(raf); raf = 0; eye = null;
      if (el) { el.remove(); el = null; }
      if (note) flash(note);
    }
    return { show, hide, isOpen: () => !!el };
  })();

  // ======================================================================================
  // the battle scene
  // ======================================================================================
  const Scene = (() => {
    let el = null, world = null, sky = null, fxc = null, g = null, ui = null, W = 0, H = 0, dpr = 1, motion = 'on';
    let raf = 0, lastDraw = 0, fx = [], parts = [], floats = [], shake = 0, sayT = 0, pickTick = 0;
    let me = null, them = null;          // eye bodies
    const later2 = (fn, ms) => later(() => { if (el) fn(); }, ms);
    const dur = (s) => (motion === 'gentle' ? s * 1.35 : s);

    function open() {
      if (el) return;
      motion = motionMode();
      el = document.createElement('section');
      el.id = 'eyesDuel'; el.className = 'ed'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Eye Duel');
      el.dataset.motion = motion;
      el.innerHTML = `<div class="ed-world"><canvas class="ed-sky" aria-hidden="true"></canvas><div class="ed-stage"></div><canvas class="ed-fx" aria-hidden="true"></canvas></div>
        <div class="ed-ui">
          <header class="ed-top"><button type="button" class="ed-icon ed-x" aria-label="Bow out"><span aria-hidden="true">×</span></button>
            <div class="ed-title"><h2>Eye Duel</h2><p class="ed-round"></p></div><button type="button" class="ed-icon ed-snd" aria-label="Sound" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="cone" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="w1" d="M15 9.2a4 4 0 0 1 0 5.6"/><path class="w2" d="M17.6 6.8a7.4 7.4 0 0 1 0 10.4"/><path class="x" d="M15.5 9.5l5 5M20.5 9.5l-5 5"/></svg></button></header>
          <div class="ed-tag ed-tag-them" aria-hidden="true"><b></b><span class="ed-hp"></span><span class="ed-pips"></span></div>
          <div class="ed-tag ed-tag-me" aria-hidden="true"><b></b><span class="ed-hp"></span><span class="ed-pips"></span></div>
          <div class="ed-banner" aria-hidden="true"><span></span></div>
          <p class="ed-say" role="status" aria-live="polite"></p>
          <div class="ed-panel"></div>
          <div class="ed-confirm" hidden><div class="ed-confirm-in"><p>Bow out of this duel?</p><p class="ed-sub">Nothing is lost either way.</p>
            <div class="ed-row"><button type="button" class="ed-btn" data-c="stay">Keep staring</button><button type="button" class="ed-btn ed-primary" data-c="bow">Bow out</button></div></div></div>
        </div>`;
      document.body.appendChild(el);
      world = el.querySelector('.ed-world'); sky = el.querySelector('.ed-sky'); fxc = el.querySelector('.ed-fx'); g = fxc.getContext('2d'); ui = el.querySelector('.ed-ui');
      el.querySelector('.ed-x').onclick = () => back();
      const snd = el.querySelector('.ed-snd');
      const showSnd = () => { snd.classList.toggle('off', !Sfx.isOn()); snd.setAttribute('aria-pressed', String(Sfx.isOn())); snd.setAttribute('aria-label', Sfx.isOn() ? 'Sound on. Tap to mute' : 'Sound off. Tap to unmute'); };
      snd.onclick = () => { Sfx.set(!Sfx.isOn()); showSnd(); if (Sfx.isOn()) Sfx.play('lock'); };
      showSnd();
      el.querySelector('[data-c=stay]').onclick = () => confirm(false);
      el.querySelector('[data-c=bow]').onclick = () => { confirm(false); surrender(); };
      me = body(true, myDna());
      them = body(false, friendDna(S.f));
      el.style.setProperty('--me', me.color.map((x) => x | 0).join(','));
      el.style.setProperty('--them', them.color.map((x) => x | 0).join(','));
      tags();
      addEventListener('resize', resize);
      resize();
      try { root.Haven && Haven.holdHome && Haven.holdHome(true); } catch (e) {}
      start();
    }
    function close() {
      if (!el) return;
      stop(); clearInterval(pickTick);
      removeEventListener('resize', resize);
      el.remove(); el = null; fx = []; parts = []; floats = []; me = them = null;
      setTimeout(() => { if (!el && !Call.isOpen()) Sfx.sleep(); }, 2500);
    }
    const isOpen = () => !!el;
    function wake() { if (!el) return; motion = motionMode(); el.dataset.motion = motion; start(); }
    function back() {
      if (!el || !S) return false;
      const c = el.querySelector('.ed-confirm');
      if (!c.hidden) { confirm(false); return true; }
      if (S.phase === 'asking' || S.phase === 'over') { surrender(); return true; }
      if (['intro', 'pick', 'wait', 'play'].includes(S.phase)) { confirm(true); return true; }
      surrender(); return true;
    }
    function confirm(show) { const c = el.querySelector('.ed-confirm'); c.hidden = !show; if (show) c.querySelector('[data-c=stay]').focus(); }

    // ---------- bodies ----------
    function body(mine, dna) {
      const wrap = document.createElement('div'); wrap.className = 'ed-eye ' + (mine ? 'ed-me' : 'ed-them');
      const cv = document.createElement('canvas'); wrap.appendChild(cv);
      el.querySelector('.ed-stage').appendChild(wrap);
      const b = { mine, dna, wrap, cv, eye: null, color: dna ? colorOf(dna) : [200, 222, 230], x: 0, y: 0, s: 100, ox: 0, oy: 0, vx: 0, vy: 0, rot: 0, sc: 1, scGoal: 1, alpha: 1, aGoal: 1, flash: 0,
        dhp: RULES.HP, word: mine ? myWord() : (S ? S.wTheirs : 'calm'), dizzy: false, proud: false, asleep: false, hidden: false, base: 0 };
      if (dna && root.HavenEye) b.eye = new HavenEye(dna, cv);
      else wrap.classList.add('ed-blank');
      return b;
    }
    const T = (b) => (b.dna ? b.dna.T : { curiosity: 0.5, shyness: 0.5, energy: 0.5, grump: 0.3, drama: 0.4 });
    function resize() {
      if (!el) return;
      W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.5);
      [sky, fxc].forEach((c) => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout(); paintSky(); kick();
    }
    function layout() {
      const top = (el.querySelector('.ed-top').getBoundingClientRect().bottom || 64) + 8;
      const pr = el.querySelector('.ed-panel').getBoundingClientRect();
      const bottom = Math.min(H - 8, (pr.top || H * 0.72) - (W > H ? 20 : 44));
      const h = Math.max(160, bottom - top), wide = W / h > 1.05;
      let s;
      if (wide) {
        s = Math.min(W * 0.3, h * 0.62, 300);
        place(me, W * 0.28, top + h * 0.52, s * 0.96); place(them, W * 0.72, top + h * 0.48, s);
      } else {
        s = Math.min(W * 0.48, h * 0.46, 300);
        place(them, W * 0.69, top + Math.max(s * 0.52, h * 0.27), s);
        place(me, W * 0.31, bottom - Math.max(s * 0.5, h * 0.25), s * 0.96);
      }
      el.dataset.wide = wide ? '1' : '';
      const tT = el.querySelector('.ed-tag-them'), tM = el.querySelector('.ed-tag-me');
      if (wide) {
        tT.style.left = (them.x - 80) + 'px'; tT.style.top = (them.y + them.s * 0.52) + 'px'; tT.style.width = '160px'; tT.style.textAlign = 'center';
        tM.style.left = (me.x - 80) + 'px'; tM.style.top = (me.y + me.s * 0.52) + 'px'; tM.style.width = '160px'; tM.style.textAlign = 'center';
      } else {
        const wT = Math.max(96, them.x - them.s * 0.5 - 18);
        tT.style.left = '14px'; tT.style.width = (wT - 14) + 'px'; tT.style.top = (them.y - 24) + 'px'; tT.style.textAlign = 'right';
        const lM = me.x + me.s * 0.5 + 10;
        tM.style.left = lM + 'px'; tM.style.width = Math.max(90, W - lM - 14) + 'px'; tM.style.top = (me.y - 24) + 'px'; tM.style.textAlign = 'left';
      }
    }
    function place(b, x, y, s) {
      b.x = x; b.y = y; b.s = s;
      const size = Math.round(s);
      if (b.base !== size) {
        b.base = size; b.wrap.style.width = b.wrap.style.height = size + 'px';
        const px = Math.round(size * Math.min(2, devicePixelRatio || 1));
        if (b.cv.width !== px) b.cv.width = b.cv.height = px;
      }
    }
    function tags() {
      if (!el || !S) return;
      const set = (sel, b, nm, st) => {
        const t = el.querySelector(sel);
        t.querySelector('b').textContent = nm;
        t.querySelector('.ed-hp').textContent = st ? String(Math.round(st.hp)) : '';
        t.querySelector('.ed-pips').innerHTML = st ? Array.from({ length: RULES.MAXC }, (_, i) => `<i class="${i < st.c ? 'on' : ''}"></i>`).join('') : '';
        t.classList.toggle('ed-low', !!st && st.hp <= RULES.HP * 0.3);
      };
      const live = S.phase !== 'asking';
      set('.ed-tag-me', me, myName(), live ? meSt() : null);
      set('.ed-tag-them', them, S.nmTheirs, live ? themSt() : null);
    }

    // ---------- sky ----------
    function paintSky() {
      const c = sky.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#04070b'); bg.addColorStop(0.5, '#05080e'); bg.addColorStop(1, '#030405');
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      // each Eye's own light on its side of the sky, meeting in a faint rift
      const R = Math.max(W, H) * 0.75;
      [[me, 0.07], [them, 0.07]].forEach(([b, a]) => {
        const gr = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, R);
        gr.addColorStop(0, rgba(b.color, a)); gr.addColorStop(0.45, rgba(b.color, a * 0.35)); gr.addColorStop(1, rgba(b.color, 0));
        c.fillStyle = gr; c.fillRect(0, 0, W, H);
      });
      const r = RULES.mulberry(((myDna() ? myDna().seed : 7) ^ 0xd0e1) >>> 0), n = Math.round((W * H) / 4200);
      for (let i = 0; i < n; i++) { const x = r() * W, y = r() * H, rad = 0.25 + Math.pow(r(), 3) * 1.2; c.fillStyle = `rgba(220,236,240,${0.1 + r() * 0.5})`; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill(); }
      // the rift: a soft diagonal seam between the two Eyes
      const mx = (me.x + them.x) / 2, my = (me.y + them.y) / 2, ang = Math.atan2(them.y - me.y, them.x - me.x) + Math.PI / 2;
      const L = Math.hypot(W, H), dx = Math.cos(ang) * L, dy = Math.sin(ang) * L;
      const rg = c.createLinearGradient(mx - dx, my - dy, mx + dx, my + dy);
      rg.addColorStop(0, 'rgba(200,220,255,0)'); rg.addColorStop(0.5, 'rgba(200,220,255,0.06)'); rg.addColorStop(1, 'rgba(200,220,255,0)');
      c.strokeStyle = rg; c.lineWidth = 1; c.beginPath(); c.moveTo(mx - dx, my - dy); c.lineTo(mx + dx, my + dy); c.stroke();
    }

    // ---------- words ----------
    function say(text, hold) {
      if (!el) return;
      const p = el.querySelector('.ed-say');
      p.textContent = text || ''; p.classList.toggle('show', !!text);
      clearTimeout(sayT); if (text && !hold) sayT = setTimeout(() => { if (el && p.textContent === text) p.classList.remove('show'); }, 6500);
    }
    function banner(text, cls) {
      if (!el) return;
      const b = el.querySelector('.ed-banner'), s = b.querySelector('span');
      s.textContent = text; b.className = 'ed-banner show ' + (cls || '');
      void b.offsetWidth; b.classList.add('go');
      later2(() => { b.className = 'ed-banner'; }, motion === 'off' ? 900 : dur(1.25) * 1000);
    }
    function toast(text) { if (el) say(text); else flash(text); }
    const panel = () => el.querySelector('.ed-panel');
    function setRound(text) { el.querySelector('.ed-round').textContent = text || ''; }

    // ---------- phases ----------
    function asking() {
      setRound('');
      const nm = S.nmTheirs;
      panel().innerHTML = `<div class="ed-ask"><p class="ed-lead"><b></b> is giving <span></span> a look…</p><p class="ed-sub ed-ask-sub">Sending your challenge</p>
        <i class="ed-wait" aria-hidden="true"></i><button type="button" class="ed-btn ed-quiet" data-a="cancel">Never mind</button></div>`;
      panel().querySelector('.ed-lead b').textContent = myName(); panel().querySelector('.ed-lead span').textContent = nm;
      panel().querySelector('[data-a=cancel]').onclick = cancelAsk;
      them.aGoal = 0.62; if (them.eye) them.eye.closeK = 0.25;
      glare(me, them, 0.5, 99);
      tags(); layout();
    }
    function askSent() {
      if (!el) return;
      const sub = panel().querySelector('.ed-ask-sub'); if (!sub) return;
      // 4.2.2: say only what is known about their Eye, and keep it current while waiting
      const secs = Math.round((S.window || ASK_MS) / 1000);
      const text = () => {
        const pr = F().presence ? F().presence(S.f) : { state: F().online(S.f) ? 'online' : 'unknown' };
        return pr.state === 'online' ? `Waiting for ${S.nmTheirs} to stare back`
          : pr.state === 'offline' ? `${S.nmTheirs}'s Eye isn't open. They'll only see this if they open EYES in the next ${secs} seconds.`
          : `Can't tell if ${S.nmTheirs}'s Eye is open. The challenge waits ${secs} seconds.`;
      };
      sub.textContent = text();
      const bar = panel().querySelector('.ed-wait'); const t0 = Date.now(), win = S.window || ASK_MS;
      clearInterval(pickTick);
      pickTick = setInterval(() => {
        if (!el || !S || S.phase !== 'asking') return clearInterval(pickTick);
        bar.style.transform = `scaleX(${clamp(1 - (Date.now() - t0) / win).toFixed(3)})`;
        const nt = text(); if (sub.textContent !== nt) sub.textContent = nt;
      }, 250);
    }
    function outcome(lead, sub) {
      clearInterval(pickTick);
      if (!el) return;
      panel().innerHTML = `<div class="ed-ask"><p class="ed-lead"></p><p class="ed-sub"></p><button type="button" class="ed-btn ed-primary" data-a="done">Back to ${esc(S ? S.nmTheirs : 'Eye Contact')}</button></div>`;
      panel().querySelector('.ed-lead').textContent = lead; panel().querySelector('.ed-sub').textContent = sub || '';
      panel().querySelector('[data-a=done]').onclick = () => finish();
      if (S) S.phase = 'over';
      relaxAll();
    }
    function askFailed() { outcome("Your challenge couldn't leave this phone.", 'Check your connection and try again.'); }
    function askTimeout() { outcome('No answer.', `${S.nmTheirs}'s Eye might be resting. Try again when they're awake.`); them.aGoal = 0.5; if (them.eye) them.eye.closeK = 0.5; }
    function declined(busy) {
      outcome(busy ? `${S.nmTheirs}'s Eye is busy with another duel.` : `${S.nmTheirs}'s Eye looked away.`, busy ? 'Try again in a minute.' : 'Not today. No hard feelings.');
      if (them.eye && !busy) { lookAway(them, 3, true); them.eye.moodGoal.squint = 0.3; }
      if (me.eye) { me.eye.moodGoal.squint = 0; me.eye.blinkNow(true); }
    }
    function answering(crossed) {
      setRound('');
      them.aGoal = 1; if (them.eye) them.eye.closeK = 0;
      panel().innerHTML = `<div class="ed-ask"><p class="ed-lead"></p><p class="ed-sub">${crossed ? 'You both reached for it at once.' : 'Answering…'}</p></div>`;
      panel().querySelector('.ed-lead').textContent = `${myName()} stares back at ${S.nmTheirs}.`;
      glare(me, them, 0.45, 2);
      tags();
    }
    function answerFailed() { outcome("Your answer couldn't leave this phone.", 'Check your connection. Nothing was lost.'); }
    function intro(done) {
      them.word = S.wTheirs; me.word = S.wMine;
      them.aGoal = 1; if (them.eye) them.eye.closeK = 0;
      panel().innerHTML = ''; tags(); setRound('Round 1');
      if (motion === 'off') { say(`${myName()} vs ${S.nmTheirs}. Stare!`); Sfx.play('stare'); later2(done, 900); return; }
      Sfx.play('intro');
      // the two Eyes square up: a flash at the rift, each sizes the other up
      [me, them].forEach((b) => { b.sc = 0.82; b.alpha = 0.4; });
      banner('EYE DUEL', 'big');
      later2(() => { lookAt(me, them, 1.5); lookAt(them, me, 1.5); pop(me); pop(them); burst((me.x + them.x) / 2, (me.y + them.y) / 2, [235, 240, 255], 26, 160); shake = Math.max(shake, 5); }, dur(0.35) * 1000);
      later2(() => { personalityPose(me); personalityPose(them); }, dur(0.9) * 1000);
      later2(() => { banner('Stare!', 'go2'); Sfx.play('stare'); }, dur(1.5) * 1000);
      later2(done, dur(2.3) * 1000);
    }
    function pick(r) {
      if (!el) return;
      setRound(r >= RULES.SUDDEN ? `Round ${r} · ×1.5` : `Round ${r}`);
      if (r === RULES.SUDDEN) { say('The cosmos grows impatient. Every hit lands harder now.'); Sfx.play('sudden'); }
      tags();
      const st = meSt(), forced = RULES.legal(st, 'glare') === 'beam';
      const w = S.wMine, arch = RULES.ARCH[w];
      if (forced) {
        panel().innerHTML = `<div class="ed-ask"><p class="ed-lead">${esc(myName())} is waking up…</p><p class="ed-sub">${esc(RULES.SPECIAL[w])} fires this round.</p></div>`;
        return;
      }
      const cost = RULES.COST, can = st.c >= cost;
      const moves = [
        ['glare', 'Glare', 'a sharp look'],
        ['blink', 'Blink', 'guard · +1 charge'],
        ['charge', 'Charge', 'gather · +2 charge'],
        ['special', RULES.SPECIAL[w], can ? RULES.HINT[arch] : `needs ${cost} charge`]
      ];
      panel().innerHTML = `<div class="ed-timer" aria-hidden="true"><i></i></div><div class="ed-moves" role="group" aria-label="Choose your move">${moves.map(([k, l, h]) =>
        `<button type="button" class="ed-move ed-m-${k}${k === 'special' ? ' ed-a-' + arch : ''}" data-m="${k}"${k === 'special' && !can ? ' disabled' : ''} aria-label="${esc(l)}: ${esc(h)}"><span class="ed-orb" aria-hidden="true"><i class="ed-g ed-g-${k === 'special' ? arch : k}"></i></span><b>${esc(l)}</b><small>${esc(h)}</small></button>`).join('')}</div>`;
      panel().querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { if (!b.disabled) lock(b.dataset.m, 'tap'); }; });
      if (S.their[r]) theyChose();
      const bar = panel().querySelector('.ed-timer i'), total = (motion === 'gentle' ? PICK_S + 3 : PICK_S) * 1000, t0 = Date.now();
      clearInterval(pickTick);
      pickTick = setInterval(() => {
        if (!el || !S || S.phase !== 'pick') return clearInterval(pickTick);
        const k = clamp(1 - (Date.now() - t0) / total); bar.style.transform = `scaleX(${k.toFixed(3)})`; bar.parentNode.classList.toggle('late', k < 0.3);
      }, 200);
      // ready stances: a little life while you think
      relaxAll();
      try { const first = panel().querySelector('[data-m=glare]'); if (first && document.activeElement && el.contains(document.activeElement)) first.focus({ preventScroll: true }); } catch (e) {}
    }
    function theyChose() {
      if (!el) return;
      say(`${S.nmTheirs} has made up their mind.`);
      if (them.eye && motion !== 'off') { them.eye.moodGoal.squint = 0.25; lookAt(them, me, 1.2); later2(() => { if (them.eye) them.eye.moodGoal.squint = 0; }, 1300); }
    }
    function locked(m, how) {
      clearInterval(pickTick);
      if (!el) return;
      const nm = m === 'special' ? RULES.SPECIAL[S.wMine] : m === 'beam' ? RULES.SPECIAL[S.wMine] : m[0].toUpperCase() + m.slice(1);
      panel().innerHTML = `<div class="ed-ask"><p class="ed-lead ed-locked"></p><p class="ed-sub">${S.their[S.state.r] ? '' : `Waiting for ${esc(S.nmTheirs)}…`}</p></div>`;
      if (how === 'tap') Sfx.play('lock');
      panel().querySelector('.ed-locked').textContent = how === 'timeout' ? `${myName()} blinked on its own.` : `${nm}. Locked in.`;
      // your Eye readies itself (theirs gives nothing away)
      if (me.eye && motion !== 'off') { me.eye.pupilV += 1.2; lookAt(me, them, 1.4); }
      kick();
    }

    // ---------- a round plays out ----------
    function play(out, before, done) {
      clearInterval(pickTick);
      if (!el) return;
      panel().innerHTML = '';
      const mk = roleKey(true), tk = roleKey(false);
      const eMe = out.ev[mk], eThem = out.ev[tk];
      const D0 = { me: before[mk], them: before[tk] }, D1 = { me: out.state[mk], them: out.state[tk] };
      const nmMe = myName(), nmThem = S.nmTheirs;
      const text = narrate(eMe, eThem, nmMe, nmThem, motion === 'off');
      if (motion === 'off') {
        say(text, true); applyNumbers(D1);
        [eMe, eThem].forEach((e, i) => Sfx.play(MOVE_SFX[e.act] || '', i * 0.05));
        [[me, eThem, eMe], [them, eMe, eThem]].forEach(([b, inc], i) => { if (inc.dmg > 0 && b.eye) b.eye.blinkNow(); if (inc.dmg > 0) Sfx.play(inc.dmg >= 25 ? 'bighit' : 'hit', 0.35 + i * 0.06); });
        kick(); later2(done, 1700); return;
      }
      const t = dur(1);
      // 1 wind-up
      windUp(me, eMe, them); windUp(them, eThem, me);
      // 2 release + 3 impact
      const fly = 0.5 * t, land = fly + 0.42 * t;
      later2(() => { release(me, them, eMe, eThem); release(them, me, eThem, eMe); }, fly * 1000);
      later2(() => {
        impact(them, eMe, eThem, me); impact(me, eThem, eMe, them);
        say(text, true); applyNumbers(D1);
        if (out.sudden && (eMe.dmg + eThem.dmg) > 0 && motion === 'on') shake = Math.max(shake, 4);
      }, land * 1000);
      // 4 reactions in character
      later2(() => { react(me, eThem, eMe, them); react(them, eMe, eThem, me); }, (land + 0.45 * t) * 1000);
      later2(() => { if (S && S.phase === 'play') done(); }, (land + 1.75 * t) * 1000);
      kick();
    }
    function applyNumbers(D1) {
      me.hpTo = D1.me.hp; them.hpTo = D1.them.hp;
      if (motion === 'off') { me.dhp = D1.me.hp; them.dhp = D1.them.hp; }
      tags();
    }
    const MOVE_SFX = { glare: 'glare', blink: 'blink', charge: 'charge', glower: 'glower', clear: 'clear', flurry: 'flurry', peek: 'hide', dream: 'doze', beam: 'beam' };
    function windUp(b, e, other) {
      if (['blink', 'charge', 'peek', 'dream'].includes(e.act)) Sfx.play(MOVE_SFX[e.act], b.mine ? 0 : 0.04);
      if (!b.eye) return;
      const E = b.eye;
      switch (e.act) {
        case 'glare': glare(b, other, 0.55, 1.4); break;
        case 'blink': E.blinkNow(true); E.closeK = 0.55; later2(() => { E.closeK = 0; }, dur(1.6) * 1000); fx.push({ type: 'shield', b, other, t0: nowS(), dur: dur(1.9) }); break;
        case 'charge': E.pupilGoal = 1.45; fx.push({ type: 'gather', b, t0: nowS(), dur: dur(1.1) }); later2(() => { E.pupilGoal = 1; }, dur(1.4) * 1000); break;
        case 'glower': glare(b, other, 0.85, 1.6); b.scGoal = 1.08; later2(() => { b.scGoal = 1; }, dur(1) * 1000); if (motion === 'on') shake = Math.max(shake, 2); break;
        case 'peek': E.blinkNow(); b.hidden = true; b.scGoal = 0.55; b.aGoal = 0.25; break;
        case 'clear': E.moodGoal.squint = 0.15; E.pupilGoal = 0.7; lookAt(b, other, 1.4); fx.push({ type: 'ripple', b, t0: nowS(), dur: dur(0.9) }); break;
        case 'flurry': E.moodGoal.wide = 0.55; E.dartBurst = 4; E.nextDart = nowS(); E.reactUntil = nowS(); break;
        case 'dream': E.closeK = 0.86; b.asleep = true; fx.push({ type: 'zzz', b, t0: nowS(), dur: dur(2.6) }); break;
        case 'beam': b.asleep = false; E.closeK = 0; E.moodGoal.wide = 0.8; E.pupilGoal = 1.5; b.scGoal = 1.1; lookAt(b, other, 2); later2(() => { b.scGoal = 1; }, dur(1.3) * 1000); break;
        default: break;
      }
      b.flash = Math.max(b.flash, e.act === 'blink' ? 0 : 0.25);
      kick();
    }
    function release(b, other, e, inc) {
      const c = b.color, t0 = nowS();
      if (['glare', 'glower', 'clear', 'flurry', 'beam'].includes(e.act)) Sfx.play(MOVE_SFX[e.act], b.mine ? 0 : 0.03);
      if (e.act === 'peek' && (e.counter || e.poke)) Sfx.play('peek', dur(0.22));
      switch (e.act) {
        case 'glare': fx.push({ type: 'beam', from: b, to: other, c, t0, travel: dur(0.32), hold: dur(0.35), w: 3.2, core: 1.4 }); break;
        case 'glower': fx.push({ type: 'beam', from: b, to: other, c, t0, travel: dur(0.4), hold: dur(0.55), w: 9, core: 3.2, heavy: true }); break;
        case 'clear': fx.push({ type: 'beam', from: b, to: other, c: [240, 248, 255], c2: c, t0, travel: dur(0.18), hold: dur(0.45), w: 1.6, core: 0.9, needle: true }); break;
        case 'flurry': for (let i = 0; i < 4; i++) fx.push({ type: 'beam', from: b, to: other, c, t0: t0 + i * dur(0.09), travel: dur(0.2), hold: dur(0.12), w: 2, core: 0.8, jit: (i % 2 ? 1 : -1) * (0.15 + i * 0.06) }); break;
        case 'beam': fx.push({ type: 'beam', from: b, to: other, c, t0, travel: dur(0.55), hold: dur(0.6), w: 16, core: 5, heavy: true, wave: true }); if (motion === 'on') shake = Math.max(shake, 7); break;
        case 'peek':
          if (e.counter || e.poke) later2(() => { b.hidden = false; b.scGoal = 1.12; b.aGoal = 1; pop(b); fx.push({ type: 'beam', from: b, to: other, c, t0: nowS(), travel: dur(0.16), hold: dur(0.3), w: e.counter ? 5 : 2, core: e.counter ? 2 : 0.8 }); later2(() => { b.scGoal = 1; }, 400); }, dur(0.22) * 1000);
          break;
        default: break;
      }
      kick();
    }
    function impact(target, e, ownE, attacker) {
      // what hit `target` (e is the attacker's event, ownE is the target's own)
      const peekDelay = e.act === 'peek' ? 0.22 : 0;
      const show = () => {
        if (!el) return;
        if (e.dodged) { float(target, 'missed', [200, 220, 235]); Sfx.play('miss'); return; }
        if (e.dmg > 0) {
          const big = e.dmg >= 25;
          Sfx.play(e.blocked && ownE.act === 'blink' && !e.pierce ? 'blocked' : big ? 'bighit' : 'hit', target.mine ? 0 : 0.03);
          float(target, '−' + e.dmg, big ? [255, 214, 214] : [240, 244, 250], big);
          if (e.hits && e.hits.length > 1) e.hits.forEach((h, i) => later2(() => { recoil(target, attacker, 0.35); burst(target.x, target.y, attacker.color, 5, 90); }, i * 90));
          recoil(target, attacker, big ? 1.4 : 0.8);
          target.flash = 1;
          burst(target.x + (attacker.x - target.x) * 0.18, target.y + (attacker.y - target.y) * 0.18, attacker.color, big ? 22 : 12, big ? 200 : 130);
          if (big && motion === 'on') shake = Math.max(shake, e.act === 'beam' ? 9 : 6);
          if (e.blocked && ownE.act === 'blink') float(target, e.pierce ? 'pierced!' : 'blocked', [200, 226, 240], false, 0.6);
          if (e.counter) float(attacker, 'gotcha', [255, 236, 170], false, 0.65);
        } else if (ownE.act === 'blink' && ['glare', 'glower', 'flurry', 'beam'].includes(e.act)) { float(target, 'blocked', [200, 226, 240]); Sfx.play('blocked'); }
      };
      if (peekDelay) later2(show, dur(peekDelay + 0.18) * 1000); else show();
      if (ownE.heal > 0) later2(() => { float(target, '+' + ownE.heal, [168, 240, 200]); Sfx.play('heal'); fx.push({ type: 'heal', b: target, t0: nowS(), dur: dur(1.2) }); }, 260);
      if (ownE.gain > 0) later2(() => float(target, `+${ownE.gain} charge`, [190, 205, 255], false, 0.4), 120);
    }
    function react(b, inc, own, other) {
      if (!b.eye) return;
      const E = b.eye, w = b.word, Tn = T(b);
      if (own.act === 'glare' || own.act === 'glower') later2(() => { E.moodGoal.squint = 0; }, 400);
      if (own.act === 'flurry') E.moodGoal.wide = 0;
      if (own.act === 'clear') { E.moodGoal.squint = 0; E.pupilGoal = 1; }
      if (own.act === 'beam') { E.moodGoal.wide = 0; E.pupilGoal = 1; }
      if (inc.dmg <= 0) {
        if (inc.dodged) { E.moodGoal.squint = 0.3; lookAt(b, other, 1.6); later2(() => { E.moodGoal.squint = 0; }, 1400); }     // smug little "nope"
        return;
      }
      if (w === 'shy' || Tn.shyness > 0.7) { lookAway(b, 1.6, true); E.moodGoal.squint = 0.35; later2(() => { E.moodGoal.squint = 0; }, 1500); }
      else if (w === 'grumpy' || w === 'smug') { E.moodGoal.squint = 0.6; lookAt(b, other, 2); later2(() => { E.moodGoal.squint = 0; }, 1700); }
      else if (w === 'hyper') { E.dartBurst = 4; E.nextDart = nowS(); E.reactUntil = nowS(); }
      else if (w === 'dramatic') { E.blinkT = nowS(); E.blinkQueue = 1; E.pupilV -= 3; recoil(b, other, 0.6); E.moodGoal.wide = 0.6; later2(() => { E.moodGoal.wide = 0; }, 900); }
      else if (w === 'sleepy') E.blinkNow(true);
      else if (w === 'curious') { E.pupilGoal = 1.35; later2(() => { E.pupilGoal = 1; }, 1200); }
      else E.blinkNow();
    }
    function narrate(m, t, A, B, nums) {
      const n = (e) => (nums && e.dmg > 0 ? ` (−${e.dmg})` : '');
      const sp = (w) => RULES.SPECIAL[w];
      const line = (e, other, X, Y, w) => {
        switch (e.act) {
          case 'glare': return e.dodged ? `${X} glares at nothing.` : other.act === 'blink' ? `${X} glares, ${Y} blinks it off${n(e)}.` : `${X} glares${n(e)}.`;
          case 'blink': return other.act === 'blink' || other.act === 'glare' ? '' : other.act === 'charge' ? `${X} blinks and waits.` : '';
          case 'charge': return other.act === 'charge' ? '' : `${X} gathers light.`;
          case 'glower': return `${X}: ${sp(w)}!${n(e)}`;
          case 'peek': return e.counter ? `${X} hides… and strikes back${n(e)}!` : e.refund ? `${X} hides, then pokes${n(e)}, saving its Charge.` : `${X} hides, then pokes${n(e)}.`;
          case 'clear': return `${X}: ${sp(w)}${e.pierce ? ', straight through the blink' : ''}${n(e)}.`;
          case 'flurry': return `${X}: ${sp(w)}${n(e)}!`;
          case 'dream': return `${X} dozes off… something is building.`;
          case 'beam': return `${X} wakes with a ${sp(w)}${n(e)}!`;
          default: return '';
        }
      };
      if (m.act === 'blink' && t.act === 'blink') return 'A careful stare-down. Nobody moves.';
      if (m.act === 'charge' && t.act === 'charge') return 'Both Eyes gather light. The air hums.';
      if (m.act === 'peek' && t.act === 'peek') return 'Two Eyes hide from each other. Awkward.';
      return [line(m, t, A, B, S.wMine), line(t, m, B, A, S.wTheirs)].filter(Boolean).join(' ');
    }

    // ---------- the end ----------
    function over(res, why) {
      clearInterval(pickTick);
      if (!el) return;
      confirm(false);
      const A = myName(), B = S.nmTheirs;
      let lead = '', sub = '';
      if (res === 'win') { lead = `${A} wins!`; sub = why === 'bye' ? `${B} bowed out.` : why === 'quiet' ? `${B}'s Eye stopped answering, so the duel is yours by default.` : why === 'time' ? 'Still standing taller when time ran out.' : `${B} is seeing stars.`; }
      else if (res === 'loss') { lead = `${B} wins.`; sub = why === 'bow' ? 'You bowed out. No harm done.' : why === 'time' ? `${B} was standing taller when time ran out.` : `${A} is seeing stars. It'll pass in a second.`; }
      else if (res === 'draw') { lead = 'A draw.'; sub = 'Both Eyes saw stars at the same time.'; }
      else { lead = 'No winner this time.'; sub = why === 'desync' ? 'Your Eyes lost the thread between phones.' : why === 'lost' ? 'The connection dropped, so the duel ends here.' : why === 'away' ? 'EYES was closed for a while, so the duel ended.' : why === 'quiet' ? `${B}'s Eye stopped answering, so the duel ends without a winner.` : why === 'faded' ? 'Their challenge had already faded on their side.' : 'The duel faded.'; }
      setRound('');
      const finale = () => {
        if (!el) return;
        panel().innerHTML = `<div class="ed-ask ed-end"><p class="ed-lead"></p><p class="ed-sub"></p><p class="ed-fine">Back to normal now. Nothing about either Eye changed.</p>
          <button type="button" class="ed-btn ed-primary" data-a="done">Back to ${esc(B)}</button></div>`;
        panel().querySelector('.ed-lead').textContent = lead; panel().querySelector('.ed-sub').textContent = sub;
        const d = panel().querySelector('[data-a=done]'); d.onclick = () => finish(); try { d.focus({ preventScroll: true }); } catch (e) {}
      };
      const winB = res === 'win' ? me : res === 'loss' ? them : null, loseB = res === 'win' ? them : res === 'loss' ? me : null;
      if (res === 'draw') { dizzy(me); dizzy(them); }
      if (loseB && (why === 'ko' || why === 'time')) dizzy(loseB);
      if (loseB && why === 'bye' || loseB && why === 'bow') { loseB.aGoal = 0.6; if (loseB.eye) loseB.eye.closeK = 0.5; }
      if (winB) proud(winB, loseB);
      if (res === 'none') relaxAll();
      if (motion !== 'off' && (res === 'win' || res === 'loss')) banner(res === 'win' ? 'Victory' : 'Defeat', res);
      if (res === 'win') Sfx.play('win'); else if (res === 'loss') Sfx.play('lose'); else if (res === 'draw') Sfx.play('draw');
      if ((res === 'win' || res === 'loss') && (why === 'ko' || why === 'time')) Sfx.play('dizzy', 0.9);
      if (res === 'draw') Sfx.play('dizzy', 0.6);
      later2(finale, motion === 'off' ? 200 : dur(1.5) * 1000);
      kick();
    }
    function dizzy(b) {
      b.dizzy = true; b.asleep = false;
      if (b.eye) { b.eye.closeK = 0.42; b.eye.moodGoal.squint = 0.2; b.eye.reactUntil = nowS() + 999; }
      if (motion !== 'off') fx.push({ type: 'stars', b, t0: nowS(), dur: 9 });
    }
    function proud(b, other) {
      b.proud = true; b.pt0 = nowS();
      if (!b.eye) return;
      const E = b.eye, w = b.word;
      if (w === 'grumpy' || w === 'smug') { E.moodGoal.squint = 0.45; if (other) lookAt(b, other, 3); }
      else if (w === 'shy') { E.blinkNow(); later2(() => { lookAway(b, 2, true); E.moodGoal.squint = 0.3; }, 500); }
      else { E.moodGoal.wide = 0.45; E.pupilGoal = 1.3; E.dartBurst = w === 'hyper' ? 4 : 0; }
      if (motion !== 'off') { burst(b.x, b.y - b.s * 0.3, b.color, 30, 150); burst(b.x, b.y - b.s * 0.3, [255, 245, 220], 14, 110); }
    }
    function relaxAll() {
      [me, them].forEach((b) => {
        if (!b || !b.eye) return;
        const E = b.eye; if (!b.asleep) E.closeK = 0; E.moodGoal.squint = 0; E.moodGoal.wide = 0; E.pupilGoal = 1; b.scGoal = 1; if (!b.hidden) b.aGoal = 1;
      });
    }
    function personalityPose(b) {
      if (!b.eye) return;
      const E = b.eye, w = b.word;
      if (w === 'grumpy' || w === 'smug') { E.moodGoal.squint = 0.5; later2(() => { E.moodGoal.squint = 0; }, 1400); }
      else if (w === 'shy') { E.blinkNow(); lookAway(b, 0.9, true); }
      else if (w === 'hyper') { E.dartBurst = 3; E.nextDart = nowS(); E.reactUntil = nowS(); }
      else if (w === 'dramatic') { E.pupilV -= 2.5; E.moodGoal.wide = 0.6; later2(() => { E.moodGoal.wide = 0; }, 900); }
      else if (w === 'sleepy') E.blinkNow(true);
      else if (w === 'curious') { E.pupilGoal = 1.35; later2(() => { E.pupilGoal = 1; }, 1200); }
    }

    // ---------- small motions ----------
    function lookAt(b, other, hold) {
      if (!b || !b.eye || !other) return;
      const dx = other.x - b.x, dy = other.y - b.y, L = Math.hypot(dx, dy) || 1;
      b.eye.setTarget((dx / L) * 0.92, (dy / L) * 0.72);
      b.eye.reactUntil = nowS() + (hold || 1);
    }
    function lookAway(b, hold, down) {
      if (!b || !b.eye) return;
      const a = Math.random() * TAU; b.eye.setTarget(Math.cos(a) * 0.8, down ? 0.6 : Math.sin(a) * 0.55); b.eye.reactUntil = nowS() + hold;
    }
    function glare(b, other, squint, hold) { if (!b.eye) return; b.eye.moodGoal.squint = squint; b.eye.pupilGoal = 0.72; lookAt(b, other, hold); }
    function recoil(b, from, k) {
      const amp = motion === 'on' ? 1 : 0.35, dx = b.x - from.x, dy = b.y - from.y, L = Math.hypot(dx, dy) || 1;
      b.vx += (dx / L) * 520 * k * amp; b.vy += (dy / L) * 520 * k * amp;
      b.rotV = (b.rotV || 0) + (Math.random() < 0.5 ? -1 : 1) * 3 * k * amp;
      if (b.eye) { b.eye.pupilV -= 2.2 * k; b.eye.blinkNow(); }
    }
    function pop(b) { b.sc = Math.max(b.sc, 1.12); b.scGoal = 1; b.alpha = 1; b.aGoal = 1; b.flash = Math.max(b.flash, 0.5); }
    function float(b, txt, c, big, delay) {
      const push = () => {
        // stack words that land on the same Eye at nearly the same time, so they never sit on top of each other
        const t = nowS(), near = floats.filter((f) => f.b === b && t - f.t0 < 0.7).length;
        floats.push({ b, x: b.x + (near % 2 ? 1 : -1) * Math.min(near, 1) * b.s * 0.12, y: b.y - b.s * 0.36 - near * 24, txt, c, big: !!big, t0: t, dur: dur(1.25) });
      };
      if (delay) later2(push, delay * 1000); else push();
      kick();
    }
    function burst(x, y, c, n, speed) {
      if (motion === 'off') return;
      if (motion === 'gentle') n = Math.ceil(n / 3);
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = speed * (0.35 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 0.8 + Math.random() * 1.6, c, life: 0.5 + Math.random() * 0.6, max: 1.1 }); }
    }

    // ---------- the loop ----------
    function frame(ms) {
      raf = 0;
      if (!el || document.visibilityState !== 'visible') return;
      const t = ms / 1000, busy = fx.length || parts.length || floats.length || shake > 0.1 || [me, them].some((b) => Math.abs(b.ox) + Math.abs(b.oy) > 0.5 || Math.abs(b.dhp - (b.hpTo ?? b.dhp)) > 0.2);
      const step = motion === 'gentle' || !busy ? 1 / 30 : 1 / 60;
      if (t - lastDraw < step * 0.92) { raf = requestAnimationFrame(frame); return; }
      const dt = Math.min(0.05, lastDraw ? t - lastDraw : step); lastDraw = t;
      const tt = nowS();
      [me, them].forEach((b) => stepBody(b, tt, dt));
      // shake the world, not the buttons
      if (shake > 0.1 && motion === 'on') { world.style.transform = `translate3d(${((Math.random() - 0.5) * shake).toFixed(1)}px,${((Math.random() - 0.5) * shake).toFixed(1)}px,0)`; shake *= Math.pow(0.02, dt); }
      else if (shake) { shake = 0; world.style.transform = ''; }
      drawFx(tt, dt);
      [me, them].forEach((b) => { if (b.eye) { b.eye.step(tt, dt); b.eye.draw(tt); } });
      if (motion !== 'off') raf = requestAnimationFrame(frame);
    }
    function stepBody(b, t, dt) {
      // springs back to its spot: recoil, wobble, scale, fade
      const k = 140, c = 2 * Math.sqrt(k) * 0.55;
      b.vx += (-k * b.ox - c * b.vx) * dt; b.vy += (-k * b.oy - c * b.vy) * dt;
      b.ox += b.vx * dt; b.oy += b.vy * dt;
      b.rotV = (b.rotV || 0) + (-90 * b.rot - 9 * (b.rotV || 0)) * dt; b.rot += b.rotV * dt;
      b.sc += (b.scGoal - b.sc) * Math.min(1, dt * 7);
      b.alpha += (b.aGoal - b.alpha) * Math.min(1, dt * 6);
      b.flash = Math.max(0, b.flash - dt * 2.4);
      if (b.hpTo != null) b.dhp += (b.hpTo - b.dhp) * Math.min(1, dt * 4);
      let rot = b.rot, dy = 0, sc = b.sc;
      const amp = motion === 'on' ? 1 : motion === 'gentle' ? 0.4 : 0;
      if (b.dizzy) {
        // seeing stars: the gaze goes round and round, the body sways and sinks a little
        const u = t * (motion === 'gentle' ? 2.2 : 3.4);
        if (b.eye && motion !== 'off') b.eye.setTarget(Math.cos(u) * 0.7, Math.sin(u) * 0.5);
        rot += Math.sin(t * 2.3) * 0.2 * amp; dy = b.s * 0.06 * (motion === 'off' ? 1 : 1); sc *= 0.94;
      }
      if (b.proud) { const u = t - (b.pt0 || t); sc *= 1 + Math.abs(Math.sin(u * 4)) * 0.05 * Math.exp(-u * 0.4) * amp; dy -= Math.abs(Math.sin(u * 4)) * b.s * 0.03 * Math.exp(-u * 0.4) * amp; }
      if (b.asleep && motion !== 'off') dy += Math.sin(t * 1.4) * b.s * 0.015;
      const half = b.base / 2, s2 = (b.s / b.base) * sc;
      b.wrap.style.transform = `translate3d(${(b.x + b.ox * amp - half).toFixed(1)}px,${(b.y + b.oy * amp + dy - half).toFixed(1)}px,0) rotate(${rot.toFixed(3)}rad) scale(${s2.toFixed(4)})`;
      b.wrap.style.opacity = b.alpha.toFixed(3);
      b.wrap.style.filter = b.flash > 0.02 ? `brightness(${(1 + b.flash * 0.9).toFixed(2)})` : '';
    }
    const cx = (b) => b.x + (motion === 'off' ? 0 : b.ox * (motion === 'on' ? 1 : 0.4)), cy = (b) => b.y + (motion === 'off' ? 0 : b.oy * (motion === 'on' ? 1 : 0.4));
    function drawFx(t, dt) {
      g.clearRect(0, 0, W, H);
      // life halos (HP) and charge motes: the Eyes wear their own state
      [me, them].forEach((b) => drawHalo(b, t));
      g.globalCompositeOperation = 'lighter';
      fx = fx.filter((f) => drawOne(f, t));
      parts = parts.filter((p) => {
        p.life -= dt; if (p.life <= 0) return false;
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
        g.fillStyle = rgba(p.c, (p.life / p.max) * 0.9); g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
        return true;
      });
      g.globalCompositeOperation = 'source-over';
      floats = floats.filter((f) => {
        const k = (t - f.t0) / f.dur; if (k >= 1) return false;
        const a = k < 0.15 ? k / 0.15 : 1 - ease((k - 0.55) / 0.45);
        g.font = `${f.big ? 600 : 500} ${f.big ? 26 : 16}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6;
        g.fillStyle = rgba(f.c, a); g.fillText(f.txt, f.x, f.y - easeOut(k) * 34 + (f.big && k < 0.2 ? (1 - k / 0.2) * 6 : 0));
        g.shadowBlur = 0;
        return true;
      });
    }
    function drawHalo(b, t) {
      if (!S || S.phase === 'asking') return;
      const x = cx(b), y = cy(b) + (b.dizzy ? b.s * 0.06 : 0), r = b.s * 0.47, k = clamp(b.dhp / RULES.HP);
      const low = k <= 0.3, col = low ? [255, 150, 160] : b.color;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(228,241,243,0.07)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
      if (k > 0.001) {
        g.strokeStyle = rgba(col, low ? 0.55 + Math.sin(t * 5) * 0.2 * (motion === 'on' ? 1 : 0) : 0.62); g.lineWidth = 3;
        g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke();
        g.strokeStyle = rgba(col, 0.12); g.lineWidth = 9; g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke();
      }
      const st = S.state[b.mine ? roleKey(true) : roleKey(false)];
      const n = st ? st.c : 0, sp = motion === 'on' ? 0.5 : motion === 'gentle' ? 0.2 : 0;
      for (let i = 0; i < n; i++) {
        const a = t * sp + (i / RULES.MAXC) * TAU + (b.mine ? 0 : 1), mx = x + Math.cos(a) * (r + 11), my = y + Math.sin(a) * (r + 11) * 0.9;
        const gr = g.createRadialGradient(mx, my, 0, mx, my, 7); gr.addColorStop(0, rgba([235, 240, 255], 0.95)); gr.addColorStop(0.35, rgba(b.color, 0.55)); gr.addColorStop(1, rgba(b.color, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(mx, my, 7, 0, TAU); g.fill();
      }
      g.lineCap = 'butt';
    }
    function glow(x, y, r, c, a) { if (a <= 0.003 || r <= 0) return; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    function irisPoint(b, toward) {
      const x = cx(b), y = cy(b), dx = cx(toward) - x, dy = cy(toward) - y, L = Math.hypot(dx, dy) || 1;
      return { x: x + (dx / L) * b.s * 0.14, y: y + (dy / L) * b.s * 0.14, ux: dx / L, uy: dy / L, L };
    }
    function drawOne(f, t) {
      const u = t - f.t0;
      if (u < 0) return true;
      switch (f.type) {
        case 'beam': {
          const P = irisPoint(f.from, f.to), tx = cx(f.to) - P.ux * f.to.s * 0.2, ty = cy(f.to) - P.uy * f.to.s * 0.2;
          const head = clamp(u / f.travel), tail = clamp((u - f.travel - f.hold) / 0.25), life = f.travel + f.hold + 0.25;
          if (u > life) return false;
          const nx = -P.uy, ny = P.ux, bend = (f.jit || 0) * P.L;
          const pt = (k) => ({ x: mix(P.x, tx, k) + nx * bend * Math.sin(k * Math.PI), y: mix(P.y, ty, k) + ny * bend * Math.sin(k * Math.PI) });
          const a0 = easeOut(tail), a1 = easeOut(head), wob = f.wave ? 1 + Math.sin(u * 30) * 0.15 : 1;
          const seg = 14;
          for (const [w, a, c] of [[f.w * 2.6 * wob, 0.18, f.c2 || f.c], [f.w * wob, 0.55, f.c], [f.core, 0.95, [250, 252, 255]]]) {
            g.strokeStyle = rgba(c, a * (1 - tail)); g.lineWidth = w; g.lineCap = 'round';
            g.beginPath();
            for (let i = 0; i <= seg; i++) { const k = mix(a0, a1, i / seg), p = pt(k); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
            g.stroke();
          }
          const hp = pt(a1); glow(hp.x, hp.y, f.w * 3.5, f.c, 0.5 * (1 - tail));
          glow(P.x, P.y, f.w * 3, f.c, 0.6 * (1 - tail));
          if (f.heavy && motion === 'on' && Math.random() < 0.5) burst(hp.x, hp.y, f.c, 1, 60);
          return true;
        }
        case 'shield': {
          const k = u / f.dur; if (k >= 1) return false;
          const P = irisPoint(f.b, f.other), a = Math.atan2(P.uy, P.ux), r = f.b.s * 0.56, env = Math.sin(clamp(k) * Math.PI);
          for (let i = 0; i < 3; i++) {
            g.strokeStyle = rgba(i === 1 ? [220, 236, 255] : f.b.color, (0.45 - i * 0.12) * env); g.lineWidth = 2.4 - i * 0.6;
            g.beginPath(); g.arc(cx(f.b), cy(f.b), r + i * 5, a - 0.95 + i * 0.1, a + 0.95 - i * 0.1); g.stroke();
          }
          glow(cx(f.b) + P.ux * r, cy(f.b) + P.uy * r, f.b.s * 0.35, f.b.color, 0.18 * env);
          return true;
        }
        case 'gather': {
          const k = u / f.dur; if (k >= 1) return false;
          if (Math.random() < (motion === 'on' ? 0.9 : 0.35)) {
            const a = Math.random() * TAU, R = f.b.s * (0.7 + Math.random() * 0.4), x = cx(f.b) + Math.cos(a) * R, y = cy(f.b) + Math.sin(a) * R;
            parts.push({ x, y, vx: (cx(f.b) - x) * 2.6, vy: (cy(f.b) - y) * 2.6, r: 1 + Math.random() * 1.4, c: Math.random() < 0.5 ? f.b.color : [235, 240, 255], life: 0.38, max: 0.5 });
          }
          glow(cx(f.b), cy(f.b), f.b.s * 0.6, f.b.color, 0.16 * Math.sin(k * Math.PI));
          return true;
        }
        case 'ripple': {
          const k = u / f.dur; if (k >= 1) return false;
          for (let i = 0; i < 2; i++) { const kk = clamp(k * 1.3 - i * 0.3); g.strokeStyle = rgba([235, 245, 255], 0.5 * (1 - kk)); g.lineWidth = 1.4; g.beginPath(); g.arc(cx(f.b), cy(f.b), f.b.s * (0.3 + kk * 0.45), 0, TAU); g.stroke(); }
          return true;
        }
        case 'heal': {
          const k = u / f.dur; if (k >= 1) return false;
          if (Math.random() < 0.6) parts.push({ x: cx(f.b) + (Math.random() - 0.5) * f.b.s * 0.6, y: cy(f.b) + f.b.s * 0.2, vx: 0, vy: -50 - Math.random() * 40, r: 1.2 + Math.random(), c: [168, 240, 200], life: 0.8, max: 0.8 });
          return true;
        }
        case 'zzz': {
          if (!f.b.asleep && u > 0.6) return false;
          const k = (u % 1.4) / 1.4;
          g.font = '500 15px -apple-system, BlinkMacSystemFont, sans-serif'; g.textAlign = 'center';
          for (let i = 0; i < 2; i++) { const kk = (k + i * 0.5) % 1; g.fillStyle = rgba([220, 230, 255], 0.75 * Math.sin(kk * Math.PI)); g.fillText(i ? 'z' : 'Z', cx(f.b) + f.b.s * (0.32 + kk * 0.12), cy(f.b) - f.b.s * (0.28 + kk * 0.25)); }
          return true;
        }
        case 'stars': {
          if (!f.b.dizzy) return false;
          const x = cx(f.b), y = cy(f.b) - f.b.s * 0.42, sp = motion === 'on' ? 2.6 : 1.2;
          for (let i = 0; i < 3; i++) {
            const a = u * sp + (i / 3) * TAU, sx = x + Math.cos(a) * f.b.s * 0.26, sy = y + Math.sin(a) * f.b.s * 0.07, s = 4 + Math.sin(a) * 1.5;
            g.fillStyle = rgba([255, 236, 170], 0.85);
            g.beginPath(); for (let j = 0; j < 8; j++) { const aa = (j / 8) * TAU + u, rr = j % 2 ? s * 0.4 : s; g[j ? 'lineTo' : 'moveTo'](sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr); } g.closePath(); g.fill();
          }
          return true;
        }
        default: return false;
      }
    }
    function kick() {
      if (!el) return;
      if (motion === 'off') { cancelAnimationFrame(raf); raf = requestAnimationFrame((ms) => { lastDraw = 0; frame(ms); }); return; }
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function start() { lastDraw = 0; kick(); }
    function stop() { cancelAnimationFrame(raf); raf = 0; }

    return { open, close, isOpen, wake, back, asking, askSent, askFailed, askTimeout, declined, answering, answerFailed, intro, pick, theyChose, locked, play, over, toast };
  })();

  // ======================================================================================
  // the Meeting Space button
  // ======================================================================================
  function slot(box, b, ctx) {
    if (!box) return;
    box.innerHTML = '';
    if (!b || !F()) return;
    const say = (ctx && ctx.say) || flash;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ec-duel';
    btn.innerHTML = '<i class="ec-duel-g" aria-hidden="true"></i><span>Battle</span>';
    // 4.2.2: the original native link battles through its upgraded companion, once both Eyes have it
    const up = b.native && F().nativeUpgrade ? F().nativeUpgrade() : null;
    const f = b.native ? up : b.f;
    let why = '';
    if (b.native && !(up && up.peer && F().supportsDirect(up, 'duel'))) why = "Your first Eye Contact is upgrading so it can battle. It's ready once their EYES is updated (Android 4.2.2 or iPhone 2.2.2) and both Eyes have been open at the same time. Your link and its history stay exactly as they are.";
    else if (!f || !f.peer) why = 'Their Eye has to arrive first.';
    else if (!F().supports(f, 'duel')) why = F().upgradeFor && F().upgradeFor(f) ? `Upgrading this friendship for battles. It's ready once ${friendName(f)}'s EYES is updated and both Eyes have been open at the same time.` : `${friendName(f)}'s EYES needs the Battle Lite update to duel.`;
    else if (!f.profile && !(b.native && b.profile)) why = 'Their Eye is still introducing itself.';
    if (f && b.native && !f.profile && b.profile) f.profile = b.profile;   // same Eye: the native link already knows it
    btn.classList.toggle('ec-duel-off', !!why);
    btn.setAttribute('aria-label', why ? `Battle (not available): ${why}` : `Battle: challenge ${friendName(f)}'s Eye to a duel`);
    btn.onclick = () => {
      if (why) { say(why); return; }
      if (S) { say('One duel at a time.'); return; }
      challenge(f);
    };
    box.appendChild(btn);
  }

  // ======================================================================================
  // boot
  // ======================================================================================
  function boot() {
    const Fr = F(); if (!Fr || !Fr.on) return;
    Fr.on('duel', onDuel);
    Fr.on('removed', (f) => { if (call && call.code === f.code) hideCall(); if (S && S.code === f.code) { end(null, 'lost'); finish(null); } });
    if (root.Haven && Haven.back) { const orig = Haven.back.bind(Haven); Haven.back = () => { if (Scene.isOpen()) return Scene.back(); if (Call.isOpen()) { decline(); return true; } return orig(); }; }
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (Scene.isOpen()) { e.stopImmediatePropagation(); Scene.back(); }
      else if (Call.isOpen()) { e.stopImmediatePropagation(); decline(); }
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  root.EyesDuel = {
    slot, challenge, canDuel, RULES, HOOKS,
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    isOpen: () => Scene.isOpen(),
    sound: { isOn: () => Sfx.isOn(), set: (v) => Sfx.set(v) },
    _debug: { sfx: (n, d) => Sfx.play(n, d), played: () => Sfx._played.slice(), session: () => S, call: () => call, pick: (m) => lock(m, 'tap'), accept: acceptCall, decline, surrender }
  };
})(window);
