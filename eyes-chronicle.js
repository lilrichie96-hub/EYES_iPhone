/* EYES 5.3 · The chronicle: pure functions that turn remembered experiences into his journal, his collection and
   his memories. No DOM, no network, no clock except what callers pass in; the same file runs on the Android
   launcher, the iPhone web app, the companion's desktop journal viewer and (for tests) under node.

   Input is the cloud shape of one creature's experiences (firebase_rules/expV1.fragment.json):
     { cus: { <tid>: {dev, at, seen} },                     one custody receipt per visit
       dv:  { <tid>: { h: { "00": {i, t, at, d} , ... },     highlights (d is a JSON string)
                       sum: {n, at, c} } },                  the visit's summary (c is a JSON string)
       arch: { <i>: {i, t, at, d, tid, dev} } }              keepsakes the phone archived when pruning
   The desktop viewer passes its local chronicle in the same shape (chronicle.py snapshot()).

   Truthfulness: every entry is generated from a recorded event, and every count comes from a visit summary;
   the wording picks between templates deterministically (event id + temperament), so it never changes when
   you look again and never invents an outcome. "First" means the earliest such moment anyone recorded. */
'use strict';
(function (root) {
  const CAT = () => root.EYES_CATALOG || (typeof require === 'function' ? require('./eyes-catalog.js') : null);
  const DAY = 86400000;

  // ------------------------------------------------------------------ helpers
  function hash(s) {                          // FNV-1a, stable across platforms
    let h = 2166136261;
    s = String(s);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h >>> 0;
  }
  const parse = (s, d) => { if (s && typeof s === 'object') return s; try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } };
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
  function duration(ms) {
    const m = Math.round(ms / 60000);
    if (m < 2) return 'a moment';
    if (m < 60) return m + ' minutes';
    const h = m / 60;
    if (h < 1.5) return 'about an hour';
    if (h < 24) return 'about ' + Math.round(h) + ' hours';
    const d = Math.round(ms / DAY);
    return d === 1 ? 'a day' : d + ' days';
  }
  const info = (id) => (CAT().discoveries || {})[id] || null;

  // temperament -> tone (coarse, deterministic; the full behavioural profile lives in personality.py)
  function tone(T) {
    T = T || {};
    const v = (k) => (typeof T[k] === 'number' ? Math.max(0, Math.min(1, T[k])) : 0.5);
    const p = {
      curiosity: 0.72 * v('curiosity') + 0.16 * (1 - v('shyness')) + 0.12 * v('energy'),
      courage: 0.58 * (1 - v('shyness')) + 0.24 * v('energy') + 0.18 * v('grump'),
      playfulness: 0.56 * v('energy') + 0.26 * v('drama') + 0.18 * (1 - v('grump')),
      restfulness: 0.62 * (1 - v('energy')) + 0.2 * v('grump') + 0.18 * (1 - v('drama')),
      expressive: 0.35 + 0.65 * v('drama')
    };
    p.key = ['curiosity', 'courage', 'playfulness', 'restfulness'].sort((a, b) => p[b] - p[a])[0];
    return p;
  }
  function pick(list, id, tn) {
    if (!list || !list.length) return '';
    // dramatic creatures lean on the more theatrical (later) phrasings; everyone else spreads evenly
    const h = hash(id + ':' + (tn ? tn.key : ''));
    if (tn && tn.expressive > 0.72 && list.length > 1 && h % 3 === 0) return list[list.length - 1];
    return list[h % list.length];
  }
  function fill(t, vars) {
    return String(t).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  }

  // ------------------------------------------------------------------ normalise
  function model(tree, opts) {
    opts = opts || {};
    tree = tree || {};
    const cus = tree.cus || {}, dv = tree.dv || {}, arch = tree.arch || {};
    const names = opts.devices || {};
    const visits = [];
    const seen = new Set();
    const hl = [];
    const tids = new Set(Object.keys(cus).concat(Object.keys(dv)));
    for (const tid of tids) {
      const c = cus[tid] || {}, d = dv[tid] || {};
      const sum = d.sum ? parse(d.sum.c, {}) : {};
      const dev = c.dev || null;
      const v = { tid, dev, at: c.at || sum.f || 0, seen: c.seen || sum.l || 0, sum, name: names[dev] || sum.dn || 'a computer', n: d.sum ? d.sum.n || 0 : 0 };
      visits.push(v);
      for (const [slot, r] of Object.entries(d.h || {})) {
        if (!r || !r.i || seen.has(r.i)) continue;
        seen.add(r.i);
        hl.push({ i: r.i, t: r.t, at: r.at || 0, d: parse(r.d, {}), tid, slot, dev, device: v.name });
      }
    }
    for (const r of Object.values(arch)) {
      if (!r || !r.i || seen.has(r.i)) continue;
      seen.add(r.i);
      const v = visits.find((x) => x.tid === r.tid);
      hl.push({ i: r.i, t: r.t, at: r.at || 0, d: parse(r.d, {}), tid: r.tid || null, slot: null, dev: r.dev || null, device: v ? v.name : (names[r.dev] || 'a computer'), archived: true });
    }
    visits.sort((a, b) => a.at - b.at);
    hl.sort((a, b) => a.at - b.at || (a.i < b.i ? -1 : 1));
    // lifetime totals: the desktop snapshot's own archive, and/or what the phone folded in when pruning (tot)
    let archive = tree.archive && Object.keys(tree.archive.d || {}).length + Object.keys(tree.archive.a || {}).length ? tree.archive : null;
    const tot = tree.tot ? parse(tree.tot.c, null) : null;
    if (tot && archive) {
      const a = {}, d = {};
      for (const src of [archive, tot]) {
        for (const [k, p] of Object.entries(src.a || {})) { a[k] = a[k] || [0, 0]; a[k][0] += p[0] || 0; a[k][1] += p[1] || 0; }
        for (const [k, n] of Object.entries(src.d || {})) d[k] = (d[k] || 0) + n;
      }
      const n0 = archive.n || [0, 0, 0], n1 = tot.n || [0, 0, 0];
      archive = { a, d, n: [n0[0] + n1[0], n0[1] + n1[1], Math.max(n0[2], n1[2])], x: (archive.x || 0) + (tot.x || 0) };
    } else if (tot) archive = tot;
    return { visits, highlights: hl, archive };
  }

  // ------------------------------------------------------------------ the journal
  function entries(m, opts) {
    opts = opts || {};
    const J = CAT().journal, tn = tone(opts.temperament);
    const firstD = new Map(), firstA = new Map(), firstF = new Map();
    const out = [];
    let anyFish = false, anyFlower = false, anyPortal = false;
    for (const h of m.highlights) {
      const d = h.d || {}, ids = Array.isArray(d.ids) ? d.ids.filter((x) => info(x)) : [];
      let text = '', kind = '', keep = false, cat = null, arts = [];
      if (h.t === 'discovery_found' && ids.length) {
        const id = ids[0], I = info(id);
        const isFirst = !firstD.has(id);
        ids.forEach((x) => { if (!firstD.has(x)) firstD.set(x, h.at); });
        const vars = { name: I.name.toLowerCase(), a: I.a, A: cap(I.a), stones: d.stones, petals: d.petals };
        const src = d.source;
        cat = I.cat; arts = ids.slice(0, 3);
        if (isFirst) {
          // "his first ever" only when it truly is the first portal trip / the first flower of all
          const key = src === 'expedition' ? (anyPortal ? 'expedition' : 'expedition.firstever')
            : id.startsWith('botanical.flower') ? (anyFlower ? 'flower' : 'flower.firstever') : I.nature;
          text = pick(J.first[key] || J.first.found, h.i, tn);
          kind = 'first'; keep = true;
          if (id.startsWith('aquatic.fish.') && !anyFish) text = 'Caught his first fish!';
          if (id.startsWith('aquatic.fish.')) anyFish = true;
        } else {
          const key = src === 'fishing' ? (id.startsWith('aquatic.fish.') ? 'fishing.fish' : 'fishing.oddity')
            : src === 'gardening' ? (d.revived ? 'gardening.revived' : 'gardening') : src === 'drawing' ? (ids.length > 1 ? 'drawing.many' : 'drawing') : src;
          text = pick(J.discovery[key] || J.discovery.expedition, h.i, tn);
          kind = src === 'expedition' ? 'expedition' : 'discovery';
          keep = src === 'expedition';                      // repeats of uncommon finds stay in Lately, not Keepsakes
          if (I.commonness === 'uncommon' && src !== 'expedition') text = pick(J.uncommon, h.i, tn);
          if (id.startsWith('aquatic.fish.')) anyFish = true;
        }
        if (src === 'expedition') anyPortal = true;
        if (id.startsWith('botanical.flower')) anyFlower = true;
        text = fill(text, vars);
      } else if (h.t === 'activity_failed') {
        const act = d.activity;
        const key = act === 'fishing' ? (d.caught === 'bubble' ? 'fishing.bubble' : 'fishing.snap') : act === 'building' ? 'building' : act === 'expedition' ? 'expedition' : 'any';
        text = fill(pick(J.failed[key] || J.failed.any, h.i, tn), { stones: d.stones || 'a few' });
        kind = 'failed'; keep = !firstF.has(act); firstF.set(act, true);
      } else if (h.t === 'activity_completed') {
        const act = d.activity, A = (CAT().activities || {})[act] || { verb: act };
        const isFirst = !firstA.has(act); firstA.set(act, true);
        if (act === 'nest') {
          const mins = Math.round((d.slept_s || 0) / 60);
          text = isFirst ? pick(J.completed['nest.first'], h.i, tn) : fill(pick(mins >= 4 ? J.completed.nest : [J.completed.nest[0]], h.i, tn), { minutes: plural(mins, 'minute') });
          kind = 'rest';
        } else if (J.completed[act]) {
          text = fill(pick(J.completed[act], h.i, tn), { looks: d.looks || 'a few' });
          kind = 'play';
        } else { text = fill(pick(J.completed.first, h.i, tn), { verb: A.verb }); kind = 'play'; }
        keep = isFirst;
      } else if (h.t === 'rest_location_selected') {
        text = fill(pick(J.rest.favourite, h.i, tn), { device: h.device, region: String(d.region || 'corner').replace('-', ' ') });
        kind = 'rest'; keep = true;
      } else if (h.t === 'visit_started') {
        text = fill(pick(J.visit.first, h.i, tn), { device: d.device || h.device });
        kind = 'visit'; keep = true;
      } else continue;
      out.push({ id: h.i, at: h.at, kind, text, keepsake: keep, cat, arts, vs: d.vs || 0, tid: h.tid, dev: h.dev, device: h.device });
    }
    // one quiet line per finished stay, from its summary: how long, and what kept him busy (counts are facts)
    for (const v of m.visits) {
      const s = v.sum || {};
      if (!s.f || !s.l || s.l - s.f < 10 * 60000 || opts.liveTid === v.tid) continue;
      const bits = summaryBits(s);
      const t = fill(pick(J.visit.summary, v.tid, tn), { duration: duration(s.l - s.f), device: v.name });
      out.push({ id: 'visit:' + v.tid, at: s.l, kind: 'visit', text: t + (bits.length ? ' ' + cap(bits.join(', ')) + '.' : ''), keepsake: false, cat: null, arts: [], tid: v.tid, dev: v.dev, device: v.name, summary: true });
    }
    out.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
    return out;
  }
  function summaryBits(s) {
    const n = { fish: 0, flowers: 0, towers: 0, drawings: 0, finds: 0 };
    for (const [id, c] of Object.entries(s.d || {})) {
      if (id.startsWith('aquatic.fish.')) n.fish += c;
      else if (id.startsWith('botanical.flower.')) n.flowers += c;
      else if (id === 'creation.tower') n.towers += c;
      else if (id.startsWith('creation.drawing.')) n.drawings += c;
      else n.finds += c;
    }
    const naps = (s.n && s.n[0]) || 0;
    const b = [];
    if (n.fish) b.push('met ' + plural(n.fish, 'fish', 'fish'));
    if (n.flowers) b.push('grew ' + plural(n.flowers, 'flower'));
    if (n.towers) b.push('built ' + plural(n.towers, 'tower'));
    if (n.drawings) b.push('drew ' + plural(n.drawings, 'picture'));
    if (n.finds) b.push('found ' + plural(n.finds, 'thing'));
    if (naps) b.push('napped ' + (naps === 1 ? 'once' : naps + ' times'));
    return b.slice(0, 4);
  }

  // ------------------------------------------------------------------ the collection
  function collection(m) {
    const items = {};
    const touch = (id) => (items[id] = items[id] || { id, info: info(id), count: 0, first: 0, firstApprox: false, origins: {}, devices: {}, vs: 0 });
    for (const v of m.visits) {
      for (const [id, c] of Object.entries((v.sum && v.sum.d) || {})) {
        if (!info(id)) continue;
        const it = touch(id);
        it.count += c;
        if (v.dev) it.devices[v.dev] = v.name;
        if (!it.first || (v.sum.f && v.sum.f < it.first)) { it.first = v.sum.f || v.at; it.firstApprox = true; }
      }
    }
    if (m.archive && m.archive.d) for (const [id, c] of Object.entries(m.archive.d)) if (info(id)) touch(id).count += c;
    const hlFirst = {};
    for (const h of m.highlights) {
      if (h.t !== 'discovery_found') continue;
      for (const id of (h.d && h.d.ids) || []) {
        if (!info(id)) continue;
        const it = touch(id);
        if (!hlFirst[id] || h.at < hlFirst[id].at) hlFirst[id] = h;
        it.origins[h.d.source || '?'] = (it.origins[h.d.source || '?'] || 0) + 1;
        if (h.dev) it.devices[h.dev] = h.device;
        if (!it.count) it.count = 1;                 // a highlight whose summary hasn't arrived yet: at least once
      }
    }
    for (const [id, h] of Object.entries(hlFirst)) { const it = items[id]; it.first = h.at; it.firstApprox = false; it.vs = h.d.vs || 0; it.where = h.device; }
    const cats = (CAT().categories || []).map((c) => ({ id: c.id, label: c.label, blurb: c.blurb, items: [] }));
    for (const it of Object.values(items)) { const c = cats.find((x) => x.id === it.info.cat); if (c) c.items.push(it); }
    for (const c of cats) c.items.sort((a, b) => a.first - b.first);
    return { categories: cats, total: Object.keys(items).length, known: Object.keys(CAT().discoveries || {}).filter((k) => !CAT().discoveries[k].retired).length };
  }

  // ------------------------------------------------------------------ memories (derived; the DNA is never touched)
  function memory(m) {
    const life = {}, firsts = [];
    const add = (act, ok, bad) => { const x = (life[act] = life[act] || { ok: 0, fail: 0 }); x.ok += ok; x.fail += bad; };
    let nests = 0, slept = 0, longest = 0, expeditions = 0;
    const devices = {};
    const src = m.visits.map((v) => v.sum || {}).concat(m.archive ? [m.archive] : []);
    for (const s of src) {
      for (const [act, pair] of Object.entries(s.a || {})) add(act, pair[0] || 0, pair[1] || 0);
      if (s.n) { nests += s.n[0] || 0; slept += s.n[1] || 0; longest = Math.max(longest, s.n[2] || 0); }
      expeditions += s.x || 0;
    }
    for (const v of m.visits) {
      if (!v.dev && !v.name) continue;
      const k = v.dev || v.name, d = (devices[k] = devices[k] || { name: v.name, first: v.at, visits: 0, time: 0 });
      d.visits++; d.first = Math.min(d.first || v.at, v.at || d.first);
      if (v.sum && v.sum.f && v.sum.l) d.time += v.sum.l - v.sum.f;
    }
    const seenA = new Set(), seenD = new Set();
    for (const h of m.highlights) {
      if (h.t === 'activity_completed' && !seenA.has(h.d.activity)) { seenA.add(h.d.activity); firsts.push({ what: 'activity', activity: h.d.activity, at: h.at }); }
      if (h.t === 'discovery_found') for (const id of h.d.ids || []) if (!seenD.has(id) && info(id)) { seenD.add(id); }
      if (h.t === 'visit_started' && h.d.first) firsts.push({ what: 'visit', device: h.d.device || h.device, at: h.at });
    }
    const favourites = Object.entries(life).map(([a, x]) => [a, x.ok + x.fail]).filter(([a]) => a !== 'watching').sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, n]) => ({ activity: a, times: n }));
    const important = m.highlights.filter((h) => h.t === 'discovery_found' && (h.d.ids || []).some((id) => info(id) && (info(id).commonness === 'uncommon' || h.d.source === 'expedition')))
      .map((h) => ({ id: h.d.ids[0], at: h.at })).slice(-12);
    const since = Math.min(...m.visits.map((v) => v.at || Infinity), ...m.highlights.map((h) => h.at || Infinity));
    return { v: 1, lifetime: life, favourites, firsts: firsts.slice(0, 40), expeditions, rest: { nests, slept_s: slept, longest_s: longest },
      devices, important, since: Number.isFinite(since) ? since : null, discoveries: seenD.size };
  }

  // ------------------------------------------------------------------ the return home: what is worth showing
  function homecoming(tree, tid) {
    const d = ((tree && tree.dv) || {})[tid];
    if (!d || !d.h) return null;
    const hs = Object.values(d.h).map((r) => ({ t: r.t, at: r.at, d: parse(r.d, {}) })).filter((h) => h.t === 'discovery_found' && (h.d.ids || []).some(info));
    if (!hs.length) return null;
    const score = (h) => (h.d.source === 'expedition' ? 3 : 0) + ((h.d.ids || []).some((id) => info(id) && info(id).commonness === 'uncommon') ? 2 : 0) + h.at / 1e14;
    hs.sort((a, b) => score(b) - score(a));
    const best = hs[0];
    return { id: best.d.ids[0], info: info(best.d.ids[0]), vs: best.d.vs || 0, more: hs.length - 1, count: hs.length };
  }

  root.EyesChronicle = { model, entries, collection, memory, homecoming, tone, hash, duration, summaryBits, info };
  if (typeof module === 'object' && module.exports) module.exports = root.EyesChronicle;
})(typeof window !== 'undefined' ? window : globalThis);
