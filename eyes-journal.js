/* EYES 5.3 · His journal: a scrapbook of his life, drawn in his own light.

     Lately      what happened recently, by day (discoveries, firsts, funny failures, naps, visits)
     Keepsakes   firsts and special moments, however long ago
     Collection  everything he has met, found or made, by category (only what exists; no empty slots to fill)
     About him   who he is (DNA: never changes) and what he has lived (derived from experiences)

   Three hosts, one file:
     Android launcher / iPhone web app  an ability on the satellite wheel ("Journal"), and EyesJournal.open()
                                        from the return chip; data from eyes-experience.js (cloud + cache)
     companion desktop viewer           EyesJournalDesktop.show(data) in web/journal.html (local chronicle)
   Everything shown comes from eyes-chronicle.js (deterministic; never invents). Keepsake art: eyes-keepsake-art.js.
   Cost: the art canvases shimmer at ~12 fps only while visible and only with motion on; nothing runs closed. */
'use strict';
(function (root) {
  const DAY = 86400000;
  const BOOK = 'M3.5 5.2c2.6-.9 5.6-.7 8.5 1v13.6c-2.9-1.7-5.9-1.9-8.5-1zM20.5 5.2c-2.6-.9-5.6-.7-8.5 1v13.6c2.9-1.7 5.9-1.9 8.5-1zM15 9.4c1.3-.4 2.6-.4 3.6 0M15 12.4c1.3-.4 2.6-.4 3.6 0';
  const TABS = [['lately', 'Lately'], ['keepsakes', 'Keepsakes'], ['collection', 'Collection'], ['him', 'About him']];
  const ACT_LABEL = (a) => (((root.EYES_CATALOG || {}).activities || {})[a] || { label: a }).label;
  const S = { el: null, api: null, tab: 'lately', mode: 'phone', data: null, shown: 40, arts: [], raf: 0, io: null, lastT: 0, state: 'IDLE', focusBack: null, still: false };

  // ---------------------------------------------------------------- helpers
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sameYear = (t) => new Date(t).getFullYear() === new Date().getFullYear();
  const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, sameYear(t) ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  function dayLabel(t) {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const d = new Date(t); d.setHours(0, 0, 0, 0);
    const n = Math.round((d0 - d) / DAY);
    return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 7 ? d.toLocaleDateString(undefined, { weekday: 'long' }) : fmtDate(t);
  }
  const C = () => root.EyesChronicle;
  const ART = () => root.EyesKeepsakeArt;

  // who he is, from whatever the host has: the phone's own DNA, or the profile the desktop was given
  function creature() {
    const D = root.HavenDNA, R = root.HavenRender;
    let dna = null, born = null;
    if (S.mode === 'desktop' && S.data && S.data.look && S.data.look.profile && D && D.friendDNA) {
      try { dna = D.friendDNA(S.data.look.profile); born = JSON.parse(S.data.look.profile).born || null; } catch (e) { dna = null; }
    } else if (D && D.dna) { dna = D.dna(); const s = D.summary && D.summary(); born = s ? s.born : null; }
    let color = null;
    try { if (dna && R && R.ownColor) color = R.ownColor(dna); } catch (e) { color = null; }
    color = color || ((m, a) => `rgba(${Math.round(150 * Math.min(1, m || 1))},${Math.round(225 * Math.min(1, m || 1))},${Math.round(228 * Math.min(1, m || 1))},${a == null ? 1 : a})`);
    return { dna, name: (dna && dna.name) || 'Your Eye', born, T: dna ? dna.T : null, words: dna && dna.words ? dna.words : [], color };
  }

  // ---------------------------------------------------------------- the art canvases (lazy, visible only)
  function art(kind, id, vs, size) {
    const c = el('canvas', 'ej-art');
    c.setAttribute('aria-hidden', 'true');
    c._art = { kind, id, vs: vs || 0, size };
    S.arts.push(c);
    if (S.io) S.io.observe(c); else c._vis = true;
    return c;
  }
  function paintArt(c, t, who) {
    const a = c._art, dpr = Math.min(2, root.devicePixelRatio || 1);
    const w = c.clientWidth || a.size || 52, h = c.clientHeight || a.size || 52;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const r = Math.min(w, h) * 0.34;
    if (a.kind === 'id' && ART()) ART().paint(ctx, a.id, { x: w / 2, y: h / 2, r, color: who.color, vs: a.vs, t, still: S.still });
    else if (ART()) ART().glyph(ctx, a.id, { x: w / 2, y: h / 2, r: r * 0.85, color: who.color, t });
  }
  function loop(ts) {
    S.raf = 0;
    if (!S.el) return;
    const t = ts / 1000;
    let any = false;
    if (!S.lastT || ts - S.lastT > 80) {
      S.lastT = ts;
      const who = S.who;
      for (const c of S.arts) if (c._vis && c.isConnected) { paintArt(c, t, who); any = true; }
    } else any = S.arts.some((c) => c._vis && c.isConnected);
    // only while something with a shimmer is actually on screen (nothing visible: no frames at all)
    if (any && !S.still && !document.hidden) S.raf = requestAnimationFrame(loop);
  }
  function kick() {
    if (!S.el) return;
    if (S.still) { const who = S.who; for (const c of S.arts) if (c.isConnected) paintArt(c, 0, who); return; }
    if (!S.raf) S.raf = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- DOM
  function build() {
    if (S.el) return S.el;
    const w = el('div');
    w.id = 'eyesJournal';
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-modal', 'true');
    w.setAttribute('aria-labelledby', 'ejTitle');
    w.innerHTML = `
      <div class="ej-shade"></div>
      <div class="ej-sheet" tabindex="-1">
        <div class="ej-head" role="banner"><div><p class="ej-eyebrow">His journal</p><h2 class="ej-title" id="ejTitle"></h2><p class="ej-sub"></p></div>
          <button type="button" class="ej-close" aria-label="Close the journal"><span aria-hidden="true">×</span></button></div>
        <div class="ej-tabs" role="tablist" aria-label="Journal sections"></div>
        <p class="ej-status" role="status" aria-live="polite"></p>
        <div class="ej-body" role="tabpanel" tabindex="0"></div>
      </div>
      <div class="ej-detail" hidden></div>`;
    const tabs = w.querySelector('.ej-tabs');
    for (const [id, label] of TABS) {
      const b = el('button', 'ej-tab', label);
      b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = id; b.id = 'ejTab-' + id;
      b.addEventListener('click', (e) => { e.stopPropagation(); select(id); });
      tabs.append(b);
    }
    tabs.addEventListener('keydown', (e) => {
      const ids = TABS.map((x) => x[0]), i = ids.indexOf(S.tab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]; select(n); w.querySelector('#ejTab-' + n).focus(); }
    });
    w.querySelector('.ej-close').addEventListener('click', (e) => { e.stopPropagation(); close('button'); });
    w.querySelector('.ej-shade').addEventListener('click', (e) => { e.stopPropagation(); close('outside'); });
    w.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); if (!w.querySelector('.ej-detail').hidden) hideDetail(); else close('escape'); } });
    // the launcher listens for touches on the document; the journal keeps its touches to itself
    for (const ty of ['pointerdown', 'pointerup', 'click', 'touchstart']) w.addEventListener(ty, (e) => e.stopPropagation(), { passive: true });
    document.body.appendChild(w);
    S.el = w;
    if ('IntersectionObserver' in root) S.io = new IntersectionObserver((es) => { for (const x of es) x.target._vis = x.isIntersecting; kick(); }, { root: w.querySelector('.ej-body') });
    requestAnimationFrame(() => w.classList.add('ej-in'));
    return w;
  }
  function select(tab) {
    S.tab = tab;
    S.shown = 40;
    render();
    const b = S.el && S.el.querySelector('.ej-body');
    if (b) b.scrollTop = 0;
  }
  function status(text) { const s = S.el && S.el.querySelector('.ej-status'); if (s) s.textContent = text || ''; }

  // ---------------------------------------------------------------- rendering
  function model() {
    const tree = (S.data && S.data.tree) || {};
    const m = C().model(tree, { devices: (S.data && S.data.devices) || {} });
    return m;
  }
  function render() {
    if (!S.el || !C()) return;
    S.who = creature();
    const who = S.who, m = model();
    const ents = C().entries(m, { temperament: who.T, liveTid: S.data && S.data.liveTid });
    S.el.style.setProperty('--ej-tint', who.color(1, 1));
    S.el.style.setProperty('--ej-tint-soft', who.color(0.9, 0.14));
    S.el.querySelector('#ejTitle').textContent = who.name;
    const mem = C().memory(m);
    const devs = Object.keys(mem.devices).length;
    S.el.querySelector('.ej-sub').textContent = mem.since ? 'Remembering since ' + fmtDate(mem.since) + (devs ? ' · ' + devs + (devs === 1 ? ' computer' : ' computers') + ' visited' : '') : (who.born ? 'Born ' + fmtDate(who.born) : '');
    for (const b of S.el.querySelectorAll('.ej-tab')) { const on = b.dataset.tab === S.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
    const body = S.el.querySelector('.ej-body');
    body.setAttribute('aria-labelledby', 'ejTab-' + S.tab);
    for (const c of S.arts) if (S.io) S.io.unobserve(c);
    S.arts = [];
    body.replaceChildren();
    if (S.tab === 'lately') renderLately(body, ents, who);
    else if (S.tab === 'keepsakes') renderKeepsakes(body, ents, who);
    else if (S.tab === 'collection') renderCollection(body, C().collection(m), who);
    else renderHim(body, mem, who, m);
    kick();
  }
  function emptyState(body, text, who) {
    const d = el('div', 'ej-empty');
    const c = art('glyph', 'play', 0, 96);
    d.append(c, el('p', '', text));
    body.append(d);
  }
  function entryArt(e) {
    if (e.arts && e.arts.length) return art('id', e.arts[0], e.vs, 52);
    return art('glyph', e.kind === 'visit' ? 'visit' : e.kind === 'rest' ? 'rest' : e.kind === 'failed' ? 'failed' : 'play', 0, 52);
  }
  function entryRow(e, withDate) {
    const li = el('li', 'ej-entry' + (e.keepsake ? ' ej-keep' : '') + (e.summary ? ' ej-quiet' : ''));
    const tx = el('div', 'ej-text');
    tx.append(el('p', 'ej-line', e.text), el('p', 'ej-meta', (withDate ? fmtDate(e.at) + ', ' : '') + fmtTime(e.at) + (e.device ? ' · ' + e.device : '')));
    li.append(entryArt(e), tx);
    return li;
  }
  function renderLately(body, ents, who) {
    const E = (root.EYES_CATALOG || {}).empty || {};
    if (!ents.length) return emptyState(body, who.born && Date.now() - who.born < 3 * DAY ? E.newborn : E.older, who);
    let day = null, ul = null;
    for (const e of ents.slice(0, S.shown)) {
      const label = dayLabel(e.at);
      if (label !== day) { day = label; body.append(el('h3', 'ej-day', label)); ul = el('ul', 'ej-list'); body.append(ul); }
      ul.append(entryRow(e, false));
    }
    if (ents.length > S.shown) {
      const more = el('button', 'ej-more', 'Show earlier memories');
      more.type = 'button';
      more.addEventListener('click', (ev) => { ev.stopPropagation(); S.shown += 60; const top = body.scrollTop; render(); body.scrollTop = top; });
      body.append(more);
    }
  }
  function renderKeepsakes(body, ents, who) {
    const keep = ents.filter((e) => e.keepsake);
    if (!keep.length) return emptyState(body, ((root.EYES_CATALOG || {}).empty || {}).keepsakes, who);
    const grid = el('div', 'ej-cards');
    for (const e of keep.slice(0, S.shown)) {
      const card = el('div', 'ej-card');
      card.append(e.arts && e.arts.length ? art('id', e.arts[0], e.vs, 84) : art('glyph', e.kind === 'visit' ? 'visit' : e.kind === 'rest' ? 'rest' : e.kind === 'failed' ? 'failed' : 'play', 0, 84),
        el('p', 'ej-line', e.text), el('p', 'ej-meta', fmtDate(e.at) + (e.device ? ' · ' + e.device : '')));
      grid.append(card);
    }
    body.append(grid);
    if (keep.length > S.shown) {
      const more = el('button', 'ej-more', 'Show older keepsakes');
      more.type = 'button';
      more.addEventListener('click', (ev) => { ev.stopPropagation(); S.shown += 40; render(); });
      body.append(more);
    }
  }
  function countLine(it) {
    const n = it.count, nat = it.info.nature;
    if (nat === 'encountered') return n === 1 ? 'Met once' : 'Met ' + n + ' times';
    if (nat === 'made') return n === 1 ? 'Made once' : 'Made ' + n + ' times';
    return n === 1 ? 'Found once' : 'Found ' + n + ' times';
  }
  function renderCollection(body, col, who) {
    if (!col.total) return emptyState(body, ((root.EYES_CATALOG || {}).empty || {}).collection, who);
    for (const cat of col.categories) {
      if (!cat.items.length) continue;
      const sec = el('div', 'ej-sec');
      sec.append(el('h3', '', cat.label), el('p', 'ej-blurb', cat.blurb));
      const grid = el('div', 'ej-grid');
      for (const it of cat.items) {
        const b = el('button', 'ej-tile');
        b.type = 'button';
        b.setAttribute('aria-label', it.info.name + '. ' + countLine(it) + '. First ' + fmtDate(it.first));
        b.append(art('id', it.id, it.vs, 64), el('span', 'ej-tile-name', it.info.name), el('span', 'ej-tile-count', it.count > 1 ? '×' + it.count : ''));
        b.addEventListener('click', (e) => { e.stopPropagation(); showDetail(it); });
        grid.append(b);
      }
      sec.append(grid);
      body.append(sec);
    }
    body.append(el('p', 'ej-hint', col.total < col.known ? 'There is more out there. He finds things in his own time.' : 'He has found something of every kind known so far.'));
  }
  function showDetail(it) {
    const d = S.el.querySelector('.ej-detail');
    d.replaceChildren();
    d.hidden = false;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', it.info.name);
    const card = el('div', 'ej-detail-card');
    const facts = el('ul', 'ej-facts');
    const verb = it.info.nature === 'encountered' ? 'First met' : it.info.nature === 'made' ? 'First made' : 'First found';
    facts.append(el('li', '', (it.firstApprox ? verb + ' around ' : verb + ' ') + fmtDate(it.first) + (it.where ? ' on ' + it.where : '')));
    facts.append(el('li', '', countLine(it) + (it.info.nature === 'encountered' ? ', and released every time' : '')));
    if (it.info.commonness === 'uncommon') facts.append(el('li', '', 'Not often seen'));
    const ok = el('button', '', 'Close');
    ok.type = 'button';
    ok.addEventListener('click', (e) => { e.stopPropagation(); hideDetail(); });
    const big = art('id', it.id, it.vs, 150);
    if (S.io) S.io.unobserve(big);
    big._vis = true;                                  // the detail sits outside the scrolling list: always drawn
    card.append(big, el('h3', '', it.info.name), el('p', '', it.info.note || ''), facts, ok);
    d.append(card);
    d.onclick = (e) => { if (e.target === d) hideDetail(); };
    kick();
    ok.focus({ preventScroll: true });
  }
  function hideDetail() {
    const d = S.el && S.el.querySelector('.ej-detail');
    if (d) { d.hidden = true; d.replaceChildren(); }
    S.arts = S.arts.filter((c) => c.isConnected);
  }
  function li(a, b) { const x = el('li'); x.append(el('span', '', a), el('span', '', b)); return x; }
  function renderHim(body, mem, who, m) {
    const sec1 = el('div', 'ej-sec');
    sec1.append(el('h3', '', 'Who he is'));
    const l1 = el('ul', 'ej-facts-list');
    if (who.words && who.words.length) l1.append(li('Temperament', who.words.join(' and ')));
    if (who.born) l1.append(li('Born', fmtDate(who.born)));
    sec1.append(l1, el('p', 'ej-small', 'This is his nature, written in his DNA. Nothing he lives through changes it.'));
    body.append(sec1);
    const acts = Object.entries(mem.lifetime).filter(([a]) => a !== 'watching');
    const sec2 = el('div', 'ej-sec');
    sec2.append(el('h3', '', 'What he has lived'));
    if (!acts.length && !mem.expeditions) sec2.append(el('p', 'ej-blurb', 'Nothing yet. Every computer he visits adds a little.'));
    else {
      const l2 = el('ul', 'ej-facts-list');
      if (mem.favourites.length) l2.append(li('Loves', mem.favourites.map((f) => ACT_LABEL(f.activity).toLowerCase()).join(', ')));
      for (const [a, x] of acts.sort((p, q) => (q[1].ok + q[1].fail) - (p[1].ok + p[1].fail))) {
        const total = x.ok + x.fail;
        let note = total + (total === 1 ? ' time' : ' times');
        if (x.fail) note += a === 'fishing' ? ' · ' + x.fail + ' got away' : a === 'building' ? ' · ' + x.fail + ' fell over' : a === 'expedition' ? ' · stayed out of ' + x.fail : ' · ' + x.fail + ' didn’t work out';
        l2.append(li(ACT_LABEL(a), note));
      }
      if (mem.rest.nests) l2.append(li('Naps in a nest', mem.rest.nests + (mem.rest.longest_s >= 120 ? ' · longest ' + C().duration(mem.rest.longest_s * 1000) : '')));
      if (mem.discoveries) l2.append(li('Kinds of things discovered', String(mem.discoveries)));
      sec2.append(l2);
    }
    body.append(sec2);
    const devs = Object.values(mem.devices);
    if (devs.length) {
      const sec3 = el('div', 'ej-sec');
      sec3.append(el('h3', '', 'Places he has been'));
      const l3 = el('ul', 'ej-facts-list');
      for (const d of devs.sort((a, b) => a.first - b.first)) l3.append(li(d.name, 'since ' + fmtDate(d.first) + ' · ' + d.visits + (d.visits === 1 ? ' visit' : ' visits') + (d.time > 60000 ? ' · ' + C().duration(d.time) : '')));
      sec3.append(l3, el('p', 'ej-small', 'Each computer also remembers its own favourite spots for him. That stays on the computer.'));
      body.append(sec3);
    }
    const firsts = mem.firsts.filter((f) => f.what === 'activity');
    if (firsts.length) {
      const sec4 = el('div', 'ej-sec');
      sec4.append(el('h3', '', 'Firsts'));
      const l4 = el('ul', 'ej-facts-list');
      for (const f of firsts.slice(0, 12)) l4.append(li(ACT_LABEL(f.activity), fmtDate(f.at)));
      sec4.append(l4);
      body.append(sec4);
    }
  }

  // ---------------------------------------------------------------- open / close
  async function refresh(force) {
    if (S.mode !== 'phone' || !root.EyesExperience) return;
    try {
      const had = S.data && S.data.tree;
      if (!had) status('');
      const tree = await EyesExperience.load({ force });
      if (!S.el) return;
      S.data = Object.assign({}, S.data, { tree });
      status('');
      render();
    } catch (e) {
      if (!S.el) return;
      status(e.code === 'offline' ? 'Offline. Showing what this phone remembers.' : e.code === 'nofirebase' ? '' : 'Couldn’t check for new memories just now.');
    }
  }
  function openUI(opts) {
    opts = opts || {};
    S.still = !!opts.still;
    build();
    S.el.classList.toggle('ej-still', S.still);
    S.el.classList.toggle('ej-desktop', S.mode === 'desktop');
    S.tab = opts.tab || S.tab || 'lately';
    if (S.mode === 'phone') {
      const devs = (root.EyesRoam && EyesRoam.cached().devices) || {};
      const names = {}; for (const [k, v] of Object.entries(devs)) names[k] = v.name;
      S.data = { tree: root.EyesExperience ? EyesExperience.cached() : {}, devices: names };
    }
    render();
    if (S.mode === 'phone') { refresh(false); try { EyesExperience.markSeen(); } catch (e) {} }
    S.focusBack = document.activeElement;
    const sheet = S.el.querySelector('.ej-sheet');
    if (sheet && S.mode === 'phone') sheet.focus({ preventScroll: true });        // screen readers land in the journal
  }
  function teardown() {
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
    if (S.io) S.io.disconnect();
    S.io = null;
    S.arts = [];
    if (S.el) S.el.remove();
    S.el = null;
    S.state = 'IDLE';
    try { if (S.focusBack && S.focusBack.focus) S.focusBack.focus({ preventScroll: true }); } catch (e) {}
  }
  function close(reason) {
    if (!S.el || S.state === 'JOURNAL_CLOSING') return false;
    const api = S.api;
    if (api && !api.go('JOURNAL_CLOSING', reason)) { teardown(); return false; }
    S.state = 'JOURNAL_CLOSING';
    S.el.classList.remove('ej-in');
    setTimeout(() => { teardown(); if (api) api.done(reason || 'closed'); S.api = null; }, S.still ? 0 : 280);
    return true;
  }

  // ---------------------------------------------------------------- the ability (phone)
  function activate(api, opts) {
    S.api = api;
    S.mode = 'phone';
    S.state = 'JOURNAL_OPEN';
    let still = false;
    try { const h = api.host ? api.host() : null; still = h ? !h.motion() : false; } catch (e) {}
    openUI({ tab: (opts && opts.tab) || S.nextTab || 'lately', still });
    S.nextTab = null;
  }
  function available() { return !!(root.HavenDNA && HavenDNA.has && HavenDNA.has() && root.EyesChronicle && root.EYES_CATALOG); }
  const register = () => root.EyesAbility && EyesAbility.register({
    id: 'journal', label: 'Journal', icon: BOOK, available,
    entry: 'JOURNAL_OPEN', states: { JOURNAL_OPEN: ['JOURNAL_CLOSING'], JOURNAL_CLOSING: [] },
    activate,
    pose: () => null,                  // the Eye stays exactly as he is; the journal sits in front of him
    fps: () => 0,
    frame() {},
    back: () => (S.el ? (S.el.querySelector('.ej-detail').hidden ? close('back') : (hideDetail(), true)) : false),
    interrupt: (reason) => { if (S.el) close(reason || 'interrupt'); },
    suspend() {}                       // reading can continue after the screen wakes again
  });
  if (root.document && !document.documentElement.dataset.ejDesktop) {
    if (!register()) addEventListener('DOMContentLoaded', register, { once: true });
  }

  // opened while another ability owns the iris (he's away: Slingshot holds the empty socket): the journal
  // simply sits on top, without the ability machine, so reading never waits for him to come home
  function openOverlay(tab) {
    S.api = null;
    S.mode = 'phone';
    S.state = 'JOURNAL_OPEN';
    let still = false;
    try { const h = root.Haven && Haven.abilityHost ? Haven.abilityHost() : null; still = h ? !h.motion() : false; } catch (e) {}
    openUI({ tab: tab || 'lately', still });
    return true;
  }
  root.EyesJournal = {
    open: (tab) => {
      if (S.el) { if (tab) select(tab); return true; }
      S.nextTab = tab || null;
      if (root.EyesAbility && EyesAbility.launch('journal', 'api')) return true;
      S.nextTab = null;
      return available() ? openOverlay(tab) : false;
    },
    close: () => close('api'),
    isOpen: () => !!S.el,
    state: () => S.state,
    diagnostics: () => ({ open: !!S.el, tab: S.tab, mode: S.mode, arts: S.arts.length, looping: !!S.raf, entries: S.el ? S.el.querySelectorAll('.ej-entry, .ej-card, .ej-tile').length : 0 }),
    _select: select
  };
  // ---------------------------------------------------------------- the homecoming (5.3)
  // When he comes home from a computer with something noteworthy, a small glowing keepsake rises out of his
  // pupil, hovers a moment and drifts to the satellite (where his journal lives), and a quiet chip offers the
  // journal. Never more than one object, never a sequence of popups, never in the way: it is an ambient painter
  // (only while nothing owns the iris), the chip ignores everything but a direct tap and fades by itself, and
  // the return itself never waits for it (if the memories are late, they're simply in the journal later).
  const HC = { tid: null, result: null, landedAt: 0, shown: false, anim: null, chip: null, registered: false, timers: new Set(), stats: { expected: 0, shown: 0, late: 0, none: 0 } };
  const hcAfter = (fn, d) => { const t = setTimeout(() => { HC.timers.delete(t); fn(); }, d); HC.timers.add(t); };
  const hcHost = () => (root.Haven && Haven.abilityHost ? Haven.abilityHost() : null);
  const hcRedraw = () => { const h = hcHost(); if (h) { if (!h.motion()) h.draw(); else h.schedule(); } };
  function expect(tid) {
    for (const t of HC.timers) clearTimeout(t);
    HC.timers.clear();
    Object.assign(HC, { tid: tid || null, result: null, landedAt: 0, shown: false, anim: null });
    if (!tid || !root.EyesExperience) return;
    HC.stats.expected++;
    EyesExperience.homecoming(tid).then((r) => {
      if (HC.tid !== tid) return;
      HC.result = r || null;
      if (!r) HC.stats.none++;
      show();
    }).catch(() => {});
  }
  function landed() { HC.landedAt = performance.now(); show(); }
  function show(tries) {
    if (!HC.result || !HC.landedAt || HC.shown) return;
    const age = performance.now() - HC.landedAt;
    if (age > 12000) { HC.stats.late++; return; }                  // too late to feel connected: the journal has it
    const busy = !root.EyesAbility || EyesAbility.owner() || EyesAbility.state() !== 'IDLE' || (hcHost() && hcHost().blocked());
    if (busy) { if ((tries || 0) < 12) hcAfter(() => show((tries || 0) + 1), 1000); return; }
    HC.shown = true;
    HC.stats.shown++;
    const h = hcHost(), motion = h ? h.motion() : true, gentle = h ? h.gentle() : false;
    HC.anim = { at: performance.now(), dur: motion ? (gentle ? 3400 : 2800) : 2200, motion };
    if (!HC.registered && root.EyesAbility) HC.registered = EyesAbility.ambient({ id: 'homecoming', frame: hcFrame, fps: () => (HC.anim && HC.anim.motion ? 30 : 0) });
    try { if (h && h.core && h.core.react) h.core.react('greet-familiar', h.now()); } catch (e) {}
    chip(HC.result);
    hcRedraw();
    if (!motion) hcAfter(() => { HC.anim = null; hcRedraw(); }, 2200);
  }
  function hcFrame(ctx, g) {
    const A = HC.anim;
    if (!A || !HC.result || !root.EyesKeepsakeArt) return;
    const u = Math.min(1, (performance.now() - A.at) / A.dur);
    if (u >= 1) { HC.anim = null; return; }
    const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    const sat = root.EyesAbility && EyesAbility.satellite ? EyesAbility.satellite() : null;
    const top = { x: g.cx, y: g.cy - g.size * 1.5 };
    let x, y, r, a;
    if (!A.motion) { x = top.x; y = top.y; r = g.size * 0.32; a = 1; }
    else if (u < 0.3) { const e = ease(u / 0.3); x = g.cx; y = g.cy + (top.y - g.cy) * e; r = g.size * (0.08 + 0.26 * e); a = Math.min(1, u / 0.12); }
    else if (u < 0.72) { x = top.x + Math.sin((u - 0.3) * 9) * g.size * 0.04; y = top.y + Math.sin((u - 0.3) * 6) * g.size * 0.05; r = g.size * 0.34; a = 1; }
    else {
      const e = ease((u - 0.72) / 0.28), to = sat || { x: g.cx, y: g.cy };
      x = top.x + (to.x - top.x) * e; y = top.y + (to.y - top.y) * e - Math.sin(e * Math.PI) * g.size * 0.3; r = g.size * 0.34 * (1 - 0.8 * e); a = 1 - ease((u - 0.9) / 0.1);
    }
    ctx.save();
    ctx.globalAlpha = a;
    EyesKeepsakeArt.paint(ctx, HC.result.id, { x, y, r, color: g.tint, vs: HC.result.vs, t: performance.now() / 1000, still: !A.motion });
    ctx.restore();
  }
  function chip(res) {
    if (HC.chip) HC.chip.remove();
    const b = el('button', 'ej-chip');
    b.type = 'button';
    const what = res.info ? res.info.a : 'something';
    b.textContent = 'He brought home ' + what + (res.more > 0 ? ', and ' + (res.more === 1 ? 'one more memory' : res.more + ' more memories') : '') + '.';
    b.setAttribute('aria-label', b.textContent + ' Open his journal.');
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); hideChip(); EyesJournal.open('lately'); });
    document.body.appendChild(b);
    HC.chip = b;
    requestAnimationFrame(() => b.classList.add('ej-chip-in'));
    hcAfter(hideChip, 9000);
  }
  function hideChip() {
    const b = HC.chip;
    HC.chip = null;
    if (!b) return;
    b.classList.remove('ej-chip-in');
    setTimeout(() => b.remove(), 400);
  }
  root.EyesHomecoming = { expect, landed, diagnostics: () => ({ tid: HC.tid, result: HC.result ? HC.result.id : null, shown: HC.shown, animating: !!HC.anim, chip: !!HC.chip, stats: Object.assign({}, HC.stats) }), _show: (r) => { HC.result = r; HC.landedAt = performance.now(); HC.shown = false; show(); } };

  // the companion's desktop viewer: no ability host, data straight from the local chronicle
  root.EyesJournalDesktop = {
    show(data) {
      S.mode = 'desktop';
      const tree = { cus: {}, dv: {} };
      let archive = null, live = null;
      for (const ch of (data && data.chronicles) || []) {
        for (const [tid, v] of Object.entries(ch.visits || {})) {
          tree.cus[tid] = v.cus;
          tree.dv[tid] = { h: v.h || {}, sum: { n: 1, c: JSON.stringify(v.sum || {}) } };
        }
        if (ch.archive && ch.archive.visits) archive = ch.archive;
        if (ch.live_tid) live = ch.live_tid;
      }
      if (archive) tree.archive = archive;
      S.data = { tree, devices: {}, look: data && data.look, liveTid: live };
      S.state = 'JOURNAL_OPEN';
      if (!S.el) openUI({ tab: S.tab || 'lately', still: matchMedia('(prefers-reduced-motion: reduce)').matches });
      else render();
      const pend = ((data && data.chronicles) || []).reduce((n, c) => n + (c.pending || 0), 0);
      const str = ((data && data.chronicles) || []).reduce((n, c) => n + (c.stranded || 0), 0);
      status(!(data && data.chronicles && data.chronicles.length) ? 'This is what ' + ((data && data.device) || 'this computer') + ' remembers of him. Nothing yet.'
        : str ? 'Some memories from an earlier visit could not reach his phone and are kept only here.'
        : pend ? pend + (pend === 1 ? ' memory is' : ' memories are') + ' waiting to reach his phone.' : 'What ' + ((data && data.device) || 'this computer') + ' remembers of him. His phone keeps the whole journal.');
      return true;
    }
  };
})(window);
