/* EYES 4.4.3 · The Ability Satellite and Ability Wheel.
   4.4.6: Weather (weather.js) is the fourth ability. Two small additions for it: launch(id) opens an ability
   directly (the home-screen temperature opens Weather), and ambient painters may add a brief, event-timed
   touch to the idle Eye (weather moments); they ask for frames only while something is showing.

   One small luminous satellite rides beside the Eye. Tap it and it unfolds a curved arc of abilities around
   the Eye; pick one and that ability takes over the iris. 4.4.3 ships a single ability, Vision (vision.js).

   Everything here is drawn into the Eye's own canvas (launcher.js calls EyesAbility.frame() from draw()), so
   the satellite breathes at the Eye's calm frame rate and adds no render loop of its own. The DOM only holds
   transparent, accessible touch targets, the same way the music controls work.

   Central ability state:
     IDLE -> WHEEL_OPEN -> <ability entry state> -> ...ability states... -> IDLE
     any state -> SAFE_CLEANUP -> IDLE
   Only one ability may own the iris at a time. Abilities declare their own states and transitions when they
   register; illegal transitions are refused and counted (diagnostics()).

   Registering an ability (see the guide in the 4.4.3 report):
     EyesAbility.register({
       id, label, icon,            // icon: SVG path data in a 24×24 box, drawn with strokes
       available(),                // false hides it (and the satellite, if nothing is available)
       entry: 'STATE',             // first state when chosen from the wheel
       states: { STATE: ['NEXT', ...], ... },   // its own transition table
       activate(api),              // api: { go(state), state(), done(), host() }
       pose(t), fps(t), frame(ctx, geo), back(), interrupt(reason), suspend(reason)
     }); */
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const TAU = Math.PI * 2;

  const registry = [];
  const ambients = [];
  const CORE_STATES = { IDLE: ['WHEEL_OPEN'], WHEEL_OPEN: ['IDLE'], SAFE_CLEANUP: ['IDLE'] };
  const machine = { state: 'IDLE', owner: null, since: 0, history: [], refused: 0, transitions: 0 };
  const wheel = { open: false, u: 0, from: 0, at: 0, dur: 1, items: [], angle: 0, radius: 0, dir: 1, lastToggle: 0, focusIndex: 0 };
  let geo = null, host = null, lastPaintT = 0, satShown = false, keyboardUsed = false;
  const ms = () => performance.now();

  function getHost() {
    if (!host && window.Haven && Haven.abilityHost) host = Haven.abilityHost();
    return host;
  }
  const motion = () => { const h = getHost(); return h ? h.motion() : true; };
  const gentle = () => { const h = getHost(); return h ? h.gentle() : false; };
  const redraw = () => { const h = getHost(); if (!h) return; if (!h.motion()) h.draw(); else h.schedule(); };

  // ---------- state machine ----------
  function allowed(from, to) {
    if (to === 'SAFE_CLEANUP') return true;
    if (CORE_STATES[from]) {
      if (CORE_STATES[from].includes(to)) return true;
      // 4.4.5: an ability may briefly claim the iris from IDLE for one of its declared claim states
      // (Pocket swallowing something you shared while EYES was away)
      if (from === 'IDLE' && machine.claiming && machine.claiming === to) return true;
      // 4.4.6: or be opened directly at its entry state (launch())
      if (from === 'IDLE' && machine.launching && machine.launching === to) return true;
      if (from === 'WHEEL_OPEN') return registry.some((a) => a.entry === to);
      return false;
    }
    const a = machine.owner;
    return !!(a && a.states && a.states[from] && a.states[from].includes(to));
  }
  function go(to, reason) {
    const from = machine.state;
    if (from === to) return true;
    if (!allowed(from, to)) {
      machine.refused++;
      machine.history.push({ from, to, refused: true, reason: reason || '', at: Math.round(ms()) });
      if (machine.history.length > 40) machine.history.shift();
      return false;
    }
    machine.state = to;
    machine.since = ms();
    machine.transitions++;
    machine.history.push({ from, to, reason: reason || '', at: Math.round(machine.since) });
    if (machine.history.length > 40) machine.history.shift();
    document.documentElement.dataset.ability = to === 'IDLE' ? '' : machine.owner ? machine.owner.id : 'wheel';
    syncDom();
    redraw();
    return true;
  }

  // ---------- wheel ----------
  function availableAbilities() {
    if (window.EYES_WEB && !window.EYES_IOS_ABILITIES) return [];
    return registry.filter((a) => { try { return a.available ? !!a.available() : true; } catch { return false; } });
  }
  function satellitePoint(g) {
    // upper-left of the Eye, outside the body; the notification glint lives upper-right and the
    // music/shortcut switch lower-left, so the three never meet
    return g.screen(-g.size * 0.935, -g.size * 0.935);
  }
  // 4.6.6: six abilities. The arc is searched, not fixed: radius, spacing, a gentle horizontal stretch (landscape,
  // foldables), start angle, direction and where each label sits are scored together, and the first layout with
  // nothing overlapping, nothing outside the safe area and nothing on the Eye wins. Touch targets stay 52 px.
  const ITEM_R = 26, MIN_GAP = 56, LABEL_H = 13, LABEL_MAX = 78;
  let measureCtx = null;
  function labelBox(text) {
    const key = String(text || '');
    if (labelBox.cache.has(key)) return labelBox.cache.get(key);
    const up = key.toUpperCase();
    const widthOf = (str) => {
      try {
        if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
        measureCtx.font = '10px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
        return measureCtx.measureText(str).width + str.length * 1.6;   // + 0.16em letter spacing
      } catch { return str.length * 7.8; }
    };
    let lines = [up], w = widthOf(up);
    if (w > LABEL_MAX && up.includes(' ')) {
      // two balanced lines ("Pocket / Dimension", "Eye / Contact")
      const words = up.split(' ');
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const m = Math.max(widthOf(a), widthOf(b));
        if (!best || m < best.m) best = { a, b, m };
      }
      lines = [best.a, best.b]; w = best.m;
    }
    const box = { w: Math.ceil(w) + 4, h: LABEL_H * lines.length + 1, lines: lines.length };
    labelBox.cache.set(key, box);
    return box;
  }
  labelBox.cache = new Map();
  const rectsOverlap = (a, b, pad = 0) => a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
  function labelRect(p, box, mode, cx, cy) {
    // 'radial': outward from the Eye along the item's own direction (spreads labels apart on a tight arc);
    // 'vertical': straight above (items above the Eye) or below (items below it), the 4.4.3 behaviour
    let ux, uy;
    if (mode === 'radial') { const d = Math.hypot(p.x - cx, p.y - cy) || 1; ux = (p.x - cx) / d; uy = (p.y - cy) / d; }
    else { ux = 0; uy = p.y > cy ? 1 : -1; }
    // distance from the item centre to the label centre along (ux, uy), so the label just clears the target
    const along = Math.abs(ux) * box.w / 2 + Math.abs(uy) * box.h / 2;
    const reach = ITEM_R - 2 + along;
    const lx = p.x + ux * reach, ly = p.y + uy * reach;
    return { x: lx - box.w / 2, y: ly - box.h / 2, w: box.w, h: box.h, cx: lx, cy: ly };
  }
  function layoutWheel(g) {
    const items = wheel.items, n = items.length;
    if (!n) return;
    const sat = satellitePoint(g);
    const cx = g.cx, cy = g.cy;
    const base = Math.atan2(sat.y - cy, sat.x - cx);
    const satR = Math.hypot(sat.x - cx, sat.y - cy);
    const inset = g.insets || {};
    const safe = { l: (inset.left || 0) + 6, r: g.w - (inset.right || 0) - 6, t: (inset.top || 0) + 6, b: g.h - (inset.bottom || 0) - 6 };
    const eyeR = Math.max(g.rx || g.size, g.ry || g.size) * 1.06 + 4;
    const boxes = items.map((it) => labelBox(it.ability.label));
    // the Eye breathes and glances; search again only when the screen, the Eye's size or where it sits really change
    const key = [Math.round(g.w), Math.round(g.h), Math.round((cx - g.w / 2) / 16), Math.round((cy - g.h * 0.49) / 16), Math.round(satR / 4), n, Math.round(safe.l), Math.round(safe.r), Math.round(safe.t), Math.round(safe.b)].join(',');
    if (wheel.layoutKey === key && wheel.layout) return applyLayout(wheel.layout, base, satR);
    let best = null;
    const tryOne = (rK, sx, off, dir, extra, mode) => {
      const R = satR * rK;
      // spacing from the needed chord (touch targets never overlap), widened a little for long labels
      const chord = MIN_GAP + extra;
      const sp = 2 * Math.asin(Math.min(0.99, chord / (2 * R)));
      if ((n - 1) * sp + off > 4.6) return;            // never wrap more than ~3/4 of the way round
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = base + dir * (off + i * sp);
        pts.push({ x: cx + Math.cos(a) * R * sx, y: cy + Math.sin(a) * R, a });
      }
      let hard = 0, soft = 0;
      const rects = pts.map((p, i) => labelRect(p, boxes[i], mode, cx, cy));
      for (let i = 0; i < n; i++) {
        const p = pts[i], L = rects[i];
        if (p.x - ITEM_R < safe.l || p.x + ITEM_R > safe.r || p.y - ITEM_R < safe.t || p.y + ITEM_R > safe.b) hard += 10;
        if (L.x < safe.l || L.x + L.w > safe.r || L.y < safe.t || L.y + L.h > safe.b) hard += 4;
        if (Math.hypot(p.x - cx, p.y - cy) < eyeR + ITEM_R) hard += 6;
        // a label must not sit on the Eye
        const nx = Math.max(L.x, Math.min(cx, L.x + L.w)), ny = Math.max(L.y, Math.min(cy, L.y + L.h));
        if (Math.hypot(nx - cx, ny - cy) < eyeR) hard += 3;
        if (Math.hypot(p.x - sat.x, p.y - sat.y) < ITEM_R + 14) hard += 2;          // keep the satellite itself free
        for (let j = i + 1; j < n; j++) {
          const q = pts[j];
          if (Math.hypot(p.x - q.x, p.y - q.y) < MIN_GAP - 0.5) hard += 8;
          if (rectsOverlap(L, rects[j], 3)) hard += 3;
        }
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const q = pts[j];
          const qr = { x: q.x - ITEM_R + 4, y: q.y - ITEM_R + 4, w: (ITEM_R - 4) * 2, h: (ITEM_R - 4) * 2 };
          if (rectsOverlap(L, qr, 1)) hard += 3;
        }
      }
      // preferences: close to the classic look (radius ≈ 1.28, round, starting just past the satellite, clockwise)
      soft += Math.abs(rK - 1.28) * 6 + (sx - 1) * 5 + Math.abs(off - 0.5) * 2 + (dir < 0 ? 0.6 : 0) + extra * 0.02 + (mode === 'radial' ? 0 : 0.3);
      const score = hard * 100 + soft;
      if (!best || score < best.score) best = { score, hard, pts, R, sx, dir, rects, mode };
    };
    search: for (const sx of [1, 1.18, 1.4, 1.7, 2.1])
      for (const rK of [1.28, 1.2, 1.38, 1.12, 1.5, 1.65, 1.06, 1.85])
        for (const extra of [8, 0, 18, 30])
          for (const off of [0.5, 0.36, 0.66, 0.24, 0.85])
            for (const dir of [1, -1])
              for (const mode of ['radial', 'vertical']) {
                tryOne(rK, sx, off, dir, extra, mode);
                if (best && best.hard === 0 && best.score < 1.2) break search;
              }
    if (!best) return;
    wheel.layoutKey = key;
    wheel.layout = { R: best.R / satR, sx: best.sx, dir: best.dir, mode: best.mode, rel: best.pts.map((p) => p.a - base), hard: best.hard };
    applyLayout(wheel.layout, base, satR);
  }
  function applyLayout(L, base, satR) {
    const g = geo;
    wheel.angle = base; wheel.radius = L.R * satR; wheel.dir = L.dir; wheel.satR = satR; wheel.sx = L.sx; wheel.labelMode = L.mode; wheel.fit = L.hard === 0;
    wheel.items.forEach((it, i) => {
      const a = base + L.rel[i];
      it.a = a;
      it.x = g.cx + Math.cos(a) * wheel.radius * L.sx;
      it.y = g.cy + Math.sin(a) * wheel.radius;
      const box = labelBox(it.ability.label), r = labelRect(it, box, L.mode, g.cx, g.cy);
      it.label = { dx: r.cx - it.x, dy: r.cy - it.y, w: box.w, h: box.h, lines: box.lines, x: r.x, y: r.y };
    });
  }
  function wheelU(t) {
    const e = clamp((t - wheel.at) / wheel.dur);
    return mix(wheel.from, wheel.open ? 1 : 0, wheel.open ? easeOut(e) : ease(e));
  }
  function openWheel() {
    const t = ms();
    if (machine.state !== 'IDLE' || (wheel.lastToggle && t - wheel.lastToggle < 250) || !geo || !satShown) return;
    const list = availableAbilities();
    if (!list.length) return;
    wheel.items = list.map((a) => ({ ability: a, x: 0, y: 0, a: 0 }));
    wheel.layoutKey = "";
    layoutWheel(geo);
    if (!go('WHEEL_OPEN', 'satellite')) return;
    wheel.from = wheelU(t); wheel.open = true; wheel.at = t; wheel.lastToggle = t;
    wheel.dur = !motion() ? 0 : gentle() ? 220 : 420;
    buildWheelDom();
    const h = getHost();
    if (h) h.look(satellitePoint(geo));         // he notices the satellite unfolding
    if (keyboardUsed) setTimeout(() => { if (machine.state === 'WHEEL_OPEN') { positionWheelDom(1); focusItem(0); } }, wheel.dur + 40);
    redraw();
  }
  function closeWheel(reason, instant) {
    const t = ms();
    if (machine.state !== 'WHEEL_OPEN') return false;
    wheel.from = instant ? 0 : wheelU(t); wheel.open = false; wheel.at = t; wheel.lastToggle = t;
    wheel.dur = instant || !motion() ? 0 : gentle() ? 160 : 260;
    go('IDLE', reason);
    if (reason !== 'select' && keyboardUsed) { const s = $('abilitySatellite'); if (s && !s.hidden) s.focus({ preventScroll: true }); }
    return true;
  }
  function select(ability) {
    if (machine.state !== 'WHEEL_OPEN' || !wheel.open) return; // accept the first real tap, even while icons finish unfolding
    // the wheel retracts while the ability's transformation begins
    const t = ms();
    wheel.from = wheelU(t); wheel.open = false; wheel.at = t; wheel.lastToggle = t;
    wheel.dur = !motion() ? 0 : gentle() ? 160 : 260;
    machine.owner = ability;
    if (!go(ability.entry, 'select')) { machine.owner = null; closeWheel('refused', true); return; }
    try {
      ability.activate(api(ability));
    } catch (err) {
      cleanup('activate-failed');
    }
  }
  function api(ability) {
    return {
      go: (s, reason) => (machine.owner === ability ? go(s, reason) : false),
      state: () => machine.state,
      since: () => machine.since,
      done: (reason) => { if (machine.owner === ability) release(reason || 'done'); },
      host: getHost,
      redraw,
      satellite: () => (geo ? satellitePoint(geo) : null),
      keyboard: () => keyboardUsed
    };
  }
  function release(reason) {
    machine.owner = null;
    if(window.EYES_IOS_ABILITIES){
      getHost()?.resetInput?.();
      wheel.open=false; wheel.u=0; wheel.from=0; wheel.dur=0; wheel.lastToggle=0;
    }
    machine.state = 'SAFE_CLEANUP';
    go('IDLE', reason);
    if (keyboardUsed) setTimeout(() => { const s = $('abilitySatellite'); if (s && !s.hidden) s.focus({ preventScroll: true }); }, 60);
  }
  function cleanup(reason) {
    const owner = machine.owner;
    go('SAFE_CLEANUP', reason);
    if (owner) { try { owner.interrupt && owner.interrupt('cleanup'); } catch {} }
    machine.owner = null;
    wheel.open = false; wheel.u = 0; wheel.from = 0;
    if(window.EYES_IOS_ABILITIES){getHost()?.resetInput?.();wheel.dur=0;wheel.lastToggle=0;}
    go('IDLE', reason);
  }

  // ---------- DOM: satellite button, wheel items, outside-tap catcher ----------
  function ensureDom() {
    if ($('abilitySatellite')) return;
    const home = $('home');
    if (!home) return;
    const sat = document.createElement('button');
    sat.id = 'abilitySatellite';
    sat.type = 'button';
    sat.hidden = true;
    sat.setAttribute('aria-label', 'Abilities');
    sat.setAttribute('aria-haspopup', 'menu');
    sat.setAttribute('aria-expanded', 'false');
    sat.setAttribute('aria-controls', 'abilityWheel');
    sat.addEventListener('pointerdown', (e) => e.stopPropagation());
    sat.addEventListener('click', (e) => {
      e.stopPropagation();
      if (machine.state === 'WHEEL_OPEN') closeWheel('satellite');
      else openWheel();
    });
    const catcher = document.createElement('div');
    catcher.id = 'abilityCatcher';
    catcher.hidden = true;
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) catcher.addEventListener(type, (e) => e.stopPropagation());
    catcher.addEventListener('click', (e) => { e.stopPropagation(); closeWheel('outside'); });
    const menu = document.createElement('div');
    menu.id = 'abilityWheel';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Abilities');
    menu.hidden = true;
    menu.addEventListener('keydown', onMenuKey);
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) menu.addEventListener(type, (e) => e.stopPropagation());
    home.append(catcher, menu, sat);
    addEventListener('keydown', () => (keyboardUsed = true), true);
    // Escape closes the wheel wherever focus is (the satellite itself, or nothing)
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && machine.state === 'WHEEL_OPEN' && !e.defaultPrevented) { e.preventDefault(); closeWheel('escape'); } });
    addEventListener('pointerdown', () => (keyboardUsed = false), true);
    // On iPhone, dismiss the wheel without consuming touches meant for Eye Contact,
    // Eye Dex, Play, or the Eye. The old full-screen catcher stole these taps.
    if (window.EYES_IOS_ABILITIES) {
      document.addEventListener('pointerdown', (event) => {
        if (machine.state !== 'WHEEL_OPEN') return;
        const target = event.target;
        if (target && (target.closest?.('#abilityWheel') || target.closest?.('#abilitySatellite'))) return;
        closeWheel('outside-pass-through');
      }, true);
    }
  }
  function buildWheelDom() {
    const menu = $('abilityWheel');
    menu.replaceChildren();
    wheel.items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ability-item';
      b.setAttribute('role', 'menuitem');
      b.setAttribute('aria-label', it.ability.label);
      b.tabIndex = i === 0 ? 0 : -1;
      b.dataset.ability = it.ability.id;
      const label = document.createElement('span');
      label.className = 'ability-label';
      label.textContent = it.ability.label;
      b.append(label);
      it.labelEl = label;
      b.addEventListener('click', (e) => { e.stopPropagation(); select(it.ability); });
      it.button = b;
      menu.append(b);
    });
    positionWheelDom(0);
  }
  function focusItem(i) {
    const n = wheel.items.length;
    if (!n) return;
    wheel.focusIndex = (i + n) % n;
    wheel.items.forEach((it, k) => { if (it.button) it.button.tabIndex = k === wheel.focusIndex ? 0 : -1; });
    const b = wheel.items[wheel.focusIndex].button;
    if (b) b.focus({ preventScroll: true });
  }
  function onMenuKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeWheel('escape'); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusItem(wheel.focusIndex + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focusItem(wheel.focusIndex - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusItem(0); }
    else if (e.key === 'End') { e.preventDefault(); focusItem(wheel.items.length - 1); }
    else if (e.key === 'Tab') { e.preventDefault(); focusItem(wheel.focusIndex + (e.shiftKey ? -1 : 1)); }
  }
  function positionWheelDom(u) {
    for (const it of wheel.items) {
      if (!it.button) continue;
      const vis = u > 0.6;
      it.button.style.left = it.x + 'px';
      it.button.style.top = it.y + 'px';
      it.button.style.opacity = String(clamp((u - 0.55) / 0.45));
      it.button.disabled = !wheel.open; // never silently discard a tap during the unfold animation
      const below = it.y > (geo ? geo.cy : 0);
      it.button.classList.toggle('above-eye', !below);
      // 4.6.6: the label sits where the layout search put it (outward from the Eye), possibly on two lines
      const lab = it.labelEl, L = it.label;
      if (lab && L) {
        lab.style.left = (ITEM_R + L.dx) + 'px';
        lab.style.top = (ITEM_R + L.dy) + 'px';
        lab.style.bottom = 'auto';
        lab.style.width = L.w + 'px';
        lab.classList.toggle('two-line', L.lines > 1);
      }

    }
  }
  function syncDom() {
    ensureDom();
    const sat = $('abilitySatellite'), menu = $('abilityWheel'), catcher = $('abilityCatcher');
    if (!sat) return;
    const open = machine.state === 'WHEEL_OPEN';
    sat.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    catcher.hidden = !open;
  }

  // ---------- painting into the Eye's canvas ----------
  const iconCache = new Map();
  function iconPath(d) {
    if (!iconCache.has(d)) { try { iconCache.set(d, new Path2D(d)); } catch { iconCache.set(d, null); } }
    return iconCache.get(d);
  }
  function paintSatellite(ctx, g, t, brightness) {
    const p = satellitePoint(g);
    const breath = g.motion ? 0.5 + 0.5 * Math.sin(t / 1900) : 0.5;
    const r = 2.6 + breath * 0.5 + brightness * 1.4;
    ctx.save();
    // a hair-thin filament back toward the Eye, so it reads as part of him
    const dx = g.cx - p.x, dy = g.cy - p.y, len = Math.hypot(dx, dy) || 1;
    const fx = p.x + (dx / len) * 13, fy = p.y + (dy / len) * 13;
    const fl = ctx.createLinearGradient(p.x, p.y, fx, fy);
    fl.addColorStop(0, g.tint(0.95, 0.22 + 0.25 * brightness));
    fl.addColorStop(1, g.tint(0.9, 0));
    ctx.strokeStyle = fl; ctx.lineWidth = 1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(fx, fy); ctx.stroke();
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4.2);
    halo.addColorStop(0, g.tint(1.1, 0.34 + 0.12 * breath + 0.3 * brightness));
    halo.addColorStop(0.35, g.tint(0.95, 0.1 + 0.05 * breath + 0.12 * brightness));
    halo.addColorStop(1, g.tint(0.9, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(p.x, p.y, r * 4.2, 0, TAU); ctx.fill();
    const core = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, 0, p.x, p.y, r);
    core.addColorStop(0, `rgba(240,255,252,${0.75 + 0.2 * brightness})`);
    core.addColorStop(1, g.tint(1, 0.55 + 0.3 * brightness));
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    ctx.restore();
    return p;
  }
  function paintWheel(ctx, g, u) {
    if (u <= 0.001 || !wheel.items.length) return;
    const cx = g.cx, cy = g.cy, R = wheel.radius;
    const last = wheel.items[wheel.items.length - 1];
    const a0 = wheel.angle, a1 = last.a;
    const sat = satellitePoint(g);
    ctx.save();
    ctx.lineCap = 'round';
    // the tendril: from the satellite it curls out onto the wheel's arc, growing with u
    const grow = clamp(u / 0.85);
    const steps = 28;
    ctx.beginPath();
    for (let i = 0; i <= steps * grow; i++) {
      const s = i / steps;
      const a = mix(a0, a1, s), rr = mix(wheel.satR, R, Math.sin(Math.min(1, s * 1.6) * Math.PI / 2));
      const sxk = mix(1, wheel.sx || 1, Math.sin(Math.min(1, s * 1.6) * Math.PI / 2)), x = cx + Math.cos(a) * rr * sxk, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(sat.x, sat.y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = g.tint(0.95, 0.32 * u);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // the abilities bud from the tendril
    for (const it of wheel.items) {
      const local = clamp((u - 0.45) / 0.55);
      if (local <= 0) continue;
      const pop = easeOut(local), r = 19 * (0.6 + 0.4 * pop);
      const halo = ctx.createRadialGradient(it.x, it.y, r * 0.6, it.x, it.y, r * 2);
      halo.addColorStop(0, g.tint(0.9, 0.16 * pop)); halo.addColorStop(1, g.tint(0.9, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(it.x, it.y, r * 2, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(4,12,15,${0.72 * pop})`;
      ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = g.tint(1, 0.7 * pop); ctx.lineWidth = 1.2; ctx.stroke();
      const path = iconPath(it.ability.icon);
      if (path) {
        ctx.save();
        ctx.translate(it.x, it.y); ctx.scale(r / 15, r / 15); ctx.translate(-12, -12);
        ctx.strokeStyle = g.tint(1.15, 0.95 * pop); ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
        ctx.stroke(path);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // called by launcher.js draw() after the Eye is painted
  function frame(ctx, g) {
    ensureDom();
    geo = g;
    const t = ms();
    lastPaintT = t;
    const h = getHost();
    const blocked = !h ? 'nohost' : h.blocked();
    // a panel, scene, game or anything exclusive took over: put the wheel away at once
    // In iOS Safari pointerdown and click can span several paint frames. The host's
    // transient 'touch' block must not retract a wheel under the user's finger.
    // The capture listener still dismisses the wheel immediately for outside taps.
    const wheelTouch = window.EYES_WEB && blocked === 'touch' && (machine.state === 'WHEEL_OPEN' || (machine.state === 'IDLE' && satShown));
    if (blocked && !wheelTouch && machine.state === 'WHEEL_OPEN') closeWheel('blocked', true);
    const list = machine.owner ? [] : availableAbilities();
    const showSat = (!blocked || wheelTouch) && !machine.owner && list.length > 0;
    const u = wheelU(t);
    wheel.u = u;
    if (machine.state === 'WHEEL_OPEN' && wheel.items.length) layoutWheel(g);
    const sat = $('abilitySatellite');
    if (showSat) {
      const p = paintSatellite(ctx, g, t, u);
      if (sat) { sat.style.left = p.x + 'px'; sat.style.top = p.y + 'px'; }
    }
    if (sat && sat.hidden === showSat) sat.hidden = !showSat;
    satShown = showSat;
    if (u > 0.001) paintWheel(ctx, g, u);
    positionWheelDom(u);
    if (machine.owner && machine.owner.frame) { try { machine.owner.frame(ctx, g); } catch (err) { cleanup('frame-error'); } }
    // 4.4.6: idle touches (weather moments) only while nothing owns the iris and the home screen is free
    else if (!machine.owner && machine.state === 'IDLE' && !blocked) for (const a of ambients) { try { a.frame(ctx, g); } catch {} }
  }
  // what the ability wants from the Eye this frame (null while idle: the Eye is left exactly as it was)
  function pose(t) {
    if (machine.owner && machine.owner.pose) { try { return machine.owner.pose(t) || null; } catch { return null; } }
    return null;
  }
  function fps(t, opts) {
    const low = !!(opts && opts.lowPower);
    const u = wheelU(t);
    const wheelMoving = (wheel.open && u < 0.999) || (!wheel.open && u > 0.001);
    let f = wheelMoving ? (low ? 30 : 45) : 0;
    if (machine.owner && machine.owner.fps) { try { f = Math.max(f, machine.owner.fps(t, low) || 0); } catch {} }
    else if (!machine.owner && machine.state === 'IDLE') for (const a of ambients) { try { f = Math.max(f, (a.fps && a.fps(t, low)) || 0); } catch {} }
    return f;
  }

  // ---------- outside events ----------
  function back() {
    if (machine.state === 'WHEEL_OPEN') return closeWheel('back');
    if (machine.owner && machine.owner.back) { try { return !!machine.owner.back(); } catch { cleanup('back-error'); return true; } }
    return false;
  }
  function interrupt(reason) {
    // a panel or scene is taking the screen: the satellite goes at once, not on the next painted frame
    const sat = $('abilitySatellite');
    if (sat && reason !== 'home') { sat.hidden = true; satShown = false; }
    if (machine.state === 'WHEEL_OPEN') closeWheel(reason, true);
    if (machine.owner && machine.owner.interrupt) { try { machine.owner.interrupt(reason); } catch { cleanup('interrupt-error'); } }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (machine.state === 'WHEEL_OPEN') closeWheel('hidden', true);
    if (machine.owner && machine.owner.suspend) { try { machine.owner.suspend('hidden'); } catch { cleanup('suspend-error'); } }
  });
  addEventListener('resize', () => { if (machine.state === 'WHEEL_OPEN') closeWheel('resize', true); });

  // 4.4.5: claim the iris without the wheel, only when the home screen is free and only for a state the
  // ability listed in `claims`. Returns the same api activate() gets, or null.
  function claim(id, state, reason) {
    const a = registry.find((x) => x.id === id);
    if (!a || !Array.isArray(a.claims) || !a.claims.includes(state)) return null;
    if (machine.state !== 'IDLE' || machine.owner) return null;
    const h = getHost();
    if (!h || h.blocked()) return null;
    machine.owner = a;
    machine.claiming = state;
    const ok = go(state, reason || 'claim');
    machine.claiming = null;
    if (!ok) { machine.owner = null; return null; }
    return api(a);
  }

  // 4.4.6: open an ability without the wheel (the home-screen temperature opens Weather). Same rules as the
  // wheel: only when the home screen is free and nothing owns the iris.
  function launch(id, reason) {
    const a = registry.find((x) => x.id === id);
    if (!a || machine.owner) return false;
    if (machine.state === 'WHEEL_OPEN') closeWheel('launch', true);
    if (machine.state !== 'IDLE') return false;
    const h = getHost();
    if (!h || h.blocked()) return false;
    try { if (a.available && !a.available()) return false; } catch { return false; }
    machine.owner = a;
    machine.launching = a.entry;
    const ok = go(a.entry, reason || 'launch');
    machine.launching = null;
    if (!ok) { machine.owner = null; return false; }
    try { a.activate(api(a), { chip: reason === 'chip', launched: true }); } catch (err) { cleanup('activate-failed'); return false; }
    return true;
  }
  function ambient(painter) {
    if (!painter || typeof painter.frame !== 'function' || ambients.some((p) => p.id && p.id === painter.id)) return false;
    ambients.push(painter);
    return true;
  }

  function register(ability) {
    if (!ability || !ability.id || registry.some((a) => a.id === ability.id)) return false;
    if (!ability.entry || typeof ability.activate !== 'function') return false;
    registry.push(ability);
    redraw();
    return true;
  }

  window.EyesAbility = {
    register,
    claim,
    launch,
    ambient,
    frame,
    pose,
    fps,
    back,
    interrupt,
    owner: () => (machine.owner ? machine.owner.id : null),
    state: () => machine.state,
    open: openWheel,
    close: () => closeWheel('api'),
    busy: (t) => fps(t) > 0,
    diagnostics: () => ({
      state: machine.state,
      owner: machine.owner ? machine.owner.id : null,
      abilities: registry.map((a) => a.id),
      ambients: ambients.map((a) => a.id || '?'),
      available: availableAbilities().map((a) => a.id),
      satellite: satShown,
      wheel: { open: wheel.open, u: Math.round(wheel.u * 100) / 100, items: wheel.items.map((i) => ({ id: i.ability.id, x: Math.round(i.x), y: Math.round(i.y), label: i.label ? { x: Math.round(i.label.x), y: Math.round(i.label.y), w: i.label.w, h: i.label.h } : null })), fit: !!wheel.fit, labelMode: wheel.labelMode || null, sx: wheel.sx || 1 },
      transitions: machine.transitions,
      refused: machine.refused,
      history: machine.history.slice(-12)
    })
  };
})();
