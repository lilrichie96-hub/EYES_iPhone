/* EYES 4.3.0 — A Mind of Its Own.
   A tiny, local, optional memory of *patterns*, not a log of activity.
   There are no points, streaks, rewards, obligations, notifications or server calls.
   Memory changes gesture anticipation, greetings and the mix of existing idle poses.
   Owned by this Eye's DNA seed, included in encrypted Eye Passport automatically.
*/
(function (root) {
  'use strict';
  const KEY = 'eyes.mind.v1', ENABLED = 'eyes.mind.enabled.v1';
  const TYPES = ['pet', 'playLight', 'playStare', 'explore', 'wake'];
  const LIMIT = { pet: 2, playLight: 1, playStare: 1, explore: 2, wake: 1 };
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const blank = (seed) => ({
    v: 1, seed, day: -1,
    score: Object.fromEntries(TYPES.map((k) => [k, 0])),
    days: Object.fromEntries(TYPES.map((k) => [k, 0])),
    daily: Object.fromEntries(TYPES.map((k) => [k, 0])),
    slots: [0, 0, 0, 0], slotDays: [0, 0, 0, 0], slotToday: [0, 0, 0, 0],
    visitAt: 0, greetingAt: 0
  });
  function slot(hour) {
    const h = (Number(hour) + 24) % 24;
    return h >= 5 && h < 11 ? 0 : h >= 11 && h < 17 ? 1 : h >= 17 && h < 23 ? 2 : 3;
  }
  function createEyesMind({ read, save, clock = Date.now }) {
    const identity = () => {
      try { const dna = root.HavenDNA?.dna?.(); return dna && Number.isFinite(dna.seed) ? String(dna.seed) : null; }
      catch (e) { return null; }
    };
    let state = read(KEY, null), enabled = read(ENABLED, true) !== false;
    if (!state || state.v !== 1 || !state.score || !state.daily || !Array.isArray(state.slots)) state = blank(identity());
    const persist = () => save(KEY, state);
    function ensure() {
      const seed = identity();
      // A newly born Eye should never inherit the preceding Eye's habits.
      if (seed !== null && state.seed !== seed) { state = blank(seed); persist(); }
      const today = Math.floor(clock() / 86400000);
      if (!Number.isFinite(state.day) || state.day > today) { state.day = today; state.daily = blank(seed).daily; state.slotToday = [0, 0, 0, 0]; persist(); }
      if (state.day < today) {
        const elapsed = Math.min(365, today - state.day);
        // Gentle forgetting: weeks without a habit reduce its influence, never punish the Eye.
        const fading = Math.pow(0.985, elapsed);
        for (const k of TYPES) state.score[k] = clamp((Number(state.score[k]) || 0) * fading, 0, 24);
        for (let i = 0; i < 4; i++) state.slots[i] = clamp((Number(state.slots[i]) || 0) * fading, 0, 32);
        state.day = today; state.daily = blank(seed).daily; state.slotToday = [0, 0, 0, 0];
        persist();
      }
    }
    function observe(kind, hour) {
      if (!enabled) return false;
      ensure();
      const time = clock();
      if (kind === 'visit') {
        // Real return visits, not screen refreshes or opening The Optic.
        if (time - (state.visitAt || 0) < 20 * 60000) return false;
        state.visitAt = time;
        const i = slot(hour == null ? new Date(time).getHours() : hour);
        if (!state.slotToday[i]) {
          state.slotToday[i] = 1;
          state.slots[i] = clamp((state.slots[i] || 0) + 1, 0, 32);
          state.slotDays[i] = clamp((state.slotDays[i] || 0) + 1, 0, 32);
        }
        persist(); return true;
      }
      if (!Object.prototype.hasOwnProperty.call(LIMIT, kind)) return false;
      if ((state.daily[kind] || 0) >= LIMIT[kind]) return false;
      if (!(state.daily[kind] > 0)) state.days[kind] = clamp((state.days[kind] || 0) + 1, 0, 32);
      state.daily[kind] = (state.daily[kind] || 0) + 1;
      state.score[kind] = clamp((state.score[kind] || 0) + 1, 0, 24);
      persist(); return true;
    }
    function familiarity(kind) {
      if (!enabled) return 0;
      ensure();
      if (!TYPES.includes(kind)) return 0;
      const days = Number(state.days[kind]) || 0;
      const score = Number(state.score[kind]) || 0;
      // Requires multiple real days; a hundred taps tonight cannot train a new quirk.
      return days < 3 || score < 3 ? 0 : clamp((days - 2) / 8 + (score - 2) / 24);
    }
    function expects(hour) {
      if (!enabled) return false;
      ensure();
      const i = slot(hour);
      return (state.slotDays[i] || 0) >= 3 && (state.slots[i] || 0) >= 3.2;
    }
    function greeting(hour, awayMs) {
      if (!enabled || awayMs < 20 * 60000 || !expects(hour)) return false;
      if (clock() - (state.greetingAt || 0) < 4 * 3600000) return false;
      state.greetingAt = clock(); persist(); return true;
    }
    function preference() {
      if (!enabled) return null;
      const order = ['pet', 'playLight', 'playStare', 'explore'];
      const ranked = order.map((kind) => [kind, familiarity(kind)]).sort((a, b) => b[1] - a[1]);
      return ranked[0][1] >= 0.35 && ranked[0][1] > ranked[1][1] + 0.12 ? ranked[0][0] : null;
    }
    function weights() {
      return {
        'firefly': 1 + 1.4 * familiarity('playLight'),
        'look-around': 1 + 1.0 * familiarity('explore') + 0.35 * familiarity('playStare'),
        'sigh': 1 + 1.1 * familiarity('pet'),
        'stretch': 1 + 0.3 * familiarity('pet')
      };
    }
    function setEnabled(value) {
      enabled = Boolean(value);
      save(ENABLED, enabled);
      return enabled;
    }
    function forget() {
      state = blank(identity()); persist();
    }
    function snapshot() {
      ensure();
      return { enabled, preference: preference(), familiar: Object.fromEntries(TYPES.map((k) => [k, familiarity(k)])),
        learnedDays: Object.fromEntries(TYPES.map((k) => [k, state.days[k] || 0])) };
    }
    ensure();
    return { observe, familiarity, expects, greeting, preference, weights, setEnabled, enabled: () => enabled, forget, snapshot };
  }
  root.createEyesMind = createEyesMind;
  if (typeof module !== 'undefined') module.exports = { createEyesMind };
})(typeof window === 'undefined' ? globalThis : window);
