/* EYES 4.4.6 · Weather Organ, the Eye's fourth ability.
   EYES doesn't open a weather app. He becomes a tiny living weather system.

   Stage A  Awareness   WEATHER_AWARE    he notices, looks up, his pupil focuses, the sky glances across his iris
   Stage B  Awakening   WEATHER_FORMING  the pupil deepens, his iris layers part, a small world forms inside him
   Stage C  Weather     WEATHER_ACTIVE   his pupil is a window onto the real sky; his iris is a forecast dial
   Stage D  Closing     WEATHER_CLOSING  the atmosphere thins away, the layers fold back, his pupil returns

   Also here, because they share one weather source and one painter:
     · the small temperature on the home screen (in the date line, under the clock)
     · occasional idle "weather moments" while he sits on the home screen (event-timed, a few seconds each)
     · the Weather group in The Optic and the place picker

   Layers
     weather-data.js   Open-Meteo, cache, units, timezones, honest "now"
     weather-sky.js    the miniature atmosphere, the forecast ring, idle moments
     launcher.js       paints the Eye (pose from here); ability-wheel.js calls frame()/fps()
     #weather (DOM)    readout above him, hourly strip / days below, place picker, all accessible */
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const ms = () => performance.now();
  const TAU = Math.PI * 2;
  const D = window.EyesWeatherData, SKY = window.EyesWeatherSky;
  if (!D || !SKY) return;

  const svc = D.createService();
  window.EyesWeatherService = svc;
  const langs = () => (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en-US']);
  const H12 = D.hour12(langs());

  // ---------- glyphs (24×24, stroked), never emoji ----------
  const ICON = 'M7 17.6h9.6a3.6 3.6 0 0 0 .5-7.15A5.2 5.2 0 0 0 7.2 9.4 4.1 4.1 0 0 0 7 17.6Z M9.2 20.6l.7-1.3 M12.6 20.6l.7-1.3 M16 20.6l.7-1.3';
  const GLYPH = {
    sun: 'M12 8.2a3.8 3.8 0 1 0 .01 0Z M12 3.2v1.8M12 19v1.8M3.2 12H5M19 12h1.8M5.8 5.8l1.3 1.3M16.9 16.9l1.3 1.3M5.8 18.2l1.3-1.3M16.9 7.1l1.3-1.3',
    night: 'M15.8 15.6A6.6 6.6 0 0 1 8.4 5.2a6.8 6.8 0 1 0 7.4 10.4Z M17.4 5.4v2M16.4 6.4h2',
    partlyNight: 'M11.6 9.8A3.6 3.6 0 0 1 7.3 4.9a3.8 3.8 0 1 0 4.3 4.9Z M8.6 19h8.2a3.1 3.1 0 0 0 .4-6.2 4.4 4.4 0 0 0-8.4.9A2.7 2.7 0 0 0 8.6 19Z',
    partly: 'M9.4 4.6v1.2M4.6 9.4h1.2M6 6l.9.9M12.8 6l-.9.9 M6.7 11.9a3 3 0 1 1 5.2-3 M8.6 19h8.2a3.1 3.1 0 0 0 .4-6.2 4.4 4.4 0 0 0-8.4.9A2.7 2.7 0 0 0 8.6 19Z',
    overcast: 'M6.6 18h10.2a3.6 3.6 0 0 0 .5-7.15A5.2 5.2 0 0 0 7.2 9.8 4.1 4.1 0 0 0 6.6 18Z',
    rain: 'M7 15.2h9.6a3.4 3.4 0 0 0 .5-6.75A5 5 0 0 0 7.4 7.4 3.9 3.9 0 0 0 7 15.2Z M9 18.2l-.9 1.8M12.6 18.2l-.9 1.8M16.2 18.2l-.9 1.8',
    storm: 'M7 14.6h9.6a3.4 3.4 0 0 0 .5-6.75A5 5 0 0 0 7.4 6.8 3.9 3.9 0 0 0 7 14.6Z M12.6 13.4l-2 3.6h3l-1.8 3.6',
    snow: 'M7 14.6h9.6a3.4 3.4 0 0 0 .5-6.75A5 5 0 0 0 7.4 6.8 3.9 3.9 0 0 0 7 14.6Z M9 18v.01M12 19.6v.01M15 18v.01M10.5 21v.01M13.5 21v.01',
    fog: 'M4.5 9.5h15M3.5 13h17M5.5 16.5h13M8 20h8',
    wind: 'M3.5 9h10.6a2.6 2.6 0 1 0-2.6-2.6 M3.5 13h14.4a2.8 2.8 0 1 1-2.8 2.8 M3.5 17h7',
    none: 'M12 5.5a6.5 6.5 0 1 0 .01 0Z M12 10v.01'
  };
  const glyphFor = (cond) => (cond && cond.kind === 'partly' && cond.night ? GLYPH.partlyNight : GLYPH[cond ? cond.kind : 'none'] || GLYPH.none);

  // ---------- small DOM helpers ----------
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role' || k === 'tabindex' || k === 'for') n.setAttribute(k, v === true ? '' : v);
      else n[k] = v;
    }
    n.append(...kids.filter((k) => k !== null && k !== undefined && k !== false));
    return n;
  }
  function svg(d, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); s.append(p);
    return s;
  }
  function setGlyph(svgEl, d) { const p = svgEl && svgEl.firstChild; if (p && p.getAttribute('d') !== d) p.setAttribute('d', d); }
  const setText = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
  const host = () => (window.Haven && Haven.abilityHost ? Haven.abilityHost() : null);
  const motionLevel = () => { const h = host(); if (!h || !h.motion()) return 0; return h.gentle() ? 0.6 : 1; };
  const lowPower = () => { const h = host(); return !!(h && h.lowPower()); };
  const unit = () => svc.unit();
  const T = (c, bare) => D.fmtTemp(c, unit(), bare === undefined ? true : bare);
  const popText = (p) => (p == null ? '' : Math.round(p / 10) * 10 + '%');

  // =====================================================================================================
  // 1 · The home-screen temperature: one quiet line item next to the date and battery
  // =====================================================================================================
  function ensureChip() {
    let chip = $('weatherChip');
    if (chip) return chip;
    const line = document.querySelector('#timeBlock .dayline');
    if (!line) return null;
    chip = el('button', { id: 'weatherChip', type: 'button', class: 'weather-chip', hidden: true, 'aria-label': 'Weather' },
      svg(GLYPH.none, 'wx-chip-glyph'), el('span', { class: 'wx-chip-temp', text: '' }), el('span', { class: 'wx-chip-cond', text: '' }));
    // the home screen's own gestures never see a tap on it
    for (const type of ['pointerdown', 'pointerup', 'touchstart']) chip.addEventListener(type, (e) => e.stopPropagation(), type === 'touchstart' ? { passive: true } : false);
    chip.addEventListener('click', (e) => { e.stopPropagation(); openFromChip(); });
    line.append(chip);
    return chip;
  }
  function updateChip() {
    const chip = ensureChip();
    if (!chip) return;
    const p = svc.prefs;
    const show = (!window.EYES_WEB || window.EYES_IOS_ABILITIES) && p.enabled && p.chip;
    if (!show) { if (!chip.hidden) chip.hidden = true; return; }
    const v = svc.now();
    const glyph = chip.querySelector('svg'), temp = chip.querySelector('.wx-chip-temp'), cond = chip.querySelector('.wx-chip-cond');
    if (!p.place) {
      setGlyph(glyph, ICON); setText(temp, 'Add weather'); setText(cond, '');
      chip.setAttribute('aria-label', 'Set up weather');
      chip.classList.add('setup'); chip.classList.remove('stale');
    } else if (!v || !v.available) {
      setGlyph(glyph, GLYPH.none); setText(temp, svc.busy ? '…' : '–°'); setText(cond, '');
      chip.setAttribute('aria-label', svc.busy ? 'Weather loading' : 'Weather unavailable. Open Weather');
      chip.classList.remove('setup'); chip.classList.toggle('stale', !svc.busy);
    } else {
      setGlyph(glyph, glyphFor(v.cond)); setText(temp, T(v.temp)); setText(cond, v.cond ? v.cond.label : '');
      const when = v.stale ? `, updated ${D.ago(v.age)}` : '';
      chip.setAttribute('aria-label', `${T(v.temp, false)}, ${v.cond ? v.cond.label : ''}${when}. Open Weather`);
      chip.title = v.stale ? 'Weather updated ' + D.ago(v.age) : '';
      chip.classList.remove('setup'); chip.classList.toggle('stale', !!v.stale);
    }
    if (chip.hidden) chip.hidden = false;
  }
  // the chip's numbers follow the hour even without a new fetch (the forecast for "now" moves on)
  let chipTimer = 0;
  function planChip() {
    clearTimeout(chipTimer);
    if (document.hidden) return;
    chipTimer = setTimeout(() => { updateChip(); planChip(); }, 5 * 60e3);
  }
  function openFromChip() {
    if (!window.EyesAbility) return;
    if (EyesAbility.owner() === 'weather') return;
    if (!EyesAbility.launch || !EyesAbility.launch('weather', 'chip')) {
      // something else owns the iris right now; the Ability Wheel path still works
      const h = host(); if (h && h.toast) h.toast('Weather opens when he’s free.');
    }
  }

  // =====================================================================================================
  // 2 · Weather Organ: choreography (keyframed channels, the same way Vision, Arcade and Pocket move)
  // =====================================================================================================
  const CH = ['look', 'gx', 'gy', 'k', 'neutral', 'hush', 'open', 'grow', 'size', 'pupil', 'iris', 'lens', 'glow', 'aware', 'form', 'part', 'ring', 'ui'];
  const W = {
    api: null, state: 'IDLE', gen: 0, L: null, at: 0, from: null, tracks: null, moveUntil: 0, cur: null,
    sky: SKY.createSky(), sel: { type: 'now' }, ringPos: 0, ringTarget: 0, ringAt: 0, mode: 'hours',
    hours: [], days: [], view: null, flash: 0, lastGeo: null, drag: null, tintRGB: null, tintKey: '',
    stats: { opened: 0, closed: 0, frames: 0, scrubs: 0, launches: 0 }
  };
  function speed() { return motionLevel(); }
  function insets() {
    const st = document.documentElement.style;
    return { top: parseFloat(st.getPropertyValue('--native-inset-top')) || 0, bottom: parseFloat(st.getPropertyValue('--native-inset-bottom')) || 0 };
  }
  function computeLayout() {
    const Wd = innerWidth, Ht = innerHeight, ins = insets();
    const cx = Wd * 0.5, cy = Ht * 0.49;                  // he stays where he lives
    const wide = Wd > Ht * 1.15 && Wd >= 560;
    const tight = !wide && Ht - ins.top - ins.bottom < 640;
    const mini = !wide && Ht - ins.top - ins.bottom < 480;   // cover screens: dial and controls, no strip
    const EDGE = 16;
    let head, foot, S;
    if (wide) {
      // landscape / unfolded: readout to his left, forecast to his right
      S = Math.min((Ht - ins.top - ins.bottom) * 0.36, Wd * 0.17, 180);
      const colW = Math.max(150, cx - S * 1.15 - EDGE * 2);
      head = { x: EDGE, y: ins.top + 16, w: colW, h: Ht - ins.top - ins.bottom - 32 };
      foot = { x: Wd - EDGE - colW, y: ins.top + 16, w: colW, h: Ht - ins.top - ins.bottom - 32 };
    } else {
      const headH = mini ? 66 : tight ? 128 : 168, footH = mini ? 48 : tight ? 150 : 178;
      const headTop = ins.top + (mini ? 6 : tight ? 10 : 22);
      const footTop = Ht - ins.bottom - 12 - footH;
      const room = Math.min(cy - (headTop + headH) - 12, footTop - cy - 12);
      S = clamp(Math.min(room / 1.055, Wd * 0.4, Wd >= 600 ? 260 : 196), mini ? 40 : 72, 400);
      head = { x: Math.max(EDGE, cx - 220), y: headTop, w: Math.min(Wd - EDGE * 2, 440), h: headH };
      foot = { x: Math.max(EDGE + 12, cx - 230), y: footTop, w: Math.min(Wd - (EDGE + 12) * 2, 460), h: footH };
    }
    const looks = window.HavenDNA && HavenDNA.looks ? HavenDNA.looks() : { iris: 1, pupil: 1 };
    return {
      W: Wd, H: Ht, cx, cy, S, wide, tight, mini, head, foot,
      irisF: 0.86, pupilBase: looks.pupil || 1, irisBase: 0.62 * (looks.iris || 1),
      key: [Wd, Ht, ins.top, ins.bottom].join(':')
    };
  }
  function idleValues() {
    const L = W.L;
    return { look: 0, gx: 0, gy: 0, k: 0, neutral: 0, hush: 0, open: 0, grow: 0, size: L.S, pupil: L.pupilBase, iris: L.irisBase, lens: 0, glow: 1, aware: 0, form: 0, part: 0, ring: 0, ui: 0 };
  }
  function evalTracks(t) {
    if (!W.tracks) return W.from || idleValues();
    const sp = speed(), e = sp ? (t - W.at) / sp : Infinity, out = {};
    for (const ch of CH) {
      const keys = W.tracks[ch];
      let v = W.from[ch];
      if (keys) {
        let pt = 0, pv = W.from[ch];
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
  function plan(tracks) {
    const t = ms();
    W.from = W.tracks ? evalTracks(t) : idleValues();
    W.at = t; W.tracks = tracks;
    let end = 0;
    for (const ch in tracks) end = Math.max(end, tracks[ch][tracks[ch].length - 1][0]);
    W.moveUntil = t + end * speed() + 30;
    if (W.api) W.api.redraw();
    return end * speed();
  }
  // Stage A + B as one continuous move
  function planOpening(fromChip) {
    const L = W.L;
    W.from = idleValues(); W.tracks = null;
    return plan({
      // A · he notices; his gaze lifts toward the sky; the pupil focuses; the sky glances across him
      look: [[160, 1, 'out'], [700, 1], [1050, 1]],
      gx: [[1, fromChip ? -0.25 : -0.15], [700, -0.1], [1050, 0]], gy: [[220, -0.85, 'out'], [700, -0.8], [1050, 0]],
      k: [[260, 0.6], [520, 1]],
      neutral: [[340, 1]], hush: [[300, 1]], open: [[300, 1]],
      pupil: [[240, L.pupilBase * 0.78, 'out'], [520, L.pupilBase * 0.84], [900, L.pupilBase * 2.4]],
      aware: [[200, 0.6], [520, 1], [1000, 0.4], [1500, 0]],
      glow: [[260, 1.16, 'out'], [800, 1.22], [1500, 1.04]],
      // B · the pupil deepens, transparent layers of iris part, the world forms inside
      grow: [[480, 0], [1240, 1, 'out']],
      size: [[1, L.S]],
      iris: [[460, L.irisBase * 0.97], [1260, L.irisF, 'out']],
      lens: [[640, 0], [880, 1]],
      part: [[560, 0], [1050, 1, 'out'], [1600, 0.25]],
      form: [[700, 0], [1700, 1, 'lin']],
      ring: [[1250, 0], [1700, 1]],
      ui: [[1150, 0], [1450, 1]]
    });
  }
  function planSteady() {
    const L = W.L;
    plan({
      k: [[1, 1]], neutral: [[1, 1]], hush: [[1, 1]], open: [[1, 1]], look: [[300, 1]], gx: [[300, 0]], gy: [[300, 0]],
      size: [[260, L.S]], grow: [[1, 1]], pupil: [[1, L.pupilBase * 2.4]], iris: [[260, L.irisF]], lens: [[1, 1]],
      glow: [[400, 1]], aware: [[1, 0]], form: [[1, 1]], part: [[400, 0.25]], ring: [[1, 1]], ui: [[1, 1]]
    });
  }
  // Stage D: the atmosphere dissipates, the iris folds back, the pupil returns
  function planClosing(fast) {
    const L = W.L, f = fast ? 0.6 : 1;
    return plan({
      ui: [[160 * f, 0]], ring: [[260 * f, 0]],
      form: [[620 * f, 0]],
      part: [[300 * f, 0.9], [760 * f, 0]],
      lens: [[560 * f, 1], [740 * f, 0]],
      pupil: [[560 * f, L.pupilBase * 0.72], [960 * f, L.pupilBase]],
      grow: [[380 * f, 1], [900 * f, 0]],
      iris: [[900 * f, L.irisBase]],
      glow: [[460 * f, 1.1], [960 * f, 1]],
      aware: [[1, 0]], look: [[200, 0.3], [640 * f, 0]], gx: [[1, 0]], gy: [[200, -0.3], [640 * f, 0]],
      k: [[700 * f, 1], [980 * f, 0]],
      neutral: [[980 * f, 0]], hush: [[980 * f, 0]], open: [[980 * f, 0]]
    });
  }
  function pose(t) {
    if (W.state === 'IDLE' || !W.L) return null;
    const c = evalTracks(t);
    if (speed() === 1 && W.state === 'WEATHER_ACTIVE') {
      c.glow *= 1 + 0.02 * Math.sin(t / 2600);
      // he's still alive in there: the faintest drift of attention (too small to move the dial from your finger)
      if (!W.drag) { c.gx += 0.025 * Math.sin(t / 3100); c.gy += 0.018 * Math.sin(t / 4300 + 1); }
    }
    // lightning in his little sky lights him up a touch
    if (W.flash > 0) c.glow *= 1 + 0.18 * W.flash;
    W.cur = c;
    return { k: c.k, look: c.look, gaze: { x: c.gx, y: c.gy }, neutral: c.neutral, hush: c.hush, open: c.open, grow: c.grow, size: c.size, pupil: c.pupil, iris: c.iris, lens: c.lens, glow: c.glow };
  }
  function fps(t, low) {
    if (W.state === 'IDLE') return 0;
    if (t < W.moveUntil || W.drag || Math.abs(W.ringPos - W.ringTarget) > 0.01) return low ? 30 : 60;
    if (W.state !== 'WEATHER_ACTIVE') return low ? 30 : 60;
    const sp = speed();
    if (!sp) return W.sky.settled() ? 0 : 30;
    if (!W.sky.settled()) return low ? 24 : 40;
    return low ? 15 : sp === 1 ? 30 : 15;                // his little sky keeps moving, gently
  }

  // ---------- painting into the Eye's canvas ----------
  function geom(g) {
    const d = g && g.drawn;
    if (!d) return null;
    const sx = g.pose ? g.pose.sx : 1;
    const c = g.screen(d.gx, d.gy);
    const irisR = d.irisRadius * sx;
    return { x: c.x, y: c.y, irisR, pupilR: d.pupilR * sx };
  }
  function tintRGB(g) {
    const s = g.tint(1, 1);
    if (s === W.tintKey) return W.tintRGB;
    W.tintKey = s;
    const m = /rgba?\(([^)]+)\)/.exec(s);
    W.tintRGB = m ? m[1].split(',').slice(0, 3).map(Number) : null;
    if (W.tintRGB && $('weather')) $('weather').style.setProperty('--wx-rgb', W.tintRGB.join(','));
    return W.tintRGB;
  }
  function frame(ctx, g) {
    if (W.state === 'IDLE' || !W.L) return;
    const t = ms(), c = W.cur || evalTracks(t), o = geom(g);
    W.lastGeo = g; W.stats.frames++;
    if (!o) return;
    const rgb = tintRGB(g), motion = speed() > 0, low = lowPower();
    // A · the sky's reflection glances across his iris
    if (c.aware > 0.01) {
      const col = SKY.skyColours(W.sky.target(), rgb);
      ctx.save();
      ctx.beginPath(); ctx.arc(o.x, o.y, o.irisR * 0.98, 0, TAU); ctx.clip();
      const sweep = motion ? mix(-0.6, 0.5, ease(c.aware)) : 0;
      const gr = ctx.createLinearGradient(o.x, o.y - o.irisR, o.x, o.y + o.irisR * 0.3);
      gr.addColorStop(0, `rgba(${col.top.map((v) => v | 0).join(',')},${0.4 * c.aware})`);
      gr.addColorStop(1, `rgba(${col.bot.map((v) => v | 0).join(',')},0)`);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(o.x + sweep * o.irisR * 0.3, o.y - o.irisR * 0.35, o.irisR * 0.95, o.irisR * 0.5, -0.2, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // the window onto the world: it opens from his pupil as he deepens
    const winFull = o.irisR * 0.66;
    const winR = mix(Math.max(3, o.pupilR), winFull, ease(c.form * 1.15));
    if (c.form > 0.002) {
      W.sky.step(t, motion);
      const out = W.sky.paint(ctx, { x: o.x, y: o.y, r: winR, t, form: c.form, motion, lowPower: low, tintRGB: rgb });
      W.flash = out.flash || 0;
      // while it forms (and as it thins away), vapour gathers and turns inside him before the world resolves
      const vap = Math.sin(clamp(c.form / 0.85) * Math.PI) * (c.form < 0.85 ? 1 : 0);
      if (vap > 0.02) {
        ctx.save();
        ctx.beginPath(); ctx.arc(o.x, o.y, winR, 0, TAU); ctx.clip();
        ctx.globalCompositeOperation = 'screen';
        const spin = motion ? t / 900 : 0.6;
        for (let i = 0; i < 5; i++) {
          const a = spin * (i % 2 ? 1 : -0.7) + i * 1.3, rr = winR * (0.25 + 0.12 * i);
          const bx = o.x + Math.cos(a) * rr, by = o.y + Math.sin(a) * rr * 0.8;
          const gr = ctx.createRadialGradient(bx, by, 0, bx, by, winR * 0.55);
          gr.addColorStop(0, g.tint(1.4, 0.2 * vap)); gr.addColorStop(0.5, `rgba(220,232,240,${0.1 * vap})`); gr.addColorStop(1, 'rgba(220,232,240,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(bx, by, winR * 0.55, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      // the lip where iris gives way to sky
      ctx.save();
      for (const [grow, w, a] of [[3.5, 6, 0.08], [1.4, 2.6, 0.2], [0, 1.1, 0.6]]) {
        ctx.beginPath(); ctx.arc(o.x, o.y, winR + grow, 0, TAU);
        ctx.strokeStyle = g.tint(1.2, a * ease(c.form * 2)); ctx.lineWidth = w; ctx.stroke();
      }
      // lightning spreads a little light through the iris around the window
      if (W.flash > 0.02) {
        const gl = ctx.createRadialGradient(o.x, o.y, winR, o.x, o.y, o.irisR);
        gl.addColorStop(0, `rgba(200,214,255,${0.22 * W.flash})`); gl.addColorStop(1, 'rgba(200,214,255,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(o.x, o.y, o.irisR, 0, TAU); ctx.arc(o.x, o.y, winR, 0, TAU, true); ctx.fill();
      }
      ctx.restore();
    } else if (c.lens > 0.01) {
      // the pupil deepening before anything forms: a dark well with a far, faint light
      const gr = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.pupilR);
      gr.addColorStop(0, g.tint(1.3, 0.3 * c.lens)); gr.addColorStop(0.3, `rgba(1,2,5,${0.85 * c.lens})`); gr.addColorStop(1, 'rgba(1,2,5,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(o.x, o.y, o.pupilR, 0, TAU); ctx.fill();
    }
    // B · transparent layers of his iris part, then settle into the instrument
    if (c.part > 0.01) {
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const base = mix(winR * 1.04, o.irisR * 0.96, (i + 1) / 4);
        const rr = base + c.part * o.irisR * 0.035 * (i + 1);
        ctx.beginPath(); ctx.arc(o.x, o.y, rr, 0, TAU);
        ctx.strokeStyle = g.tint(1.25, 0.16 * c.part * (1 - i * 0.2)); ctx.lineWidth = 1 + c.part * 1.5; ctx.stroke();
      }
      ctx.restore();
    }
    // C · the forecast dial on his iris
    if (c.ring > 0.01 && W.hours.length) {
      if (motion) W.ringPos += (W.ringTarget - W.ringPos) * clamp((t - (W.ringAt || t)) / 120 + 0.18);
      else W.ringPos = W.ringTarget;
      W.ringAt = t;
      SKY.paintRing(ctx, {
        x: o.x, y: o.y, r0: winFull * 1.09, r1: o.irisR * 0.97, hours: W.hours, sel: W.ringPos,
        tint: g.tint, u: c.ring, labels: ringLabels()
      });
    }
    placeDial(o);
  }
  function ringLabels() {
    const out = [];
    for (const i of [6, 12, 18]) { const h = W.hours[i]; if (h) out.push([i, shortHour(h.t)]); }
    return out;
  }
  function shortHour(sec) {
    const s = D.fmtHour(sec, svc.data, H12);
    return H12 ? s.replace(':00', '').replace(' AM', 'a').replace(' PM', 'p') : s.slice(0, 2);
  }

  // =====================================================================================================
  // 3 · What the forecast says for the selected moment
  // =====================================================================================================
  function refreshModel() {
    const data = svc.data, now = Date.now();
    W.hours = D.upcoming(data, now, 24);
    W.days = D.dailyList(data, now).slice(0, 7);
    if (W.sel.type === 'hour' && W.sel.i >= W.hours.length) W.sel = { type: 'now' };
    if (W.sel.type === 'day' && W.sel.i >= W.days.length) W.sel = { type: 'now' };
  }
  function viewFor(sel) {
    const data = svc.data;
    if (!svc.prefs.place) return { kind: 'setup' };
    const nowV = svc.now();
    if (!data || !nowV || !nowV.available) {
      if (svc.busy) return { kind: 'loading' };
      return { kind: 'error', message: svc.error ? svc.error.message : 'No weather yet for ' + svc.prefs.place.name + '.' };
    }
    if (sel.type === 'hour' && W.hours[sel.i] && sel.i > 0) {
      const h = W.hours[sel.i], day = D.dayFor(data, h.t);
      return { kind: 'hour', when: 'At ' + D.fmtHour(h.t, data, H12) + (sameDay(h.t, data) ? '' : ' tomorrow'), temp: h.temp, cond: h.cond, feels: h.feels, pop: h.pop, hi: day && day.hi, lo: day && day.lo, wind: h.wind };
    }
    if (sel.type === 'day' && W.days[sel.i]) {
      const d = W.days[sel.i];
      return { kind: 'day', when: sel.i === 0 ? 'Today' : longDay(d), temp: d.hi, cond: d.cond, pop: d.pop, hi: d.hi, lo: d.lo, day: true };
    }
    return { kind: 'now', when: nowV.from === 'forecast' ? 'Now (forecast)' : 'Now', temp: nowV.temp, cond: nowV.cond, feels: nowV.feels, pop: nowV.pop, hi: nowV.hi, lo: nowV.lo, wind: nowV.wind, stale: nowV.stale, age: nowV.age };
  }
  function sameDay(sec, data) { const a = D.localParts(sec, data), b = D.localParts(Math.floor(Date.now() / 1000), data); return a.y === b.y && a.mo === b.mo && a.d === b.d; }
  function longDay(d) {
    try { return new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: svc.data.tz || undefined }).format(new Date((d.t + 43200) * 1000)); } catch { return d.wd; }
  }
  function applySelection(instant) {
    refreshModel();
    const v = viewFor(W.sel);
    W.view = v;
    W.sky.setTarget(SKY.sceneFor(v.cond || null), instant || !speed());
    W.ringTarget = W.sel.type === 'hour' ? W.sel.i : 0;
    renderReadout();
    renderStrip();
    if (W.api) W.api.redraw();
  }

  // =====================================================================================================
  // 4 · DOM: readout above him, the dial over his iris, the hourly strip and days below
  // =====================================================================================================
  function btn(label, cls, fn, extra) {
    const b = el('button', { type: 'button', class: 'wx-btn ' + (cls || ''), ...(extra || {}) });
    if (extra && extra.icon) { b.prepend(svg(extra.icon)); delete b.icon; }
    if (label) b.append(el('span', { class: 'wx-btn-label', text: label }));
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(b, e); });
    return b;
  }
  const I = { close: 'M6.5 6.5l11 11M17.5 6.5l-11 11', pin: 'M12 20.5s-6-5.6-6-10.2a6 6 0 1 1 12 0c0 4.6-6 10.2-6 10.2Z M12 8.3a2 2 0 1 0 .01 0', refresh: 'M18.5 12a6.5 6.5 0 1 1-1.9-4.6M18.5 5v3.6h-3.6', back: 'M14.5 6l-6 6 6 6', locate: 'M12 4v2.4M12 17.6V20M4 12h2.4M17.6 12H20M12 7.8a4.2 4.2 0 1 0 .01 0Z M12 11v2' };
  function ensureDom() {
    if ($('weather')) return;
    const place = btn('', 'wx-place', () => openPlace('organ'), { id: 'wxPlaceBtn', icon: I.pin, 'aria-label': 'Change weather location' });
    place.append(el('span', { class: 'wx-place-name', id: 'wxPlaceName' }), el('span', { class: 'wx-updated', id: 'wxUpdated' }));
    const head = el('div', { id: 'wxHead', 'aria-live': 'polite' },
      place,
      el('div', { class: 'wx-when', id: 'wxWhen' }),
      el('div', { class: 'wx-main' }, el('span', { class: 'wx-temp', id: 'wxTemp' }), el('span', { class: 'wx-cond', id: 'wxCond' })),
      el('div', { class: 'wx-facts', id: 'wxFacts' }),
      el('div', { class: 'wx-empty', id: 'wxEmpty', hidden: true }));
    const dial = el('div', { id: 'wxDial', role: 'slider', tabindex: '0', 'aria-label': 'Forecast hour', 'aria-valuemin': '0', 'aria-valuemax': '23', 'aria-valuenow': '0' });
    bindDial(dial);
    const strip = el('div', { id: 'wxStrip', role: 'listbox', 'aria-label': 'Hourly forecast' });
    const days = el('div', { id: 'wxDays', role: 'list', 'aria-label': 'Forecast for the coming days', hidden: true });
    const controls = el('div', { class: 'wx-controls' },
      btn('', 'wx-icon', () => close_('button'), { id: 'wxClose', icon: I.close, 'aria-label': 'Close Weather' }),
      btn('Now', 'wx-now', () => select({ type: 'now' }), { id: 'wxNow', hidden: true }),
      el('div', { class: 'wx-seg', role: 'tablist', 'aria-label': 'Forecast range' },
        btn('Hours', 'wx-tab', () => setMode('hours'), { id: 'wxTabHours', role: 'tab', 'aria-selected': 'true' }),
        btn('7 days', 'wx-tab', () => setMode('days'), { id: 'wxTabDays', role: 'tab', 'aria-selected': 'false' })),
      btn('', 'wx-icon', () => manualRefresh(), { id: 'wxRefresh', icon: I.refresh, 'aria-label': 'Refresh weather' }));
    const credit = el('p', { class: 'wx-credit', text: 'Weather data by Open-Meteo.com · CC BY 4.0' });
    const foot = el('div', { id: 'wxFoot' }, strip, days, controls, credit);
    const note = el('p', { id: 'wxNote', role: 'status', 'aria-live': 'polite' });
    const stage = el('section', { id: 'weather', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Weather', tabindex: '-1', hidden: true }, dial, head, foot, note);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'click', 'contextmenu', 'wheel', 'dblclick'])
      stage.addEventListener(type, (e) => { e.stopPropagation(); if (type === 'contextmenu') e.preventDefault(); }, type.startsWith('touch') || type === 'wheel' ? { passive: true } : false);
    stage.addEventListener('keydown', onKey);
    document.body.append(stage);
  }
  function placeDom() {
    const L = W.L, px = (v) => v.toFixed(1) + 'px';
    const box = (id, r) => Object.assign($(id).style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });
    box('wxHead', L.head); box('wxFoot', L.foot);
    const s = $('weather');
    s.classList.toggle('wide', L.wide); s.classList.toggle('tight', L.tight); s.classList.toggle('mini', L.mini); s.classList.toggle('still', !speed());
    Object.assign($('wxNote').style, { left: px(L.cx), top: px(L.wide ? L.H - 40 : L.foot.y - 30) });
  }
  function placeDial(o) {
    const d = $('wxDial');
    if (!d) return;
    const r = o.irisR * 1.02;
    const key = [o.x, o.y, r].map((v) => v.toFixed(0)).join(':');
    if (d.dataset.k === key) return;
    d.dataset.k = key;
    Object.assign(d.style, { left: (o.x - r).toFixed(1) + 'px', top: (o.y - r).toFixed(1) + 'px', width: (r * 2).toFixed(1) + 'px', height: (r * 2).toFixed(1) + 'px' });
  }
  function showStage(on) {
    ensureDom();
    const s = $('weather');
    s.hidden = !on;
    $('home').classList.toggle('weather-owned', on);
    document.documentElement.classList.toggle('weather-open', on);
    if (on) s.focus({ preventScroll: true });
    else { $('wxStrip').replaceChildren(); $('wxDays').replaceChildren(); $('wxNote').textContent = ''; $('wxDial').dataset.k = ''; }
  }
  function setUi(on) {
    for (const id of ['wxHead', 'wxFoot']) { const n = $(id); if (n) n.classList.toggle('on', !!on); }
    const d = $('wxDial'); if (d) d.classList.toggle('on', !!on);
  }
  function renderReadout() {
    if (!$('weather')) return;
    const v = W.view || { kind: 'setup' }, p = svc.prefs.place, data = svc.data;
    setText($('wxPlaceName'), p ? p.name + (p.source === 'device' ? '' : p.region ? ', ' + p.region : '') : 'Choose a place');
    const upd = $('wxUpdated');
    if (data && p) {
      const age = svc.age();
      const stale = age > D.STALE_MS;
      setText(upd, (svc.busy ? 'Updating… ' : '') + (stale ? 'Updated ' + D.ago(age) : 'Updated ' + D.fmtClock(Math.floor(data.fetchedAt / 1000), data, H12)) + (data.tz ? ' · ' + tzShort(data) : ''));
      upd.classList.toggle('stale', stale);
    } else { setText(upd, svc.busy ? 'Sensing the sky…' : ''); upd.classList.remove('stale'); }
    const empty = $('wxEmpty'), main = $('weather').querySelector('.wx-main');
    const facts = $('wxFacts'), when = $('wxWhen');
    if (v.kind === 'setup' || v.kind === 'loading' || v.kind === 'error') {
      main.hidden = true; facts.hidden = true; when.hidden = true; empty.hidden = false;
      empty.replaceChildren();
      if (v.kind === 'setup') {
        empty.append(el('p', { class: 'wx-empty-title', text: 'Where is outside?' }), el('p', { class: 'wx-empty-text', text: 'Pick a city or postal code and he’ll sense the weather there.' }),
          btn('Choose a place', 'primary', () => openPlace('organ'), { id: 'wxSetup' }));
      } else if (v.kind === 'loading') {
        empty.append(el('p', { class: 'wx-empty-title', text: 'Sensing the sky…' }));
      } else {
        empty.append(el('p', { class: 'wx-empty-title', text: 'He can’t sense the weather right now' }), el('p', { class: 'wx-empty-text', text: v.message }),
          btn('Try again', 'primary', () => manualRefresh(), { id: 'wxRetry' }));
      }
      $('wxDial').setAttribute('aria-valuetext', 'No forecast');
      return;
    }
    main.hidden = false; facts.hidden = false; when.hidden = false; empty.hidden = true;
    setText(when, v.when);
    setText($('wxTemp'), v.kind === 'day' ? T(v.hi) : T(v.temp));
    setText($('wxCond'), v.cond ? v.cond.label : 'Unknown');
    const bits = [];
    if (v.kind !== 'day' && v.feels != null) bits.push('Feels ' + T(v.feels));
    if (v.hi != null && v.lo != null) bits.push('H ' + T(v.hi) + '  L ' + T(v.lo));
    if (v.pop != null) bits.push(popText(v.pop) + ' rain');
    if (v.kind !== 'day' && v.wind != null && v.wind >= 20) bits.push(D.fmtWind(v.wind, unit()));
    setText(facts, bits.join('  ·  '));
    $('wxDial').setAttribute('aria-valuenow', String(W.sel.type === 'hour' ? W.sel.i : 0));
    $('wxDial').setAttribute('aria-valuetext', `${v.when}, ${v.cond ? v.cond.label : ''}, ${T(v.kind === 'day' ? v.hi : v.temp, false)}`);
    $('wxNow').hidden = W.sel.type === 'now' || (W.sel.type === 'hour' && W.sel.i === 0);
  }
  function tzShort(data) {
    try {
      const parts = new Intl.DateTimeFormat(undefined, { timeZone: data.tz, timeZoneName: 'short' }).formatToParts(new Date());
      const z = parts.find((p) => p.type === 'timeZoneName');
      return z ? z.value : data.tz;
    } catch { return data.tz; }
  }
  function renderStrip() {
    const strip = $('wxStrip'), days = $('wxDays');
    if (!strip) return;
    const has = W.hours.length > 0;
    strip.hidden = W.mode !== 'hours' || !has; days.hidden = W.mode !== 'days' || !W.days.length;
    $('weather').querySelector('.wx-seg').hidden = !has;
    if (W.mode === 'hours' && has) {
      const sig = W.hours.map((h) => h.t + ':' + h.temp + ':' + h.code).join('|') + unit();
      if (strip.dataset.sig !== sig) {
        strip.dataset.sig = sig;
        strip.replaceChildren(...W.hours.map((h, i) => {
          const b = el('button', { type: 'button', class: 'wx-hour', role: 'option', 'data-i': String(i), 'aria-selected': 'false' },
            el('span', { class: 'wx-h-time', text: i === 0 ? 'Now' : shortHour(h.t) }), svg(glyphFor(h.cond)), el('span', { class: 'wx-h-temp', text: T(h.temp) }),
            el('span', { class: 'wx-h-pop', text: h.pop != null && h.pop >= 20 ? popText(h.pop) : '' }));
          b.setAttribute('aria-label', `${i === 0 ? 'Now' : D.fmtHour(h.t, svc.data, H12)}, ${h.cond ? h.cond.label : ''}, ${T(h.temp, false)}${h.pop != null ? ', ' + popText(h.pop) + ' chance of rain' : ''}`);
          b.addEventListener('click', (e) => { e.stopPropagation(); select(i === 0 ? { type: 'now' } : { type: 'hour', i }); });
          return b;
        }));
      }
      const cur = W.sel.type === 'hour' ? W.sel.i : 0;
      [...strip.children].forEach((b, i) => { const on = i === cur; if (b.getAttribute('aria-selected') !== String(on)) b.setAttribute('aria-selected', String(on)); });
      const sel = strip.children[cur];
      if (sel && !W.drag) {
        const target = sel.offsetLeft - (strip.clientWidth - sel.offsetWidth) / 2;
        if (Math.abs(strip.scrollLeft - target) > 4) strip.scrollTo({ left: target, behavior: speed() ? 'smooth' : 'auto' });
      }
    }
    if (W.mode === 'days' && W.days.length) {
      const sig = W.days.map((d) => d.t + ':' + d.hi + ':' + d.lo + ':' + d.code).join('|') + unit();
      if (days.dataset.sig !== sig) {
        days.dataset.sig = sig;
        days.replaceChildren(...W.days.map((d, i) => {
          const b = el('button', { type: 'button', class: 'wx-day', role: 'listitem', 'data-i': String(i) },
            el('span', { class: 'wx-d-name', text: i === 0 ? 'Today' : d.wd }), svg(glyphFor(d.cond)),
            el('span', { class: 'wx-d-temps' }, el('b', { text: T(d.hi) }), el('span', { text: T(d.lo) })),
            el('span', { class: 'wx-d-pop', text: d.pop != null && d.pop >= 20 ? popText(d.pop) : '' }));
          b.setAttribute('aria-label', `${i === 0 ? 'Today' : longDay(d)}: ${d.cond ? d.cond.label : ''}, high ${T(d.hi, false)}, low ${T(d.lo, false)}${d.pop != null ? ', ' + popText(d.pop) + ' chance of rain' : ''}`);
          b.addEventListener('click', (e) => { e.stopPropagation(); select({ type: 'day', i }); });
          return b;
        }));
      }
      [...days.children].forEach((b, i) => { b.classList.toggle('on', W.sel.type === 'day' && W.sel.i === i); b.setAttribute('aria-current', String(W.sel.type === 'day' && W.sel.i === i)); });
    }
  }
  function setMode(m) {
    W.mode = m;
    $('wxTabHours').setAttribute('aria-selected', String(m === 'hours'));
    $('wxTabDays').setAttribute('aria-selected', String(m === 'days'));
    if (m === 'hours' && W.sel.type === 'day') W.sel = { type: 'now' };
    applySelection();
  }
  function select(sel) {
    if (sel.type === 'hour' && sel.i === 0) sel = { type: 'now' };
    const same = JSON.stringify(sel) === JSON.stringify(W.sel);
    W.sel = sel;
    if (!same) W.stats.scrubs++;
    applySelection();
  }
  function note(text, dur) {
    const n = $('wxNote');
    if (!n) return;
    n.textContent = text || '';
    clearTimeout(W.noteTimer);
    if (text && dur) W.noteTimer = setTimeout(() => { if (n.textContent === text) n.textContent = ''; }, dur);
  }
  function manualRefresh() {
    if (!svc.prefs.place) { openPlace('organ'); return; }
    note('Checking the sky…');
    svc.refresh({ force: true }).then(() => note(svc.error ? svc.error.message : 'Up to date.', 2600));
    renderReadout();
  }

  // ---------- the dial: rotate around his iris to move through the next 24 hours ----------
  function angleIndex(e, dial) {
    const r = dial.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    let a = Math.atan2(y, x) + Math.PI / 2;
    if (a < 0) a += TAU;
    return { i: Math.round((a / TAU) * 24) % 24, d: Math.hypot(x, y) / (r.width / 2) };
  }
  function bindDial(dial) {
    dial.addEventListener('pointerdown', (e) => {
      if (W.state !== 'WEATHER_ACTIVE' || !W.hours.length) return;
      const p = angleIndex(e, dial);
      if (p.d > 1.05) return;
      W.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, startI: p.i, inner: p.d < 0.6 };
      try { dial.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    dial.addEventListener('pointermove', (e) => {
      const dr = W.drag;
      if (!dr || dr.id !== e.pointerId) return;
      if (!dr.moved && Math.hypot(e.clientX - dr.x, e.clientY - dr.y) < 8) return;
      dr.moved = true;
      const p = angleIndex(e, dial);
      const i = Math.min(p.i, W.hours.length - 1);
      const cur = W.sel.type === 'hour' ? W.sel.i : 0;
      // no jumping from 11 PM-ish back to now across the top: you go back the way you came
      if (Math.abs(i - cur) > 12) return;
      if (i !== cur) { select(i === 0 ? { type: 'now' } : { type: 'hour', i }); if (navigator.vibrate && i % 6 === 0) try { navigator.vibrate(4); } catch {} }
    });
    const end = (e) => {
      const dr = W.drag;
      if (!dr || dr.id !== e.pointerId) return;
      W.drag = null;
      // a tap on his window returns to now; a tap on the ring jumps to that hour
      if (!dr.moved && e.type === 'pointerup') {
        if (dr.inner) select({ type: 'now' });
        else select(dr.startI === 0 ? { type: 'now' } : { type: 'hour', i: Math.min(dr.startI, W.hours.length - 1) });
      }
      renderStrip();
    };
    dial.addEventListener('pointerup', end);
    dial.addEventListener('pointercancel', end);
    dial.addEventListener('keydown', (e) => {
      if (!W.hours.length) return;
      const cur = W.sel.type === 'hour' ? W.sel.i : 0;
      let i = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') i = Math.min(W.hours.length - 1, cur + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') i = Math.max(0, cur - 1);
      else if (e.key === 'PageUp') i = Math.min(W.hours.length - 1, cur + 6);
      else if (e.key === 'PageDown') i = Math.max(0, cur - 6);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = W.hours.length - 1;
      if (i === null) return;
      e.preventDefault(); e.stopPropagation();
      select(i === 0 ? { type: 'now' } : { type: 'hour', i });
    });
  }

  // =====================================================================================================
  // 5 · The ability's life
  // =====================================================================================================
  function go(state, reason) {
    if (!W.api) return false;
    if (!W.api.go(state, reason)) return false;
    W.state = state;
    const s = $('weather'); if (s) s.dataset.state = state;
    return true;
  }
  const owned = () => !!W.api && W.state !== 'IDLE';
  function activate(api, opts) {
    W.api = api; W.state = api.state(); W.gen++;
    const gen = W.gen;
    W.stats.opened++;
    ensureDom();
    W.L = computeLayout();
    W.sel = { type: 'now' }; W.mode = 'hours'; W.ringPos = 0; W.ringTarget = 0; W.flash = 0; W.drag = null;
    $('wxTabHours').setAttribute('aria-selected', 'true'); $('wxTabDays').setAttribute('aria-selected', 'false');
    placeDom();
    showStage(true);
    setUi(false);
    applySelection(true);
    // open with what we have; ask for fresher weather in the background if ours is old
    if (svc.prefs.place) svc.refresh();
    const d = planOpening(opts && opts.chip);
    setTimeout(() => { if (gen === W.gen && W.state === 'WEATHER_AWARE') go('WEATHER_FORMING', 'forming'); }, 520 * speed());
    setTimeout(() => {
      if (gen !== W.gen || !owned()) return;
      if (!go('WEATHER_ACTIVE', 'ready')) { closeNow('refused'); return; }
      setTimeout(() => { if (gen === W.gen && W.state === 'WEATHER_ACTIVE') planSteady(); }, Math.max(0, W.moveUntil - ms()));
      setUi(true);
      if (!svc.prefs.place) { const b = $('wxSetup'); if (b && api.keyboard()) b.focus(); }
      if (svc.data && svc.age() > D.STALE_MS) note('Showing saved weather from ' + D.ago(svc.age()) + '.', 4200);
    }, Math.max(0, d - 280 * speed()));
  }
  function close_(reason, fast) {
    if (!owned() || W.state === 'WEATHER_CLOSING') return;
    const gen = ++W.gen;
    closePlace();
    setUi(false);
    if (document.activeElement && $('weather').contains(document.activeElement)) document.activeElement.blur();
    if (!go('WEATHER_CLOSING', reason)) { closeNow(reason); return; }
    const d = planClosing(!!fast);
    setTimeout(() => { if (W.gen === gen && W.state === 'WEATHER_CLOSING') finish(reason); }, d + 20);
  }
  function closeNow(reason) { ++W.gen; finish(reason); }
  function finish(reason) {
    clearTimeout(W.noteTimer);
    W.tracks = null; W.cur = null; W.drag = null; W.flash = 0;
    W.state = 'IDLE';
    W.stats.closed++;
    showStage(false);
    const api = W.api;
    W.api = null;
    if (api) api.done(reason);
    planIdle(true);
  }
  function back() {
    if (!owned()) return false;
    if (closePlace()) return true;
    if (W.state === 'WEATHER_CLOSING') return true;
    if (W.state !== 'WEATHER_ACTIVE') { close_('back', true); return true; }
    if (W.mode === 'days') { setMode('hours'); return true; }
    if (W.sel.type !== 'now') { select({ type: 'now' }); return true; }
    close_('back');
    return true;
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); back(); return; }
    if (e.key === 'Tab') {
      const scope = $('weather');
      const items = [...scope.querySelectorAll('button, [tabindex="0"]')].filter((b) => !b.disabled && b.offsetParent !== null && !b.closest('[hidden]'));
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  }
  function suspend(reason) {
    if (!owned()) return;
    if (W.state === 'WEATHER_CLOSING' || W.state === 'WEATHER_AWARE') closeNow(reason);
    // otherwise stay: coming back finds the weather as you left it (nothing animates while hidden)
  }
  function interrupt(reason) { if (owned()) closeNow(reason); }
  addEventListener('resize', () => {
    if (!owned() || !W.L) return;
    const L = computeLayout();
    if (L.key === W.L.key) return;
    W.L = L;
    placeDom();
    if (W.state === 'WEATHER_ACTIVE') planSteady();
  });
  function available() { return (!window.EYES_WEB || window.EYES_IOS_ABILITIES) && svc.prefs.enabled; }

  // =====================================================================================================
  // 6 · Idle weather moments: now and then, he senses what's outside (a few seconds, then nothing)
  // =====================================================================================================
  const IDLE = { timer: 0, active: null, shown: 0, skipped: {}, last: 0, first: true };
  function idleKind() {
    const v = svc.now();
    if (!v || !v.available || v.age > 3 * 3600e3 || !v.cond) return null;
    const k = v.cond.kind;
    if (k === 'partly' && v.cond.night) return 'night';
    return SKY.MOMENTS[k] ? k : null;
  }
  function planIdle(soon) {
    clearTimeout(IDLE.timer); IDLE.timer = 0;
    const p = svc.prefs;
    if ((window.EYES_WEB && !window.EYES_IOS_ABILITIES) || !p.enabled || !p.idle || !p.place || document.hidden) return;
    // every few minutes, with some looseness so it never feels like a timer
    const delay = IDLE.first ? 70e3 + Math.random() * 60e3 : soon ? 120e3 + Math.random() * 60e3 : 240e3 + Math.random() * 360e3;
    IDLE.timer = setTimeout(tryMoment, delay);
  }
  function whyNot() {
    const h = host();
    if (!h) return 'nohost';
    const b = h.blocked(); if (b) return b;
    if (!h.motion()) return 'motion';
    if (h.lowPower()) return 'power';
    if (!window.EyesAbility || EyesAbility.state() !== 'IDLE' || EyesAbility.owner()) return 'ability';
    // the launcher's own "is anyone busy?" (notification card, touch, music controls, call, game, dive …)
    try { const lh = Haven.livingHost && Haven.livingHost(); const q = lh && lh.quiet(); if (q) return q; } catch {}
    const core = h.core, t = h.now();
    if (core) {
      if (core.asleep) return 'asleep';
      if (core.mode && core.mode !== 'idle') return 'mode:' + core.mode;
      if (core.stage && core.stage !== 'rest') return 'stage';
      if (core.activeReaction && core.activeReaction(t)) return 'reaction';
      if (core.busy && core.busy(t)) return 'busy';
      const st = core.state || {};
      if (st.charging) return 'charging';
      if (st.media && st.media.playing) return 'music';
    }
    if (window.HavenLife && HavenLife.busy && HavenLife.busy(t)) return 'quirk';
    if (window.EyesVisits && EyesVisits.active && EyesVisits.active(t)) return 'visit';
    return '';
  }
  function tryMoment(force) {
    IDLE.timer = 0;
    const kind = idleKind();
    const why = kind ? whyNot() : 'noweather';
    if (why && !force) { IDLE.skipped[why] = (IDLE.skipped[why] || 0) + 1; planIdle(true); return false; }
    if (!kind) return false;
    IDLE.first = false;
    const gentle = speed() < 1;
    // under reduced motion, nothing travels: only light changes, slowly
    const k = gentle && (kind === 'rain' || kind === 'snow' || kind === 'wind') ? (kind === 'snow' ? 'overcast' : kind === 'wind' ? 'partly' : 'rain') : kind;
    IDLE.active = { kind: k, at: ms(), dur: SKY.MOMENTS[k].dur * (gentle ? 1.4 : 1), gentle };
    IDLE.shown++; IDLE.last = Date.now();
    const h = host(); if (h) h.schedule();
    planIdle(false);
    return true;
  }
  const ambient = {
    frame(ctx, g) {
      const a = IDLE.active;
      if (!a) return;
      const e = (ms() - a.at) / a.dur;
      if (e >= 1) { IDLE.active = null; return; }
      // anything more important appearing ends the moment at once
      const h = host();
      if (h && (h.blocked() || (h.core && h.core.mode && h.core.mode !== 'idle'))) { IDLE.active = null; return; }
      const o = geom(g);
      if (!o) return;
      // a blink (or a squint) takes the moment away; it never shows outside his body
      const lids = g.lids || { upper: 0, lower: 0 };
      const shut = Math.max(lids.upper || 0, lids.lower || 0);
      const fade = clamp(1 - shut * 2.4);
      const tilt = g.pose ? g.pose.tilt : 0;
      SKY.paintMoment(ctx, {
        kind: a.kind, e, gx: o.x, gy: o.y, R: o.irisR, gentle: a.gentle, fade,
        clip: (c) => { c.beginPath(); c.ellipse(g.cx, g.cy, Math.max(1, g.rx * 0.98), Math.max(1, g.ry * 0.98), tilt, 0, TAU); c.clip(); }
      });
    },
    fps() { return IDLE.active ? 30 : 0; }
  };

  // =====================================================================================================
  // 7 · Where is outside? (city / postal code search, or one approximate device location)
  // =====================================================================================================
  const PL = { from: null, timer: 0, seq: 0 };
  function ensurePlace() {
    if ($('wxPlace')) return;
    const input = el('input', { id: 'wxPlaceSearch', type: 'search', placeholder: 'City or postal code', autocomplete: 'off', spellcheck: false, enterKeyHint: 'search', 'aria-label': 'Search for a city or postal code' });
    input.addEventListener('input', () => { clearTimeout(PL.timer); PL.timer = setTimeout(runSearch, 420); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(PL.timer); runSearch(); } });
    const results = el('div', { id: 'wxPlaceResults', role: 'listbox', 'aria-label': 'Places' });
    const status = el('p', { id: 'wxPlaceStatus', role: 'status', 'aria-live': 'polite' });
    const locate = btn('Use my approximate location', 'wx-locate', () => askDevice(), { id: 'wxLocate', icon: I.locate });
    const explain = el('p', { class: 'wx-explain', text: 'Optional. Android asks first. EYES takes one approximate fix, rounds it to about 1 km, and uses it only to fetch the forecast. No tracking, nothing in the background. A city works just as well.' });
    const panel = el('div', { class: 'wx-place-panel' },
      el('div', { class: 'wx-place-head' }, el('h2', { text: 'Where is outside?' }), btn('', 'wx-icon', () => closePlace(), { id: 'wxPlaceClose', icon: I.close, 'aria-label': 'Close' })),
      el('label', { class: 'wx-search' }, input), status, results, locate, explain,
      el('p', { class: 'wx-credit', text: 'Place search by Open-Meteo.com' }));
    panel.tabIndex = -1;
    const sheet = el('div', { id: 'wxPlace', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Weather location', hidden: true }, panel);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'click', 'wheel'])
      sheet.addEventListener(type, (e) => e.stopPropagation(), type.startsWith('touch') || type === 'wheel' ? { passive: true } : false);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closePlace(); });
    sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePlace(); } });
    document.body.append(sheet);
  }
  function openPlace(from) {
    ensurePlace();
    PL.from = from;
    const s = $('wxPlace');
    s.hidden = false;
    $('wxPlaceResults').replaceChildren();
    $('wxPlaceStatus').textContent = svc.prefs.place ? 'Now: ' + placeLabel(svc.prefs.place) : '';
    $('wxPlaceSearch').value = '';
    $('wxLocate').disabled = false;
    setTimeout(() => { try { $('wxPlaceSearch').focus({ preventScroll: true }); } catch {} }, 60);
  }
  function closePlace() {
    const s = $('wxPlace');
    if (!s || s.hidden) return false;
    s.hidden = true;
    clearTimeout(PL.timer); PL.seq++;
    if (document.activeElement && s.contains(document.activeElement)) document.activeElement.blur();
    const back = PL.from === 'optic' ? $('wxOpticPlace') : $('wxPlaceBtn');
    if (back && back.offsetParent) try { back.focus({ preventScroll: true }); } catch {}
    return true;
  }
  const placeLabel = (p) => [p.name, p.source === 'device' ? '' : p.region, p.source === 'device' ? '' : p.country].filter(Boolean).join(', ');
  async function runSearch() {
    const q = $('wxPlaceSearch').value.trim();
    const seq = ++PL.seq;
    const list = $('wxPlaceResults'), st = $('wxPlaceStatus');
    if (q.length < 2) { list.replaceChildren(); st.textContent = ''; return; }
    st.textContent = 'Searching…';
    try {
      const res = await D.searchPlaces(q, { lang: (langs()[0] || 'en') });
      if (seq !== PL.seq) return;
      st.textContent = res.length ? '' : 'Nothing found for “' + q + '”. Try a nearby city or a postal code.';
      list.replaceChildren(...res.map((p) => {
        const b = el('button', { type: 'button', class: 'wx-result', role: 'option' }, el('b', { text: p.name }), el('span', { text: [p.region, p.country].filter(Boolean).join(', ') }));
        b.addEventListener('click', (e) => { e.stopPropagation(); choosePlace(p); });
        return b;
      }));
    } catch (e) {
      if (seq !== PL.seq) return;
      st.textContent = (e && e.message) || 'Place search isn’t available right now.';
    }
  }
  function choosePlace(p) {
    svc.setPrefs({ place: { ...p, at: Date.now() } });
    closePlace();
    W.sel = { type: 'now' };
    applySelection();
    syncOptic();
    updateChip();
    planIdle(true);
  }
  // Device location goes through EYES' own Android bridge (native/WeatherLocation.java): coarse permission
  // only, one fix, rounded on the phone before JavaScript sees it. Without the bridge (an older EYES build)
  // the option says so instead of failing silently. A plain browser falls back to navigator.geolocation.
  const wxNative = () => (window.EyesWeatherNative && typeof window.EyesWeatherNative.locate === 'function' ? window.EyesWeatherNative : null);
  const inApp = () => !!window.Phone && !window.EYES_IOS_ABILITIES;
  const LOC = { wait: null, timer: 0 };
  function nativeLocate(ask) {
    return new Promise((resolve, reject) => {
      const n = wxNative();
      if (!n) { reject({ code: 'unsupported' }); return; }
      if (LOC.wait) LOC.wait.reject({ code: 'superseded' });
      LOC.wait = { resolve, reject };
      clearTimeout(LOC.timer);
      LOC.timer = setTimeout(() => { if (LOC.wait) { LOC.wait.reject({ code: 3 }); LOC.wait = null; } }, 25000);
      try { n.locate(!!ask); } catch { LOC.wait = null; reject({ code: 'unsupported' }); }
    });
  }
  function fromNative(json) {
    let m;
    try { m = typeof json === 'string' ? JSON.parse(json) : json; } catch { return; }
    if (!m || m.type !== 'location' || !LOC.wait) return;
    const w = LOC.wait; LOC.wait = null; clearTimeout(LOC.timer);
    const lat = Number(m.lat), lon = Number(m.lon);
    if (m.ok && Number.isFinite(lat) && Number.isFinite(lon)) w.resolve({ coords: { latitude: lat, longitude: lon } });
    else w.reject({ code: m.reason === 'denied' ? 1 : m.reason === 'timeout' ? 3 : m.reason === 'off' ? 'off' : 2 });
  }
  function geolocate(maxAge, ask) {
    if (wxNative()) return nativeLocate(ask !== false);
    if (inApp()) return Promise.reject({ code: 'unsupported' });
    return new Promise((resolve, reject) => {
      const g = navigator.geolocation;
      if (!g || !g.getCurrentPosition) { reject({ code: 'unsupported' }); return; }
      try {
        g.getCurrentPosition((pos) => resolve(pos), (err) => reject(err || { code: 2 }), { enableHighAccuracy: false, timeout: 12000, maximumAge: maxAge });
      } catch (e) { reject({ code: 'unsupported' }); }
    });
  }
  async function askDevice() {
    const st = $('wxPlaceStatus'), b = $('wxLocate');
    b.disabled = true;
    try { $('wxPlace').querySelector('.wx-place-panel').focus({ preventScroll: true }); } catch {}
    st.textContent = 'Asking for your approximate location…';
    try {
      const pos = await geolocate(30 * 60e3, true);
      const lat = Math.round(pos.coords.latitude * 100) / 100, lon = Math.round(pos.coords.longitude * 100) / 100;
      choosePlace({ name: 'Your location', lat, lon, source: 'device', cc: '', region: '', country: '' });
    } catch (e) {
      b.disabled = false;
      const code = e && e.code;
      st.textContent = code === 1 ? 'Location wasn’t allowed. That’s fine: choose a city instead.'
        : code === 'unsupported' ? 'Device location needs the EYES Android update. Choose a city instead.'
          : code === 'off' ? 'Location is turned off on this phone. Choose a city instead.'
            : code === 3 ? 'Your phone didn’t find a location in time. Try again, or choose a city.'
              : 'Location isn’t available right now. Choose a city instead.';
    }
  }
  // a device location is refreshed at most every few hours, only with EYES on screen, and only if Android
  // already allows it (never a surprise prompt)
  async function maybeUpdateDevicePlace() {
    const p = svc.prefs.place;
    if (!p || p.source !== 'device' || Date.now() - (p.at || 0) < 4 * 3600e3) return;
    try {
      const n = wxNative();
      if (n) { if (typeof n.status !== 'function' || n.status() !== 'granted') return; }
      else {
        if (inApp() || !navigator.permissions || !navigator.permissions.query) return;
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        if (!perm || perm.state !== 'granted') return;
      }
      const pos = await geolocate(3600e3, false);
      const lat = Math.round(pos.coords.latitude * 100) / 100, lon = Math.round(pos.coords.longitude * 100) / 100;
      if (Math.abs(lat - p.lat) < 0.05 && Math.abs(lon - p.lon) < 0.05) svc.setPrefs({ place: { ...p, at: Date.now() } });
      else svc.setPrefs({ place: { ...p, lat, lon, at: Date.now() } });
    } catch {}
  }

  // =====================================================================================================
  // 8 · The Optic: a small Weather group
  // =====================================================================================================
  function ensureOptic() {
    if ($('wxOptic')) return;
    const settings = $('settings');
    if (!settings) return;
    const anchor = [...settings.querySelectorAll('h2.optic-group')].find((h) => /Notifications/i.test(h.textContent));
    const row = (label, small, control, id) => el('div', { class: 'setting', id }, el('span', { text: label }, el('small', { text: small })), control);
    const check = (id, aria) => { const c = el('input', { type: 'checkbox', id, 'aria-label': aria }); return c; };
    const enabled = check('wxEnabled', 'Weather Organ');
    const chip = check('wxChipOn', 'Show temperature on Home');
    const idle = check('wxIdleOn', 'Idle weather moments');
    const unitSel = el('select', { id: 'wxUnit', 'aria-label': 'Temperature units' },
      el('option', { value: 'auto', text: 'Auto' }), el('option', { value: 'F', text: '°F' }), el('option', { value: 'C', text: '°C' }));
    const placeBtn = el('button', { id: 'wxOpticPlace', class: 'setting', type: 'button' },
      el('span', { text: 'Location' }, el('small', { id: 'wxOpticPlaceText', text: 'Not set' })), el('span', { class: 'row-go', 'aria-hidden': 'true' }));
    placeBtn.addEventListener('click', (e) => { e.stopPropagation(); openPlace('optic'); });
    const refresh = el('button', { id: 'wxOpticRefresh', class: 'manage-shortcuts', type: 'button', text: 'Refresh' });
    refresh.addEventListener('click', (e) => { e.stopPropagation(); if (!svc.prefs.place) { openPlace('optic'); return; } svc.refresh({ force: true }); syncOptic(); });
    enabled.addEventListener('change', () => { svc.setPrefs({ enabled: enabled.checked }); afterPrefs(); });
    chip.addEventListener('change', () => { svc.setPrefs({ chip: chip.checked }); afterPrefs(); });
    idle.addEventListener('change', () => { svc.setPrefs({ idle: idle.checked }); afterPrefs(); });
    unitSel.addEventListener('change', () => { svc.setPrefs({ unit: unitSel.value }); afterPrefs(); });
    const group = el('div', { id: 'wxOptic' },
      el('h2', { class: 'optic-group', text: 'Weather' }),
      row('Weather Organ', 'He becomes a little weather system. Choose Weather from the Ability Wheel.', enabled),
      row('Temperature on Home', 'A small reading beside the date. Tap it to open Weather.', chip, 'wxChipRow'),
      row('Weather moments', 'Now and then, he senses the weather outside. Brief and quiet.', idle, 'wxIdleRow'),
      row('Units', 'Auto follows your region.', unitSel, 'wxUnitRow'),
      placeBtn,
      row('Forecast', 'Not updated yet', refresh, 'wxRefreshRow'),
      el('p', { class: 'detail', text: 'Forecasts by Open-Meteo.com (CC BY 4.0). Only the place you choose is sent to fetch them; device location is optional, approximate and never tracked. EYES refreshes about every 45 minutes while he’s on screen, and never in the background.' }));
    if (anchor) settings.insertBefore(group, anchor); else settings.append(group);
    syncOptic();
  }
  function afterPrefs() { syncOptic(); updateChip(); planIdle(true); if (!svc.prefs.enabled && owned()) close_('disabled', true); if (W.api) W.api.redraw(); }
  function syncOptic() {
    if (!$('wxOptic')) return;
    const p = svc.prefs;
    $('wxEnabled').checked = p.enabled; $('wxChipOn').checked = p.chip; $('wxIdleOn').checked = p.idle; $('wxUnit').value = p.unit;
    for (const id of ['wxChipRow', 'wxIdleRow', 'wxUnitRow', 'wxOpticPlace', 'wxRefreshRow']) { const n = $(id); if (n) n.classList.toggle('wx-off', !p.enabled); }
    setText($('wxOpticPlaceText'), p.place ? placeLabel(p.place) : 'Not set · choose a city or postal code');
    const small = $('wxRefreshRow').querySelector('small');
    const age = svc.age();
    setText(small, svc.busy ? 'Updating…' : svc.error && (!svc.data || age > D.STALE_MS) ? svc.error.message : svc.data ? 'Updated ' + D.ago(age) : p.place ? 'Not updated yet' : 'Choose a location first');
    $('wxUnit').querySelector('option[value="auto"]').textContent = 'Auto (' + (D.resolveUnit({ unit: 'auto' }, p.place, langs()) === 'F' ? '°F' : '°C') + ')';
  }

  // =====================================================================================================
  // wiring
  // =====================================================================================================
  svc.on((why) => {
    updateChip();
    syncOptic();
    if (owned()) {
      if (why === 'data' || why === 'error' || why === 'prefs') applySelection();
      else renderReadout();
      if (why === 'error' && W.state === 'WEATHER_ACTIVE' && svc.data) note('Couldn’t update. Showing saved weather from ' + D.ago(svc.age()) + '.', 4200);
    }
    if (why === 'data' && !IDLE.timer) planIdle(true);
  });
  document.addEventListener('visibilitychange', () => {
    const vis = !document.hidden;
    svc.visible(vis);
    if (vis) { updateChip(); planChip(); planIdle(true); maybeUpdateDevicePlace(); }
    else { clearTimeout(chipTimer); clearTimeout(IDLE.timer); IDLE.timer = 0; IDLE.active = null; }
  });
  // Escape anywhere, and Android Back (Haven.back), close the place picker first, even over The Optic
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('wxPlace') && !$('wxPlace').hidden) { e.preventDefault(); e.stopPropagation(); closePlace(); } }, true);
  function wrapBack() {
    if (!window.Haven || typeof Haven.back !== 'function' || Haven.back.wxWrapped) return;
    const orig = Haven.back;
    const wrapped = function () { if (closePlace()) return true; return orig.apply(this, arguments); };
    wrapped.wxWrapped = true;
    Haven.back = wrapped;
  }
  function boot() {
    wrapBack();
    ensureChip(); updateChip(); planChip(); ensureOptic();
    svc.visible(!document.hidden);
    planIdle(false);
    maybeUpdateDevicePlace();
  }
  const register = () => window.EyesAbility && EyesAbility.register({
    id: 'weather',
    label: 'Weather',
    icon: ICON,
    available,
    entry: 'WEATHER_AWARE',
    states: {
      WEATHER_AWARE: ['WEATHER_FORMING', 'WEATHER_ACTIVE', 'WEATHER_CLOSING'],
      WEATHER_FORMING: ['WEATHER_ACTIVE', 'WEATHER_CLOSING'],
      WEATHER_ACTIVE: ['WEATHER_CLOSING'],
      WEATHER_CLOSING: []
    },
    activate: (api, opts) => activate(api, opts), pose, fps, frame, back, interrupt, suspend
  });
  const start = () => {
    if (window.EyesAbility && EyesAbility.ambient) EyesAbility.ambient({ id: 'weather', frame: ambient.frame, fps: ambient.fps });
    boot();
  };
  if (!register()) addEventListener('DOMContentLoaded', () => { register(); }, { once: true });
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start, { once: true }); else start();

  window.EyesWeather = {
    service: svc,
    fromNative,
    open: () => openFromChip(),
    close: () => close_('api'),
    diagnostics: () => ({
      state: W.state, sel: W.sel, mode: W.mode, view: W.view ? { kind: W.view.kind, temp: W.view.temp, cond: W.view.cond && W.view.cond.kind, when: W.view.when } : null,
      hours: W.hours.length, days: W.days.length, ring: { pos: W.ringPos, target: W.ringTarget },
      scene: W.sky.target(), live: W.sky.live(), settled: W.sky.settled(), sky: W.sky.stats(), flash: W.flash,
      layout: W.L ? { S: W.L.S, head: W.L.head, foot: W.L.foot, wide: W.L.wide, tight: W.L.tight } : null,
      idle: { timer: !!IDLE.timer, active: IDLE.active ? IDLE.active.kind : null, shown: IDLE.shown, skipped: { ...IDLE.skipped }, why: whyNot() },
      chip: $('weatherChip') ? { hidden: $('weatherChip').hidden, text: $('weatherChip').textContent, label: $('weatherChip').getAttribute('aria-label'), stale: $('weatherChip').classList.contains('stale') } : null,
      service: svc.diagnostics(), stats: { ...W.stats }
    }),
    // test-only: show a condition's world without touching the real forecast
    _debug: { preview: (kind, night, intensity) => { W.sky.setTarget(SKY.sceneFor({ kind, night: !!night, intensity: intensity == null ? 1 : intensity }), true); if (W.api) W.api.redraw(); return W.sky.target(); }, moment: (kind) => { if (kind) { const k = kind; IDLE.active = { kind: k, at: ms(), dur: SKY.MOMENTS[k].dur, gentle: speed() < 1 }; const h = host(); if (h) h.schedule(); return true; } return tryMoment(); }, tryMoment: () => tryMoment(), whyNot, select, setMode, layout: computeLayout, fps: (t) => fps(t || ms(), false), openPlace, choosePlace, idleFps: () => ambient.fps() }
  };
})();
