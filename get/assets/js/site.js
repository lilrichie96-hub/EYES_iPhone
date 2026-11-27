/* EYES website behaviour. No tracking, no cookies, no storage, no service worker. */
(() => {
  'use strict';
  const cfg = Object.assign({ apkUrl: '', iphoneUrl: 'https://lilrichie96-hub.github.io/EYES_iPhone/', features: {} }, window.EYES_SITE || {});
  const doc = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  doc.classList.add('js');

  // ---- feature flags (Eye Exchange can be marked testing or hidden from config.js)
  const ex = (cfg.features && cfg.features.exchange) || 'show';
  doc.dataset.exchange = ['show', 'testing', 'hide'].includes(ex) ? ex : 'show';
  if (doc.dataset.exchange === 'hide') document.querySelectorAll('[data-feature="exchange"]').forEach((el) => el.remove());

  // ---- download links
  const apk = String(cfg.apkUrl || '').trim();
  document.querySelectorAll('[data-apk]').forEach((a) => {
    if (apk) { a.href = apk; a.setAttribute('download', ''); a.removeAttribute('aria-disabled'); }
    else { a.href = '#install-android'; a.setAttribute('aria-disabled', 'true'); a.title = 'The Android download is being prepared'; }
  });
  const meta = document.querySelector('[data-apk-meta]');
  if (meta) {
    meta.textContent = apk
      ? `EYES ${cfg.apkVersion || ''} for Android 8 or newer${cfg.apkSha256 ? ' · SHA-256 ' + cfg.apkSha256 : ''}`
      : 'The Android download is being prepared. Check back soon.';
  }
  document.querySelectorAll('[data-iphone]').forEach((a) => { if (cfg.iphoneUrl) { a.href = cfg.iphoneUrl; a.rel = 'noopener'; } });
  const support = document.querySelector('[data-support]');
  if (support && cfg.supportEmail) { support.href = 'mailto:' + cfg.supportEmail + '?subject=' + encodeURIComponent('EYES problem report'); support.hidden = false; }

  // ---- mobile nav
  const nav = document.querySelector('.nav'), toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => { const open = !nav.classList.contains('open'); nav.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); });
    nav.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); } });
  }

  // ---- silent preview videos: load and play only while visible, never with reduced motion or Save-Data
  const saveData = navigator.connection && navigator.connection.saveData;
  const vids = [...document.querySelectorAll('video[data-autoplay]')];
  const playable = () => !reduced.matches && !saveData;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting && playable()) {
        if (v.preload === 'none') v.preload = 'auto';
        v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {});
      } else if (!v.paused) v.pause();
    }
  }, { rootMargin: '200px 0px', threshold: 0.15 }) : null;
  vids.forEach((v) => { v.muted = true; if (io) io.observe(v); });
  reduced.addEventListener && reduced.addEventListener('change', () => { if (reduced.matches) vids.forEach((v) => v.pause()); });

  // ---- reveal on scroll (purely decorative; skipped with reduced motion)
  if (!reduced.matches && 'IntersectionObserver' in window) {
    const targets = document.querySelectorAll('section .wrap > h2, .section-lede, .ability, .cart, .meet-grid article, .contact-points article, .install-card, .eye-gallery li, .promise');
    const ro = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } }), { threshold: 0.12 });
    targets.forEach((el) => { el.classList.add('reveal'); ro.observe(el); });
  }

  // ---- trailer: loads only when asked, plays WITH sound because the visitor asked for it
  const dlg = document.getElementById('trailer'), tv = document.getElementById('trailerVideo');
  const SOURCES = [['media/trailer/eyes-trailer-web.mp4', 'video/mp4']];
  let opener = null;
  function openTrailer(e) {
    opener = e && e.currentTarget;
    if (!tv.querySelector('source')) { for (const [src, type] of SOURCES) { const s = document.createElement('source'); s.src = src; s.type = type; tv.prepend(s); } tv.load(); }
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    tv.muted = false; tv.volume = 1;
    const p = tv.play(); if (p && p.catch) p.catch(() => {});
    tv.focus();
  }
  function closeTrailer() { tv.pause(); if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); if (opener) opener.focus(); }
  document.querySelectorAll('[data-trailer]').forEach((b) => b.addEventListener('click', openTrailer));
  dlg.querySelector('[data-close]').addEventListener('click', closeTrailer);
  dlg.addEventListener('close', () => tv.pause());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeTrailer(); });
})();
