/* HAVEN DNA: every HAVEN is born from one random seed.
   The seed decides its colour, iris pattern, pupil, rare traits, how it moves and its temperament.
   This file feeds those genes into the existing renderer (launcher.js, skin-system.js, presence.js,
   personality.js) without replacing any of it. Saved as haven.dna.v1, so Back up / Restore carries it.
   Nothing here touches the home screen layout, apps, dock, folders or settings. */
(function (root) {
'use strict';
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

// ---------- seeded randomness ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => {
  const total = list.reduce((s, x) => s + x.w, 0);
  let v = r() * total;
  for (const x of list) { if ((v -= x.w) <= 0) return x; }
  return list[list.length - 1];
};
const newSeed = () => (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;

// ---------- colour ----------
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}
const col = (rgb, k, a) => `rgba(${Math.round(clamp(rgb[0] * k, 0, 255))},${Math.round(clamp(rgb[1] * k, 0, 255))},${Math.round(clamp(rgb[2] * k, 0, 255))},${clamp(a)})`;
const lift = (rgb, t) => rgb.map((c) => Math.round(mix(c, 255, t)));

// ---------- the gene pool ----------
const PALETTES = [
  { id: 'Tide', rgb: [111, 193, 202], w: 18, fam: 'cool' },
  { id: 'Ocean', rgb: [96, 158, 240], w: 13, fam: 'cool' },
  { id: 'Jade', rgb: [104, 214, 160], w: 12, fam: 'strange' },
  { id: 'Violet', rgb: [170, 140, 250], w: 11, fam: 'strange' },
  { id: 'Ember', rgb: [236, 150, 82], w: 10, fam: 'warm' },
  { id: 'Frost', rgb: [196, 232, 250], w: 8, fam: 'cool' },
  { id: 'Rose', rgb: [240, 132, 172], w: 8, fam: 'warm' },
  { id: 'Moss', rgb: [180, 222, 112], w: 6, fam: 'strange' },
  { id: 'Gold', rgb: [248, 204, 108], w: 4, rarity: 1, fam: 'warm' },
  { id: 'Crimson', rgb: [255, 96, 102], w: 3, rarity: 1, fam: 'warm' }
];
const PATTERNS = [
  { id: 'rays', name: 'Fibers', w: 30 },
  { id: 'rings', name: 'Rings', w: 18 },
  { id: 'speckle', name: 'Speckles', w: 18 },
  { id: 'swirl', name: 'Swirl', w: 18 },
  { id: 'petal', name: 'Petals', w: 12 },
  { id: 'cells', name: 'Honeycomb', w: 4, rarity: 1 }
];
const PUPILS = [
  { id: 'round', name: 'Round', w: 52 },
  { id: 'tall', name: 'Tall oval', w: 16 },
  { id: 'wide', name: 'Wide oval', w: 14 },
  { id: 'ring', name: 'Hollow ring', w: 6, rarity: 1 },
  { id: 'crescent', name: 'Crescent', w: 6, rarity: 1 },
  { id: 'star', name: 'Star', w: 4, rarity: 2 },
  { id: 'heart', name: 'Heart', w: 2, rarity: 3 }
];
const SHINES = [
  { id: 'oval', name: 'Soft oval', w: 50 },
  { id: 'window', name: 'Window', w: 22 },
  { id: 'twin', name: 'Twin glints', w: 18 },
  { id: 'crescent', name: 'Crescent glare', w: 10 }
];
const RARE_TRAITS = [
  { id: 'twoTone', name: 'Two-tone iris', p: 0.05, rarity: 2 },
  { id: 'galaxy', name: 'Galaxy shimmer', p: 0.045, rarity: 2 },
  { id: 'aurora', name: 'Aurora rim', p: 0.03, rarity: 2 },
  { id: 'fleck', name: 'Golden fleck', p: 0.07, rarity: 1 },
  { id: 'halo', name: 'Double halo', p: 0.05, rarity: 1 }
];
const SYL_A = ['Vel', 'Mir', 'Os', 'Ka', 'Lun', 'Pip', 'Rho', 'Tam', 'Ny', 'Bex', 'Ori', 'Zu', 'Fen', 'Ash', 'Iko', 'Sol', 'Wren', 'Juno', 'Dax', 'Ely'];
const SYL_B = ['', '', 'o', 'a', 'i', 'el', 'ra', 'ix', 'en', 'y', 'ko', 'mi', 'ro', 'is', 'ette', 'u'];

const TEMPER_WORDS = {
  curious: ['curious', 'nosy', 'inquisitive'],
  shy: ['shy', 'timid', 'bashful'],
  hyper: ['hyper', 'restless', 'zippy'],
  sleepy: ['sleepy', 'dozy', 'mellow'],
  grumpy: ['grumpy', 'judgy', 'unimpressed'],
  dramatic: ['dramatic', 'theatrical', 'extra'],
  calm: ['calm', 'steady', 'serene'],
  smug: ['smug', 'cocky', 'proud']
};

// ---------- the nudge: how you woke it leans its genes, never its luck ----------
// lean = { glint: 'warm'|'cool'|'strange'|null, hold: 'steady'|'restless'|'quick'|null, night: bool }
// Same random calls in the same order as an unnudged eye, so pupil, pattern, rare traits and name never move.
const GLINTS = { warm: [250, 170, 100], cool: [120, 200, 245], strange: [170, 230, 140] };
const GLINT_BOOST = 3, HOLD_PULL = 0.55;
const HOLD_TARGETS = {
  steady: { energy: 0.18, drama: 0.15 },                 // calm, sleepy, mellow
  restless: { energy: 0.85, curiosity: 0.85 },           // hyper, curious, nosy
  quick: { shyness: 0.12, grump: 0.72, drama: 0.7 }      // smug, judgy, extra
};
function cleanLean(l) {
  if (!l || typeof l !== 'object') return null;
  const glint = GLINTS[l.glint] ? l.glint : null, hold = HOLD_TARGETS[l.hold] ? l.hold : null, night = !!l.night;
  return glint || hold || night ? { glint, hold, night } : null;
}
function makeDNA(seed, lean) {
  lean = cleanLean(lean) || {};
  const r = rng(seed);
  const pal = pick(r, PALETTES.map((p) => {
    let w = p.w;
    if (lean.glint && p.fam === lean.glint && !p.rarity) w *= GLINT_BOOST;          // rare colours are never boosted
    if (lean.night && (p.id === 'Ocean' || p.id === 'Violet' || p.id === 'Frost')) w *= 1.3;
    return w === p.w ? p : { ...p, w };
  }));
  const [h0, s0, l0] = rgbToHsl(pal.rgb);
  const hue = h0 + (r() - 0.5) * 16;
  const lN = lean.night ? -0.05 : 0;                    // night-born eyes run a little deeper
  const accent = hslToRgb([hue, clamp(s0 + (r() - 0.5) * 0.12, 0.35, 0.95), clamp(l0 + lN, 0.3, 0.9)]);
  const harmony = r() < 0.78 ? 'analogous' : 'contrast';
  const shift = harmony === 'analogous' ? (r() < 0.5 ? -1 : 1) * (22 + r() * 22) : 150 + r() * 60;
  const accent2 = hslToRgb([hue + shift, clamp(s0 + 0.05, 0.4, 0.95), clamp(l0 + 0.06 + lN, 0.45, 0.8)]);
  const pattern = pick(r, PATTERNS);
  const pupil = pick(r, PUPILS);
  const shine = pick(r, SHINES);
  const rare = RARE_TRAITS.filter((t) => r() < t.p);

  // temperament: five dials
  const T = { curiosity: r(), shyness: r(), energy: r(), grump: r(), drama: r() };
  const tg = lean.hold && HOLD_TARGETS[lean.hold];
  if (tg) for (const k in tg) T[k] = mix(T[k], tg[k], HOLD_PULL);
  if (lean.night) T.energy = mix(T.energy, 0.3, 0.12);
  // sleepy eyes and grumpy eyes look the part
  const lidRest = clamp(0.05 + (1 - T.energy) * 0.2 + T.grump * 0.14 + (r() - 0.5) * 0.06, 0.02, 0.34);
  const lidTilt = (T.grump - 0.5) * 0.32 + (r() - 0.5) * 0.08;

  const motion = {
    dartEvery: mix(4.2, 1.1, T.energy) * mix(0.8, 1.25, r()),       // seconds between glances
    reach: mix(0.35, 0.95, T.curiosity),                             // how far it looks around
    spring: mix(90, 260, T.energy) * mix(0.85, 1.2, r()),            // dart snappiness
    bounce: mix(0.55, 0.92, r()),                                    // damping ratio (low = overshoot)
    blinkEvery: mix(6.5, 2.6, r()) * mix(1.2, 0.85, T.energy),
    blinkMs: mix(110, 230, 1 - T.energy) ,
    doubleBlink: mix(0.05, 0.4, r()),
    jitter: mix(0.004, 0.013, r()),                                  // subtle idle jitter, always small
    jitterRate: mix(0.25, 0.6, r()),
    dilate: mix(0.12, 0.42, T.drama)
  };
  const looks = {
    irisSize: mix(0.86, 1.1, r()),
    pupilSize: mix(0.85, 1.18, r()),
    glow: mix(0.82, 1.15, r()),
    rim: mix(0.5, 1.5, r()),
    density: mix(0.7, 1.3, r()),
    spin: (r() < 0.5 ? -1 : 1) * mix(0.02, 0.08, r()),
    patternSeed: (r() * 1e9) >>> 0,
    shineAngle: mix(-2.5, -1.9, r())
  };

  // temperament words: strongest two traits
  const scores = {
    curious: T.curiosity,
    shy: T.shyness * 0.95,
    hyper: T.energy > 0.5 ? T.energy : 0,
    sleepy: T.energy < 0.5 ? 1 - T.energy : 0,
    grumpy: T.grump * 0.95,
    dramatic: T.drama * 0.9,
    smug: (1 - T.shyness) * T.grump * 0.95 + (1 - T.shyness) * 0.15,
    calm: (1 - Math.abs(T.energy - 0.5) * 2) * (1 - T.drama) * 0.9
  };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const opposite = { hyper: 'sleepy', sleepy: 'hyper', shy: 'smug', smug: 'shy', calm: 'dramatic', dramatic: 'calm' };
  const first = ranked[0][0];
  const second = ranked.find(([k]) => k !== first && opposite[first] !== k)[0];
  const words = [first, second].map((k) => TEMPER_WORDS[k][Math.floor(r() * 3)]);

  const name = SYL_A[Math.floor(r() * SYL_A.length)] + SYL_B[Math.floor(r() * SYL_B.length)];
  const score = (pal.rarity || 0) + (pattern.rarity || 0) + (pupil.rarity || 0) + rare.reduce((s, t) => s + t.rarity, 0);
  const tier = score >= 4 ? 'mythic' : score >= 3 ? 'rare' : score >= 1 ? 'uncommon' : 'common';

  // birthmark: the light you chose stays in its iris, from its own random stream
  let birthmark = null;
  if (lean.glint) { const rb = rng((seed ^ 0xb1a7) >>> 0); birthmark = { fam: lean.glint, rgb: GLINTS[lean.glint], a: rb() * TAU, at: mix(0.4, 0.75, rb()), s: mix(0.85, 1.15, rb()) }; }
  return { seed, id: seed.toString(16).toUpperCase().padStart(8, '0').slice(0, 4), name, pal, accent, accent2, harmony,
    pattern, pupil, shine, rare, has: Object.fromEntries(rare.map((t) => [t.id, true])), T, lidRest, lidTilt,
    motion, looks, words, tier, score, firstWord: first, lean: cleanLean(lean), birthmark };
}

// Pattern geometry is fixed per eye (built once from its seed), only scaled by the pupil each frame.
function buildPattern(dna) {
  const r = rng(dna.looks.patternSeed);
  const d = dna.looks.density, out = [];
  if (dna.pattern.id === 'rays') {
    const n = Math.round(46 * d);
    for (let i = 0; i < n; i++) out.push({ a: (i / n) * TAU + r() * 0.08, len: mix(0.55, 1, r()), curl: (r() - 0.5) * 0.35, w: mix(0.6, 1.6, r()), a2: mix(0.35, 1, r()) });
  } else if (dna.pattern.id === 'rings') {
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) out.push({ at: mix(0.18, 0.95, (i + 0.5) / n), dash: mix(2, 9, r()), gap: mix(2, 7, r()), w: mix(0.7, 1.8, r()), off: r() * 20 });
  } else if (dna.pattern.id === 'speckle') {
    const n = Math.round(60 * d);
    for (let i = 0; i < n; i++) out.push({ a: r() * TAU, at: Math.sqrt(r()), s: mix(0.5, 2.1, r()), a2: mix(0.3, 1, r()) });
  } else if (dna.pattern.id === 'swirl') {
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) out.push({ a: (i / n) * TAU, twist: mix(1.6, 3.4, r()), w: mix(1, 2.4, r()) });
  } else if (dna.pattern.id === 'petal') {
    out.push({ n: 5 + Math.floor(r() * 5), depth: mix(0.12, 0.28, r()), layers: 2 + Math.floor(r() * 2) });
  } else if (dna.pattern.id === 'cells') {
    const n = Math.round(26 * d);
    for (let i = 0; i < n; i++) out.push({ a: r() * TAU, at: mix(0.2, 0.92, Math.sqrt(r())), s: mix(0.08, 0.14, r()), rot: r() * TAU });
  }
  dna.galaxy = Array.from({ length: 22 }, () => ({ a: r() * TAU, at: Math.sqrt(r()) * 0.9, s: mix(0.5, 1.6, r()), ph: r() * TAU, sp: mix(0.8, 2.2, r()) }));
  dna.fleck = { a: r() * TAU, at: mix(0.45, 0.8, r()) };
  return out;
}


const tierLabel = (t) => t[0].toUpperCase() + t.slice(1);
const KEY = 'haven.dna.v1';

// ---------- growth: HAVENs grow up over the days you spend together ----------
// Saved separately as haven.growth.v1, so eyes born before growth existed keep every gene they had.
// Their future (quirk order, mutations) comes from separate streams of the same seed; only the branch
// depends on how they are treated.
const GKEY = 'haven.growth.v1';
const STAGES = [
  { id: 'hatchling', name: 'Hatchling', days: 0 },
  { id: 'young', name: 'Young', days: 7 },
  { id: 'grown', name: 'Grown', days: 30 },
  { id: 'elder', name: 'Elder', days: 120 }
];
const BRANCHES = {
  gentle: { name: 'Gentle', about: 'Petted often. Softer, warmer light.' },
  feral: { name: 'Feral', about: 'Poked a lot. Sharper, fiercer light.' },
  nocturnal: { name: 'Nocturnal', about: 'Lives at night. Darker glass, starlight inside.' },
  radiant: { name: 'Radiant', about: 'Balanced. Brighter and more vivid.' }
};
const QUIRKS = [
  { id: 'hiccup', name: 'Hiccups' }, { id: 'sneeze', name: 'Sneezes' }, { id: 'doubletake', name: 'Double-takes when you come back' },
  { id: 'wiggle', name: 'Happy wiggle when you come back' }, { id: 'doze', name: 'Dozes off mid-blink' }, { id: 'shiver', name: 'Shivers' },
  { id: 'yawn', name: 'Big yawns' }, { id: 'hop', name: 'Little hops' }, { id: 'eyeroll', name: 'Rolls its eye' },
  { id: 'flutter', name: 'Pupil flutters' }, { id: 'sway', name: 'Sways' }, { id: 'peek', name: 'Peeks' },
  { id: 'squint', name: 'Suspicious squints' }, { id: 'boing', name: 'Boings' }
];
const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
let growth = null;
function newGrowth(born) {
  return { v: 1, days: 1, lastDay: today(), pets: 0, pokes: 0, night: 0, day: 0, stage: 0, branch: null,
    mutations: [], history: [{ stage: 0, at: born || Date.now() }], pending: null, skip: 0 };
}
function loadGrowth() {
  let g = null;
  try { g = JSON.parse(localStorage.getItem(GKEY)); } catch (e) { g = null; }
  const fresh = !g || g.v !== 1;
  if (fresh) g = newGrowth(state && state.born);
  growth = g;
  if (fresh) saveGrowth();
}
function saveGrowth() { try { localStorage.setItem(GKEY, JSON.stringify(growth)); } catch (e) {} }
function leaning(g) {
  const seen = g.night + g.day;
  if (seen >= 60 && g.night / seen > 0.45) return 'nocturnal';
  if (g.pets >= 6 && g.pets >= g.pokes * 2) return 'gentle';
  if (g.pokes >= 5 && g.pokes * 1.5 >= g.pets) return 'feral';
  return 'radiant';
}
// A small, fixed chance per evolution of gaining a rare trait. Written in the seed, so restores agree.
function mutationFor(seed, stage, has) {
  const r = rng((seed ^ 0xa5f00d ^ Math.imul(stage, 7919)) >>> 0);
  if (r() >= 1 / 12) return null;
  const open = RARE_TRAITS.filter((t) => !has[t.id]);
  return open.length ? open[Math.floor(r() * open.length)].id : null;
}
function stageFor(days) { let s = 0; STAGES.forEach((st, i) => { if (days >= st.days) s = i; }); return s; }
// Moves the HAVEN forward if enough days have passed. Returns true if it evolved.
function advance(base) {
  if (!growth || !base) return false;
  const target = stageFor(growth.days + growth.skip);
  if (target <= growth.stage) return false;
  const from = growth.stage, gained = [];
  const has = { ...base.has };
  growth.mutations.forEach((m) => (has[m.id] = true));
  while (growth.stage < target) {
    growth.stage++;
    if (growth.stage === 2 && !growth.branch) growth.branch = leaning(growth);
    const m = mutationFor(base.seed, growth.stage, has);
    if (m) { has[m] = true; growth.mutations.push({ id: m, stage: growth.stage }); gained.push(m); }
    growth.history.push({ stage: growth.stage, at: Date.now(), branch: growth.stage >= 2 ? growth.branch : null });
  }
  const prev = growth.pending;
  growth.pending = { from: prev ? prev.from : from, to: growth.stage, branch: growth.stage >= 2 ? growth.branch : null,
    gained: (prev ? prev.gained : []).concat(gained), at: Date.now() };
  saveGrowth();
  return true;
}
function countDay() {
  if (!growth) return;
  const d = today();
  if (growth.lastDay !== d) { growth.lastDay = d; growth.days++; saveGrowth(); }
}
function quirkOrder(seed) {
  const r = rng((seed ^ 0x51ab1e) >>> 0), list = QUIRKS.slice();
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
// Branch light: a gentle shift of the eye's own colours.
function branchColour(rgb, branch, second) {
  let [h, s, l] = rgbToHsl(rgb);
  if (branch === 'gentle') { const warm = 32; const d = ((warm - h + 540) % 360) - 180; h += d * 0.12; s -= 0.04; l += 0.04; }
  else if (branch === 'feral') { s += 0.12; l -= 0.03; }
  else if (branch === 'nocturnal') { l -= 0.17; s -= 0.08; }
  else if (branch === 'radiant') { s += 0.1; l += 0.06; }
  return hslToRgb([h, clamp(s, 0.2, 1), clamp(l, 0.25, 0.85)]);
}
const TEAL = rgbToHsl([111, 193, 202]);
let state = null, dna = null, pattern = null, accentHsl = null, accent2Hsl = null;

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
  if (s && Number.isFinite(Number(s.seed))) {
    state = s;
    dna = makeDNA(Number(s.seed) >>> 0, s.lean);
    if (typeof s.name === 'string' && s.name.trim()) dna.name = s.name.trim().slice(0, 14);
    if (!growth) loadGrowth();
    countDay();
    advance(makeDNA(Number(s.seed) >>> 0, s.lean));
    applyGrowth(dna);
    pattern = buildPattern(dna);
    accentHsl = rgbToHsl(dna.accent); accent2Hsl = rgbToHsl(dna.accent2);
  } else { state = null; dna = null; pattern = null; }
}
// Turns the base genes into the HAVEN as it is today: mutations, branch light, rarity.
function applyGrowth(d, g = growth) {
  if (!g) return;
  for (const m of g.mutations) {
    if (d.has[m.id]) continue;
    const t = RARE_TRAITS.find((x) => x.id === m.id);
    if (t) { d.rare.push(t); d.has[t.id] = true; d.score += t.rarity; }
  }
  d.tier = d.score >= 4 ? 'mythic' : d.score >= 3 ? 'rare' : d.score >= 1 ? 'uncommon' : 'common';
  d.stage = g.stage;
  d.branch = g.stage >= 2 ? g.branch : null;
  if (d.branch) { d.accent = branchColour(d.accent, d.branch); d.accent2 = branchColour(d.accent2, d.branch, true); }
  const hatch = clamp(((g.days || 1) + (g.skip || 0) - 1) / 6);
  d.growthPattern = g.stage === 0 ? mix(0.45, 0.85, hatch) : 1;
  d.quirks = quirkOrder(d.seed).slice(0, g.stage + 1);
  const r = rng((d.seed ^ 0x57a25) >>> 0);
  d.nightStars = Array.from({ length: 26 }, () => ({ a: r() * TAU, at: Math.sqrt(r()) * 0.92, s: mix(0.5, 1.5, r()), ph: r() * TAU, sp: mix(0.6, 1.8, r()) }));
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function announce() { try { root.dispatchEvent(new CustomEvent('haven:dna')); } catch (e) {} }
function adopt(seed, name, lean) {
  if (state) return false;                        // one eye per HAVEN: never overwrite
  lean = cleanLean(lean);
  const born = makeDNA(seed >>> 0, lean);
  state = { v: 1, seed: seed >>> 0, name: name || born.name, born: Date.now() };
  if (lean) state.lean = lean;
  persist();
  growth = newGrowth(state.born); saveGrowth();
  load(); announce();
  return true;
}
function rename(name) {
  if (!state) return;
  // 5.0: the nickname only (never the seed, DNA or growth). Invisible and control characters never get in.
  const clean = String(name || '').replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, '').replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  if (!clean) return;
  state.name = clean; persist(); load(); announce();
}
root.addEventListener && root.addEventListener('storage', (e) => { if (e.key === KEY || e.key === GKEY) { growth = null; load(); announce(); } });
// What HAVEN noticed: petting, annoyed taps, visits, and which minutes of the day it is looked at.
let noteSave = 0;
function note(kind) {
  if (!growth || !state) return;
  if (kind === 'pet') growth.pets++;
  else if (kind === 'poke') growth.pokes++;
  else if (kind === 'minute') { const h = new Date().getHours(); if (h >= 21 || h < 5) growth.night++; else growth.day++; }
  else if (kind === 'visit') countDay();
  const evolved = advance(makeDNA(state.seed, state.lean));
  if (evolved) { load(); announce(); }
  else if (Date.now() - noteSave > 15000 || kind !== 'minute') { noteSave = Date.now(); saveGrowth(); }
}
function growthInfo() {
  if (!growth || !dna) return null;
  const st = STAGES[growth.stage], next = STAGES[growth.stage + 1];
  const br = growth.stage >= 2 ? growth.branch : null, lean = leaning(growth);
  return { stage: growth.stage, stageId: st.id, stageName: st.name, days: growth.days + growth.skip,
    nextName: next ? next.name : null, nextInDays: next ? Math.max(0, next.days - growth.days - growth.skip) : null,
    branch: br, branchName: br ? BRANCHES[br].name : null, branchAbout: br ? BRANCHES[br].about : null,
    leaning: lean, leaningName: BRANCHES[lean].name, quirks: dna.quirks.map((q) => q.name), quirkIds: dna.quirks.map((q) => q.id),
    mutations: growth.mutations.map((m) => m.id), pending: growth.pending };
}
function takePending() { if (!growth || !growth.pending) return null; const p = growth.pending; growth.pending = null; saveGrowth(); return p; }
// Testing only (Patch): pretend days have passed. HavenDNA.skipDays(30)
function skipDays(n) { if (!growth) return; growth.skip += Math.max(0, Number(n) || 0); saveGrowth(); const e = advance(makeDNA(state.seed, state.lean)); load(); announce(); return growthInfo(); }
// Testing only: force a branch before Grown, e.g. HavenDNA.testBranch('feral')
function testBranch(b) { if (!growth || !BRANCHES[b]) return; growth.branch = b; saveGrowth(); load(); announce(); }

// ---- colour: the DNA hue replaces HAVEN's teal, mood colours keep their relationships ----
// 3.2: every drawing hook takes an optional eye (o.dna / last argument) so the one shared renderer
// (eye-render.js) can draw any eye: yours, a friend's, or one still being born.
const ownDNA = () => dna;
const patternOf = (d) => (d === dna && pattern ? pattern : d._geo || (d._geo = buildPattern(d)));
function mapColor(r, g, b, which) {
  const d = which || dna;
  if (!d) return [r, g, b];
  const aH = d === dna && accentHsl ? accentHsl : d._aHsl || (d._aHsl = rgbToHsl(d.accent));
  const [h, s, l] = rgbToHsl([r, g, b]);
  const ah = aH[0] - TEAL[0];
  const ns = clamp(s * (aH[1] / TEAL[1]), 0, 1);
  const nl = clamp(l * (aH[2] / TEAL[2]), 0, 0.92);
  return hslToRgb([h + ah, ns, nl]);
}

// ---- movement and temperament, as gentle multipliers on Patch's existing systems ----
const NEUTRAL_MOTION = Object.freeze({ gazePace: 1, blinkPace: 1, snap: 1 });
function motion() {
  if (!dna) return NEUTRAL_MOTION;
  const m = dna.motion;
  const st = dna.stage || 0, baby = st === 0, elder = st === 3, feral = dna.branch === 'feral';
  return {
    gazePace: clamp(m.dartEvery / 2.4, 0.6, 1.6) * (baby ? 0.8 : elder ? 1.2 : 1) * (feral ? 0.85 : 1),
    blinkPace: clamp(m.blinkEvery / 4.4, 0.65, 1.5) * (baby ? 0.8 : 1),
    snap: clamp(170 / m.spring, 0.7, 1.5) * (feral ? 0.8 : elder ? 1.15 : 1)
  };
}
function bias() {
  if (!dna) return { sleep: 0, curious: 0, content: 0 };
  const T = dna.T;
  return { sleep: (0.5 - T.energy) * 0.3, curious: (T.curiosity - 0.5) * 0.4, content: (0.5 - T.grump) * 0.2 };
}
function lid(which) { const dna = which || ownDNA(); return dna ? dna.lidRest * 0.55 : 0; }
function looks(which) {
  const dna = which || ownDNA();
  if (!dna) return { iris: 1, pupil: 1 };
  const baby = dna.stage === 0 ? 1.14 : 1;
  return { iris: mix(1, dna.looks.irisSize, 0.6), pupil: mix(1, dna.looks.pupilSize, 0.6) * baby };
}

// ---- drawing hooks (launcher coordinates: origin at the eye centre, size ~ eye radius, t in ms) ----
const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp(a)})`;
function paintIris(ctx, o) {
  const dna = o.dna || ownDNA();
  if (!dna || o.alpha <= 0.01) return;
  const pattern = patternOf(dna);
  const { gx, gy, irisRadius: irisR, pupilR, size, own, tint } = o, s = o.t / 1000, k = o.alpha;
  const inner = pupilR * 1.15, span = irisR * 0.96 - inner, spin = (o.motion ? s : 0) * dna.looks.spin;
  const A2 = lift(dna.accent2, 0.38), A1 = lift(dna.accent, 0.5);
  const c1 = (a) => (own ? rgba(A2, a) : tint(1.45, a)), c2 = (a) => (own ? rgba(A1, a) : tint(1.7, a));
  ctx.save();
  // two-tone: half the iris in the second colour
  if (dna.has.twoTone) {
    ctx.save();
    const ang = (dna.looks.patternSeed % 628) / 100;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.arc(gx, gy, irisR * 1.02, ang, ang + Math.PI); ctx.closePath(); ctx.clip();
    const B = own ? dna.accent2 : null;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, irisR);
    g.addColorStop(0, B ? rgba(B, 0.85 * k) : tint(1.2, 0.6 * k));
    g.addColorStop(0.6, B ? rgba(B.map((x) => x * 0.5), 0.55 * k) : tint(0.6, 0.4 * k));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, irisR, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  const P = pattern, id = dna.pattern.id, lw = size * 0.0105, gp = dna.growthPattern || 1;
  const upto = (list) => Math.max(1, Math.ceil(list.length * mix(0.55, 1, (gp - 0.45) / 0.55)));
  if (id === 'rays') {
    for (const f of P) {
      const a = f.a + spin * 0.3, r1 = inner, r2 = inner + span * f.len * gp;
      ctx.strokeStyle = c1(0.32 * f.a2 * k); ctx.lineWidth = lw * f.w;
      ctx.beginPath();
      ctx.moveTo(gx + Math.cos(a) * r1, gy + Math.sin(a) * r1);
      ctx.quadraticCurveTo(gx + Math.cos(a + f.curl) * (r1 + r2) / 2, gy + Math.sin(a + f.curl) * (r1 + r2) / 2, gx + Math.cos(a) * r2, gy + Math.sin(a) * r2);
      ctx.stroke();
    }
  } else if (id === 'rings') {
    for (const ring of P.slice(0, upto(P))) {
      ctx.setLineDash([lw * 1.2 * ring.dash, lw * 1.2 * ring.gap]);
      ctx.lineDashOffset = ring.off + spin * 60;
      ctx.strokeStyle = c1(0.34 * k); ctx.lineWidth = lw * 1.1 * ring.w;
      ctx.beginPath(); ctx.arc(gx, gy, inner + span * ring.at, 0, TAU); ctx.stroke();
    }
    ctx.setLineDash([]);
  } else if (id === 'speckle') {
    for (const p of P.slice(0, upto(P))) {
      const rr = inner + span * p.at, a = p.a + spin * 0.2;
      ctx.fillStyle = c1(0.42 * p.a2 * k);
      ctx.beginPath(); ctx.arc(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr, lw * 1.2 * p.s, 0, TAU); ctx.fill();
    }
  } else if (id === 'swirl') {
    for (const arm of P) {
      ctx.strokeStyle = c1(0.34 * k); ctx.lineWidth = lw * 1.1 * arm.w;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const u = (i / 24) * gp, rr = inner + span * u, a = arm.a + spin + u * arm.twist;
        i ? ctx.lineTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr) : ctx.moveTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr);
      }
      ctx.stroke();
    }
  } else if (id === 'petal') {
    const p = P[0];
    for (let L = 0; L < (gp < 0.9 ? 1 : p.layers); L++) {
      const base = inner + span * (0.45 + L * 0.28) * mix(0.8, 1, gp);
      ctx.strokeStyle = L % 2 ? c2(0.26 * k) : c1(0.32 * k); ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * TAU, rr = base * (1 - p.depth * 0.5 + p.depth * 0.5 * Math.cos(a * p.n + spin * 2 + L));
        i ? ctx.lineTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr) : ctx.moveTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr);
      }
      ctx.stroke();
    }
  } else if (id === 'cells') {
    ctx.strokeStyle = c1(0.32 * k); ctx.lineWidth = lw * 0.9;
    for (const c of P.slice(0, upto(P))) {
      const rr = inner + span * c.at, a = c.a + spin * 0.2;
      const x = gx + Math.cos(a) * rr, y = gy + Math.sin(a) * rr, sz = irisR * c.s;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const q = c.rot + (i / 6) * TAU; i ? ctx.lineTo(x + Math.cos(q) * sz, y + Math.sin(q) * sz) : ctx.moveTo(x + Math.cos(q) * sz, y + Math.sin(q) * sz); }
      ctx.stroke();
    }
  }
  if (dna.has.galaxy) {
    for (let i = 0; i < dna.galaxy.length; i += o.lowPower ? 2 : 1) {
      const st = dna.galaxy[i], tw = o.motion ? 0.5 + 0.5 * Math.sin(s * st.sp + st.ph) : 0.7;
      const rr = pupilR + (irisR * 0.95 - pupilR) * st.at, a = st.a + (o.motion ? s : 0) * 0.05;
      ctx.fillStyle = `rgba(255,255,255,${(0.15 + tw * 0.75) * k})`;
      ctx.beginPath(); ctx.arc(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr, size * 0.0095 * st.s * (0.6 + tw * 0.6), 0, TAU); ctx.fill();
    }
  }
  if (dna.birthmark && own) {
    const b = dna.birthmark, rr = pupilR + (irisR - pupilR) * b.at;
    const bx = gx + Math.cos(b.a + spin * 0.3) * rr, by = gy + Math.sin(b.a + spin * 0.3) * rr, br = size * 0.06 * b.s;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, rgba(lift(b.rgb, 0.35), 0.75 * k)); g.addColorStop(0.45, rgba(b.rgb, 0.35 * k)); g.addColorStop(1, rgba(b.rgb, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
  }
  if (dna.has.fleck) {
    const rr = pupilR + (irisR - pupilR) * dna.fleck.at;
    const fx = gx + Math.cos(dna.fleck.a) * rr, fy = gy + Math.sin(dna.fleck.a) * rr;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, size * 0.07);
    g.addColorStop(0, `rgba(255,214,120,${0.9 * k})`); g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy, size * 0.07, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
// Builds the pupil outline. Returns false for a round pupil so the launcher draws its own.
function pupilPath(ctx, x, y, r, t, which) {
  const dna = which || ownDNA();
  if (!dna) return false;
  const id = dna.pupil.id;
  if (id === 'round') return false;
  r *= 1.3;                                   // shaped pupils read a little larger than a dot
  if (id === 'tall') ctx.ellipse(x, y, r * 0.62, r * 1.18, 0, 0, TAU);
  else if (id === 'wide') ctx.ellipse(x, y, r * 1.22, r * 0.66, 0, 0, TAU);
  else if (id === 'ring') { ctx.arc(x, y, r * 1.08, 0, TAU); ctx.moveTo(x + r * 0.5, y); ctx.arc(x, y, r * 0.5, 0, TAU, true); }
  else if (id === 'star') {
    const n = 5, rot = -Math.PI / 2 + (t / 1000) * 0.15;
    for (let i = 0; i <= n * 2; i++) {
      const rr = i % 2 ? r * 0.55 : r * 1.25, a = rot + (i / (n * 2)) * TAU;
      i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  } else if (id === 'crescent') {
    ctx.arc(x, y, r * 1.1, 0.25 * Math.PI, 1.75 * Math.PI, false);
    ctx.arc(x + r * 0.55, y, r * 0.8, 1.6 * Math.PI, 0.4 * Math.PI, true);
    ctx.closePath();
  } else if (id === 'heart') {
    const k = r * 1.15;
    ctx.moveTo(x, y + k * 0.85);
    ctx.bezierCurveTo(x - k * 1.25, y + k * 0.05, x - k * 0.7, y - k * 1.05, x, y - k * 0.4);
    ctx.bezierCurveTo(x + k * 0.7, y - k * 1.05, x + k * 1.25, y + k * 0.05, x, y + k * 0.85);
    ctx.closePath();
  } else return false;
  return true;
}
const fillRule = (which) => { const d = which || dna; return d && d.pupil.id === 'ring' ? 'evenodd' : 'nonzero'; };
// Rare: two soft halos outside the eye.
function paintHalo(ctx, { rx, ry, t, own, tint, dna: which }) {
  const dna = which || ownDNA();
  if (!dna || !dna.has.halo) return;
  const s = t / 1000;
  ctx.save();
  ctx.lineWidth = Math.max(1, rx * 0.016);
  ctx.strokeStyle = own ? rgba(lift(dna.accent2, 0.2), 0.16 + Math.sin(s * 1.3) * 0.05) : tint(1.3, 0.16);
  ctx.beginPath(); ctx.ellipse(0, 0, rx * 1.17, ry * 1.17, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = own ? rgba(lift(dna.accent, 0.2), 0.1 + Math.sin(s * 1.3 + 1.5) * 0.04) : tint(1.1, 0.1);
  ctx.beginPath(); ctx.ellipse(0, 0, rx * 1.29, ry * 1.29, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}
// Rare: an aurora that slides around the rim.
function paintRim(ctx, { rx, ry, t, amount, dna: which }) {
  const dna = which || ownDNA();
  if (!dna || !dna.has.aurora) return;
  const s = t / 1000;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineWidth = Math.max(1.5, rx * 0.03);
  const g = ctx.createLinearGradient(-rx, -ry, rx, ry);
  g.addColorStop(0, rgba(hslToRgb([(s * 40) % 360, 0.75, 0.68]), 0.5 * amount));
  g.addColorStop(0.5, rgba(hslToRgb([(s * 40 + 70) % 360, 0.75, 0.66]), 0.12 * amount));
  g.addColorStop(1, rgba(hslToRgb([(s * 40 + 140) % 360, 0.75, 0.65]), 0.4 * amount));
  ctx.strokeStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, rx - ctx.lineWidth / 2, ry - ctx.lineWidth / 2, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}
// Grown and Elder: a second layer of detail in the iris, drawn in the style of its branch.
// Shared by the home screen renderer and the Awakening/birth card renderer.
function paintDetail(ctx, o) {
  const dna = o.dna || root.HavenDNA.dna();
  if (!dna || !dna.branch || o.alpha <= 0.01) return;
  const { gx, gy, irisR, pupilR, size, own, tint } = o, k = o.alpha, s = (o.motion === false ? 0 : o.t / 1000);
  const br = dna.branch, lw = size * 0.0105;
  const C = (a, lift2 = 0.45) => (own ? rgba(lift(dna.accent2, lift2), a) : tint(1.55, a));
  const inner = pupilR * 1.15, coll = inner + (irisR - inner) * 0.12;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  if (br === 'nocturnal') {
    for (const st of dna.nightStars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(s * st.sp + st.ph)), rr = size * 0.95 * st.at, a = st.a + s * 0.01;
      ctx.fillStyle = `rgba(235,235,255,${0.7 * tw * k})`;
      ctx.beginPath(); ctx.arc(gx * 0.4 + Math.cos(a) * rr, gy * 0.4 + Math.sin(a) * rr, lw * 0.9 * st.s, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = C(0.22 * k); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(gx, gy, coll, 0, TAU); ctx.stroke();
  } else if (br === 'gentle') {
    ctx.strokeStyle = C(0.16 * k, 0.6); ctx.lineWidth = lw * 2.6;
    ctx.beginPath(); ctx.arc(gx, gy, coll, 0, TAU); ctx.stroke();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + s * 0.03, rr = irisR * 0.9;
      ctx.fillStyle = C(0.26 * k, 0.6);
      ctx.beginPath(); ctx.arc(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr, lw * 1.3, 0, TAU); ctx.fill();
    }
  } else if (br === 'feral') {
    ctx.fillStyle = C(0.3 * k, 0.35);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU, w = TAU / 22 * 0.32, r1 = irisR * 0.98, r2 = irisR * (i % 2 ? 0.8 : 0.72);
      ctx.beginPath();
      ctx.moveTo(gx + Math.cos(a - w) * r1, gy + Math.sin(a - w) * r1);
      ctx.lineTo(gx + Math.cos(a) * r2, gy + Math.sin(a) * r2);
      ctx.lineTo(gx + Math.cos(a + w) * r1, gy + Math.sin(a + w) * r1);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = C(0.32 * k, 0.35); ctx.lineWidth = lw * 1.1;
    ctx.beginPath();
    for (let i = 0; i <= 36; i++) { const a = (i / 36) * TAU, rr = coll * (i % 2 ? 0.9 : 1.12); i ? ctx.lineTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr) : ctx.moveTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr); }
    ctx.closePath(); ctx.stroke();
  } else {
    ctx.strokeStyle = C(0.24 * k); ctx.lineWidth = lw * 0.8;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU, r1 = irisR * 0.86, r2 = irisR * (i % 3 ? 0.95 : 0.99);
      ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * r1, gy + Math.sin(a) * r1); ctx.lineTo(gx + Math.cos(a) * r2, gy + Math.sin(a) * r2); ctx.stroke();
    }
    const g = ctx.createRadialGradient(gx, gy, irisR * 0.7, gx, gy, irisR * 1.15);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, C(0.08 * k, 0.35)); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, irisR * 1.15, 0, TAU); ctx.fill();
    ctx.strokeStyle = C(0.2 * k); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(gx, gy, coll, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
// Elder: a slow crown of light travelling around the rim. Origin at the eye centre.
function paintCrown(ctx, { rx, ry, t, amount = 1, own, tint, motion, dna: which }) {
  const dna = which || root.HavenDNA.dna();
  if (!dna || (dna.stage || 0) < 3) return;
  const s = motion === false ? 0 : t / 1000;
  const col1 = (a) => (own ? rgba(lift(dna.accent, 0.55), a) : tint(1.7, a));
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  const lw = Math.max(1.5, rx * 0.035);
  for (let i = 0; i < 3; i++) {
    const a0 = s * 0.25 + (i / 3) * TAU;
    ctx.strokeStyle = col1(0.5 * amount); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(0, 0, rx - lw, ry - lw, 0, a0, a0 + 0.55); ctx.stroke();
    ctx.strokeStyle = col1(0.16 * amount); ctx.lineWidth = lw * 3.2;
    ctx.beginPath(); ctx.ellipse(0, 0, rx - lw, ry - lw, 0, a0 - 0.1, a0 + 0.65); ctx.stroke();
  }
  ctx.strokeStyle = col1(0.12 * amount); ctx.lineWidth = lw * 0.6;
  ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.9, ry * 0.9, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}
// ---------- LINK: profiles, so a friend's real HAVEN can appear on your screen ----------
// A profile carries only what it takes to grow the same eye: seed, name, stage, branch, mutations, birth day.
function profile() {
  if (!state || !growth) return null;
  return { v: 1, seed: state.seed >>> 0, name: dna ? dna.name : state.name, stage: growth.stage,
    branch: growth.stage >= 2 ? growth.branch : null, mutations: growth.mutations.map((m) => m.id), born: state.born, lean: state.lean || null };
}
function cleanProfile(p) {
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return null; } }
  if (!p || typeof p !== 'object' || !Number.isFinite(Number(p.seed))) return null;
  const stage = Math.max(0, Math.min(3, Math.floor(Number(p.stage) || 0)));
  const branch = BRANCHES[p.branch] ? p.branch : null;
  const muts = Array.isArray(p.mutations) ? p.mutations.filter((id) => RARE_TRAITS.some((t) => t.id === id)).slice(0, 5) : [];
  const name = String(p.name || '').replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, '').replace(/[<>&"]/g, '').trim().slice(0, 14);
  const born = Number.isFinite(Number(p.born)) ? Number(p.born) : null;
  return { v: 1, seed: Number(p.seed) >>> 0, name, stage, branch: stage >= 2 ? branch || 'radiant' : null, mutations: muts, born, lean: cleanLean(p.lean) };
}
// Grows a friend's HAVEN from their profile, with the same rules as your own.
function friendDNA(p) {
  p = cleanProfile(p);
  if (!p) return null;
  const d = makeDNA(p.seed, p.lean);
  if (p.name) d.name = p.name;
  applyGrowth(d, { stage: p.stage, branch: p.branch, mutations: p.mutations.map((id) => ({ id })), days: p.stage ? 30 : 7, skip: 0 });
  d.born = p.born;
  buildPattern(d);
  return d;
}
// "Woken slowly at night, born of the warm light."  Empty for eyes born before 3.1.
function originLine(d, born) {
  const l = d && d.lean; if (!l) return '';
  const h = new Date(born || Date.now()).getHours();
  const when = l.night ? 'at night' : h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : 'in the evening';
  const how = { steady: 'Woken slowly', restless: 'Woken by a restless hand', quick: 'Poked awake' }[l.hold] || 'Woken';
  return `${how} ${when}${l.glint ? `, born of the ${l.glint} light` : ''}.`;
}
function summary() {
  if (!dna) return null;
  return {
    seed: dna.seed, id: '#' + dna.seed.toString(16).toUpperCase().padStart(8, '0'), name: dna.name, tier: dna.tier,
    tierLabel: tierLabel(dna.tier), words: dna.words.slice(), born: state.born,
    iris: dna.pal.id + ' ' + dna.pattern.name.toLowerCase(), pupil: dna.pupil.name, traits: dna.rare.map((x) => x.name),
    growth: growthInfo(), origin: originLine(dna, state.born)
  };
}
load();
root.HavenDNA = {
  has: () => !!state, active: () => !!dna, dna: () => dna, summary, adopt, rename,
  note, growth: growthInfo, takePending, skipDays, testBranch, STAGES, BRANCHES, profile, cleanProfile, friendDNA,
  mapColor, motion, bias, lid, looks, paintIris, pupilPath, fillRule, paintHalo, paintRim, paintDetail, paintCrown,
  lib: { TAU, clamp, mix, ease, rng, makeDNA, buildPattern, newSeed, rgbToHsl, hslToRgb, col, lift, tierLabel, cleanLean, originLine, GLINTS },
  GENES: { PALETTES, PATTERNS, PUPILS, RARE_TRAITS }
};
})(typeof window === 'undefined' ? globalThis : window);
