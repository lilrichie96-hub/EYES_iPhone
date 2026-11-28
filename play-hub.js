/* EYES 5.2 · Play, the fork. Play on the Ability Satellite now holds two things you do WITH your Eye:
     Play together  the existing Play ability (eyes-playtime.js), unchanged
     Slingshot      the existing Free Roam ability (slingshot.js), unchanged
   Slingshot left the utility wheel; both keep their ability ids, states, claims and APIs, so pairing, camera
   aiming, launch, recall, boot-time AWAY claims and EyesPlaytime.open()/EyesSlingshot.open() work as before.
   They are registered with `wheel: false`; this file is the one wheel entry ("Play") that leads to them.

   The fork is the Eye itself, not a popup: he gathers himself (a small squash), and two buds of his own light
   swell out of his rim on curling filaments, each carrying its icon. He glances between them, leans toward the
   one you touch, and when you choose, that bud slides back down its filament into him (a little gulp), the
   other one retracts, and the chosen ability takes over the iris in the same frame. Tap outside or Back and
   both buds fold back in. Motion off: no movement, the buds simply appear. Gentle: slower and smaller.
   Nothing is stored, no timers outlive the fork, and it adds no render loop (painted from the Eye's frame).

   States: HUB_OPEN -> HUB_CHOSEN (hand-off) | HUB_CLOSING (release). */
'use strict';
(function (root) {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeIn = (x) => Math.pow(clamp(x), 3);
  const backOut = (x) => { x = clamp(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const ms = () => performance.now();
  // the same glyph Play has always had on the wheel
  const PLAY_ICON = 'M12.6 8.6a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0 M3.4 20c1.2-4.6 3.6-7.9 7.6-9.8 M2.8 20.6h4.4 M20.4 14v2.4 M19.2 15.2h2.4';
  const TOGETHER_ICON = 'M2.6 12.4a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0 M14.6 12.4a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0 M10.6 9.2c.9-.7 1.9-.7 2.8 0 M12 4.2v1.6 M8.6 5.4l.8 1.2 M15.4 5.4l-.8 1.2';
  const SLING_ICON = 'M7 21v-6.5M7 14.5 3.6 6.2M7 14.5l3.4-8.3M3.6 6.2c3 2.4 5.6 2.6 8.4 2.2M10.4 6.2c2.2.9 4.4.8 6.2-.6M16.6 5.6a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0M18.5 9.6l-1 2.2M20.6 10l.4 2.4';
  const CHOICES = [
    { id: 'play', label: 'Play together', icon: TOGETHER_ICON, hint: 'Games and company, right here' },
    { id: 'slingshot', label: 'Slingshot', icon: SLING_ICON, hint: 'Send him to explore a computer' }
  ];
  const BUD_R = 21;

  const H = { api: null, state: 'IDLE', at: 0, g: null, el: null, buds: [], chosen: null, focus: -1, press: -1, motion: true, gentle: false, glance: 0, glanceAt: 0, timers: new Set(), stats: { opened: 0, chosen: {}, closed: 0, direct: 0 } };
  // his little body for the fork: a few springs (same feel as Play's)
  const B = { gx: 0, gy: 0, tgx: 0, tgy: 0.35, sq: 0, vsq: 0, dx: 0, vdx: 0, tdx: 0, dy: 0, vdy: 0, tdy: 0, tilt: 0, vt: 0, ttilt: 0, pupil: 1, tpupil: 1, glow: 1, tglow: 1, lid: 0, tlid: 0 };
  let lastStep = 0;

  const ability = (id) => {
    // registry ids only (order() never asks anyone's available(): diagnostics() would, and that includes us)
    try { return root.EyesAbility && EyesAbility.order().includes(id) ? id : null; } catch (e) { return null; }
  };
  function choiceAvailable(id) {
    // ask the ability itself (registered with wheel:false so the wheel never lists it)
    try {
      if (id === 'play') return !!(root.HavenDNA && HavenDNA.has()) && !!ability('play');
      // 5.3: the iPhone web app joins Free Roam (secure context needed for crypto.subtle: the site is https)
      if (id === 'slingshot') return (!root.EYES_WEB || !!root.EYES_IOS_ABILITIES) && !!(root.EyesFirebase && root.EyesRoam && root.crypto && crypto.subtle) && !!ability('slingshot');
    } catch (e) {}
    return false;
  }
  const choices = () => CHOICES.filter((c) => choiceAvailable(c.id));
  function available() { return choices().length > 0; }

  // ---------------------------------------------------------------- layout: where the buds sit
  function layout(g) {
    const list = H.buds, n = list.length;
    if (!n || !g) return;
    const r = g.size, gentleK = H.gentle ? 0.92 : 1;
    const dist = (r * 1.32 + BUD_R + 26) * gentleK;
    // below the Eye, splayed; when there is no room below (landscape phones) they go left and right
    const roomBelow = g.h - (g.cy + dist + BUD_R + 46);
    const side = roomBelow < 0 || g.w > g.h * 1.3;
    const spread = side ? 0 : 0.7;
    list.forEach((b, i) => {
      const k = n === 1 ? 0 : (i === 0 ? -1 : 1);
      const a = side ? (k < 0 ? Math.PI : 0) : Math.PI / 2 - k * spread;
      b.a = a;
      b.hx = g.cx + Math.cos(a) * dist; b.hy = g.cy + Math.sin(a) * dist;
      b.hx = clamp(b.hx, BUD_R + 40, g.w - BUD_R - 40);
      b.rimx = g.cx + Math.cos(a) * r * 0.98; b.rimy = g.cy + Math.sin(a) * r * 0.98;
    });
  }

  // ---------------------------------------------------------------- DOM: accessible touch targets + labels
  function build() {
    if (H.el) return H.el;
    const wrap = document.createElement('div');
    wrap.id = 'eyesPlayHub';
    wrap.setAttribute('role', 'menu');
    wrap.setAttribute('aria-label', 'Play');
    const catcher = document.createElement('div');
    catcher.className = 'ph-catch';
    catcher.addEventListener('pointerdown', (e) => e.stopPropagation());
    catcher.addEventListener('click', (e) => { e.stopPropagation(); close('outside'); });
    wrap.append(catcher);
    wrap.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    H.el = wrap;
    return wrap;
  }
  function renderButtons() {
    const wrap = build();
    wrap.querySelectorAll('.ph-bud').forEach((b) => b.remove());
    H.buds.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ph-bud';
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('aria-label', b.label + '. ' + b.hint);
      btn.tabIndex = i === 0 ? 0 : -1;
      btn.dataset.choice = b.id;
      const lab = document.createElement('span');
      lab.className = 'ph-label';
      lab.textContent = b.label;
      btn.append(lab);
      btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); H.press = i; H.focus = i; poke(); });
      for (const ty of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ty, () => { if (H.press === i) { H.press = -1; poke(); } });
      btn.addEventListener('focus', () => { H.focus = i; poke(); });
      btn.addEventListener('click', (e) => { e.stopPropagation(); choose(b.id, 'tap'); });
      b.btn = btn; b.lab = lab;
      wrap.append(btn);
    });
    place(0);
  }
  function place(u) {
    for (const b of H.buds) {
      if (!b.btn) continue;
      const x = mix(b.rimx, b.hx, u), y = mix(b.rimy, b.hy, u);
      b.btn.style.left = x + 'px'; b.btn.style.top = y + 'px';
      b.btn.style.opacity = String(clamp((u - 0.5) / 0.5));
      b.btn.disabled = u < 0.6 || H.state !== 'HUB_OPEN';
      b.lab.classList.toggle('ph-side', Math.abs(Math.cos(b.a)) > 0.9);
      b.lab.classList.toggle('ph-left', Math.cos(b.a) < -0.9);
    }
  }
  function onKey(e) {
    const n = H.buds.length;
    if (e.key === 'Escape') { e.preventDefault(); close('escape'); return; }
    if (!n) return;
    let i = H.focus < 0 ? 0 : H.focus;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) i++;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) i--;
    else return;
    e.preventDefault();
    i = (i + n) % n;
    H.buds.forEach((b, k) => { if (b.btn) b.btn.tabIndex = k === i ? 0 : -1; });
    H.buds[i].btn && H.buds[i].btn.focus({ preventScroll: true });
  }
  function teardownDom() {
    if (H.el) { H.el.remove(); H.el = null; }
    H.buds.forEach((b) => { b.btn = null; b.lab = null; });
  }

  // ---------------------------------------------------------------- lifecycle
  const redraw = () => { if (H.api) H.api.redraw(); };
  const poke = () => redraw();
  const after = (fn, d) => { const t = setTimeout(() => { H.timers.delete(t); fn(); }, d); H.timers.add(t); return t; };
  function clearTimers() { for (const t of H.timers) clearTimeout(t); H.timers.clear(); }
  function go(to, why) {
    if (!H.api || !H.api.go(to, why)) return false;
    H.state = to; H.at = ms();
    if (H.el) H.el.dataset.state = to;
    redraw();
    return true;
  }
  function activate(api, opts) {
    const h = api.host();
    H.api = api;
    H.motion = !!(h && h.motion());
    H.gentle = !!(h && h.gentle());
    H.stats.opened++;
    H.chosen = null; H.focus = -1; H.press = -1;
    Object.assign(B, { gx: 0, gy: 0.35, tgx: 0, tgy: 0.35, sq: 0, vsq: 0, dx: 0, vdx: 0, tdx: 0, dy: 0, vdy: 0, tdy: 0, tilt: 0, vt: 0, ttilt: 0, pupil: 1, tpupil: 1.08, glow: 1, tglow: 1.08, lid: 0, tlid: 0 });
    const list = choices();
    if (list.length === 1) {               // iPhone (no Slingshot yet): Play opens exactly as it always did
      H.stats.direct++;
      H.state = 'HUB_OPEN';
      handoff(list[0].id, 'direct');
      return;
    }
    H.buds = list.map((c) => ({ ...c, a: 0, hx: 0, hy: 0, rimx: 0, rimy: 0, btn: null, lab: null, sway: Math.random() * TAU }));
    H.state = 'HUB_OPEN'; H.at = ms();
    H.glanceAt = H.at + 520; H.glance = 0;
    build();
    H.el.classList.toggle('ph-gentle', H.gentle);
    H.el.dataset.state = 'HUB_OPEN';
    requestAnimationFrame(() => H.el && H.el.classList.add('ph-in'));
    if (H.g) layout(H.g);
    renderButtons();
    // he gathers himself before the buds come out (anticipation)
    if (H.motion) { B.sq = -0.07; B.tlid = 0.12; after(() => { B.tlid = 0; B.sq = Math.max(B.sq, 0.05); }, H.gentle ? 170 : 120); }
    try { h && h.core && h.core.react && h.core.react('anticipate', h.now()); } catch (e) {}
    if (api.keyboard && api.keyboard()) after(() => { const b = H.buds[0]; if (b && b.btn) { b.btn.disabled = false; b.btn.focus({ preventScroll: true }); } }, openDur() + 40);
    redraw();
  }
  const openDur = () => (!H.motion ? 0 : H.gentle ? 620 : 460);
  const chooseDur = () => (!H.motion ? 0 : H.gentle ? 380 : 280);
  const closeDur = () => (!H.motion ? 0 : H.gentle ? 320 : 240);
  function choose(id, why) {
    if (H.state !== 'HUB_OPEN' || ms() - H.at < openDur() * 0.6) return false;
    const b = H.buds.find((x) => x.id === id);
    if (!b || !choiceAvailable(id)) return false;
    H.chosen = b;
    H.stats.chosen[id] = (H.stats.chosen[id] || 0) + 1;
    if (!go('HUB_CHOSEN', why || 'choose')) return false;
    // he looks at it, opens up for it, and draws it back in
    gazeAt(b.hx, b.hy, 1); B.tpupil = 1.25; B.tglow = 1.2;
    try { if (navigator.vibrate && root.EyesVisionNative) navigator.vibrate(8); } catch (e) {}
    after(() => handoff(id, why), chooseDur());
    return true;
  }
  function handoff(id, why) {
    const api = H.api;
    clearTimers();
    teardownDom();
    H.api = null; H.state = 'IDLE'; H.buds = []; H.chosen = null;
    if (api) api.done('hub:' + id);
    // the chosen ability takes over the iris in the same frame (launch() checks the home screen is free)
    let ok = false;
    try { ok = !!(root.EyesAbility && EyesAbility.launch(id, 'hub')); } catch (e) { ok = false; }
    if (!ok) { try { root.EyesSocial && EyesSocial.caption && EyesSocial.caption(id === 'slingshot' ? 'Slingshot isn’t available right now.' : 'Play isn’t available right now.'); } catch (e) {} }
    return ok;
  }
  function close(why) {
    if (H.state !== 'HUB_OPEN') return false;
    H.stats.closed++;
    if (!go('HUB_CLOSING', why || 'close')) { finish(why); return true; }
    B.tgx = 0; B.tgy = 0; B.tpupil = 1; B.tglow = 1;
    after(() => finish(why), closeDur());
    return true;
  }
  function finish(why) {
    const api = H.api;
    clearTimers();
    teardownDom();
    H.api = null; H.state = 'IDLE'; H.buds = []; H.chosen = null;
    if (api) api.done(why || 'closed');
  }
  function interrupt(reason) {
    if (!H.api) return;
    finish(reason || 'interrupt');
  }

  // ---------------------------------------------------------------- the body
  function gazeAt(x, y, amt) {
    const g = H.g;
    if (!g) return;
    const reach = Math.max(110, g.size * 2.2);
    B.tgx = clamp((x - g.cx) / reach, -1, 1) * amt; B.tgy = clamp((y - g.cy) / reach, -1, 1) * amt;
  }
  function stepBody(dt) {
    const soft = H.gentle ? 0.6 : 1;
    const spr = (x, v, to, k, d) => { const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n; for (let i = 0; i < n; i++) { v += (-k * (x - to) - d * v) * h; x += v * h; } return [x, v]; };
    [B.sq, B.vsq] = spr(B.sq, B.vsq, 0, 240 * soft, 11);
    [B.dx, B.vdx] = spr(B.dx, B.vdx, B.tdx, 120 * soft, 15);
    [B.dy, B.vdy] = spr(B.dy, B.vdy, B.tdy, 120 * soft, 15);
    [B.tilt, B.vt] = spr(B.tilt, B.vt, B.ttilt, 90 * soft, 12);
    const f = clamp(dt * 9);
    B.pupil = mix(B.pupil, B.tpupil, f); B.glow = mix(B.glow, B.tglow, f); B.lid = mix(B.lid, B.tlid, f);
    B.gx = mix(B.gx, B.tgx, clamp(dt * 11)); B.gy = mix(B.gy, B.tgy, clamp(dt * 11));
  }
  function pose(t) {
    const now = ms(), dt = Math.min(0.05, Math.max(0, (now - (lastStep || now)) / 1000));
    lastStep = now;
    const st = H.state, age = now - H.at;
    if (st === 'HUB_OPEN' && H.g && H.buds.length) {
      const focus = H.press >= 0 ? H.press : H.focus;
      if (focus >= 0 && H.buds[focus]) {
        const b = H.buds[focus];
        gazeAt(b.hx, b.hy, 1);
        B.tdx = Math.cos(b.a) * H.g.size * 0.05; B.tdy = Math.sin(b.a) * H.g.size * 0.04;
        B.ttilt = -Math.cos(b.a) * 0.06; B.tpupil = H.press >= 0 ? 1.22 : 1.12;
      } else if (H.motion && now > H.glanceAt) {
        // he glances between the two choices, and back at you now and then
        H.glance = (H.glance + 1) % 3;
        const b = H.buds[H.glance % H.buds.length];
        if (H.glance === 2) { B.tgx = 0; B.tgy = 0.08; B.tpupil = 1.04; } else { gazeAt(b.hx, b.hy, 0.85); B.tpupil = 1.1; }
        B.tdx = 0; B.tdy = 0; B.ttilt = 0;
        H.glanceAt = now + (H.gentle ? 1700 : 1150) + Math.random() * 700;
      }
    } else if (st === 'HUB_CHOSEN' && H.chosen) {
      const u = clamp(age / Math.max(1, chooseDur()));
      if (u > 0.72 && !H.chosen.gulped) { H.chosen.gulped = true; B.sq = H.gentle ? 0.08 : 0.15; }     // the gulp
      B.tdx = 0; B.tdy = 0; B.ttilt = 0;
    }
    stepBody(dt);
    return {
      k: 0, look: 1, gaze: { x: clamp(B.gx, -1, 1), y: clamp(B.gy, -1, 1) }, neutral: 0.85, hush: 1, open: 0, lens: 0, grow: 0, size: 0, pupil: 0, iris: 0,
      pupilK: clamp(B.pupil, 0.45, 1.9), glow: clamp(B.glow, 0.3, 1.8), bodySx: clamp(1 + B.sq * 0.6, 0.7, 1.4), bodySy: clamp(1 - B.sq, 0.7, 1.4),
      lid: clamp(B.lid, 0, 0.9), dx: B.dx, dy: B.dy, tilt: B.tilt, scale: 1
    };
  }
  function fps(t, low) {
    if (!H.api) return 0;
    const age = ms() - H.at;
    if (H.state !== 'HUB_OPEN' || age < openDur() + 200) return low ? 30 : 60;
    const springing = Math.abs(B.vsq) * 40 + Math.abs(B.vdx) + Math.abs(B.vdy) + Math.abs(B.gx - B.tgx) * 30 + Math.abs(B.gy - B.tgy) * 30 > 1.2;
    if (springing || H.press >= 0) return low ? 30 : 45;
    return H.motion ? (low ? 10 : 15) : 0;          // a slow breath of the buds; nothing at all with Motion off
  }

  // ---------------------------------------------------------------- painting into the Eye's canvas
  const iconCache = new Map();
  function iconPath(d) {
    if (!iconCache.has(d)) { try { iconCache.set(d, new Path2D(d)); } catch (e) { iconCache.set(d, null); } }
    return iconCache.get(d);
  }
  function frame(ctx, g) {
    const first = !H.g;
    H.g = g;
    if (!H.buds.length) return;
    if (first || H.state === 'HUB_OPEN') layout(g);
    const now = ms(), st = H.state, age = now - H.at;
    // u: 0 = inside him, 1 = fully out
    let uOpen = st === 'HUB_OPEN' ? (openDur() ? clamp(age / openDur()) : 1) : 1;
    let uClose = st === 'HUB_CLOSING' ? (closeDur() ? clamp(age / closeDur()) : 1) : 0;
    place(st === 'HUB_OPEN' ? uOpen : 0);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    H.buds.forEach((b, i) => {
      let u;
      const stagger = H.motion ? i * 0.12 : 0;
      if (st === 'HUB_OPEN') u = backOut(clamp((uOpen - stagger) / (1 - stagger)));
      else if (st === 'HUB_CLOSING') u = 1 - easeIn(uClose);
      else if (st === 'HUB_CHOSEN') {
        const c = chooseDur() ? clamp(age / chooseDur()) : 1;
        u = b === H.chosen ? 1 - easeIn(c) : 1 - easeOut(clamp(c * 1.6));
      } else u = 0;
      if (u <= 0.005) return;
      paintBud(ctx, g, b, u, now, i === (H.press >= 0 ? H.press : H.focus), b === H.chosen);
    });
    ctx.restore();
  }
  function paintBud(ctx, g, b, u, now, focused, chosen) {
    const tint = g.tint;
    const breath = H.motion ? Math.sin(now / 1700 + b.sway) : 0;
    // the filament: from his rim, curling out to the bud (it grows with u; the bud rides its tip)
    const x0 = b.rimx, y0 = b.rimy;
    const ex = mix(x0, b.hx, u), ey = mix(y0, b.hy, u);
    const nx = -(ey - y0), ny = ex - x0, nl = Math.hypot(nx, ny) || 1;
    const curl = (Math.cos(b.a) < 0 ? -1 : 1) * Math.min(18, nl * 0.22) * (1 + 0.12 * breath);
    const mx = (x0 + ex) / 2 + nx / nl * curl, my = (y0 + ey) / 2 + ny / nl * curl;
    const fl = ctx.createLinearGradient(x0, y0, ex, ey);
    fl.addColorStop(0, tint(1.05, 0.42 * clamp(u * 1.4)));
    fl.addColorStop(1, tint(0.95, 0.16 * clamp(u * 1.4)));
    ctx.strokeStyle = fl; ctx.lineWidth = focused ? 1.6 : 1.2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    // the bud
    const r = BUD_R * (0.35 + 0.65 * u) * (focused ? (H.press >= 0 ? 0.93 : 1.06) : 1) * (1 + 0.025 * breath);
    const halo = ctx.createRadialGradient(ex, ey, r * 0.5, ex, ey, r * 2.3);
    halo.addColorStop(0, tint(1, (focused ? 0.3 : 0.18) * clamp(u)));
    halo.addColorStop(1, tint(0.9, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(ex, ey, r * 2.3, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(4,12,15,${0.74 * clamp(u)})`;
    ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.fill();
    // a living rim: a brighter arc that slowly travels around it
    ctx.strokeStyle = tint(1, 0.62 * clamp(u)); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.stroke();
    if (H.motion) {
      const a0 = now / 1400 + b.sway;
      ctx.strokeStyle = tint(1.25, 0.5 * clamp(u)); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(ex, ey, r, a0, a0 + 0.9); ctx.stroke();
    }
    const path = iconPath(b.icon);
    if (path && u > 0.25) {
      ctx.save();
      ctx.globalAlpha = clamp((u - 0.25) / 0.5);
      ctx.translate(ex, ey); ctx.scale(r / 15.5, r / 15.5); ctx.translate(-12, -12);
      ctx.strokeStyle = tint(1.18, chosen ? 1 : 0.92); ctx.lineWidth = 1.5;
      ctx.stroke(path);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- registration
  const register = () => root.EyesAbility && EyesAbility.register({
    id: 'playhub', label: 'Play', icon: PLAY_ICON, preview: 'play', available,
    entry: 'HUB_OPEN', states: { HUB_OPEN: ['HUB_CHOSEN', 'HUB_CLOSING'], HUB_CHOSEN: [], HUB_CLOSING: [] },
    activate, pose, fps, frame,
    back() { if (H.state === 'HUB_OPEN') return close('back'); return true; },
    interrupt, suspend: interrupt
  });
  if (!register()) addEventListener('DOMContentLoaded', register, { once: true });
  addEventListener('resize', () => { if (H.api && H.state === 'HUB_OPEN' && H.g) { layout(H.g); place(1); } });

  root.EyesPlayHub = {
    open: () => (root.EyesAbility ? EyesAbility.launch('playhub', 'api') : false),
    choose: (id) => choose(id, 'api'),
    close: () => close('api'),
    state: () => H.state,
    choices: () => choices().map((c) => c.id),
    diagnostics: () => ({ state: H.state, buds: H.buds.map((b) => ({ id: b.id, x: Math.round(b.hx), y: Math.round(b.hy) })), dom: !!(H.el && H.el.isConnected), timers: H.timers.size, stats: JSON.parse(JSON.stringify(H.stats)) })
  };
})(window);
