/* EYES 4.0 · the Eye Dex: every eye you've met.
   Friends you link with are added by themselves; anyone can also swap Eye.D. cards (a code or a QR)
   to add their eye without linking. Each entry is the real eye, grown from its profile.
   The checklist counts which genes you've seen across your Dex (your own eye included):
   pupil shapes, iris patterns, colours, rare traits, rarities.
   Card code:  EYE1.<base64url of a compact profile>   ·   card link:  <site>#card=EYE1.…
   Stored as eyes.dex.v1 { entries: { <seed>: { p, met, how, from, seen } } } */
'use strict';
(function (root) {
  const KEY = 'eyes.dex.v1';
  const b64u = (str) => { const b = new TextEncoder().encode(str); let s = ''; b.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (str) => { let s = str.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); };
  const CARD_RE = /EYE1\.[A-Za-z0-9_-]{8,900}/;
  let st = { entries: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.entries) st = s; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const listeners = [];
  const changed = (e) => listeners.forEach((f) => { try { f(e); } catch (err) {} });
  const D = () => root.HavenDNA;

  // ---------- cards ----------
  function cardFor(p) {
    if (!p) return '';
    const l = p.lean || {};
    const c = { s: p.seed >>> 0, n: p.name || '', g: p.stage || 0 };
    if (p.branch) c.b = p.branch;
    if (p.mutations && p.mutations.length) c.m = p.mutations;
    if (p.born) c.d = Math.floor(p.born / 86400000);
    if (l.glint || l.hold || l.night) c.l = [l.glint || '', l.hold || '', l.night ? 1 : 0];
    return 'EYE1.' + b64u(JSON.stringify(c));
  }
  function readCard(text) {
    const m = String(text || '').match(CARD_RE); if (!m) return null;
    try {
      const c = JSON.parse(unb64u(m[0].slice(5)));
      const p = { v: 1, seed: c.s, name: c.n, stage: c.g, branch: c.b || null, mutations: c.m || [], born: c.d ? c.d * 86400000 + 43200000 : null,
        lean: c.l ? { glint: c.l[0] || null, hold: c.l[1] || null, night: !!c.l[2] } : null };
      return D().cleanProfile(p);
    } catch (e) { return null; }
  }
  function myCard() { return D() && D().has() ? cardFor(D().profile()) : ''; }
  function site() {
    const cfg = (root.EYES_CONFIG && root.EYES_CONFIG.site) || localStorage.getItem('eyes.site') || (root.EYES_WEB ? location.origin + location.pathname : '');
    return String(cfg || '').replace(/[#?].*$/, '');
  }
  const cardLink = (card) => (site() ? site() + '#card=' + card : card);

  // ---------- entries ----------
  function add(profile, how, from) {
    const p = D() && D().cleanProfile(profile); if (!p) return null;
    const mine = D().has() && D().profile().seed === p.seed;
    if (mine) return null;
    const k = String(p.seed), old = st.entries[k];
    st.entries[k] = { p, met: old ? old.met : Date.now(), how: old && old.how === 'linked' ? 'linked' : how, from: from || (old && old.from) || '', seen: Date.now() };
    save(); changed({ added: !old, seed: p.seed });
    return st.entries[k];
  }
  function list() {
    return Object.values(st.entries).sort((a, b) => b.met - a.met).map((e) => ({ ...e, dna: D().friendDNA(e.p) })).filter((e) => e.dna);
  }
  function remove(seed) { delete st.entries[String(seed)]; save(); changed({ removed: seed }); }

  // ---------- the checklist ----------
  function checklist() {
    const G = D().GENES, eyes = list().map((e) => e.dna), mine = D().has() ? D().dna() : null;
    if (mine) eyes.push(mine);
    const seen = { pupil: new Set(), pattern: new Set(), pal: new Set(), rare: new Set(), tier: new Set() };
    for (const d of eyes) {
      seen.pupil.add(d.pupil.id); seen.pattern.add(d.pattern.id); seen.pal.add(d.pal.id); seen.tier.add(d.tier);
      (d.rare || []).forEach((t) => seen.rare.add(t.id));
      Object.keys(d.has || {}).forEach((id) => { if (G.RARE_TRAITS.some((t) => t.id === id)) seen.rare.add(id); });
    }
    const group = (title, items, set, name) => ({ title, items: items.map((x) => ({ id: x.id, name: name(x), seen: set.has(x.id), rarity: x.rarity || 0 })) });
    const tiers = ['common', 'uncommon', 'rare', 'mythic'].map((id) => ({ id, rarity: ['common', 'uncommon', 'rare', 'mythic'].indexOf(id) }));
    const groups = [
      group('Pupils', G.PUPILS, seen.pupil, (x) => x.name),
      group('Patterns', G.PATTERNS, seen.pattern, (x) => x.name),
      group('Colours', G.PALETTES, seen.pal, (x) => x.id),
      group('Rare traits', G.RARE_TRAITS, seen.rare, (x) => x.name),
      group('Rarity', tiers, new Set([...seen.tier].map((t) => String(t).toLowerCase())), (x) => x.id[0].toUpperCase() + x.id.slice(1))
    ];
    const total = groups.reduce((n, g) => n + g.items.length, 0), got = groups.reduce((n, g) => n + g.items.filter((i) => i.seen).length, 0);
    return { groups, total, got, eyes: eyes.length };
  }

  // friends you link with join the Dex by themselves
  if (root.EyesFriends) EyesFriends.on('profile', (f) => add(f.profile, 'linked', f.nick || ''));
  addEventListener('haven:friend', () => { const p = root.HavenFriend && HavenFriend.profile && HavenFriend.profile(); if (p) add(p, 'linked'); });

  root.EyesDex = { cardFor, readCard, myCard, cardLink, site, add, list, remove, checklist, has: (seed) => !!st.entries[String(seed)], count: () => Object.keys(st.entries).length, on: (f) => listeners.push(f) };
})(window);
