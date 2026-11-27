/* text pages: apply config.js (feature flags, support address). No storage, no tracking. */
(() => {
  'use strict';
  const cfg = window.EYES_SITE || {}, doc = document.documentElement;
  const ex = (cfg.features && cfg.features.exchange) || 'show';
  doc.dataset.exchange = ['show', 'testing', 'hide'].includes(ex) ? ex : 'show';
  if (doc.dataset.exchange === 'hide') document.querySelectorAll('[data-feature="exchange"]').forEach((el) => el.remove());
  const link = document.querySelector('[data-support-link]'), line = document.querySelector('[data-support-line]');
  if (link && cfg.supportEmail) link.href = 'mailto:' + cfg.supportEmail;
  else if (line) line.remove();
})();
