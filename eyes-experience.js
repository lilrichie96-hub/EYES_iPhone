/* EYES 5.3 · His remembered life, phone side (Android launcher and iPhone web app). No UI here.

   The phone is the creature's home and owner. It never invents desktop experiences (the rules forbid even the
   owner from writing a computer's memories); it READS them from expV1/<owner>/<creatureId>/, keeps a bounded
   local copy so the journal opens instantly and offline, and does three small owner jobs:
     custody(tid, device)  right after a launch commits, writes the visit's custody receipt on the computer's
                           behalf (the computer writes the same one; whichever lands first wins, both are valid)
     homecoming(tid)       after he comes home: one short look (at most two GETs) at that visit's highlights,
                           so the return can show what he brought back; never delays the return itself
     compact()             keeps the cloud bounded: very old visits fold into lifetime totals (tot) and their
                           keepsakes into arch, then the visit is pruned. Counts and firsts are never lost.
   Network: no standing connection, no polling. Reads happen when the journal opens (at most 1 + 6 GETs),
   after a return (1–2 GETs) and never otherwise. Everything is bounded and failure-tolerant: offline, it
   shows the copy it has.

   Storage: localStorage 'eyes.experience.v1' = { v, cid, at, tree, seenAt, homes } (bounded; see trim()). */
'use strict';
(function (root) {
  const STORE = 'eyes.experience.v1';
  const MAX_VISITS_FETCH = 6;
  const CACHE_VISITS = 80;
  const STALE_MS = 45000;
  const PRUNE_AFTER_MS = 180 * 86400000, PRUNE_ABOVE_VISITS = 120;
  const enc = encodeURIComponent;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (msg, code) => Object.assign(new Error(msg), { code });
  const stats = { gets: 0, puts: 0, deletes: 0, bytesDown: 0, errors: 0, loads: 0, cached: 0 };

  const local = () => { try { const s = JSON.parse(localStorage.getItem(STORE)); return s && s.v === 1 ? s : { v: 1 }; } catch (e) { return { v: 1 }; } };
  const save = (patch) => {
    const s = Object.assign(local(), patch);
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {
      // storage full (iPhone): keep the newest half of the visits and try once more
      try { s.tree = trim(s.tree, Math.floor(CACHE_VISITS / 2)); localStorage.setItem(STORE, JSON.stringify(s)); } catch (e2) {}
    }
    return s;
  };
  function creatureId() {
    const D = root.HavenDNA, s = D && D.summary ? D.summary() : null;
    return s && /^[A-Za-z0-9#_-]{1,40}$/.test(s.id) ? s.id : 'eye';
  }
  const ckey = (cid) => String(cid || '').replace(/#/g, '');

  async function call(method, path, body, timeout) {
    if (!root.EyesFirebase) throw err('Eye Contact service unavailable', 'nofirebase');
    const user = await EyesFirebase.session();
    const url = EyesFirebase.project + '/expV1/' + path + '.json?auth=' + enc(user.token);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout || 10000);
    let res;
    try {
      res = await fetch(url, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: ctl.signal });
    } catch (e) { stats.errors++; throw err('offline', 'offline'); } finally { clearTimeout(timer); }
    const text = await res.text();
    if (method === 'GET') { stats.gets++; stats.bytesDown += text.length; } else if (method === 'DELETE') stats.deletes++; else stats.puts++;
    if (!res.ok) { stats.errors++; throw err('Service returned ' + res.status, res.status === 401 || res.status === 403 ? 'denied' : 'server'); }
    try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
  }
  async function base() {
    const user = await EyesFirebase.session();
    return user.uid + '/' + ckey(creatureId());
  }

  function trim(tree, keep) {
    tree = tree || {};
    const cus = tree.cus || {}, dv = tree.dv || {};
    const tids = Object.keys(Object.assign({}, cus, dv)).sort((a, b) => ((cus[a] || {}).at || 0) - ((cus[b] || {}).at || 0));
    const drop = tids.slice(0, Math.max(0, tids.length - (keep || CACHE_VISITS)));
    if (!drop.length) return tree;
    const out = JSON.parse(JSON.stringify(tree));
    // locally, an old visit keeps its summary and only its keepsake-worthy highlights
    for (const tid of drop) {
      const d = out.dv && out.dv[tid];
      if (!d || !d.h) continue;
      for (const [k, r] of Object.entries(d.h)) if (!/first|"source":"expedition"/.test(String(r && r.d)) && r.t !== 'visit_started') delete d.h[k];
    }
    return out;
  }

  // the journal's data: cached instantly, refreshed when it's stale and we're online
  function cached() {
    const s = local();
    return s.cid === creatureId() ? (s.tree || {}) : {};
  }
  async function load(opts) {
    opts = opts || {};
    const s = local(), cid = creatureId();
    let tree = s.cid === cid ? (s.tree || {}) : {};
    if (!opts.force && s.cid === cid && s.at && Date.now() - s.at < STALE_MS) { stats.cached++; return tree; }
    stats.loads++;
    const b = await base();
    const cus = (await call('GET', b + '/cus', undefined, 8000)) || {};
    tree = Object.assign({}, tree, { cus });
    tree.dv = Object.assign({}, tree.dv);
    // which visits need (re)reading: new ones, ones whose receipt moved on (still uploading), recent ones
    const tids = Object.keys(cus).sort((x, y) => (cus[y].seen || 0) - (cus[x].seen || 0));
    const known = s.cid === cid ? (s.read || {}) : {};
    const need = tids.filter((tid) => !tree.dv[tid] || known[tid] !== cus[tid].seen || Date.now() - (cus[tid].seen || 0) < 8 * 86400000 && !(tree.dv[tid] && tree.dv[tid].sum)).slice(0, opts.max || MAX_VISITS_FETCH);
    const read = Object.assign({}, known);
    for (const tid of need) {
      try {
        const d = await call('GET', b + '/dv/' + tid, undefined, 8000);
        if (d) tree.dv[tid] = d; else delete tree.dv[tid];
        read[tid] = cus[tid].seen;
      } catch (e) { if (e.code === 'offline') break; }
    }
    for (const k of ['arch', 'tot']) {
      if (opts.archive !== false && (!tree[k] || opts.force)) { try { const v = await call('GET', b + '/' + k, undefined, 8000); if (v) tree[k] = v; else delete tree[k]; } catch (e) { if (e.code === 'offline') break; } }
    }
    tree = trim(tree);
    save({ cid, at: Date.now(), tree, read });
    return tree;
  }

  // the phone writes the receipt for the visit it just committed (owner on the holder's behalf)
  async function custody(tid, device) {
    if (!tid || !device) return false;
    try {
      const b = await base();
      await call('PUT', b + '/cus/' + tid, { dev: device, at: { '.sv': 'timestamp' }, seen: { '.sv': 'timestamp' } }, 8000);
      return true;
    } catch (e) { return false; }       // the computer writes it too; a denial just means it was first
  }

  // after a return: what came home with him from visit `tid` (never throws; null when nothing or unknown)
  async function homecoming(tid, opts) {
    opts = opts || {};
    if (!tid) return null;
    const C = root.EyesChronicle;
    const s = local(), cid = creatureId();
    let tree = s.cid === cid ? (s.tree || {}) : {};
    const tries = opts.tries || 2;
    for (let i = 0; i < tries; i++) {
      try {
        const b = await base();
        const d = await call('GET', b + '/dv/' + tid, undefined, 6000);
        if (d) {
          tree = Object.assign({}, tree, { dv: Object.assign({}, tree.dv, { [tid]: d }) });
          save({ cid, tree: trim(tree), at: 0 });          // at:0 -> the journal refreshes receipts next time
          const h = C ? C.homecoming(tree, tid) : null;
          if (h || i === tries - 1) return h;
        }
      } catch (e) { if (e.code === 'offline' || e.code === 'denied') return null; }
      if (i < tries - 1) await sleep(opts.wait || 3500);    // the computer flushes while it plays its departure
    }
    return null;
  }

  // a quiet "something new" hint for the journal entry point (no badges with numbers, no streaks)
  function unseen() {
    const C = root.EyesChronicle, s = local();
    if (!C || s.cid !== creatureId()) return 0;
    const m = C.model(s.tree || {});
    return m.highlights.filter((h) => h.at > (s.seenAt || 0) && h.t === 'discovery_found').length;
  }
  function markSeen() { save({ seenAt: Date.now() }); }

  // keep the cloud bounded: fold very old visits into lifetime totals and archive their keepsakes, then prune
  async function compact(now) {
    const C = root.EyesChronicle;
    if (!C) return { pruned: 0 };
    now = now || Date.now();
    const tree = await load({ force: true, max: 0 });
    const cus = tree.cus || {};
    const tids = Object.keys(cus).sort((a, b) => cus[a].at - cus[b].at);
    if (tids.length <= PRUNE_ABOVE_VISITS) return { pruned: 0 };
    const old = tids.slice(0, tids.length - PRUNE_ABOVE_VISITS).filter((t) => now - (cus[t].seen || 0) > PRUNE_AFTER_MS);
    if (!old.length) return { pruned: 0 };
    const b = await base();
    const full = await load({ force: true, max: 1000 });
    const m = C.model(full), keep = new Set(C.entries(m).filter((e) => e.keepsake).map((e) => e.id));
    const totPrev = full.tot ? JSON.parse(full.tot.c || '{}') : {};
    const tot = { a: totPrev.a || {}, d: totPrev.d || {}, n: totPrev.n || [0, 0, 0], x: totPrev.x || 0 };
    for (const tid of old) {
      const d = (full.dv || {})[tid] || {};
      const sum = d.sum ? JSON.parse(d.sum.c || '{}') : {};
      for (const [k, p] of Object.entries(sum.a || {})) { tot.a[k] = tot.a[k] || [0, 0]; tot.a[k][0] += p[0]; tot.a[k][1] += p[1]; }
      for (const [k, n] of Object.entries(sum.d || {})) tot.d[k] = (tot.d[k] || 0) + n;
      if (sum.n) tot.n = [tot.n[0] + sum.n[0], tot.n[1] + sum.n[1], Math.max(tot.n[2], sum.n[2])];
      tot.x += sum.x || 0;
      for (const r of Object.values(d.h || {})) if (keep.has(r.i)) await call('PUT', b + '/arch/' + r.i, { i: r.i, t: r.t, at: r.at, d: r.d, tid, dev: cus[tid].dev });
    }
    await call('PUT', b + '/tot', { n: ((full.tot && full.tot.n) || 0) + 1, at: { '.sv': 'timestamp' }, c: JSON.stringify(tot).slice(0, 8000) });
    for (const tid of old) await call('DELETE', b + '/dv/' + tid);
    await load({ force: true });
    return { pruned: old.length };
  }

  root.EyesExperience = { load, cached, custody, homecoming, unseen, markSeen, compact, creatureId, ckey, stats: () => Object.assign({}, stats), _trim: trim };
})(window);
