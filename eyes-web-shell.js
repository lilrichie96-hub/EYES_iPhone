/* EYES for iPhone: before there's an eye (install / welcome / keepsake restore), and trimming The Optic
   down to what an iPhone can do. Runs after launcher.js. */
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

  // ---------- before the eye ----------
  function route() {
    const has = HavenDNA.has();
    // The install guide stays available in Safari even if an Eye was born there.
    // Installing EYES must never silently discard or overwrite that Eye.
    const showInstall = isIOS && !standalone && !sessionStorage.getItem('eyes.anyway');
    $('install').hidden = !showInstall;
    $('welcome').hidden = has || showInstall;
    $('installExistingEye').hidden = !has;
    document.documentElement.classList.toggle('eyes-pre', !has);
  }
  $('installAnyway').onclick = () => { sessionStorage.setItem('eyes.anyway', '1'); route(); };
  $('installCopyLink').onclick = async () => {
    const url = location.origin + location.pathname;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);
      $('installCopyStatus').textContent = 'Copied. Open Safari and paste the link there.';
    } catch (e) {
      $('installCopyStatus').textContent = 'Copy this address into Safari: ' + url;
    }
  };
  $('wakeBtn').onclick = () => {
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
    $('welcome').hidden = true; document.documentElement.classList.remove('eyes-pre');
    HavenAwakening.start();
  };
  $('restoreOpen').onclick = () => { $('restoreBox').hidden = false; $('restoreTxt').focus(); };
  // 2.2.2: the welcome screen also takes an Eye Passport (asks for its passphrase), checked in full first
  const passIn = document.createElement('input');
  passIn.type = 'password'; passIn.id = 'restorePass'; passIn.placeholder = 'Passport passphrase'; passIn.autocomplete = 'current-password'; passIn.hidden = true;
  $('restoreTxt').insertAdjacentElement('afterend', passIn);
  $('restoreTxt').addEventListener('input', () => { passIn.hidden = !(window.EyesPassport && EyesPassport.detect($('restoreTxt').value) === 'passport'); });
  $('restoreGo').onclick = async () => {
    const text = $('restoreTxt').value, P = window.EyesPassport;
    if (P && P.detect(text) === 'passport') {
      $('restoreErr').textContent = 'Opening your passport…';
      const r = await P.open(text, passIn.value);
      if (!r.ok) { $('restoreErr').textContent = r.reason; return; }
      const done = P.apply(r);
      if (!done.ok) { $('restoreErr').textContent = done.reason; return; }
      location.reload(); return;
    }
    try { restore(text); location.reload(); }
    catch (e) { $('restoreErr').textContent = "That code doesn't look right. Check you copied all of it."; }
  };
  addEventListener('haven:dna', route);

  // ---------- keepsake: the eye, its growth and its settings as one code ----------
  const keep = (k) => /^haven\./.test(k) || k === 'eyes.senses.v1';
  const b64u = (str) => { const b = new TextEncoder().encode(str); let s = ''; b.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (str) => { let s = str.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); };
  function keepsake() {
    const d = localStorage.getItem('haven.dna.v1'); if (!d) return '';
    const o = { d: JSON.parse(d), x: {} };
    const g = localStorage.getItem('haven.growth.v1'); if (g) o.g = JSON.parse(g);
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (keep(k) && k !== 'haven.dna.v1' && k !== 'haven.growth.v1') o.x[k] = localStorage.getItem(k); }
    return 'EYES1.' + b64u(JSON.stringify(o));
  }
  function restore(text) {
    // 2.2.2: checked in full first, then written all at once (EyesPassport rolls back if a write fails)
    const m = String(text || '').match(/EYES1\.[A-Za-z0-9_-]+/); if (!m) throw new Error('bad');
    const o = JSON.parse(unb64u(m[0].slice(6)));
    if (!o || !o.d || typeof o.d.seed !== 'number') throw new Error('bad');
    const data = { 'haven.dna.v1': JSON.stringify(o.d) };
    if (o.g) data['haven.growth.v1'] = JSON.stringify(o.g);
    if (o.x) for (const k in o.x) if (keep(k) && typeof o.x[k] === 'string') data[k] = o.x[k];
    if (window.EyesPassport) {
      const done = EyesPassport.apply({ ok: true, kind: 'keepsake', data, merge: true, sum: {} });
      if (!done.ok) throw new Error('bad');
      return;
    }
    for (const k in data) localStorage.setItem(k, data[k]);
  }

  // ---------- The Optic, for an iPhone ----------
  function trimOptic() {
    const st = $('settings'); if (!st) return;
    // whole groups that only make sense for a launcher
    const drop = ['Home, dock', 'Notifications', 'Music'];
    [...st.querySelectorAll('h2.optic-group')].forEach((h) => {
      if (!drop.some((d) => h.textContent.trim().startsWith(d))) return;
      let n = h; const kill = [h];
      while ((n = n.nextElementSibling) && !(n.tagName === 'H2')) kill.push(n);
      kill.forEach((el) => { el.hidden = true; el.style.display = 'none'; });
    });
    ['musicTint', 'fullscreenRow'].forEach((id) => { const el = $(id); const row = el && (el.closest('.setting') || el); if (row) row.style.display = 'none'; });
    const bk = st.querySelector('.backup-setting'); if (bk) bk.style.display = 'none';
    st.querySelectorAll('p.detail').forEach((p) => { if (/drag|notification|battery saver|leave home/i.test(p.textContent)) p.style.display = 'none'; });
    const intro = st.querySelector('.intro'); if (intro) intro.textContent = 'Adjustments for you, and for the thing on your iPhone.';
    // keepsake, in Help & backup
    const tips = st.querySelector('.tips-setting');
    // Browser-only way back to the install instructions after someone chooses
    // to wake an Eye in Safari. Never shown in the installed Home Screen app.
    if (isIOS && !standalone && !$('installGuideRow')) {
      const helpHeading = [...st.querySelectorAll('h2.optic-group')].find((h) => h.textContent.includes('Help & backup'));
      if (helpHeading) {
        const row = document.createElement('div');
        row.id = 'installGuideRow';
        row.className = 'setting';
        row.innerHTML = '<span>Put EYES on your Home Screen<small>A quick step-by-step guide for Safari</small></span><button type="button" id="installGuideOpen" class="manage-shortcuts">Show guide</button>';
        helpHeading.insertAdjacentElement('afterend', row);
        $('installGuideOpen').onclick = () => {
          const close = st.querySelector('button.close');
          if (close) close.click();
          $('install').hidden = false;
        };
      }
    }
    if (tips && !$('keepRow')) {
      const row = document.createElement('div'); row.className = 'setting backup-setting'; row.id = 'keepRow'; row.style.display = '';
      row.innerHTML = '<span>Keepsake code<small id="keepStatus">Brings back your Eye, its growth and settings, if EYES is ever removed. For friends, Eye Dex and Play too, use Eye Passport below.</small></span><span class="backup-actions"><button id="keepCopy" type="button">Copy</button><button id="keepShare" type="button">Share</button></span>';
      tips.insertAdjacentElement('afterend', row);
      $('keepCopy').onclick = async () => { try { await navigator.clipboard.writeText(keepsake()); $('keepStatus').textContent = 'Copied. Paste it somewhere safe.'; } catch (e) { $('keepStatus').textContent = keepsake(); } };
      $('keepShare').onclick = () => { const k = keepsake(); if (navigator.share) navigator.share({ text: k }).catch(() => {}); else $('keepCopy').onclick(); };
      if (!navigator.share) $('keepShare').style.display = 'none';
    }
  }
  // ---------- iPhone dock: Eye Dex only (the launcher's app dock is hidden here) ----------
  function dock() {
    if ($('eyesDock') || !window.EyesSocial) return;
    const d = document.createElement('nav'); d.id = 'eyesDock';
    d.innerHTML = '<button type="button" data-v="dex"><i class="dk-dex"></i>Eye Dex</button>';
    d.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) EyesSocial[b.dataset.v](); });
    document.body.appendChild(d);
  }
  // ---------- card links: <site>#card=EYE1.… ----------
  function cardFromHash() {
    const m = location.hash.match(/card=(EYE1\.[A-Za-z0-9_-]+)/); if (!m) return;
    const card = m[1];
    history.replaceState(null, '', location.pathname);
    if (HavenDNA.has() && window.EyesSocial) { setTimeout(() => EyesSocial.addCard(card), 800); return; }
    // no Eye here (Safari, or someone without EYES yet): show whose Eye it is, and how to keep it
    const p = window.EyesDex && EyesDex.readCard(card), d = p && HavenDNA.friendDNA(p); if (!d) return;
    const el = document.createElement('section'); el.className = 'eyes-screen'; el.id = 'cardPage';
    el.innerHTML = `<div class="inner"><canvas id="cardEye" class="card-eye"></canvas><h1 class="card-name">${d.name.replace(/[<>&]/g, '')}</h1>
      <p class="tag">${d.tier} · ${d.words.join(' · ')}</p>
      <p class="lead">Someone shared their Eye with you.</p>
      <p class="fine card-fine">${isIOS && !standalone ? 'Copy the card, open <b>EYES</b> from your Home Screen, and paste it under <b>Eye Dex → My card → Add someone\'s card</b>.' : 'Copy the card and paste it in EYES under <b>Eye Dex → My card</b>.'} No EYES yet? Wake your own first.</p>
      <button type="button" class="primary" id="cardCopy">Copy card</button><button type="button" class="link" id="cardClose">Continue</button></div>`;
    document.body.appendChild(el);
    const e = new HavenEye(d, $('cardEye')); e.resize();
    (function loop() { if (!document.body.contains(el)) return; const t = performance.now() / 1000; e.step(t, 1 / 60); e.draw(t); requestAnimationFrame(loop); })();
    $('cardCopy').onclick = async () => { try { await navigator.clipboard.writeText(card); $('cardCopy').textContent = 'Copied'; } catch (er) {} };
    $('cardClose').onclick = () => el.remove();
  }
  // ---------- invite links: <site>#join=HL1-… (4.1) ----------
  // The fragment never leaves the phone (it isn't sent to GitHub). It is removed from the address bar at once.
  // Joining only happens where the Eye lives: the Home Screen app on iPhone, the EYES app on Android.
  function joinFromHash() {
    const m = location.hash.match(/join=(HL1-[A-Za-z0-9_-]{43})/); if (!m) return;
    const code = m[1];
    history.replaceState(null, '', location.pathname);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const here = isIOS ? standalone || !!sessionStorage.getItem('eyes.anyway') : !isAndroid;
    if (here && HavenDNA.has() && window.EyesContact) { setTimeout(() => EyesContact.join(code), 700); return; }
    const el = document.createElement('section'); el.className = 'eyes-screen'; el.id = 'joinPage';
    const how = isIOS
      ? `<ol class="join-steps"><li>Copy the invite.</li><li>Open <b>EYES</b> from your Home Screen.</li><li>Tap <b>Eye Contact</b>, then <b>I have an invite</b>, then <b>Paste</b>, then <b>Join</b>.</li></ol><p class="fine">No EYES yet? Add it to your Home Screen and wake your Eye first. The invite keeps.</p>`
      : isAndroid
        ? `<p class="fine card-fine">Open it in the EYES app. Or copy the invite and paste it under <b>Eye Contact → I have an invite → Paste → Join</b>.</p>`
        : `<p class="fine card-fine">Copy the invite and paste it in EYES under <b>Eye Contact → I have an invite → Paste → Join</b>.</p>`;
    el.innerHTML = `<div class="inner"><svg class="eyemark" viewBox="0 0 120 70" aria-hidden="true"><path d="M4 35C24 6 96 6 116 35C96 64 24 64 4 35Z"/><circle cx="60" cy="35" r="16"/><circle class="p" cx="60" cy="35" r="5"/></svg>
      <h1 class="card-name">Let our Eyes meet</h1><p class="lead">Someone you know invited your Eye to make Eye Contact.</p>${how}
      ${isAndroid ? '<a class="primary join-open" id="joinOpenApp">Open in EYES</a>' : ''}
      <button type="button" class="${isAndroid ? '' : 'primary'}" id="joinCopy">Copy invite</button><p class="fine" id="joinStatus" aria-live="polite"></p>
      <button type="button" class="link" id="joinClose">Continue</button></div>`;
    document.body.appendChild(el);
    const open = $('joinOpenApp'); if (open) open.href = 'haven://link?code=' + code;
    $('joinCopy').onclick = async () => {
      const text = 'Let our Eyes meet. Eye Contact invite:\n' + code;
      try { await navigator.clipboard.writeText(text); $('joinStatus').textContent = isIOS ? 'Copied. Now open EYES from your Home Screen.' : 'Copied.'; }
      catch (er) { $('joinStatus').textContent = code; }
    };
    $('joinClose').onclick = () => el.remove();
  }
  addEventListener('hashchange', () => { cardFromHash(); joinFromHash(); });
  route(); trimOptic(); dock(); cardFromHash(); joinFromHash();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
