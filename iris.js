'use strict';

// An iris gesture owns one pointer until release, cancel, or navigation.
window.createIris = function ({
  $,
  now,
  core,
  draw,
  native,
  read,
  save,
  getIrisApps,
  activateShortcut,
  showNotice,
  dismissMusic = () => false,
  used = () => {},
  dismissItem = () => false
}) {
  const reach = $('irisReach'),
    glint = $('irisGlint'),
    slider = $('irisVolume'),
    meter = $('irisMeter');
  const holdMs = 460,
    slop = 11;
  let gesture = null,
    holdTimer,
    meterTimer,
    geometry,
    targets = [],
    selected = null;
  let preview = null,
    items = [],
    volume = null,
    volumeVisible = false,
    settleAt = 0,
    suppressClickUntil = 0;
  // Playback-aware motion, not sampled audio. Android MediaController cannot supply FFT data.
  const audio = {
    playChangedAt: -10000,
    playing: false,
    available: false,
    hash: 17,
    track: '',
    started: 0,
    action: null,
    actionAt: -10000,
    volume: 0,
    durationMs: null,
    positionMs: null,
    positionAt: 0,
    speed: 0,
    genre: ''
  };
  const focus = { since: -10000, until: -10000 };
  const capture = { state: 'off', at: -10000, bass: 0, mid: 0, high: 0, level: 0, beat: 0 };
  const cap = (n) => Math.max(0, Math.min(1, Number.isFinite(Number(n)) ? Number(n) : 0));
  function updateCapture(data, t) {
    const states = [
      'off',
      'permission',
      'consent',
      'starting',
      'ready',
      'silent',
      'live',
      'unavailable',
      'denied',
      'unsupported'
    ];
    if (!states.includes(data?.state)) return;
    capture.state = data.state;
    capture.at = t;
    for (const key of ['bass', 'mid', 'high', 'level', 'beat']) capture[key] = cap(data[key]);
  }
  function capturedFrame(t) {
    if (capture.state !== 'live' || !audio.playing || t - capture.at > 950 || !core.motion)
      return null;
    const fresh = HavenPresence.ease((950 - (t - capture.at)) / 250);
    return {
      bass: capture.bass * fresh,
      mid: capture.mid * fresh,
      high: capture.high * fresh,
      level: capture.level * fresh,
      beat: capture.beat * fresh
    };
  }
  function captureInfo(t) {
    return { state: capture.state, active: !!capturedFrame(t), age: t - capture.at };
  }

  let focusReturnTimer = null;
  function armFocusReturn(t) {
    clearTimeout(focusReturnTimer);
    if (focus.until <= t) return;
    focusReturnTimer = setTimeout(
      () => {
        if (!core.motion) draw(now());
      },
      Math.max(0, focus.until - t) + 30
    );
  }

  // A small amount of artwork color belongs to the eye; never flood its face.
  const options = {
    motion: read('haven.music.motion', 'auto'),
    tint: read('haven.music.albumTint', true)
  };
  if (!['auto', 'drift', 'flow', 'pulse'].includes(options.motion)) options.motion = 'auto';
  const defaultTone = { primary: [111, 193, 202], secondary: [120, 181, 204], strength: 0 };
  const tone = { from: { ...defaultTone }, to: { ...defaultTone }, at: -10000, source: 'haven' };
  function toRgb(hex) {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  function rgbBlend(a, b, k) {
    return a.map((n, i) => n + (b[i] - n) * k);
  }
  function toneAt(t) {
    const k = !core.motion ? 1 : HavenPresence.ease((t - tone.at) / 1050);
    return {
      source: tone.source,
      primary: rgbBlend(tone.from.primary, tone.to.primary, k),
      secondary: rgbBlend(tone.from.secondary, tone.to.secondary, k),
      strength: tone.from.strength + (tone.to.strength - tone.from.strength) * k
    };
  }
  function refreshPalette(data, t) {
    const p = data?.palette || {};
    const primary = toRgb(p.primary),
      secondary = toRgb(p.secondary);
    const target =
      p.source === 'artwork' && primary && options.tint
        ? { primary, secondary: secondary || primary, strength: 0.43 }
        : defaultTone;
    const same = (a, b) => a.every((v, i) => Math.round(v) === Math.round(b[i]));
    if (
      !same(tone.to.primary, target.primary) ||
      !same(tone.to.secondary, target.secondary) ||
      tone.to.strength !== target.strength
    ) {
      const current = toneAt(t);
      tone.from = {
        primary: current.primary,
        secondary: current.secondary,
        strength: current.strength
      };
      tone.to = {
        primary: [...target.primary],
        secondary: [...target.secondary],
        strength: target.strength
      };
      tone.at = t;
    }
    tone.source = p.source === 'artwork' && primary ? 'artwork' : 'haven';
  }
  function setMood(value) {
    if (!['auto', 'drift', 'flow', 'pulse'].includes(value)) return;
    options.motion = value;
    save('haven.music.motion', value);
    draw(now());
  }
  function setAlbumTint(value) {
    options.tint = Boolean(value);
    save('haven.music.albumTint', options.tint);
    refreshPalette({ palette: audio.rawPalette }, now());
    draw(now());
  }
  function moodInfo() {
    if (options.motion !== 'auto') return { name: options.motion, source: 'manual' };
    const tag = audio.genre.toLowerCase();
    if (
      /ambient|downtempo|chill|classical|jazz|acoustic|folk|lofi|lo-fi|sleep|meditat|soundtrack|new age/.test(
        tag
      )
    )
      return { name: 'drift', source: 'genre' };
    if (
      /dance|electronic|edm|techno|house|drum|dubstep|metal|punk|hip.hop|rap|hardcore|rock|trance|disco/.test(
        tag
      )
    )
      return { name: 'pulse', source: 'genre' };
    return { name: 'flow', source: tag ? 'genre' : 'fallback' };
  }
  function moodShape() {
    const mood = moodInfo(),
      s =
        mood.name === 'drift'
          ? { pace: 0.47, amplitude: 0.58, swell: 0.4 }
          : mood.name === 'pulse'
            ? { pace: 1.4, amplitude: 1.24, swell: 1.22 }
            : { pace: 0.9, amplitude: 0.9, swell: 0.83 };
    return { ...mood, ...s };
  }

  const TAU = Math.PI * 2,
    SEGMENTS = 48;
  const limit = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  function trackHash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function updateMusic(data, t) {
    const key = String(data?.title || '') + '|' + String(data?.artist || '');
    const previousTrack = audio.track;
    const next = Boolean(data?.playing);
    if (key !== audio.track) {
      audio.track = key;
      audio.hash = trackHash(key);
      audio.started = t;
      if (audio.playing || next) {
        audio.action = 'track';
        audio.actionAt = t;
      }
    } else if (next && !audio.playing) {
      audio.started = t;
      audio.action = 'resume';
      audio.actionAt = t;
    } else if (!next && audio.playing) {
      audio.action = 'pause';
      audio.actionAt = t;
    }
    if (next !== audio.playing) audio.playChangedAt = t;
    audio.playing = next;
    audio.available = Boolean(data?.available);
    audio.genre = typeof data?.genre === 'string' ? data.genre.slice(0, 90) : '';
    audio.rawPalette = data?.palette || null;
    refreshPalette(data, t);
    // Timeline is actual media-session metadata, never an invented song duration.
    const duration = Number(data?.durationMs),
      position = Number(data?.positionMs),
      speed = Number(data?.speed);
    audio.durationMs =
      data?.durationMs != null && Number.isFinite(duration) && duration > 0 ? duration : null;
    audio.positionMs =
      audio.durationMs !== null &&
      data?.positionMs != null &&
      Number.isFinite(position) &&
      position >= 0
        ? Math.min(audio.durationMs, position)
        : null;
    audio.positionAt = t;
    audio.speed = Number.isFinite(speed) ? Math.max(0, Math.min(4, speed)) : next ? 1 : 0;
    if (!audio.available) {
      audio.action = null;
      audio.actionAt = -10000;
      focus.until = -10000;
      clearTimeout(focusReturnTimer);
    } else if (key !== previousTrack && focus.until > t) {
      focus.until = t + 5800;
      armFocusReturn(t);
    }
  }
  function transport(kind, t) {
    audio.action = kind;
    audio.actionAt = t;
    if (focus.until > t) {
      focus.until = t + 5300;
      armFocusReturn(t);
    }
  }
  function focusAmount(t) {
    if (!audio.available || t >= focus.until) return 0;
    if (!core.motion) return 1;
    return (
      HavenPresence.ease((t - focus.since) / 410) * HavenPresence.ease((focus.until - t) / 650)
    );
  }
  function openFocus(t) {
    if (!audio.available) return false;
    focus.since = t;
    focus.until = t + 6400;
    armFocusReturn(t);
    core.aim(0, 0, t, 360);
    core.react('reach', t);
    draw(t);
    return true;
  }
  function closeFocus(t) {
    if (focus.until <= t) return false;
    focus.until = t;
    clearTimeout(focusReturnTimer);
    draw(t);
    return true;
  }
  function musicProgress(t) {
    if (audio.durationMs === null || audio.positionMs === null) return null;
    const advance = audio.playing ? Math.max(0, t - audio.positionAt) * audio.speed : 0;
    const position = limit(audio.positionMs + advance, 0, audio.durationMs);
    return {
      positionMs: position,
      durationMs: audio.durationMs,
      ratio: position / audio.durationMs
    };
  }
  function focusState(t) {
    return {
      amount: focusAmount(t),
      active: audio.available && t < focus.until,
      progress: musicProgress(t),
      track: audio.track
    };
  }
  function audioLevel(t, pace = 1) {
    if (!audio.playing) return 0;
    const elapsed = Math.max(0, t - audio.started) * pace;
    const period = 445 + (audio.hash % 180);
    const beatPhase = (elapsed % period) / period;
    const beat = Math.exp(-Math.pow(beatPhase / 0.17, 2));
    const second = Math.exp(-Math.pow(((elapsed + period * 0.52) % period) / period / 0.19, 2));
    const breath = 0.5 + 0.5 * Math.sin(elapsed / 510 + (audio.hash % 19));
    return limit(0.24 + 0.31 * breath + 0.34 * beat + 0.1 * second);
  }
  // The halo is drawn inside the clipped eyeball, in the same coordinate system
  // as the pupil and iris. It fades in and out with the approved music morph.
  function paintMusic(
    ctx,
    { t, morph, size, gx, gy, tint, accentTint = null, still = false, lowPower = false }
  ) {
    const focusStrength = focusAmount(t);
    const reveal = HavenPresence.ease((morph - 0.1) / 0.9);
    if (reveal <= 0.002)
      return { source: 'playback-envelope', playing: audio.playing, energy: 0, segments: SEGMENTS };
    const clock = still ? audio.started : t;
    const mood = moodShape();
    const live = still ? null : capturedFrame(t);
    const energy = live
      ? cap(0.08 + 0.5 * live.level + 0.25 * live.bass + 0.17 * live.mid)
      : still
        ? audio.playing
          ? 0.33
          : 0
        : audioLevel(clock, mood.pace);
    const gesture = limit(1 - (clock - audio.actionAt) / 650);
    const gestureGlow = gesture * gesture;
    const radius = size * (0.682 + 0.078 * reveal);
    const intensity =
      ((audio.playing ? 0.2 + 0.8 * energy : 0.08) + gestureGlow * 0.2 + focusStrength * 0.22) *
      (live ? 1 : mood.amplitude);
    const phase = audio.playing && !still ? ((clock - audio.started) / 760) * mood.pace : 0;
    const seed = audio.hash % 360;
    const spinAngle = spinNow(t);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'screen';
    // A continuous soft inner lumen ties the separate spokes into a living iris.
    ctx.beginPath();
    ctx.arc(gx, gy, radius - size * 0.045, 0, TAU);
    ctx.lineWidth = Math.max(0.8, size * 0.012);
    ctx.strokeStyle = tint(0.98, reveal * (audio.playing ? 0.15 : 0.075));
    ctx.stroke();
    // Glow comes from a wide faint stroke under each spoke. (Per-spoke shadow blur cost ~70 blur
    // passes a frame; this looks the same for a fraction of the battery.)
    for (let i = 0; i < SEGMENTS; i++) {
      const angle = -Math.PI / 2 + (TAU * i) / SEGMENTS + spinAngle;
      const a = (i / SEGMENTS) * TAU;
      // Neighbouring spokes move together: coherent filaments, not random bars.
      const spatial = 0.5 + 0.5 * Math.sin(3 * a + phase * 1.17 + seed * 0.011);
      const fold = 0.5 + 0.5 * Math.sin(7 * a - phase * 0.73 + seed * 0.023);
      const travel = 0.5 + 0.5 * Math.sin(2 * a - phase * 0.42);
      const sideClear = 1 - 0.55 * Math.pow(Math.abs(Math.cos(angle)), 10);
      const shape = limit(0.16 + 0.44 * spatial + 0.25 * fold + 0.15 * travel);
      const sound = live ? (i % 3 === 0 ? live.bass : i % 3 === 1 ? live.mid : live.high) : 0;
      const lift = limit(intensity * shape + (live ? 0.51 * sound : 0)) * sideClear;
      const length = size * (0.023 + (0.112 + 0.04 * focusStrength) * lift) * reveal;
      const inR = radius - length * 0.5,
        outR = radius + length * 0.5;
      const x = Math.cos(angle),
        y = Math.sin(angle);
      const accent = i % 4 === 0 && accentTint,
        alpha = reveal * (accent ? 0.11 + 0.46 * lift : 0.14 + 0.51 * lift),
        width = Math.max(1.25, size * 0.019 * (0.55 + 0.45 * lift)),
        paint = accent ? accentTint : tint;
      ctx.beginPath();
      ctx.moveTo(gx + x * inR, gy + y * inR);
      ctx.lineTo(gx + x * outR, gy + y * outR);
      if (!lowPower) {
        ctx.lineWidth = width + size * 0.07 * reveal;
        ctx.strokeStyle = paint(1, alpha * 0.2);
        ctx.stroke();
      }
      ctx.lineWidth = width;
      ctx.strokeStyle = paint(1.18, alpha);
      ctx.stroke();
    }
    // Transport or track changes send a brief sweep through the existing iris.
    if (gestureGlow > 0.004 && !still) {
      const turn = limit((clock - audio.actionAt) / 650);
      const angle = -Math.PI * 0.58 + TAU * turn;
      ctx.shadowBlur = lowPower ? 0 : size * 0.13;
      ctx.lineWidth = Math.max(1.4, size * 0.028);
      ctx.beginPath();
      ctx.arc(gx, gy, radius, angle - 0.37, angle + 0.15);
      ctx.strokeStyle = tint(1.3, gestureGlow * 0.66 * reveal);
      ctx.stroke();
    }
    // A woven second ring follows a slower countercurrent, never an unrelated equalizer.
    ctx.globalAlpha = reveal * 0.44 * (audio.playing ? 1 : 0.35);
    ctx.shadowBlur = 0;
    for (let i = 0; i < 24; i++) {
      const a = (TAU * i) / 24 - Math.PI / 2;
      const wave = 0.5 + 0.5 * Math.sin(a * 4 - phase * 0.55 + seed * 0.02);
      const r = radius - size * (0.064 + 0.016 * wave * mood.swell);
      const shift = 0.046 + wave * 0.037 * (live ? 1 + live.mid * 0.7 : mood.amplitude);
      ctx.beginPath();
      ctx.arc(gx, gy, r, a - shift, a + shift);
      ctx.lineWidth = Math.max(0.75, size * 0.009);
      ctx.strokeStyle = accentTint
        ? accentTint(0.98, 0.32 + 0.24 * wave)
        : tint(0.98, 0.32 + 0.24 * wave);
      ctx.stroke();
    }
    // Treble flickers tiny highlights through the iris only when actual audio is flowing.
    if (live && live.high > 0.08) {
      ctx.shadowBlur = lowPower ? 0 : size * 0.06;
      for (let n = 0; n < 12; n++) {
        const a = (n * TAU) / 12 + Math.sin(t / 1200 + n) * 0.1;
        const glimmer = (0.55 + 0.45 * Math.sin(t / 94 + n * 2.37)) * live.high;
        ctx.beginPath();
        ctx.arc(
          gx + Math.cos(a) * radius * 0.83,
          gy + Math.sin(a) * radius * 0.83,
          size * (0.007 + 0.013 * glimmer),
          0,
          TAU
        );
        ctx.fillStyle = accentTint
          ? accentTint(1.35, 0.23 + 0.47 * glimmer)
          : tint(1.35, 0.23 + 0.47 * glimmer);
        ctx.fill();
      }
    }
    ctx.restore();
    return {
      source: live ? 'captured-playback' : 'playback-envelope',
      playing: audio.playing,
      energy,
      segments: SEGMENTS,
      bass: live?.bass || 0,
      mid: live?.mid || 0,
      high: live?.high || 0,
      beat: live?.beat || 0,
      gesture: audio.action,
      gestureStrength: gestureGlow,
      focus: focusStrength,
      mood: mood.name,
      moodSource: mood.source
    };
  }

  // Focus progress is painted OUTSIDE the eyeball clip so the iris remains intact.
  // If the media session has no duration or position, show no fabricated progress.
  function paintFocus(ctx, { t, cx, cy, size, gx, gy, pose, tint, amount }) {
    const progress = musicProgress(t);
    if (amount <= 0.002) return { active: false, progress };
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(pose.tilt);
    ctx.scale(pose.sx, pose.sy);
    ctx.globalCompositeOperation = 'screen';
    const radius = size * 1.29;
    const start = -Math.PI / 2;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.25, size * 0.017);
    ctx.beginPath();
    ctx.arc(gx, gy, radius, start, start + TAU);
    ctx.strokeStyle = tint(0.92, amount * 0.14);
    ctx.stroke();
    if (progress) {
      ctx.beginPath();
      ctx.arc(gx, gy, radius, start, start + Math.max(0.005, TAU * progress.ratio));
      ctx.lineWidth = Math.max(1.6, size * 0.026);
      ctx.strokeStyle = tint(1.28, amount * 0.76);
      ctx.shadowColor = tint(1.2, amount * 0.7);
      ctx.shadowBlur = size * 0.085;
      ctx.stroke();
      ctx.shadowBlur = 0;
      const tip = start + TAU * progress.ratio;
      ctx.beginPath();
      ctx.arc(gx + Math.cos(tip) * radius, gy + Math.sin(tip) * radius, size * 0.031, 0, TAU);
      ctx.fillStyle = tint(1.55, amount * 0.85);
      ctx.fill();
    }
    // Track-change ripple: one expanding shock wave that fades, no perpetual spin.
    if (audio.action === 'track' && core.motion) {
      const since = t - audio.actionAt;
      if (since >= 0 && since < 840) {
        const u = limit(since / 840);
        ctx.lineWidth = Math.max(0.7, size * 0.014 * (1 - u));
        ctx.beginPath();
        ctx.arc(gx, gy, size * (0.86 + 0.47 * HavenPresence.ease(u)), 0, TAU);
        ctx.strokeStyle = tint(1.22, amount * 0.3 * (1 - u));
        ctx.stroke();
      }
    }
    ctx.restore();
    return { active: true, progress };
  }
  // ---- Groove: one beat signal for the whole body, live audio when allowed, otherwise the playback envelope.
  const spin = { value: 0, target: 0, last: -10000, at: 0 };
  function kickSpin(dir, t) {
    // A manual skip followed by the new track's arrival is one spin, not two.
    if (t - spin.last < 900 && dir > 0 && audio.action === 'track') return;
    spin.target += (dir * TAU) / 8;
    spin.last = t;
  }
  function spinNow(t) {
    const dt = limit(t - spin.at, 0, 120);
    spin.at = t;
    if (!core.motion) {
      spin.value = spin.target;
      return spin.value;
    }
    spin.value += (spin.target - spin.value) * (1 - Math.exp(-dt / 150));
    return spin.value;
  }
  const rings = [],
    dropState = { fast: 0, slow: 0, at: -10000, lastT: 0 };
  let lastBeatIndex = -1,
    lastLiveBeat = 0,
    lastRingAt = -10000,
    lastAction = null,
    lastActionAt = -10000;
  function addRing(t, strength) {
    if (t - lastRingAt < 160) return;
    lastRingAt = t;
    rings.push({ at: t, strength });
    while (rings.length > 5) rings.shift();
  }
  function playAmount(t) {
    const k = !core.motion ? 1 : HavenPresence.ease((t - audio.playChangedAt) / 240);
    return audio.playing ? k : 1 - k;
  }
  function groove(t) {
    const mood = moodShape(),
      play = playAmount(t);
    const base = {
      playing: audio.playing,
      play,
      beat: 0,
      level: 0,
      sway: 0,
      live: false,
      drop: 0,
      mood: mood.name,
      skip: 0,
      resume: 0
    };
    if (!core.motion) return base;
    // Transport moments, observed once each.
    if (audio.actionAt !== lastActionAt) {
      lastActionAt = audio.actionAt;
      lastAction = audio.action;
      if (lastAction === 'next' || lastAction === 'track') kickSpin(1, t);
      else if (lastAction === 'previous') kickSpin(-1, t);
      if (lastAction === 'resume') addRing(t, 1.25);
    }
    const since = t - audio.actionAt;
    if ((audio.action === 'next' || audio.action === 'previous') && since < 460)
      base.skip = (audio.action === 'next' ? 1 : -1) * Math.sin((Math.PI * since) / 460);
    if (audio.action === 'resume' && since < 700) base.resume = Math.sin((Math.PI * since) / 700);
    if (!audio.playing) return base;
    const live = capturedFrame(t);
    const period = (445 + (audio.hash % 180)) / mood.pace;
    const elapsed = Math.max(0, t - audio.started);
    const ph = (elapsed % period) / period,
      index = Math.floor(elapsed / period);
    let beat =
      ph < 0.06 ? HavenPresence.ease(ph / 0.06) : Math.exp(-Math.pow((ph - 0.06) / 0.17, 2));
    let level = audioLevel(t, mood.pace);
    if (live) {
      beat = Math.max(live.beat, live.bass * 0.85);
      level = live.level;
      if (live.beat > 0.55 && lastLiveBeat <= 0.55 && mood.name !== 'drift')
        addRing(t, 0.55 + 0.6 * live.bass);
      lastLiveBeat = live.beat;
      // Drop detector: a sudden surge after a quieter stretch.
      const dt = limit(t - dropState.lastT, 0, 120);
      dropState.lastT = t;
      dropState.fast += (live.level - dropState.fast) * (1 - Math.exp(-dt / 140));
      dropState.slow += (live.level - dropState.slow) * (1 - Math.exp(-dt / 2600));
      if (
        dropState.fast > 0.5 &&
        dropState.slow < 0.36 &&
        dropState.fast > dropState.slow * 1.65 &&
        t - dropState.at > 5000
      ) {
        dropState.at = t;
        addRing(t, 1.9);
      }
      base.drop = limit(1 - (t - dropState.at) / 1100);
    } else if (index !== lastBeatIndex) {
      if (mood.name === 'pulse' || (mood.name === 'flow' && index % 4 === 0))
        addRing(t, mood.name === 'pulse' ? 0.75 : 0.5);
    }
    lastBeatIndex = index;
    base.beat = beat * play;
    base.level = level;
    base.live = !!live;
    base.sway = Math.sin(TAU * ((elapsed % (period * 2)) / (period * 2)));
    return base;
  }
  // Speaker-cone rings travel outward from the eye's rim on strong beats.
  function paintRings(ctx, { t, cx, cy, size, tint, lowPower }) {
    if (!core.motion || !rings.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i],
        u = (t - r.at) / (760 + r.strength * 240);
      if (u >= 1 || u < 0) {
        if (u >= 1) rings.splice(i, 1);
        continue;
      }
      const e = HavenPresence.ease(u);
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        size * (1.12 + 0.95 * e * Math.min(1.4, r.strength)),
        size * (1.08 + 0.88 * e * Math.min(1.4, r.strength)),
        0,
        0,
        TAU
      );
      ctx.lineWidth = Math.max(0.6, size * 0.03 * (1 - u) * r.strength);
      ctx.strokeStyle = tint(1.25, 0.24 * Math.min(1.3, r.strength) * (1 - u));
      if (!lowPower && r.strength > 1) {
        ctx.shadowColor = tint(1.2, 0.5);
        ctx.shadowBlur = size * 0.12 * (1 - u);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
  const seen = new Map(read('haven.iris.seen', []));
  const remembered = (item) => seen.get(item.key) === item.time;

  let waiting = { apps: 0, important: false, since: -10000, key: null },
    nextGlance = 0;
  function refreshGlint() {
    const unpeeked = items.filter((item) => !remembered(item));
    preview = unpeeked.find((item) => item.important) || unpeeked[0] || null;
    const key = preview ? preview.key + '|' + preview.time : null;
    // Something new: the light rises and HAVEN looks at it right away.
    if (key && key !== waiting.key) {
      waiting.since = now();
      nextGlance = now() + 250;
    }
    waiting = {
      ...waiting,
      key,
      apps: new Set(unpeeked.map((item) => item.app || item.key)).size,
      important: Boolean(preview?.important)
    };
    glint.hidden = !preview || !reach.hidden || volumeVisible;
    glint.dataset.important = String(Boolean(preview?.important));
  }

  function notifications(list) {
    items = list.filter((item) => item.key && !item.ongoing).sort((a, b) => b.time - a.time);
    refreshGlint();
  }

  function seenItem(item) {
    if (!item?.key) return;
    seen.delete(item.key);
    seen.set(item.key, item.time);
    while (seen.size > 128) seen.delete(seen.keys().next().value);
    save('haven.iris.seen', [...seen]);
    refreshGlint();
  }

  function peek(item = preview) {
    used('peek');
    if (!item || !items.some((active) => active.key === item.key && active.time === item.time))
      return;
    seenItem(item);
    if (geometry) aim(geometry.glintX, geometry.glintY);
    core.react('peek', now());
    showNotice(item, 9500);
    draw(now());
  }

  function aim(x, y) {
    const dx = x - geometry.cx,
      dy = y - geometry.cy;
    const distance = Math.max(geometry.size, Math.hypot(dx, dy));
    core.aim(dx / distance, dy / distance, now());
  }

  function shortcutPositions() {
    const { cx, cy, size, width } = geometry;
    const dx = Math.min(size * 1.09 + 14, width / 2 - 39);
    const dy = size * 0.73 + 13;
    const positions = [
      [-dx, -dy],
      [dx, -dy],
      [-dx, dy],
      [dx, dy]
    ];
    targets.forEach((target, index) => {
      const [x, y] = positions[index];
      target.x = cx + x;
      target.y = cy + y;
      target.button.style.left = target.x + 'px';
      target.button.style.top = target.y + 'px';
    });
  }

  function openReach(keyboard = false) {
    used('reach');
    const apps = getIrisApps();
    if (!geometry || !apps.length) return false;
    targets = apps.map((app) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'iris-shortcut';
      button.setAttribute(
        'aria-label',
        app.folder ? 'Open folder ' + app.name + ', ' + app.count + ' apps' : 'Open ' + app.name
      );
      const icon = app.folder
        ? window.createHavenFolderPreview(app)
        : document.createElement('img');
      if (!app.folder) {
        icon.alt = '';
        icon.src = app.icon;
      }
      const label = document.createElement('span');
      label.textContent = app.name;
      button.append(icon, label);
      button.onclick = () => {
        const r = button.getBoundingClientRect();
        launch(app, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      };
      return { app, button, x: 0, y: 0 };
    });
    reach.replaceChildren(...targets.map((target) => target.button));
    shortcutPositions();
    closeVolume();
    reach.hidden = false;
    core.react('reach', now());
    $('coreHit').setAttribute('aria-expanded', 'true');
    refreshGlint();
    if (keyboard) targets[0].button.focus();
    draw(now());
    return true;
  }

  function closeReach() {
    if (reach.hidden) return;
    reach.hidden = true;
    reach.replaceChildren();
    $('coreHit').setAttribute('aria-expanded', 'false');
    selected = null;
    targets = [];
    refreshGlint();
  }

  function launch(app, point) {
    closeReach();
    activateShortcut(app, point);
  }

  function selectShortcut(x, y) {
    const target = targets.find((entry) => Math.hypot(x - entry.x, y - entry.y) <= 38) || null;
    if (selected === target) return;
    if (selected) selected.button.classList.remove('selected');
    selected = target;
    if (target) {
      target.button.classList.add('selected');
      aim(target.x, target.y);
      const dx = target.x - geometry.cx,
        dy = target.y - geometry.cy,
        r = Math.max(geometry.size, Math.hypot(dx, dy));
      core.react('choose', now(), false, { x: dx / r, y: dy / r });
    } else {
      aim(geometry.cx, geometry.cy);
    }
  }

  function percent() {
    return volume ? (volume.level - volume.min) / (volume.max - volume.min) : 0;
  }

  function updateVolume(data, fresh = false) {
    const next = data?.changeable && data.max > data.min ? data : null;
    if (gesture?.kind === 'music' && gesture.axis === 'volume') {
      if (next?.route !== volume?.route) cancel();
      else if (gesture.active)
        return; // Callback echoes must not pull the gesture away from the finger.
      else if (fresh && next) gesture.base = next.level;
    }
    volume = next;
    slider.hidden = !volume;
    if (volume) paintVolume();
    else closeVolume();
  }

  function paintVolume() {
    const percentage = Math.round(percent() * 100);
    slider.setAttribute('aria-valuenow', String(percentage));
    meter.textContent = 'Media volume · ' + percentage + '%';
  }

  function setVolume(level) {
    if (!volume) return;
    level = Math.max(volume.min, Math.min(volume.max, level));
    const changed = level !== volume.level;
    if (changed) {
      volume = { ...volume, level };
      native('setMediaVolume', volume.route, level);
      transport('volume', now());
    }
    paintVolume();
    volumeVisible = true;
    settleAt = now() + 400;
    meter.hidden = false;
    clearTimeout(meterTimer);
    meterTimer = setTimeout(() => {
      if (gesture?.kind !== 'music' || gesture.axis !== 'volume' || !gesture.active) {
        closeVolume();
        draw(now());
      }
    }, 1000);
    refreshGlint();
    if (changed && core.motion) core.aim(0, -0.27 * percent(), now());
    draw(now());
  }

  function closeVolume() {
    clearTimeout(meterTimer);
    volumeVisible = false;
    meter.hidden = true;
    refreshGlint();
  }

  function begin(event) {
    if (!event.isPrimary || event.button !== 0) return false;
    if (gesture) cancel();
    // A new real press must not inherit suppression from a previous drag.
    suppressClickUntil = 0;
    if (!reach.hidden) {
      if (event.target.closest('#irisReach button')) return true;
      closeReach();
      draw(now());
      return true;
    }
    const hit = event.target;
    const kind =
      hit === glint
        ? 'peek'
        : hit.closest('#music') && (hit === slider || hit.closest('.transport button'))
          ? 'music'
          : hit === $('coreHit') && getIrisApps().length
            ? 'reach'
            : null;
    if (!kind) return false;
    gesture = {
      id: event.pointerId,
      kind,
      x: event.clientX,
      y: event.clientY,
      item: preview,
      base: volume?.level,
      active: false,
      moved: false,
      axis: null,
      skip: null
    };
    if (kind === 'music') {
      if (volume) native('readMediaVolume');
      if (hit.closest('#playPause,#irisVolume')) {
        holdTimer = setTimeout(() => {
          if (gesture?.kind !== 'music' || gesture.moved || gesture.axis) return;
          gesture.active = true;
          gesture.axis = 'focus';
          openFocus(now());
          if (navigator.vibrate)
            try {
              navigator.vibrate(16);
            } catch {}
        }, holdMs);
      }
    } else {
      holdTimer = setTimeout(() => {
        if (!gesture || gesture.moved) return;
        if (kind === 'peek') {
          gesture.active = true;
          peek(gesture.item);
        } else {
          gesture.active = openReach();
        }
      }, holdMs);
    }
    return kind;
  }

  function move(event) {
    const drag = gesture;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > slop) {
      drag.moved = true;
      clearTimeout(holdTimer);
    }
    if (drag.kind === 'reach' && drag.active) selectShortcut(event.clientX, event.clientY);
    // Flicking the waiting light outward, away from the eye, clears that notification.
    if (drag.kind === 'peek' && drag.axis !== 'flick' && geometry) {
      const ox = drag.x - (geometry.eyeX ?? geometry.cx),
        oy = drag.y - (geometry.eyeY ?? geometry.cy),
        len = Math.hypot(ox, oy) || 1;
      if ((dx * ox + dy * oy) / len > 38) {
        drag.axis = 'flick';
        drag.active = true;
        clearTimeout(holdTimer);
      }
    }
    if (drag.kind === 'music') {
      if (drag.axis === 'focus') return;
      if (!drag.axis && volume && Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx) * 1.2)
        drag.axis = 'volume';
      else if (!drag.axis && Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.3)
        drag.axis = 'skip';
      // While paused there is no volume, so a downward swipe puts the controls away.
      else if (!drag.axis && !volume && dy > 48 && dy > Math.abs(dx) * 1.3) {
        drag.axis = 'dismiss';
        drag.active = true;
        clearTimeout(holdTimer);
      }
      if (drag.axis === 'volume' && volume) {
        drag.active = true;
        const span = Math.max(100, geometry.size * 1.65);
        const travel = Math.sign(dy) * Math.max(0, Math.abs(dy) - slop);
        setVolume(Math.round(drag.base - (travel / span) * (volume.max - volume.min)));
      } else if (drag.axis === 'skip') {
        drag.active = true;
        drag.skip = dx > 0 ? 'previous' : 'next';
        aim(geometry.cx + (dx > 0 ? -geometry.size : geometry.size), geometry.cy);
      }
    }
  }

  function end(event) {
    if (!gesture || gesture.id !== event.pointerId) return false;
    move(event);
    const drag = gesture;
    const app = drag.kind === 'reach' && drag.active ? selected?.app : null;
    const appPoint = app && selected ? { x: selected.x, y: selected.y } : null;
    clearTimeout(holdTimer);
    gesture = null;
    if (drag.active || drag.moved || drag.kind === 'peek') suppressClickUntil = now() + 700;
    closeReach();
    if (app) activateShortcut(app, appPoint);
    if (drag.kind === 'peek' && drag.axis === 'flick' && drag.item) {
      flung = { at: now(), important: waiting.important, apps: waiting.apps };
      dismissItem(drag.item);
    }
    if (drag.kind === 'music' && drag.active) {
      if (drag.axis === 'dismiss') dismissMusic();
      else if (drag.axis === 'volume' && volume) setVolume(volume.level);
      else if (drag.axis === 'skip' && drag.skip && core.state.media?.[drag.skip] !== false) {
        native('media', drag.skip);
        transport(drag.skip, now());
        core.react(drag.skip, now());
      }
    }
    draw(now());
    return drag.kind !== 'reach' || drag.active;
  }

  function cancel() {
    clearTimeout(holdTimer);
    gesture = null;
    closeReach();
    closeVolume();
  }

  function back() {
    if (reach.hidden && !gesture && !volumeVisible && focus.until <= now()) return false;
    if (focus.until > now()) {
      closeFocus(now());
      return true;
    }
    cancel();
    draw(now());
    $('coreHit').focus();
    return true;
  }

  function layout(surface) {
    const previous = geometry;
    geometry = surface;
    const { cx, cy, size, width, height, glintX, glintY } = surface;
    glint.style.left = glintX + 'px';
    glint.style.top = glintY + 'px';
    if (
      previous &&
      previous.width === width &&
      previous.height === height &&
      previous.size === size
    )
      return;
    slider.style.left = cx + 'px';
    slider.style.top = cy + 'px';
    slider.style.width = size * 2.25 + 'px';
    slider.style.height = size * 1.95 + 'px';
    meter.style.left = width * 0.5 + 'px';
    meter.style.top = height * 0.49 + size * 1.37 + 'px';
    if (!reach.hidden) shortcutPositions();
  }

  // Waiting light: unread notifications glow along the upper-right rim instead of a separate speck.
  // More apps waiting make a longer arc; something important breathes, warmer and brighter.
  let flung = null;
  // The flicked light flies outward and fades.
  function paintFlung(ctx, tint) {
    if (!flung || !geometry) return;
    const k = (now() - flung.at) / 340;
    if (k >= 1 || !core.motion) {
      flung = null;
      return;
    }
    const {
        eyeX = geometry.cx,
        eyeY = geometry.cy,
        eyeRX = geometry.size,
        eyeRY = geometry.size,
        size,
        tilt = 0
      } = geometry,
      e = HavenPresence.ease(k),
      out = size * (0.07 + 1.3 * e),
      span = (0.2 + 0.075 * Math.min(3, Math.max(0, flung.apps - 1))) * (1 - 0.6 * e);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(
      eyeX,
      eyeY,
      eyeRX + out,
      eyeRY + out,
      tilt,
      -Math.PI / 4 - span,
      -Math.PI / 4 + span
    );
    ctx.lineWidth = Math.max(1, size * 0.03 * (1 - e));
    ctx.strokeStyle = flung.important
      ? `rgba(255,238,205,${0.8 * (1 - k)})`
      : tint(1.35, 0.8 * (1 - k));
    ctx.stroke();
    ctx.restore();
  }
  function paint(ctx, tint) {
    paintFlung(ctx, tint);
    if (glint.hidden || !geometry || !preview || geometry.diving) return;
    const t = now(),
      {
        eyeX = geometry.cx,
        eyeY = geometry.cy,
        eyeRX = geometry.size,
        eyeRY = geometry.size,
        size,
        tilt = 0
      } = geometry;
    const rise = core.motion ? HavenPresence.ease((t - waiting.since) / 700) : 1;
    const breathe = core.motion ? 0.5 + 0.5 * Math.sin(t / (waiting.important ? 900 : 1700)) : 0.6;
    const center = -Math.PI / 4,
      span = 0.2 + 0.075 * Math.min(3, Math.max(0, waiting.apps - 1));
    const alpha = rise * (waiting.important ? 0.5 + 0.4 * breathe : 0.34 + 0.14 * breathe);
    const gap = size * 0.07;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    const stroke = (width, a, blur) => {
      ctx.beginPath();
      ctx.ellipse(
        eyeX,
        eyeY,
        eyeRX + gap,
        eyeRY + gap,
        tilt,
        center - span * rise,
        center + span * rise
      );
      ctx.lineWidth = width;
      ctx.strokeStyle = waiting.important ? `rgba(255,238,205,${a})` : tint(1.35, a);
      ctx.shadowColor = waiting.important ? `rgba(255,220,170,${a})` : tint(1.3, a);
      ctx.shadowBlur = blur;
      ctx.stroke();
    };
    stroke(size * 0.09, alpha * 0.22, size * 0.25);
    stroke(Math.max(1.5, size * 0.028), alpha, size * 0.12);
    ctx.restore();
    // Every so often he glances at it, as if to say something is waiting.
    if (
      core.motion &&
      t >= nextGlance &&
      core.stage === 'rest' &&
      core.mode !== 'music' &&
      core.mode !== 'alert' &&
      !core.attention.active &&
      reach.hidden
    ) {
      core.aim(Math.cos(center + tilt) * 0.8, Math.sin(center + tilt) * 0.8, t, 190);
      nextGlance = t + (waiting.important ? 6500 : 12000) + Math.random() * 4000;
    }
  }

  $('home').addEventListener(
    'click',
    (event) => {
      if (event.detail && now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClickUntil = 0;
      }
    },
    true
  );
  glint.onclick = (event) => {
    if (!event.detail) peek();
  };
  $('coreHit').addEventListener('keydown', (event) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && ['Enter', 'F10'].includes(event.key))) {
      if (openReach(true)) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    }
  });
  $('playPause').addEventListener('keydown', (event) => {
    if (event.key === 'F10' && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      openFocus(now());
    }
  });
  slider.addEventListener('keydown', (event) => {
    if (!volume) return;
    const levels = {
      ArrowUp: volume.level + 1,
      ArrowRight: volume.level + 1,
      ArrowDown: volume.level - 1,
      ArrowLeft: volume.level - 1,
      Home: volume.min,
      End: volume.max
    };
    if (!(event.key in levels)) return;
    event.preventDefault();
    setVolume(levels[event.key]);
  });

  return {
    flinging: () => Boolean(flung),
    groove,
    paintRings,
    playAmount,
    begin,
    move,
    end,
    cancel,
    back,
    layout,
    paint,
    paintMusic,
    paintFocus,
    toneAt,
    moodShape,
    setMood,
    setAlbumTint,
    options,
    updateCapture,
    capturedFrame,
    captureInfo,
    updateMusic,
    transport,
    focusAmount,
    focusState,
    openFocus,
    closeFocus,
    musicProgress,
    notifications,
    seenItem,
    updateVolume,
    // 4.2.2: the shortcut ring can be opened while music plays (Shortcuts Mode); playback is never touched
    openReach: (keyboard = false) => openReach(keyboard),
    reachOpen: () => !reach.hidden,
    busy: () => !!gesture,
    shading(t) {
      if (!volumeVisible || !volume) return null;
      const active = gesture?.kind === 'music' && gesture.axis === 'volume' && gesture.active;
      const amount = active || !core.motion ? 1 : 1 - HavenPresence.ease((t - settleAt) / 600);
      return { level: percent(), amount };
    }
  };
};
