/* EYES 5.1 · Free Roam protocol, phone side (freeRoamV1). No UI here; slingshot.js drives it.
   5.3: remembers which visit (transferId) he is away on / coming home from (lastVisit), and asks
   eyes-experience.js to write that visit's custody receipt right after a launch commits.

   One creature, one authoritative record: freeRoamV1/roam/<owner uid> { activeDeviceId, generation, transferId,
   phase, leaseExpiresAt, ... }. The phone is the owner; its anonymous uid (the same Eye Contact device session,
   eyes-firebase.js) is the home device id. A paired computer is a separate anonymous uid registered under
   freeRoamV1/dev/<owner>/<device> after approval on BOTH screens.

   Launch:  request {k:launch, to, eg} -> the computer prepares and answers rdy -> compare-and-set (ETag) the
            record to generation+1 / computer -> only then does the phone show him leaving.
   Recall:  request {k:recall, from, eg} -> the computer plays its departure and answers rel -> compare-and-set
            to generation+1 / home. If the computer is silent, its lease (<= 90 s) runs out and the rules let the
            owner take him home; we never show him at home while the record says he is elsewhere.
   Battery: no standing connection. Short polls only while a transfer is in flight, a slow check while away
            and the app is visible. All writes are validated by the rules, never trusted from the client. */
'use strict';
(function (root) {
  const STORE = 'eyes.roam.v1';
  const QR_PREFIX = 'EYESROAM1:';
  const LEASE_MS = 90000;
  const ONLINE_MS = 150000;           // a computer that wrote presence in the last 2.5 min counts as reachable
  const enc = encodeURIComponent;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (msg, code, extra) => Object.assign(new Error(msg), { code }, extra || {});

  let offset = 0;                     // server clock - local clock
  const now = () => Date.now() + offset;
  const local = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } };
  const save = (patch) => { const s = Object.assign(local(), patch); try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} return s; };
  const rid = (n) => { const b = crypto.getRandomValues(new Uint8Array(n)); const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; return Array.from(b, (x) => A[x & 63]).join(''); };
  const cleanName = (s) => String(s || '').replace(/[<>&"\u0000-\u001f]/g, '').trim().slice(0, 32);

  function fb() {
    if (!root.EyesFirebase) throw err('Eye Contact service unavailable', 'nofirebase');
    return root.EyesFirebase;
  }
  async function session() { return fb().session(); }
  // ETag compare-and-set is defence in depth: the rules themselves only accept generation + 1 against the
  // stored generation (an atomic server-side check). If a WebView's CORS handling ever refuses the ETag
  // headers, we fall back to plain requests and rely on the rules alone.
  let etagBlocked = false;
  async function call(method, path, body, opts) {
    opts = opts || {};
    let user = await session();
    for (let attempt = 0; attempt < 3; attempt++) {
      const url = fb().project + '/freeRoamV1/' + path + '.json?auth=' + enc(user.token);
      const headers = {};
      const tagged = !etagBlocked && (opts.etag || opts.ifMatch);
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (tagged && opts.etag) headers['X-Firebase-ETag'] = 'true';
      if (tagged && opts.ifMatch) headers['if-match'] = opts.ifMatch;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeout || 12000);
      let res;
      try {
        res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: ctl.signal });
      } catch (e) {
        clearTimeout(timer);
        if (tagged && navigator.onLine !== false && e && e.name !== 'AbortError') { etagBlocked = true; continue; }
        throw err(navigator.onLine === false ? 'You are offline' : 'Network problem', 'offline');
      } finally { clearTimeout(timer); }
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      const tag = res.headers.get('ETag');
      if (res.ok) return { data, etag: tag };
      if (res.status === 412) throw err('Changed meanwhile', 'conflict', { data, etag: tag });
      if (res.status === 401 && attempt < 2 && !opts.refreshed && /expired/i.test(String(data && data.error))) { opts.refreshed = true; user = await session(); continue; }
      if (res.status === 401 || res.status === 403) throw err('Not allowed', 'denied');
      throw err('Service returned ' + res.status, 'server');
    }
  }
  const learn = (t, sent) => { if (typeof t === 'number' && t > 1e12) offset = Math.round(t - (sent + Date.now()) / 2); };

  // ---------------------------------------------------------------- identity of the creature
  function look() {
    const D = root.HavenDNA;
    const p = D && D.profile ? D.profile() : null;
    const skin = (document.documentElement.dataset.skin || 'original');
    // + how far his iris pattern has grown in (a baby's pattern fills in over its first week); the profile alone
    // doesn't carry it, and the companion must paint exactly this eye
    const own = D && D.dna ? D.dna() : null;
    if (p && own && Number.isFinite(own.growthPattern)) p.gp = Math.round(own.growthPattern * 1000) / 1000;
    const ps = p ? JSON.stringify(p) : '';
    let h = 2166136261;
    for (const c of ps + '|' + skin) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return { p: ps, skin: ['original', 'ember', 'frost', 'nebula'].includes(skin) ? skin : 'original', av: h };
  }
  function creatureId() {
    const D = root.HavenDNA, s = D && D.summary ? D.summary() : null;
    return s && /^[A-Za-z0-9#_-]{1,40}$/.test(s.id) ? s.id : 'eye';
  }
  function phoneName() {
    const D = root.HavenDNA, n = D && D.dna && D.dna() ? D.dna().name : '';
    return cleanName(n ? n + "'s phone" : 'EYES phone') || 'EYES phone';
  }

  // ---------------------------------------------------------------- pairing (phone half)
  function parseCode(text) {
    let s = String(text || '').trim();
    if (/^EYESROAM1:T:/i.test(s)) return null;
    if (s.toUpperCase().startsWith(QR_PREFIX)) s = s.slice(QR_PREFIX.length);
    s = s.replace(/[\s.]/g, '');
    return /^[A-Za-z0-9_-]{32}$/.test(s) ? s : null;
  }
  async function confirmCode(pid, uid) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pid + ':' + uid)));
    const n = (((h[0] << 24) >>> 0) + (h[1] << 16) + (h[2] << 8) + h[3]) % 1000000;
    const s = String(n).padStart(6, '0');
    return s.slice(0, 3) + ' ' + s.slice(3);
  }
  // Step 1: read the computer's challenge and show the user who it is and the comparison code.
  async function inspect(code) {
    const pid = parseCode(code);
    if (!pid) throw err("That isn't an EYES pairing code", 'badcode');
    const me = await session();
    const { data } = await call('GET', 'pair/' + pid);
    if (!data || !data.dev) throw err('That code has expired. Start pairing again on the computer.', 'expired');
    if (data.exp < now() - 2000 || data.claim) throw err(data.claim ? 'That code was already used. Start again on the computer.' : 'That code has expired. Start pairing again on the computer.', 'expired');
    if (data.dev === me.uid) throw err('That code belongs to this phone', 'badcode');
    return { pid, device: data.dev, name: cleanName(data.name) || 'Computer', exp: data.exp, code: await confirmCode(pid, me.uid) };
  }
  // Step 2 (after the user tapped Pair on the phone): claim, wait for approval on the computer, register.
  async function pair(info, onStage, signal) {
    const me = await session();
    const sent = Date.now();
    const r = await call('PUT', 'pair/' + info.pid + '/claim', { uid: me.uid, name: phoneName(), at: { '.sv': 'timestamp' } });
    learn(r.data && r.data.at, sent);
    onStage && onStage('waiting');
    while (true) {
      if (signal && signal.aborted) throw err('Cancelled', 'cancelled');
      if (now() > info.exp + 2000) throw err('The computer did not approve in time', 'expired');
      await sleep(1200);
      let d;
      try { d = (await call('GET', 'pair/' + info.pid)).data; } catch (e) { if (e.code === 'offline') continue; throw e; }
      if (!d) throw err('The computer declined or cancelled pairing', 'declined');
      if (d.ok && d.ok.uid === me.uid) break;
    }
    await call('PUT', 'dev/' + me.uid + '/' + info.device, { name: info.name, kind: 'desktop', pair: info.pid, at: { '.sv': 'timestamp' } });
    const devs = Object.assign({}, local().devices, { [info.device]: { name: info.name, at: Date.now() } });
    save({ devices: devs, last: info.device });
    await ensureRecord();
    await publishLook(true);
    // 5.3: ask the browser to keep this site's storage (iPhone Safari may otherwise trim it after weeks unused;
    // a Home Screen app is normally granted). Best effort; Android's WebView keeps it anyway.
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
    onStage && onStage('paired');
    return { device: info.device, name: info.name };
  }
  async function devices(refresh) {
    const me = await session();
    if (!refresh) return local().devices || {};
    const { data } = await call('GET', 'dev/' + me.uid);
    const out = {};
    for (const [id, v] of Object.entries(data || {})) out[id] = { name: cleanName(v && v.name) || 'Computer', at: v && v.at };
    save({ devices: out });
    return out;
  }
  async function unpair(device) {
    const me = await session();
    await call('DELETE', 'dev/' + me.uid + '/' + device);
    const devs = Object.assign({}, local().devices); delete devs[device];
    save({ devices: devs });
  }
  async function presence(device) {
    const me = await session();
    const { data } = await call('GET', 'pres/' + me.uid + '/' + device);
    const fresh = !!(data && data.on && typeof data.at === 'number' && now() - data.at < ONLINE_MS);
    return { online: fresh, seen: data && data.at, version: data && data.v };
  }
  async function heartbeat() {
    const me = await session();
    const sent = Date.now();
    const r = await call('PUT', 'pres/' + me.uid + '/' + me.uid, { at: { '.sv': 'timestamp' }, on: true, v: '5.3.0' });
    learn(r.data && r.data.at, sent);
  }

  // ---------------------------------------------------------------- the record
  async function read() {
    const me = await session();
    const r = await call('GET', 'roam/' + me.uid, undefined, { etag: true });
    return { rec: r.data, etag: r.etag, me: me.uid };
  }
  async function ensureRecord() {
    const s = await read();
    if (s.rec) return s;
    const L = look();
    const rec = { creatureId: creatureId(), ownerUid: s.me, activeDeviceId: s.me, generation: 1, transferId: rid(20), phase: 'home',
      sourceDeviceId: s.me, destinationDeviceId: s.me, leaseExpiresAt: 0, lastUpdatedAt: { '.sv': 'timestamp' }, appearanceVersion: L.av };
    try {
      const sent = Date.now();
      const r = await call('PUT', 'roam/' + s.me, rec, { ifMatch: s.etag || undefined });
      learn(r.data && r.data.lastUpdatedAt, sent);
      return { rec: r.data, etag: r.etag, me: s.me };
    } catch (e) { if (e.code === 'conflict') return read(); throw e; }
  }
  async function publishLook(force) {
    const me = await session();
    const L = look();
    if (!force && local().av === L.av) return L;
    if (!L.p) return L;
    await call('PUT', 'look/' + me.uid, { p: L.p, skin: L.skin, av: L.av, at: { '.sv': 'timestamp' } });
    save({ av: L.av });
    return L;
  }
  // where is he, according to the server (null = not reachable)
  async function where() {
    const s = await read();
    if (!s.rec) return { home: true, rec: null, me: s.me };
    const home = s.rec.activeDeviceId === s.me;
    if (!home) save({ lastVisit: { tid: s.rec.transferId, device: s.rec.activeDeviceId } });
    save({ away: home ? null : { device: s.rec.activeDeviceId, gen: s.rec.generation, lease: s.rec.leaseExpiresAt, tid: s.rec.transferId } });
    return { home, rec: s.rec, etag: s.etag, me: s.me, device: home ? null : s.rec.activeDeviceId, leaseLeft: home ? 0 : s.rec.leaseExpiresAt - now() };
  }

  // ---------------------------------------------------------------- launch
  // prepare(): makes the request so the computer can get ready while the user is still pulling.
  async function prepare(device) {
    await heartbeat().catch(() => {});
    let s = await ensureRecord();
    if (s.rec.activeDeviceId !== s.me) throw err('He is already away', 'away');
    await publishLook(false);
    const t = rid(20);
    const req = { k: 'launch', from: s.me, to: device, eg: s.rec.generation, at: { '.sv': 'timestamp' }, exp: now() + 45000 };
    await call('PUT', 'req/' + s.me + '/' + t, req);
    save({ pending: { tid: t, device, eg: s.rec.generation, at: Date.now() } });
    return { tid: t, device, eg: s.rec.generation, me: s.me };
  }
  // waits for the computer's answer: 'ready' | 'nack:<why>' | 'timeout'
  async function awaitReady(P, ms, signal) {
    const end = Date.now() + (ms || 9000);
    while (Date.now() < end) {
      if (signal && signal.aborted) return 'cancelled';
      try {
        const { data } = await call('GET', 'req/' + P.me + '/' + P.tid, undefined, { timeout: 6000 });
        if (!data) return 'gone';
        if (data.nack) return 'nack:' + data.nack.why;
        if (data.rdy && data.rdy.by === P.device) return 'ready';
      } catch (e) { if (e.code !== 'offline') throw e; }
      await sleep(350);
    }
    return 'timeout';
  }
  // the moment of truth: compare-and-set generation g -> g+1 on the computer. true = he is gone.
  async function commitLaunch(P) {
    const s = await read();
    if (!s.rec || s.rec.activeDeviceId !== s.me || s.rec.generation !== P.eg) throw err('Something changed; try again', 'conflict');
    const rec = Object.assign({}, s.rec, { activeDeviceId: P.device, generation: P.eg + 1, transferId: P.tid, phase: 'away',
      sourceDeviceId: s.me, destinationDeviceId: P.device, leaseExpiresAt: now() + LEASE_MS, lastUpdatedAt: { '.sv': 'timestamp' }, appearanceVersion: local().av || 0 });
    const sent = Date.now();
    const r = await call('PUT', 'roam/' + s.me, rec, { ifMatch: s.etag });
    learn(r.data && r.data.lastUpdatedAt, sent);
    save({ away: { device: P.device, gen: P.eg + 1, lease: r.data.leaseExpiresAt, tid: P.tid }, pending: null, lastVisit: { tid: P.tid, device: P.device } });
    call('DELETE', 'req/' + s.me + '/' + P.tid).catch(() => {});
    // 5.3: the custody receipt for this visit, so whatever he discovers there can follow him home (best effort;
    // the computer writes the same receipt when it lands)
    try { if (root.EyesExperience) EyesExperience.custody(P.tid, P.device); } catch (e) {}
    return r.data;
  }
  async function cancel(P) {
    save({ pending: null });
    if (P && P.tid) await call('DELETE', 'req/' + P.me + '/' + P.tid).catch(() => {});
  }

  // ---------------------------------------------------------------- recall
  // Asks the computer to let him go; resolves when he is home (committed) or with {waiting, until}.
  async function recall(onStage, signal) {
    let s = await read();
    if (!s.rec || s.rec.activeDeviceId === s.me) { save({ away: null }); return { home: true, already: true }; }
    const device = s.rec.activeDeviceId, gen = s.rec.generation;
    save({ lastVisit: { tid: s.rec.transferId, device } });                // 5.3: which visit he is coming home from
    const t = rid(20);
    let asked = false;
    try {
      await call('PUT', 'req/' + s.me + '/' + t, { k: 'recall', from: device, to: s.me, eg: gen, at: { '.sv': 'timestamp' }, exp: now() + 45000 });
      asked = true;
    } catch (e) { if (e.code === 'offline') throw e; }     // denied: the device may already be unpaired - commit below decides
    onStage && onStage('asking');
    const end = Date.now() + 11000;
    let released = false;
    while (asked && Date.now() < end) {
      if (signal && signal.aborted) return { cancelled: true };
      await sleep(400);
      try {
        const { data } = await call('GET', 'req/' + s.me + '/' + t, undefined, { timeout: 6000 });
        if (data && data.rel && data.rel.gen === gen) { released = true; break; }
        const cur = await read();
        if (cur.rec && cur.rec.activeDeviceId === s.me) { save({ away: null }); call('DELETE', 'req/' + s.me + '/' + t).catch(() => {}); return { home: true, by: 'computer' }; }
      } catch (e) { if (e.code !== 'offline') throw e; }
    }
    s = await read();
    if (s.rec && s.rec.activeDeviceId === s.me) { save({ away: null }); return { home: true, by: 'computer' }; }
    const leaseOver = s.rec && s.rec.leaseExpiresAt < now() - 1500;
    if (!released && !leaseOver) {
      // try anyway: if the computer was unpaired the rules allow it; otherwise we wait for the lease
      try { return await commitHome(s, t, device); } catch (e) { if (e.code !== 'denied' && e.code !== 'conflict') throw e; }
      call('DELETE', 'req/' + s.me + '/' + t).catch(() => {});
      return { waiting: true, until: s.rec.leaseExpiresAt, device };
    }
    return commitHome(s, t, device);
  }
  async function commitHome(s, t, device) {
    const rec = Object.assign({}, s.rec, { activeDeviceId: s.me, generation: s.rec.generation + 1, transferId: t, phase: 'home',
      sourceDeviceId: device, destinationDeviceId: s.me, leaseExpiresAt: 0, lastUpdatedAt: { '.sv': 'timestamp' } });
    await call('PUT', 'roam/' + s.me, rec, { ifMatch: s.etag });
    save({ away: null });
    call('DELETE', 'req/' + s.me + '/' + t).catch(() => {});
    return { home: true, by: 'recall' };
  }

  // an aiming code: 'EYESROAM1:T:<device uid>' (shown by a paired computer). It only selects a computer this
  // phone already paired with; it can't introduce a new one.
  function parseTarget(text) {
    const m = /^EYESROAM1:T:([A-Za-z0-9]{6,128})$/i.exec(String(text || '').trim());
    return m ? m[1] : null;
  }
  root.EyesRoam = {
    QR_PREFIX, parseCode, parseTarget,
    isCode: (t) => { const s = String(t || '').trim().toUpperCase(); return s.startsWith(QR_PREFIX) && (!!parseCode(t) || !!parseTarget(t)); },
    inspect, pair, devices, unpair, presence, heartbeat,
    where, prepare, awaitReady, commitLaunch, cancel, recall,
    cached: () => local(), now, look, phoneName,
    _offset: () => offset,
    _etagBlocked: () => etagBlocked
  };
})(window);
