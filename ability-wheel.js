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
  function layoutWheel(g) {
    const items = wheel.items, n = items.length;
    const sat = satellitePoint(g);
    const cx = g.cx, cy = g.cy;
    const base = Math.atan2(sat.y - cy, sat.x - cx);
    const satR = Math.hypot(sat.x - cx, sat.y - cy);
    const inset = g.insets || { top: 0, bottom: 0 };
    const margin = 30;
    const fits = (pts) => pts.every((p) => p.x > margin && p.x < g.w - margin && p.y > inset.top + margin && p.y < g.h - inset.bottom - margin);
    const spacing = 0.56;   // radians between abilities (about 34°)
    // first try the roomy arc clockwise, then the other way, then tighter arcs, until every ability is on screen
    const place = (radius, dir) => items.map((_, i) => {
      const a = base + dir * (0.5 + i * spacing);
      return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, a };
    });
    let best = null;
    search: for (const radius of [satR * 1.28, satR * 1.16, satR * 1.06])
      for (const dir of [1, -1]) {
        const pts = place(radius, dir);
        if (fits(pts)) { best = { pts, radius, dir }; break search; }
      }
    if (!best) best = { pts: place(satR * 1.06, 1), radius: satR * 1.06, dir: 1 };
    wheel.angle = base; wheel.radius = best.radius; wheel.dir = best.dir; wheel.satR = satR;
    items.forEach((it, i) => { it.x = best.pts[i].x; it.y = best.pts[i].y; it.a = best.pts[i].a; });
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
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
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
    if (blocked && machine.state === 'WHEEL_OPEN') closeWheel('blocked', true);
    const list = machine.owner ? [] : availableAbilities();
    const showSat = !blocked && !machine.owner && list.length > 0;
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
      wheel: { open: wheel.open, u: Math.round(wheel.u * 100) / 100, items: wheel.items.map((i) => ({ id: i.ability.id, x: Math.round(i.x), y: Math.round(i.y) })) },
      transitions: machine.transitions,
      refused: machine.refused,
      history: machine.history.slice(-12)
    })
  };
})();
