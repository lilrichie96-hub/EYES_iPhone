/* EYES 4.4.9 · Polish.
   - The drawer pours out of the pupil, and is swallowed back when it closes.
   - Recent apps, and an A–Z scrubber for long app lists.
   - A clock face of its own: thin drawn numerals, the colon is two small lights in the Eye's colour.
   - Remarks: now and then, a quiet line under the Eye, in its own temperament.
   - The ability light is explained once, and beckons until it has been found.
   - The Optic: phone plumbing folded under one heading, long explanations tucked away.
   Everything here is optional decoration over the launcher: if a piece fails, the launcher behaves as 4.4.8. */
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const host = () => root.EyesPolishHost || null;
  const KEY = 'eyes.polish.v1';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const nowMs = () => (host() ? host().now() : performance.now());
  const motionOn = () => {
    const h = host();
    if (h && !h.motion()) return false;
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (e) {}
    return true;
  };
  let store = { v: 1, recent: [], day: '', returns: 0, launches: 0, lastRemark: 0, remarks: true, foundAbilities: false, said: [] };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') store = Object.assign(store, s); } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  function today() {
    const d = new Date().toDateString();
    if (store.day !== d) { store.day = d; store.returns = 0; store.launches = 0; }
  }

  // =====================================================================================================
  // 1 · The drawer pours out of the pupil
  // =====================================================================================================
  let launchedSinceOpen = false, scrubber = null;
  function pupilPoint() {
    const h = host();
    if (h) { const e = h.eyeCentre(); return { x: e.x, y: e.y }; }
    return { x: innerWidth / 2, y: innerHeight * 0.49 };
  }
  function visibleTiles(drawer, max) {
    const out = [], vb = drawer.getBoundingClientRect();
    for (const b of drawer.querySelectorAll('#recentApps .recent-app, #appGrid .app')) {
      const r = b.getBoundingClientRect();
      if (r.width < 4 || r.bottom < Math.max(0, vb.top) || r.top > Math.min(innerHeight, vb.bottom)) continue;
      out.push({ el: b, r });
      if (out.length >= max) break;
    }
    return out;
  }
  function drawerOpened() {
    launchedSinceOpen = false;
    renderRecents();
    syncScrubber();
    const d = $('drawer');
    if (!d || !motionOn() || !d.animate) return;
    const h = host();
    if (h) h.react('pour');
    const p = pupilPoint();
    // wait one frame so the grid has its layout
    requestAnimationFrame(() => {
      const box = d.getBoundingClientRect();
      const ox = p.x - box.left, oy = p.y - box.top;
      d.classList.add('pouring');
      const far = Math.hypot(Math.max(ox, box.width - ox), box.height + Math.abs(oy)) + 40;
      try {
        d.animate(
          [
            { clipPath: `circle(0px at ${ox}px ${oy}px)`, opacity: 0.4 },
            { clipPath: `circle(${far * 0.55}px at ${ox}px ${oy}px)`, opacity: 1, offset: 0.45 },
            { clipPath: `circle(${far}px at ${ox}px ${oy}px)`, opacity: 1 }
          ],
          { duration: 560, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' }
        ).finished.then(() => d.classList.remove('pouring'), () => d.classList.remove('pouring'));
      } catch (e) { d.classList.remove('pouring'); }
      const tiles = visibleTiles(d, 30);
      tiles.forEach(({ el, r }, i) => {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = p.x - cx, dy = p.y - cy;
        const swirl = (i % 2 ? 1 : -1) * (8 + (i % 5) * 3);
        try {
          el.animate(
            [
              { transform: `translate(${dx}px, ${dy}px) scale(0.12) rotate(${swirl}deg)`, opacity: 0 },
              { opacity: 1, offset: 0.35 },
              { transform: 'translate(0, 0) scale(1.06) rotate(0deg)', offset: 0.78 },
              { transform: 'none', opacity: 1 }
            ],
            { duration: 620, delay: 70 + i * 16, easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)', fill: 'backwards' }
          );
        } catch (e) {}
      });
    });
  }
  function drawerClosing() {
    hideScrubBubble();
    const d = $('drawer');
    if (!d || d.hidden || launchedSinceOpen || !motionOn() || !d.animate) return;
    const h = host();
    if (h && !h.visible()) return;
    if (document.hidden) return;
    const p = pupilPoint();
    const box = d.getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'polish-gulp';
    // the panel itself folds back into the pupil
    const ghost = document.createElement('div');
    ghost.className = 'polish-gulp-panel' + (d.classList.contains('expanded') ? ' expanded' : '');
    Object.assign(ghost.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });
    layer.append(ghost);
    const tiles = visibleTiles(d, 18);
    const flyers = tiles.map(({ el, r }) => {
      const img = el.querySelector('img');
      const f = document.createElement('div');
      f.className = 'polish-flyer';
      Object.assign(f.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      if (img) { const c = img.cloneNode(); c.removeAttribute('loading'); f.append(c); }
      layer.append(f);
      return { f, r };
    });
    document.body.append(layer);
    const ox = p.x - box.left, oy = p.y - box.top;
    const far = Math.hypot(Math.max(ox, box.width - ox), Math.abs(oy) + box.height);
    try {
      ghost.animate(
        [
          { clipPath: `circle(${far}px at ${ox}px ${oy}px)`, opacity: 1 },
          { clipPath: `circle(0px at ${ox}px ${oy}px)`, opacity: 0.6 }
        ],
        { duration: 380, easing: 'cubic-bezier(0.55, 0, 0.75, 0.4)', fill: 'forwards' }
      );
    } catch (e) {}
    const n = flyers.length;
    flyers.forEach(({ f, r }, i) => {
      const dx = p.x - (r.left + r.width / 2), dy = p.y - (r.top + r.height / 2);
      try {
        f.animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(0.7)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0 }
          ],
          { duration: 380, delay: (n - i) * 9, easing: 'cubic-bezier(0.5, 0, 0.8, 0.5)', fill: 'forwards' }
        );
      } catch (e) {}
    });
    setTimeout(() => { const hh = host(); if (hh) hh.react('gulp'); }, 230);
    setTimeout(() => layer.remove(), 380 + n * 9 + 120);
  }
  // A launch from inside the drawer means the drawer is left behind, not swallowed.
  addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button[data-id]');
    if (!b) return;
    const inDrawer = !!b.closest('#drawer');
    const place = inDrawer || b.closest('#dock') || b.closest('#homeApps');
    if (!place) return;
    if (b.classList.contains('dock-folder') || b.classList.contains('home-folder') || b.classList.contains('dock-empty')) return;
    if (b.closest('#recentApps')) return; // the grid button it forwards to records the launch
    if (inDrawer) launchedSinceOpen = true;
    noteLaunch(b.dataset.id);
  }, true);

  // =====================================================================================================
  // 2 · Recent apps and the A–Z scrubber
  // =====================================================================================================
  function noteLaunch(id) {
    if (!id) return;
    today();
    store.launches++;
    store.recent = [id].concat(store.recent.filter((x) => x !== id)).slice(0, 8);
    persist();
  }
  function ensureRecentRow() {
    let row = $('recentApps');
    if (row) return row;
    const grid = $('appGrid');
    if (!grid) return null;
    row = document.createElement('div');
    row.id = 'recentApps';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Recent apps');
    row.hidden = true;
    grid.before(row);
    return row;
  }
  function renderRecents() {
    const row = ensureRecentRow(), grid = $('appGrid'), drawer = $('drawer');
    if (!row || !grid) return;
    const q = ($('search') && $('search').value.trim()) || '';
    const tiles = [];
    if (!q) {
      for (const id of store.recent) {
        const src = grid.querySelector(`.app[data-id="${CSS.escape(id)}"]`);
        if (!src) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'recent-app';
        b.dataset.id = id;
        const label = src.querySelector('span:last-child');
        b.setAttribute('aria-label', 'Open ' + (label ? label.textContent : 'app'));
        const img = src.querySelector('img');
        if (img) { const c = img.cloneNode(); c.removeAttribute('loading'); b.append(c); }
        b.onclick = (e) => { e.preventDefault(); const live = grid.querySelector(`.app[data-id="${CSS.escape(id)}"]`); if (live) live.click(); };
        tiles.push(b);
        if (tiles.length >= 5) break;
      }
    }
    const show = tiles.length >= 2 && grid.children.length >= 8;
    row.replaceChildren(...(show ? tiles : []));
    row.hidden = !show;
    if (drawer) drawer.classList.toggle('has-recents', show);
  }
  function letterOf(name) {
    const c = (name || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : '#';
  }
  let bubble = null, scrubLetter = '';
  function hideScrubBubble() { if (bubble) bubble.classList.remove('shown'); scrubLetter = ''; }
  function syncScrubber() {
    const d = $('drawer'), grid = $('appGrid');
    if (!d || !grid) return;
    const q = ($('search') && $('search').value.trim()) || '';
    const tiles = [...grid.querySelectorAll('.app')];
    const want = d.classList.contains('expanded') && !q && tiles.length >= 30;
    if (!want) { if (scrubber) scrubber.hidden = true; return; }
    const letters = [];
    for (const t of tiles) { const l = letterOf((t.querySelector('span:last-child') || {}).textContent); if (!letters.includes(l)) letters.push(l); }
    letters.sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)));
    if (!scrubber) {
      scrubber = document.createElement('div');
      scrubber.id = 'appScrubber';
      scrubber.setAttribute('aria-hidden', 'true'); // search is the accessible way; this is a touch shortcut
      d.append(scrubber);
      bubble = document.createElement('div');
      bubble.id = 'appScrubBubble';
      d.append(bubble);
      const pick = (e) => {
        const kids = [...scrubber.children];
        if (!kids.length) return;
        const r = scrubber.getBoundingClientRect();
        const i = clamp(Math.floor(((e.clientY - r.top) / r.height) * kids.length), 0, kids.length - 1);
        const l = kids[i].textContent;
        bubble.textContent = l;
        bubble.style.top = clamp(e.clientY, r.top + 30, r.bottom - 30) + 'px';
        bubble.classList.add('shown');
        if (l === scrubLetter) return;
        scrubLetter = l;
        kids.forEach((k, j) => k.classList.toggle('on', j === i));
        const target = [...$('appGrid').querySelectorAll('.app')].find((t) => letterOf((t.querySelector('span:last-child') || {}).textContent) === l);
        if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
        try { if (navigator.vibrate) navigator.vibrate(4); } catch (err) {}
      };
      scrubber.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); try { scrubber.setPointerCapture(e.pointerId); } catch (err) {} scrubber.classList.add('active'); pick(e); });
      scrubber.addEventListener('pointermove', (e) => { if (scrubber.classList.contains('active')) { e.stopPropagation(); pick(e); } });
      const end = (e) => { e.stopPropagation(); scrubber.classList.remove('active'); [...scrubber.children].forEach((k) => k.classList.remove('on')); setTimeout(hideScrubBubble, 260); };
      scrubber.addEventListener('pointerup', end);
      scrubber.addEventListener('pointercancel', end);
    }
    if (scrubber.dataset.l !== letters.join('')) {
      scrubber.dataset.l = letters.join('');
      scrubber.replaceChildren(...letters.map((l) => { const s = document.createElement('span'); s.textContent = l; return s; }));
    }
    scrubber.hidden = false;
  }
  function watchDrawer() {
    const d = $('drawer'), grid = $('appGrid'), search = $('search');
    if (!d || !grid) return;
    try {
      new MutationObserver(() => { if (!d.hidden) { renderRecents(); syncScrubber(); } }).observe(grid, { childList: true });
      new MutationObserver(() => { if (!d.hidden) syncScrubber(); if (d.hidden) hideScrubBubble(); }).observe(d, { attributes: true, attributeFilter: ['class', 'hidden'] });
    } catch (e) {}
    if (search) search.addEventListener('input', () => { renderRecents(); syncScrubber(); });
  }

  // =====================================================================================================
  // 3 · The clock face
  // =====================================================================================================
  // Thin drawn numerals on a 56 × 100 box. Strokes only, round ends, so they share the Eye's line.
  const GLYPH = {
    0: 'M28 4C14 4 6 22 6 50s8 46 22 46 22-18 22-46S42 4 28 4Z',
    1: 'M15 18 31 5v91',
    2: 'M8 25C8 12 17 4 28.5 4 40.5 4 49 12.5 49 25c0 12-7 21-18.5 33L7.5 96H50',
    3: 'M9 14c5-6.5 11-10 19.5-10C40 4 48 11.5 48 24c0 13-9 22-22.5 22C42 46 51 56 51 70c0 15-10.5 26-24 26-9.5 0-16.5-4-21-11',
    4: 'M38 96V4L5 68h47',
    5: 'M47 4H13L9 45c5.5-4.5 12-7 19.5-7C42 38 51 50 51 66c0 17-10.5 30-24.5 30C17 96 10 91.5 6 85',
    6: 'M45 11C40 6.5 34.5 4 28.5 4 14.5 4 6 21 6 50c0 30 9 46 23 46 13 0 22-11 22-26S42 44.5 29 44.5C17.5 44.5 9 52 6 62',
    7: 'M5 4h46L21 96',
    8: 'M28 46C16.5 46 9 38.5 9 25.5S16.5 4 28 4s19 8.5 19 21.5S39.5 46 28 46Zm0 0C14.5 46 6 55.5 6 70.5S15 96 28 96s22-10.5 22-25.5S41.5 46 28 46Z',
    9: 'M11 89c5 4.5 10.5 7 16.5 7C41.5 96 50 79 50 50 50 20 41 4 27 4 14 4 5 15 5 30s9 25.5 22 25.5c11.5 0 20-7.5 23-17.5'
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  let clockText = '', clockDigits = [], colonBlinkTimer = 0;
  function el(tag, attrs) { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function clock(text) {
    const btn = $('clock');
    if (!btn) return false;
    const m = /^\s*(\d{1,2})[:.](\d{2})\s*(.*)$/.exec(text || '');
    if (!m) { btn.classList.remove('drawn'); clockText = ''; return false; }
    if (text === clockText && btn.querySelector('svg.clock-face')) return true;
    const prev = clockDigits;
    clockText = text;
    const digits = (m[1] + m[2]).split('');
    const split = m[1].length;
    const suffix = (m[3] || '').replace(/\./g, '').trim();
    const H = 100, W = 56, GAP = 13, COLON = 26;
    let x = 0;
    const svg = el('svg', { class: 'clock-face', 'aria-hidden': 'true', focusable: 'false' });
    const ink = el('g', { class: 'clock-ink' });
    svg.append(ink);
    digits.forEach((dch, i) => {
      if (i === split) {
        const colon = el('g', { class: 'clock-colon', transform: `translate(${x + COLON / 2 - GAP / 2} 0)` });
        colon.append(el('circle', { cx: 0, cy: 34, r: 4.6 }), el('circle', { cx: 0, cy: 74, r: 4.6 }));
        svg.append(colon);
        x += COLON;
      }
      // narrow 1 keeps "11:11" from looking spaced out
      const w = dch === '1' ? 38 : W;
      const g = el('g', { transform: `translate(${x - (dch === '1' ? 9 : 0)} 0)` });
      const path = el('path', { d: GLYPH[dch], pathLength: 100 });
      const changed = prev.length === digits.length && prev[i] !== dch;
      if (changed && motionOn()) path.classList.add('drawing');
      g.append(path);
      ink.append(g);
      x += w + GAP;
    });
    const total = x - GAP;
    svg.setAttribute('viewBox', `-4 -4 ${total + 8} ${H + 8}`);
    svg.style.setProperty('--clock-aspect', String((total + 8) / (H + 8)));
    clockDigits = digits;
    const sr = document.createElement('span');
    sr.className = 'clock-text';
    sr.textContent = text;
    const nodes = [sr, svg];
    if (suffix) { const s = document.createElement('span'); s.className = 'clock-suffix'; s.setAttribute('aria-hidden', 'true'); s.textContent = suffix.toUpperCase(); nodes.push(s); }
    btn.replaceChildren(...nodes);
    btn.classList.add('drawn');
    planColonBlink();
    return true;
  }
  // Now and then the colon blinks, like two tiny lids. Never on a schedule you'd notice.
  function planColonBlink() {
    if (colonBlinkTimer) return;
    const wait = 14000 + Math.random() * 26000;
    colonBlinkTimer = setTimeout(() => {
      colonBlinkTimer = 0;
      const c = document.querySelector('#clock .clock-colon');
      const h = host();
      if (c && motionOn() && !document.hidden && (!h || (h.visible() && !h.panel()))) {
        c.classList.remove('blink');
        requestAnimationFrame(() => c.classList.add('blink'));
        setTimeout(() => c.classList.remove('blink'), 420);
      }
      if (!document.hidden) planColonBlink();
    }, wait);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) planColonBlink(); });

  // =====================================================================================================
  // 4 · Remarks: a quiet line under the Eye, sometimes, when you come back
  // =====================================================================================================
  const FAMILY = {};
  try {
    const W = { curious: ['curious', 'nosy', 'inquisitive'], shy: ['shy', 'timid', 'bashful'], hyper: ['hyper', 'restless', 'zippy'], sleepy: ['sleepy', 'dozy', 'mellow'], grumpy: ['grumpy', 'judgy', 'unimpressed'], dramatic: ['dramatic', 'theatrical', 'extra'], calm: ['calm', 'steady', 'serene'], smug: ['smug', 'cocky', 'proud'] };
    for (const k in W) for (const w of W[k]) FAMILY[w] = k;
  } catch (e) {}
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const LINES = {
    curious: ['{n} wants to know what was in there', '{n} has questions about that last app', '{n} counted {k} visits today. it has theories', '{n} looked around while you were gone'],
    shy: ['{n} noticed you. it is pretending it didn’t', '{n} was not watching the door', '{n} is glad. quietly', '{n} kept your spot warm'],
    hyper: ['{n} has been waiting. very patiently. sort of', '{n} did eleven laps while you were out', 'visit {o}. {n} is keeping count', '{n} is so back'],
    sleepy: ['{n} was mid-nap', '{n} will be awake in a minute', '{n} dreamed you came back. you did', 'five more minutes, says {n}'],
    grumpy: ['{n} is judging your {o} unlock', '{n} saw that', '{n} has notes', '{n} expected you sooner'],
    dramatic: ['{n} thought you were gone forever', '{n} has been through a lot since you left', 'the return. {n} will remember this', '{n} survived. barely'],
    calm: ['{n} kept everything where you left it', 'nothing moved. {n} checked', '{n} is here', '{n} watched the light change'],
    smug: ['{n} knew you’d be back', '{n} called it', 'of course it’s you, says {n}', '{n} is not surprised']
  };
  const CONTEXT = [
    { when: (c) => c.hour >= 1 && c.hour < 5, lines: ['{n} thinks it’s very late', 'it’s {t}. {n} is just saying', '{n} would like you to sleep'] },
    { when: (c) => c.battery > 0 && c.battery <= 15 && !c.charging, lines: ['{n} is running on fumes. so is the phone', '{n} is saving its blinks. battery’s low'] },
    { when: (c) => c.away > 6 * 3600000, lines: ['{n} kept watch the whole time', '{n} forgot what you looked like. for a second'] },
    { when: (c) => c.returns >= 40, lines: ['visit {o} today. {n} has stopped pretending not to count'] }
  ];
  let remarkEl = null, remarkTimer = 0;
  function ensureRemark() {
    if (remarkEl) return remarkEl;
    const home = $('home');
    if (!home) return null;
    remarkEl = document.createElement('p');
    remarkEl.id = 'eyeRemark';
    remarkEl.setAttribute('role', 'status');
    remarkEl.setAttribute('aria-live', 'polite');
    home.append(remarkEl);
    return remarkEl;
  }
  function placeRemark() {
    if (!remarkEl) return;
    const h = host();
    const e = h ? h.eyeCentre() : { x: innerWidth / 2, y: innerHeight * 0.49, size: 90 };
    remarkEl.style.top = Math.round(e.y + e.size * 1.62) + 'px';
  }
  function busy() {
    const h = host(), home = $('home');
    if (!h || !h.visible() || h.panel()) return true;
    if (h.core && h.core.mode === 'music') return true;
    if (home && (home.dataset.notice === 'shown' || home.classList.contains('music-focus'))) return true;
    if ($('abilityWheel') && !$('abilityWheel').hidden) return true;
    if (h.core && h.core.asleep) return true;
    for (const id of ['weather', 'pocket', 'arcade', 'vision', 'awaken']) { const n = $(id); if (n && !n.hidden && n.offsetParent !== null) return true; }
    return false;
  }
  function pickLine(ctx) {
    const s = root.HavenDNA && root.HavenDNA.summary && root.HavenDNA.summary();
    if (!s || !s.name) return '';
    const fam = FAMILY[(s.words || [])[0]] || FAMILY[(s.words || [])[1]] || 'calm';
    let pool = LINES[fam] || LINES.calm;
    const ctxHit = CONTEXT.find((c) => c.when(ctx));
    if (ctxHit && Math.random() < 0.6) pool = ctxHit.lines;
    const fresh = pool.filter((l) => !store.said.includes(l));
    const list = fresh.length ? fresh : pool;
    const line = list[Math.floor(Math.random() * list.length)];
    store.said = [line].concat(store.said.filter((x) => x !== line)).slice(0, 10);
    const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return line.replace('{n}', s.name).replace('{k}', String(ctx.returns)).replace('{o}', ord(ctx.returns)).replace('{t}', t);
  }
  function showRemark(text) {
    const r = ensureRemark();
    if (!r || !text) return;
    placeRemark();
    r.textContent = text;
    r.classList.add('shown');
    clearTimeout(remarkTimer);
    remarkTimer = setTimeout(() => r.classList.remove('shown'), 6200);
  }
  function hideRemark() { clearTimeout(remarkTimer); if (remarkEl) remarkEl.classList.remove('shown'); }
  root.addEventListener('haven:greet', (e) => {
    today();
    store.returns++;
    persist();
    if (!store.remarks) return;
    const away = (e && e.detail && e.detail.awayMs) || 0;
    const since = Date.now() - (store.lastRemark || 0);
    if (away < 90000 || since < 40 * 60000) return;
    const chance = away > 3 * 3600000 ? 0.6 : 0.28;
    if (Math.random() > chance) return;
    const h = host();
    const st = (h && h.core && h.core.state) || {};
    const ctx = { hour: new Date().getHours(), away, returns: store.returns, battery: Number(st.battery) || 0, charging: !!st.charging };
    // after the welcome and greeting have played
    setTimeout(() => {
      if (busy()) return;
      const line = pickLine(ctx);
      if (!line) return;
      store.lastRemark = Date.now();
      persist();
      showRemark(line);
    }, 2300);
  });
  addEventListener('pointerdown', (e) => { if (remarkEl && remarkEl.classList.contains('shown') && !(e.target === remarkEl)) hideRemark(); }, true);
  addEventListener('resize', placeRemark);

  // =====================================================================================================
  // 5 · The ability light: beckons until found, explained once
  // =====================================================================================================
  function watchSatellite() {
    let tries = 0;
    const attach = () => {
      const sat = $('abilitySatellite');
      if (!sat) { if (tries++ < 40) setTimeout(attach, 500); return; }
      const sync = () => sat.classList.toggle('beckon', !store.foundAbilities && !sat.hidden && motionOn());
      sat.addEventListener('click', () => {
        if (!store.foundAbilities) { store.foundAbilities = true; persist(); }
        const h = host();
        if (h && h.tips) h.tips.used('abilities');
        sync();
      });
      let offered = false;
      const maybeTip = () => {
        sync();
        if (offered || store.foundAbilities || sat.hidden) return;
        const h = host();
        if (!h || !h.tips || h.tips.seen('abilities')) return;
        offered = true;
        setTimeout(() => {
          if (sat.hidden || busy() || store.foundAbilities) { offered = false; return; }
          const r = sat.getBoundingClientRect();
          if (!r.width) { offered = false; return; }
          const ok = h.tips.offer('abilities', 'This little light holds its abilities. Tap it', { x: r.left + r.width / 2, y: r.bottom + 4 }, 'below');
          if (!ok) offered = false;
        }, 4200);
      };
      try { new MutationObserver(maybeTip).observe(sat, { attributes: true, attributeFilter: ['hidden'] }); } catch (e) {}
      root.addEventListener('haven:greet', () => setTimeout(maybeTip, 2000));
      maybeTip();
    };
    attach();
  }

  // =====================================================================================================
  // 6 · The Optic: plumbing folded away, long explanations tucked
  // =====================================================================================================
  let opticShaped = false;
  function shapeOptic() {
    const st = $('settings');
    if (!st || opticShaped) return;
    opticShaped = true;
    try {
      const heads = [...st.querySelectorAll(':scope > h2.optic-group')];
      const display = heads.find((h) => /^Display/.test(h.textContent.trim()));
      const help = heads.find((h) => /Help/.test(h.textContent));
      if (display && help) {
        const fold = document.createElement('details');
        fold.className = 'optic-fold';
        fold.id = 'opticPhone';
        const sum = document.createElement('summary');
        sum.innerHTML = '<span>Phone setup<small>Display, home screen &amp; dock, notifications, music</small></span><i aria-hidden="true"></i>';
        fold.append(sum);
        const body = document.createElement('div');
        body.className = 'optic-fold-body';
        fold.append(body);
        display.before(fold);
        let n = fold.nextSibling;
        while (n && n !== help) {
          const next = n.nextSibling;
          // abilities (Weather) stay out in the open: they are the Eye's, not the phone's
          if (n.id === 'wxOptic' || (n.querySelector && n.querySelector('#wxOptic'))) fold.before(n);
          else body.append(n);
          n = next;
        }
      }
      // long paragraphs become small "more" disclosures
      for (const p of [...st.querySelectorAll('p.detail')]) {
        if (p.closest('details.polish-more')) continue;
        const txt = p.textContent;
        const label = /Hold the iris/.test(txt) ? 'Gestures & touches'
          : p.classList.contains('live-audio-explainer') ? 'What Live Audio can and can’t access'
          : /Auto goes Gentle/.test(txt) ? 'How Auto works'
          : /previous launcher/.test(txt) ? 'How to switch back'
          : /Notifications stay/.test(txt) ? 'Privacy'
          : 'More';
        const d = document.createElement('details');
        d.className = 'polish-more';
        const s = document.createElement('summary');
        s.textContent = label;
        p.before(d);
        d.append(s, p);
      }
      // Remarks: a switch beside the other things the Eye does on its own
      const anchor = $('senseFriend') ? $('senseFriend').closest('.setting') : $('linkOpen');
      if (anchor && !$('remarksOn')) {
        const row = document.createElement('div');
        row.className = 'setting';
        row.innerHTML = '<span>Remarks<small>Now and then, a quiet line under the Eye when you come back.</small></span>';
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.id = 'remarksOn';
        c.setAttribute('aria-label', 'Remarks');
        c.checked = store.remarks !== false;
        c.addEventListener('change', () => { store.remarks = c.checked; persist(); if (!c.checked) hideRemark(); });
        row.append(c);
        anchor.after(row);
      }
    } catch (e) {}
  }
  function watchOptic() {
    const st = $('settings');
    if (!st) return;
    try {
      new MutationObserver(() => { if (!st.hidden) setTimeout(shapeOptic, 30); }).observe(st, { attributes: true, attributeFilter: ['hidden'] });
    } catch (e) {}
  }

  // =====================================================================================================
  function boot() {
    // iPhone has no Android app drawer. Keep the genuine clock, remarks and ability beckon.
    if (root.EYES_IOS_ABILITIES) {
      clock($('clock')?.textContent || '');
      watchSatellite();
      watchOptic();
      return;
    }
    watchDrawer();
    watchSatellite();
    watchOptic();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  root.EyesPolish = { drawerOpened, drawerClosing, clock, remark: showRemark, _store: () => store };
})(window);
