/* EYES 4.9 · Eye Exchange — trade one living Eye for another, permanently, between friends.
   Shared by Android (4.9.0) and iPhone (2.9.0). Lives inside Eye Contact: a friend's Meeting Space offers
   "Trade Eyes" next to Hang out and Battle.

   The creature travels. The phone stays.
   - An Eye's identity is its creature id `ey-<seed>-<born>`: derived from what it already was, so the same Eye
     always gets the same id (migration can run any number of times and never makes a second creature), and it
     never depends on who owns it or which phone it is on.
   - What travels: name, appearance (seed + birth nudge), growth (stage, branch, rare traits, days, how it was
     raised), mood, birth date, trade count and its journal. Nothing else: no apps, folders, dock, shortcuts,
     contacts, notifications, permissions, location, Pocket, settings, credentials or friends. Its habits with
     its old person (eyes.mind.v1) are that person's: they stay on their phone.
   - Ownership lives on the existing Firebase project (eyes-b0d38). The security rules are the authority:
     every step is one REST write that they accept whole or reject whole (see firebase/README). A trade is
     committed by one atomic multi-location update that moves both Eyes, adds both journal lines and closes
     the trade together, and only after both people confirmed the same version of it.
   - The animations never decide anything. The departure plays only after the server has confirmed the
     commit, and the arriving Eye is written into place on a fresh page from a journal (eyes-exchange-boot.js,
     or eyes-legacy.js on Android), so a crash, a closed app or a failed animation can't lose or duplicate an
     Eye. On every start and reconnect this phone checks what the server says it owns.
   - Offline, the Eye with you stays exactly as it was last verified. Nothing is ever authorized offline.

   Wire (inside the existing end-to-end encrypted Eye Contact channel, only to peers advertising 'trade'):
     kind 'trade' {x: {o: ask|yes|no|cancel|done, id: tradeId, nm?: Eye name, why?}} — nudges only. The trade
     record on the server is the truth; a lost nudge only means the other phone notices a moment later.

   Storage (this phone)
     eyes.exchange.v1        label for journals, recovery keys, what was registered, the trade in progress,
                             trades already applied, Eyes that left, cached journals (Eye Passport carries it)
     fray.exchange.journal.v1  iPhone arrival journal (Android: Legacy's journal, op 'exchange')
     sessionStorage eyes.exchange.arrive   "play the arrival" for the page that starts after an exchange */
'use strict';
(function (root) {
  const STORE = 'eyes.exchange.v1', JOURNAL = 'fray.exchange.journal.v1', ARRIVE = 'eyes.exchange.arrive';
  const TTL = 600000, MSG_MAX_AGE = TTL + 60000, VERSION = 1;
  const CID_RE = /^ey-[0-9a-f]{8}-[0-9a-z]{1,10}$/, TID_RE = /^t[0-9A-Za-z_-]{20}$/;
  const LIVE = ['haven.growth.v1', 'haven.personality.v1', 'haven.dna.v1'];
  const TS = { '.sv': 'timestamp' };
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
  const easeIn = (t) => Math.pow(clamp(t), 2.2);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const parse = (v) => { if (v == null) return null; try { return JSON.parse(v); } catch (e) { return null; } };
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  const del = (k) => { try { localStorage.removeItem(k); } catch (e) {} };
  const nowMs = () => Date.now();
  const rid = (n) => { const b = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const newTid = () => 't' + rid(15);
  const newKey = () => rid(24);
  const cleanLabel = (s) => String(s == null ? '' : s).replace(/[<>&"'\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const cleanName = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, '').trim().slice(0, 14);
  const log = [];
  const note = (m) => { log.push({ at: nowMs(), m }); if (log.length > 60) log.shift(); try { console.info('[EYES Exchange]', m); } catch (e) {} };
  const F = () => root.EyesFriends, C = () => root.EyesContact, D = () => root.HavenDNA;

  // ======================================================================================
  //  This phone's record
  // ======================================================================================
  function load() {
    const s = parse(get(STORE));
    const o = s && typeof s === 'object' ? s : {};
    return {
      v: 1, label: cleanLabel(o.label), asked: !!o.asked,
      keys: o.keys && typeof o.keys === 'object' ? o.keys : {},
      reg: o.reg && typeof o.reg === 'object' ? o.reg : {},
      known: o.known && typeof o.known === 'object' ? o.known : {},
      pending: o.pending && TID_RE.test(String(o.pending.tid || '')) ? o.pending : null,
      applied: Array.isArray(o.applied) ? o.applied.filter((x) => TID_RE.test(String(x))).slice(-40) : [],
      departed: o.departed && typeof o.departed === 'object' ? o.departed : {},
      journals: o.journals && typeof o.journals === 'object' ? o.journals : {},
      counts: o.counts && typeof o.counts === 'object' ? o.counts : {},
      minds: o.minds && typeof o.minds === 'object' ? o.minds : {},
      offset: Number(o.offset) || 0, offsetAt: Number(o.offsetAt) || 0
    };
  }
  let S = load();
  function save() { try { set(STORE, S); } catch (e) { note('could not save the exchange record'); } }
  function reloadStore() { S = load(); }

  // ======================================================================================
  //  Identity: every Eye is one creature, whoever it lives with
  // ======================================================================================
  const cidOf = (seed, born) => 'ey-' + (Number(seed) >>> 0).toString(16).padStart(8, '0') + '-' + Math.max(0, Math.floor(Number(born) || 0)).toString(36);
  const legacyId = (cid) => 'e' + cid.slice(3);
  function liveDNA() { const d = parse(get('haven.dna.v1')); return d && Number.isFinite(Number(d.seed)) ? d : null; }
  function myCid() { const d = liveDNA(); return d ? cidOf(d.seed, d.born) : null; }
  // Migration: give every Eye this phone has (the Eye with you, and on Android every Eye you raised) its
  // creature id. Pure derivation plus a first-seen date: running it again changes nothing.
  function migrate() {
    let changed = false;
    const add = (seed, born, name) => {
      const cid = cidOf(seed, born);
      if (!S.known[cid]) { S.known[cid] = { since: nowMs(), name: cleanName(name) }; changed = true; }
      else if (name && S.known[cid].name !== cleanName(name)) { S.known[cid].name = cleanName(name); changed = true; }
    };
    const d = liveDNA(); if (d) add(d.seed, d.born, d.name);
    try { if (root.EyesLegacy) for (const r of EyesLegacy.list()) add(r.seed, r.born, r.name); } catch (e) {}
    if (changed) save();
    return Object.keys(S.known).length;
  }

  // ======================================================================================
  //  The creature that travels (and only that)
  // ======================================================================================
  const int = (x, lo, hi, def = 0) => { const n = Math.floor(Number(x)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  function cleanGrowth(g) {
    if (!g || typeof g !== 'object') return null;
    const L = D() && D().GENES, rare = L ? L.RARE_TRAITS.map((t) => t.id) : [];
    const branches = D() ? Object.keys(D().BRANCHES) : ['gentle', 'feral', 'nocturnal', 'radiant'];
    const stage = int(g.stage, 0, 3);
    const out = {
      v: 1, days: int(g.days, 1, 100000, 1), lastDay: /^\d{4}-\d{1,2}-\d{1,2}$/.test(String(g.lastDay)) ? String(g.lastDay) : null,
      pets: int(g.pets, 0, 1e7), pokes: int(g.pokes, 0, 1e7), night: int(g.night, 0, 1e7), day: int(g.day, 0, 1e7),
      stage, branch: branches.includes(g.branch) ? g.branch : null,
      mutations: (Array.isArray(g.mutations) ? g.mutations : []).filter((m) => m && rare.includes(m.id)).slice(0, 5).map((m) => ({ id: m.id, stage: int(m.stage, 0, 3) })),
      history: (Array.isArray(g.history) ? g.history : []).filter((h) => h && Number.isFinite(Number(h.at))).slice(-12).map((h) => ({ stage: int(h.stage, 0, 3), at: Number(h.at), branch: branches.includes(h.branch) ? h.branch : null })),
      pending: null, skip: int(g.skip, 0, 1000)
    };
    if (!out.lastDay) delete out.lastDay;
    if (g.pending && typeof g.pending === 'object') {
      out.pending = { from: int(g.pending.from, 0, 3), to: int(g.pending.to, 0, 3), branch: branches.includes(g.pending.branch) ? g.pending.branch : null,
        gained: (Array.isArray(g.pending.gained) ? g.pending.gained : []).filter((id) => rare.includes(id)).slice(0, 5), at: Number(g.pending.at) || nowMs() };
    }
    return out;
  }
  function cleanMood(m) {
    const out = {};
    if (m && typeof m === 'object') for (const k of ['energy', 'curiosity', 'sleepiness', 'missing', 'content']) if (Number.isFinite(Number(m[k]))) out[k] = clamp(Number(m[k]));
    return out;
  }
  function cleanDNA(d) {
    if (!d || typeof d !== 'object' || !Number.isFinite(Number(d.seed))) return null;
    const out = { v: 1, seed: Number(d.seed) >>> 0, name: cleanName(d.name), born: Number.isFinite(Number(d.born)) ? Math.floor(Number(d.born)) : 0 };
    const lean = D() && D().lib.cleanLean ? D().lib.cleanLean(d.lean) : null;
    if (lean) out.lean = lean;
    return out;
  }
  // the body as it will be stored: exactly the creature, nothing about its person
  function bodyOfLive() {
    const dna = cleanDNA(liveDNA()); if (!dna) return null;
    const growth = cleanGrowth(parse(get('haven.growth.v1')));
    const pers = parse(get('haven.personality.v1'));
    return { v: VERSION, cid: cidOf(dna.seed, dna.born), dna, growth, mood: cleanMood(pers && pers.mood) };
  }
  function cleanBody(b, cid) {
    if (typeof b === 'string') b = parse(b);
    if (!b || typeof b !== 'object' || b.v !== VERSION) return null;
    const dna = cleanDNA(b.dna); if (!dna) return null;
    if (cidOf(dna.seed, dna.born) !== cid) return null;            // a body is always its own creature
    return { v: VERSION, cid, dna, growth: cleanGrowth(b.growth), mood: cleanMood(b.mood) };
  }
  // the keys the arriving Eye is written into (the habits key is handled by the journal)
  function snapOf(body) {
    const mood = { ...body.mood, missing: 0, curiosity: Math.max(body.mood.curiosity || 0.5, 0.82) };   // a new place to discover
    const snap = { 'haven.dna.v1': JSON.stringify(body.dna), 'haven.personality.v1': JSON.stringify({ mood, lastSeen: nowMs() }) };
    if (body.growth) snap['haven.growth.v1'] = JSON.stringify(body.growth);
    return snap;
  }
  // the real, grown creature from a body: the same rules haven-dna.js applies at home, so what you see in the
  // preview is the Eye that will arrive
  function dnaOfBody(body) {
    if (!body || !D()) return null;
    const g = body.growth || { stage: 0, branch: null, mutations: [], days: 1, skip: 0 };
    const d = D().friendDNA({ seed: body.dna.seed, name: body.dna.name, stage: g.stage, branch: g.branch, mutations: (g.mutations || []).map((m) => m.id), born: body.dna.born, lean: body.dna.lean || null });
    if (d && (g.stage | 0) === 0) { const L = D().lib; d.growthPattern = L.mix(0.45, 0.85, L.clamp(((g.days || 1) + (g.skip || 0) - 1) / 6)); }
    if (d) d.daysLived = (g.days || 1) + (g.skip || 0);
    return d;
  }
  function about(body, extra) {
    const d = dnaOfBody(body); if (!d) return null;
    const g = body.growth || {}, stage = D().STAGES[int(g.stage, 0, 3)];
    return {
      cid: body.cid, name: d.name || 'Eye', dna: d, born: body.dna.born, words: (d.words || []).slice(0, 2), first: d.firstWord,
      tier: D().lib.tierLabel ? D().lib.tierLabel(d.tier) : d.tier, stage: stage ? stage.name : '', branch: g.branch ? (D().BRANCHES[g.branch] || {}).name : null,
      iris: d.pal && d.pattern ? (d.pal.id + ' ' + d.pattern.name.toLowerCase()) : '', days: d.daysLived || 1, ...(extra || {})
    };
  }

  // ======================================================================================
  //  Firebase (the existing project and anonymous device sign-in, through eyes-firebase.js)
  // ======================================================================================
  const FB = () => root.EyesFirebase;
  const available = () => !!(FB() && FB().session && FB().project);
  const err = (m, status, extra) => Object.assign(new Error(m), { status: status || 0 }, extra || {});
  async function call(method, path, body) {
    if (!available()) throw err('Eye Exchange needs the Eye Contact service', 0, { kind: 'setup' });
    if (navigator.onLine === false) throw err('offline', 0, { kind: 'offline' });
    const user = await FB().session();
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(FB().project + '/' + path + '.json?auth=' + encodeURIComponent(user.token), {
        method, cache: 'no-store', signal: ctl.signal, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (!r.ok) throw err('Eye Exchange service returned ' + r.status, r.status, { kind: r.status === 401 || r.status === 403 ? 'denied' : 'server' });
      return await r.json();
    } catch (e) {
      if (e.status) throw e;
      throw err(e && e.name === 'AbortError' ? 'timeout' : 'network', 0, { kind: navigator.onLine === false ? 'offline' : e && e.name === 'AbortError' ? 'timeout' : 'network' });
    } finally { clearTimeout(timer); }
  }
  const read = (p) => call('GET', 'exchangeV1/' + p);
  const tryRead = (p) => read(p).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
  const update = (paths) => call('PATCH', 'exchangeV1', paths);
  const me = async () => (await FB().session()).uid;
  const serverNow = () => nowMs() + (S.offset || 0);

  // a live view of one trade: the server's stream, plus a slow poll so a quiet stream can't hide a change
  function watch(tid, onValue, onTrouble) {
    let closed = false, es = null, poll = 0, value, last = '';
    // A trade only ever moves forward (a new version, more confirmations, then an end), so whichever source
    // answers first (stream or poll), a view that is behind the one already shown is never shown again.
    const progress = (r) => (r && typeof r === 'object' ? [r.st && r.st !== 'open' ? 1 : 0, Number(r.rev) || 0, (r.ca === r.rev ? 1 : 0) + (r.cb === r.rev ? 1 : 0), r.b && r.b.uid ? 1 : 0] : [-1]);
    const behind = (x, y) => { const a = progress(x), b = progress(y); for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0); } return false; };
    const emit = (v) => { const k = JSON.stringify(v); if (k === last) return; if (value && behind(v, value)) return; last = k; value = v; onValue(v); };
    const applyAt = (base, path, data) => {
      const parts = String(path || '/').split('/').filter(Boolean);
      if (!parts.length) return data;
      const out = base && typeof base === 'object' ? JSON.parse(JSON.stringify(base)) : {};
      let n = out; for (let i = 0; i < parts.length - 1; i++) { if (!n[parts[i]] || typeof n[parts[i]] !== 'object') n[parts[i]] = {}; n = n[parts[i]]; }
      if (data === null) delete n[parts[parts.length - 1]]; else n[parts[parts.length - 1]] = data;
      return out;
    };
    async function open() {
      if (closed) return;
      try {
        const user = await FB().session(); if (closed) return;
        es = new EventSource(FB().project + '/exchangeV1/trades/' + tid + '.json?auth=' + encodeURIComponent(user.token));
        const onEv = (ev) => { try { const f = JSON.parse(ev.data); if (ev.type === 'put') emit(applyAt(value, f.path, f.data)); else if (f && f.data) { let v = value; for (const [k, x] of Object.entries(f.data)) v = applyAt(v, (f.path === '/' ? '' : f.path) + '/' + k, x); emit(v); } onTrouble(null); } catch (e) {} };
        es.addEventListener('put', onEv); es.addEventListener('patch', onEv);
        es.addEventListener('cancel', () => { onTrouble('denied'); });
        es.onerror = () => { onTrouble('stream'); };
        const renew = Math.max(30000, user.until - nowMs() - 110000);
        setTimeout(() => { if (!closed && es) { try { es.close(); } catch (e) {} es = null; open(); } }, renew);
      } catch (e) { onTrouble('stream'); setTimeout(open, 4000); }
    }
    async function tick() {
      if (closed) return;
      try { emit(await read('trades/' + tid)); onTrouble(null); } catch (e) { onTrouble(e.kind === 'denied' ? 'denied' : 'poll'); }
      if (!closed) poll = setTimeout(tick, document.hidden ? 15000 : 3000);
    }
    open(); poll = setTimeout(tick, 1500);
    return { close() { closed = true; clearTimeout(poll); try { es && es.close(); } catch (e) {} }, refresh: () => { clearTimeout(poll); return tick(); }, value: () => value };
  }

  // ======================================================================================
  //  Ownership
  // ======================================================================================
  // Make sure the server knows this Eye and that it is ours. Returns 'mine' | 'elsewhere'.
  async function ensureMine(cid, body) {
    const uid = await me();
    const o = await tryRead('own/' + cid);
    if (o.ok && o.v && o.v.uid === uid) { remember(cid, o.v); await ensureKey(cid); return 'mine'; }
    if (!o.ok && o.e.kind !== 'denied') throw o.e;
    const k = S.keys[cid];
    if (k) {                                    // registered before (maybe from another install of EYES): prove it
      const k2 = newKey(), n = S.counts[cid] || 0;
      try {
        await update({ [`own/${cid}`]: { uid, n, at: TS }, [`keys/${cid}`]: { k: k2, prev: k }, [`owners/${uid}/${cid}`]: true });
        S.keys[cid] = k2; S.reg[cid] = nowMs(); save(); note('reclaimed ' + cid + ' for this install');
        return 'mine';
      } catch (e) { if (e.kind !== 'denied') throw e; }
    }
    if (!S.reg[cid] || !k) {
      const k1 = newKey(); body = body || bodyOfLive();
      try {
        await update({ [`own/${cid}`]: { uid, n: 0, at: TS }, [`body/${cid}`]: JSON.stringify(body), [`hist/${cid}/born`]: { at: TS, who: S.label || '' },
          [`keys/${cid}`]: { k: k1 }, [`owners/${uid}/${cid}`]: true });
        S.keys[cid] = k1; S.reg[cid] = nowMs(); S.counts[cid] = 0; save(); note('registered ' + cid);
        return 'mine';
      } catch (e) { if (e.kind !== 'denied') throw e; }
    }
    S.known[cid] = { ...(S.known[cid] || {}), elsewhere: nowMs() }; save();
    return 'elsewhere';
  }
  function remember(cid, own) { if (own && Number.isFinite(own.n)) S.counts[cid] = own.n; S.reg[cid] = S.reg[cid] || nowMs(); if (S.known[cid]) delete S.known[cid].elsewhere; save(); }
  async function ensureKey(cid) {
    if (S.keys[cid]) return true;
    const k = newKey();
    try { await update({ [`keys/${cid}`]: { k } }); S.keys[cid] = k; save(); return true; }
    catch (e) { note('no recovery key could be set for ' + cid); return false; }
  }
  async function journalOf(cid) {
    const h = await tryRead('hist/' + cid);
    if (h.ok && h.v) { S.journals[cid] = h.v; save(); return h.v; }
    return S.journals[cid] || null;
  }

  // ======================================================================================
  //  Messages (end-to-end encrypted Eye Contact channel)
  // ======================================================================================
  const friendName = (f) => { if (!f) return 'Your friend'; return f.nick || (f.profile && f.profile.name) || 'Your friend'; };
  const viaFor = (f) => (F() && F().tradeVia ? F().tradeVia(f) : null);
  function tell(f, x) { try { return F() && F().trade ? F().trade(f, x) : Promise.resolve(false); } catch (e) { return Promise.resolve(false); } }

  // ======================================================================================
  //  The trade in progress (one at a time)
  // ======================================================================================
  /* phases: compose → sending → waiting (invitation sent) | incoming (card) → joining → preview →
     confirmed (mine) → committing → done → departing → (reload) ; or declined | canceled | expired | failed */
  let T = null;                       // { tid, role:'a'|'b', f, fkey, phase, rec, mine:{cid,body,about}, theirs:{…}, watch, … }
  const busy = () => !!(T && !['declined', 'canceled', 'expired', 'failed', 'done-shown'].includes(T.phase));
  const listeners = {};
  const emit = (n, ...a) => (listeners[n] || []).forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } });
  function phase(p, why) { if (!T) return; T.phase = p; T.why = why || ''; note('trade ' + T.tid + ' → ' + p + (why ? ' (' + why + ')' : '')); emit('phase', p, T); render(); }
  const sideOf = (rec, uid) => (rec && rec.a && rec.a.uid === uid ? 'a' : rec && rec.b && rec.b.uid === uid ? 'b' : null);
  const expiresAt = (rec) => (rec && rec.created ? rec.created + TTL : 0);
  // this phone's idea of expiry only ever errs late: the server enforces the real deadline
  const grace = () => (S.offsetAt && nowMs() - S.offsetAt < 30 * 86400000 ? 15000 : 120000);
  const expired = (rec) => !!(rec && rec.st === 'open' && expiresAt(rec) && serverNow() > expiresAt(rec) + grace());

  function canTradeWith(f, b) {
    if (!F() || !available()) return 'Eye Exchange needs Eye Contact on this phone.';
    if (!D() || !D().has || !D().has()) return 'Your Eye has to wake up first.';
    if (b && b.native && !(f && f.peer)) return 'Trading needs a fresh Eye Contact invite with this friend (EYES 4.9 or iPhone 2.9).';
    if (!f || !f.peer) return 'Their Eye has to arrive first.';
    if (!viaFor(f)) return `${friendName(f)}'s EYES needs the Eye Exchange update (Android 4.9 or iPhone 2.9) to trade Eyes.`;
    if (!f.profile) return 'Their Eye is still introducing itself.';
    if (root.EyesLegacy && EyesLegacy.awakening && EyesLegacy.awakening()) return 'An awakening is in progress.';
    return '';
  }

  // ---------- inviting ----------
  async function invite(f) {
    if (busy()) { say('One trade at a time.'); return; }
    const why = canTradeWith(f); if (why) { say(why); return; }
    const body = bodyOfLive(); if (!body) { say('Your Eye has to wake up first.'); return; }
    T = { tid: newTid(), role: 'a', f, fkey: keyOf(f), phase: 'compose', mine: { cid: body.cid, body, about: about(body) }, theirs: { profile: f.profile }, started: nowMs() };
    openScene();
  }
  async function send() {
    if (!T || T.phase !== 'compose') return;
    if (T.labelInput != null) { S.label = cleanLabel(T.labelInput); S.asked = true; save(); }
    phase('sending');
    try {
      const uid = await me();
      const state = await ensureMine(T.mine.cid, T.mine.body);
      if (state !== 'mine') { phase('failed', 'elsewhere'); return; }
      await freeStaleLock(T.mine.cid, uid);
      const t0 = nowMs();
      await update({ [`trades/${T.tid}`]: { a: { uid, cid: T.mine.cid, label: S.label || '' }, rev: 1, st: 'open', created: TS },
        [`own/${T.mine.cid}/lock`]: T.tid, [`body/${T.mine.cid}`]: JSON.stringify(T.mine.body) });
      S.pending = { tid: T.tid, role: 'a', out: T.mine.cid, fkey: T.fkey, at: nowMs() }; save();
      T.uid = uid;
      const rec = await read('trades/' + T.tid);
      if (rec && rec.created) { S.offset = Math.round(rec.created - (t0 + nowMs()) / 2); S.offsetAt = nowMs(); save(); }
      T.rec = rec;
      const ok = await tell(T.f, { o: 'ask', id: T.tid, nm: T.mine.about.name });
      phase('waiting', ok ? '' : 'nudge');
      follow();
      if (T.crossed) { const c = T.crossed; T.crossed = null; return crossed(c.f, c.x); }
    } catch (e) { failed(e); }
  }
  // a lock left behind by an earlier trade of ours that never finished (the app closed): release it first
  async function freeStaleLock(cid, uid) {
    const o = await tryRead('own/' + cid);
    if (!o.ok || !o.v || !o.v.lock) return;
    const lt = await tryRead('trades/' + o.v.lock);
    const open = lt.ok && lt.v && lt.v.st === 'open' && !expired(lt.v);
    if (open && sideOf(lt.v, uid) && !(lt.v.ca === lt.v.rev && lt.v.cb === lt.v.rev)) {
      try { await update({ [`trades/${o.v.lock}/st`]: 'cancel', [`trades/${o.v.lock}/by`]: uid, [`own/${cid}/lock`]: null }); } catch (e) {}
    } else if (!open) { try { await update({ [`own/${cid}/lock`]: null }); } catch (e) {} }
    else throw err('busy', 0, { kind: 'locked' });
  }

  // ---------- being invited ----------
  const handled = new Set();
  async function onMessage(f, x, at) {
    if (!x || typeof x !== 'object' || !TID_RE.test(String(x.id || ''))) return;
    const age = Math.abs(nowMs() - (Number(at) || nowMs()));
    if (age > MSG_MAX_AGE) return;
    if (x.o === 'ask') {
      if (handled.has(x.id) || S.applied.includes(x.id)) return;
      handled.add(x.id);
      if (T && T.tid === x.id) return;
      // crossed invitations: both of you asked at once. The smaller trade id is the one both phones keep.
      if (T && T.role === 'a' && T.fkey === keyOf(f) && T.phase === 'compose') { closeScene(false); T = null; return incoming(f, x, false); }   // nothing sent yet: theirs it is
      if (T && T.role === 'a' && T.fkey === keyOf(f) && T.phase === 'sending') { T.crossed = { f, x }; return; }   // decided once ours exists
      if (T && T.role === 'a' && T.fkey === keyOf(f) && T.phase === 'waiting') return crossed(f, x);
      if (busy()) { tell(f, { o: 'no', id: x.id, why: 'busy' }); return; }
      return incoming(f, x, false);
    }
    if (!T || T.tid !== x.id) return;
    if (x.o === 'cancel' && T.phase === 'incoming') { const t = T; hideCall(); stopFollow(t); T = null; return; }
    if (T.watch) T.watch.refresh();                   // yes / no / cancel / done: the record says what happened
  }
  // both of you asked at once: the smaller trade id is the one both phones keep, the other is withdrawn
  async function crossed(f, x) {
    if (!T || x.id > T.tid) return;                   // theirs is the larger: they will join ours
    const mine = T; await cancelQuietly(mine); T = null;
    return incoming(f, x, true);
  }
  async function incoming(f, x, crossed) {
    T = { tid: x.id, role: 'b', f, fkey: keyOf(f), phase: 'incoming', theirs: { profile: f.profile, name: cleanName(x.nm) || friendName(f) }, mine: null, started: nowMs() };
    try {
      const rec = await read('trades/' + x.id);
      if (!rec || rec.st !== 'open' || expired(rec) || (rec.b && rec.b.uid)) { T = null; return; }
      T.rec = rec;
      const body = bodyOfLive(); if (!body) { T = null; return; }
      T.mine = { cid: body.cid, body, about: about(body) };
      if (crossed) return accept();
      showCall();
      follow();
    } catch (e) { note('invitation could not be read: ' + e.message); T = null; }
  }
  async function accept() {
    if (!T || T.role !== 'b' || !['incoming'].includes(T.phase)) return;
    hideCall();
    if (T.labelInput != null) { S.label = cleanLabel(T.labelInput); S.asked = true; save(); }
    phase('joining'); openScene();
    try {
      const uid = await me(); T.uid = uid;
      const t = T, rec = await read('trades/' + T.tid);
      if (T !== t) return;
      if (!rec || rec.st !== 'open' || expired(rec)) { phase(rec && rec.st === 'cancel' ? 'canceled' : 'expired'); return; }
      const state = await ensureMine(T.mine.cid, T.mine.body);
      if (state !== 'mine') { phase('failed', 'elsewhere'); return; }
      await freeStaleLock(T.mine.cid, uid);
      await update({ [`trades/${T.tid}/b`]: { uid, cid: T.mine.cid, label: S.label || '' }, [`trades/${T.tid}/rev`]: rec.rev + 1,
        [`own/${T.mine.cid}/lock`]: T.tid, [`body/${T.mine.cid}`]: JSON.stringify(T.mine.body) });
      S.pending = { tid: T.tid, role: 'b', out: T.mine.cid, fkey: T.fkey, at: nowMs() }; save();
      tell(T.f, { o: 'yes', id: T.tid, nm: T.mine.about.name });
      follow(); await T.watch.refresh();
    } catch (e) { failed(e); }
  }
  async function decline() {
    if (!T || T.role !== 'b') return;
    const t = T; hideCall();
    try { const uid = await me(); await update({ [`trades/${t.tid}/st`]: 'decline', [`trades/${t.tid}/by`]: uid, [`trades/${t.tid}/b/uid`]: uid }); } catch (e) {}
    tell(t.f, { o: 'no', id: t.tid });
    stopFollow(t); T = null;
  }

  // ---------- following the record ----------
  function follow() {
    if (!T || T.watch) return;
    const t = T;
    t.watch = watch(t.tid, (rec) => onRecord(t, rec), (trouble) => {
      if (T !== t) return;
      // an invitation we haven't answered stops being readable once it is withdrawn, taken or over
      if (trouble === 'denied' && t.phase === 'incoming') { hideCall(); stopFollow(t); T = null; return; }
      const was = t.trouble; t.trouble = trouble;
      if (!!was !== !!trouble) render();
    });
    t.clock = setInterval(() => {
      if (T !== t) return;
      if (t.rec && expired(t.rec) && !['committing', 'done', 'departing'].includes(t.phase)) return onExpired(t);
      // both confirmed in separate writes and the inviter's phone hasn't sealed it: this phone does
      if (t.phase === 'confirmed' && t.iConfirmed && t.theyConfirmed && t.bothAt && nowMs() - t.bothAt > 2500 && !t.committing) commit(t);
      renderClock();
    }, 1000);
  }
  function stopFollow(t) { if (!t) return; if (t.watch) t.watch.close(); t.watch = null; clearInterval(t.clock); }
  async function onRecord(t, rec) {
    if (T !== t || !rec) return;
    t.rec = rec; const my = (t.recN = (t.recN || 0) + 1);
    if (rec.st === 'done') return finalize(t, rec);
    if (rec.st === 'cancel' || rec.st === 'decline') {
      if (['committing'].includes(t.phase)) return;
      const byMe = rec.by && rec.by === t.uid;
      await releaseLock(t);
      if (T !== t) return;                              // this phone moved on meanwhile (e.g. crossed invitations)
      if (t.phase === 'incoming') { hideCall(); stopFollow(t); T = null; return; }
      phase(rec.st === 'decline' ? 'declined' : 'canceled', byMe ? 'me' : 'them'); stopFollow(t); clearPending(t.tid); return;
    }
    if (expired(rec)) return onExpired(t);
    if (rec.a && rec.b && rec.b.cid && !['committing', 'done', 'departing'].includes(t.phase)) {
      if (!t.theirs.body || t.theirs.cid !== (t.role === 'a' ? rec.b.cid : rec.a.cid) || t.theirs.rev !== rec.rev) { await loadTheirs(t, rec); if (my !== t.recN || T !== t) return; }   // a newer view arrived meanwhile
      const mineC = t.role === 'a' ? rec.ca : rec.cb, theirC = t.role === 'a' ? rec.cb : rec.ca;
      t.theyConfirmed = theirC === rec.rev; t.iConfirmed = mineC === rec.rev;
      if (t.iConfirmed && t.theyConfirmed) { if (t.role === 'a' || nowMs() - (t.bothAt || (t.bothAt = nowMs())) > 2500) return commit(t); }
      if (t.confirming) render();
      else if (['waiting', 'joining', 'preview', 'confirmed'].includes(t.phase)) phase(t.iConfirmed ? 'confirmed' : 'preview');
      else render();
    }
  }
  async function loadTheirs(t, rec) {
    const cid = t.role === 'a' ? rec.b.cid : rec.a.cid;
    try {
      const [b, own, hist] = await Promise.all([read('body/' + cid), read('own/' + cid), tryRead('hist/' + cid)]);
      const body = cleanBody(b, cid);
      if (!body) { phase('failed', 'their Eye could not be read'); return; }
      t.theirs = { ...t.theirs, cid, body, rev: rec.rev, n: own ? own.n : 0, hist: hist.ok ? hist.v : null, label: (t.role === 'a' ? rec.b.label : rec.a.label) || '' };
      t.theirs.about = about(body, { trades: t.theirs.n });
      const mineHist = await tryRead('hist/' + t.mine.cid);
      t.mine.hist = mineHist.ok ? mineHist.v : null; t.mine.n = S.counts[t.mine.cid] || 0; t.mine.about = about(t.mine.body, { trades: t.mine.n });
      if (sceneEyes) sceneEyes.setTheirs(t.theirs.about.dna);
    } catch (e) { note('their Eye: ' + e.message); }
  }
  async function confirm() {
    const t = T; if (!t || !['preview'].includes(t.phase) || !t.rec || t.trouble) return;
    let rec = t.rec; const field = t.role === 'a' ? 'ca' : 'cb';
    phase('confirmed'); t.confirming = true;
    try {
      // a name for the journals chosen just now changes this side of the offer: a new version that both
      // people confirm again (the server clears every earlier confirmation)
      const want = t.labelInput != null ? cleanLabel(t.labelInput) : null, side = rec[t.role] || {};
      if (want != null && want !== (side.label || '')) {
        await update({ [`trades/${t.tid}/${t.role}/label`]: want, [`trades/${t.tid}/rev`]: rec.rev + 1, [`trades/${t.tid}/ca`]: null, [`trades/${t.tid}/cb`]: null });
        S.label = want; S.asked = true; save(); t.labelInput = null;
        rec = await read('trades/' + t.tid); t.rec = rec;
      } else if (want != null) { S.asked = true; save(); }
      const theirs = t.role === 'a' ? rec.cb : rec.ca;
      if (theirs === rec.rev) { t.confirming = false; return commit(t); }       // I am the second: confirm and commit at once
      await update({ [`trades/${t.tid}/${field}`]: rec.rev });
      t.confirming = false;
      await t.watch.refresh();
    } catch (e) {
      t.confirming = false;
      if (T !== t) return;
      if (e.kind === 'denied') { await t.watch.refresh(); if (T === t && t.phase === 'confirmed' && !(t.rec && t.rec[field] === t.rec.rev)) phase('preview', 'changed'); }
      else { phase('preview', 'net'); }
    }
  }
  // The one write that moves both Eyes. Whoever confirms second sends it; if both confirmed separately the
  // inviter sends it (the other waits 2.5 s, then sends it too: only one can ever succeed).
  async function commit(t) {
    if (T !== t || t.committing) return;
    t.committing = true; phase('committing');
    const tid = t.tid;
    const send = async (rec) => {
      try {
        const [oa, ob] = await Promise.all([read('own/' + rec.a.cid), read('own/' + rec.b.cid)]);
        const field = t.role === 'a' ? 'ca' : 'cb';
        await update({
          [`trades/${tid}/st`]: 'done', [`trades/${tid}/done`]: TS, [`trades/${tid}/${field}`]: rec.rev,
          [`own/${rec.a.cid}`]: { uid: rec.b.uid, n: (oa ? oa.n : 0) + 1, at: TS }, [`own/${rec.b.cid}`]: { uid: rec.a.uid, n: (ob ? ob.n : 0) + 1, at: TS },
          // the journal lines carry exactly the labels each person chose for themselves (the rules check this)
          [`hist/${rec.a.cid}/${tid}`]: { at: TS, from: rec.a.label, to: rec.b.label }, [`hist/${rec.b.cid}/${tid}`]: { at: TS, from: rec.b.label, to: rec.a.label },
          [`keys/${rec.a.cid}`]: null, [`keys/${rec.b.cid}`]: null,
          [`owners/${rec.a.uid}/${rec.a.cid}`]: null, [`owners/${rec.b.uid}/${rec.a.cid}`]: true, [`owners/${rec.b.uid}/${rec.b.cid}`]: null, [`owners/${rec.a.uid}/${rec.b.cid}`]: true
        });
        note('commit accepted');
      } catch (e) { note('commit: ' + (e.kind || e.message)); }     // refused (already sealed, or it changed) or lost
    };
    await send(t.rec);
    // whatever happened on the wire, the server's record decides
    let sends = 1;
    for (let i = 0; i < 60 && T === t; i++) {
      let r;
      try { r = await read('trades/' + tid); }
      catch (e) { phase('committing', 'reconnecting'); await new Promise((ok) => setTimeout(ok, Math.min(6000, 800 * (i + 1)))); continue; }
      if (r && r.st === 'done') return finalize(t, r);
      t.committing = false; t.rec = r;
      if (!r || r.st !== 'open' || expired(r)) return onRecord(t, r);
      if (!(r.ca === r.rev && r.cb === r.rev)) { t.iConfirmed = (t.role === 'a' ? r.ca : r.cb) === r.rev; phase(t.iConfirmed ? 'confirmed' : 'preview', 'changed'); return; }
      if (sends >= 3) { phase('confirmed', 'retrying'); return; }
      await new Promise((ok) => setTimeout(ok, 900 * sends));
      if (T !== t) return;
      t.committing = true; phase('committing'); sends++; await send(r);
    }
  }
  async function cancel(why) {
    const t = T; if (!t) return;
    if (['committing', 'done', 'departing'].includes(t.phase)) return;
    if (['declined', 'canceled', 'expired', 'failed', 'compose'].includes(t.phase)) { stopFollow(t); T = null; closeScene(); return; }
    await cancelQuietly(t);
    if (T === t) phase('canceled', 'me'); stopFollow(t);
  }
  async function cancelQuietly(t) {
    try {
      const uid = t.uid || await me();
      const paths = { [`trades/${t.tid}/st`]: 'cancel', [`trades/${t.tid}/by`]: uid };
      if (t.mine && (t.rec ? sideOf(t.rec, uid) : t.uid)) paths[`own/${t.mine.cid}/lock`] = null;
      await update(paths);
    } catch (e) { note('cancel: ' + (e.kind || e.message)); }
    tell(t.f, { o: 'cancel', id: t.tid });
    clearPending(t.tid); stopFollow(t);
  }
  async function releaseLock(t) { if (!t.mine || !t.uid) return; try { await update({ [`own/${t.mine.cid}/lock`]: null }); } catch (e) {} }
  async function onExpired(t) {
    if (T !== t || ['expired', 'committing', 'done', 'departing'].includes(t.phase)) return;
    if (t.phase === 'incoming') { hideCall(); stopFollow(t); T = null; return; }
    stopFollow(t);
    try { const uid = t.uid || await me(); await update({ [`trades/${t.tid}/st`]: 'cancel', [`trades/${t.tid}/by`]: uid, ...(t.uid ? { [`own/${t.mine.cid}/lock`]: null } : {}) }); } catch (e) {}
    clearPending(t.tid); if (T === t) phase('expired');
  }
  function clearPending(tid) { if (S.pending && S.pending.tid === tid) { S.pending = null; save(); } }
  function failed(e) {
    const kind = e && e.kind;
    const why = kind === 'offline' ? 'offline' : kind === 'locked' ? 'locked' : kind === 'denied' ? 'denied' : kind === 'setup' ? 'setup' : 'net';
    if (T && T.mine && T.uid && T.phase !== 'compose') releaseLock(T);
    if (T) { clearPending(T.tid); stopFollow(T); }
    phase('failed', why);
  }

  // ---------- the server confirmed: the Eyes really changed homes ----------
  async function finalize(t, rec, recovering) {
    if (t.finalized) return; t.finalized = true;
    stopFollow(t);
    const uid = t.uid || await me();
    const role = sideOf(rec, uid); if (!role) { phase('failed', 'not a participant'); return; }
    const out = role === 'a' ? rec.a.cid : rec.b.cid, inn = role === 'a' ? rec.b.cid : rec.a.cid;
    const theirLabel = (role === 'a' ? rec.b.label : rec.a.label) || '';
    let body = null;
    for (let i = 0; i < 8 && !body; i++) {
      try {
        const own = await read('own/' + inn);
        if (!own || own.uid !== uid) throw err('not ours yet', 0, { kind: 'server' });
        body = cleanBody(await read('body/' + inn), inn);
        S.counts[inn] = own.n; S.reg[inn] = nowMs();
      } catch (e) { await new Promise((ok) => setTimeout(ok, 1200 * (i + 1))); }
    }
    if (!body) { t.finalized = false; phase('committing', 'reconnecting'); setTimeout(() => { if (T === t) finalize(t, rec); }, 5000); return; }
    // the new Eye's recovery key belongs to this phone from now on; the old one is gone with its Eye
    const k = newKey();
    try { await update({ [`keys/${inn}`]: { k } }); S.keys[inn] = k; } catch (e) { note('recovery key for ' + inn + ' not set yet'); }
    delete S.keys[out];
    try { await update({ [`owners/${uid}/${out}`]: null, [`owners/${uid}/${inn}`]: true }); } catch (e) {}
    const hist = await tryRead('hist/' + inn); if (hist.ok && hist.v) S.journals[inn] = hist.v;
    S.departed[out] = { tid: t.tid, at: rec.done || nowMs(), to: theirLabel };
    S.pending = { tid: t.tid, role, out, in: inn, phase: 'arrive', at: nowMs() };
    save();
    t.inBody = body; t.out = out; t.inn = inn; t.theirLabel = theirLabel;
    if (!t.theirs || !t.theirs.about) t.theirs = { ...(t.theirs || {}), about: about(body) };
    phase('done');
    tell(t.f, { o: 'done', id: t.tid });
    if (recovering || !sceneOpen()) return arrive(t);
    playDeparture(() => arrive(t));
  }
  // write the arrival journal, then start a fresh page that finishes it
  function arrive(t) {
    const snap = snapOf(t.inBody);
    const from = (t.mine && t.mine.about && t.mine.about.name) || (S.known[t.out] && S.known[t.out].name) || '';
    try {
      if (root.EyesLegacy && EyesLegacy.requestExchange) {
        const r = EyesLegacy.requestExchange({ to: legacyId(t.inn), out: legacyId(t.out), inSnap: snap, tid: t.tid, toLabel: t.theirLabel });
        if (!r.ok) throw err(r.why || 'legacy');
      } else set(JOURNAL, { op: 'exchange', tid: t.tid, to: t.inn, out: t.out, inSnap: snap, phase: 0, at: nowMs() });
      if (!S.applied.includes(t.tid)) S.applied.push(t.tid);
      S.pending = null; save();
      try { sessionStorage.setItem(ARRIVE, JSON.stringify({ tid: t.tid, cid: t.inn, name: t.inBody.dna.name, from, fromLabel: t.theirLabel, out: t.out, at: nowMs() })); } catch (e) {}
    } catch (e) { note('arrival could not be written: ' + e.message + ' (it will be finished at the next start)'); }
    T = null;
    setTimeout(() => { try { location.reload(); } catch (e) {} }, 30);
  }

  // ======================================================================================
  //  Start-up and reconnect: the server's word on what this phone has
  // ======================================================================================
  let reconciling = false, lastReconcile = 0;
  async function reconcile(force) {
    if (reconciling || !available() || navigator.onLine === false) return;
    if (!force && nowMs() - lastReconcile < 60000) return;
    if (T && busy()) return;
    reconciling = true; lastReconcile = nowMs();
    try {
      reloadStore();
      const uid = await me();
      // 1) a trade this phone was part of when EYES closed (or lost its connection mid-commit)
      const p = S.pending;
      if (p && !S.applied.includes(p.tid)) {
        const r = await tryRead('trades/' + p.tid);
        if (r.ok && r.v && r.v.st === 'done' && sideOf(r.v, uid)) {
          note('finishing exchange ' + p.tid + ' that the server committed while EYES was away');
          T = { tid: p.tid, role: sideOf(r.v, uid), uid, phase: 'committing', rec: r.v, f: findFriend(p.fkey), fkey: p.fkey, mine: { cid: p.out }, theirs: {} };
          return finalize(T, r.v, true);
        }
        if (r.ok && r.v && r.v.st === 'open' && !expired(r.v) && sideOf(r.v, uid)) {
          note('trade ' + p.tid + ' is still open: resuming its preview');
          const body = bodyOfLive();
          T = { tid: p.tid, role: sideOf(r.v, uid), uid, phase: 'preview', rec: r.v, f: findFriend(p.fkey), fkey: p.fkey, mine: { cid: p.out, body, about: body && about(body) }, theirs: {} };
          openScene(); follow(); onRecord(T, r.v);
          return;
        }
        // cancelled, declined, expired or unreadable: make sure nothing of ours stays locked
        try { const o = await tryRead('own/' + p.out); if (o.ok && o.v && o.v.lock === p.tid) await update({ [`own/${p.out}/lock`]: null }); } catch (e) {}
        S.pending = null; save();
      } else if (p && S.applied.includes(p.tid)) { S.pending = null; save(); }
      // 2) the Eye with you: is it still yours?
      const cid = myCid();
      if (cid && (S.reg[cid] || S.keys[cid] || S.departed[cid])) {
        const o = await tryRead('own/' + cid);
        if (o.ok && o.v && o.v.uid === uid) { remember(cid, o.v); await ensureKey(cid); delete S.departed[cid]; save(); }
        else if (!o.ok && o.e.kind === 'denied') {
          const state = S.keys[cid] ? await ensureMine(cid) : 'elsewhere';
          if (state !== 'mine') { S.known[cid] = { ...(S.known[cid] || {}), elsewhere: nowMs() }; save(); note(cid + ' is registered to another home on the server'); }
        }
      }
      // 3) an Eye the server says this account owns, that this phone doesn't have (an older backup was restored
      //    over it): bring it back, if the Eye showing here isn't actually ours
      const owned = await tryRead('owners/' + uid);
      if (owned.ok && owned.v && cid && S.known[cid] && S.known[cid].elsewhere) {
        const have = new Set([cid, ...(root.EyesLegacy ? EyesLegacy.list().map((r) => cidOf(r.seed, r.born)) : [])]);
        const missing = Object.keys(owned.v).filter((c) => CID_RE.test(c) && !have.has(c));
        if (missing.length) {
          const inn = missing[0], body = cleanBody(await read('body/' + inn), inn);
          if (body) {
            note('recovering ' + inn + ', which the server says lives here');
            const t = { tid: 'r' + rid(15).slice(0, 20), inn, out: cid, inBody: body, theirLabel: '', theirs: { about: about(body) } };
            return arrive(t);
          }
        }
      }
    } catch (e) { note('check skipped: ' + (e.kind || e.message)); }
    finally { reconciling = false; render(); }
  }
  function findFriend(fkey) { try { return F().list().find((f) => keyOf(f) === fkey) || null; } catch (e) { return null; } }
  const keyOf = (f) => (C() && C().keyOf ? C().keyOf(f) : f && f.code);

  // ======================================================================================
  //  Drawing living Eyes anywhere (the same renderer and behaviour as every other Eye)
  // ======================================================================================
  const motion = () => { try { const d = Haven.diagnostics(); return { on: d.motion !== false, gentle: !!d.gentle }; } catch (e) { return { on: true, gentle: false }; } };
  function makeEye(dna) {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const e = new HavenEye(dna, c); e.auto = true; e.gaze = { x: 0, y: 0, vx: 0, vy: 0 }; e.target = { x: 0, y: 0 }; e.hop = 0; return e;
  }
  function drawEye(ctx, e, cx, cy, size, alpha, t, squash) {
    if (!root.HavenRender || alpha <= 0.005 || size < 0.5) return;
    const Dn = D(), d = e.dna, blink = e.blink || 0, lk = e.lidK == null ? 1 : e.lidK;
    const rest = clamp(0.1 + (Dn ? Dn.lid(d) : 0) + e.mood.squint * 0.45 - e.mood.wide * 0.25, 0, 0.8) * lk;
    const follow = clamp(e.gaze.y * 0.1, -0.05, 0.1) * lk;
    const upper = clamp(mix(rest + follow, 1, blink)), lower = clamp(mix((0.02 + e.mood.squint * 0.18) * lk, 1, blink));
    const jt = t * d.motion.jitterRate, j = d.motion.jitter * 3;
    const jx = (Math.sin(jt * 2.1) + Math.sin(jt * 3.7 + 1.3) * 0.5) * j, jy = (Math.sin(jt * 2.9 + 0.4) + Math.sin(jt * 4.3) * 0.5) * j;
    const look = Dn ? Dn.looks(d) : { pupil: 1 };
    ctx.save(); ctx.globalAlpha = alpha;
    if (squash) { ctx.translate(cx, cy); ctx.rotate(squash.rot || 0); ctx.scale(squash.sx || 1, squash.sy || 1); ctx.translate(-cx, -cy); }
    HavenRender.paintEye(ctx, {
      dna: d, cx, cy, size, gaze: { x: e.gaze.x + jx, y: e.gaze.y + jy }, lids: { upper, lower },
      pupilScale: look.pupil * e.pupil, t: t * 1000, light: 1, breathing: Math.sin((t * TAU) / 4.6), reveal: null, sweep: e.sweep == null ? -1 : e.sweep
    });
    ctx.restore();
  }
  // each temperament says hello (or goodbye) its own way
  function greet(e, toward, gentle, later) {
    const k = e.dna.firstWord, t = performance.now() / 1000;
    const look = () => e.setTarget(toward.x * 0.85, toward.y * 0.6);
    e.reactUntil = t + 99; look();
    if (k === 'shy') { e.setTarget(-toward.x * 0.6, 0.45); e.moodGoal.squint = 0.35; later(700, () => { look(); e.blinkNow(true); }); later(1500, () => (e.moodGoal.squint = 0.1)); }
    else if (k === 'grumpy' || k === 'smug') { e.moodGoal.squint = 0.42; later(500, () => e.blinkNow(true)); later(1300, () => (e.moodGoal.squint = 0.12)); }
    else if (k === 'hyper' && !gentle) { e.hop = 1; e.pupilV += 2; later(220, () => e.setTarget(toward.x, -0.2)); later(440, look); later(700, () => (e.hop = 0.8)); }
    else if (k === 'curious') { e.pupilGoal = 1.35; e.moodGoal.wide = 0.4; later(1400, () => { e.pupilGoal = 1.05; e.moodGoal.wide = 0; }); }
    else if (k === 'dramatic') { e.moodGoal.wide = gentle ? 0.3 : 0.6; e.pupilGoal = 1.3; e.blinkNow(); e.blinkQueue = 1; later(1400, () => { e.moodGoal.wide = 0; e.pupilGoal = 1; }); }
    else if (k === 'sleepy') { e.moodGoal.squint = 0.4; e.blinkNow(true); later(1000, () => (e.moodGoal.squint = 0.15)); }
    else { e.blinkNow(); e.pupilGoal = 1.12; later(1200, () => (e.pupilGoal = 1)); }
  }
  // the opening, in Pocket Dimension's language: a living lip, receding layers, a far light, drifting motes
  function wobbly(ctx, x, y, rx, ry, seed, wob) {
    const n = 30; ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, k = 1 + wob * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 5 - seed * 1.7) * 0.4);
      const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function paintOpening(ctx, o, t, rgb, ripples) {
    if (o.u <= 0.003) return;
    const u = clamp(o.u), rx = o.rx * u, ry = o.ry * u, R = Math.max(rx, ry), tint = (k, a) => `rgba(${Math.round(clamp(rgb[0] * k, 0, 255))},${Math.round(clamp(rgb[1] * k, 0, 255))},${Math.round(clamp(rgb[2] * k, 0, 255))},${a})`;
    const drift = (t / 14 + o.seed) % 1;
    ctx.save();
    wobbly(ctx, o.x, o.y, rx, ry, t * 0.6 + o.seed, 0.035); ctx.clip();
    const bg = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R);
    bg.addColorStop(0, '#000102'); bg.addColorStop(0.55, '#02060a'); bg.addColorStop(1, tint(0.5, 0.42));
    ctx.fillStyle = bg; ctx.fillRect(o.x - rx - 3, o.y - ry - 3, rx * 2 + 6, ry * 2 + 6);
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const z = (i + drift) / 6, zr = Math.pow(z, 1.9), a = (0.06 + 0.22 * z) * u * (1 - Math.pow(z, 6));
      if (a < 0.005) continue;
      wobbly(ctx, o.x, o.y, rx * zr, ry * zr, i * 1.9 + drift * 2, 0.025 + 0.02 * z); ctx.strokeStyle = tint(1.1, a); ctx.stroke();
    }
    const fl = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R * 0.24);
    fl.addColorStop(0, tint(1.5, 0.3 * u)); fl.addColorStop(1, tint(1, 0));
    ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(o.x, o.y, R * 0.24, 0, TAU); ctx.fill();
    for (const m of o.motes) {
      const z = (m.z + t * m.sp) % 1, zz = z * z;
      ctx.fillStyle = tint(1.6, Math.sin(z * Math.PI) * 0.7 * u);
      ctx.beginPath(); ctx.arc(o.x + Math.cos(m.a + z * 0.6) * rx * zz * 0.96, o.y + Math.sin(m.a + z * 0.6) * ry * zz * 0.96, 0.4 + m.s * zz * 1.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
    const lipA = (0.45 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.62))) * clamp(u * 1.4);
    for (const [grow, w, a] of [[5, 8, 0.07], [2.4, 3.4, 0.16], [0.4, 1.3, 0.7]]) {
      wobbly(ctx, o.x, o.y, rx + grow, ry + grow, t * 0.6 + o.seed, 0.035); ctx.strokeStyle = tint(1.15, a * lipA); ctx.lineWidth = w; ctx.stroke();
    }
    for (const r of ripples || []) {
      const e = (t - r.at) / 0.62; if (e < 0 || e > 1) continue;
      const gr = 3 + easeOut(e) * 34;
      wobbly(ctx, o.x, o.y, rx + gr, ry + gr, e * 4, 0.012 * (1 - e)); ctx.strokeStyle = tint(1.35, 0.5 * (1 - e)); ctx.lineWidth = 2.2 * (1 - e) + 0.5; ctx.stroke();
    }
  }
  const motes = (n) => Array.from({ length: n }, () => ({ a: Math.random() * TAU, z: Math.random(), sp: 0.05 + Math.random() * 0.08, s: Math.random() }));

  // ======================================================================================
  //  The scene: two Eyes meet before a new adventure
  // ======================================================================================
  let el = null, sceneEyes = null, onSay = null;
  const sceneOpen = () => !!(el && el.isConnected);
  function say(text) { if (onSay) { try { onSay(text); return; } catch (e) {} } if (el) { const s = el.querySelector('.xx-say'); if (s) { s.textContent = text; s.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(() => s.classList.remove('on'), 4200); return; } } const tz = $('toast'); if (tz) { tz.textContent = text; tz.hidden = false; clearTimeout(say.z); say.z = setTimeout(() => (tz.hidden = true), 3600); } }
  function openScene() {
    if (C() && C().isOpen && C().isOpen()) { try { C().close(); } catch (e) {} }
    if (!el) {
      el = document.createElement('div'); el.id = 'eyesExchange'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Eye Exchange');
      el.innerHTML = `<canvas class="xx-cv" aria-hidden="true"></canvas>
        <div class="xx-head"><p class="xx-k">EYE EXCHANGE</p><button type="button" class="xx-x" data-a="close" aria-label="Close">×</button></div>
        <div class="xx-names"><div class="xx-name xx-mine"></div><div class="xx-name xx-theirs"></div></div>
        <div class="xx-cards"><section class="xx-card xx-c-mine"></section><section class="xx-card xx-c-theirs"></section></div>
        <div class="xx-panel"><p class="xx-state" aria-live="polite"></p><p class="xx-perm"></p><div class="xx-label" hidden><label><span>How should Eye Journals name you?</span><input maxlength="24" autocomplete="nickname" placeholder="e.g. your first name" aria-label="Your name in Eye Journals"></label></div><div class="xx-row"></div><div class="xx-time"><i></i></div></div>
        <p class="xx-say" aria-live="polite"></p><div class="xx-journal" hidden></div>`;
      document.body.appendChild(el);
      el.addEventListener('click', onClick);
      el.querySelector('.xx-label input').addEventListener('input', (e) => { if (T) T.labelInput = e.target.value; });
      try { if (root.Haven && Haven.holdHome) Haven.holdHome(true); } catch (e) {}
      sceneEyes = startEyes();
    }
    el.dataset.motion = motion().on ? (motion().gentle ? 'gentle' : 'on') : 'off';
    render();
  }
  function closeScene(back) {
    const t = T;
    if (t && busy() && !['compose'].includes(t.phase)) return;        // a live trade is never abandoned by closing
    if (sceneEyes) sceneEyes.stop(); sceneEyes = null;
    if (el) { el.remove(); el = null; }
    try { if (root.Haven && Haven.holdHome) Haven.holdHome(false); } catch (e) {}
    const fkey = t && t.fkey; if (t && !busy()) T = null;
    if (back !== false && fkey && C() && C().meet) { try { C().meet(fkey); } catch (e) {} }
  }
  function onClick(ev) {
    const b = ev.target.closest && ev.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'close') { if (T && ['waiting', 'preview', 'confirmed', 'joining', 'sending'].includes(T.phase)) { say('Cancel the trade first, or let it finish.'); return; } return closeScene(); }
    if (a === 'send') return send();
    if (a === 'confirm') return confirm();
    if (a === 'cancel') return cancel();
    if (a === 'done') return closeScene();
    if (a === 'journal-mine') return showJournal('mine');
    if (a === 'journal-theirs') return showJournal('theirs');
    if (a === 'journal-close') { el.querySelector('.xx-journal').hidden = true; return; }
    if (a === 'retry') { if (T && T.phase === 'failed') { const f = T.f; T = null; closeScene(false); return invite(f); } }
  }
  const age = (born) => {
    if (!born) return '';
    const days = Math.max(0, Math.floor((nowMs() - born) / 86400000));
    let month = ''; try { month = new Date(born).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); } catch (e) {}
    return (days < 1 ? 'Born today' : days === 1 ? '1 day old' : days < 60 ? days + ' days old' : Math.round(days / 30.4) + ' months old') + (month ? ' · born ' + month : '');
  };
  function cardHTML(a, side, trades, hist) {
    if (!a) return '<p class="xx-dim">Waiting for their Eye…</p>';
    const lines = journeyLines(hist, a).slice(-2);
    return `<p class="xx-c-name">${esc(a.name)}</p><p class="xx-c-l">${esc(age(a.born))}</p>
      <p class="xx-c-l">${esc(a.words.join(' · '))}</p>
      <p class="xx-c-l xx-dim">${esc(a.tier)} · ${esc(a.iris)}${a.stage ? ' · ' + esc(a.stage) : ''}${a.branch ? ' (' + esc(a.branch) + ')' : ''}</p>
      <p class="xx-c-l">${trades == null ? '' : trades === 0 ? 'Never traded' : 'Trades: ' + trades}</p>
      ${lines.length ? `<ul class="xx-c-j">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      <button type="button" class="xx-link" data-a="journal-${side}">Journal</button>`;
  }
  const STATE = {
    compose: (t) => `Offer <b>${esc(t.mine.about.name)}</b> for <b>${esc(nameTheirs(t))}</b>?`,
    sending: () => 'Sending the invitation…',
    waiting: (t) => t.trouble ? 'Connection interrupted. Trying again…' : t.why === 'nudge' ? `Invitation ready. ${esc(friendName(t.f))}'s phone will see it when their Eye is listening.` : `Invitation sent. Waiting for ${esc(friendName(t.f))}…`,
    incoming: (t) => `${esc(friendName(t.f))} invited you to trade Eyes.`,
    joining: () => 'Joining the trade…',
    preview: (t) => t.trouble ? 'Connection interrupted. Trying again…' : t.why === 'changed' ? 'The trade changed. Look again before you confirm.' : t.theyConfirmed ? `${esc(friendName(t.f))} confirmed. It's your turn.` : 'Take a good look at both Eyes.',
    confirmed: (t) => t.trouble ? 'Connection interrupted. Your confirmation is saved.' : `You confirmed. Waiting for ${esc(friendName(t.f))}…`,
    committing: (t) => t.why === 'reconnecting' ? 'Connection interrupted while the exchange was being sealed. Checking what the server recorded…' : 'Sealing the exchange…',
    done: (t) => `Done. ${esc(t.theirs && t.theirs.about ? t.theirs.about.name : 'Your new Eye')} is on its way to you.`,
    declined: (t) => `${esc(friendName(t.f))} said not this time. Nothing changed.`,
    canceled: (t) => t.why === 'me' ? 'Trade canceled. Nothing changed.' : `${esc(friendName(t.f))} canceled the trade. Nothing changed.`,
    expired: () => 'The invitation expired. Nothing changed.',
    failed: (t) => ({ offline: 'This phone is offline. Nothing changed.', elsewhere: 'This Eye is registered to another home on the server, so it can\'t be traded from this phone.', locked: 'Your Eye is already waiting on another trade.', denied: 'The Eye Exchange service refused that step. Nothing changed.', setup: 'Eye Exchange needs the Eye Contact service.', net: 'Couldn\'t reach the Eye Exchange service. Nothing changed.' })[t.why] || ('That didn\'t work: ' + esc(t.why) + '. Nothing changed.')
  };
  const nameTheirs = (t) => (t.theirs && t.theirs.about && t.theirs.about.name) || (t.theirs && t.theirs.name) || (t.theirs && t.theirs.profile && t.theirs.profile.name) || 'their Eye';
  function render() {
    if (!el || !T) { if (el && !T) closeScene(false); return; }
    const t = T, mineA = t.mine && t.mine.about, theirsA = t.theirs && t.theirs.about;
    el.dataset.phase = t.phase;
    el.querySelector('.xx-mine').textContent = mineA ? mineA.name : '';
    el.querySelector('.xx-theirs').textContent = nameTheirs(t);
    el.querySelector('.xx-c-mine').innerHTML = cardHTML(mineA, 'mine', t.mine && t.mine.n != null ? t.mine.n : S.counts[t.mine && t.mine.cid] || 0, t.mine && (t.mine.hist || S.journals[t.mine.cid]));
    el.querySelector('.xx-c-theirs').innerHTML = theirsA ? cardHTML(theirsA, 'theirs', t.theirs.n, t.theirs.hist) : `<p class="xx-c-name">${esc(nameTheirs(t))}</p><p class="xx-c-l xx-dim">${t.phase === 'compose' || t.phase === 'waiting' ? 'Their Eye joins the preview when they accept.' : 'Getting to know their Eye…'}</p>`;
    el.querySelector('.xx-state').innerHTML = (STATE[t.phase] || (() => ''))(t);
    const mineName = mineA ? mineA.name : 'Your Eye', theirsName = nameTheirs(t);
    el.querySelector('.xx-perm').textContent = ['compose', 'preview', 'confirmed', 'incoming', 'joining', 'waiting'].includes(t.phase)
      ? `This is permanent. ${mineName} will live with ${friendName(t.f)} and ${theirsName} will live with you, unless you both choose to trade again.` : '';
    const lab = el.querySelector('.xx-label');
    lab.hidden = !(['compose', 'preview'].includes(t.phase) && !S.asked);
    if (!lab.hidden && t.labelInput == null) lab.querySelector('input').value = S.label || '';
    const row = el.querySelector('.xx-row'), btn = (a, label, cls) => `<button type="button" class="xx-btn ${cls || ''}" data-a="${a}">${label}</button>`;
    row.innerHTML = ({
      compose: btn('close', 'Not now') + btn('send', 'Send trade invitation', 'xx-primary'),
      sending: '', joining: '', committing: '',
      waiting: btn('cancel', 'Cancel invitation'),
      preview: btn('cancel', 'Cancel') + btn('confirm', t.theyConfirmed ? `Confirm: trade ${esc(mineName)}` : 'Trade permanently', 'xx-primary' + (t.trouble || !theirsA ? ' xx-off' : '')),
      confirmed: btn('cancel', 'Cancel'),
      done: '',
      declined: btn('done', 'Back'), canceled: btn('done', 'Back'), expired: btn('done', 'Back'),
      failed: btn('done', 'Back') + (['net', 'offline'].includes(t.why) ? btn('retry', 'Try again', 'xx-primary') : '')
    })[t.phase] || '';
    renderClock();
    if (sceneEyes) sceneEyes.phase(t.phase);
  }
  function renderClock() {
    if (!el || !T) return;
    const bar = el.querySelector('.xx-time i'), rec = T.rec;
    const live = rec && rec.created && ['waiting', 'preview', 'confirmed', 'joining'].includes(T.phase);
    el.querySelector('.xx-time').hidden = !live;
    if (live) bar.style.transform = `scaleX(${clamp((expiresAt(rec) - serverNow()) / TTL)})`;
  }
  function journeyLines(hist, a) {
    if (!hist || typeof hist !== 'object') return [];
    const born = hist.born, trades = Object.entries(hist).filter(([k]) => k !== 'born').map(([k, x]) => ({ k, ...x })).sort((x, y) => x.at - y.at);
    const out = [];
    const firstHome = born && born.who ? born.who : '';
    out.push(firstHome ? `Born with ${firstHome}` : 'Born with its first person');
    const homes = new Set(firstHome ? [firstHome] : []);
    for (const x of trades) {
      const to = x.to || '';
      if (to && homes.has(to)) out.push((to === firstHome ? 'Returned home to ' : 'Back with ') + to);
      else out.push(to ? 'Traded to ' + to : 'Traded to a new home');
      if (to) homes.add(to);
    }
    return out;
  }
  async function showJournal(side) {
    if (!el || !T) return;
    const s = side === 'mine' ? T.mine : T.theirs; if (!s || !s.about) return;
    if (side === 'mine') s.hist = (await journalOf(s.cid)) || s.hist;
    journalInto(el.querySelector('.xx-journal'), s.about, s.hist, side === 'mine' ? (S.counts[s.cid] || 0) : s.n);
  }
  function journalInto(box, a, hist, trades) {
    const lines = journeyLines(hist, a);
    const dates = hist ? [hist.born && hist.born.at, ...Object.entries(hist).filter(([k]) => k !== 'born').map(([, x]) => x.at).sort((x, y) => x - y)] : [];
    let month = ''; try { month = new Date(a.born).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); } catch (e) {}
    const day = (ms) => { try { return ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; } catch (e) { return ''; } };
    box.innerHTML = `<div class="xx-j-card"><p class="xx-k">EYE JOURNAL</p><h3>${esc(a.name)}</h3><p class="xx-j-meta">Born: ${esc(month)}<br>Trades: ${trades || 0}</p>
      <p class="xx-j-h">Journey</p>${lines.length ? `<ol class="xx-j-list">${lines.map((l, i) => `<li><span>${esc(l)}</span><small>${esc(day(dates[i]))}</small></li>`).join('')}</ol>` : '<p class="xx-dim">Its journal starts with its first trade.</p>'}
      <button type="button" class="xx-btn" data-a="journal-close">Close</button></div>`;
    box.hidden = false;
  }

  // ---------- the two Eyes in the scene ----------
  function startEyes() {
    const cv = el.querySelector('.xx-cv'), ctx = cv.getContext('2d');
    let W = 0, H = 0, raf = 0, last = performance.now() / 1000, stopped = false, ph = '', dep = null;
    const timers = [];
    const later = (ms, f) => { const id = setTimeout(f, ms * (motion().gentle ? 1.35 : 1)); timers.push(id); };
    const fit = () => { const dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit(); addEventListener('resize', fit);
    const myDNA = (T && T.mine && T.mine.about && T.mine.about.dna) || (D() && D().dna());
    const mine = myDNA ? makeEye(myDNA) : null;
    let theirs = null;
    const theirDNA0 = T && T.theirs && T.theirs.profile && D() ? D().friendDNA(T.theirs.profile) : null;
    if (theirDNA0) theirs = makeEye(theirDNA0);
    const geo = () => { const S0 = Math.min(W * 0.16, 74, H * 0.1); return { S: S0, y: H * 0.31, xm: W * 0.29, xt: W * 0.71 }; };
    let lastDir = 0, hello = false;
    function director(t) {
      // they mostly study each other; now and then one glances back at its own person, or blinks slowly
      if (!mine || dep) return;
      const pairs = [[mine, 1], theirs ? [theirs, -1] : null].filter(Boolean);
      if (!hello && theirs && T && ['preview', 'confirmed', 'joining'].includes(T.phase)) {
        hello = true; const g = motion().gentle;
        greet(mine, { x: 1, y: 0 }, g, later); later(380, () => theirs && greet(theirs, { x: -1, y: 0 }, g, later));
        later(2600, () => { mine.reactUntil = 0; if (theirs) theirs.reactUntil = 0; });
      }
      if (t - lastDir < 1.6) return; lastDir = t;
      for (const [e, dir] of pairs) {
        if (t < e.reactUntil) continue;
        const r = Math.random();
        if (!theirs || dir < 0 && !theirs) continue;
        if (r < 0.55) e.setTarget(dir * mix(0.65, 0.95, Math.random()), (Math.random() - 0.5) * 0.25);           // at the other Eye
        else if (r < 0.72) e.setTarget(dir * 0.15, 0.32);                                                       // back at its person
        else if (r < 0.82) { e.setTarget(dir * 0.8, -0.1); e.pupilGoal = 1.25; later(900, () => (e.pupilGoal = 1)); }   // curiosity
        else if (r < 0.9) e.blinkNow(true);
        e.reactUntil = t + mix(1.1, 2.6, Math.random());
      }
      if (!theirs && mine && t > mine.reactUntil) { mine.setTarget(0.7, -0.05); mine.reactUntil = t + 2; }
    }
    function frame() {
      if (stopped) return;
      const t = performance.now() / 1000, dt = Math.min(0.05, t - last); last = t;
      const G = geo(); ctx.clearRect(0, 0, W, H);
      director(t);
      const m = motion();
      for (const e of [mine, theirs]) if (e) { e.step(t, m.on ? dt : 0); e.hop = Math.max(0, (e.hop || 0) - dt * 2.2); }
      const hopY = (e) => (e && e.hop > 0 ? -Math.sin((1 - e.hop) * Math.PI) * 0.16 * G.S : 0);
      if (dep) dep.frame(t, dt, G);
      else {
        // a soft thread of light between two Eyes that are about to swap lives
        if (mine && theirs) {
          const a = 0.08 + 0.05 * Math.sin(t * 1.3), gr = ctx.createLinearGradient(G.xm, G.y, G.xt, G.y);
          const ca = mine.dna.accent || [200, 230, 240], cb = theirs.dna.accent || [200, 230, 240];
          gr.addColorStop(0, `rgba(${ca[0]},${ca[1]},${ca[2]},0)`); gr.addColorStop(0.3, `rgba(${ca[0]},${ca[1]},${ca[2]},${a})`); gr.addColorStop(0.7, `rgba(${cb[0]},${cb[1]},${cb[2]},${a})`); gr.addColorStop(1, `rgba(${cb[0]},${cb[1]},${cb[2]},0)`);
          ctx.strokeStyle = gr; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(G.xm + G.S, G.y); ctx.quadraticCurveTo(W / 2, G.y - G.S * 0.35 + Math.sin(t * 0.8) * 4, G.xt - G.S, G.y); ctx.stroke();
        }
        const lean = (e, dir) => (e ? clamp(e.gaze.x * dir, 0, 1) * G.S * 0.05 * dir : 0);
        if (mine) drawEye(ctx, mine, G.xm + lean(mine, 1), G.y + hopY(mine), G.S, 1, t);
        if (theirs) drawEye(ctx, theirs, G.xt + lean(theirs, -1), G.y + hopY(theirs), G.S, T && ['compose', 'waiting', 'sending'].includes(T.phase) ? 0.38 : 1, t);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    const api = {
      mine, get theirs() { return theirs; },
      setTheirs(dna) { if (!dna) return; if (!theirs || theirs.dna.seed !== dna.seed) theirs = makeEye(dna); else theirs.dna = dna; hello = false; },
      phase(p) { ph = p; },
      depart(done) { dep = departure(ctx, mine, theirs, later, () => { dep = null; done(); }); },
      stop() { stopped = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); removeEventListener('resize', fit); },
      debug: () => ({ ph, dep: !!dep, mine: mine && mine.dna.name, theirs: theirs && theirs.dna.name })
    };
    return api;
  }

  // Departure: both Eyes acknowledge each other, each looks back at its own person, an opening appears in
  // front of each, they hesitate, then slip inside. Plays only after the server confirmed the exchange.
  function departure(ctx, mine, theirs, later, done) {
    const m = motion(), K = m.gentle ? 1.4 : 1, t0 = performance.now() / 1000, cues = {}, ripples = [[], []];
    const el2 = () => performance.now() / 1000 - t0;
    const cue = (n, at, f) => { if (!cues[n] && el2() >= at * K) { cues[n] = 1; f(); } };
    const eyes = [mine, theirs];
    for (const e of eyes) if (e) { e.auto = false; e.reactUntil = 1e9; }
    const ops = [{ u: 0, seed: 1.3, motes: motes(14) }, { u: 0, seed: 4.1, motes: motes(14) }];
    const END = 6.4 * K;
    let finished = false;
    const finish = () => { if (finished) return; finished = true; done(); };
    if (!m.on) { later(700, finish); return { frame(t, dt, G) { for (const [i, e] of eyes.entries()) if (e) drawEye(ctx, e, i ? G.xt : G.xm, G.y, G.S, 1 - clamp(el2() / 0.6), t); } }; }
    return {
      frame(t, dt, G) {
        const e = el2();
        // 1 · they acknowledge each other: a long look, a shared slow blink
        cue('see', 0, () => { if (mine) mine.setTarget(0.9, 0); if (theirs) theirs.setTarget(-0.9, 0); });
        cue('blink', 0.55, () => { if (mine) mine.blinkNow(true); later(120, () => theirs && theirs.blinkNow(true)); });
        // 2 · each looks to its own person, almost like saying goodbye (yours to you, theirs off toward theirs)
        cue('bye', 1.35, () => { if (mine) { mine.setTarget(0, 0.22); mine.pupilGoal = 1.22; } if (theirs) { theirs.setTarget(0.45, -0.75); theirs.pupilGoal = 1.15; } });
        cue('byeGesture', 1.75, () => { for (const x of eyes) if (x) greet(x, x === mine ? { x: 0, y: 0.3 } : { x: 0.5, y: -0.8 }, m.gentle, later); for (const x of eyes) if (x) x.reactUntil = 1e9; });
        // 3 · an opening in front of each (Pocket Dimension's doorway)
        cue('notice', 2.75, () => { if (mine) { mine.setTarget(0.2, 0.85); mine.pupilGoal = 1.35; mine.moodGoal.wide = 0.25; } if (theirs) { theirs.setTarget(-0.2, 0.85); theirs.pupilGoal = 1.35; theirs.moodGoal.wide = 0.25; } });
        cue('glance', 3.25, () => { if (mine) mine.setTarget(0.85, 0.1); if (theirs) theirs.setTarget(-0.85, 0.1); });   // one last look at each other
        cue('hesitate', 3.55, () => { for (const x of eyes) if (x) { x.moodGoal.wide = 0; x.blinkNow(); x.pupilGoal = 1.1; } });
        cue('go', 4.0, () => { for (const x of eyes) if (x) { x.setTarget((x === mine ? 0.15 : -0.15), 0.9); } });
        const os = 2.55 * K, oe = 3.25 * K, oc = 5.45 * K, oz = 6.0 * K;
        const openU = e < oc ? easeOut((e - os) / (oe - os)) : 1 - ease((e - oc) / (oz - oc));
        const ax = [G.xm + G.S * 0.3, G.xt - G.S * 0.3], ay = G.y + G.S * 1.5;      // one doorway under each Eye
        for (let i = 0; i < 2; i++) { const o = ops[i]; o.u = openU; o.x = ax[i]; o.y = ay; o.rx = G.S * 0.78; o.ry = G.S * 0.3; }
        // 4 · in they go: a lean back, then a dive that squashes into the opening; a ripple when it closes over them
        const gs = 4.05 * K, ge = 5.1 * K, gu = clamp((e - gs) / (ge - gs));
        cue('rip', 5.05, () => { ripples[0].push({ at: t }); ripples[1].push({ at: t + 0.12 }); });
        for (let i = 0; i < 2; i++) {
          const eye = eyes[i]; if (!eye) continue;
          const bx = i ? G.xt : G.xm, by = G.y;
          const back = e > 3.55 * K && e < gs ? Math.sin(clamp((e - 3.55 * K) / (gs - 3.55 * K)) * Math.PI) * G.S * 0.12 : 0;
          const path = easeIn(gu);
          const x = mix(bx, ops[i].x, path) + (i ? 1 : -1) * back * 0.4, y = mix(by - back, ops[i].y, path) - Math.sin(gu * Math.PI) * G.S * 0.55;
          const size = G.S * mix(1, 0.08, easeIn(gu));
          const sq = gu > 0.55 ? { sx: mix(1, 0.7, (gu - 0.55) / 0.45), sy: mix(1, 1.35, (gu - 0.55) / 0.45), rot: (i ? -1 : 1) * gu * 0.5 } : null;
          if (gu > 0.62) paintOpening(ctx, ops[i], t, (eye.dna.accent || [200, 230, 240]), ripples[i]);
          drawEye(ctx, eye, x, y, size, 1 - clamp((gu - 0.9) / 0.1), t, sq);
          if (gu <= 0.62) paintOpening(ctx, ops[i], t, (eye.dna.accent || [200, 230, 240]), ripples[i]);
        }
        if (e >= END || document.hidden) finish();
      }
    };
  }
  function playDeparture(done) {
    if (!sceneEyes) return done();
    if (el) el.dataset.phase = 'departing';
    let ended = false; const end = () => { if (ended) return; ended = true; if (el) el.classList.add('xx-dark'); setTimeout(done, motion().on ? 380 : 60); };
    sceneEyes.depart(end);
    setTimeout(end, 14000);                              // an animation can never hold an exchange hostage
  }

  // ======================================================================================
  //  Arrival on the next page: it emerges, pauses, looks around its new home, reacts, settles
  // ======================================================================================
  function playArrival(info) {
    const dna = D() && D().dna && D().dna(); if (!dna || !root.HavenRender || !root.HavenEye) { document.documentElement.classList.remove('xx-arriving'); return; }
    const ov = document.createElement('div'); ov.id = 'xxArrive';
    setTimeout(() => document.documentElement.classList.remove('xx-arriving'), 50); ov.innerHTML = '<canvas></canvas><p class="xx-a-cap" aria-live="polite"></p>';
    document.body.appendChild(ov);
    const cv = ov.querySelector('canvas'), dpr = Math.min(2, devicePixelRatio || 1), ctx = cv.getContext('2d');
    const fit = () => { cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit();
    ['pointerdown', 'pointerup', 'touchstart', 'click'].forEach((n) => ov.addEventListener(n, (ev) => { ev.stopPropagation(); if (ev.cancelable) ev.preventDefault(); }, { passive: false }));
    const hide = hideHomeEye(true);
    const m = motion(), K = m.gentle ? 1.4 : 1, e = makeEye(dna); e.auto = false; e.reactUntil = 1e9; e.closeK = 1;
    const t0 = performance.now() / 1000, cues = {}, ripples = [], op = { u: 0, seed: 2.2, motes: motes(16) };
    const timers = []; const later = (ms, f) => timers.push(setTimeout(f, ms * K));
    const el3 = () => performance.now() / 1000 - t0;
    const cue = (n, at, f) => { if (!cues[n] && el3() >= at * K) { cues[n] = 1; f(); } };
    const cap = ov.querySelector('.xx-a-cap');
    const END = 6.6 * K;
    let last = t0, raf = 0, done = false;
    const finish = () => {
      if (done) return; done = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout);
      hide(false); ov.classList.add('out'); setTimeout(() => cap.classList.remove('on'), 1500); setTimeout(() => ov.remove(), 2400);   // the words stay a moment longer
      emit('arrived', info);
    };
    arrival.stop = finish;
    if (!m.on) { cap.textContent = `${dna.name} has arrived.`; setTimeout(finish, 1800); const G = home(); e.closeK = 0; drawEye(ctx, e, G.cx, G.cy, G.S, 1, t0); return; }
    function frame() {
      const t = performance.now() / 1000, dt = Math.min(0.05, t - last), x = el3(); last = t;
      const G = home(); ctx.clearRect(0, 0, innerWidth, innerHeight);
      ov.classList.toggle('lit', x > 0.05);
      // the opening forms where its new home is
      const ou = x < 3.0 * K ? easeOut((x - 0.25 * K) / (0.75 * K)) : 1 - ease((x - 3.0 * K) / (0.7 * K));
      op.u = ou; op.x = G.cx; op.y = G.cy + G.S * 0.2; op.rx = G.S * 1.05; op.ry = G.S * 0.42;
      // it rises out, eyes still closed; the opening closes under it
      const ru = clamp((x - 1.0 * K) / (0.95 * K)), rise = easeOut(ru);
      const pop = ru > 0 && ru < 1 ? Math.sin(ru * Math.PI) * 0.12 : 0;
      cue('ripple', 1.05, () => ripples.push({ at: t }));
      cue('open', 2.15, () => { e.closeK = 0; e.lidK = 1; e.blinkNow(true); e.pupilGoal = 0.8; });
      cue('pause', 2.5, () => { e.setTarget(0, 0.05); e.pupilGoal = 1.05; });
      cue('left', 2.95, () => { e.setTarget(-0.92, -0.05); e.pupilGoal = 1.25; });
      cue('right', 3.75, () => e.setTarget(0.92, -0.12));
      cue('up', 4.35, () => { e.setTarget(0.2, -0.75); e.pupilGoal = 1.3; });
      cue('react', 4.85, () => { greet(e, { x: 0, y: 0.15 }, m.gentle, later); e.reactUntil = 1e9; cap.textContent = info && info.from ? `${dna.name} has arrived. ${info.from} is with ${info.fromLabel || 'your friend'} now.` : `${dna.name} has arrived.`; cap.classList.add('on'); });
      cue('home', 5.85, () => { e.setTarget(0, 0); e.pupilGoal = 1; if (!m.gentle && (dna.T && dna.T.energy > 0.45)) e.hop = 0.7; });
      if (ru > 0 && ru < 1) e.closeK = 1;
      e.step(t, dt); e.hop = Math.max(0, (e.hop || 0) - dt * 2.2);
      const hy = e.hop > 0 ? -Math.sin((1 - e.hop) * Math.PI) * 0.14 * G.S : 0;
      const y = mix(op.y + G.S * 0.25, G.cy, rise) + hy - pop * G.S;
      const size = G.S * mix(0.12, 1, rise) * (1 + pop * 0.6);
      const sq = ru > 0 && ru < 0.7 ? { sx: mix(0.75, 1, ru / 0.7), sy: mix(1.35, 1, ru / 0.7) } : null;
      if (ru < 0.5) { drawEye(ctx, e, G.cx, y, size, ru > 0 ? 1 : 0, t, sq); paintOpening(ctx, op, t, dna.accent || [200, 230, 240], ripples); }
      else { paintOpening(ctx, op, t, dna.accent || [200, 230, 240], ripples); drawEye(ctx, e, G.cx, y, size, 1, t, sq); }
      if (x >= END || document.hidden) return finish();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }
  function arrival() {}
  function home() { const w = innerWidth, h = innerHeight; return { cx: w * 0.5, cy: h * 0.49, S: Math.min(w * 0.235, 101, h * 0.125) }; }
  // while the arrival plays the home screen keeps running but leaves its Eye to the overlay
  function hideHomeEye() {
    if (!root.HavenRender) return () => {};
    const orig = HavenRender.paintEye, scratch = document.createElement('canvas'); scratch.width = scratch.height = 2;
    const sctx = scratch.getContext('2d');
    HavenRender.paintEye = function (ctx, P) { if (ctx && ctx.canvas && ctx.canvas.id === 'world') return orig.call(this, sctx, P); return orig.call(this, ctx, P); };
    return () => { if (HavenRender.paintEye !== orig) HavenRender.paintEye = orig; try { if (root.Haven && Haven.holdHome) Haven.holdHome(false); } catch (e) {} };
  }

  // ======================================================================================
  //  The incoming invitation (a quiet card at the top, like a challenge)
  // ======================================================================================
  let card = null, callEye = null;
  function showCall() {
    hideCall();
    const t = T; if (!t) return;
    card = document.createElement('div'); card.id = 'eyesExchangeCall'; card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-label', 'Trade invitation');
    const their = t.theirs.profile && D() ? D().friendDNA(t.theirs.profile) : null;
    const name = (their && their.name) || t.theirs.name;
    card.innerHTML = `<div class="xxc-card"><canvas class="xxc-eye" aria-hidden="true"></canvas><p class="xxc-k">TRADE EYES</p>
      <p class="xxc-l"><b>${esc(friendName(t.f))}</b> offers <b>${esc(name)}</b> for your <b>${esc(t.mine.about.name)}</b>.</p>
      ${S.asked ? '' : '<label class="xxc-name"><input maxlength="24" autocomplete="nickname" placeholder="Your name in Eye Journals (optional)" aria-label="Your name in Eye Journals"></label>'}
      <div class="xxc-row"><button type="button" class="xxc-no">Not now</button><button type="button" class="xxc-yes">Take a look</button></div><i class="xxc-time"></i></div>`;
    document.body.appendChild(card);
    if (their && their.accent) card.style.setProperty('--c', their.accent.join(','));
    card.querySelector('.xxc-no').onclick = () => decline();
    card.querySelector('.xxc-yes').onclick = () => { const i = card && card.querySelector('.xxc-name input'); if (i && cleanLabel(i.value) && T) T.labelInput = i.value; accept(); };
    if (their) {
      const cv = card.querySelector('.xxc-eye'), dpr = Math.min(2, devicePixelRatio || 1); cv.width = cv.height = 64 * dpr;
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const e = makeEye(their); let last = performance.now() / 1000;
      const loop = () => { if (!card || !cv.isConnected) return; const t = performance.now() / 1000; e.step(t, Math.min(0.05, t - last)); last = t; c.clearRect(0, 0, 64, 64); drawEye(c, e, 32, 32, 22, 1, t); callEye = requestAnimationFrame(loop); };
      callEye = requestAnimationFrame(loop);
    }
    const bar = card.querySelector('.xxc-time');
    const tick = () => { if (!card || !T || !T.rec) return; bar.style.transform = `scaleX(${clamp((expiresAt(T.rec) - serverNow()) / TTL)})`; setTimeout(tick, 1000); };
    tick();
  }
  function hideCall() { if (callEye) cancelAnimationFrame(callEye); callEye = null; if (card) card.remove(); card = null; }

  // ======================================================================================
  //  Eye Contact: the button in a friend's Meeting Space
  // ======================================================================================
  function slot(box, b, ctx) {
    if (!box) return;
    box.innerHTML = '';
    if (!b || !F()) return;
    const f = b.native ? (F().nativeUpgrade ? F().nativeUpgrade() : null) : b.f;
    const why = canTradeWith(f, b);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ec-trade' + (why ? ' ec-trade-off' : '');
    btn.innerHTML = '<i class="ec-trade-g" aria-hidden="true"><i></i><i></i></i><span>Trade Eyes</span>';
    btn.setAttribute('aria-label', why ? `Trade Eyes (not available): ${why}` : `Trade Eyes with ${friendName(f)}: both of you see both Eyes before anything happens`);
    const sayIt = (ctx && ctx.say) || say;
    btn.onclick = () => { if (why) { sayIt(why); return; } if (busy()) { sayIt('One trade at a time.'); return; } invite(f); };
    box.appendChild(btn);
    const d = D() && D().dna && D().dna();
    if (d) {
      const j = document.createElement('button'); j.type = 'button'; j.className = 'ec-trade-journal'; j.textContent = `${d.name}'s journal`;
      j.onclick = () => openJournal();
      box.appendChild(j);
    }
  }
  // the Eye Journal on its own (from Eye Contact, or any other caller)
  async function openJournal() {
    const body = bodyOfLive(); if (!body) return;
    const a = about(body);
    let box = $('xxJournalSheet');
    if (!box) { box = document.createElement('div'); box.id = 'xxJournalSheet'; box.className = 'xx-journal'; document.body.appendChild(box); box.addEventListener('click', (ev) => { const b = ev.target.closest('[data-a=journal-close]'); if (b || ev.target === box) box.remove(); }); }
    journalInto(box, a, S.journals[body.cid] || null, S.counts[body.cid] || 0);
    if (S.reg[body.cid] && available() && navigator.onLine !== false) {
      const h = await journalOf(body.cid);
      const o = await tryRead('own/' + body.cid); if (o.ok && o.v) remember(body.cid, o.v);
      if (box.isConnected) journalInto(box, a, h, S.counts[body.cid] || 0);
    }
  }

  // ======================================================================================
  //  boot
  // ======================================================================================
  function boot() {
    migrate();
    if (F() && F().on) F().on('trade', (f, x, at) => onMessage(f, x, at));
    let arrive0 = null; try { arrive0 = parse(sessionStorage.getItem(ARRIVE)); sessionStorage.removeItem(ARRIVE); } catch (e) {}
    const bootOk = (root.EyesExchangeBoot && root.EyesExchangeBoot.ok) || (root.EyesLegacy && EyesLegacy.diagnostics && (EyesLegacy.diagnostics().boot || {}).op === 'exchange' && EyesLegacy.diagnostics().boot.ok);
    if (!(arrive0 && arrive0.cid && myCid() === arrive0.cid)) document.documentElement.classList.remove('xx-arriving');
    setTimeout(() => document.documentElement.classList.remove('xx-arriving'), 9000);   // never a dark screen, whatever happens
    if (arrive0 && arrive0.cid && myCid() === arrive0.cid) {
      if (arrive0.out) { S.departed[arrive0.out] = S.departed[arrive0.out] || { tid: arrive0.tid, at: arrive0.at, to: arrive0.fromLabel || '' }; save(); }
      note('arrival of ' + arrive0.cid + (bootOk ? '' : ' (already in place)'));
      setTimeout(() => playArrival(arrive0), 60);
    }
    const kick = () => { if (!document.hidden) setTimeout(() => reconcile(false), 2500); };
    addEventListener('online', () => reconcile(true));
    document.addEventListener('visibilitychange', kick);
    setTimeout(() => reconcile(true), 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  root.EyesExchange = {
    slot, invite: (f) => invite(f), journal: openJournal, busy, isOpen: sceneOpen,
    cidOf, myCid, on: (n, fn) => { (listeners[n] = listeners[n] || []).push(fn); },
    diagnostics: () => ({ phase: T ? T.phase : null, tid: T ? T.tid : null, pending: S.pending, known: Object.keys(S.known).length, registered: Object.keys(S.reg), departed: Object.keys(S.departed), log: log.slice(-20) }),
    _debug: {
      T: () => T, S: () => JSON.parse(JSON.stringify(S)), accept, decline, confirm, cancel, send, reconcile, bodyOfLive, cleanBody, snapOf, journeyLines, migrate,
      reoffer: async () => {            // test hook: change my side of the offer (bumps the version, clears confirmations)
        const t = T; if (!t || !t.rec) return false;
        const body = bodyOfLive(); body.mood.energy = Math.random();
        try { await update({ [`body/${t.mine.cid}`]: JSON.stringify(body), [`trades/${t.tid}/rev`]: t.rec.rev + 1, [`trades/${t.tid}/ca`]: null, [`trades/${t.tid}/cb`]: null }); t.mine.body = body; await t.watch.refresh(); return true; } catch (e) { return e.kind; }
      },
      skew: (ms) => { S.offset = (S.offset || 0) + ms; S.offsetAt = nowMs(); save(); },   // test hook: this phone's view of server time
      scene: () => (sceneEyes ? sceneEyes.debug() : null)
    }
  };
})(window);
