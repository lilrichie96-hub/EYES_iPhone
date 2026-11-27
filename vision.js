/* EYES 4.4.3 · Vision. The Eye learns to look at the physical world through the phone's camera.
   The eye doesn't open a camera app: it becomes one. The live camera image sits in the real pupil, painted
   over by nothing; the creature's own iris (eye-render.js, his DNA pattern and skin) is the living frame
   around it. All of it is driven through the Ability Wheel (ability-wheel.js) and launcher.js draw().

   Camera: getUserMedia in the EYES WebView, rear camera, 1280×720, no audio. The Android side
   (EyesVisionNative, see native/VisionBridge.java) asks for the CAMERA permission the first time Vision opens,
   grants the WebView video capture only while Vision is open and only to EYES' own page, saves photos with
   MediaStore, opens the phone's own camera app, opens checked web links and copies text.
   QR codes use the offline decoder in vision-qr.js.

   States (central machine in ability-wheel.js):
     VISION_OPENING -> CAMERA_PERMISSION -> CAMERA_STARTING -> VISION_ACTIVE <-> QR_RESULT / PHOTO_CAPTURE
     -> VISION_CLOSING | HANDOFF -> IDLE      ERROR and SUSPENDED offer Retry / Close.  */
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const ms = () => performance.now();
  const nativeV = () => window.EyesVisionNative || null;
  const call = (name, ...args) => {
    const n = nativeV();
    if (!n || typeof n[name] !== 'function') return undefined;
    try { return n[name](...args); } catch { return undefined; }
  };

  // 5.0: a touch of feel. Haptics only where EYES' Android bridge is present (Android WebView has the
  // Vibration API and EYES holds VIBRATE); iPhone browsers offer no web haptics, so nothing pretends there.
  const buzz = (pattern) => { if (!nativeV()) return; try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {} };
  const feel = (kind, data) => { try { if (window.EyesFeel) EyesFeel.report(kind, data); } catch {} };
  function pulseLens(cls, dur) {
    const lens = $('visionLens');
    if (!lens || !speed()) return;
    lens.classList.remove(cls); void lens.offsetWidth; lens.classList.add(cls);
    clearTimeout(pulseLens[cls]);
    pulseLens[cls] = setTimeout(() => lens.classList.remove(cls), dur);
  }
  const ICON = 'M2.8 12C5.4 7.6 8.6 5.6 12 5.6s6.6 2 9.2 6.4c-2.6 4.4-5.8 6.4-9.2 6.4S5.4 16.4 2.8 12ZM8.6 12a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0M11.2 12a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0';
  const CHANNELS = ['look', 'gx', 'gy', 'k', 'neutral', 'hush', 'open', 'grow', 'size', 'pupil', 'iris', 'lens'];
  const ACTIVE_STATES = ['VISION_ACTIVE', 'QR_RESULT', 'PHOTO_CAPTURE'];
  const CAMERA_STATES = ['VISION_OPENING', 'CAMERA_STARTING', 'VISION_ACTIVE', 'QR_RESULT', 'PHOTO_CAPTURE'];

  const V = {
    api: null, state: 'IDLE', gen: 0,
    // choreography
    at: 0, from: null, tracks: null, osc: null, moveUntil: 0, reactions: [], openReadyAt: 0,
    targets: null, cur: null,
    // camera
    stream: null, track: null, imageCapture: null, scanTimer: 0,
    capturing: false, suppress: null, result: null, permissionWaiter: null, lensBase: 100,
    lastGeo: null, tintKey: '', messageKind: '', pendingSaves: 0, flashTimer: 0, hintTimer: 0, noteTimer: 0,
    settingsVisited: false, stats: { opened: 0, started: 0, stopped: 0, scans: 0, decoded: 0, photos: 0 }
  };

  // ---------- geometry the transformation aims for ----------
  function computeTargets() {
    const W = innerWidth, H = innerHeight;
    const st = document.documentElement.style;
    const top = parseFloat(st.getPropertyValue('--native-inset-top')) || 0, bottom = parseFloat(st.getPropertyValue('--native-inset-bottom')) || 0;
    const looks = window.HavenDNA && HavenDNA.looks ? HavenDNA.looks() : { iris: 1, pupil: 1 };
    // as large as the screen allows while the whole body of the Eye stays on screen
    const S = Math.max(60, Math.min(W * 0.46, (H - top - bottom) * 0.4, 340));
    const irisF = 0.9, band = clamp(S * 0.17, 30, 46), lensR = S * irisF - band;
    return {
      S, lensR, irisF,
      pupil: lensR / (0.17 * S),
      pupilBase: looks.pupil || 1,
      irisBase: 0.62 * (looks.iris || 1)
    };
  }

  // ---------- choreography: keyframed channels, snapshotted at every transition ----------
  const speed = () => { const h = V.api && V.api.host(); if (!h || !h.motion()) return 0; return h.gentle() ? 0.55 : 1; };
  function idleValues() {
    const T = V.targets;
    return { look: 0, gx: 0, gy: 0, k: 0, neutral: 0, hush: 0, open: 0, grow: 0, size: T.S, pupil: T.pupilBase, iris: T.irisBase, lens: 0 };
  }
  function evalTracks(t) {
    if (!V.tracks) return V.from || idleValues();
    const sp = speed(), e = sp ? (t - V.at) / sp : Infinity, out = {};
    for (const ch of CHANNELS) {
      const keys = V.tracks[ch];
      let v = V.from[ch];
      if (keys) {
        let pt = 0, pv = V.from[ch];
        v = keys[keys.length - 1][1];
        for (const [kt, kv, kind] of keys) {
          if (e <= kt) { const f = (e - pt) / (kt - pt || 1); v = mix(pv, kv, kind === 'out' ? easeOut(f) : kind === 'lin' ? clamp(f) : ease(f)); break; }
          pt = kt; pv = kv;
        }
      }
      out[ch] = v;
    }
    return out;
  }
  function plan(tracks, osc) {
    const t = ms();
    V.from = V.tracks ? evalTracks(t) : idleValues();
    V.at = t; V.tracks = tracks; V.osc = osc || null;
    let end = 0;
    for (const ch in tracks) end = Math.max(end, tracks[ch][tracks[ch].length - 1][0]);
    V.moveUntil = t + end * speed() + 30;
    if (V.api) V.api.redraw();
    return end * speed();
  }
  function react(name) {
    const sp = speed(), t = ms();
    if (!sp) return;
    const R = {
      candidate: { dur: 240, pupil: [[90, 0.93], [240, 0.96]], iris: [[90, 0.98], [240, 0.99]] },
      confirm: { dur: 460, pupil: [[0, 0.96], [140, 1.045], [300, 0.99], [460, 1]], iris: [[0, 0.99], [140, 1.018], [460, 1]] },
      shutter: { dur: 430, pupil: [[85, 0.6], [150, 0.6], [430, 1]], iris: [[85, 0.96], [430, 1]] },
      nudge: { dur: 300, pupil: [[120, 1.04], [300, 1]] }
    }[name];
    if (!R) return;
    V.reactions = V.reactions.filter((r) => t - r.at < r.dur * r.sp);
    V.reactions.push({ ...R, name, at: t, sp: sp === 1 ? 1 : 0.6 });
    V.moveUntil = Math.max(V.moveUntil, t + R.dur * sp + 30);
    if (V.api) V.api.redraw();
  }
  function reactionMul(t, ch) {
    let m = 1;
    for (const r of V.reactions) {
      const keys = r[ch];
      if (!keys) continue;
      const e = (t - r.at) / r.sp;
      if (e >= r.dur || e < 0) continue;
      let pt = 0, pv = 1, v = 1;
      for (const [kt, kv] of keys) { if (e <= kt) { v = mix(pv, kv, ease((e - pt) / (kt - pt || 1))); break; } pt = kt; pv = kv; v = kv; }
      m *= v;
    }
    return m;
  }

  function planOpening() {
    const T = V.targets;
    // he looks at the satellite, swallows it, his aperture tightens and he holds for a beat
    V.from = idleValues();
    V.from.gx = -0.8; V.from.gy = -0.8;
    V.tracks = null;
    const d = plan({
      look: [[170, 1, 'out'], [380, 1], [560, 0]],
      k: [[300, 0.55], [500, 1]],
      neutral: [[340, 1]],
      hush: [[300, 1]],
      open: [[300, 1]],
      pupil: [[230, T.pupilBase * 1.14, 'out'], [470, 0.42]],
      iris: [[230, T.irisBase * 1.03], [470, T.irisBase * 0.93]]
    }, (t, c) => {
      const e = (t - V.at) / (speed() || 1);
      if (speed() === 1 && e > 470 && e < 640) c.pupil *= 1 + 0.018 * Math.sin(e * 0.11) * (1 - (e - 470) / 170);   // anticipation tremble
    });
    V.openReadyAt = ms() + d;
  }
  function planWaiting() {
    const T = V.targets;
    plan({ k: [[200, 1]], look: [[260, 0]], neutral: [[200, 1]], hush: [[200, 1]], open: [[200, 1]], grow: [[300, 0]], lens: [[160, 0]], pupil: [[300, 0.42]], iris: [[300, T.irisBase * 0.93]] },
      (t, c) => { if (speed() === 1) c.pupil *= 1 + 0.035 * Math.sin(t / 360); else if (speed()) c.pupil *= 1 + 0.015 * Math.sin(t / 600); });
  }
  function planReveal() {
    const T = V.targets;
    plan({
      k: [[1, 1]], look: [[200, 0]], neutral: [[1, 1]], hush: [[1, 1]], open: [[1, 1]],
      size: [[1, T.S]], grow: [[680, 1, 'out']],
      pupil: [[680, T.pupil, 'out']], iris: [[680, T.irisF, 'out']], lens: [[240, 1]]
    }, steadyOsc);
  }
  function planSteady() {
    const T = V.targets;
    plan({ k: [[1, 1]], neutral: [[1, 1]], hush: [[1, 1]], open: [[1, 1]], look: [[200, 0]], size: [[320, T.S]], grow: [[320, 1]], pupil: [[320, T.pupil]], iris: [[320, T.irisF]], lens: [[200, 1]] }, steadyOsc);
  }
  function steadyOsc(t, c) {
    // calm focusing: the aperture never quite stops adjusting
    if (speed() === 1) { c.pupil *= 1 + 0.006 * Math.sin(t / 1500); c.iris *= 1 + 0.004 * Math.sin(t / 2100 + 1); }
  }
  function planResting() {   // error / suspended: small, quiet, still himself
    const T = V.targets;
    plan({ k: [[1, 1]], neutral: [[1, 1]], hush: [[1, 1]], open: [[400, 0.7]], look: [[300, 0]], grow: [[420, 0]], lens: [[160, 0]], pupil: [[420, 0.55]], iris: [[420, T.irisBase * 0.96]] });
  }
  function planClosing(fast) {
    const T = V.targets, f = fast ? 0.7 : 1;
    // the camera collapses inward and the living eye comes back
    return plan({
      lens: [[150 * f, 1], [330 * f, 0]],
      pupil: [[300 * f, 0.26], [640 * f, T.pupilBase * 1.06, 'out'], [800 * f, T.pupilBase]],   // 5.0: it settles back, alive
      grow: [[260 * f, V.cur ? V.cur.grow : 1], [640 * f, 0]],
      iris: [[640 * f, T.irisBase]],
      look: fast ? [[180, 0.55], [500, 0]] : [[200, 0]],
      gx: [[1, 0.35]], gy: [[1, 0.6]],
      k: [[420 * f, 1], [700 * f, 0]],
      neutral: [[700 * f, 0]], hush: [[700 * f, 0]], open: [[700 * f, 0]]
    });
  }

  // ---------- the pose handed to launcher.js ----------
  function pose(t) {
    if (V.state === 'IDLE' || !V.targets) return null;
    const c = evalTracks(t);
    if (V.osc) V.osc(t, c);
    c.pupil *= reactionMul(t, 'pupil');
    c.iris *= reactionMul(t, 'iris');
    V.cur = c;
    return { k: c.k, look: c.look, gaze: { x: c.gx, y: c.gy }, neutral: c.neutral, hush: c.hush, open: c.open, grow: c.grow, size: c.size, pupil: c.pupil, iris: c.iris, lens: c.lens };
  }
  function fps(t, low) {
    if (V.state === 'IDLE') return 0;
    if (t < V.moveUntil) return low ? 30 : 60;
    if (V.state === 'VISION_OPENING' || V.state === 'CAMERA_STARTING' || V.state === 'CAMERA_PERMISSION') return low ? 15 : 30;
    return low ? 8 : 15;
  }

  // ---------- DOM ----------
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('aria-') || k === 'role' || k === 'tabindex') n.setAttribute(k, v); else n[k] = v;
    }
    n.append(...kids);
    return n;
  }
  function ensureDom() {
    if ($('vision')) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const target = document.createElementNS(svgNS, 'svg');
    target.id = 'visionTarget';
    target.setAttribute('aria-hidden', 'true');
    const poly = document.createElementNS(svgNS, 'polygon');
    target.append(poly);
    const video = el('video', { id: 'visionVideo', muted: true, autoplay: true, playsInline: true, disablePictureInPicture: true });
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.setAttribute('aria-label', 'Live camera view');
    const lens = el('div', { id: 'visionLens' }, video, el('div', { class: 'vision-glass', 'aria-hidden': 'true' }), target, el('div', { id: 'visionFlash', 'aria-hidden': 'true' }));
    const shutter = el('button', { id: 'visionShutter', type: 'button', 'aria-label': 'Take a photo' });
    const camera = el('button', { id: 'visionCamera', type: 'button', 'aria-label': "Open the phone's camera app" });
    const close = el('button', { id: 'visionClose', type: 'button', 'aria-label': 'Close Vision' });
    // 5.0: the light, offered only when this camera says it has a torch it can control
    const torch = el('button', { id: 'visionTorch', type: 'button', 'aria-label': 'Light', 'aria-pressed': 'false', hidden: true });
    const rim = el('div', { id: 'visionRim' }, shutter, camera, close, torch);
    const hint = el('p', { id: 'visionHint', 'aria-live': 'polite' });
    const note = el('p', { id: 'visionNote', role: 'status', 'aria-live': 'polite' });
    const message = el('div', { id: 'visionMessage', role: 'alert', hidden: true },
      el('strong', { class: 'vm-title' }), el('span', { class: 'vm-detail' }), el('div', { class: 'vision-actions' }));
    const result = el('div', { id: 'visionResult', role: 'region', 'aria-label': 'Scanned code', hidden: true });
    const stage = el('section', { id: 'vision', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Vision', tabindex: '-1', hidden: true }, lens, rim, hint, note, message, result);
    // nothing behind Vision hears a touch while it owns the iris (pupil taps, holds, swipes, drags)
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'click', 'contextmenu'])
      stage.addEventListener(type, (e) => { e.stopPropagation(); if (type === 'contextmenu') e.preventDefault(); }, type.startsWith('touch') ? { passive: true } : false);
    stage.addEventListener('keydown', onKey);
    shutter.addEventListener('click', () => capture('button'));
    camera.addEventListener('click', handoff);
    if (window.EYES_IOS_ABILITIES) camera.hidden = true;
    close.addEventListener('click', () => close_('button'));
    torch.addEventListener('click', toggleTorch);
    document.body.append(stage);
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); back(); return; }
    if (e.key !== 'Tab') return;
    const stage = $('vision');
    const items = [...stage.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent !== null && !b.closest('[hidden]'));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    e.preventDefault();
    items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
  }
  function showStage(on) {
    ensureDom();
    const stage = $('vision');
    stage.hidden = !on;
    $('home').classList.toggle('vision-owned', on);
    document.documentElement.classList.toggle('vision-open', on);
    if (on) stage.focus({ preventScroll: true });
    else {
      $('visionMessage').hidden = true;
      $('visionResult').hidden = true;
      $('visionHint').textContent = '';
      $('visionNote').textContent = '';
      $('visionLens').style.opacity = '0';
    }
  }
  function syncStageState() {
    const stage = $('vision');
    if (!stage) return;
    stage.dataset.state = V.state;
    const live = ACTIVE_STATES.includes(V.state);
    $('visionRim').classList.toggle('live', live);
    $('visionShutter').disabled = V.state !== 'VISION_ACTIVE';
    $('visionCamera').disabled = V.state !== 'VISION_ACTIVE';
    $('visionClose').disabled = !(live || V.state === 'CAMERA_STARTING' || V.state === 'CAMERA_PERMISSION');
    $('visionTorch').disabled = V.state !== 'VISION_ACTIVE' || !V.torchOK || V.torchBusy;
  }

  // painted every frame from launcher.js draw(), through EyesAbility.frame()
  function frame(ctx, g) {
    V.lastGeo = g;
    const d = g.drawn;
    if (!d || V.state === 'IDLE') return;
    const c = V.cur || evalTracks(ms());
    const t = ms();
    // the satellite flies into the pupil and is swallowed
    if (V.state === 'VISION_OPENING' || (V.state !== 'IDLE' && t - V.openedAt < 520)) {
      const sp = speed() || 1, e = (t - V.openedAt) / sp;
      if (e > 60 && e < 360 && speed()) {
        const s = easeOut((e - 60) / 300), from = V.satAt || g.screen(-g.size * 0.935, -g.size * 0.935), to = g.screen(d.gx, d.gy);
        const x = mix(from.x, to.x, s) + Math.sin(s * Math.PI) * -18, y = mix(from.y, to.y, s) - Math.sin(s * Math.PI) * 10;
        const r = mix(3.4, 1.2, s), a = 1 - s * 0.85;
        ctx.save();
        const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
        halo.addColorStop(0, g.tint(1.15, 0.5 * a)); halo.addColorStop(1, g.tint(0.9, 0));
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(240,255,252,${0.9 * a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    // the lens is the pupil: same centre, same radius
    const centre = g.screen(d.gx, d.gy), sx = g.pose ? g.pose.sx : 1;
    const r = d.pupilR * sx, irisR = d.irisRadius * sx;
    const lens = $('visionLens');
    const alpha = c.lens;
    if (alpha > 0.002 && r > 1) {
      const R = V.lensBase;
      lens.style.transform = `translate3d(${(centre.x - R).toFixed(1)}px, ${(centre.y - R).toFixed(1)}px, 0) scale(${(r / R).toFixed(4)})`;
      lens.style.opacity = alpha.toFixed(3);
      lens.hidden = false;
    } else if (!lens.hidden) { lens.hidden = true; lens.style.opacity = '0'; }
    // its colour comes from the Eye
    const tint = g.tint(1, 1);
    if (tint !== V.tintKey) {
      V.tintKey = tint;
      const m = /rgba?\(([^)]+)\)/.exec(tint);
      if (m) $('vision').style.setProperty('--vision-rgb', m[1].split(',').slice(0, 3).join(','));
    }
    // controls ride on the living rim, in the iris band around the lens
    const rim = $('visionRim');
    const rc = mix(r, irisR, 0.52), live = ACTIVE_STATES.includes(V.state);
    rim.style.opacity = live ? clamp((alpha - 0.6) / 0.4).toFixed(3) : '0';
    if (live) {
      const place = (id, deg, rad) => {
        const a = (deg * Math.PI) / 180, b = $(id);
        b.style.left = (centre.x + Math.cos(a) * rad).toFixed(1) + 'px';
        b.style.top = (centre.y + Math.sin(a) * rad).toFixed(1) + 'px';
      };
      place('visionShutter', 90, rc + 4);
      place('visionCamera', 146, rc);
      place('visionClose', 34, rc);
      if (V.torchOK) place('visionTorch', 270, rc);
    }
    V.layout = { cx: centre.x, cy: centre.y, r, irisR };
    placeBelow();
  }
  // messages, notes and results sit just below the Eye, inside the safe area; in landscape, beside it
  function placeBelow() {
    const L = V.layout;
    if (!L) return;
    const st = document.documentElement.style;
    const bottom = parseFloat(st.getPropertyValue('--native-inset-bottom')) || 0;
    const H = innerHeight;
    const eyeBottom = L.cy + Math.max(L.irisR, V.targets ? V.targets.S * 1.0 : L.irisR) + 14;
    const key = Math.round(eyeBottom) + ':' + Math.round(L.cx) + ':' + innerWidth + ':' + H + ':' + bottom;
    if (key === V.belowKey) return;
    V.belowKey = key;
    V.eyeBottom = eyeBottom;
    for (const id of ['visionMessage', 'visionResult']) if (!$(id).hidden) placeCard($(id));
    $('visionHint').style.top = Math.min(eyeBottom, H - bottom - 60) + 'px';
    $('visionNote').style.top = Math.min(eyeBottom + 24, H - bottom - 36) + 'px';
  }
  function placeCard(n) {
    const L = V.layout;
    if (!L || n.hidden) return;
    const st = document.documentElement.style;
    const top0 = parseFloat(st.getPropertyValue('--native-inset-top')) || 0, bottom = parseFloat(st.getPropertyValue('--native-inset-bottom')) || 0;
    const W = innerWidth, H = innerHeight, eyeR = V.targets ? V.targets.S : L.irisR;
    n.style.maxHeight = '';
    n.style.width = '';
    const eyeBottom = V.eyeBottom || L.cy + eyeR + 14;
    let left = W / 2, top;
    const sideRoom = W - (L.cx + eyeR) - 28;
    if (W > H && sideRoom >= 230) n.style.width = Math.min(340, sideRoom) + 'px';
    const cardW = n.offsetWidth || 320;
    if (W > H && sideRoom >= 230) {
      // landscape: the card hangs beside the Eye instead of over it
      left = L.cx + eyeR + 12 + Math.min(cardW, sideRoom) / 2;
      const hgt = Math.min(n.scrollHeight, H - top0 - bottom - 24);
      top = clamp(L.cy - hgt / 2, top0 + 12, H - bottom - 12 - hgt);
      n.style.maxHeight = H - top0 - bottom - 24 + 'px';
    } else {
      const hgt = n.scrollHeight;
      const room = H - bottom - 12 - eyeBottom;
      // below the Eye when it fits; otherwise rest on the bottom edge and cover as little of him as possible
      top = room >= hgt ? eyeBottom : Math.max(top0 + 12, H - bottom - 12 - hgt);
      n.style.maxHeight = H - bottom - 12 - top + 'px';
    }
    n.style.left = left + 'px';
    n.style.top = top + 'px';
  }

  // ---------- state helpers ----------
  function go(state, reason) {
    if (!V.api) return false;
    if (!V.api.go(state, reason)) return false;
    V.state = state;
    syncStageState();
    return true;
  }
  const owned = () => !!V.api && V.state !== 'IDLE';

  // ---------- activation ----------
  function activate(api) {
    V.api = api;
    V.state = api.state();
    V.targets = computeTargets();
    V.lensBase = Math.max(40, Math.round(V.targets.lensR));
    V.stats.opened++;
    V.openedAt = ms();
    V.satAt = api.satellite();
    V.suppress = null;
    V.reactions = [];
    V.tracks = null;
    ensureDom();
    const lens = $('visionLens');
    lens.style.width = lens.style.height = V.lensBase * 2 + 'px';
    lens.hidden = true;
    showStage(true);
    syncStageState();
    planOpening();
    startCamera('open');
  }

  // ---------- camera ----------
  function permissionStatus() {
    const s = call('status');
    return typeof s === 'string' ? s : nativeV() ? 'prompt' : 'browser';
  }
  function requestPermission(gen) {
    return new Promise((resolve) => {
      V.permissionWaiter = { gen, resolve };
      if (call('request') === undefined && !nativeV()) resolve('browser');
    });
  }
  function withTimeout(promise, ms_, kind) {
    let timer;
    return Promise.race([promise, new Promise((_, rej) => (timer = setTimeout(() => rej({ name: kind || 'TimeoutError' }), ms_)))]).finally(() => clearTimeout(timer));
  }
  function errorKind(e) {
    const n = (e && e.name) || '';
    if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return nativeV() ? 'webview' : 'denied';
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return 'nocamera';
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'busy';
    if (n === 'TimeoutError') return 'timeout';
    return 'failed';
  }
  async function startCamera(reason) {
    const gen = ++V.gen;
    stopCamera('restart');
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') return fail('unsupported', gen);
    let status = permissionStatus();
    if (status === 'unavailable') return fail('nocamera', gen);
    if (nativeV() && status !== 'granted') {
      if (status === 'blocked' && !V.settingsVisited) return fail('blocked', gen);
      // the opening finishes its beat first; Android's question comes when he is ready to look
      const wait = V.openReadyAt - ms();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (gen !== V.gen || !owned()) return;
      if (!go('CAMERA_PERMISSION', reason)) return;
      planWaiting();
      status = await requestPermission(gen);
      if (gen !== V.gen || !owned()) return;
      if (status !== 'granted') return fail(status === 'blocked' ? 'blocked' : 'denied', gen);
    }
    if (!go('CAMERA_STARTING', reason)) return;
    const holdFor = V.openReadyAt - ms();
    if (holdFor <= 0) planWaiting();
    else setTimeout(() => { if (gen === V.gen && V.state === 'CAMERA_STARTING') planWaiting(); }, holdFor);
    call('arm', true);
    let stream;
    try {
      let expired = false;
      const pending = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
      }).then(result => {
        if (expired || gen !== V.gen || !owned()) result.getTracks().forEach(track => track.stop());
        return result;
      });
      try { stream = await withTimeout(pending, 12000); } finally { expired = true; }
    } catch (e) {
      if (gen !== V.gen) return;
      return fail(errorKind(e), gen);
    }
    if (gen !== V.gen || !owned()) { stream.getTracks().forEach((t) => t.stop()); return; }
    V.stream = stream;
    V.track = stream.getVideoTracks()[0] || null;
    V.stats.started++;
    const video = $('visionVideo');
    video.srcObject = stream;
    try { await withTimeout(video.play(), 4000); } catch {}
    try { await withTimeout(firstFrame(video), 5000); } catch { if (gen === V.gen) return fail('timeout', gen); return; }
    if (gen !== V.gen || !owned()) return;
    if (V.track) V.track.addEventListener('ended', () => { if (gen === V.gen && CAMERA_STATES.includes(V.state)) fail('interrupted', gen); });
    // let the opening finish its beat before the pupil opens onto the world
    const wait = V.openReadyAt - ms();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (gen !== V.gen || !owned()) return;
    if (!go('VISION_ACTIVE', 'ready')) return;
    call('setActive', true);
    planReveal();
    pulseLens('focus-pull', 700);   // 5.0: the world comes into focus as the pupil opens
    detectTorch();
    hint('Point me at a QR code, or take a photo.', 4200);
    if (V.api.keyboard()) setTimeout(() => { if (V.state === 'VISION_ACTIVE') $('visionShutter').focus({ preventScroll: true }); }, 400);
    scheduleScan(120);
  }
  function firstFrame(video) {
    return new Promise((resolve) => {
      if (video.videoWidth > 0 && video.readyState >= 2) return resolve();
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => resolve());
      const check = () => (video.videoWidth > 0 && video.readyState >= 2 ? resolve() : null);
      video.addEventListener('loadeddata', check, { once: true });
      video.addEventListener('playing', check, { once: true });
    });
  }
  function stopCamera(why) {
    clearTimeout(V.scanTimer);
    V.scanTimer = 0;
    if (V.stream) {
      V.stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      V.stats.stopped++;
    }
    V.stream = null;
    V.track = null;
    V.imageCapture = null;
    // stopping the track turns the light off with it; forget it ever was on
    V.torch = false; V.torchOK = false; V.torchBusy = false; V.torchGen = (V.torchGen || 0) + 1;
    const tb = $('visionTorch');
    if (tb) { tb.hidden = true; tb.setAttribute('aria-pressed', 'false'); tb.classList.remove('on'); }
    const video = $('visionVideo');
    if (video) { try { video.pause(); } catch {} video.srcObject = null; }
    call('setActive', false);
    call('arm', false);
  }

  // ---------- QR ----------
  const scanCanvas = document.createElement('canvas');
  let scanCtx = null;
  function scheduleScan(delay) {
    clearTimeout(V.scanTimer);
    V.scanTimer = setTimeout(scanTick, delay);
  }
  const scanAllowed = () => V.state === 'VISION_ACTIVE' && !!V.stream && !document.hidden && !V.capturing && !V.pendingConfirm;
  async function scanTick() {
    V.scanTimer = 0;
    if (!scanAllowed()) return;
    const gen = V.gen, t0 = ms();
    let found = null;
    try { found = await detect(); } catch {}
    if (gen !== V.gen || !scanAllowed()) return;
    V.stats.scans++;
    const dt = ms() - t0, low = V.api.host() && V.api.host().lowPower();
    if (found && found.text != null) {
      if (V.suppress && found.text === V.suppress.text && ms() - V.suppress.seen < 1600) V.suppress.seen = ms();
      else { V.suppress = null; return candidate(found); }
    }
    scheduleScan(Math.max(low ? 420 : 240, dt * 3));
  }
  async function detect() {
    const video = $('visionVideo');
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    // the part of the frame you can see through the round lens
    const side = Math.min(vw, vh) * 0.9, sx = (vw - side) / 2, sy = (vh - side) / 2;
    const low = V.api.host() && V.api.host().lowPower();
    const N = Math.round(Math.min(side, low ? 420 : 560));
    if (scanCanvas.width !== N) { scanCanvas.width = scanCanvas.height = N; scanCtx = null; }
    if (!scanCtx) scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
    scanCtx.drawImage(video, sx, sy, side, side, 0, 0, N, N);
    const toVideo = (p) => ({ x: sx + (p.x * side) / N, y: sy + (p.y * side) / N });
    if (!window.EyesQRScan) return null;
    const r = EyesQRScan.scan(scanCtx.getImageData(0, 0, N, N));
    return r ? { text: r.text, bytes: r.bytes, corners: (r.corners || []).map(toVideo), via: 'eyes' } : null;
  }
  function showTarget(corners) {
    const svg = $('visionTarget'), video = $('visionVideo');
    if (!corners || corners.length < 4 || !video.videoWidth) { svg.classList.remove('on'); return; }
    const D = V.lensBase * 2, vw = video.videoWidth, vh = video.videoHeight, s = D / Math.min(vw, vh);
    svg.setAttribute('viewBox', `0 0 ${D} ${D}`);
    const pts = corners.map((p) => `${((p.x - vw / 2) * s + D / 2).toFixed(1)},${((p.y - vh / 2) * s + D / 2).toFixed(1)}`).join(' ');
    svg.firstChild.setAttribute('points', pts);
    svg.classList.remove('on');
    void svg.getBoundingClientRect();
    svg.classList.add('on');
  }
  function candidate(found) {
    V.stats.decoded++;
    V.pendingConfirm = true;
    showTarget(found.corners);
    react('candidate');
    pulseLens('lock', 520);   // 5.0: the lens rim tightens onto the code
    const gen = V.gen, delay = speed() ? 220 * speed() : 0;
    setTimeout(() => {
      V.pendingConfirm = false;
      if (gen !== V.gen || V.state !== 'VISION_ACTIVE') return;
      if (!go('QR_RESULT', 'decoded')) return;
      react('confirm');
      buzz([12, 40, 18]);   // 5.0: recognised (Android only; no web haptics on iPhone)
      feel('vision-scan', { qr: true });
      hint('', 0);
      showResult(found);
    }, delay);
  }

  // what a decoded payload is, and whether EYES may ever open it
  const NEVER_OPEN = new Set(['javascript', 'vbscript', 'data', 'file', 'content', 'intent', 'android-app', 'blob', 'filesystem', 'about', 'chrome', 'chrome-extension', 'jar', 'view-source', 'ws', 'wss', 'ftp', 'smb', 'market']);
  // invisible and direction-changing characters are shown as nothing, so text can't disguise itself
  const sanitize = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g, '');
  function classify(raw) {
    const text = sanitize(raw), trimmed = text.trim();
    const m = /^([a-zA-Z][a-zA-Z0-9+.\-]{0,31}):/.exec(trimmed);
    if (!trimmed) return { kind: 'empty', text: '' };
    if (m) {
      const scheme = m[1].toLowerCase();
      if ((scheme === 'http' || scheme === 'https') && !/\s/.test(trimmed) && trimmed.length <= 4096) {
        try {
          const u = new URL(trimmed);
          if ((u.protocol === 'https:' || u.protocol === 'http:') && u.hostname)
            return { kind: 'url', url: u, href: u.href, secure: u.protocol === 'https:', userinfo: !!(u.username || u.password), puny: /(^|\.)xn--/i.test(u.hostname), text: trimmed };
        } catch {}
        return { kind: 'text', text, scheme, note: "This looks like a web link, but it isn't a valid one." };
      }
      if (NEVER_OPEN.has(scheme)) return { kind: 'blocked', scheme, text };
      if (!/^\d+$/.test(scheme)) return { kind: 'text', text, scheme, note: 'Not a web link, so EYES only shows it.' };
    }
    return { kind: 'text', text };
  }
  function showResult(found) {
    const box = $('visionResult');
    const info = classify(found.text);
    V.result = { info, text: found.text };
    box.replaceChildren();
    box.dataset.kind = info.kind;
    const actions = el('div', { class: 'vision-actions' });
    const btn = (label, cls, fn) => { const b = el('button', { type: 'button', class: cls || '', text: label }); b.addEventListener('click', fn); actions.append(b); return b; };
    let first;
    if (info.kind === 'url') {
      const u = info.url;
      box.append(el('div', { class: 'vr-eyebrow', text: info.secure ? 'Link' : 'Link · not secure' }));
      box.append(el('div', { class: 'vr-host', text: u.hostname }));
      const path = (u.pathname === '/' ? '' : u.pathname) + (u.search ? u.search : '');
      if (path) box.append(el('div', { class: 'vr-path', text: path.length > 80 ? path.slice(0, 78) + '…' : path }));
      const warns = [];
      if (!info.secure) warns.push("This page isn't encrypted (http). Anyone on the network could read or change it.");
      if (info.userinfo) warns.push('The address hides a name before the real destination. It goes to ' + u.hostname + '.');
      if (info.puny) warns.push('The address uses international characters, shown here in their raw form.');
      for (const w of warns) box.append(el('div', { class: 'vr-warn', text: w }));
      const full = el('button', { type: 'button', class: 'vr-full', 'aria-expanded': 'false', text: 'Show full address' });
      const fullText = el('div', { class: 'vr-fulltext', hidden: true, text: info.href });
      full.addEventListener('click', () => { const open = fullText.hidden; fullText.hidden = !open; full.setAttribute('aria-expanded', String(open)); full.textContent = open ? 'Hide full address' : 'Show full address'; });
      box.append(full, fullText);
      first = btn('Open link', 'primary', () => openLink(info));
      btn('Copy', '', () => copy(info.href));
    } else if (info.kind === 'blocked') {
      box.append(el('div', { class: 'vr-eyebrow', text: 'Not opened' }));
      box.append(el('div', { class: 'vr-warn', text: `This code holds a "${info.scheme}:" link. EYES won't open that kind of link.` }));
      box.append(el('div', { class: 'vr-text', text: info.text.length > 600 ? info.text.slice(0, 600) + '…' : info.text }));
      first = btn('Copy text', '', () => copy(info.text));
    } else if (info.kind === 'empty') {
      box.append(el('div', { class: 'vr-eyebrow', text: 'Empty code' }));
      box.append(el('div', { class: 'vr-text', text: found.bytes && found.bytes.length ? `It holds ${found.bytes.length} bytes that aren't text.` : 'There was nothing written in it.' }));
    } else {
      box.append(el('div', { class: 'vr-eyebrow', text: 'Text' }));
      box.append(el('div', { class: 'vr-text', text: info.text }));
      if (info.note) box.append(el('div', { class: 'vr-note', text: info.note }));
      first = btn('Copy', 'primary', () => copy(info.text));
    }
    const again = btn('Scan again', '', scanAgain);
    if (!first) first = again;
    box.append(actions);
    box.hidden = false;
    placeCard(box);
    box.classList.remove('emerge');
    void box.offsetWidth;
    box.classList.add('emerge');
    if (V.api.keyboard()) first.focus({ preventScroll: true });
  }
  function hideResult() {
    const box = $('visionResult');
    box.hidden = true;
    box.replaceChildren();
    $('visionTarget').classList.remove('on');
  }
  function scanAgain() {
    if (V.state !== 'QR_RESULT') return;
    if (V.result) V.suppress = { text: V.result.text, seen: ms() };
    V.result = null;
    hideResult();
    if (!go('VISION_ACTIVE', 'scan-again')) return;
    react('nudge');
    scheduleScan(260);
    if (V.api.keyboard()) $('visionShutter').focus({ preventScroll: true });
  }
  async function copy(text) {
    let ok = false;
    const r = call('copy', String(text));
    if (r === true) ok = true;
    if (!ok) { try { await navigator.clipboard.writeText(String(text)); ok = true; } catch {} }
    note(ok ? 'Copied.' : "Couldn't copy that.", 1800);
  }
  function openLink(info) {
    // checked again right before leaving EYES: only real http(s) addresses, never anything else
    let u;
    try { u = new URL(info.href); } catch { return note("That address isn't valid.", 2400); }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname) return note("EYES won't open that.", 2400);
    if (!nativeV() && window.EYES_IOS_ABILITIES) {
      try { window.open(u.href, '_blank', 'noopener,noreferrer'); note('Opening link…', 1200); }
      catch(e){ note('Could not open the link. Copy it instead.', 2400); }
      return;
    }
    if (!nativeV()) return note('Links open from EYES on Android.', 2400);
    const href = u.href;
    close_('open-link', true);
    const ok = call('openLink', href);
    if (ok === false) { const h = V.api && V.api.host(); (h ? h.toast : () => {})('No browser answered the link.'); }
  }

  // ---------- 5.0: the light ----------
  // Only where getUserMedia's own track reports torch: true (Chromium on Android, cameras with a flash LED).
  // One constraint, applied only when you tap it, with a timeout; if the camera refuses, the button goes away
  // and the camera keeps running exactly as before. The native bridge is not involved.
  function detectTorch() {
    const tb = $('visionTorch'), track = V.track;
    let ok = false;
    try { const caps = track && track.getCapabilities ? track.getCapabilities() : null; ok = !!(caps && caps.torch === true); } catch { ok = false; }
    V.torchOK = ok; V.torch = false;
    if (tb) { tb.hidden = !ok; tb.setAttribute('aria-pressed', 'false'); tb.classList.remove('on'); }
    syncStageState();
  }
  async function setTorch(on) {
    const track = V.track;
    if (!track || !V.torchOK) return false;
    await withTimeout(track.applyConstraints({ advanced: [{ torch: !!on }] }), 1500);
    let s = null;
    try { s = track.getSettings ? track.getSettings() : null; } catch {}
    return !(s && typeof s.torch === 'boolean' && s.torch !== !!on);
  }
  async function toggleTorch() {
    if (V.state !== 'VISION_ACTIVE' || !V.torchOK || V.torchBusy || !V.track) return;
    const want = !V.torch, gen = V.gen, tg = V.torchGen;
    V.torchBusy = true; syncStageState();
    let ok = false;
    try { ok = await setTorch(want); } catch { ok = false; }
    if (gen !== V.gen || tg !== V.torchGen) return;            // the camera stopped meanwhile: nothing to undo
    V.torchBusy = false;
    const tb = $('visionTorch');
    if (ok) {
      V.torch = want;
      if (tb) { tb.classList.toggle('on', want); tb.setAttribute('aria-pressed', String(want)); }
      buzz(8);
    } else {
      V.torchOK = false; V.torch = false;
      if (tb) tb.hidden = true;
      note("The light isn't available on this camera.", 2400);
    }
    syncStageState();
  }
  // a still photo can reset the camera's settings; put the light back if it was on
  async function restoreTorch() {
    if (!V.torch || !V.track) return;
    try { await setTorch(true); } catch {}
  }

  // ---------- photos ----------
  async function capture(source) {
    if (V.state !== 'VISION_ACTIVE' || V.capturing || !V.track) return;
    if (!go('PHOTO_CAPTURE', source)) return;
    V.capturing = true;
    clearTimeout(V.scanTimer);
    react('shutter');
    buzz(14);   // 5.0
    clearTimeout(V.flashTimer);
    V.flashTimer = setTimeout(() => {
      const f = $('visionFlash');
      f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
      V.flashTimer = setTimeout(() => f.classList.remove('on'), 260);
    }, speed() ? 70 * speed() : 0);
    const gen = V.gen;
    let shot = null;
    try { shot = await takeStill(); } catch {}
    if (gen === V.gen) restoreTorch();
    V.capturing = false;
    if (gen === V.gen && V.state === 'PHOTO_CAPTURE') { go('VISION_ACTIVE', 'captured'); scheduleScan(400); }
    if (!shot || !shot.blob) { if (gen === V.gen) note("The photo didn't come out. Try again.", 2600); return; }
    V.stats.photos++;
    save(shot, gen);
  }
  async function takeStill() {
    const track = V.track, video = $('visionVideo');
    if (!track) return null;
    if ('ImageCapture' in window) {
      try {
        const ic = V.imageCapture || (V.imageCapture = new ImageCapture(track));
        let opts = {};
        try {
          const caps = await withTimeout(ic.getPhotoCapabilities(), 1500);
          if (caps && caps.imageWidth && caps.imageWidth.max) opts = { imageWidth: caps.imageWidth.max, imageHeight: caps.imageHeight.max };
        } catch {}
        const blob = await withTimeout(ic.takePhoto(opts), 8000);
        if (blob && blob.size) return await upright(blob, 'still');
      } catch {}
    }
    // no still-photo pipeline: raise the stream to the camera's largest size for a single frame
    let raised = false;
    const before = track.getSettings ? track.getSettings() : {};
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.width && caps.width.max > (before.width || 0) && caps.height && caps.height.max) {
        await withTimeout(track.applyConstraints({ width: { ideal: caps.width.max }, height: { ideal: caps.height.max } }), 2500);
        raised = true;
        await withTimeout(new Promise((r) => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => r()) : setTimeout(r, 300))), 1500).catch(() => {});
      }
    } catch {}
    const vw = video.videoWidth, vh = video.videoHeight;
    let blob = null;
    if (vw && vh) {
      const c = document.createElement('canvas');
      c.width = vw; c.height = vh;
      c.getContext('2d').drawImage(video, 0, 0, vw, vh);
      blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.93));
      c.width = c.height = 0;
    }
    if (raised && V.track === track) {
      try { await track.applyConstraints({ width: { ideal: before.width || 1280 }, height: { ideal: before.height || 720 } }); } catch {}
    }
    return blob ? { blob, width: vw, height: vh, source: raised ? 'raised-frame' : 'stream-frame' } : null;
  }
  // phones mount rear cameras sideways; if a still comes back sideways compared with what you saw, turn it
  async function upright(blob, source) {
    const video = $('visionVideo');
    let bmp = null;
    try { bmp = await createImageBitmap(blob); } catch { return { blob, source }; }
    const viewPortrait = video.videoHeight > video.videoWidth, shotPortrait = bmp.height > bmp.width;
    if (viewPortrait === shotPortrait || bmp.width === bmp.height) {
      const out = { blob, width: bmp.width, height: bmp.height, source };
      bmp.close && bmp.close();
      return out;                                    // the camera's own bytes, untouched
    }
    const c = document.createElement('canvas');
    c.width = bmp.height; c.height = bmp.width;
    const x = c.getContext('2d');
    x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(bmp, 0, 0);
    bmp.close && bmp.close();
    const turned = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.94));
    const out = { blob: turned || blob, width: c.width, height: c.height, source: source + '-turned' };
    c.width = c.height = 0;
    return out;
  }
  function save(shot, gen) {
    if (window.EYES_IOS_ABILITIES && !nativeV()) {
      const blob=shot.blob;
      if (!blob) { note('Could not prepare photo.',2600);return; }
      const url=URL.createObjectURL(blob), name='EYES_Vision_'+Date.now()+'.jpg';
      const file=new File([blob],name,{type:blob.type||'image/jpeg'});
      const fallback=()=>{const a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';a.click();note('Save your photo from Safari’s downloads.',3000)};
      if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))) {
        navigator.share({files:[file],title:'EYES Vision'}).catch(err=>{if(err.name!=='AbortError')fallback()}).finally(()=>setTimeout(()=>URL.revokeObjectURL(url),20000));
      } else {fallback();setTimeout(()=>URL.revokeObjectURL(url),20000)}
      return;
    }
    if (!nativeV() || typeof nativeV().savePhoto !== 'function') { note('Saving photos needs EYES on Android.', 2600); return; }
    V.pendingSaves++;
    note('Saving…', 0);
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || ''), comma = s.indexOf(',');
      const b64 = comma >= 0 ? s.slice(comma + 1) : '';
      if (!b64) { V.pendingSaves--; note("Couldn't save the photo.", 3000); return; }
      try { nativeV().savePhoto(b64, shot.blob.type || 'image/jpeg'); }
      catch { V.pendingSaves--; note("Couldn't save the photo.", 3000); }
    };
    reader.onerror = () => { V.pendingSaves--; note("Couldn't save the photo.", 3000); };
    reader.readAsDataURL(shot.blob);
  }

  // ---------- full camera (the one deliberate exit from the creature) ----------
  function handoff() {
    if (V.state !== 'VISION_ACTIVE') return;
    ++V.gen;
    stopCamera('handoff');                        // nothing of EYES' camera stays open under the other app
    if (!go('HANDOFF', 'camera-app')) return;
    hideResult();
    hint('', 0);
    const d = planClosing(true);
    setTimeout(() => {
      finish('handoff');
      const ok = call('openCamera');
      if (ok === false || ok === undefined) { const h = V.api && V.api.host(); if (h) h.toast(ok === undefined ? 'The camera app opens from EYES on Android.' : 'No camera app answered.'); }
    }, d + 20);
  }

  // ---------- closing, errors, lifecycle ----------
  function close_(reason, fast) {
    if (!owned() || V.state === 'VISION_CLOSING' || V.state === 'HANDOFF') return;
    const gen = ++V.gen;
    clearTimeout(V.scanTimer);
    call('setActive', false);
    hideResult();
    $('visionMessage').hidden = true;
    hint('', 0);
    if (!go('VISION_CLOSING', reason)) { closeNow(reason); return; }
    const d = planClosing(!!fast);
    // the picture shrinks into the pupil first; the camera stops as soon as it's out of sight
    setTimeout(() => { if (V.gen === gen) stopCamera('closed'); }, Math.min(d, 340 * (speed() || 1)));
    setTimeout(() => { if (V.gen === gen && V.state === 'VISION_CLOSING') finish(reason); }, d + 20);
  }
  function closeNow(reason) {
    ++V.gen;
    stopCamera(reason);
    finish(reason);
  }
  function finish(reason) {
    stopCamera(reason);
    resolvePermissionWaiter('cancelled');
    clearTimeout(V.flashTimer); clearTimeout(V.hintTimer); clearTimeout(V.noteTimer);
    V.pendingConfirm = false;
    V.capturing = false;
    V.result = null;
    V.tracks = null; V.cur = null; V.reactions = [];
    V.state = 'IDLE';
    showStage(false);
    const api = V.api;
    V.api = null;
    if (api) api.done(reason);
  }
  function fail(kind, gen) {
    if (gen !== undefined && gen !== V.gen) return;
    if (!owned()) return;
    ++V.gen;
    stopCamera('error');
    hideResult();
    if (!go('ERROR', kind)) { closeNow('error'); return; }
    planResting();
    showMessage(kind);
  }
  const MESSAGES = {
    denied: ['He needs to see.', 'Allow the camera so Vision can open. Nothing is recorded or sent anywhere.', [['Allow camera', 'retry'], ['Close', 'close']]],
    blocked: ['The camera is switched off for EYES.', 'Turn it on in Settings, under Permissions, then come back.', [['Open Settings', 'settings'], ['Close', 'close']]],
    blockedBack: ['The camera is switched off for EYES.', "If you turned it on, he's ready to look again.", [['Try again', 'retry'], ['Close', 'close']]],
    nocamera: ["He can't find a camera.", "This phone doesn't offer one EYES can use.", [['Close', 'close']]],
    busy: ['Something else is using the camera.', 'Close the other camera app, then try again.', [['Try again', 'retry'], ['Close', 'close']]],
    timeout: ["The camera didn't wake up.", 'Give it a moment and try again.', [['Try again', 'retry'], ['Close', 'close']]],
    failed: ["The camera didn't wake up.", 'Give it a moment and try again.', [['Try again', 'retry'], ['Close', 'close']]],
    interrupted: ['The camera was taken away.', 'Another app or the system closed it.', [['Try again', 'retry'], ['Close', 'close']]],
    webview: ['The camera stayed shut.', 'Android System WebView refused it. Try again, or reopen EYES.', [['Try again', 'retry'], ['Close', 'close']]],
    unsupported: ['Vision needs a newer Android System WebView.', 'Update it from the Play Store, then try again.', [['Close', 'close']]],
    suspended: ['Vision closed while you were away.', 'The camera is off. Open it again when you want him to look.', [['Look again', 'retry'], ['Close', 'close']]]
  };
  function showMessage(kind) {
    const spec = MESSAGES[kind === 'blocked' && V.settingsVisited ? 'blockedBack' : kind] || MESSAGES.failed;
    V.messageKind = kind;
    const box = $('visionMessage');
    box.querySelector('.vm-title').textContent = spec[0];
    box.querySelector('.vm-detail').textContent = spec[1];
    const actions = box.querySelector('.vision-actions');
    actions.replaceChildren();
    spec[2].forEach(([label, action], i) => {
      const b = el('button', { type: 'button', class: i === 0 && action !== 'close' ? 'primary' : '', text: label });
      b.addEventListener('click', () => {
        if (action === 'close') close_('message');
        else if (action === 'settings') { V.settingsVisited = true; call('openSettings'); showMessage('blocked'); }
        else retry();
      });
      actions.append(b);
    });
    box.hidden = false;
    placeCard(box);
    setTimeout(() => { const b = actions.querySelector('button'); if (b && !box.hidden) b.focus({ preventScroll: true }); }, 60);
  }
  function retry() {
    if (V.state !== 'ERROR' && V.state !== 'SUSPENDED') return;
    $('visionMessage').hidden = true;
    V.openReadyAt = ms();
    startCamera('retry');
  }
  function suspend(reason) {
    if (!owned()) return;
    // the permission dialog itself pauses EYES; that is not leaving
    if (V.state === 'CAMERA_PERMISSION' || V.state === 'ERROR' || V.state === 'SUSPENDED') return;
    if (V.state === 'VISION_CLOSING' || V.state === 'HANDOFF') { closeNow(reason); return; }
    ++V.gen;
    stopCamera('suspend');
    hideResult();
    if (!go('SUSPENDED', reason)) { closeNow(reason); return; }
    V.tracks = null;
    planResting();
    showMessage('suspended');
  }
  function interrupt(reason) {
    if (!owned()) return;
    closeNow(reason);
  }
  function back() {
    if (!owned()) return false;
    if (V.state === 'QR_RESULT') { scanAgain(); return true; }
    if (V.state === 'VISION_CLOSING' || V.state === 'HANDOFF') return true;
    close_('back');
    return true;
  }
  function resolvePermissionWaiter(state) {
    const w = V.permissionWaiter;
    V.permissionWaiter = null;
    if (w) w.resolve(state);
  }
  function hint(text, dur) {
    const n = $('visionHint');
    if (!n) return;
    clearTimeout(V.hintTimer);
    n.textContent = text;
    n.classList.toggle('on', !!text);
    if (text && dur) V.hintTimer = setTimeout(() => n.classList.remove('on'), dur);
  }
  function note(text, dur) {
    const n = $('visionNote');
    if (!n) return;
    clearTimeout(V.noteTimer);
    n.textContent = text;
    n.classList.toggle('on', !!text);
    if (text && dur) V.noteTimer = setTimeout(() => { n.classList.remove('on'); }, dur);
  }

  // ---------- from the Android side ----------
  function fromNative(json) {
    let m;
    try { m = typeof json === 'string' ? JSON.parse(json) : json; } catch { return; }
    if (!m || typeof m.type !== 'string') return;
    switch (m.type) {
      case 'permission':
        if (V.permissionWaiter) resolvePermissionWaiter(String(m.state || 'denied'));
        break;
      case 'pause':
        suspend('pause');
        break;
      case 'shutter-key':
        if (V.state === 'VISION_ACTIVE') capture('volume-key');
        break;
      case 'photo':
        V.pendingSaves = Math.max(0, V.pendingSaves - 1);
        if (m.ok) { feel('vision-scan', { photo: true }); if (owned()) pulseLens('saved', 900); }   // 5.0
        if (owned()) note(m.ok ? 'Saved to ' + (m.where || 'Pictures/EYES') + '.' : "Couldn't save the photo" + (m.error ? ': ' + String(m.error).slice(0, 80) : '.'), m.ok ? 2200 : 4000);
        else if (!m.ok) { const h = window.Haven && Haven.abilityHost && Haven.abilityHost(); if (h) h.toast("Couldn't save the photo."); }
        break;
      case 'link':
        if (m.ok === false) { const h = window.Haven && Haven.abilityHost && Haven.abilityHost(); if (h) h.toast('No browser answered the link.'); }
        break;
      case 'camera-app':
        if (m.ok === false) { const h = window.Haven && Haven.abilityHost && Haven.abilityHost(); if (h) h.toast('No camera app answered.'); }
        break;
    }
  }
  addEventListener('resize', () => {
    if (!owned()) return;
    V.targets = computeTargets();
    V.belowKey = '';
    if (ACTIVE_STATES.includes(V.state)) planSteady();
  });

  function available() {
    if (window.EYES_WEB && !window.EYES_IOS_ABILITIES) return false;
    if (window.EYES_IOS_ABILITIES) return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    if (window.EyesVisionNative) return true;
    try { return localStorage.getItem('eyes.vision.preview') === '1'; } catch { return false; }
  }

  window.EyesVision = {
    fromNative,
    diagnostics: () => ({
      state: V.state,
      camera: !!V.stream,
      tracks: V.stream ? V.stream.getTracks().map((t) => t.readyState) : [],
      native: !!nativeV(),
      detector: 'eyes',
      scanning: !!V.scanTimer,
      torch: { available: !!V.torchOK, on: !!V.torch, busy: !!V.torchBusy },
      stats: { ...V.stats },
      targets: V.targets
    }),
    _classify: classify
  };

  const register = () => window.EyesAbility && EyesAbility.register({
    id: 'vision',
    label: 'Vision',
    icon: ICON,
    available,
    entry: 'VISION_OPENING',
    states: {
      VISION_OPENING: ['CAMERA_PERMISSION', 'CAMERA_STARTING', 'VISION_CLOSING', 'ERROR', 'SUSPENDED'],
      CAMERA_PERMISSION: ['CAMERA_STARTING', 'ERROR', 'VISION_CLOSING', 'SUSPENDED'],
      CAMERA_STARTING: ['VISION_ACTIVE', 'ERROR', 'VISION_CLOSING', 'SUSPENDED'],
      VISION_ACTIVE: ['QR_RESULT', 'PHOTO_CAPTURE', 'VISION_CLOSING', 'ERROR', 'SUSPENDED', 'HANDOFF'],
      QR_RESULT: ['VISION_ACTIVE', 'VISION_CLOSING', 'ERROR', 'SUSPENDED'],
      PHOTO_CAPTURE: ['VISION_ACTIVE', 'VISION_CLOSING', 'ERROR', 'SUSPENDED'],
      ERROR: ['CAMERA_PERMISSION', 'CAMERA_STARTING', 'VISION_CLOSING'],
      SUSPENDED: ['CAMERA_PERMISSION', 'CAMERA_STARTING', 'VISION_CLOSING'],
      VISION_CLOSING: [],
      HANDOFF: []
    },
    activate,
    pose,
    fps,
    frame,
    back,
    interrupt,
    suspend
  });
  if (!register()) addEventListener('DOMContentLoaded', register, { once: true });
})();
