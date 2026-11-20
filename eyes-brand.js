/* EYES brand layer (3.0.0).
   - Keeps the interface accent in step with the Eye: its own DNA colour, or the chosen material's.
     Set once per change as a CSS variable (--eye-rgb); nothing runs per frame.
   - Shows EYES names for messages that still arrive from the native side with the old wording
     (toasts and Eye Contact feedback). Display text only: no identifiers, keys or protocol values change.
   - Gives The Optic's Folders row its action (the same organizer as Dock and Iris shortcuts). */
(function (root) {
  'use strict';
  const MATERIAL_RGB = {
    ember: [223, 172, 133],
    frost: [182, 203, 216],
    nebula: [171, 141, 223]
  };
  const DEFAULT_RGB = [111, 193, 202];

  // Interface-safe version of a colour: never too dark or too loud to read on near-black.
  function forUI(rgb) {
    let [r, g, b] = rgb.map((x) => Math.max(0, Math.min(255, Number(x) || 0)));
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum < 0.42) {
      const k = (0.42 - lum) / (1 - lum);
      r += (231 - r) * k; g += (226 - g) * k; b += (217 - b) * k;
    }
    // Calm the saturation a little; the Eye is the bright thing on screen, not the buttons.
    const avg = (r + g + b) / 3;
    return [r, g, b].map((x) => Math.round(avg + (x - avg) * 0.82));
  }

  function eyeRGB() {
    const skin = document.documentElement.dataset.skin || 'original';
    if (MATERIAL_RGB[skin]) return MATERIAL_RGB[skin];
    try {
      const d = root.HavenDNA && root.HavenDNA.active() && root.HavenDNA.dna();
      if (d && Array.isArray(d.accent)) return d.accent;
    } catch (e) {}
    return DEFAULT_RGB;
  }

  let applied = '';
  function sync() {
    const v = forUI(eyeRGB()).join(',');
    if (v === applied) return;
    applied = v;
    document.documentElement.style.setProperty('--eye-rgb', v);
  }

  // Old native wording → EYES names. Longest phrases first.
  const WORDS = [
    [/HAVEN LINK code/g, "Eye Contact invite"],
    [/HAVEN LINK/g, "Eye Contact"],
    [/HAVEN's eye/g, 'The Eye'],
    [/Pair HAVEN with your friend first/g, 'Make Eye Contact with your friend first'],
    [/Create a link first\.?/g, 'Make Eye Contact first.'],
    [/Create a private link first\.?/g, 'Make Eye Contact first.'],
    [/Could not create a private link/g, 'Could not make an invite'],
    [/That is your current link/g, 'That is your own invite'],
    [/Invalid pairing code/g, 'That invite code is not valid'],
    [/\bin Settings\b/g, 'in The Optic'],
    [/\bHAVEN\b/g, 'EYES']
  ];
  function text(s) {
    let out = String(s == null ? '' : s);
    for (const [re, to] of WORDS) out = out.replace(re, to);
    return out;
  }

  function wire() {
    sync();
    addEventListener('haven:dna', sync);
    try {
      new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });
    } catch (e) {}
    const folders = document.getElementById('folderManage');
    const dock = document.getElementById('dockManage');
    if (folders && dock) folders.addEventListener('click', () => dock.click());
  }

  root.EyesBrand = { text, sync, forUI };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})(window);
