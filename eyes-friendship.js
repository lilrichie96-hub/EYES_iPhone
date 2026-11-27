/* EYES 5.0 · Friendship history ("Shared history" in a friend's Meeting Space drawer).
   Connected Eyes remember a little of what they've done together: when they first met, battles finished
   together, Hangouts shared, the last time they did something together, and whether they have exchanged homes.

   What it is (and isn't):
     - local only (localStorage 'eyes.friendship.v1'); no Firebase paths, no new messages, nothing sent anywhere
     - keyed by the two creatures' permanent ids (ey-<seed hex8>-<born base36>, the same id Eye Exchange uses),
       never by nicknames: renaming changes nothing, and after an exchange the two Eyes still know each other
       (the pair is unordered)
     - honest about the past: it starts remembering with this version. A friendship that began earlier shows
       "before this update" instead of a made-up date, and counts say since when they were kept.
     - no rankings, streaks, rewards, reminders or notifications
   Fed by events that already exist: a finished duel (EyesDuel 'end' with a real result), a Hangout that really
   happened (EyesHangout 'end', live for 30 s or more), signals traded (EyesFriends count) and a completed exchange
   (EyesExchange 'phase' → done). Bounded: at most 300 pairs, oldest-touched forgotten first. */
'use strict';
(function (root) {
  const KEY = 'eyes.friendship.v1', MAX_PAIRS = 300;
  const now = () => Date.now();
  let S = null;
  function load() {
    if (S) return S;
    try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
    if (!S || typeof S !== 'object' || S.v !== 1 || typeof S.pairs !== 'object' || !S.pairs) S = { v: 1, since: now(), pairs: {} };
    if (!Number.isFinite(S.since)) S.since = now();
    return S;
  }
  function save() {
    const s = load(), keys = Object.keys(s.pairs);
    if (keys.length > MAX_PAIRS) keys.sort((a, b) => (s.pairs[a].touched || 0) - (s.pairs[b].touched || 0)).slice(0, keys.length - MAX_PAIRS).forEach((k) => delete s.pairs[k]);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  const cidOf = (seed, born) => 'ey-' + (Number(seed) >>> 0).toString(16).padStart(8, '0') + '-' + Math.max(0, Math.floor(Number(born) || 0)).toString(36);
  function myCid() {
    try { const p = root.HavenDNA && HavenDNA.profile(); if (p && Number.isFinite(Number(p.seed))) return cidOf(p.seed, p.born); } catch (e) {}
    return null;
  }
  function profileOf(f) {
    try {
      if (!f) return null;
      if (f === 'native' || f.native) { const n = root.EyesFriends && EyesFriends.native && EyesFriends.native(); return n ? n.profile || null : null; }
      return f.profile || null;
    } catch (e) { return null; }
  }
  function theirCid(f) {
    const p = profileOf(f);
    if (!p || !Number.isFinite(Number(p.seed))) return null;
    return cidOf(p.seed, p.born);
  }
  const linkStart = (f) => { try { if (!f || f === 'native' || f.native) return 0; return f.pairedAt || f.addedAt || 0; } catch (e) { return 0; } };
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  function pair(a, b, start) {
    const s = load(), k = pairKey(a, b);
    let r = s.pairs[k];
    if (!r) {
      // first met: known only for friendships that began while this version was keeping track
      const known = start && start >= s.since;
      r = s.pairs[k] = { first: known ? start : 0, firstKnown: !!known, kept: now(), battles: 0, hangouts: 0, signals: 0, last: 0, lastKind: '', exchanged: 0, touched: now() };
    }
    return r;
  }
  function note(f, kind) {
    const a = myCid(), b = theirCid(f);
    if (!a || !b || a === b) return false;
    const r = pair(a, b, linkStart(f));
    if (kind === 'battle') r.battles++;
    else if (kind === 'hangout') r.hangouts++;
    else if (kind === 'signal') r.signals++;
    r.last = now(); r.lastKind = kind; r.touched = now();
    save();
    return true;
  }
  function exchanged(cidA, cidB) {
    if (!cidA || !cidB || cidA === cidB) return false;
    const r = pair(cidA, cidB, 0);
    r.exchanged = now(); r.last = now(); r.lastKind = 'exchange'; r.touched = now();
    save();
    return true;
  }
  function view(f) {
    const a = myCid(), b = theirCid(f), s = load();
    if (!a || !b) return { known: false };
    const r = s.pairs[pairKey(a, b)] || null, start = linkStart(f);
    return {
      known: true, pair: pairKey(a, b), tracking: r ? r.kept : s.since,
      first: r && r.firstKnown ? r.first : start && start >= s.since ? start : 0,
      before: !(r && r.firstKnown) && !(start && start >= s.since),   // the friendship is older than this record
      battles: r ? r.battles : 0, hangouts: r ? r.hangouts : 0, last: r ? r.last : 0, lastKind: r ? r.lastKind : '', exchanged: r ? r.exchanged : 0
    };
  }
  // ---------- the drawer section ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  function ago(t) {
    const m = Math.round((now() - t) / 60000);
    if (m < 2) return 'just now';
    if (m < 60) return m + ' minutes ago';
    const h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    const d = Math.round(h / 24); if (d < 14) return d + (d === 1 ? ' day ago' : ' days ago');
    return day(t);
  }
  const KIND = { battle: 'a battle', hangout: 'a Hangout', signal: 'signals', exchange: 'an exchange' };
  function rows(v) {
    const since = day(v.tracking);
    const count = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : v.before ? 'none' : 'none yet') + (v.before ? ` since ${since}` : '');
    return [
      ['First met', v.first ? day(v.first) : 'before this update'],
      ['Battles together', count(v.battles, 'battle', 'battles')],
      ['Hangouts shared', count(v.hangouts, 'Hangout', 'Hangouts')],
      ['Last together', v.last ? `${ago(v.last)} · ${KIND[v.lastKind] || 'together'}` : v.before ? `not since ${since}` : 'not yet'],
      ['Exchanged homes', v.exchanged ? 'yes · ' + day(v.exchanged) : v.before ? `not since ${since}` : 'no']
    ];
  }
  function renderInto(box, f) {
    try {
      const v = view(f);
      const d = document.createElement('details');
      d.className = 'ec-history';
      if (!v.known) {
        d.innerHTML = '<summary>Shared history</summary><p class="ec-sub">Their Eye hasn’t introduced itself yet, so there’s nothing to remember by.</p>';
      } else {
        d.innerHTML = '<summary>Shared history</summary><dl class="ec-facts">' + rows(v).map(([k, x]) => `<dt>${esc(k)}</dt><dd>${esc(x)}</dd>`).join('') + '</dl>' +
          (v.before ? `<p class="ec-sub">These two Eyes knew each other before this version of EYES. It began remembering on ${esc(day(v.tracking))}; earlier moments weren’t recorded.</p>` : '');
      }
      box.appendChild(d);
      return d;
    } catch (e) { return null; }
  }
  // ---------- listening to what already happens ----------
  let hooked = { duel: false, hangout: false, exchange: false };
  function hook() {
    try {
      if (!hooked.duel && root.EyesDuel && EyesDuel.on) { hooked.duel = true; EyesDuel.on('end', (e) => { if (e && ['win', 'loss', 'draw'].includes(e.result)) note(e.friend, 'battle'); }); }
      if (!hooked.hangout && root.EyesHangout && EyesHangout.on) {
        hooked.hangout = true;
        EyesHangout.on('end', (e) => { if (e && e.was === 'live' && (e.seconds || 0) >= 30 && !['failed', 'limited', 'declined', 'busy', 'still', 'timeout', 'faded'].includes(e.result)) note(e.friend, 'hangout'); });
      }
      if (!hooked.exchange && root.EyesExchange && EyesExchange.on) { hooked.exchange = true; EyesExchange.on('phase', (p, t) => { if (p === 'done' && t && t.out && t.inn) exchanged(t.out, t.inn); }); }
    } catch (e) {}
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', hook, { once: true }); else setTimeout(hook, 0);
  addEventListener('load', hook, { once: true });

  root.EyesFriendship = { note, exchanged, view, renderInto, cidOf, myCid, _state: () => load(), _reset: () => { S = null; } };
})(typeof window === 'undefined' ? globalThis : window);
