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
    $('welcome').hidden = has || (isIOS && !standalone && !sessionStorage.getItem('eyes.anyway'));
    $('install').hidden = has || !$('welcome').hidden;
    document.documentElement.classList.toggle('eyes-pre', !has);
  }
  $('installAnyway').onclick = () => { sessionStorage.setItem('eyes.anyway', '1'); route(); };
  $('wakeBtn').onclick = () => {
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
    $('welcome').hidden = true; document.documentElement.classList.remove('eyes-pre');
    HavenAwakening.start();
  };
  $('restoreOpen').onclick = () => { $('restoreBox').hidden = false; $('restoreTxt').focus(); };
  $('restoreGo').onclick = () => {
    try { restore($('restoreTxt').value); location.reload(); }
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
    const m = String(text || '').match(/EYES1\.[A-Za-z0-9_-]+/); if (!m) throw new Error('bad');
    const o = JSON.parse(unb64u(m[0].slice(6)));
    if (!o || !o.d || typeof o.d.seed !== 'number') throw new Error('bad');
    localStorage.setItem('haven.dna.v1', JSON.stringify(o.d));
    if (o.g) localStorage.setItem('haven.growth.v1', JSON.stringify(o.g));
    if (o.x) for (const k in o.x) if (keep(k) && typeof o.x[k] === 'string') localStorage.setItem(k, o.x[k]);
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
    if (tips && !$('keepRow')) {
      const row = document.createElement('div'); row.className = 'setting backup-setting'; row.id = 'keepRow'; row.style.display = '';
      row.innerHTML = '<span>Keepsake code<small id="keepStatus">Brings your Eye back exactly as it is, if EYES is ever removed. Keep it in Notes.</small></span><span class="backup-actions"><button id="keepCopy" type="button">Copy</button><button id="keepShare" type="button">Share</button></span>';
      tips.insertAdjacentElement('afterend', row);
      $('keepCopy').onclick = async () => { try { await navigator.clipboard.writeText(keepsake()); $('keepStatus').textContent = 'Copied. Paste it somewhere safe.'; } catch (e) { $('keepStatus').textContent = keepsake(); } };
      $('keepShare').onclick = () => { const k = keepsake(); if (navigator.share) navigator.share({ text: k }).catch(() => {}); else $('keepCopy').onclick(); };
      if (!navigator.share) $('keepShare').style.display = 'none';
    }
  }
  // 1.0 kept their Eye's card under its own key: hand it to the real friend system once
  try {
    const old = JSON.parse(localStorage.getItem('eyes.friend.v1'));
    if (old && old.profile && window.HavenFriend && !HavenFriend.has()) HavenFriend.receive(old.profile);
    localStorage.removeItem('eyes.friend.v1');
  } catch (e) {}
  route(); trimOptic();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
