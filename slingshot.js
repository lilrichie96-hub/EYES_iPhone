/* EYES 5.1 · Slingshot (Free Roam). A utility ability: pull the Eye back in a slingshot and let go, and he
   flies to a paired computer and lives there for a while; call him back and he comes home.

   Everything is the real creature: the launcher paints him with his own DNA and skin (eye-render.js); this
   file only shapes his pose (dx, dy, squash/stretch, tilt, pupil, glow, lids) and paints the slingshot, the
   elastic, the trail and the empty socket into the Eye's canvas. No new art.

   States (central machine in ability-wheel.js):
     SLING_OPEN -> SLING_PULL -> SLING_HOLD -> SLING_FIRE -> AWAY -> RECALL -> ARRIVE -> IDLE
     SLING_PULL -> SLING_OPEN (short pull / cancel)      SLING_HOLD -> SLING_REBOUND -> SLING_OPEN (no answer)
     SLING_OPEN <-> PAIRING      SLING_OPEN | PAIRING -> SLING_CLOSING -> IDLE      AWAY is also claimable at boot.
   Promises kept: he disappears only after the computer said ready AND the server committed the move; a
   failure rebounds him with a clear retry; nothing blocks input for long (every wait is bounded); reduced
   motion and buttons do everything gestures do. The camera is never opened here: "Aim with camera" hands
   over to Vision, whose own lifecycle starts and stops it. */
'use strict';
(function (root) {
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeIn = (x) => Math.pow(clamp(x), 3);
  const ms = () => performance.now();
  const R = () => root.EyesRoam;
  const ICON = 'M7 21v-6.5M7 14.5 3.6 6.2M7 14.5l3.4-8.3M3.6 6.2c3 2.4 5.6 2.6 8.4 2.2M10.4 6.2c2.2.9 4.4.8 6.2-.6M16.6 5.6a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0M18.5 9.6l-1 2.2M20.6 10l.4 2.4';
  const STATES = {
    SLING_OPEN: ['SLING_PULL', 'SLING_HOLD', 'PAIRING', 'SLING_CLOSING'],
    SLING_PULL: ['SLING_OPEN', 'SLING_HOLD', 'SLING_CLOSING'],
    SLING_HOLD: ['SLING_FIRE', 'SLING_REBOUND'],
    SLING_FIRE: ['AWAY'],
    SLING_REBOUND: ['SLING_OPEN', 'SLING_CLOSING'],
    PAIRING: ['SLING_OPEN', 'SLING_CLOSING'],
    AWAY: ['RECALL', 'ARRIVE'],
    RECALL: ['AWAY', 'ARRIVE'],
    ARRIVE: [],
    SLING_CLOSING: []
  };
  const nativeV = () => root.EyesVisionNative || null;
  // haptics only where EYES' Android bridge is present (same rule as Vision); never on iPhone
  const buzz = (p) => { if (!nativeV() || S.gentleHaptics) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

  // ---------------------------------------------------------------- state
  const S = {
    api: null, state: 'IDLE', at: 0, el: null, g: null,
    target: null, devices: {}, presence: {}, P: null, readyP: null, ready: '', abort: null,
    pull: null, aim: { x: 0, y: -1 }, tension: 0, ticks: 0,
    fire: null, rebound: null, arrive: null, pulses: [], trail: [], note: '', away: null,
    pollTimer: 0, recallTimer: 0, waitUntil: 0, pairInfo: null, pairAbort: null, gentleHaptics: false,
    stats: { opened: 0, launched: 0, rebounds: 0, recalls: 0, arrivals: 0, cancels: 0 }
  };
  // a small spring body for his pose
  const B = { dx: 0, dy: 0, vdx: 0, vdy: 0, sq: 0, vsq: 0, tilt: 0, vt: 0, scale: 1, vs: 0, pupil: 1, glow: 1, lid: 0, gx: 0, gy: 0, tdx: 0, tdy: 0, ttilt: 0, tscale: 1, tpupil: 1, tglow: 1, tlid: 0, tgx: 0, tgy: 0, stretch: 0, stretchA: 0 };
  function resetBody() { Object.assign(B, { dx: 0, dy: 0, vdx: 0, vdy: 0, sq: 0, vsq: 0, tilt: 0, vt: 0, scale: 1, vs: 0, pupil: 1, glow: 1, lid: 0, gx: 0, gy: 0, tdx: 0, tdy: 0, ttilt: 0, tscale: 1, tpupil: 1, tglow: 1, tlid: 0, tgx: 0, tgy: 0, stretch: 0, stretchA: 0 }); }
  let lastStep = 0;
  function stepBody(dt) {
    const k = S.gentle ? 90 : 170, d = S.gentle ? 16 : 19;
    const spr = (x, v, to, kk = k, dd = d) => { v += (-kk * (x - to) - dd * v) * dt; return [x + v * dt, v]; };
    if (!S.pull && !S.fire && !S.arrive) {
      [B.dx, B.vdx] = spr(B.dx, B.vdx, B.tdx);
      [B.dy, B.vdy] = spr(B.dy, B.vdy, B.tdy);
    }
    [B.sq, B.vsq] = spr(B.sq, B.vsq, 0, 260, 12);
    [B.tilt, B.vt] = spr(B.tilt, B.vt, B.ttilt, 120, 14);
    if (!S.fire && !S.arrive) [B.scale, B.vs] = spr(B.scale, B.vs, B.tscale, 200, 18);
    const f = clamp(dt * 8);
    B.pupil = mix(B.pupil, B.tpupil, f); B.glow = mix(B.glow, B.tglow, f); B.lid = mix(B.lid, B.tlid, f);
    B.gx = mix(B.gx, B.tgx, clamp(dt * 10)); B.gy = mix(B.gy, B.tgy, clamp(dt * 10));
  }
  const host = () => (S.api ? S.api.host() : (root.Haven && Haven.abilityHost ? Haven.abilityHost() : null));
  const motion = () => { const h = host(); return h ? h.motion() : true; };
  const gentle = () => { const h = host(); return h ? h.gentle() : false; };
  const redraw = () => { if (S.api) S.api.redraw(); };
  const say = (text, sticky) => {
    const l = S.el && S.el.querySelector('.sl-line');
    if (!l) return;
    l.textContent = text || '';
    l.classList.toggle('show', !!text);
    clearTimeout(say.t);
    if (text && !sticky) say.t = setTimeout(() => l.classList.remove('show'), 4200);
  };
  const go = (to, why) => {
    if (!S.api || !S.api.go(to, why)) return false;
    S.state = to; S.at = ms();
    if (S.el) S.el.dataset.state = to;
    syncDom();
    redraw();
    return true;
  };
  const feel = (kind, data) => { try { if (root.EyesFeel) EyesFeel.report(kind, data); } catch (e) {} };

  // ---------------------------------------------------------------- DOM (touch layer + accessible controls)
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'text') e.textContent = v; else if (k === 'hidden') e.hidden = !!v; else e.setAttribute(k, v);
    }
    for (const c of kids) if (c) e.append(c);
    return e;
  }
  function build() {
    if (S.el) return S.el;
    const root_ = el('div', { id: 'eyesSling', class: 'sl', role: 'dialog', 'aria-label': 'Slingshot' });
    root_.innerHTML = `
      <div class="sl-top"><span></span><button type="button" class="sl-icon sl-close" aria-label="Close Slingshot"><span aria-hidden="true">×</span></button></div>
      <p class="sl-line" role="status" aria-live="polite"></p>
      <div class="sl-catch" aria-hidden="true"></div>
      <div class="sl-card sl-main">
        <p class="sl-eyebrow">Slingshot</p>
        <div class="sl-targets" role="radiogroup" aria-label="Send him to"></div>
        <p class="sl-hint">Pull him back and let go.</p>
        <div class="sl-actions">
          <button type="button" class="sl-btn primary sl-launch">Launch</button>
          <button type="button" class="sl-btn sl-aim">Aim with camera</button>
        </div>
        <button type="button" class="sl-link sl-pairbtn">Pair a computer</button>
      </div>
      <div class="sl-card sl-pair" hidden>
        <p class="sl-eyebrow">Pair a computer</p>
        <div class="sl-pair-body"></div>
        <div class="sl-actions sl-pair-actions"></div>
      </div>
      <div class="sl-away" hidden>
        <p class="sl-away-where"></p>
        <p class="sl-away-note"></p>
        <button type="button" class="sl-btn primary sl-recall">Call him home</button>
        <button type="button" class="sl-link sl-journal">His journal</button>
        <button type="button" class="sl-socket" aria-label="Call him home"></button>
      </div>`;
    document.body.appendChild(root_);
    S.el = root_;
    root_.querySelector('.sl-close').addEventListener('click', (e) => { e.stopPropagation(); close('button'); });
    root_.querySelector('.sl-launch').addEventListener('click', (e) => { e.stopPropagation(); buttonLaunch(); });
    root_.querySelector('.sl-aim').addEventListener('click', (e) => { e.stopPropagation(); aimWithCamera(); });
    root_.querySelector('.sl-pairbtn').addEventListener('click', (e) => { e.stopPropagation(); openPairing(); });
    root_.querySelector('.sl-recall').addEventListener('click', (e) => { e.stopPropagation(); recall(); });
    root_.querySelector('.sl-socket').addEventListener('click', (e) => { e.stopPropagation(); recall(); });
    root_.querySelector('.sl-journal').addEventListener('click', (e) => { e.stopPropagation(); if (root.EyesJournal) EyesJournal.open('lately'); });   // 5.3
    const c = root_.querySelector('.sl-catch');
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', cancelPull);
    c.addEventListener('lostpointercapture', (e) => { if (S.pull && S.pull.id === e.pointerId) up(e); });
    requestAnimationFrame(() => root_.classList.add('sl-in'));
    return root_;
  }
  function syncDom() {
    const e = S.el;
    if (!e) return;
    const st = S.state, away = st === 'AWAY' || st === 'RECALL';
    e.classList.toggle('sl-away-mode', away || st === 'ARRIVE');
    e.querySelector('.sl-main').hidden = !(st === 'SLING_OPEN' || st === 'SLING_PULL' || st === 'SLING_HOLD' || st === 'SLING_REBOUND');
    e.querySelector('.sl-pair').hidden = st !== 'PAIRING';
    e.querySelector('.sl-away').hidden = !away;
    e.querySelector('.sl-top').hidden = away || st === 'ARRIVE' || st === 'SLING_FIRE';
    e.querySelector('.sl-catch').style.pointerEvents = st === 'SLING_OPEN' || st === 'SLING_PULL' ? 'auto' : 'none';
    const busy = st === 'SLING_HOLD' || st === 'SLING_FIRE' || st === 'SLING_REBOUND';
    e.querySelectorAll('.sl-main button').forEach((b) => { b.disabled = busy; });
    const launch = e.querySelector('.sl-launch');
    launch.disabled = busy || !S.target;
    const rb = e.querySelector('.sl-recall');
    rb.disabled = st === 'RECALL';
    rb.textContent = st === 'RECALL' ? 'Calling him home…' : 'Call him home';
    if (away) {
      const name = (S.away && S.away.name) || 'your computer';
      e.querySelector('.sl-away-where').textContent = 'Exploring ' + name;
      e.querySelector('.sl-away-note').textContent = S.note || '';
    }
  }
  function renderTargets() {
    const box = S.el && S.el.querySelector('.sl-targets');
    if (!box) return;
    box.replaceChildren();
    const ids = Object.keys(S.devices);
    if (!ids.length) {
      box.append(el('p', { class: 'sl-empty', text: 'No computer paired yet. Pair one to send him exploring.' }));
      S.target = null;
    }
    if (S.target && !S.devices[S.target]) S.target = null;
    if (!S.target && ids.length) S.target = (R().cached().last && S.devices[R().cached().last]) ? R().cached().last : ids[0];
    for (const id of ids) {
      const p = S.presence[id];
      const state = id === S.target && S.ready === 'ready' ? 'ready' : p ? (p.online ? 'online' : 'offline') : 'checking';
      const chip = el('button', { type: 'button', class: 'sl-chip' + (id === S.target ? ' on' : ''), role: 'radio', 'aria-checked': String(id === S.target), 'data-state': state },
        el('span', { class: 'sl-dot', 'aria-hidden': 'true' }), el('span', { class: 'sl-chip-name', text: S.devices[id].name }),
        el('span', { class: 'sl-chip-state', text: { ready: 'ready', online: 'awake', offline: 'not running', checking: '…' }[state] }));
      chip.addEventListener('click', (ev) => { ev.stopPropagation(); select(id); });
      box.append(chip);
    }
    syncDom();
  }
  function select(id) {
    if (S.state !== 'SLING_OPEN' || !S.devices[id]) return;
    if (S.target !== id) dropPrepared();
    S.target = id;
    S.ready = '';
    renderTargets();
    lockOn();
  }

  // ---------------------------------------------------------------- open / close
  function activate(api, opts) {
    S.api = api;
    S.gentle = gentle();
    S.stats.opened++;
    resetBody();
    build();
    S.el.classList.toggle('sl-gentle', S.gentle);
    const away = R() && R().cached().away;
    if (away) {           // opened from the wheel while the record says he is away (shouldn't happen): show away
      enterAway({ device: away.device, name: deviceName(away.device) }, 'open');
      return;
    }
    go('SLING_OPEN', 'open');
    S.devices = (R() && R().cached().devices) || {};
    renderTargets();
    // he settles back into the pouch: a little lower, attentive, looking up the way he'd fly
    B.tdy = 0; B.tpupil = 1.08; B.tgx = 0; B.tgy = -0.55; B.sq = -0.06;
    say(Object.keys(S.devices).length ? 'Pick where he goes, then pull him back.' : 'Pair a computer first.', false);
    refreshDevices();
    if (opts && opts.code) setTimeout(() => handleCode(opts.code), 60);
  }
  async function refreshDevices() {
    try {
      S.devices = await R().devices(true);
      renderTargets();
      lockOn();
    } catch (e) { if (e.code === 'offline') say("You're offline. He can explore again when you're back online.", true); }
  }
  async function lockOn() {
    const id = S.target;
    if (!id) return;
    try {
      const p = await R().presence(id);
      S.presence[id] = p;
      renderTargets();
      if (S.target === id && p.online) { S.lock = ms(); B.tpupil = 0.92; buzz(6); redraw(); }
    } catch (e) { S.presence[id] = { online: false }; renderTargets(); }
  }
  function deviceName(id) {
    const d = (S.devices[id]) || ((R() && R().cached().devices) || {})[id];
    return d ? d.name : 'your computer';
  }
  function close(reason) {
    if (!S.api || !['SLING_OPEN', 'PAIRING', 'SLING_REBOUND', 'SLING_PULL'].includes(S.state)) return false;
    dropPrepared();
    if (S.pairAbort) S.pairAbort.abort();
    S.pull = null;
    if (!go('SLING_CLOSING', reason)) return false;
    S.el && S.el.classList.remove('sl-in');
    B.tdy = 0; B.tgx = 0; B.tgy = 0; B.tpupil = 1;
    const api = S.api;
    setTimeout(() => { teardown(); api.done(reason || 'closed'); }, S.gentle ? 340 : 240);
    return true;
  }
  function teardown() {
    clearTimeout(S.pollTimer); clearTimeout(S.recallTimer);
    if (S.el) { S.el.remove(); S.el = null; }
    S.pull = null; S.fire = null; S.arrive = null; S.rebound = null; S.pulses = []; S.trail = [];
    S.state = 'IDLE';
    S.api = null;
  }

  // ---------------------------------------------------------------- pulling
  function home(g) { return { x: g.w * 0.5, y: g.h * 0.49 }; }
  function down(e) {
    if (S.state !== 'SLING_OPEN' || !S.g) return;
    const g = S.g, d = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
    if (d > g.size * 1.35) return;
    if (!S.target) { say(Object.keys(S.devices).length ? 'Choose a computer first.' : 'Pair a computer first.'); return; }
    e.preventDefault();
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    S.pull = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ox: B.dx, oy: B.dy, started: false, t: ms() };
    S.ticks = 0;
    go('SLING_PULL', 'touch');
  }
  function move(e) {
    const P = S.pull;
    if (!P || P.id !== e.pointerId || !S.g) return;
    const g = S.g, max = g.size * 2.1;
    let dx = e.clientX - P.x0 + P.ox, dy = e.clientY - P.y0 + P.oy;
    const len = Math.hypot(dx, dy);
    // elastic: resistance grows with the stretch
    const soft = len > 0 ? max * (1 - Math.exp(-len / max)) / len : 0;
    dx *= soft; dy *= soft;
    B.dx = dx; B.dy = dy;
    const L = Math.hypot(dx, dy);
    S.tension = clamp(L / max);
    if (L > 3) S.aim = { x: -dx / L, y: -dy / L };
    if (!P.started && L > 12) { P.started = true; prepare(); }
    // ticks of tension as it tightens (Android haptics only)
    const tick = Math.floor(S.tension * 3.2);
    if (tick > S.ticks) { S.ticks = tick; buzz(tick >= 3 ? 14 : 7); }
    redraw();
  }
  function up(e) {
    const P = S.pull;
    if (!P || (e && P.id !== e.pointerId)) return;
    S.pull = null;
    if (S.tension < 0.42 || !S.target) return cancelPull();
    release();
  }
  function cancelPull() {
    S.pull = null;
    S.tension = 0;
    B.tdx = 0; B.tdy = 0;
    B.sq = 0.12;                   // a small boing back into place
    S.stats.cancels++;
    dropPrepared();
    if (S.state === 'SLING_PULL') go('SLING_OPEN', 'short-pull');
    say('Pull further to launch him.');
  }
  function prepare() {
    if (S.readyP || !S.target) return;
    const device = S.target, abort = new AbortController();
    S.abort = abort;
    S.ready = 'asking';
    S.readyP = (async () => {
      const P = await R().prepare(device);
      if (abort.signal.aborted) { R().cancel(P); return { ok: false, why: 'cancelled' }; }
      S.P = P;
      const r = await R().awaitReady(P, 9500, abort.signal);
      if (r === 'ready') { S.ready = 'ready'; if (S.state === 'SLING_PULL' || S.state === 'SLING_OPEN') { renderTargets(); buzz(10); } return { ok: true, P }; }
      return { ok: false, why: r, P };
    })().catch((e) => ({ ok: false, why: e.code || 'error', error: e }));
  }
  function dropPrepared() {
    if (S.abort) S.abort.abort();
    if (S.P) R().cancel(S.P);
    S.readyP = null; S.P = null; S.abort = null; S.ready = '';
  }
  function buttonLaunch() {
    if (S.state !== 'SLING_OPEN' || !S.target) return;
    prepare();
    if (!motion()) { S.tension = 1; S.aim = { x: 0, y: -1 }; return release(); }
    // the same gesture, played for you: draw back over half a second, then let go
    go('SLING_PULL', 'button');
    const t0 = ms(), g = S.g, max = g ? g.size * 2.1 : 160;
    S.aim = { x: 0, y: -1 };
    const step = () => {
      if (S.state !== 'SLING_PULL') return;
      const u = clamp((ms() - t0) / (S.gentle ? 700 : 480));
      B.dx = 0; B.dy = easeOut(u) * max * 0.78;
      S.tension = easeOut(u) * 0.78 / 0.63 > 1 ? 1 : easeOut(u);
      redraw();
      if (u < 1) requestAnimationFrame(step); else release();
    };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- release -> hold -> fire | rebound
  async function release() {
    if (!go('SLING_HOLD', 'release')) return;
    prepare();
    S.hold = { t: ms(), x: B.dx, y: B.dy };
    say('Waiting for ' + deviceName(S.target) + '…', true);
    feel('slingshot', { phase: 'release' });
    const started = ms();
    let res = await Promise.race([S.readyP, new Promise((r) => setTimeout(() => r({ ok: false, why: 'timeout' }), 11000))]);
    if (S.state !== 'SLING_HOLD') return;
    if (res.ok) {
      try {
        await R().commitLaunch(res.P);
      } catch (e) {
        res = { ok: false, why: e.code === 'conflict' ? 'conflict' : e.code || 'error', P: res.P };
      }
    }
    // let the compress beat finish so a fast answer still reads as a launch
    const wait = Math.max(0, (S.gentle ? 220 : 150) - (ms() - started));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    if (S.state !== 'SLING_HOLD') return;
    if (res.ok) fire(res.P);
    else rebound(res.why, res.P);
  }
  function fire(P) {
    const g = S.g;
    S.readyP = null; S.P = null; S.abort = null;
    S.stats.launched++;
    S.away = { device: P.device, name: deviceName(P.device), at: Date.now() };
    go('SLING_FIRE', 'committed');
    buzz([10, 30, 22]);
    feel('slingshot', { phase: 'fire' });
    const dist = g ? Math.hypot(g.w, g.h) * 0.75 : 900;
    S.fire = { t: ms(), x0: B.dx, y0: B.dy, dist, dur: motion() ? (S.gentle ? 560 : 420) : 260 };
    say('', false);
  }
  function rebound(why, P) {
    S.stats.rebounds++;
    if (P) R().cancel(P);
    S.readyP = null; S.P = null; S.abort = null; S.ready = '';
    go('SLING_REBOUND', why);
    S.rebound = { t: ms(), x0: B.dx, y0: B.dy };
    buzz([18, 40, 18]);
    const name = deviceName(S.target);
    const msg = {
      'nack:paused': name + ' has EYES paused. Resume it there, then try again.',
      'nack:fullscreen': name + ' is in a full-screen app. Try again when it’s back on the desktop.',
      'nack:hidden': name + ' has him hidden. Show him there, then try again.',
      'nack:already-here': 'He’s already there.',
      'nack:not-ready': name + ' couldn’t get ready. Try again.',
      timeout: name + ' didn’t answer. Is the EYES companion running there?',
      gone: 'That launch expired. Try again.',
      offline: 'You’re offline. He stays home until you’re back online.',
      conflict: 'Something changed meanwhile. Try again.',
      denied: name + ' isn’t paired with this phone any more.',
      away: 'He’s already away.'
    }[why] || 'He bounced back. Try again.';
    say(msg, true);
  }

  // ---------------------------------------------------------------- away
  function enterAway(info, why) {
    S.away = Object.assign({}, S.away, info);
    if (S.state !== 'AWAY') go('AWAY', why);
    B.dx = B.dy = 0; B.scale = 1;
    S.trail = [];
    S.note = S.note || '';
    syncDom();
    schedulePoll(20000);
  }
  function schedulePoll(msFor) {
    clearTimeout(S.pollTimer);
    S.pollTimer = setTimeout(async () => {
      if (S.state !== 'AWAY') return;
      if (document.hidden) return schedulePoll(20000);
      try {
        const w = await R().where();
        if (w.home) return arrive('returned');
        S.note = '';
        syncDom();
      } catch (e) {
        if (e.code === 'offline') { S.note = 'Offline — he’s still on ' + ((S.away && S.away.name) || 'your computer') + '.'; syncDom(); }
      }
      schedulePoll(25000);
    }, msFor);
  }
  async function recall() {
    if (S.state !== 'AWAY') return;
    go('RECALL', 'button');
    S.stats.recalls++;
    S.pulseAt = 0;
    buzz(12);
    S.note = 'Calling him back…';
    syncDom();
    try {
      const r = await R().recall(() => {}, null);
      if (S.state !== 'RECALL') return;
      if (r.home) return arrive('recalled');
      if (r.waiting) {
        const when = new Date(Date.now() + Math.max(0, r.until - R().now()) + 2000);
        S.note = (S.away && S.away.name ? S.away.name : 'Your computer') + ' isn’t answering. He’ll be home by ' + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' at the latest.';
        go('AWAY', 'waiting');
        clearTimeout(S.recallTimer);
        S.recallTimer = setTimeout(() => { if (S.state === 'AWAY') recall(); }, Math.max(1500, r.until - R().now() + 2500));
        syncDom();
      }
    } catch (e) {
      if (S.state !== 'RECALL') return;
      S.note = e.code === 'offline' ? 'You’re offline. Try again when you’re connected.' : 'Couldn’t reach him. Try again.';
      go('AWAY', 'recall-failed');
      syncDom();
    }
  }
  function arrive(why) {
    clearTimeout(S.pollTimer); clearTimeout(S.recallTimer);
    if (!go('ARRIVE', why)) return;
    S.stats.arrivals++;
    S.note = '';
    const g = S.g;
    S.arrive = { t: ms(), from: g ? -(g.h * 0.49 + g.size * 2.2) : -500, dur: motion() ? (S.gentle ? 900 : 760) : 300 };
    // 5.3: while he falls home, look (once, briefly) at what that visit left in his journal; the landing never waits
    try { const lv = R() && R().cached().lastVisit; if (root.EyesHomecoming) EyesHomecoming.expect(lv && lv.tid); } catch (e) {}
    buzz([8, 60, 14]);
    feel('slingshot', { phase: 'arrive' });
    redraw();
  }

  // ---------------------------------------------------------------- pairing
  function openPairing(code) {
    if (S.state !== 'SLING_OPEN' && S.state !== 'PAIRING') return;
    dropPrepared();
    if (S.state !== 'PAIRING') go('PAIRING', 'pair');
    pairStep(code ? 'checking' : 'intro', code);
  }
  function pairStep(step, data) {
    const body = S.el.querySelector('.sl-pair-body'), acts = S.el.querySelector('.sl-pair-actions');
    body.replaceChildren(); acts.replaceChildren();
    const btn = (label, cls, fn) => { const b = el('button', { type: 'button', class: 'sl-btn ' + (cls || ''), text: label }); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); acts.append(b); return b; };
    let focus = null;
    if (step === 'intro') {
      body.append(el('p', { text: 'On the computer, start the EYES companion and choose “Pair with phone”. It shows a code.' }));
      const ids = Object.keys(S.devices);
      if (ids.length) {
        const list = el('div', { class: 'sl-known', role: 'list', 'aria-label': 'Paired computers' });
        for (const id of ids) {
          const forget = el('button', { type: 'button', class: 'sl-link', 'aria-label': 'Forget ' + S.devices[id].name, text: 'Forget' });
          forget.addEventListener('click', async (e) => {
            e.stopPropagation();
            const away = R().cached().away;
            if (away && away.device === id) { say('He’s on that computer right now. Call him home first.', true); return; }
            try { await R().unpair(id); delete S.devices[id]; if (S.target === id) S.target = null; pairStep('intro'); say('Forgot ' + forget.getAttribute('aria-label').slice(7) + '.'); }
            catch (err) { say(err.code === 'offline' ? 'You’re offline.' : 'Couldn’t forget it. Try again.'); }
          });
          list.append(el('div', { class: 'sl-known-row', role: 'listitem' }, el('span', { text: S.devices[id].name }), forget));
        }
        body.append(list);
      }
      if (root.EyesAbility && EyesAbility.order().includes('vision')) focus = btn('Scan with Vision', 'primary', () => aimWithCamera(true));
      const t = btn('Type the code', focus ? '' : 'primary', () => pairStep('type'));
      focus = focus || t;
      btn('Back', '', backToMain);
    } else if (step === 'type') {
      const input = el('input', { type: 'text', class: 'sl-input', inputmode: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Pairing code', placeholder: 'xxxx xxxx xxxx …' });
      body.append(el('p', { text: 'Type the code shown under the QR on the computer (spaces don’t matter).' }), input);
      const go_ = () => handleCode(input.value);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go_(); });
      btn('Continue', 'primary', go_);
      btn('Back', '', () => pairStep('intro'));
      focus = input;
    } else if (step === 'checking') {
      body.append(el('p', { text: 'Checking the code…' }));
      btn('Cancel', '', backToMain);
    } else if (step === 'confirm') {
      const info = data;
      body.append(el('p', { text: 'Pair with “' + info.name + '”?' }),
        el('p', { class: 'sl-code', text: info.code }),
        el('p', { class: 'sl-small', text: 'Check that the computer shows exactly this code before you pair. It will ask for approval too.' }));
      focus = btn('Pair', 'primary', () => doPair(info));
      btn('Cancel', '', backToMain);
    } else if (step === 'waiting') {
      body.append(el('p', { text: 'Now approve on “' + data.name + '”.' }), el('p', { class: 'sl-code', text: data.code }));
      btn('Cancel', '', () => { if (S.pairAbort) S.pairAbort.abort(); backToMain(); });
    } else if (step === 'done') {
      body.append(el('p', { text: 'Paired with “' + data.name + '”. Pull him back and let go to send him there.' }));
      focus = btn('Done', 'primary', backToMain);
    } else if (step === 'error') {
      body.append(el('p', { class: 'sl-warn', text: data }));
      focus = btn('Try again', 'primary', () => pairStep('intro'));
      btn('Back', '', backToMain);
    }
    if (focus && S.api && S.api.keyboard()) setTimeout(() => focus.focus({ preventScroll: true }), 30);
  }
  function backToMain() {
    if (S.state !== 'PAIRING') return;
    go('SLING_OPEN', 'back');
    refreshDevices();
  }
  async function handleCode(text) {
    const target = R().parseTarget(text);
    if (target) {
      if (S.state === 'PAIRING') go('SLING_OPEN', 'aim');
      await refreshDevices();
      if (S.devices[target]) { select(target); say('Aimed at ' + S.devices[target].name + '.'); }
      else say('That computer isn’t paired with this phone. Pair it first.', true);
      return;
    }
    if (S.state === 'SLING_OPEN') go('PAIRING', 'code');
    pairStep('checking');
    try {
      const info = await R().inspect(text);
      if (S.state !== 'PAIRING') return;
      S.pairInfo = info;
      pairStep('confirm', info);
    } catch (e) {
      pairStep('error', e.code === 'offline' ? 'You’re offline. Connect, then try again.' : e.message || 'That code didn’t work.');
    }
  }
  async function doPair(info) {
    S.pairAbort = new AbortController();
    pairStep('waiting', info);
    try {
      await R().pair(info, () => {}, S.pairAbort.signal);
      if (S.state !== 'PAIRING') return;
      S.target = info.device;
      pairStep('done', info);
      buzz([10, 40, 10]);
    } catch (e) {
      if (e.code === 'cancelled' || S.state !== 'PAIRING') return;
      pairStep('error', e.code === 'offline' ? 'You’re offline. Connect, then try again.' : e.message || 'Pairing didn’t finish.');
    }
  }
  // Vision is the camera: close Slingshot, open Vision, and Vision hands any EYESROAM code back to us.
  function aimWithCamera(forPairing) {
    if (!root.EyesAbility) return;
    S.wantCode = forPairing ? 'pair' : 'aim';
    const api = S.api;
    dropPrepared();
    go('SLING_CLOSING', 'to-vision');
    teardown();
    api.done('to-vision');
    setTimeout(() => { if (!EyesAbility.launch('vision', 'slingshot')) say('Vision isn’t available here. Type the code instead.'); }, 30);
  }
  // called by vision.js when it decodes an EYESROAM code (Vision closes itself first)
  function fromCode(text) {
    const tries = Date.now() + 2500;
    const attempt = () => {
      if (root.EyesAbility && EyesAbility.state() === 'IDLE' && EyesAbility.launch('slingshot', 'vision')) {
        setTimeout(() => handleCode(text), 80);
        return;
      }
      if (Date.now() < tries) setTimeout(attempt, 120);
    };
    attempt();
  }

  // ---------------------------------------------------------------- pose: what he looks like this frame
  function pose(t) {
    const now = ms(), dt = Math.min(0.05, Math.max(0, (now - (lastStep || now)) / 1000));
    lastStep = now;
    const st = S.state;
    let vacant = false, reveal = null, neutral = 0.85;
    const g = S.g;
    if (st === 'SLING_PULL' && S.pull) {
      B.tpupil = mix(1.05, 0.7, S.tension); B.tglow = 1 + 0.25 * S.tension; B.tlid = 0.18 * S.tension;
      B.tgx = S.aim.x * 0.9; B.tgy = S.aim.y * 0.9;
    } else if (st === 'SLING_PULL' || st === 'SLING_OPEN') {
      B.tgx = S.aim.x * 0.4 * (st === 'SLING_PULL' ? 2 : 1); B.tgy = st === 'SLING_OPEN' ? -0.5 : S.aim.y * 0.8;
      const lockAge = S.lock ? (now - S.lock) / 1000 : 9;
      B.tpupil = 1.04 - (lockAge < 0.6 ? 0.18 * Math.sin(lockAge / 0.6 * Math.PI) : 0);
    } else if (st === 'SLING_HOLD') {
      // compressed against the pouch, quivering while the other side gets ready
      const age = (now - S.hold.t) / 1000;
      const q = Math.sin(age * 38) * (S.gentle ? 0.6 : 1.4) * (1 - Math.exp(-age * 4));
      B.dx = S.hold.x + S.aim.y * q; B.dy = S.hold.y - S.aim.x * q;
      B.tpupil = 0.7; B.tglow = 1.25; B.tgx = S.aim.x; B.tgy = S.aim.y;
    } else if (st === 'SLING_FIRE' && S.fire) {
      const F = S.fire, u = clamp((now - F.t) / F.dur);
      if (motion()) {
        const e = easeIn(u);
        B.dx = mix(F.x0, S.aim.x * F.dist, e); B.dy = mix(F.y0, S.aim.y * F.dist, e);
        B.scale = mix(1, 0.18, easeIn(u));
        S.trail.push({ x: B.dx, y: B.dy, a: 1, r: 1 - 0.7 * u });
      } else {
        B.scale = mix(1, 0.6, u);
        reveal = { body: Math.max(0.06, 1 - u), iris: 1 - u, pupil: 1 - u, pattern: 1, glass: 1, rare: 1 };
      }
      if (u >= 1) { S.fire = null; enterAway(S.away, 'fired'); }
    } else if (st === 'SLING_REBOUND' && S.rebound) {
      const Rb = S.rebound, u = clamp((now - Rb.t) / (motion() ? 700 : 250));
      if (motion()) {
        // a short hop out along the aim, a wobble, and the spring pulls him home
        const out = Math.sin(clamp(u / 0.45) * Math.PI) * (g ? g.size * 1.1 : 80) * (u < 0.45 ? 1 : 0);
        B.dx = mix(Rb.x0, 0, easeOut(u)) + S.aim.x * out; B.dy = mix(Rb.y0, 0, easeOut(u)) + S.aim.y * out;
        if (u > 0.45 && !Rb.boinged) { Rb.boinged = true; B.sq = 0.22; }
      } else { B.dx = mix(Rb.x0, 0, u); B.dy = mix(Rb.y0, 0, u); }
      B.tpupil = 1.15; B.tlid = 0.25; B.tgx = 0; B.tgy = 0.3;
      if (u >= 1) { S.rebound = null; B.tdx = B.tdy = 0; B.dx = B.dy = 0; B.tlid = 0; go('SLING_OPEN', 'rebounded'); }
    } else if (st === 'AWAY' || st === 'RECALL') {
      vacant = true;
    } else if (st === 'ARRIVE' && S.arrive) {
      const A = S.arrive, u = clamp((now - A.t) / A.dur);
      if (motion()) {
        // falls in from above, squashes, overshoots and settles (fall 40%, then two bounces)
        if (u < 0.4) { const e = easeIn(u / 0.4); B.dy = mix(A.from, 0, e); B.dx = 0; B.scale = mix(0.55, 1, e); B.sq = -0.12 * e; B.tgy = 0.8; }
        else {
          const v = (u - 0.4) / 0.6;
          if (!A.landed) { A.landed = true; B.sq = 0.32; buzz(16); }
          B.dy = -Math.abs(Math.sin(v * Math.PI * 2)) * (g ? g.size * 0.35 : 30) * Math.pow(1 - v, 2); B.scale = 1 + 0.12 * Math.sin(v * Math.PI) * (1 - v);
          B.tgy = mix(0.5, 0, v); B.tgx = Math.sin(v * 9) * 0.3 * (1 - v);
        }
      } else {
        B.dy = 0; B.scale = mix(0.85, 1, u);
        reveal = { body: Math.max(0.06, u), iris: u, pupil: u, pattern: 1, glass: 1, rare: 1 };
      }
      if (u >= 1) {
        S.arrive = null;
        const api = S.api;
        B.dx = B.dy = 0; B.scale = 1;
        teardown();
        if (api) api.done('arrived');
        try { const h = host(); if (h && h.core && h.core.react) h.core.react('happy', h.now()); } catch (e) {}
        try { if (root.EyesHomecoming) EyesHomecoming.landed(); } catch (e) {}
        return null;
      }
    } else if (st === 'SLING_CLOSING') {
      B.tdx = B.tdy = 0; B.tgx = B.tgy = 0;
    }
    stepBody(dt);
    // stretch along the pull: rotate the body to the aim axis, lengthen it, then let the gaze correct the turn
    let tilt = B.tilt, sx = 1 + B.sq * 0.6, sy = 1 - B.sq;
    const pulling = st === 'SLING_PULL' || st === 'SLING_HOLD';
    if (pulling || st === 'SLING_FIRE') {
      const a = Math.atan2(S.aim.y, S.aim.x);
      const k = st === 'SLING_FIRE' ? 0.28 : (st === 'SLING_HOLD' ? 0.22 : 0.3 * S.tension);
      tilt = a; sx = 1 + k; sy = 1 - k * 0.55;
    }
    // gaze is expressed in the body's rotated frame
    const c = Math.cos(-tilt), s = Math.sin(-tilt);
    const gx = B.gx * c - B.gy * s, gy = B.gx * s + B.gy * c;
    const fresh = st !== 'AWAY' && st !== 'RECALL';
    return {
      k: 0, look: fresh ? 1 : 0, gaze: { x: clamp(gx, -1, 1), y: clamp(gy, -1, 1) }, neutral, hush: 1, open: 0, lens: 0, grow: 0, size: 0, pupil: 0, iris: 0,
      pupilK: clamp(B.pupil, 0.45, 1.9), glow: clamp(B.glow, 0.3, 1.8), bodySx: clamp(sx, 0.55, 1.6), bodySy: clamp(sy, 0.55, 1.6),
      lid: clamp(B.lid, 0, 0.9), dx: B.dx, dy: B.dy + (st === 'SLING_OPEN' || pulling ? -0 : 0), tilt, scale: clamp(B.scale, 0.05, 1.6),
      vacant, reveal
    };
  }
  function fps(t, low) {
    const st = S.state;
    if (st === 'IDLE') return 0;
    if (st === 'SLING_PULL' || st === 'SLING_FIRE' || st === 'ARRIVE' || st === 'SLING_HOLD' || st === 'SLING_REBOUND') return low ? 30 : 60;
    if (st === 'RECALL') return low ? 15 : 30;                       // the socket's calling pulse
    if (st === 'AWAY') return S.trail.length ? 30 : 0;               // still: nothing moves in an empty socket
    const springing = Math.abs(B.vdx) + Math.abs(B.vdy) + Math.abs(B.vsq) * 40 + Math.abs(B.dx - B.tdx) + Math.abs(B.dy - B.tdy) > 1.5 || Math.abs(B.gx - B.tgx) + Math.abs(B.gy - B.tgy) > 0.02;
    if (ms() - S.at < 700 || springing) return low ? 30 : 45;
    return low ? 6 : 10;
  }

  // ---------------------------------------------------------------- painting into the Eye's canvas
  function frame(ctx, g) {
    S.g = g;
    const st = S.state, t = ms();
    const H = home(g), size = g.size, tint = g.tint;
    // keep the away card under the empty socket, and out of the way of panels
    if (S.el) {
      const blocked = (() => { const h = host(); return h ? h.blocked() : ''; })();
      S.el.style.visibility = blocked && (st === 'AWAY' || st === 'RECALL') ? 'hidden' : '';
      const card = S.el.querySelector('.sl-away');
      if (card && !card.hidden) card.style.top = (H.y + size * 1.35) + 'px';
      const sock = S.el.querySelector('.sl-socket');
      if (sock) { sock.style.left = (H.x - size) + 'px'; sock.style.top = (H.y - size) + 'px'; sock.style.width = sock.style.height = size * 2 + 'px'; }
    }
    ctx.save();
    if (st === 'SLING_OPEN' || st === 'SLING_PULL' || st === 'SLING_HOLD' || st === 'SLING_REBOUND' || st === 'SLING_FIRE' || st === 'SLING_CLOSING') paintSling(ctx, g, H, st, t);
    if (S.trail.length) paintTrail(ctx, g, H);
    if (st === 'AWAY' || st === 'RECALL' || (st === 'SLING_FIRE' && S.fire && (t - S.fire.t) > S.fire.dur * 0.55)) paintSocket(ctx, g, H, st, t);
    ctx.restore();
  }
  function paintSling(ctx, g, H, st, t) {
    const size = g.size, tint = g.tint;
    const open = st === 'SLING_CLOSING' ? 1 - clamp((t - S.at) / 240) : clamp((t - (S.openedAt || (S.openedAt = t))) / 320);
    if (open <= 0.01) return;
    const a = easeOut(open);
    const fy = H.y + size * 1.02, spread = size * 1.32;
    const L = { x: H.x - spread, y: fy - size * 0.1 }, Rr = { x: H.x + spread, y: fy - size * 0.1 };
    const base = { x: H.x, y: fy + size * 0.85 }, foot = { x: H.x, y: fy + size * 1.55 };
    ctx.globalAlpha = a;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the slingshot sits BEHIND him: everything below is clipped out of his body
    ctx.save();
    if (st !== 'SLING_FIRE' || (S.fire && t - S.fire.t < S.fire.dur * 0.6)) {
      ctx.beginPath(); ctx.rect(0, 0, g.w, g.h);
      ctx.ellipse(g.cx, g.cy, Math.max(1, g.rx * 1.01), Math.max(1, g.ry * 1.01), (g.pose && g.pose.tilt) || 0, 0, TAU);
      ctx.clip('evenodd');
    }
    // the fork: two soft glass strokes rising from a handle, in his own light
    const fork = new Path2D();
    fork.moveTo(foot.x, foot.y); fork.lineTo(base.x, base.y);
    fork.quadraticCurveTo(H.x - spread * 0.2, base.y - size * 0.15, L.x, L.y);
    fork.moveTo(base.x, base.y);
    fork.quadraticCurveTo(H.x + spread * 0.2, base.y - size * 0.15, Rr.x, Rr.y);
    ctx.strokeStyle = tint(0.35, 0.55); ctx.lineWidth = Math.max(5, size * 0.11); ctx.stroke(fork);
    ctx.strokeStyle = tint(0.95, 0.42); ctx.lineWidth = Math.max(1.4, size * 0.028); ctx.stroke(fork);
    for (const p of [L, Rr]) {
      const k = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 0.13);
      k.addColorStop(0, tint(1.2, 0.8)); k.addColorStop(1, tint(0.9, 0));
      ctx.fillStyle = k; ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.13, 0, TAU); ctx.fill();
    }
    // the elastic: from each prong to the back of the eye (the pouch sits opposite the aim)
    const flying = st === 'SLING_FIRE';
    const fu = flying && S.fire ? clamp((t - S.fire.t) / 140) : 0;
    const cx = flying ? mix(H.x + S.fire.x0, H.x, easeOut(fu)) : g.cx, cy = flying ? mix(H.y + S.fire.y0, H.y + size * 0.5, easeOut(fu)) : g.cy;
    const back = { x: cx - S.aim.x * size * 0.92, y: cy - S.aim.y * size * 0.92 };
    const tension = st === 'SLING_HOLD' ? 1 : flying ? 1 - fu : st === 'SLING_PULL' ? S.tension : 0;
    const rest = { x: H.x, y: fy + size * 0.05 };
    const pouch = st === 'SLING_OPEN' || st === 'SLING_REBOUND' || st === 'SLING_CLOSING' ? { x: mix(rest.x, back.x, 0.6), y: Math.max(rest.y, back.y) } : back;
    const w = Math.max(1, size * mix(0.05, 0.022, tension));
    const twang = flying ? Math.sin(fu * 30) * (1 - fu) * size * 0.25 : 0;
    for (const p of [L, Rr]) {
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      const mx = (p.x + pouch.x) / 2 + twang, my = (p.y + pouch.y) / 2 + size * 0.12 * (1 - tension);
      ctx.quadraticCurveTo(mx, my, pouch.x, pouch.y);
      ctx.strokeStyle = tint(1.05, 0.35 + 0.45 * tension); ctx.lineWidth = w; ctx.stroke();
    }
    // pouch cradle
    ctx.beginPath(); ctx.arc(pouch.x, pouch.y, size * 0.2, 0, TAU);
    ctx.fillStyle = tint(0.3, 0.35); ctx.fill();
    ctx.restore();
    // lock-on: a soft ring tightens on the iris when the target is ready
    const ready = S.ready === 'ready' || (S.presence[S.target] && S.presence[S.target].online);
    if (ready && (st === 'SLING_OPEN' || st === 'SLING_PULL' || st === 'SLING_HOLD')) {
      const age = S.lock ? (t - S.lock) / 1000 : 2;
      const r = size * (0.86 + 0.5 * Math.exp(-age * 3) + 0.03 * Math.sin(t / 380));
      ctx.globalAlpha = a * (S.ready === 'ready' ? 0.75 : 0.35);
      ctx.strokeStyle = tint(1.2, 0.6); ctx.lineWidth = 1.2;
      ctx.setLineDash([size * 0.18, size * 0.12]);
      ctx.lineDashOffset = -t / 60;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }
  function paintTrail(ctx, g, H) {
    const size = g.size;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    S.trail = S.trail.filter((p) => (p.a -= 0.09) > 0).slice(-14);
    for (const p of S.trail) {
      const x = H.x + p.x, y = H.y + p.y, r = size * 0.7 * p.r;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, g.tint(1.2, 0.22 * p.a)); grad.addColorStop(1, g.tint(1, 0));
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (S.trail.length) redraw();
  }
  // the empty socket: the glass outline he lives in, dim and still, with a faint ring where his iris sits
  function paintSocket(ctx, g, H, st, t) {
    const size = g.size, tint = g.tint, rx = size, ry = size * 1.055;
    const fade = st === 'SLING_FIRE' && S.fire ? clamp(((t - S.fire.t) / S.fire.dur - 0.55) / 0.45) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    const glow = ctx.createRadialGradient(H.x, H.y, rx * 0.7, H.x, H.y, rx * 1.35);
    glow.addColorStop(0, tint(0.6, 0)); glow.addColorStop(0.5, tint(0.7, 0.05)); glow.addColorStop(1, tint(0.6, 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(H.x, H.y, rx * 1.35, 0, TAU); ctx.fill();
    const inner = ctx.createRadialGradient(H.x, H.y - size * 0.1, size * 0.05, H.x, H.y, rx * 1.05);
    inner.addColorStop(0, tint(0.18, 0.12)); inner.addColorStop(1, tint(0.06, 0.32));
    ctx.fillStyle = inner; ctx.beginPath(); ctx.ellipse(H.x, H.y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = tint(0.9, 0.28); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(H.x, H.y, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = tint(0.8, 0.12); ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.beginPath(); ctx.arc(H.x, H.y, size * 0.62, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // catchlight on the empty glass
    ctx.fillStyle = 'rgba(235,255,252,0.10)';
    ctx.beginPath(); ctx.ellipse(H.x - size * 0.34, H.y - size * 0.42, size * 0.16, size * 0.07, -0.5, 0, TAU); ctx.fill();
    // recall: the socket calls him, pulse after pulse
    if (st === 'RECALL') {
      const period = 900;
      for (let i = 0; i < 2; i++) {
        const u = (((t - S.at) / period) + i * 0.5) % 1;
        ctx.strokeStyle = tint(1.15, 0.5 * (1 - u)); ctx.lineWidth = 1.6 * (1 - u) + 0.4;
        ctx.beginPath(); ctx.ellipse(H.x, H.y, rx * (1 + u * 0.9), ry * (1 + u * 0.9), 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- outside events
  function back() {
    if (S.state === 'PAIRING') { backToMain(); return true; }
    if (S.state === 'SLING_PULL') { cancelPull(); return true; }
    if (S.state === 'SLING_OPEN' || S.state === 'SLING_REBOUND') { close('back'); return true; }
    if (S.state === 'SLING_HOLD' || S.state === 'SLING_FIRE' || S.state === 'ARRIVE' || S.state === 'SLING_CLOSING') return true;   // a beat; it ends by itself
    return false;                                          // away: Back belongs to the launcher
  }
  function interrupt(reason) {
    // a panel, scene or exclusive mode: a pull is dropped (nothing was committed); away stays away
    if (S.state === 'SLING_PULL') cancelPull();
    if (S.state === 'SLING_OPEN' || S.state === 'PAIRING' || S.state === 'SLING_REBOUND') close(reason || 'interrupt');
  }
  function suspend(reason) {
    if (S.state === 'SLING_PULL' || S.state === 'SLING_OPEN' || S.state === 'PAIRING' || S.state === 'SLING_REBOUND') close(reason || 'hidden');
    // HOLD/FIRE finish on their own (bounded); AWAY keeps its record and simply stops polling while hidden
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.state === 'AWAY') schedulePoll(400); });

  // ---------------------------------------------------------------- boot: is he away right now?
  async function boot() {
    if (!R()) return;
    const c = R().cached();
    if (!c.away && !c.pending) {
      // 5.3: the server is the truth. If this phone has paired computers (or, on iPhone, its Free Roam memory
      // was trimmed by the browser), ask once whether he is really home, so a refresh can never show a second
      // creature while the record says he is on a computer. Offline: nothing changes (he was home when we last knew).
      const paired = c.devices && Object.keys(c.devices).length > 0;
      let trimmed = false;
      try { trimmed = !!root.EYES_WEB && localStorage.getItem('eyes.roam.v1') === null && !!localStorage.getItem('haven.dna.v1'); } catch (e) {}
      if (!paired && !trimmed) return;
      try {
        const w = await R().where();
        if (w.home) return;
        c.away = { device: w.device };
      } catch (e) { return; }
    }
    let info = c.away ? { device: c.away.device } : null, note = '';
    try {
      const w = await R().where();
      if (w.home) { if (c.pending) R().cancel(null); return; }
      info = { device: w.device };
    } catch (e) {
      note = c.pending && !c.away ? 'Checking where he is…' : 'Offline — he’s still on your computer.';
      if (!info) info = { device: c.pending.device };
    }
    const devs = c.devices || {};
    info.name = (devs[info.device] && devs[info.device].name) || 'your computer';
    const tryClaim = (n) => {
      const api = root.EyesAbility && EyesAbility.claim('slingshot', 'AWAY', 'boot');
      if (api) {
        S.api = api; S.devices = devs; build();
        S.state = 'AWAY'; S.at = ms(); S.away = info; S.note = note;
        S.el.dataset.state = 'AWAY';
        syncDom(); schedulePoll(note ? 3000 : 20000); redraw();
        return;
      }
      if (n > 0) setTimeout(() => tryClaim(n - 1), 700);
    };
    tryClaim(40);
  }

  function available() {
    // 5.3: the iPhone web app too (EYES_IOS_ABILITIES: the site that carries the native ability ports). Its
    // browser limits are handled where they matter: no haptics (buzz), Vision's permission-gated camera with a
    // typed-code fallback, and boot() below for refreshes, suspensions and trimmed storage.
    if (root.EYES_WEB && !root.EYES_IOS_ABILITIES) return false;
    return !!(root.EyesFirebase && root.EyesRoam && root.crypto && crypto.subtle);
  }
  const register = () => root.EyesAbility && EyesAbility.register({
    id: 'slingshot', label: 'Slingshot', icon: ICON, available, wheel: false,      // 5.2: reached through Play (play-hub.js)
    entry: 'SLING_OPEN', states: STATES, claims: ['AWAY'],
    activate, pose, fps, frame, back, interrupt, suspend
  });
  if (!register()) addEventListener('DOMContentLoaded', register, { once: true });
  if (document.readyState === 'complete') setTimeout(boot, 1200); else addEventListener('load', () => setTimeout(boot, 1200), { once: true });

  root.EyesSlingshot = {
    fromCode,
    open: (code) => (root.EyesAbility ? EyesAbility.launch('slingshot', code ? 'code' : 'api') && (code ? setTimeout(() => handleCode(code), 80) : true) : false),
    state: () => S.state,
    diagnostics: () => ({ state: S.state, target: S.target, ready: S.ready, tension: Math.round(S.tension * 100) / 100, away: S.away, note: S.note, devices: Object.keys(S.devices).length, stats: { ...S.stats } }),
    // test-only hooks (not reachable from any screen)
    _pull: (dx, dy) => { if (S.state === 'SLING_OPEN' && S.g) { const g = S.g; down({ clientX: g.cx, clientY: g.cy, pointerId: 99, preventDefault() {}, target: { setPointerCapture() {} } }); move({ clientX: g.cx + dx, clientY: g.cy + dy, pointerId: 99 }); return true; } return false; },
    _release: () => up({ pointerId: 99 }),
    _recall: () => recall()
  };
})(window);
