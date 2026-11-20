/* HAVEN tips — teach each hidden gesture once, at the moment it becomes useful.
   A tip is a small bubble beside the thing it explains, while the eye glances at it.
   Each tip shows at most once (or never, if you already found the gesture yourself),
   tips never stack, and "Show tips again" in Settings brings them back. */
(function (root) {
  'use strict';
  const KEY = 'haven.tips.v1',
    SHOW_MS = 5200,
    QUIET_AFTER_BOOT = 3500,
    GAP_BETWEEN = 45000;
  function createHavenTips({ read, save, now, look }) {
    let state = read(KEY, null);
    if (!state || typeof state !== 'object') state = { seen: {}, counts: {} };
    state.seen = state.seen || {};
    state.counts = state.counts || {};
    const bootAt = now();
    let lastShown = -Infinity,
      bubble = null,
      hideTimer = 0,
      current = null;
    const persist = () => save(KEY, state);
    function seen(id) {
      return Boolean(state.seen[id]);
    }
    // The gesture was used without help: never explain it.
    function used(id) {
      if (current === id) hide();
      if (!state.seen[id]) {
        state.seen[id] = 'used';
        persist();
      }
    }
    function count(name) {
      state.counts[name] = (state.counts[name] || 0) + 1;
      persist();
      return state.counts[name];
    }
    function hide() {
      clearTimeout(hideTimer);
      current = null;
      if (bubble) bubble.classList.remove('shown');
    }
    function ensureBubble() {
      if (bubble || typeof document === 'undefined') return bubble;
      bubble = document.createElement('div');
      bubble.className = 'tip-bubble';
      bubble.setAttribute('role', 'status');
      bubble.setAttribute('aria-live', 'polite');
      document.body.append(bubble);
      // Any touch dismisses the tip, and the touch still does what it was going to do.
      addEventListener('pointerdown', () => current && hide(), true);
      return bubble;
    }
    // anchor: {x, y} in screen pixels. place: 'above' or 'below' the anchor.
    function offer(id, text, anchor, place = 'below', { force = false } = {}) {
      const t = now();
      if (seen(id) || current) return false;
      if (!force && (t - bootAt < QUIET_AFTER_BOOT || t - lastShown < GAP_BETWEEN)) return false;
      if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return false;
      const el = ensureBubble();
      if (!el) return false;
      state.seen[id] = 'shown';
      persist();
      lastShown = t;
      current = id;
      el.textContent = text;
      el.dataset.place = place;
      el.classList.remove('shown');
      // Measure, then keep it on screen with a little margin.
      el.style.left = '0px';
      el.style.top = '0px';
      const box = el.getBoundingClientRect(),
        margin = 16,
        x = Math.min(innerWidth - margin - box.width, Math.max(margin, anchor.x - box.width / 2)),
        y = place === 'above' ? anchor.y - box.height - 12 : anchor.y + 12;
      el.style.left = Math.round(x) + 'px';
      el.style.top =
        Math.round(Math.max(margin, Math.min(innerHeight - box.height - margin, y))) + 'px';
      el.style.setProperty('--arrow-x', Math.round(anchor.x - x) + 'px');
      requestAnimationFrame(() => el.classList.add('shown'));
      look?.(anchor);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, SHOW_MS);
      return true;
    }
    function reset() {
      state = { seen: {}, counts: state.counts || {} };
      persist();
      hide();
    }
    return {
      offer,
      used,
      seen,
      count,
      hide,
      reset,
      get current() {
        return current;
      },
      diagnostics: () => ({ seen: { ...state.seen }, counts: { ...state.counts }, current })
    };
  }
  root.createHavenTips = createHavenTips;
  if (typeof module !== 'undefined') module.exports = { createHavenTips };
})(typeof window === 'undefined' ? globalThis : window);
