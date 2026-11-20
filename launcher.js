'use strict';
(() => {
  const $ = (id) => document.getElementById(id),
    { Presence, ease, mix } = HavenPresence;
  const phone = window.Phone,
    start = performance.now();
  const now = () => performance.now() - start;
  let apps = [],
    notifications = [],
    noticeItem = null,
    noticeUntil = 0,
    noticeHideAt = 0;
  // Calm frame rate: what the eye idles at between blinks, glances and reactions.
  const CALM_FPS = 12;
  let wake = 0,
    pointerActive = false,
    calmFrames = 0,
    drawMs = 0,
    eyeStats = null;
  // Eye stats: sampled every few seconds while the home screen is showing, read out in Settings.
  {
    let mark = { frames: 0, calm: 0, ms: 0, at: performance.now() };
    setInterval(() => {
      const at = performance.now(),
        f = frames - mark.frames;
      if (visibility && !panel && f > 0)
        eyeStats = {
          fps: (f * 1000) / (at - mark.at),
          calm: (calmFrames - mark.calm) / f,
          ms: (drawMs - mark.ms) / f
        };
      mark = { frames, calm: calmFrames, ms: drawMs, at };
    }, 5000);
  }
  function showEyeStats() {
    const el = document.getElementById('eyeStats');
    if (!el) return;
    el.textContent = eyeStats
      ? `${eyeStats.fps.toFixed(0)} frames a second · resting ${Math.round(eyeStats.calm * 100)}% of the time · ${eyeStats.ms.toFixed(1)} ms per frame`
      : 'Spend a few seconds on the home screen, then check back.';
    const m = personality.diagnostics().mood,
      words = [];
    if (personality.diagnostics().asleep) words.push('asleep');
    else {
      if (m.sleepiness > 0.55) words.push('sleepy');
      else if (m.energy > 0.7) words.push('lively');
      if (m.curiosity > 0.55) words.push('curious');
      if (m.content > 0.65) words.push('content');
      if (m.missing > 0.4) words.push('missed you');
    }
    el.textContent += ' · Mood: ' + (words.join(', ') || 'easygoing');
  }
  addEventListener('pointerdown', () => (pointerActive = true), true);
  addEventListener('pointerup', () => (pointerActive = false), true);
  addEventListener('pointercancel', () => (pointerActive = false), true);
  let motion = read('haven.fresh.motion', 'auto'),
    systemMotion = true,
    visibility = true,
    panel = null,
    raf = 0,
    lastFrame = -1000,
    frames = 0;
  let w = 0,
    h = 0,
    dpr = 1,
    model = null,
    lastState = {},
    touchStart = null,
    longTimer = null;
  const canvas = $('world'),
    ctx = canvas.getContext('2d', { alpha: true });
  let musicTone = null,
    captureState = 'off',
    mediaHold = 0;
  // Paused music keeps its controls in the eye for a while, so play is one tap away.
  const PAUSE_LINGER_MS = 180000;
  const captureNoticeSeen = new Set();
  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }
  const core = new Presence(present);
  const eyeDive = createEyeDive();
  const appManager = createHavenAppManager({
    $,
    read,
    save,
    native,
    toast,
    getApps: () => apps,
    dive: (point) => diveInto(point),
    openDrawer: () => openPanel('drawer'),
    hideDrawerForDrag: () => hideDrawerForDrag(),
    hidePanelForOverlay: () => hidePanelForOverlay(),
    restorePanelAfterOverlay: (id) => restorePanelAfterOverlay(id),
    react: livingEvent
  });
  // Tips: each hidden gesture is explained once, when it first matters, while the eye looks at it.
  const tips = createHavenTips({
    read,
    save,
    now,
    look: (point) => {
      const x = Math.max(-1, Math.min(1, (point.x - innerWidth * 0.5) / (innerWidth * 0.39))),
        y = Math.max(-1, Math.min(1, (point.y - innerHeight * 0.49) / (innerHeight * 0.34)));
      core.aim(x, y, now(), 220);
      schedule();
    }
  });
  const eyeCentre = () => ({
    x: innerWidth * 0.5,
    y: innerHeight * 0.49,
    size: Math.min(innerWidth * 0.235, 101, innerHeight * 0.125)
  });
  // Personality: temperament, idle habits, greetings, touch and sleep (personality.js).
  const personality = createPersonality({
    core,
    read,
    save,
    now,
    eye: () => eyeCentre(),
    schedule: () => schedule()
  });
  for (const [type, name] of [
    ['pointerdown', 'down'],
    ['pointermove', 'move'],
    ['pointerup', 'up'],
    ['pointercancel', 'cancel']
  ])
    addEventListener(type, (e) => visibility && !panel && personality.pointer(name, e), true);
  const iris = createIris({
    $,
    now,
    core,
    draw,
    native,
    read,
    save,
    showNotice,
    getIrisApps: () => appManager.irisItems(),
    activateShortcut: (item, point) => appManager.activate(item, null, point),
    dismissMusic: () => dismissMusic(),
    used: (id) => tips.used(id),
    dismissItem: (item) => dismissFromEye(item)
  });
  const skins = createHavenSkins({ read, save, draw, now });
  const eyeDetail = createEyeDetail();
  const link = createHavenLinkUI({
    $,
    native,
    core,
    iris,
    now,
    openPanel,
    getPanel: () => panel,
    draw,
    schedule
  });
  // 3.2 senses: tilt to look, bedside sleep, their eye resting nearby (eyes-senses.js)
  const senses = window.createEyesSenses
    ? createEyesSenses({ core, personality, now, schedule: () => schedule(), eyeCentre, panelOpen: () => !!panel, visible: () => visibility })
    : null;
  // 4.0 play: chase the light, staring contest (eyes-play.js)
  const play = window.createEyesPlay ? createEyesPlay({ core, personality, now, schedule: () => schedule(), eyeCentre }) : null;
  // a game needs the home screen: close The Optic (or any panel) first, which also restarts the draw loop
  if (play) for (const k of ['startLight', 'startStare']) { const f = play[k]; play[k] = (...a) => { if (panel) closePanel(); return f(...a); }; }
  function native(method, ...args) {
    try {
      if (phone && typeof phone[method] === 'function') phone[method](...args);
    } catch {
      toast('Reopen EYES to reconnect to your phone.');
    }
  }
  // Gesture coordinates become an eye direction, not another global color/state mode.
  function livingEvent(kind, point) {
    const t = now(),
      sx = Number(point?.x),
      sy = Number(point?.y);
    const x = Number.isFinite(sx)
      ? Math.max(-1, Math.min(1, (sx - innerWidth * 0.5) / Math.max(1, innerWidth * 0.39)))
      : 0;
    const y = Number.isFinite(sy)
      ? Math.max(-1, Math.min(1, (sy - innerHeight * 0.49) / Math.max(1, innerHeight * 0.34)))
      : 0;
    if (kind === 'follow') core.follow(x, y, t);
    else if (kind === 'place' || kind === 'release') core.releaseFollow(t, kind === 'place');
    else if (kind === 'inspect') core.watch(point?.id || 'target', x, y, t);
    else core.notice(kind, x, y, t);
    if (!core.motion) draw(t);
    schedule();
  }
  function escTime(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function formatDuration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function toast(text) {
    $('toast').textContent = window.EyesBrand ? EyesBrand.text(text) : text;
    $('toast').hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ($('toast').hidden = true), 3500);
  }
  function resize() {
    w = innerWidth;
    h = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(now());
  }
  function setMotion(value) {
    motion = ['auto', 'on', 'gentle', 'off'].includes(value) ? value : 'auto';
    save('haven.fresh.motion', motion);
    $('motion').value = motion;
    syncMotion();
  }
  function syncMotion() {
    // Only Off stops him. Reduced motion (Auto) or Gentle keeps him alive, just calmer.
    const on = motion !== 'off',
      gentle = motion === 'gentle' || (motion === 'auto' && !systemMotion);
    document.documentElement.dataset.motion = on ? 'on' : 'off';
    core.setGentle(gentle);
    core.setMotion(on, now());
    stopLoop();
    raf = 0;
    draw(now());
    schedule();
  }
  let homeHeld = false;   // 4.1: a full-screen scene (Eye Contact) covers him; nothing to draw
  function eyeCanAnimate() {
    if (homeHeld) return false;
    return (
      !panel ||
      panel === 'inbox' ||
      panel === 'linkSheet' ||
      (panel === 'drawer' && !$('drawer').classList.contains('expanded'))
    );
  }
  function schedule() {
    if (wake) {
      clearTimeout(wake);
      wake = 0;
      raf = 0;
    }
    if (!raf && visibility && core.motion && eyeCanAnimate()) raf = requestAnimationFrame(loop);
  }
  function loop() {
    raf = 0;
    if (!visibility || !core.motion || !eyeCanAnimate()) return;
    eyeDive.check(now(), visibility);
    const t = now(),
      grooving =
        core.mode === 'music' &&
        core.state.media?.playing &&
        !core.state.saver &&
        core.state.battery > 20,
      profileFps = HavenPresence.profile(core.state).fps,
      calm =
        !pointerActive &&
        !iris.flinging() &&
        !eyeDive.active(t) &&
        !(core.mode === 'music' && core.state.media?.playing) &&
        !core.busy(t) &&
        !(window.HavenLife && HavenLife.busy(t)) &&
        !(play && play.busy()),
      fps = eyeDive.active(t)
        ? 60
        : grooving
          ? 45
          : calm
            ? Math.min(core.asleep ? CALM_FPS / 2 : CALM_FPS, profileFps)
            : core.stage === 'rest' && !core.activeReaction(t)
              ? profileFps
              : core.state.saver || core.state.battery <= 20
                ? profileFps
                : 45;
    // Asleep, even his dreams stay gentle on the battery.
    const rate = core.asleep ? Math.min(fps, 15) : fps;
    if (t - lastFrame >= 1000 / rate - 1) {
      lastFrame = t;
      const started = performance.now();
      draw(t);
      drawMs += performance.now() - started;
      frames++;
      if (calm) calmFrames++;
    }
    // At low frame rates, sleep until the next frame instead of waking on every display refresh.
    const wait = lastFrame + 1000 / rate - now();
    if (wait > 20) {
      raf = -1;
      wake = setTimeout(() => {
        wake = 0;
        raf = 0;
        schedule();
      }, wait - 10);
    } else schedule();
  }
  // Anything that calls schedule() wakes a sleeping loop at once, so reactions start without delay.
  function stopLoop() {
    cancelAnimationFrame(raf);
    clearTimeout(wake);
    raf = 0;
    wake = 0;
  }
  function draw(t) {
    model = core.sample(t);
    if (!ctx || !w) return;
    // The body grooves: a bob on the beat and a sway every two beats, shaped by Music energy.
    const groove = model.music > 0.001 ? iris.groove(t) : null;
    model.groove = groove;
    if (groove) {
      const mm = HavenPresence.ease(model.music),
        shape = { drift: [0.45, 0.05, 4], flow: [0.75, 0.032, 3], pulse: [1.05, 0.02, 2] }[
          groove.mood
        ] || [0.75, 0.03, 3];
      const [bob, sway, swayPx] = shape,
        pp = model.pose,
        b = groove.beat * bob * mm;
      pp.sy *= 1 - 0.06 * b;
      pp.sx *= 1 + 0.042 * b;
      pp.y += 4 * b;
      pp.tilt += sway * groove.sway * mm * groove.play;
      pp.x += swayPx * groove.sway * mm * groove.play;
      pp.glow *= 1 + 0.12 * b + 0.35 * groove.drop + 0.1 * groove.resume;
      pp.focus *= 1 + 0.03 * b + 0.06 * groove.drop;
    }
    // Quirks: its own little habits, only while it is resting and nothing else is happening.
    if (window.HavenLife)
      HavenLife.apply(
        model,
        t,
        core.motion &&
          core.stage === 'rest' &&
          core.mode !== 'music' &&
          core.mode !== 'alert' &&
          !core.asleep &&
          !core.activeReaction(t) &&
          !eyeDive.active(t) &&
          !panel
      );
    const diveHome = { x: w * 0.5, y: h * 0.49 },
      diveSize = Math.min(w * 0.235, 101, h * 0.125),
      dived = eyeDive.apply(model.pose, t, diveHome, diveSize);
    model.dive = eyeDive.phase;
    const v = model,
      p = v.pose,
      breathing = v.breathe,
      m = ease(v.music),
      cx = w * 0.5 + v.gaze.x * 3 + p.x,
      cy = h * 0.49 + v.gaze.y * 2 - v.lift * 7 + p.y;
    const focusAmount = iris.focusAmount(t);
    const liveAudio = iris.capturedFrame(t);
    model.musicCapture = iris.captureInfo(t);
    musicTone = iris.toneAt(t);
    model.musicPalette = {
      source: musicTone.source,
      primary: musicTone.primary,
      secondary: musicTone.secondary,
      strength: musicTone.strength
    };
    model.musicMood = iris.moodShape();
    model.eyeSkin = skins.value;
    const size =
        Math.min(w * 0.235, 101, h * 0.125) *
        (1 + focusAmount * 0.115) *
        (1 + (liveAudio?.bass || 0) * 0.06),
      rx = mix(size, size * 1.18, m) * (1 + breathing * 0.014 + v.lift * 0.025),
      ry = mix(size * 1.055, size * 1.015, m) * (1 + breathing * 0.021 + v.lift * 0.035);
    ctx.clearRect(0, 0, w, h);
    const tintNow = (intensity, alpha) => color(v, intensity, alpha),
      material = skins.palette(),
      DNA = window.HavenDNA,
      ownColours = skins.value === 'original',
      lowPower = core.state.saver || core.state.battery <= 20;
    // Lids open fully while music controls live inside the eye.
    const vibe = groove
      ? (() => {
          const b = groove.beat,
            q = { drift: [0.24, 0.1, 0.15], flow: [0.1, 0.04, 0.3], pulse: [0.05, 0.02, 0.42] }[
              groove.mood
            ] || [0.1, 0.04, 0.3];
          const playing = [q[0], q[1] + q[2] * b],
            paused = [0.3, 0.06];
          return [
            mix(paused[0], playing[0], groove.play),
            mix(paused[1], playing[1], groove.play)
          ].map((x) => x * (1 - focusAmount));
        })()
      : [0, 0];
    const lids = {
        upper: mix(Math.min(1, (v.eye?.upper || 0) + (DNA ? DNA.lid() : 0)), vibe[0], m),
        lower: mix(v.eye?.lower || 0, vibe[1], m)
      },
      pupilScale = mix(v.eye?.pupil || 1, 1, m) * (DNA ? DNA.looks().pupil : 1);
    model.lids = lids;
    const volumeShading = iris.shading(t);
    // One renderer for every eye (eye-render.js): the home screen adds its music and skin layers.
    const drawn = HavenRender.paintEye(ctx, {
      cx, cy, size, rx, ry, pose: p, gaze: v.gaze, lids, pupilScale, t, music: m,
      light: v.light, breathing, sleepDim: v.eye?.sleep || 0, energy: v.energy,
      color: tintNow, material, own: ownColours, motion: core.motion, lowPower,
      haloBoost: (groove?.beat || 0) * 0.6 + (groove?.drop || 0),
      irisLightK: volumeShading === null ? 1 : mix(1, 0.44 + 0.56 * volumeShading.level, volumeShading.amount),
      irisScaleK: volumeShading === null ? 1 : mix(1, 0.82 + volumeShading.level * 0.32, volumeShading.amount),
      hooks: {
        paintBody: (c, o) => skins.paintBody(c, { ...o, motion: core.motion, lowPower }),
        paintSkinIris: (c, o) => skins.paintIris(c, { ...o, motion: core.motion, gaze: v.gaze, pose: p, music: m, lowPower }),
        paintMaterial: (c, o) => paintLivingMaterial(c, { ...o, v, music: m, lowPower }),
        // Music filaments are painted inside the existing clipped iris, not layered above it.
        paintMusic: (c, o) => {
          model.musicVisualizer = iris.paintMusic(c, {
            t, morph: m, size, gx: o.gx, gy: o.gy,
            tint: (intensity, alpha) => color(v, intensity, alpha),
            accentTint: (intensity, alpha) => color(v, intensity, alpha, true),
            still: !core.motion, lowPower
          });
        },
        paintMusicPupil: (ctx, { gx, gy, light }) => {
      // The pupil divides into two soft luminous lobes; there is no button disc.
          ctx.save();
          ctx.globalAlpha = m;
          const lobeLight = ctx.createLinearGradient(0, gy - size * 0.14, 0, gy + size * 0.14);
          lobeLight.addColorStop(0, color(v, 0.94, light * 0.45));
          lobeLight.addColorStop(0.5, `rgba(222,253,246,${light * 0.94})`);
          lobeLight.addColorStop(1, color(v, 0.94, light * 0.4));
          ctx.fillStyle = lobeLight;
          ctx.shadowColor = color(v, 0.9, 0.55);
          ctx.shadowBlur = size * 0.1;
          const play = groove ? groove.play : 1,
            beatPop = groove ? groove.beat * 0.14 : 0,
            slide = groove ? groove.skip * size * 0.13 : 0,
            px = gx + slide;
          const split = size * 0.064 * m,
            barW = mix(size * 0.12, size * 0.052, m),
            barH = mix(size * 0.04, size * 0.245, m) * (1 + beatPop) * mix(0.35, 1, play);
          ctx.globalAlpha = m * play * (1 - 0.5 * Math.abs(groove ? groove.skip : 0));
          capsule(px - split - barW / 2, gy - barH / 2, barW, barH);
          ctx.fill();
          capsule(px + split - barW / 2, gy - barH / 2, barW, barH);
          ctx.fill();
          // Paused: the two lobes melt into a soft play triangle that breathes while it waits.
          if (play < 0.999) {
            const k = 1 - play,
              s = size * (0.6 + 0.4 * k) * (1 + 0.035 * breathing);
            ctx.globalAlpha = m * k;
            ctx.beginPath();
            ctx.moveTo(px - s * 0.075, gy - s * 0.12);
            ctx.lineTo(px + s * 0.12, gy);
            ctx.lineTo(px - s * 0.075, gy + s * 0.12);
            ctx.closePath();
            ctx.lineJoin = 'round';
            ctx.lineWidth = size * 0.05;
            ctx.strokeStyle = lobeLight;
            ctx.stroke();
            ctx.fill();
          }
          ctx.restore();
          const spread = size * 0.66 * ease(m),
            fold = size * 0.125 * ease(m),
            foldAlpha = ease((m - 0.18) / 0.82);
          for (const side of [-1, 1]) {
            ctx.save();
            const disabled =
              side < 0 ? core.state.media?.previous === false : core.state.media?.next === false;
            ctx.globalAlpha = foldAlpha * (disabled ? 0.24 : 1);
            const foldLight = ctx.createRadialGradient(gx, gy, 0, gx, gy, size * 1.05);
            foldLight.addColorStop(0, color(v, 1.08, light * 0.8));
            foldLight.addColorStop(0.55, color(v, 1.04, light * 0.7));
            foldLight.addColorStop(0.85, color(v, 0.75, light * 0.26));
            foldLight.addColorStop(1, color(v, 0.55, 0));
            ctx.fillStyle = foldLight;
            ctx.shadowColor = color(v, 0.85, 0.2);
            ctx.shadowBlur = size * 0.018;
            irisFold(gx + side * spread, gy, fold, side);
            ctx.fill();
            // Luminous veins grow with each petal: directions without pasted-on buttons.
            if (foldAlpha > 0.1) {
              const px = gx + side * spread;
              ctx.beginPath();
              ctx.moveTo(px - side * size * 0.035, gy - size * 0.048);
              ctx.lineTo(px + side * size * 0.03, gy);
              ctx.lineTo(px - side * size * 0.035, gy + size * 0.048);
              ctx.lineWidth = Math.max(1.3, size * 0.018);
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.strokeStyle = color(v, 1.35, foldAlpha * (disabled ? 0.2 : 0.6));
              ctx.stroke();
            }
            ctx.restore();
          }
                }
      }
    });
    const { gx, gy, irisOpacity } = drawn;
    eyeDive.paint(ctx, t, diveHome, diveSize, (intensity, alpha) => color(v, intensity, alpha));
    if (groove)
      iris.paintRings(ctx, {
        t,
        cx,
        cy,
        size: size * mix(1, 1.12, m),
        tint: (intensity, alpha) => color(v, intensity, alpha),
        lowPower: core.state.saver || core.state.battery <= 20
      });
    const signal =
      core.activeReaction(t) && core.reaction?.name?.startsWith('link-') ? core.reaction : null;
    model.linkEffect = signal
      ? { name: signal.name, amount: clamp((t - signal.at) / signal.duration) }
      : null;
    if (senses) senses.paint(ctx, { t, cx, cy, size, linkActive: !!signal });
    if (play) { play.tick(t); play.paint(ctx, t); }
    if (signal) paintLinkEnergy(t, cx, cy, size, signal, v);
    paintPersonality(t, cx, cy, size, v);
    // Folder connections extend the iris outward into actual touchable app nodes.
    const orbit = appManager.constellation();
    model.constellation = orbit
      ? { active: true, count: orbit.points.length, points: orbit.points }
      : null;
    if (orbit) paintConstellation(orbit, t, v, cx, cy, size);
    // A real-media progress ring sits just outside the eye's clipped edge.
    model.musicFocus = iris.focusState(t);
    if (focusAmount > 0.002)
      model.musicFocus.visual = iris.paintFocus(ctx, {
        t,
        cx,
        cy,
        size,
        gx,
        gy,
        pose: p,
        tint: (intensity, alpha) => color(v, intensity, alpha),
        amount: focusAmount
      });
    const detail = $('musicFocusDetails');
    const showFocus = focusAmount > 0.008 && m > 0.5 && !$('music').hidden;
    detail.hidden = !showFocus;
    $('home').classList.toggle('music-focus', showFocus);
    $('playPause').setAttribute('aria-expanded', String(showFocus));
    if (showFocus) {
      const belowEye = h * 0.49 + size * 1.48;
      const lowest = h - (h < 650 ? 105 : 160);
      detail.style.top = Math.max(h * 0.49 + size * 1.22, Math.min(belowEye, lowest)) + 'px';
      detail.style.opacity = String(Math.min(1, focusAmount * 1.3));
      const timeline = iris.musicProgress(t);
      $('focusTimeline').hidden = !timeline;
      if (timeline) {
        const elapsed = formatDuration(timeline.positionMs),
          duration = formatDuration(timeline.durationMs);
        if ($('focusElapsed').textContent !== elapsed) $('focusElapsed').textContent = elapsed;
        if ($('focusDuration').textContent !== duration) $('focusDuration').textContent = duration;
      }
    }
    const screen = (x, y) => ({
      x: cx + x * p.sx * Math.cos(p.tilt) - y * p.sy * Math.sin(p.tilt),
      y: cy + x * p.sx * Math.sin(p.tilt) + y * p.sy * Math.cos(p.tilt)
    });
    const glint = screen(size * 0.74, -size * 0.74);
    iris.layout({
      cx: w * 0.5,
      cy: h * 0.49,
      size,
      width: w,
      height: h,
      glintX: glint.x,
      glintY: glint.y,
      eyeX: cx,
      eyeY: cy,
      eyeRX: rx * p.sx,
      eyeRY: ry * p.sy,
      tilt: p.tilt,
      music: m,
      diving: dived.diving
    });
    iris.paint(ctx, (intensity, alpha) => color(v, intensity, alpha));
    if (v.music > 0.001 || !$('music').hidden) {
      const positions = [
        screen(gx - size * 0.66 * ease(m), gy),
        screen(gx, gy),
        screen(gx + size * 0.66 * ease(m), gy)
      ];
      ['previous', 'playPause', 'next'].forEach((id, i) => {
        $(id).style.left = positions[i].x + 'px';
        $(id).style.top = positions[i].y + 'px';
        $(id).style.pointerEvents = $(id).disabled || (i !== 1 && v.music < 0.7) ? 'none' : 'auto';
      });
      $('track').style.top = h * 0.49 + size * 1.37 + 'px';
      $('artist').style.top = h * 0.49 + size * 1.37 + 19 + 'px';
      model.musicGeometry = {
        irisOpacity,
        bodyWidth: rx * 2 * p.sx,
        bodyHeight: ry * 2 * p.sy,
        controls: positions
      };
    }
    if (core.ripple && core.motion) {
      const u = clamp((t - core.ripple.at) / 650);
      if (u >= 1) core.ripple = null;
      else {
        ctx.beginPath();
        ctx.arc(core.ripple.x, core.ripple.y, 3 + ease(u) * 47, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(161,217,222,${(1 - u) * 0.23})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    if (noticeUntil && t > noticeUntil) hideNotice(t);
    if (noticeHideAt && t >= noticeHideAt) {
      $('notice').hidden = true;
      noticeHideAt = 0;
    }
  }
  // Living material, driven by the same reaction clock as the body and lids.
  // This light is *inside* the iris clip: no separate rings or icons pasted on top.
  // Nearly invisible at rest; dimmed on low battery and absent when Motion is Off.
  function paintLivingMaterial(ctx, { gx, gy, irisRadius, size, t, v, music, lowPower }) {
    const material = v.material;
    if (!core.motion || !material || music > 0.85) return;
    const amount = clamp(material.activity * (1 - music) * (lowPower ? 0.42 : 1));
    if (amount < 0.035) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(gx, gy, irisRadius * 0.95, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    // A directed light pool moves through the translucent material rather than
    // changing the entire eye's brightness. More curious / excited = more depth.
    const lightX = gx + material.direction * irisRadius * 0.29,
      lightY = gy - irisRadius * (0.13 + material.depth * 0.18);
    const bloom = ctx.createRadialGradient(lightX, lightY, irisRadius * 0.045,
      lightX, lightY, irisRadius * 0.96);
    bloom.addColorStop(0, color(v, 1.2, 0.16 * amount));
    bloom.addColorStop(0.45, color(v, 0.93, 0.095 * amount));
    bloom.addColorStop(1, color(v, 0.65, 0));
    ctx.fillStyle = bloom;
    ctx.fillRect(gx - irisRadius, gy - irisRadius, irisRadius * 2, irisRadius * 2);
    // Charging feeds light upward through the glass: a travelling current,
    // never a permanently spinning screensaver swirl.
    if (material.charging || material.kind === 'charge') {
      const y = gy + irisRadius * (0.85 - 1.7 * material.flow),
        feed = ctx.createRadialGradient(gx, y, 0, gx, y, irisRadius * 0.75);
      feed.addColorStop(0, color(v, 1.3, 0.24 * amount));
      feed.addColorStop(0.55, color(v, 1.05, 0.08 * amount));
      feed.addColorStop(1, color(v, 0.7, 0));
      ctx.fillStyle = feed;
      ctx.fillRect(gx - irisRadius, gy - irisRadius, irisRadius * 2, irisRadius * 2);
    }
    // Short translucent veining bends toward his attention. It appears only
    // during meaningful reactions and remains very cheap to render.
    if (!lowPower && material.pulse > 0.12) {
      const rotation = material.direction * 0.26 + material.pulse * 0.13;
      ctx.translate(gx, gy);
      ctx.rotate(rotation);
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        const r = irisRadius * (0.49 + i * 0.18);
        ctx.ellipse(0, 0, r, r * (0.82 + 0.05 * i), 0,
          -1.25 + i * 1.5, 0.1 + i * 1.55);
        ctx.strokeStyle = color(v, 1.38, (0.09 - i * 0.017) * amount);
        ctx.lineWidth = Math.max(1, size * 0.018);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // Personality light: the firefly he watches, and the warm ripple when he's petted.
  function paintPersonality(t, cx, cy, size, v) {
    if (!core.activeReaction(t)) return;
    const r = core.reaction,
      u = clamp((t - r.at) / r.duration);
    if (r.name !== 'firefly' && r.name !== 'pet') return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const dot = (x, y, rad, rgb, a) => {
      if (a <= 0.004) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(0.35, `rgba(${rgb},${a * 0.4})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    };
    if (r.name === 'firefly') {
      const f = HavenPresence.fireflyAt(u),
        x = cx + f.x * size * 1.5,
        y = cy + f.y * size * 1.3,
        blinkOn = 0.45 + 0.55 * Math.abs(Math.sin(t / 210)),
        fade = Math.min(1, u / 0.08, (1 - u) / 0.08);
      dot(x, y, size * 0.34, '215,255,160', 0.42 * blinkOn * fade);
      dot(x, y, size * 0.085, '250,255,225', 1 * blinkOn * fade);
    } else {
      for (let i = 0; i < 2; i++) {
        const k = clamp((u - 0.15 - i * 0.22) / 0.55);
        if (k <= 0 || k >= 1) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, size * (0.3 + 0.75 * k), 0, Math.PI * 2);
        ctx.lineWidth = size * 0.12 * (1 - k);
        ctx.strokeStyle = color(v, 1.25, 0.16 * (1 - k));
        ctx.stroke();
      }
      dot(cx, cy, size * 1.6, '255,225,200', 0.12 * Math.sin(Math.PI * u));
    }
    ctx.restore();
  }
  // HAVEN LINK light, drawn by link-effects.js in the eye's own soft-glass style.
  const linkFx = createLinkEffects();
  function paintLinkEnergy(t, cx, cy, size, r, v) {
    const spark = r.name.includes('spark'),
      calm = r.name.includes('calm');
    let hue = spark ? [255, 200, 126] : calm ? [169, 190, 255] : skins.palette().link;
    // LINK friends: their signals arrive in their HAVEN's colours, yours leave in yours,
    // and their real HAVEN peeks in from the friend's corner while a signal travels.
    const F = window.HavenFriend,
      kind = spark ? 'spark' : calm ? 'calm' : 'pulse',
      incoming = /-in$|receive|hello/.test(r.name),
      ownColours = skins.value === 'original';
    let friendHue = null;
    if (F) {
      if (r.name === 'link-resonance') {
        if (ownColours) hue = F.ownHue('pulse', hue);
        friendHue = F.has() ? F.hueFor('pulse', [255, 214, 150]) : null;
      } else if (incoming) hue = F.hueFor(kind, hue);
      else if (ownColours) hue = F.ownHue(kind, hue);
      F.paintCameo(ctx, { t, r, cx, cy, size });
      if (incoming && senses) senses.friendSignal();
    }
    linkFx.paint(ctx, { t, r, cx, cy, size, hue, friendHue });
  }
  function paintConstellation(orbit, t, v, cx, cy, size) {
    if (!orbit.points.length) return;
    const opening = core.motion ? ease((performance.now() - orbit.openedAt) / 680) : 1;
    const radius = size * 0.97;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    for (let i = 0; i < orbit.points.length; i++) {
      const node = orbit.points[i],
        dist = Math.hypot(node.x, node.y) || 1;
      const ux = node.x / dist,
        uy = node.y / dist;
      const startX = cx + ux * radius,
        startY = cy + uy * radius;
      const endX = cx + node.x * 0.83,
        endY = cy + node.y * 0.83;
      const bend = (i % 2 ? 1 : -1) * size * 0.11;
      const ctrlX = (startX + endX) / 2 - uy * bend,
        ctrlY = (startY + endY) / 2 + ux * bend;
      const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      gradient.addColorStop(0, color(v, 1.12, 0.25 * opening));
      gradient.addColorStop(1, color(v, 0.9, 0.025 * opening));
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(endX, endY, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = color(v, 1.3, 0.38 * opening);
      ctx.fill();
    }
    // A single organic reveal ripple moves outward, then becomes still.
    if (core.motion) {
      const travel = clamp((performance.now() - orbit.openedAt) / 830);
      if (travel < 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, size * (0.74 + 1.04 * ease(travel)), -Math.PI * 0.92, -Math.PI * 0.08);
        ctx.lineWidth = 1.5 * (1 - travel);
        ctx.strokeStyle = color(v, 1.2, 0.24 * (1 - travel));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function capsule(x, y, width, height) {
    const r = Math.min(width, height) / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function irisFold(x, y, h, side) {
    ctx.beginPath();
    ctx.moveTo(x - side * h * 0.35, y - h);
    ctx.bezierCurveTo(
      x - side * h * 0.6,
      y - h * 0.94,
      x - side * h * 0.2,
      y - h * 0.45,
      x + side * h * 0.48,
      y
    );
    ctx.bezierCurveTo(
      x - side * h * 0.2,
      y + h * 0.45,
      x - side * h * 0.6,
      y + h * 0.94,
      x - side * h * 0.35,
      y + h
    );
    ctx.quadraticCurveTo(x - side * h * 0.1, y + h * 0.98, x + side * h * 0.81, y + h * 0.09);
    ctx.quadraticCurveTo(x + side * h * 0.88, y, x + side * h * 0.81, y - h * 0.09);
    ctx.quadraticCurveTo(x - side * h * 0.1, y - h * 0.98, x - side * h * 0.35, y - h);
    ctx.closePath();
  }
  function clamp(n, a = 0, b = 1) {
    return Math.max(a, Math.min(b, n));
  }
  function color(v, mult, alpha, alternate = false) {
    return skins.color(v, mult, alpha, alternate, musicTone, v.music);
  }
  function present(event, mode) {
    const music = mode === 'music';
    clearTimeout(present.musicTimer);
    if (music) {
      $('music').hidden = false;
      $('coreHit').hidden = true;
      void $('music').offsetWidth;
      $('music').classList.add('shown');
      updateTrack();
    } else {
      $('music').classList.remove('shown');
      const finish = () => {
        $('music').hidden = true;
        $('coreHit').hidden = false;
      };
      if (!core.motion) finish();
      else present.musicTimer = setTimeout(finish, 420);
    }
    if (['call', 'alarm', 'timer'].includes(event?.kind)) {
      clearTimeout(present.alertTimer);
      present.alertTimer = setTimeout(() => {
        if (core.mode === 'alert') {
          core.mode = core.desired;
          core.until = 0;
          core.request({ kind: 'state', mode: core.desired, vector: { x: 0, y: 0 } }, now());
          if (!core.motion) draw(now());
          schedule();
        }
      }, 5500);
    }
    if (event?.item) showNotice(event.item, event.important ? 7000 : 4500);
    if (event?.kind === 'morning') {
      showNotice(
        {
          app: 'Good morning',
          title: new Date().toLocaleDateString([], {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
          }),
          text: lastState.alarm
            ? `Next alarm at ${escTime(lastState.alarm)}`
            : 'A quiet start. Your day is here.'
        },
        6500
      );
    }
  }
  function showNotice(item, ms) {
    $('home').dataset.notice = 'shown';
    noticeItem = item;
    $('noticeApp').textContent = item.app || '';
    $('noticeTitle').textContent = item.title || 'New notification';
    $('noticeText').textContent = item.text || '';
    $('notice').hidden = false;
    $('notice').classList.remove('shown');
    void $('notice').offsetWidth;
    $('notice').classList.add('shown');
    noticeUntil = now() + ms;
    noticeHideAt = 0;
    setTimeout(() => {
      if ($('notice').hidden || !noticeItem) return;
      const r = $('notice').getBoundingClientRect();
      tips.offer(
        'swipeNotice',
        'Swipe it away to clear it',
        { x: r.left + r.width / 2, y: r.bottom },
        'below',
        { force: true }
      );
    }, 600);
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => {
      hideNotice(now());
      if (!core.motion) {
        $('notice').hidden = true;
        noticeHideAt = 0;
      }
    }, ms);
  }
  function hideNotice(t) {
    $('home').dataset.notice = '';
    noticeUntil = 0;
    $('notice').classList.remove('shown');
    noticeHideAt = t + (core.motion ? 420 : 0);
    clearTimeout(hideNotice.timer);
    hideNotice.timer = setTimeout(
      () => {
        $('notice').hidden = true;
        noticeHideAt = 0;
      },
      core.motion ? 420 : 0
    );
  }
  function updateTrack() {
    const m = core.state.media || {};
    $('track').textContent = m.title || 'Now playing';
    $('artist').textContent = m.artist || '';
    $('focusTitle').textContent = m.title || 'Now playing';
    $('focusArtist').textContent = m.artist || '';
    $('previous').disabled = m.previous === false;
    $('next').disabled = m.next === false;
    $('playPause').setAttribute('aria-label', m.playing ? 'Pause' : 'Play');
  }
  function updateTime() {
    const d = new Date();
    $('clock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    $('date').textContent = d.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }
  function receive(data) {
    const t = now();
    switch (data.type) {
      case 'system': {
        const previousHour = lastState.hour;
        lastState = data;
        systemMotion = data.systemMotion !== false;
        syncMotion();
        core.update(
          { battery: data.battery, charging: data.charging, saver: data.saver, hour: data.hour },
          t
        );
        $('battery').textContent = `${data.charging ? '↳ ' : ''}${data.battery}%`;
        $('nextAlarm').hidden = !data.alarm;
        $('nextAlarm').textContent = data.alarm ? `Alarm · ${escTime(data.alarm)}` : '';
        $('homeStatus').textContent = data.isHome
          ? 'Your default home'
          : 'Choose your default launcher';
        $('accessStatus').textContent = data.access
          ? 'Connected · notifications & music'
          : 'Allow notifications & music';
        updateTime();
        if (panel === 'inbox') renderInbox();
        if (
          data.hour >= 6 &&
          data.hour < 11 &&
          (previousHour === undefined || previousHour < 6 || previousHour >= 11)
        ) {
          const key = 'haven.fresh.morning.' + new Date().toDateString();
          if (!read(key, false)) {
            save(key, true);
            core.request({ kind: 'morning', vector: { x: 0, y: -0.4 }, important: true }, t);
          }
        }
        break;
      }
      case 'media': {
        const prev = core.state.media || {};
        const sameTrack =
          (prev.title || '') === (data.title || '') && (prev.artist || '') === (data.artist || '');
        // Put-away controls stay away until a new song or a fresh press of play.
        const hidden = Boolean(
          prev.hidden && data.available && sameTrack && !(data.playing && !prev.playing)
        );
        const holdUntil =
          hidden || data.playing || !data.available
            ? 0
            : prev.playing
              ? Date.now() + PAUSE_LINGER_MS
              : prev.holdUntil || 0;
        const media = { ...data, holdUntil, hidden };
        clearTimeout(mediaHold);
        if (holdUntil)
          mediaHold = setTimeout(
            () => {
              core.update({ media: { ...core.state.media, holdUntil: 0 } }, now());
              if (!core.motion) draw(now());
              schedule();
            },
            holdUntil - Date.now() + 60
          );
        iris.updateVolume(data.playing ? data.volume : null);
        iris.updateMusic(data, t);
        const old = core.state.media?.playing;
        core.update({ media }, t);
        if (data.playing && !tips.seen('music'))
          setTimeout(() => {
            if (panel || !visibility || core.mode !== 'music') return;
            const e = eyeCentre();
            tips.offer(
              'music',
              'Swipe sideways to skip · Back to put it away',
              { x: e.x, y: e.y - e.size * 1.25 },
              'above'
            );
          }, 1600);
        if (old === data.playing && core.mode === 'music') updateTrack();
        break;
      }
      case 'mediaVolume':
        iris.updateVolume(data.volume, true);
        break;
      case 'havenLink':
        link.handle(data);
        break;
      case 'audioCapture': {
        const oldCaptureState = captureState;
        iris.updateCapture(data, t);
        captureState = data.state;
        if (captureState === 'permission' && oldCaptureState !== 'permission')
          captureNoticeSeen.clear();
        const labels = {
          off: 'Off · The iris uses its usual music animation',
          permission: 'Android audio permission requested',
          consent: 'Android capture approval requested',
          starting: 'Starting on-device playback analysis…',
          ready: 'Listening · Checking whether playback is capturable',
          live: 'Live · The iris reacts to actual playback frequencies',
          silent: 'No capturable playback · Using the usual music animation',
          unavailable: 'Playback capture unavailable · Using the usual animation',
          denied: 'Permission not granted · Using the usual animation',
          unsupported: 'Requires Android 10 or newer'
        };
        const pending = ['permission', 'consent', 'starting'].includes(captureState);
        const engaged = ['ready', 'live', 'silent'].includes(captureState);
        $('liveAudioStatus').textContent = labels[captureState] || labels.off;
        $('liveAudioToggle').disabled = pending;
        $('liveAudioToggle').textContent = engaged
          ? 'Stop Live Audio'
          : pending
            ? 'Requesting…'
            : 'Start Live Audio';
        $('liveAudioToggle').dataset.on = String(engaged);
        $('liveAudioToggle').setAttribute(
          'aria-label',
          engaged ? 'Stop live playback capture' : 'Start live playback capture'
        );
        // Say what happened once per session; never leave the user facing a silent prompt.
        const announcement = {
          ready: 'Playback capture started. Return to the eye to watch it react.',
          live: 'Real audio detected. The Eye is reacting to the music.',
          silent: 'No sound is capturable. The Eye is using its usual music animation.',
          unavailable:
            'Playback capture could not start. Try again; normal music controls still work.',
          denied: 'Android capture was not approved. Normal music animations still work.'
        }[captureState];
        if (announcement && !captureNoticeSeen.has(captureState)) {
          captureNoticeSeen.add(captureState);
          toast(announcement);
        }
        break;
      }
      case 'attention':
        core.request(
          {
            kind: data.kind,
            item: data.item,
            important: data.important,
            vector: { x: 0, y: -0.9 }
          },
          t
        );
        break;
      case 'notifications':
        {
          // Something new arrived while he sleeps: he stirs (gently, not a startle).
          const known = new Set(notifications.map((n) => n.key));
          if ((data.items || []).some((n) => !known.has(n.key))) personality.wake('stir');
        }
        notifications = data.items || [];
        iris.notifications(notifications);
        if (panel === 'inbox') renderInbox();
        setTimeout(() => {
          const glow = $('irisGlint');
          if (panel || !visibility || glow.hidden) return;
          const r = glow.getBoundingClientRect();
          tips.offer(
            'peek',
            'Hold the glow to peek',
            { x: r.left + r.width / 2, y: r.bottom },
            'below'
          );
        }, 900);
        break;
      case 'apps':
        apps = Array.isArray(data.apps) ? data.apps : [];
        appManager.onAppsChanged();
        break;
      case 'appShortcuts':
        appManager.receivedShortcuts(data);
        break;
      case 'visibility':
        visibility = data.visible;
        if (!visibility) {
          iris.cancel();
          core.releaseFollow(t, false);
          iris.updateCapture({ state: 'off' }, t);
          captureState = 'off';
        }
        stopLoop();
        raf = 0;
        if (!visibility) personality.hidden();
        if (visibility) {
          eyeDive.emerge(t);
          personality.greet(t);
          draw(t);
          schedule();
          offerReachTip();
        }
        break;
      case 'edgeInsets':
      case 'insets': {
        // Edge-to-edge: keep text and buttons clear of the camera cutout and gesture bar.
        const root = document.documentElement.style;
        for (const side of ['top', 'bottom', 'left', 'right'])
          root.setProperty('--native-inset-' + side, Math.max(0, Number(data[side]) || 0) + 'px');
        resize();
        break;
      }
      case 'home':
        goHome();
        break;
      case 'error':
        toast(data.message);
        break;
    }
    if (!core.motion) draw(t);
    schedule();
  }
  // Back, or a downward swipe on the eye while paused, puts the music controls away. Tapping the eye brings them back.
  function dismissMusic() {
    if (core.mode !== 'music' || panel) return false;
    clearTimeout(mediaHold);
    iris.closeFocus(now());
    core.update({ media: { ...core.state.media, hidden: true, holdUntil: 0 } }, now());
    core.react('fold', now());
    if (!core.motion) draw(now());
    schedule();
    return true;
  }
  function restoreMusic() {
    const media = core.state.media;
    if (!media?.hidden || !media.available) return false;
    core.update(
      {
        media: {
          ...media,
          hidden: false,
          holdUntil: media.playing ? 0 : Date.now() + PAUSE_LINGER_MS
        }
      },
      now()
    );
    if (!media.playing) {
      clearTimeout(mediaHold);
      mediaHold = setTimeout(() => {
        core.update({ media: { ...core.state.media, holdUntil: 0 } }, now());
        if (!core.motion) draw(now());
        schedule();
      }, PAUSE_LINGER_MS + 60);
    }
    if (!core.motion) draw(now());
    schedule();
    return true;
  }
  function diveInto(point) {
    tips.count('launches');
    if (!core.motion || panel || !visibility || !point) return false;
    const ok = eyeDive.start(point, now());
    if (ok) schedule();
    return ok;
  }
  // After a handful of launches from the dock or drawer, mention the quick apps around the eye.
  function offerReachTip() {
    if (tips.seen('reach') || (tips.diagnostics().counts.launches || 0) < 8) return;
    setTimeout(() => {
      if (panel || !visibility || core.mode === 'music') return;
      const e = eyeCentre();
      tips.offer(
        'reach',
        'Hold me for your shortcuts',
        { x: e.x, y: e.y - e.size * 1.2 },
        'above'
      );
    }, 1400);
  }
  function goHome() {
    eyeDive.emerge(now());
    touchStart = null;
    appManager.closeAll();
    closePanel();
    $('search').value = '';
    hideNotice(now());
    livingEvent('welcome');
  }
  function renderDock() {
    appManager.renderDock();
  }
  function renderApps() {
    appManager.renderApps();
  }
  function hideDrawerForDrag() {
    if (panel === 'drawer') {
      $('drawer').hidden = true;
      panel = null;
      stopLoop();
      raf = 0;
      draw(now());
      schedule();
    }
  }
  function hidePanelForOverlay() {
    if (!panel || !['drawer', 'settings', 'inbox', 'linkSheet'].includes(panel)) return null;
    const old = {
      id: panel,
      expanded: panel === 'drawer' && $('drawer').classList.contains('expanded')
    };
    $(panel).hidden = true;
    panel = null;
    stopLoop();
    raf = 0;
    draw(now());
    schedule();
    return old;
  }
  function setDrawerExpanded(on) {
    $('drawer').classList.toggle('expanded', on);
    $('drawerExpand').textContent = on ? 'Collapse' : 'Expand';
    $('drawerExpand').setAttribute('aria-expanded', String(on));
    if (!on) {
      core.react('reach', now());
      draw(now());
    }
    stopLoop();
    raf = 0;
    schedule();
  }
  function restorePanelAfterOverlay(state) {
    const id = typeof state === 'string' ? state : state?.id;
    if (!id || !['drawer', 'settings', 'inbox', 'linkSheet'].includes(id)) return;
    for (const name of ['drawer', 'settings', 'inbox', 'linkSheet']) $(name).hidden = name !== id;
    panel = id;
    if (id === 'drawer') {
      renderApps();
      setDrawerExpanded(Boolean(state?.expanded));
    }
    if (id === 'inbox') renderInbox();
    stopLoop();
    raf = 0;
    draw(now());
    schedule();
  }
  function openPanel(id) {
    // EYES for iPhone has no apps, notifications or folders: those panels never open there
    if (window.EYES_WEB && ['drawer', 'inbox', 'organizeSheet', 'folderSheet'].includes(id)) return;
    closePanel();
    panel = id;
    if (id === 'settings') showEyeStats();
    $(id).hidden = false;
    stopLoop();
    raf = 0;
    if (id === 'drawer') {
      renderApps();
      setDrawerExpanded(false);
    }
    if (id === 'inbox') {
      renderInbox();
      core.react('reach', now());
      draw(now());
      schedule();
    }
  }
  function closePanel() {
    iris.cancel();
    link.cancelGesture();
    appManager.closeAll();
    for (const id of ['settings', 'drawer', 'inbox', 'linkSheet']) $(id).hidden = true;
    panel = null;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    draw(now());
    schedule();
  }
  function renderInbox() {
    const hour = lastState.hour ?? new Date().getHours();
    $('greeting').textContent =
      hour < 6
        ? 'A quiet night'
        : hour < 12
          ? 'Good morning'
          : hour < 18
            ? 'Your afternoon'
            : 'Your evening';
    $('dayAhead').replaceChildren();
    const date = document.createElement('div');
    date.textContent = new Date().toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    $('dayAhead').append(date);
    const alarm = document.createElement('button');
    alarm.textContent = lastState.alarm
      ? `Next alarm · ${new Date(lastState.alarm).toLocaleDateString([], { weekday: 'short' })} ${escTime(lastState.alarm)}`
      : 'No upcoming alarm';
    alarm.onclick = () => native('setup', 'alarm');
    $('dayAhead').append(alarm);
    $('notificationList').replaceChildren();
    if (!notifications.length) {
      const p = document.createElement('p');
      p.className = 'detail';
      p.textContent = lastState.access
        ? 'All quiet. Nothing needs you right now.'
        : 'Turn on notification access in The Optic to see notifications here.';
      $('notificationList').append(p);
    }
    const dismissible = canDismiss();
    $('clearAll').hidden = !dismissible || !notifications.some(isClearable);
    for (const n of notifications) {
      const b = document.createElement('button');
      b.className = 'notification-item';
      const app = document.createElement('small');
      app.textContent = n.app + ' · ' + escTime(n.time);
      const title = document.createElement('strong');
      title.textContent = n.title || 'Notification';
      const text = document.createElement('p');
      text.textContent = n.text;
      b.append(app, title, text);
      b.onclick = () => {
        if (b.dataset.swiped) return;
        iris.seenItem(n);
        native('notification', n.key);
      };
      if (dismissible && isClearable(n)) {
        const row = document.createElement('div');
        row.className = 'notification-row';
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'notification-dismiss';
        x.textContent = '×';
        x.setAttribute('aria-label', 'Dismiss ' + (n.title || 'notification') + ' from ' + n.app);
        x.onclick = () => dismissRow(row, n, 1);
        row.append(b, x);
        swipeToDismiss(row, b, n);
        $('notificationList').append(row);
      } else $('notificationList').append(b);
    }
    const firstRow = document.querySelector('#notificationList .notification-row');
    if (firstRow && !tips.seen('swipeClear'))
      setTimeout(() => {
        if (panel !== 'inbox' || !firstRow.isConnected) return;
        const r = firstRow.getBoundingClientRect();
        tips.offer(
          'swipeClear',
          'Swipe a notification away to clear it',
          { x: r.left + r.width / 2, y: r.top },
          'above',
          { force: true }
        );
      }, 700);
  }
  // ---- Clearing notifications (needs the Android side's dismissNotification) ----
  function canDismiss() {
    return Boolean(phone && typeof phone.dismissNotification === 'function');
  }
  function isClearable(n) {
    return n && n.key && !n.ongoing && n.clearable !== false;
  }
  // Remove it here right away; the phone confirms with a fresh list a moment later.
  function forget(keys) {
    const gone = new Set(keys);
    notifications = notifications.filter((n) => !gone.has(n.key));
    iris.notifications(notifications);
    $('clearAll').hidden = !notifications.some(isClearable);
    if (!notifications.length) setTimeout(() => panel === 'inbox' && renderInbox(), 320);
  }
  function dismissRow(row, n, direction) {
    if (row.dataset.leaving) return;
    row.dataset.leaving = '1';
    row.style.setProperty('--leave', direction < 0 ? '-110%' : '110%');
    row.classList.add('leaving');
    native('dismissNotification', n.key);
    setTimeout(() => row.remove(), 300);
    forget([n.key]);
  }
  function swipeToDismiss(row, item, n) {
    let start = null;
    item.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, horizontal: null };
      delete item.dataset.swiped;
    });
    item.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x,
        dy = e.clientY - start.y;
      if (start.horizontal === null && Math.hypot(dx, dy) > 10)
        start.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (!start.horizontal) return;
      start.dx = dx;
      item.dataset.swiped = '1';
      item.setPointerCapture?.(e.pointerId);
      row.style.setProperty('--swipe', dx + 'px');
      row.style.opacity = String(1 - Math.min(0.7, Math.abs(dx) / 300));
      row.classList.add('swiping');
    });
    const finish = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = start.dx,
        far = Math.abs(dx) > row.clientWidth * 0.33;
      start = null;
      row.classList.remove('swiping');
      if (far) dismissRow(row, n, Math.sign(dx));
      else {
        row.style.setProperty('--swipe', '0px');
        row.style.opacity = '';
      }
      setTimeout(() => delete item.dataset.swiped, 50);
    };
    item.addEventListener('pointerup', finish);
    item.addEventListener('pointercancel', finish);
  }
  // Clearing from the eye itself: a flicked waiting light, or a peek card swiped away.
  // Notifications that can't be cleared (or an older Android side) are just put away from the eye.
  function dismissFromEye(item) {
    if (!item?.key) return false;
    const n = notifications.find((x) => x.key === item.key) || item;
    if (noticeItem?.key === n.key) hideNotice(now());
    if (canDismiss() && isClearable(n)) {
      native('dismissNotification', n.key);
      forget([n.key]);
    } else iris.seenItem(n);
    tips.used('swipeNotice');
    draw(now());
    schedule();
    return true;
  }
  {
    const card = $('notice');
    let start = null;
    card.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, horizontal: null };
      delete card.dataset.swiped;
    });
    card.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x,
        dy = e.clientY - start.y;
      if (start.horizontal === null && Math.hypot(dx, dy) > 10)
        start.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (!start.horizontal) return;
      start.dx = dx;
      card.dataset.swiped = '1';
      card.setPointerCapture?.(e.pointerId);
      card.style.translate = dx + 'px 0';
      card.style.opacity = String(1 - Math.min(0.8, Math.abs(dx) / 260));
      // Keep it on screen while you're holding it.
      clearTimeout(showNotice.timer);
    });
    const finish = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const far = Math.abs(start.dx) > card.clientWidth * 0.3,
        dir = Math.sign(start.dx);
      start = null;
      if (far && noticeItem) {
        card.style.translate = dir * 120 + '% 0';
        card.style.opacity = '0';
        const item = noticeItem;
        setTimeout(() => {
          card.style.translate = '';
          card.style.opacity = '';
        }, 450);
        dismissFromEye(item);
      } else {
        card.style.translate = '';
        card.style.opacity = '';
        if (card.dataset.swiped && noticeItem)
          showNotice.timer = setTimeout(() => hideNotice(now()), 2500);
      }
      setTimeout(() => delete card.dataset.swiped, 50);
    };
    card.addEventListener('pointerup', finish);
    card.addEventListener('pointercancel', finish);
  }
  $('clearAll').onclick = () => {
    const rows = [...document.querySelectorAll('#notificationList .notification-row')];
    const keys = notifications.filter(isClearable).map((n) => n.key);
    rows.forEach((row, i) =>
      setTimeout(() => {
        row.style.setProperty('--leave', '110%');
        row.classList.add('leaving');
      }, i * 40)
    );
    if (phone && typeof phone.clearNotifications === 'function') native('clearNotifications');
    else keys.forEach((key) => native('dismissNotification', key));
    setTimeout(() => rows.forEach((r) => r.remove()), rows.length * 40 + 300);
    forget(keys);
  };
  $('settingsOpen').onclick = () => openPanel('settings');
  $('drawerOpen').onclick = () => openPanel('drawer');
  $('coreHit').onclick = () => {
    if (personality.eyeTapSuppressed()) return;
    if (!restoreMusic()) openPanel('inbox');
  };
  $('coreHit').onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPanel('inbox');
    }
  };
  for (const b of document.querySelectorAll('.close')) b.onclick = closePanel;
  $('drawerExpand').onclick = () => setDrawerExpanded(!$('drawer').classList.contains('expanded'));
  $('focusClose').onclick = () => {
    iris.closeFocus(now());
    draw(now());
  };
  $('musicMotion').value = iris.options.motion;
  $('musicTint').checked = iris.options.tint;
  $('skinStyle').value = skins.value;
  $('skinStyle').onchange = (e) => {
    skins.set(e.target.value);
    schedule();
  };
  $('musicMotion').onchange = (e) => iris.setMood(e.target.value);
  $('musicTint').onchange = (e) => iris.setAlbumTint(e.target.checked);
  // Full screen: the status bar is redundant with HAVEN's own clock, date and battery.
  // Only offered when the Android side supports it; older builds keep the status bar.
  let fullscreen = read('haven.fresh.fullscreen', true) !== false;
  function applyFullscreen() {
    document.documentElement.classList.toggle('fullscreen', fullscreen);
    native('setFullscreen', fullscreen);
  }
  if (phone && typeof phone.setFullscreen === 'function') {
    $('fullscreenRow').hidden = false;
    $('fullscreen').checked = fullscreen;
    applyFullscreen();
  }
  $('tipsReset').onclick = () => {
    tips.reset();
    $('tipsStatus').textContent = "Done. You'll see each tip again when it comes up.";
  };
  $('fullscreen').onchange = (e) => {
    fullscreen = e.target.checked;
    save('haven.fresh.fullscreen', fullscreen);
    applyFullscreen();
  };
  $('liveAudioToggle').onclick = () => {
    if (['ready', 'live', 'silent'].includes(captureState)) {
      native('stopLiveAudio');
      receive({ type: 'audioCapture', state: 'off' });
    } else {
      native('startLiveAudio');
      receive({ type: 'audioCapture', state: 'permission' });
    }
  };
  $('setHome').onclick = () => native('setup', 'home');
  // Your HAVEN: its birth card, and a fresh frame whenever its DNA arrives or changes.
  if ($('yourHaven')) $('yourHaven').onclick = () => window.HavenAwakening && window.HavenAwakening.showSaved();
  const showDnaInfo = () => {
    const s = window.HavenDNA && window.HavenDNA.summary();
    if ($('yourHavenInfo'))
      $('yourHavenInfo').textContent = s
        ? s.name + ' · ' + s.tierLabel + (s.growth ? ' · ' + s.growth.stageName + (s.growth.branchName ? ' ' + s.growth.branchName : '') : '')
        : 'Not awake yet';
  };
  showDnaInfo();
  addEventListener('haven:dna', () => {
    showDnaInfo();
    draw(now());
    schedule();
  });
  $('setAccess').onclick = () => native('setup', 'notifications');
  $('nextAlarm').onclick = $('clock').onclick = () => native('setup', 'alarm');
  $('motion').onchange = (e) => setMotion(e.target.value);
  $('search').oninput = renderApps;
  for (const [id, command] of [
    ['previous', 'previous'],
    ['playPause', 'toggle'],
    ['next', 'next']
  ])
    $(id).onclick = () => {
      native('media', command);
      iris.transport(command, now());
      core.react(command === 'toggle' ? 'transport' : command, now());
      if (!core.motion) draw(now());
      schedule();
    };
  $('notice').onclick = () => {
    if ($('notice').dataset.swiped) return;
    if (noticeItem?.key) {
      iris.seenItem(noticeItem);
      native('notification', noticeItem.key);
    } else openPanel('inbox');
  };
  // App management buttons, folders and organizer are owned by app-management.js.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (panel || appManager.overlayOpen() || appManager.dragActive()) return;
      const gesture = iris.begin(e);
      if (gesture && gesture !== 'reach') {
        touchStart = null;
        return;
      }
      touchStart = { x: e.clientX, y: e.clientY };
      const x = (e.clientX - w * 0.5) / (w * 0.4),
        y = (e.clientY - h * 0.49) / (h * 0.4);
      const target = e.target?.closest?.('.home-app,.dock-app,#irisGlint,#notice');
      if (target) core.watch(target.dataset.id || target.id, x / 0.975, y / 0.85, now());
      else core.touch(x, y, now());
      if (core.motion) core.ripple = { x: e.clientX, y: e.clientY, at: now() };
      else draw(now());
      schedule();
    },
    { passive: true }
  );
  document.addEventListener(
    'pointerover',
    (e) => {
      if (panel || appManager.dragActive() || !core.motion || e.pointerType !== 'mouse') return;
      const target = e.target?.closest?.(
        '.home-app,.dock-app,.constellation-node,#irisGlint,#notice'
      );
      if (!target) return;
      const box = target.getBoundingClientRect(),
        px = box.left + box.width / 2,
        py = box.top + box.height / 2;
      core.watch(
        target.dataset.id || target.getAttribute('aria-label') || target.id,
        (px - w * 0.5) / (w * 0.4),
        (py - h * 0.49) / (h * 0.35),
        now()
      );
      schedule();
    },
    { passive: true }
  );
  document.addEventListener('pointermove', (e) => iris.move(e), { passive: true });
  document.addEventListener(
    'pointerup',
    (e) => {
      if (iris.end(e)) {
        touchStart = null;
        return;
      }
      if (!touchStart || panel || appManager.overlayOpen() || appManager.dragActive()) return;
      const dy = e.clientY - touchStart.y,
        dx = e.clientX - touchStart.x;
      touchStart = null;
      if (Math.abs(dx) < 90 && dy < -65) openPanel('drawer');
      else if (Math.abs(dx) < 90 && dy > 80) openPanel('inbox');
    },
    { passive: true }
  );
  document.addEventListener('pointercancel', () => {
    touchStart = null;
    iris.cancel();
    draw(now());
  });
  $('home').addEventListener('contextmenu', (event) => {
    if (event.target.closest('#coreHit,#irisGlint,#irisVolume,#irisReach')) event.preventDefault();
  });
  window.addEventListener('resize', () => {
    iris.cancel();
    appManager.cancelDrag();
    appManager.resizeConstellation();
    resize();
  });
  document.addEventListener('visibilitychange', () => {
    visibility = !document.hidden;
    if (!visibility) iris.cancel();
    if (!visibility) personality.hidden();
    else personality.greet(now());
    stopLoop();
    raf = 0;
    if (visibility) {
      eyeDive.emerge(now());
      native('refresh');
      draw(now());
      schedule();
    }
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!phone) systemMotion = !reduced.matches;
  reduced.addEventListener('change', (e) => {
    if (!phone) {
      systemMotion = !e.matches;
      syncMotion();
    }
  });
  window.Haven = {
    receive,
    setMotion,
    goHome,
    holdHome(on) {
      homeHeld = !!on;
      if (!homeHeld) { draw(now()); schedule(); }
    },
    back() {
      if (appManager.back()) return true;
      if (iris.back()) return true;
      if (dismissMusic()) return true;
      if (panel === 'linkSheet') {
        openPanel('settings');
        return true;
      }
      if (panel) {
        closePanel();
        return true;
      }
      return false;
    },
    // Test hooks: trigger a habit or sleep without waiting.
    debug: {
      habit: (name) => core.react(name, now()),
      sleep: () => personality.sleepNow(),
      setSleepAfter: (ms) => personality.setSleepAfter(ms),
      bedside: () => senses && senses.enterBedside(),
      play: () => play
    },
    diagnostics() {
      return {
        mode: core.mode,
        desired: core.desired,
        stage: core.stage,
        motion: core.motion,
        gentle: !!core.gentle,
        frames,
        calmFrames,
        eyeStats,
        model,
        history: core.history,
        gazes: core.gazes,
        apps: apps.length,
        ...appManager.diagnostics(),
        notifications: notifications.length,
        visible: visibility,
        panel,
        link: link.diagnostics(),
        personality: personality.diagnostics(),
        skin: skins.diagnostics(),
        senses: senses ? senses.diagnostics() : null,
        attentionEvents: [...core.attentionEvents],
        following: core.attention.active
      };
    }
  };
  updateTime();
  renderDock();
  resize();
  setMotion(motion);
  setInterval(() => {
    if (visibility) {
      updateTime();
      if (!core.motion) draw(now());
    }
  }, 30000);
  native('refresh');
  schedule();
  window.HavenSafety?.ready();
})();
