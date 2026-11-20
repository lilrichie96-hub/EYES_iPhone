/* EYES for iPhone: the shell around the eye.
   No launcher: one living eye, its Eye.D. card, its keepsake code, and Eye Contact with a linked EYES
   (iPhone or Android). Uses the same haven-dna.js and awakening.js as the Android app, so births,
   genes, growth, evolution and cards are identical. */
(function () {
  'use strict';
  const VERSION = '1.0.0';
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2, clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const now = () => performance.now() / 1000;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const FKEY = 'eyes.friend.v1', PKEY = 'eyes.prefs.v1';
  let prefs = {}; try { prefs = JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PKEY, JSON.stringify(prefs)); } catch (e) {} };

  // ---------- layout: where the eye lives ----------
  function geo() {
    const w = innerWidth, h = innerHeight;
    const r = Math.min(w * 0.34, h * 0.2, 170);
    return { w, h, r, x: w / 2, y: h * 0.42 };
  }
  window.EYES_HOME_TARGET = () => { const g = geo(); return { x: g.x, y: g.y, r: g.r }; };   // the Awakening flies here
  const homeCv = $('homeEye'), friendCv = $('friendEye'), fxCv = $('fx'), fctx = fxCv.getContext('2d');
  let G = geo(), dpr = 1;
  function layout() {
    G = geo(); dpr = Math.min(2, devicePixelRatio || 1);
    const S = G.r / 0.36;
    Object.assign(homeCv.style, { width: S + 'px', height: S + 'px', left: G.x - S / 2 + 'px', top: G.y - S / 2 + 'px' });
    const nm = $('eyeName'); nm.style.top = G.y + G.r * 1.18 + 'px';
    $('toast').style.top = G.y + G.r * 1.18 + 64 + 'px';
    $('signals').style.bottom = `calc(env(safe-area-inset-bottom, 0px) + 84px)`;
    const fs = Math.min(G.w * 0.42, 190);
    Object.assign(friendCv.style, { width: fs + 'px', height: fs + 'px', left: -fs * 0.08 + 'px', top: `calc(env(safe-area-inset-top, 0px) + 30px)` });
    fxCv.width = Math.round(G.w * dpr); fxCv.height = Math.round(G.h * dpr);
    if (homeEye) homeEye.resize();
    if (friendEye) friendEye.resize();
  }
  addEventListener('resize', layout);

  // ---------- screens ----------
  function show(id) { ['home', 'welcome', 'install'].forEach((s) => { $(s).hidden = s !== id; }); }
  function route() {
    if (HavenDNA.has()) { show('home'); layout(); return; }
    if (isIOS && !standalone && !sessionStorage.getItem('eyes.anyway')) show('install');
    else show('welcome');
  }
  $('installAnyway').onclick = () => { sessionStorage.setItem('eyes.anyway', '1'); route(); };
  $('wakeBtn').onclick = () => { show('home'); layout(); persistStorage(); HavenAwakening.start(); };
  $('restoreOpen').onclick = () => { $('restoreBox').hidden = false; $('restoreTxt').focus(); };
  $('restoreGo').onclick = () => {
    try { restoreKeepsake($('restoreTxt').value); location.reload(); }
    catch (e) { $('restoreErr').textContent = "That code doesn't look right. Check you copied all of it."; }
  };
  function persistStorage() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {} }

  // ---------- keepsake (backup) ----------
  function b64u(str) { const bytes = new TextEncoder().encode(str); let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(str) { let s = str.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); }
  function keepsake() {
    const d = localStorage.getItem('haven.dna.v1'), g = localStorage.getItem('haven.growth.v1');
    return d ? 'EYES1.' + b64u(JSON.stringify({ d: JSON.parse(d), g: g ? JSON.parse(g) : null })) : '';
  }
  function restoreKeepsake(text) {
    const m = String(text || '').match(/EYES1\.[A-Za-z0-9_-]+/); if (!m) throw new Error('bad');
    const o = JSON.parse(unb64u(m[0].slice(6)));
    if (!o || !o.d || typeof o.d.seed !== 'number') throw new Error('bad');
    localStorage.setItem('haven.dna.v1', JSON.stringify(o.d));
    if (o.g) localStorage.setItem('haven.growth.v1', JSON.stringify(o.g));
  }

  // ---------- the eye ----------
  let homeEye = null, lastTouch = now(), sleepy = false;
  function makeHome() {
    const d = HavenDNA.dna(); if (!d) return;
    homeEye = new HavenEye(d, homeCv); homeEye.resize();
    document.documentElement.style.setProperty('--accent', d.accent.join(','));
    $('nameTxt').textContent = d.name;
    const g = HavenDNA.growth();
    $('wordsTxt').textContent = d.words.join(' · ') + (g ? ' · ' + g.stageName.toLowerCase() : '');
  }
  addEventListener('haven:dna', () => { if (HavenDNA.has()) makeHome(); sendMine(false); });
  const local = (x, y) => { const k = G.r * 1.6; return { x: clamp((x - G.x) / k, -1, 1), y: clamp((y - G.y) / k, -1, 1) }; };
  let press = null;
  $('home').addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .sheet') || !homeEye || HavenAwakening.open) return;
    unlockAudio();
    press = { t: now(), x: e.clientX, y: e.clientY, moved: 0, onEye: Math.hypot(e.clientX - G.x, e.clientY - G.y) < G.r * 1.15 };
    homeEye.follow = local(e.clientX, e.clientY); wake();
  });
  addEventListener('pointermove', (e) => {
    if (!press || !homeEye) return;
    press.moved += Math.hypot(e.clientX - press.x, e.clientY - press.y); press.x = e.clientX; press.y = e.clientY;
    homeEye.follow = local(e.clientX, e.clientY);
  });
  const release = () => {
    if (!press || !homeEye) return;
    const t = now(), held = t - press.t;
    homeEye.follow = null;
    if (press.onEye && held < 0.3 && press.moved < 12) { const q = local(press.x, press.y); homeEye.poke(q.x, q.y, t); HavenDNA.note('poke'); }
    else if (press.onEye && held > 0.6 && press.moved > 40) { homeEye.moodGoal.squint = 0.3; homeEye.pupilGoal = 1.15; setTimeout(() => { if (homeEye) { homeEye.moodGoal.squint = 0; homeEye.pupilGoal = 1; } }, 1600); HavenDNA.note('pet'); }
    press = null;
  };
  addEventListener('pointerup', release); addEventListener('pointercancel', release);
  function wake() { lastTouch = now(); if (sleepy && homeEye) { sleepy = false; homeEye.moodGoal.squint = 0; homeEye.blinkNow(); } }

  // ---------- Eye.D. + keepsake ----------
  $('idBtn').onclick = () => HavenAwakening.showSaved();
  function openSheet(id) { $('scrim').hidden = false; $(id).hidden = false; }
  function closeSheets() { $('scrim').hidden = true; ['linkSheet', 'moreSheet'].forEach((s) => { $(s).hidden = true; }); sheetEyes = []; }
  $('scrim').onclick = closeSheets;
  $('moreBtn').onclick = () => { $('keepTxt').value = keepsake(); $('ver').textContent = VERSION; soundLabel(); openSheet('moreSheet'); };
  $('keepCopy').onclick = async () => { try { await navigator.clipboard.writeText($('keepTxt').value); toast('Keepsake copied'); } catch (e) { $('keepTxt').select(); } };
  $('keepShare').onclick = () => { if (navigator.share) navigator.share({ text: $('keepTxt').value }).catch(() => {}); else $('keepCopy').onclick(); };
  const soundLabel = () => { $('soundBtn').textContent = 'Signal sounds: ' + (prefs.mute ? 'off' : 'on'); };
  $('soundBtn').onclick = () => { prefs.mute = !prefs.mute; savePrefs(); soundLabel(); };

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, ms = 2600) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms); }

  // ---------- sound (soft, optional) ----------
  let ac = null;
  function unlockAudio() { if (ac || prefs.mute) return; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  function tone(freq, dur, when = 0, vol = 0.05, type = 'sine') {
    if (!ac || prefs.mute) return;
    const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.92, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const SOUNDS = {
    pulse: () => { tone(110, 0.25, 0, 0.09); tone(105, 0.25, 0.22, 0.07); },
    spark: () => { [1320, 1760, 2093].forEach((f, i) => tone(f, 0.18, i * 0.05, 0.025, 'triangle')); },
    calm: () => { tone(392, 1.4, 0, 0.035); tone(587, 1.6, 0.15, 0.025); },
    resonance: () => { [262, 330, 392, 523].forEach((f, i) => tone(f, 1.2, i * 0.07, 0.03)); }
  };

  // ---------- Eye Contact ----------
  let friend = null, friendEye = null, friendShowUntil = 0, sheetEyes = [], lastSent = '', lastSentAt = 0;
  try { friend = JSON.parse(localStorage.getItem(FKEY)); } catch (e) {}
  function friendDNA() { return friend && HavenDNA.friendDNA(friend.profile); }
  function makeFriendEye() { const d = friendDNA(); friendEye = d ? new HavenEye(d, friendCv) : null; if (friendEye) friendEye.resize(); }
  function sendMine(force) {
    const s = EyesLink.state(); if (!s.paired || !HavenDNA.has()) return;
    const p = HavenDNA.profile(); if (!p) return;
    const json = JSON.stringify(p);
    if (!force && json === lastSent && Date.now() - lastSentAt < 6 * 3600000) return;
    if (EyesLink.sendProfile(json)) { lastSent = json; lastSentAt = Date.now(); }
    else setTimeout(() => sendMine(force), 31000);          // the relay limit: try again shortly
  }
  EyesLink.on('status', (s) => {
    const dot = $('linkDot'); dot.className = 'dot' + (s.paired ? ' paired' : s.linked ? ' waiting' : '');
    $('signals').hidden = !s.paired;
    if (!s.linked && friend) { friend = null; friendEye = null; localStorage.removeItem(FKEY); }
    if (!$('linkSheet').hidden) renderLink();
  });
  EyesLink.on('paired', () => { toast('Eye contact made'); sendMine(true); peekFriend(3.5); });
  EyesLink.on('profile', (p) => {
    const clean = HavenDNA.cleanProfile(p); if (!clean) return;
    const first = !friend;
    friend = { profile: clean, at: Date.now() }; localStorage.setItem(FKEY, JSON.stringify(friend));
    makeFriendEye();
    if (first) { sendMine(true); peekFriend(3.5); toast(`${clean.name} is looking back`); }
    if (!$('linkSheet').hidden) renderLink();
  });
  EyesLink.on('incoming', (k) => signal(k, true));
  EyesLink.on('outgoing', (k) => { if (k !== 'resonance') signal(k, false); });
  EyesLink.on('error', (m) => toast(m));
  EyesLink.on('missed', () => { if (!$('linkSheet').hidden) renderLink(); });

  $('linkBtn').onclick = () => { renderLink(); openSheet('linkSheet'); };
  document.querySelectorAll('#signals button').forEach((b) => {
    b.onclick = () => { unlockAudio(); if (EyesLink.send(b.dataset.sig)) { b.classList.add('sent'); setTimeout(() => b.classList.remove('sent'), 900); } };
  });
  const name = () => (friend ? friend.profile.name : 'their eye');
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
  function inviteText(code) { return `Eye contact? In EYES, open Eye Contact → I have an invite, and paste this:\n${code}`; }
  function renderLink() {
    const s = EyesLink.state(), body = $('linkBody'); body.textContent = ''; sheetEyes = [];
    const el = (tag, props = {}, kids = []) => { const n = document.createElement(tag); Object.assign(n, props); kids.forEach((k) => n.appendChild(k)); return n; };
    if (!s.linked) {
      body.appendChild(el('p', { className: 'sub', textContent: 'Two eyes that can feel each other from anywhere. No messages, no names, just signals: a pulse, a spark, calm.' }));
      const a = el('button', { className: 'opt', type: 'button' }, [el('b', { textContent: 'I have an invite' }), el('span', { textContent: 'Paste the code they sent you' })]);
      const b = el('button', { className: 'opt', type: 'button' }, [el('b', { textContent: 'Make an invite' }), el('span', { textContent: 'Get a code to send to them' })]);
      body.append(a, b);
      a.onclick = () => {
        body.textContent = '';
        const ta = el('textarea', { rows: 3, placeholder: 'Paste their HL1- code (or the whole message)', autocomplete: 'off', spellcheck: false });
        const paste = el('button', { type: 'button', className: 'ghost', textContent: 'Paste' }), go = el('button', { type: 'button', textContent: 'Connect' });
        const err = el('p', { className: 'err' });
        body.append(el('p', { className: 'sub', textContent: 'Paste the code from their EYES (on their phone: Eye Contact → make an invite).' }), ta, el('div', { className: 'row' }, [paste, go]), err);
        paste.onclick = async () => { try { ta.value = await navigator.clipboard.readText(); } catch (e) { ta.focus(); } };
        go.onclick = async () => { try { err.textContent = ''; await EyesLink.join(ta.value); renderLink(); } catch (e) { err.textContent = e.message || 'That code didn’t work'; } };
      };
      b.onclick = async () => { await EyesLink.create(); renderLink(); };
      return;
    }
    if (!s.paired) {
      body.appendChild(el('p', { className: 'sub', textContent: 'Send this invite to them. When their eye opens it, the two of you are linked.' }));
      body.appendChild(el('textarea', { className: 'code', rows: 2, readOnly: true, value: s.code }));
      const share = el('button', { type: 'button', textContent: 'Share invite…' }), copy = el('button', { type: 'button', className: 'ghost', textContent: 'Copy' });
      share.onclick = () => { if (navigator.share) navigator.share({ text: inviteText(s.code) }).catch(() => {}); else copy.onclick(); };
      copy.onclick = async () => { try { await navigator.clipboard.writeText(inviteText(s.code)); toast('Invite copied'); } catch (e) {} };
      body.append(el('div', { className: 'row' }, [share, copy]));
      body.appendChild(el('p', { className: 'status', textContent: s.connection === 'online' ? 'Waiting for their eye…' : 'Connecting…' }));
      const cancel = el('button', { type: 'button', className: 'link', textContent: 'Cancel this invite' });
      cancel.onclick = () => { EyesLink.unlink(); renderLink(); };
      body.appendChild(el('div', { className: 'row' }, [cancel]));
      return;
    }
    // paired
    const mine = el('canvas'), theirs = el('canvas'), d = HavenDNA.dna(), fd = friendDNA();
    body.appendChild(el('div', { className: 'pair' }, [
      el('figure', {}, [mine, el('figcaption', { innerHTML: '' }, [document.createTextNode(d.name), el('small', { textContent: 'you' })])]),
      el('div', { className: 'link-line' }),
      el('figure', {}, [theirs, el('figcaption', {}, [document.createTextNode(fd ? fd.name : '…'), el('small', { textContent: fd ? (friend.profile.stage >= 2 ? 'grown' : friend.profile.stage === 1 ? 'young' : 'hatchling') : 'introducing itself' })])])
    ]));
    const statusTxt = { online: 'Linked · awake', connecting: 'Linked · connecting…', offline: 'Linked · relay unreachable, retrying', sleeping: 'Linked' }[s.connection] || 'Linked';
    body.appendChild(el('p', { className: 'status', textContent: statusTxt }));
    requestAnimationFrame(() => {
      const e1 = new HavenEye(d, mine); e1.resize(); sheetEyes.push(e1);
      if (fd) { const e2 = new HavenEye(fd, theirs); e2.resize(); sheetEyes.push(e2); }
    });
    if (s.missed.length) {
      const box = el('div', { className: 'missed' }, [el('b', { textContent: 'While you were away' })]);
      s.missed.slice().reverse().forEach((m) => box.appendChild(el('div', { textContent: `${name()} sent a ${m.k} · ${ago(m.t)}` })));
      body.appendChild(box); EyesLink.clearMissed();
    }
    const un = el('button', { type: 'button', className: 'danger', textContent: 'Unlink' });
    un.onclick = () => {
      if (un.dataset.sure) { EyesLink.unlink(); friend = null; friendEye = null; localStorage.removeItem(FKEY); renderLink(); return; }
      un.dataset.sure = '1'; un.textContent = 'Tap again to unlink'; setTimeout(() => { un.dataset.sure = ''; un.textContent = 'Unlink'; }, 3000);
    };
    body.appendChild(el('div', { className: 'row' }, [un]));
  }

  // ---------- signals: what they look like ----------
  const COL = { pulse: [255, 143, 174], spark: [255, 210, 122], calm: [143, 216, 230], resonance: [255, 207, 122] };
  let fx = [];
  function friendPos() { const r = friendCv.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function peekFriend(sec) { if (!friendEye && friendDNA()) makeFriendEye(); friendShowUntil = Math.max(friendShowUntil, now() + sec); }
  function signal(k, incoming) {
    if (!homeEye || !COL[k]) return;
    const t = now(), me = { x: G.x, y: G.y }, rgb = COL[k];
    peekFriend(k === 'calm' ? 4.5 : 3.4);
    const fp = friendPos();
    fx.push({ kind: 'orb', k, rgb, t0: t + (incoming ? 0.45 : 0.1), from: incoming ? fp : me, to: incoming ? me : fp, dur: k === 'calm' ? 1.6 : 0.9 });
    const arrive = t + (incoming ? 0.45 : 0.1) + (k === 'calm' ? 1.6 : 0.9);
    const at = incoming ? me : fp;
    if (k === 'pulse') fx.push({ kind: 'ring', rgb, t0: arrive, at, life: 1.2, speed: 1 }, { kind: 'ring', rgb, t0: arrive + 0.28, at, life: 1.2, speed: 0.8 });
    else if (k === 'spark') fx.push({ kind: 'burst', rgb, t0: arrive, at, life: 1.3, n: 40, seed: Math.random() * 1000 });
    else if (k === 'calm') fx.push({ kind: 'ring', rgb, t0: arrive, at, life: 3, speed: 0.35, soft: true }, { kind: 'ring', rgb, t0: arrive + 0.9, at, life: 3, speed: 0.35, soft: true });
    else if (k === 'resonance') {
      [me, fp].forEach((p) => fx.push({ kind: 'ring', rgb, t0: arrive, at: p, life: 1.8, speed: 1.3 }, { kind: 'burst', rgb, t0: arrive, at: p, life: 1.8, n: 60, seed: Math.random() * 1000 }));
      fx.push({ kind: 'flash', rgb, t0: arrive, life: 0.8 });
    }
    // the eyes react
    const e = homeEye, T = HavenDNA.dna().T;
    if (incoming) {
      e.reactUntil = arrive + 1; const q = local(fp.x, fp.y); e.setTarget(q.x, q.y);
      setTimeout(() => { if (!homeEye) return;
        if (k === 'pulse') { e.pupilV += 3; e.pupilGoal = 1.2; setTimeout(() => { e.pupilV += 2.5; }, 280); }
        else if (k === 'spark') { e.moodGoal.wide = 0.6; e.pupilV -= 2; }
        else if (k === 'calm') { e.blinkT = now(); e.slowBlink = true; e.moodGoal.squint = 0.35; }
        else if (k === 'resonance') { e.moodGoal.wide = 0.7; e.pupilV += 4; e.pupilGoal = 1.35; }
        setTimeout(() => { e.moodGoal.wide = 0; e.moodGoal.squint = 0; e.pupilGoal = 1; }, 1800);
        if (SOUNDS[k]) SOUNDS[k]();
      }, (arrive - t) * 1000);
    } else {
      const q = local(fp.x, fp.y); e.reactUntil = t + 1.4; e.setTarget(q.x, q.y); e.pupilV += 1.5 + T.drama;
      if (SOUNDS[k]) SOUNDS[k]();
    }
    if (friendEye) { friendEye.reactUntil = arrive + 1.2; friendEye.setTarget(0.7, 0.75); if (!incoming) setTimeout(() => { if (friendEye) friendEye.pupilV += 3; }, (arrive - t) * 1000); }
  }
  function drawFx(t) {
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.clearRect(0, 0, G.w, G.h);
    if (!fx.length) return;
    fctx.globalCompositeOperation = 'lighter';
    fx = fx.filter((f) => {
      const u = (t - f.t0) / (f.dur || f.life);
      if (u < 0) return true; if (u > 1) return false;
      const c = (a) => `rgba(${f.rgb[0]},${f.rgb[1]},${f.rgb[2]},${clamp(a)})`;
      if (f.kind === 'orb') {
        const e = ease(u), mx = (f.from.x + f.to.x) / 2, my = Math.min(f.from.y, f.to.y) - 40;
        const x = (1 - e) * (1 - e) * f.from.x + 2 * (1 - e) * e * mx + e * e * f.to.x, y = (1 - e) * (1 - e) * f.from.y + 2 * (1 - e) * e * my + e * e * f.to.y;
        const R = f.k === 'calm' ? 26 : 16, g = fctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, c(0.95)); g.addColorStop(0.3, c(0.45)); g.addColorStop(1, c(0));
        fctx.fillStyle = g; fctx.beginPath(); fctx.arc(x, y, R, 0, TAU); fctx.fill();
        for (let i = 1; i <= 6; i++) { const e2 = ease(Math.max(0, u - i * 0.025)); const tx = (1 - e2) * (1 - e2) * f.from.x + 2 * (1 - e2) * e2 * mx + e2 * e2 * f.to.x, ty = (1 - e2) * (1 - e2) * f.from.y + 2 * (1 - e2) * e2 * my + e2 * e2 * f.to.y; fctx.fillStyle = c(0.25 * (1 - i / 7)); fctx.beginPath(); fctx.arc(tx, ty, R * 0.3 * (1 - i / 8), 0, TAU); fctx.fill(); }
      } else if (f.kind === 'ring') {
        const rad = G.r * (0.9 + u * 2.2 * f.speed), a = (1 - u) * (f.soft ? 0.35 : 0.6);
        fctx.strokeStyle = c(a); fctx.lineWidth = f.soft ? 10 * (1 - u) + 2 : 3; fctx.beginPath(); fctx.arc(f.at.x, f.at.y, rad, 0, TAU); fctx.stroke();
      } else if (f.kind === 'burst') {
        let s = f.seed; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
        for (let i = 0; i < f.n; i++) {
          const a = rnd() * TAU, v = (0.4 + rnd()) * G.r * 2.2, d = v * (1 - Math.pow(1 - u, 3));
          fctx.fillStyle = c((1 - u) * 0.9); fctx.beginPath(); fctx.arc(f.at.x + Math.cos(a) * (G.r * 0.8 + d), f.at.y + Math.sin(a) * (G.r * 0.8 + d), 1.2 + rnd() * 2.2 * (1 - u), 0, TAU); fctx.fill();
        }
      } else if (f.kind === 'flash') { fctx.fillStyle = c(0.25 * (1 - u)); fctx.fillRect(0, 0, G.w, G.h); }
      return true;
    });
    fctx.globalCompositeOperation = 'source-over';
  }

  // ---------- life ----------
  let last = now();
  function loop() {
    const t = now(), dt = Math.min(0.05, t - last); last = t;
    if (HavenDNA.has() && !homeEye) { makeHome(); route(); }
    const birthing = HavenAwakening.open;
    $('eyeName').style.opacity = birthing ? 0 : 1;
    if (homeEye) {
      if (!sleepy && t - lastTouch > 50 && !press && homeEye.auto) { sleepy = true; homeEye.moodGoal.squint = 0.25 + (1 - HavenDNA.dna().T.energy) * 0.3; }
      homeEye.step(t, dt); homeEye.draw(t);
    }
    const fShow = friendEye && t < friendShowUntil;
    friendCv.style.opacity = fShow ? 1 : 0;
    friendCv.style.transform = fShow ? 'translate(0,0)' : 'translate(-30%,-30%)';
    if (friendEye && (fShow || friendCv.style.opacity !== '0')) { if (!fShow) friendEye.setTarget(0.6, 0.7); friendEye.step(t, dt); friendEye.draw(t); }
    drawFx(t);
    for (const e of sheetEyes) { e.step(t, dt); e.draw(t); }
    requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (HavenDNA.has()) { HavenDNA.note('visit'); dispatchEvent(new Event('haven:greet')); }
      EyesLink.wake(); wake(); sendMine(false);
    } else EyesLink.sleep();
  });
  setInterval(() => { if (document.visibilityState === 'visible' && HavenDNA.has()) HavenDNA.note('minute'); }, 60000);

  // ---------- go ----------
  route(); layout();
  if (HavenDNA.has()) { makeHome(); HavenDNA.note('visit'); }
  if (friend) makeFriendEye();
  EyesLink.restore().then(() => {
    const s = EyesLink.state();
    if (s.paired) setTimeout(() => sendMine(false), 1500);
    setTimeout(() => {
      const m = EyesLink.state().missed;
      if (m.length) { const n = m.length; toast(`${name()} sent ${n === 1 ? 'a ' + m[0].k : n + ' signals'} while you were away`, 4200); peekFriend(3); }
    }, 2500);
  });
  requestAnimationFrame(loop);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
