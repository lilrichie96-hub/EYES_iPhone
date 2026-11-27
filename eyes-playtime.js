/* EYES 4.6.6 · Eye Contact and Play on the Ability Satellite. Shared by Android and iPhone.
   Loads after ability-wheel.js and weather.js. Since 5.0 the wheel's order is declared in ability-wheel.js:
   Vision, Weather, Pocket Dimension, Arcade, Eye Contact, Play.
   5.0: Surprise me lets the Eye choose an activity (temperament, mood, time of day, what it just did), with a
   short visible decision first; every activity stays one tap away. When Play closes, what you did together
   lingers in the Living Eye (EyesFeel: 'play', or 'company' after mostly Company). Nothing new is stored.

   Eye Contact  The satellite opens the complete existing Eye Contact scene (eyes-contact.js), exactly as The
                Optic and the iPhone dock do. Nothing about friendships, battles, visits, Hangouts or invites is
                touched here. The Eye glances up toward where its friends live, then the scene takes over; closing
                it hands the home screen straight back (Haven.holdHome(false)).
   Play         Arcade is where you play games. Play is where you play with your Eye. Always the real Eye on the
                home canvas (its material, identity, temperament and renderer): this file only hands launcher.js a
                pose (gaze, lean, hop, squash, lids, pupil, glow) through the ability system and paints the toys.
                  Staring contest  the existing contest (eyes-play.js), now with temperament-dependent reactions
                  Firefly          guide a firefly; the Eye tracks it, anticipates it and pounces now and then
                  Catch            toss or flick a glowing ball; it catches, juggles, fumbles and throws it back
                  Peekaboo         it hides at an edge, peeks, surprises you; or you cover its eye and hide
                  Company          nothing to do. It breathes, glances, leans, dozes. You can soothe or tease it.
                Hangout's firefly and ball are the source for the toys here (same wander forces, blink, glow, ball
                gravity, bounce and catch rings), adapted to one Eye and a finger.
                No scores (the staring contest keeps its old tally), no currencies, XP, streaks, energy or rewards.
                Stores nothing new.
   Lifecycle    Play is an ability: PLAY_PICK -> PLAY_ACTIVE -> PLAY_PICK ... -> PLAY_CLOSING -> released.
                Back steps out one level. Home, a panel, a scene, the app being hidden or any cleanup tears the
                overlay down at once, releases pointer capture and stops every frame request.
                Motion Off: Play says it needs motion instead of pretending. Gentle: slower and smaller.
                Battery saver / low battery: frame rates halve. */
'use strict';
(function (root) {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ms = () => performance.now();
  const temper = () => {
    const d = root.HavenDNA && HavenDNA.dna && HavenDNA.dna();
    const T = (d && d.T) || {};
    const v = (k) => (typeof T[k] === 'number' ? T[k] : 0.5);
    return { curiosity: v('curiosity'), shyness: v('shyness'), energy: v('energy'), grump: v('grump'), drama: v('drama') };
  };
  const eyeName = () => { try { const d = HavenDNA.dna(); return (d && d.name) || 'Your Eye'; } catch (e) { return 'Your Eye'; } };
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
  function eyeColour() {
    try { const d = HavenDNA.dna(); if (d && d.accent2) return d.accent2; } catch (e) {}
    return [170, 230, 236];
  }

  // =====================================================================================================
  // Eye Contact
  // =====================================================================================================
  // two small Eyes looking toward each other
  const CONTACT_ICON = 'M1.8 12c1.4-2.5 3-3.7 4.8-3.7s3.4 1.2 4.8 3.7c-1.4 2.5-3 3.7-4.8 3.7S3.2 14.5 1.8 12Z M7 12a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0 M12.6 12c1.4-2.5 3-3.7 4.8-3.7s3.4 1.2 4.8 3.7c-1.4 2.5-3 3.7-4.8 3.7s-3.4-1.2-4.8-3.7Z M14.7 12a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0';
  const C = { api: null, at: 0, timer: 0, dur: 300 };
  function contactAvailable() {
    if (!root.EyesContact || typeof EyesContact.open !== 'function') return false;
    try { return !!(root.HavenDNA && HavenDNA.has()); } catch (e) { return false; }
  }
  function contactActivate(api) {
    const h = api.host();
    C.api = api; C.at = ms();
    C.dur = !h || !h.motion() ? 0 : h.gentle() ? 200 : 320;
    try { h && h.core && h.core.react && h.core.react('anticipate', h.now()); } catch (e) {}
    api.redraw();
    clearTimeout(C.timer);
    C.timer = setTimeout(contactOpen, C.dur);
  }
  function contactOpen() {
    const api = C.api;
    clearTimeout(C.timer); C.timer = 0; C.api = null;
    if (!api) return;
    api.done('contact');                      // release the iris first, then the scene holds the home screen
    try { EyesContact.open(); }
    catch (e) { try { root.EyesSocial && EyesSocial.caption && EyesSocial.caption('Eye Contact could not open. Try again.'); } catch (er) {} }
  }
  function contactCancel(reason) {
    clearTimeout(C.timer); C.timer = 0;
    const api = C.api; C.api = null;
    if (api) api.done(reason || 'cancel');
  }
  function contactPose() {
    if (!C.api) return null;
    const e = ease(C.dur ? (ms() - C.at) / C.dur : 1);
    // a glance up toward the sky where its friends' Eyes live, pupil widening
    return { k: 0, look: 0.85 * e, gaze: { x: 0.05, y: -0.75 }, neutral: 0, hush: 1, open: 0, lens: 0, grow: 0, size: 0, pupil: 0, iris: 0,
      pupilK: 1 + 0.22 * e, glow: 1 + 0.14 * e, bodySy: 1 + 0.025 * e, bodySx: 1 - 0.012 * e, dy: -3 * e };
  }

  // =====================================================================================================
  // Play
  // =====================================================================================================
  // a glowing ball mid-bounce, its arc trailing behind it
  const PLAY_ICON = 'M12.6 8.6a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0 M3.4 20c1.2-4.6 3.6-7.9 7.6-9.8 M2.8 20.6h4.4 M20.4 14v2.4 M19.2 15.2h2.4';
  const ACTS = [
    { id: 'stare', title: 'Staring contest', sub: 'Hold your finger on its eye. Whoever blinks first loses.' },
    { id: 'firefly', title: 'Firefly', sub: 'Guide a firefly around. It will try to catch it.' },
    { id: 'catch', title: 'Catch', sub: 'Toss or flick a glowing ball to your Eye.' },
    { id: 'peekaboo', title: 'Peekaboo', sub: 'It hides. Find it, or cover its eye and hide from it.' },
    { id: 'company', title: 'Company', sub: 'Nothing to do. Just spend some time together.' }
  ];
  let S = null;            // the running Play session, null when Play doesn't own the iris
  const recentActs = [];   // 5.0: the last few activities (this run of EYES only), so Surprise me doesn't repeat itself

  // ---------- 5.0: Surprise me ----------
  function livingEmotion() { try { return (root.EyesLiving && EyesLiving.emotion && EyesLiving.emotion()) || 'content'; } catch (e) { return 'content'; } }
  function surpriseWeights() {
    const T = temper(), emo = livingEmotion(), hour = new Date().getHours(), night = hour >= 22 || hour < 6;
    const w = {
      stare: (0.35 + 0.6 * T.grump + 0.3 * T.drama) * 0.6,            // it leaves Play for the home screen, so a little rarer
      firefly: 0.5 + 0.8 * T.curiosity + 0.3 * T.energy,
      catch: 0.4 + 1.0 * T.energy,
      peekaboo: 0.3 + 0.7 * T.shyness + 0.3 * (1 - T.grump),
      company: 0.3 + 0.8 * (1 - T.energy)
    };
    const boost = {
      playful: { catch: 1.5, firefly: 1.2 }, excited: { catch: 1.5, firefly: 1.3, company: 0.6 }, sleepy: { company: 2.2, catch: 0.5, firefly: 0.8 },
      curious: { firefly: 1.5, peekaboo: 1.1 }, mischievous: { peekaboo: 1.6, stare: 1.3 }, shy: { peekaboo: 1.4, company: 1.2, stare: 0.7 },
      bored: { catch: 1.3, firefly: 1.2, company: 0.6 }, content: { company: 1.3 }, thoughtful: { company: 1.3, stare: 0.8 }
    }[emo] || {};
    for (const k in boost) w[k] *= boost[k];
    if (night) { w.company *= 1.5; w.catch *= 0.7; }
    // what it just did is the least likely; the one before that, less likely
    const n = recentActs.length;
    if (n) w[recentActs[n - 1]] *= 0;
    if (n > 1) w[recentActs[n - 2]] *= 0.35;
    if (n > 2) w[recentActs[n - 3]] *= 0.6;
    return w;
  }
  function surprisePick() {
    const w = surpriseWeights(), ids = Object.keys(w).filter((k) => w[k] > 0);
    if (!ids.length) return ACTS[0].id;
    let r = Math.random() * ids.reduce((a, k) => a + w[k], 0);
    for (const k of ids) if ((r -= w[k]) <= 0) return k;
    return ids[ids.length - 1];
  }
  function rememberAct(id) { recentActs.push(id); while (recentActs.length > 4) recentActs.shift(); }
  function cancelSurprise() {
    if (!S || !S.surprise) return;
    S.surprise = null;
    if (S.el) { S.el.classList.remove('pt-choosing'); S.el.querySelectorAll('.pt-chip.pt-chosen, .pt-chip.pt-considered').forEach((b) => b.classList.remove('pt-chosen', 'pt-considered')); }
  }
  // the Eye decides where you can see it: it glances over a couple of choices, settles on one, perks up, goes
  function surprise() {
    if (!S || S.closing || !S.motion || S.act || S.surprise) return;
    const pick = surprisePick(), tok = {};
    S.surprise = tok;
    const chips = [...S.el.querySelectorAll('.pt-chip[data-act]')].filter((b) => b.dataset.act !== 'surprise');
    const target = chips.find((b) => b.dataset.act === pick);
    const others = chips.filter((b) => b !== target).sort(() => Math.random() - 0.5).slice(0, 2);
    const k = S.gentle ? 1.3 : 1, B = S.B;
    S.el.classList.add('pt-choosing');
    const look = (b, cls) => {
      if (!S || S.surprise !== tok || !b) return;
      S.el.querySelectorAll('.pt-considered').forEach((x) => x.classList.remove('pt-considered'));
      if (cls) b.classList.add(cls);
      if (S.g) { const r = b.getBoundingClientRect(); gazeAt(B, S.g, r.left + r.width / 2, r.top + r.height / 2, 1); }
    };
    // thinking: the pupil narrows a little while it weighs them
    B.pupil.to = 0.9; B.tilt.to = 0.05 * (Math.random() < 0.5 ? -1 : 1);
    let at = 120 * k;
    for (const b of others) { later(() => look(b, 'pt-considered'), at); at += 260 * k; }
    later(() => {
      if (!S || S.surprise !== tok) return;
      look(target, 'pt-chosen');
      B.tilt.to = 0; B.pupil.to = 1.28; B.glow.to = 1.14; B.sq.vel += 2.4 * ampK();
      react('anticipate');
    }, at);
    later(() => {
      if (!S || S.surprise !== tok) return;
      S.surprise = null;
      S.el.classList.remove('pt-choosing');
      choose(pick, 'surprise');
    }, at + 560 * k);
    S.api.redraw();
  }

  // ---------- the body: a few springs that become the pose launcher.js applies ----------
  function makeBody() {
    const s = (v) => ({ v, vel: 0, to: v });
    return { dx: s(0), dy: s(0), sq: s(0), tilt: s(0), scale: s(1), pupil: s(1), glow: s(1), lid: s(0), look: s(0), gx: 0, gy: 0, tgx: 0, tgy: 0, breath: 0, breathAmp: 0.008, breathPeriod: 4200 };
  }
  function spring(sp, dt, k, z = 1) {
    const c = 2 * Math.sqrt(k) * z;
    sp.vel += ((sp.to - sp.v) * k - sp.vel * c) * dt;
    sp.v += sp.vel * dt;
  }
  function stepBody(B, dt, slow) {
    const k = slow ? 0.55 : 1;
    spring(B.dx, dt, 60 * k, 0.75); spring(B.dy, dt, 70 * k, 0.7); spring(B.sq, dt, 180 * k, 0.45); spring(B.tilt, dt, 90 * k, 0.55);
    spring(B.scale, dt, 80 * k, 0.8); spring(B.pupil, dt, 110 * k, 0.8); spring(B.glow, dt, 50 * k, 1); spring(B.lid, dt, 90 * k, 1); spring(B.look, dt, 40 * k, 1);
    const g = 1 - Math.exp(-dt * (slow ? 7 : 12));
    B.gx += (B.tgx - B.gx) * g; B.gy += (B.tgy - B.gy) * g;
    B.breath = Math.sin((ms() / B.breathPeriod) * TAU);
  }
  function bodyPose(B) {
    const br = B.breath * B.breathAmp;
    return { k: 0, look: clamp(B.look.v), gaze: { x: clamp(B.gx, -1, 1), y: clamp(B.gy, -1, 1) }, neutral: 0, hush: 1, open: 0, lens: 0, grow: 0, size: 0, pupil: 0, iris: 0,
      pupilK: clamp(B.pupil.v, 0.45, 1.9), glow: clamp(B.glow.v, 0.3, 1.8), bodySx: clamp(1 - B.sq.v * 0.55 - br * 0.4, 0.6, 1.4), bodySy: clamp(1 + B.sq.v + br, 0.6, 1.5),
      lid: clamp(B.lid.v, 0, 0.96) || 0, dx: B.dx.v, dy: B.dy.v, tilt: B.tilt.v, scale: clamp(B.scale.v, 0.3, 1.6) };
  }
  // where the Eye's body sits when it isn't moved (screen px), and its live centre
  const homePt = (g) => ({ x: g.w * 0.5, y: g.h * 0.49 });
  const eyeAt = (g) => ({ x: g.cx, y: g.cy, r: g.size });
  function gazeAt(B, g, x, y, amount = 1) {
    const reach = Math.max(120, g.size * 2.4);
    B.tgx = clamp((x - g.cx) / reach, -1, 1); B.tgy = clamp((y - g.cy) / reach, -1, 1);
    B.look.to = amount;
  }

  // ---------- small helpers shared by activities ----------
  function host() { return S && S.api ? S.api.host() : null; }
  function core() { const h = host(); return h && h.core; }
  function react(name, important) { const h = host(), c = h && h.core; if (!c || !c.react) return; try { c.react(name, h.now(), !!important); } catch (e) {} }
  function blink() { const h = host(), c = h && h.core; if (!c) return; try { if (c.startBlink) c.startBlink(h.now()); } catch (e) {} }
  function holdBlinks(msFor) { const c = core(); if (c && c.blink) c.blink.next = Math.max(c.blink.next || 0, (host().now()) + msFor); }
  const speedK = () => (S && S.gentle ? 1.35 : 1);          // Gentle: everything a third slower
  const ampK = () => (S && S.gentle ? 0.6 : 1);             // and smaller
  function later(fn, d) { if (!S) return 0; const sess = S; const id = setTimeout(() => { if (S === sess) { sess.timers.delete(id); try { fn(); } catch (e) { console.error(e); } } }, d); sess.timers.add(id); return id; }
  function line(text, dur = 3600) {
    if (!S || !S.lineEl) return;
    const el = S.lineEl;
    el.textContent = text; el.classList.add('show');
    clearTimeout(S.lineT);
    S.lineT = setTimeout(() => { if (el) el.classList.remove('show'); }, dur);
  }
  const insets = (g) => g.insets || { top: 0, bottom: 0, left: 0, right: 0 };
  function arena(g) {
    const i = insets(g);
    return { l: (i.left || 0) + 14, r: g.w - (i.right || 0) - 14, t: (i.top || 0) + 70, b: g.h - (i.bottom || 0) - 34 };
  }
  function glow(c, x, y, r, col, a) {
    if (a <= 0.003 || r <= 0) return;
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
    c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  // a tease when the Eye itself is tapped (any activity that doesn't use the Eye as a target)
  function tease(T) {
    const B = S.B;
    if (T.grump > 0.62) { B.lid.to = 0.3; later(() => { B.lid.to = S.baseLid || 0; }, 900); }
    else if (T.shyness > 0.62) { B.tgx = -0.7; B.tgy = 0.4; B.look.to = 1; B.sq.vel -= 1.2; }
    else if (T.drama > 0.62) { B.tilt.vel += 5 * (Math.random() < 0.5 ? -1 : 1); B.sq.vel += 2.5; }
    else { B.sq.vel -= 2; blink(); }
    react('touch');
  }

  // =====================================================================================================
  // Firefly
  // =====================================================================================================
  function Firefly() {
    let fly = null, st = 'watch', stAt = 0, nextTry = 0, lunge = null, finger = null, lastStartle = 0, sparks = [], misses = 0, catches = 0;
    const T = temper();
    function newFly(g, x, y) {
      const base = eyeColour(), warm = [255, 238, 168];
      const col = [mix(base[0], warm[0], 0.55), mix(base[1], warm[1], 0.55), mix(base[2], warm[2], 0.55)];
      return { x, y, vx: rnd(-30, 30), vy: rnd(-40, 0), ph: rnd(0, TAU), f1: rnd(0.3, 0.7), f2: rnd(0.2, 0.5), col, a: 0, r: rnd(2.8, 3.6), blinkAt: ms() + rnd(1000, 4000), blink: 0, inside: false };
    }
    return {
      enter(g) {
        const e = eyeAt(g);
        fly = newFly(g, clamp(e.x + g.size * 1.6, 30, g.w - 30), Math.max(arena(g).t + 20, e.y - g.size * 1.9));
        st = 'watch'; nextTry = ms() + 2600; finger = null;
        line('Guide the firefly. ' + eyeName() + ' can’t help itself.');
      },
      down(p) { finger = { x: p.x, y: p.y, vx: 0, vy: 0, t: ms(), down: true }; if (Math.hypot(p.x - S.g.cx, p.y - S.g.cy) < S.g.size * 0.9 && fly.inside) { release('poke'); } },
      move(p) {
        if (!finger || !finger.down) return;
        const t = ms(), dt = Math.max(8, t - finger.t) / 1000;
        const vx = (p.x - finger.x) / dt, vy = (p.y - finger.y) / dt;
        finger.vx = mix(finger.vx, vx, 0.5); finger.vy = mix(finger.vy, vy, 0.5);
        finger.x = p.x; finger.y = p.y; finger.t = t;
        const sp = Math.hypot(finger.vx, finger.vy);
        if (sp > 2300 && t - lastStartle > 1800 && st === 'watch') startle(p);
      },
      up() { if (finger) finger.down = false; },
      step(dt, g) {
        const B = S.B, t = ms(), A = arena(g), e = eyeAt(g), sz = g.size, sp = 1 / speedK();
        // ----- the firefly (Hangout's wander forces, plus your finger) -----
        if (fly && !fly.inside) {
          const ts = t / 1000;
          const ax = Math.sin(ts * fly.f1 + fly.ph) * 26 + Math.sin(ts * fly.f2 * 1.7 + fly.ph * 2) * 14;
          const ay = Math.cos(ts * fly.f2 + fly.ph * 1.3) * 22 + Math.sin(ts * fly.f1 * 1.3) * 10;
          if (finger && finger.down) {
            // it follows your finger, a little lazily, never quite on it
            const tx = finger.x + Math.sin(ts * 2.3 + fly.ph) * 14, ty = finger.y - 26 + Math.cos(ts * 1.9) * 10;
            fly.vx += ((tx - fly.x) * 9 + ax) * dt; fly.vy += ((ty - fly.y) * 9 + ay) * dt;
            fly.vx *= 1 - dt * 3.2; fly.vy *= 1 - dt * 3.2;
          } else {
            const cx = g.w / 2, cy = mix(A.t, e.y, 0.45);
            fly.vx += (ax + (cx - fly.x) * 0.18) * dt; fly.vy += (ay + (cy - fly.y) * 0.2) * dt;
            fly.vx *= 1 - dt * 0.9; fly.vy *= 1 - dt * 0.9;
          }
          fly.x += fly.vx * dt * sp; fly.y += fly.vy * dt * sp;
          fly.x = clamp(fly.x, A.l, A.r); fly.y = clamp(fly.y, A.t - 40, A.b);
          fly.a = Math.min(1, fly.a + dt * 1.2);
          if (t > fly.blinkAt) { fly.blink = t; fly.blinkAt = t + rnd(1500, 6000); }
        }
        // ----- the Eye -----
        const lead = (0.12 + 0.28 * T.curiosity) * (st === 'crouch' ? 1.6 : 1);
        const px = fly ? fly.x + fly.vx * lead : e.x, py = fly ? fly.y + fly.vy * lead : e.y;
        const H = homePt(g);
        if (st === 'watch') {
          if (fly && !fly.inside) {
            gazeAt(B, g, px, py, 1);
            const k = (0.08 + 0.1 * T.curiosity) * ampK();
            B.dx.to = clamp((px - H.x) * k, -sz * 0.35, sz * 0.35); B.dy.to = clamp((py - H.y) * k * 0.8, -sz * 0.3, sz * 0.25);
            B.pupil.to = 1 + 0.2 * clamp(1 - Math.hypot(fly.x - e.x, fly.y - e.y) / (sz * 4));
            B.tilt.to = clamp((px - e.x) / (sz * 8), -0.08, 0.08);
          }
          const d = fly ? Math.hypot(fly.x - e.x, fly.y - e.y) : 1e9, fsp = fly ? Math.hypot(fly.vx, fly.vy) : 0;
          if (fly && !fly.inside && t > nextTry && d < sz * 2.5 && fsp < 900) {
            nextTry = t + 380;
            if (Math.random() < 0.22 + 0.5 * T.energy) { st = 'crouch'; stAt = t; }
          }
        } else if (st === 'crouch') {
          // the wind-up: it gets small and still, pupil wide, eyes locked
          gazeAt(B, g, px, py, 1); B.sq.to = -0.13 * ampK(); B.pupil.to = 1.4; holdBlinks(600);
          if (!(finger && finger.down) && fly && Math.random() < dt * 1.1 * (1 - T.energy * 0.5)) { fly.vx += rnd(-1, 1) * 260; fly.vy -= rnd(80, 200); }   // it noticed
          if (t - stAt > 240 * speedK()) {
            st = 'lunge'; stAt = t;
            const reach = sz * 0.95 * ampK();
            const vx = px - e.x, vy = py - e.y, vd = Math.hypot(vx, vy) || 1, k = Math.min(1, reach / vd);
            lunge = { dx: B.dx.v + vx * k, dy: B.dy.v + vy * k };
            B.dx.to = lunge.dx; B.dy.to = lunge.dy; B.dx.vel += vx * k * 6; B.dy.vel += vy * k * 6; B.sq.to = 0.16 * ampK(); B.sq.vel += 3;
          }
        } else if (st === 'lunge') {
          if (t - stAt > 180 * speedK()) {
            const d = fly ? Math.hypot(fly.x - e.x, fly.y - e.y) : 1e9;
            if (fly && !fly.inside && d < sz * 0.8) caught(g); else missed(g);
          }
        } else if (st === 'caught') {
          if (fly) { fly.x = e.x; fly.y = e.y; }
          if (t - stAt > rnd(1300, 2200) * speedK() || (finger && finger.down && t - stAt > 700)) release('time');
        } else if (st === 'recover') {
          if (t - stAt > 700 * speedK()) { st = 'watch'; B.lid.to = 0; B.sq.to = 0; B.tilt.to = 0; }
        }
        for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 90 * dt; }
        sparks = sparks.filter((s) => t - s.t0 < s.d);
      },
      paint(c, g) {
        const t = ms();
        c.save(); c.globalCompositeOperation = 'lighter';
        if (fly && !fly.inside && fly.a > 0.01) {
          const bk = fly.blink ? clamp((t - fly.blink) / 220) : 1, lid = bk < 1 ? Math.sin(Math.PI * bk) : 0;
          const tw = 0.75 + 0.25 * Math.sin(t / 333 + fly.ph), a = fly.a * tw * (1 - 0.85 * lid);
          glow(c, fly.x, fly.y, fly.r * 5.5, fly.col, 0.34 * a);
          c.fillStyle = rgba(fly.col.map((v) => mix(v, 255, 0.5)), 0.95 * a);
          c.beginPath(); c.ellipse(fly.x, fly.y, fly.r * 1.25, Math.max(0.3, fly.r * 0.62 * (1 - lid)), Math.sin(t / 1400 + fly.ph) * 0.4, 0, TAU); c.fill();
        }
        if (fly && fly.inside) glow(c, g.cx, g.cy, g.size * 0.5, fly.col, 0.12 + 0.06 * Math.sin(t / 160));
        for (const s of sparks) { const k = (t - s.t0) / s.d; glow(c, s.x, s.y, 2.6, s.col, 0.7 * Math.sin(Math.PI * clamp(k))); }
        c.restore();
      },
      moving() { return st !== 'watch' || (fly && (Math.hypot(fly.vx, fly.vy) > 6)) || sparks.length > 0; },
      tapEye() { if (fly && fly.inside) release('poke'); else tease(T); },
      eyeIsTarget: false
    };
    function startle(p) {
      const B = S.B, g = S.g; lastStartle = ms();
      B.pupil.to = 0.72; B.sq.vel -= 2.4; B.dx.vel += Math.sign(g.cx - p.x || 1) * 160 * ampK();
      if (T.shyness > 0.55) { B.lid.to = 0.12; }
      react('startle');
      later(() => { if (S) { S.B.pupil.to = 1; S.B.lid.to = 0; } }, 600);
    }
    function caught(g) {
      const B = S.B; st = 'caught'; stAt = ms(); catches++;
      fly.inside = true; lunge = null;
      B.dx.to = 0; B.dy.to = 0; B.sq.to = 0; B.sq.vel -= 2;
      B.pupil.to = 0.7; later(() => { if (S) { S.B.pupil.to = 1.15; S.B.glow.to = 1.32; S.B.lid.to = 0.16; } }, 160);
      B.tgx = 0; B.tgy = 0;
      if (T.drama > 0.6) { B.tilt.vel += 4; }
      if (T.energy > 0.6) { B.dy.vel -= 300 * ampK(); }
      if (catches === 1) line(T.grump > 0.6 ? 'Caught it. Pretending that was easy.' : T.shyness > 0.6 ? 'It caught it, and seems a little surprised.' : 'Got it.', 2600);
    }
    function release(why) {
      const B = S.B, g = S.g; if (!fly || !fly.inside) return;
      fly.inside = false; fly.x = g.cx; fly.y = g.cy - g.size * 0.2; fly.vx = rnd(-160, 160); fly.vy = -rnd(160, 260); fly.a = 0.6;
      for (let i = 0; i < 8; i++) sparks.push({ x: fly.x, y: fly.y, vx: rnd(-80, 80), vy: rnd(-120, 20), t0: ms(), d: rnd(400, 800), col: fly.col });
      B.glow.to = 1; B.lid.to = 0; B.pupil.to = 1.2; blink();
      if (why === 'poke') react('touch');
      st = 'recover'; stAt = ms(); nextTry = ms() + 1800;
    }
    function missed(g) {
      const B = S.B; st = 'recover'; stAt = ms(); misses++; lunge = null;
      B.dx.to = 0; B.dy.to = 0; B.sq.to = 0;
      if (T.grump > 0.62) { B.lid.to = 0.26; B.glow.to = 0.92; if (misses === 1) line('Missed. It is glaring at the firefly.', 2400); later(() => { if (S) { S.B.lid.to = 0; S.B.glow.to = 1; } }, 1100); }
      else if (T.shyness > 0.62) { B.tgx = -0.6; B.tgy = 0.5; B.look.to = 1; B.lid.to = 0.12; }
      else if (T.drama > 0.62) { B.tilt.vel += 6; B.sq.vel -= 3; if (misses === 1) line('A dramatic miss.', 2000); }
      else blink();
      nextTry = ms() + (T.energy > 0.65 ? 700 : rnd(1600, 3000));
    }
  }

  // =====================================================================================================
  // Catch (Hangout's ball, one Eye and a finger)
  // =====================================================================================================
  function Catch() {
    const T = temper();
    let ball = null, rings = [], sparks = [], grab = null, samples = [], idleSince = 0, nudged = false, juggles = 0, catches = 0, fumbles = 0;
    const R = () => clamp(S.g.size * 0.11, 9, 15);
    const G = () => (S.gentle ? 1100 : 1500);
    const holdPt = (g) => ({ x: g.cx, y: g.cy - (g.ry || g.size) - R() * 1.05 });
    function floorY(g) { return arena(g).b - R(); }
    return {
      enter(g) {
        const hp = holdPt(g);
        ball = { st: 'conjure', x: hp.x, y: hp.y, vx: 0, vy: 0, oy: 0, ov: 0, sc: 0, spin: 0, trail: [], t0: ms(), col: eyeColour().map((v) => mix(v, 255, 0.25)), nextPlay: 0 };
        for (let i = 0; i < 14; i++) { const an = rnd(0, TAU), r = rnd(30, 70); sparks.push({ conv: true, x: hp.x + Math.cos(an) * r, y: hp.y + Math.sin(an) * r, t0: ms() + rnd(0, 400), d: 800, col: ball.col }); }
        S.B.pupil.to = 1.3; gazeAt(S.B, g, hp.x, hp.y - 10, 1);
        line('Toss it back. Flick it toward ' + eyeName() + '.');
      },
      down(p) {
        if (!ball) return;
        const d = Math.hypot(p.x - ball.x, p.y - (ball.y + ball.oy));
        if (['free', 'rest', 'thrown', 'fumble', 'return'].includes(ball.st) && d < Math.max(44, R() * 3.2)) {
          grab = { id: true }; ball.st = 'grab'; ball.px = p.x; ball.py = p.y; samples = [{ x: p.x, y: p.y, t: ms() }];
          S.B.pupil.to = 1.25;
        }
      },
      move(p) {
        if (!grab || !ball || ball.st !== 'grab') return;
        ball.px = p.x; ball.py = p.y;
        samples.push({ x: p.x, y: p.y, t: ms() }); while (samples.length > 2 && ms() - samples[0].t > 90) samples.shift();
      },
      up() {
        if (!grab || !ball || ball.st !== 'grab') { grab = null; return; }
        grab = null;
        const a = samples[0], b = samples[samples.length - 1], dt = Math.max(16, b.t - a.t) / 1000;
        let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
        const sp = Math.hypot(vx, vy), max = 2600;
        if (sp > max) { vx *= max / sp; vy *= max / sp; }
        ball.vx = vx; ball.vy = vy; ball.st = sp > 160 ? 'thrown' : 'free'; ball.t0 = ms(); ball.decided = false; ball.trail = [];
        if (ball.st === 'thrown') { S.B.pupil.to = 1.35; S.B.sq.to = -0.06 * ampK(); }
      },
      step(dt, g) {
        const B = S.B, t = ms(), A = arena(g), e = eyeAt(g), sz = g.size, H = homePt(g);
        if (!ball) return;
        ball.spin += dt * (['thrown', 'free', 'return', 'fumble'].includes(ball.st) ? 9 : 1.6);
        const hp = holdPt(g);
        switch (ball.st) {
          case 'conjure': {
            ball.sc = easeOut((t - ball.t0) / (1100 * speedK())); ball.x = hp.x; ball.y = hp.y;
            gazeAt(B, g, hp.x, hp.y - 10, 1);
            if (ball.sc >= 1) { ball.st = 'held'; ball.nextPlay = t + 700; juggles = Math.round(T.energy * 2.2 + T.drama * 1.2 + rnd(0, 1)); }
            break;
          }
          case 'held': {
            ball.sc = 1;
            ball.ov += 1600 * dt; ball.oy += ball.ov * dt;
            if (ball.oy > 0) { ball.oy = 0; if (ball.ov > 120) { ball.ov = -ball.ov * 0.25; B.sq.vel -= 0.8; } else ball.ov = 0; }
            ball.x = mix(ball.x, hp.x + Math.sin(t / 770) * 3, Math.min(1, dt * 12)); ball.y = mix(ball.y, hp.y + Math.sin(t / 480) * 2, Math.min(1, dt * 12));
            gazeAt(B, g, ball.x, ball.y + ball.oy - 6, 1); B.dx.to = 0; B.dy.to = 0;
            if (t > ball.nextPlay && ball.oy === 0) {
              if (juggles > 0) {
                juggles--;
                // a juggle: a little hop under the ball. Low-energy Eyes sometimes lose it.
                if (Math.random() < 0.06 + (1 - T.energy) * 0.1) { fumble(g, 'juggle'); break; }
                ball.ov = -rnd(330, 470) * ampK(); B.sq.to = 0; B.sq.vel += 3.2; B.dy.vel -= 220 * ampK();
                ball.nextPlay = t + rnd(520, 820) * speedK();
              } else { ball.st = 'windup'; ball.t0 = t; B.sq.to = -0.12 * ampK(); B.pupil.to = 1.25; }
            }
            break;
          }
          case 'windup': {
            ball.x = hp.x; ball.y = hp.y + sz * 0.06;
            if (t - ball.t0 > 420 * speedK()) {
              // throw it back to you: a soft arc into the lower part of the screen
              const tx = g.w * rnd(0.3, 0.7), ty = floorY(g) - rnd(10, 60), tf = 0.85 * speedK();
              ball.vx = (tx - ball.x) / tf; ball.vy = (ty - ball.y - 0.5 * G() * tf * tf) / tf;
              ball.st = 'return'; ball.t0 = t; ball.trail = [];
              B.sq.to = 0; B.sq.vel += 4; B.dy.vel -= 120;
              gazeAt(B, g, tx, ty, 1);
              later(() => { if (S) { S.B.tgx = 0; S.B.tgy = 0.15; } }, 700);   // and looks at you
            }
            break;
          }
          case 'grab': {
            ball.x = mix(ball.x, ball.px, Math.min(1, dt * 18)); ball.y = mix(ball.y, ball.py, Math.min(1, dt * 18)); ball.oy = 0;
            gazeAt(B, g, ball.x, ball.y, 1);
            // it leans toward the ball in your hand; keen Eyes more
            B.dx.to = clamp((ball.x - H.x) * 0.06 * (0.5 + T.energy) * ampK(), -sz * 0.25, sz * 0.25);
            idleSince = t; nudged = false;
            break;
          }
          case 'thrown': case 'free': case 'return': case 'fumble': {
            ball.vy += G() * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
            if (ball.x < A.l + R()) { ball.x = A.l + R(); ball.vx = Math.abs(ball.vx) * 0.7; }
            if (ball.x > A.r - R()) { ball.x = A.r - R(); ball.vx = -Math.abs(ball.vx) * 0.7; }
            if (ball.y < A.t - 50) { ball.y = A.t - 50; ball.vy = Math.abs(ball.vy) * 0.5; }
            const fy = floorY(g);
            if (ball.y > fy) {
              ball.y = fy;
              if (Math.abs(ball.vy) > 170) { ball.vy = -ball.vy * 0.45; ball.vx *= 0.85; }
              else { ball.vy = 0; ball.vx *= 1 - Math.min(1, dt * 3); if (Math.abs(ball.vx) < 8) { ball.vx = 0; if (ball.st !== 'rest') { ball.st = 'rest'; idleSince = t; nudged = false; } } }
            }
            ball.trail.push([ball.x, ball.y]); if (ball.trail.length > 9) ball.trail.shift();
            gazeAt(B, g, ball.x + ball.vx * 0.08, ball.y + ball.vy * 0.08, 1);
            const toward = (e.x - ball.x) * ball.vx + (e.y - ball.y) * ball.vy > 0;
            const d = Math.hypot(ball.x - e.x, ball.y - e.y);
            // anticipation: it shifts toward where the ball is going
            if (ball.st === 'thrown' && toward) {
              const tAhead = clamp(d / Math.max(200, Math.hypot(ball.vx, ball.vy)), 0, 0.5);
              const fx = ball.x + ball.vx * tAhead, fyy = ball.y + ball.vy * tAhead + 0.5 * G() * tAhead * tAhead;
              B.dx.to = clamp((fx - H.x) * 0.5 * ampK(), -sz * 0.6, sz * 0.6); B.dy.to = clamp((fyy - H.y) * 0.35 * ampK(), -sz * 0.5, sz * 0.4);
              B.pupil.to = 1.35; holdBlinks(300);
            } else if (ball.st !== 'fumble') { B.dx.to = 0; B.dy.to = 0; B.pupil.to = 1.05; }
            if ((ball.st === 'thrown' || ball.st === 'free') && !ball.decided && d < sz * 1.15 + R()) {
              ball.decided = true;
              const sp = Math.hypot(ball.vx, ball.vy);
              const p = clamp(0.94 - sp / 4600 - (1 - T.energy) * 0.12 - T.shyness * 0.05 + (S.gentle ? 0.1 : 0), 0.3, 0.96);
              if (Math.random() < p) caught(g); else fumble(g, 'catch');
            }
            break;
          }
          case 'rest': {
            gazeAt(B, g, ball.x, ball.y, 0.9); B.dx.to = 0; B.dy.to = 0;
            const idle = t - idleSince;
            if (idle > 5500 && !nudged) {
              nudged = true;
              // it looks from the ball to you and back: your turn
              B.tgx = 0; B.tgy = 0.2; B.pupil.to = 1.2; B.sq.vel += 1.5;
              later(() => { if (S && ball && ball.st === 'rest') gazeAt(S.B, S.g, ball.x, ball.y, 1); }, 900);
            }
            if (idle > (T.energy > 0.55 ? 11000 : 16000)) {
              // keen Eyes fetch it themselves; it floats back up
              ball.st = 'summon'; ball.t0 = t; ball.sx = ball.x; ball.sy = ball.y; B.pupil.to = 1.4;
            } else if (idle > 9000 && T.energy < 0.4) { B.lid.to = 0.22; }
            break;
          }
          case 'summon': {
            const k = easeOut((t - ball.t0) / (1100 * speedK()));
            ball.x = mix(ball.sx, hp.x, k); ball.y = mix(ball.sy, hp.y, k) - Math.sin(Math.PI * k) * 40;
            gazeAt(B, g, ball.x, ball.y, 1); B.lid.to = 0;
            if (k >= 1) { ball.st = 'held'; ball.nextPlay = t + 900; juggles = Math.round(T.energy * 1.5 + rnd(0, 1)); }
            break;
          }
        }
        rings = rings.filter((r) => t - r.t0 < 700);
        for (const s of sparks) if (!s.conv) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 120 * dt; }
        sparks = sparks.filter((s) => t - s.t0 < s.d);
      },
      paint(c, g) {
        const t = ms();
        c.save(); c.globalCompositeOperation = 'lighter';
        if (ball) {
          const r = R() * (ball.sc == null ? 1 : ball.sc), y = ball.y + (ball.oy || 0);
          if (r > 0.3) {
            for (let i = 0; i < ball.trail.length; i++) { const [x, yy] = ball.trail[i], k = (i + 1) / ball.trail.length; glow(c, x, yy, r * (0.5 + 0.6 * k), ball.col, 0.16 * k); }
            glow(c, ball.x, y, r * 3.4, ball.col, 0.32);
            const gr = c.createRadialGradient(ball.x - r * 0.3, y - r * 0.3, r * 0.1, ball.x, y, r);
            gr.addColorStop(0, 'rgba(255,255,255,0.98)'); gr.addColorStop(0.45, rgba(ball.col.map((v) => mix(v, 255, 0.55)), 0.95)); gr.addColorStop(1, rgba(ball.col, 0.15));
            c.fillStyle = gr; c.beginPath(); c.arc(ball.x, y, r, 0, TAU); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(ball.x + Math.cos(ball.spin) * r * 0.55, y + Math.sin(ball.spin) * r * 0.3, Math.max(0.8, r * 0.14), 0, TAU); c.fill();
          }
        }
        for (const ri of rings) { const k = (t - ri.t0) / 700; c.strokeStyle = rgba(ri.col, 0.45 * (1 - k)); c.lineWidth = 1.5; c.beginPath(); c.arc(ri.x, ri.y, ri.r0 + k * 26, 0, TAU); c.stroke(); }
        for (const s of sparks) {
          const k = (t - s.t0) / s.d; if (k < 0) continue;
          const x = s.conv && ball ? mix(s.x, ball.x, easeOut(k)) : s.x, y = s.conv && ball ? mix(s.y, ball.y, easeOut(k)) : s.y;
          glow(c, x, y, 2.4, s.col, 0.7 * Math.sin(Math.PI * clamp(k)));
        }
        c.restore();
      },
      moving() { return !!ball && ball.st !== 'rest' || rings.length > 0 || sparks.length > 0; },
      _s: () => (ball ? { st: ball.st, x: Math.round(ball.x), y: Math.round(ball.y + (ball.oy || 0)) } : null),
      settled() { return !!ball && ball.st === 'rest' && ms() - idleSince > 6500; },
      tapEye() { tease(T); },
      eyeIsTarget: false
    };
    function caught(g) {
      const B = S.B; catches++;
      ball.st = 'held'; ball.oy = 0; ball.ov = -180; ball.vx = ball.vy = 0; ball.trail = []; ball.nextPlay = ms() + rnd(600, 1100);
      juggles = Math.round(T.energy * 2.4 + T.drama * 1.3 + rnd(-0.5, 1));
      rings.push({ x: ball.x, y: ball.y, t0: ms(), col: ball.col, r0: R() });
      B.dx.to = 0; B.dy.to = 0; B.sq.vel += 2.5; B.pupil.to = 1.3; B.glow.to = 1.18;
      later(() => { if (S) S.B.glow.to = 1; }, 700);
      if (T.energy > 0.6) B.dy.vel -= 260 * ampK();
      if (T.grump > 0.62) { B.lid.to = 0.18; later(() => { if (S) S.B.lid.to = 0; }, 900); }
      if (T.shyness > 0.62) { later(() => { if (S) { S.B.tgx = -0.4; S.B.tgy = 0.35; } }, 250); }
      try { if (navigator.vibrate && !root.EYES_WEB && !S.gentle) navigator.vibrate(8); } catch (e) {}
      if (catches === 1) line(T.drama > 0.6 ? 'What a catch. It thinks so too.' : T.grump > 0.6 ? 'Caught. Unimpressed, officially.' : 'Caught it.', 2400);
    }
    function fumble(g, why) {
      const B = S.B, e = eyeAt(g); fumbles++;
      const nx = (ball.x - e.x) || rnd(-1, 1), ny = (ball.y - e.y) || -1, nd = Math.hypot(nx, ny) || 1;
      ball.st = 'fumble'; ball.t0 = ms(); ball.trail = []; ball.decided = true; ball.oy = 0;
      ball.vx = (nx / nd) * rnd(220, 360) + rnd(-80, 80); ball.vy = Math.min(-200, (ny / nd) * 300 - 260);
      B.tilt.vel += 5 * Math.sign(nx); B.pupil.to = 0.75; B.sq.vel -= 2.5; B.dx.to = 0; B.dy.to = 0;
      later(() => {
        if (!S) return; const b = S.B; b.pupil.to = 1;
        if (T.grump > 0.62) { b.lid.to = 0.28; later(() => { if (S) S.B.lid.to = 0; }, 1100); }
        else if (T.shyness > 0.62) { b.tgx = -0.6; b.tgy = 0.45; b.look.to = 1; }
        else if (T.drama > 0.62) { b.tilt.vel += 5; }
        else blink();
      }, 280);
      if (fumbles === 1) line(T.drama > 0.6 ? 'It meant to do that.' : T.shyness > 0.6 ? 'Oops. It looks embarrassed.' : 'Fumbled it.', 2200);
    }
  }

  // =====================================================================================================
  // Peekaboo
  // =====================================================================================================
  function Peekaboo() {
    const T = temper();
    let ph = 'here', at = 0, until = 0, spot = null, peeks = 0, covered = null, founds = 0, lastSpot = null;
    const spots = ['left', 'right', 'bottom'];
    function pick() {
      // grumpy, lazy Eyes often just make themselves small ("hiding" in plain sight); the rest pick an edge
      if (T.grump > 0.6 && T.energy < 0.5 && Math.random() < 0.55) return 'small';
      const opts = spots.filter((s) => s !== lastSpot);
      return opts[Math.floor(Math.random() * opts.length)];
    }
    function hideTarget(g, s, amount) {
      // amount 0 = home, 1 = hidden with a sliver left on screen; a peek is about 0.72 (half of it showing)
      const H = homePt(g), sz = g.size, sliver = T.shyness > 0.6 ? 0.12 : 0.24, a = clamp(amount);
      if (s === 'left') return { dx: mix(H.x, sz * (sliver - 1), a) - H.x, dy: 0, tilt: 0.22 * a };
      if (s === 'right') return { dx: mix(H.x, g.w + sz * (1 - sliver), a) - H.x, dy: 0, tilt: -0.22 * a };
      if (s === 'bottom') return { dx: 0, dy: mix(H.y, g.h + sz * (1 - sliver), a) - H.y, tilt: 0 };
      return { dx: 0, dy: 0, tilt: 0 };
    }
    function go(next, d) { ph = next; at = ms(); until = at + (d || 0) * speedK(); }
    function place(B, g, s, amount) {
      const h = hideTarget(g, s, amount); B.dx.to = h.dx; B.dy.to = h.dy; B.tilt.to = h.tilt;
    }
    function startHide(g) {
      spot = pick(); lastSpot = spot; peeks = 0;
      const B = S.B; B.pupil.to = 1.2; B.sq.vel -= 1.5;
      // it glances toward where it's about to hide (shy ones don't give it away)
      if (T.shyness < 0.6) { const hp = spot === 'left' ? [0, g.h / 2] : spot === 'right' ? [g.w, g.h / 2] : [g.w / 2, g.h]; gazeAt(B, g, hp[0], hp[1], 1); }
      go('hiding', 700 + (1 - T.energy) * 500);
    }
    function found(g) {
      const B = S.B; founds++;
      go('found', 1700);
      B.pupil.to = 0.7; B.sq.vel -= 3; holdBlinks(200);
      react('startle');
      later(() => {
        if (!S) return; const b = S.B;
        place(b, S.g, spot, 0); b.scale.to = 1; b.glow.to = 1.25; b.lid.to = 0; b.tgx = 0; b.tgy = 0.1; b.look.to = 1;
        if (T.shyness > 0.62) { b.lid.to = 0.15; b.tgx = -0.45; b.tgy = 0.4; }
        else if (T.grump > 0.62) { b.lid.to = 0.25; }
        else { b.pupil.to = 1.3; b.dy.vel -= 260 * ampK(); b.sq.vel += 3; }
        later(() => { if (S) S.B.glow.to = 1; }, 900);
      }, 260);
      if (founds === 1) line(T.shyness > 0.62 ? 'Found. It’s a bit flustered.' : T.grump > 0.62 ? 'Found. It insists it wasn’t really hiding.' : 'Found it!', 2400);
    }
    return {
      enter(g) { go('here', 1600); S.B.tgx = 0; S.B.tgy = 0.1; S.B.look.to = 1; line('It’s going to hide. Find it, or cover its eye to hide from it.', 4200); },
      down(p) {
        const g = S.g, e = eyeAt(g);
        // the visible part of the Eye counts (it may be mostly off screen)
        const vx = clamp(e.x, 0, g.w), vy = clamp(e.y, 0, g.h);
        const onEye = Math.hypot(p.x - vx, p.y - vy) < Math.max(56, g.size * 1.05);
        if (ph === 'here' && onEye) { covered = { at: ms(), p }; return; }
        if ((ph === 'hidden' || ph === 'peek' || ph === 'hiding') && onEye) { found(g); return; }
        if (ph === 'hidden' && T.curiosity > 0.5) { gazeAt(S.B, g, p.x, p.y, 0.7); }   // it can't resist checking what that was
      },
      move(p) { if (covered) covered.p = p; },
      up() {
        if (covered && ph === 'youHide') {
          // there you are!
          const B = S.B; go('reveal', 1500);
          B.pupil.to = 1.4; B.glow.to = 1.3; B.sq.vel += 4; B.dy.vel -= 300 * ampK(); B.tgx = 0; B.tgy = 0.15; B.lid.to = 0;
          react('greet-big');
          if (T.drama > 0.6) B.tilt.vel += 5;
          later(() => { if (S) S.B.glow.to = 1; }, 1000);
        }
        covered = null;
      },
      step(dt, g) {
        const B = S.B, t = ms();
        if (covered && ph === 'here' && t - covered.at > 420) { go('youHide'); line('It can’t see you…', 2000); }
        switch (ph) {
          case 'here': {
            place(B, g, spot || 'left', 0); B.scale.to = 1; B.lid.to = 0; B.glow.to = 1;
            if (t > until && !covered) startHide(g);
            break;
          }
          case 'youHide': {
            // you're "hidden" behind your finger: it searches around, a little worried, then a little curious
            if (t > until) { until = t + rnd(500, 1100); gazeAt(B, g, rnd(0.1, 0.9) * g.w, rnd(0.2, 0.8) * g.h, 1); B.pupil.to = rnd(1.1, 1.4); if (T.shyness > 0.6) B.sq.to = -0.05; }
            break;
          }
          case 'reveal': { B.sq.to = 0; if (t > until) go('here', rnd(1800, 3000)); break; }
          case 'hiding': {
            if (spot === 'small') { B.scale.to = 0.62; B.lid.to = 0.6; B.glow.to = 0.65; B.tgx = 0.6; B.tgy = 0.4; }
            else { place(B, g, spot, 1); B.scale.to = 0.92; }
            if (t > until) go('hidden', rnd(2600, 5200) * (1.4 - T.curiosity * 0.7));
            break;
          }
          case 'hidden': {
            if (spot !== 'small') { place(B, g, spot, 1); B.look.to = 0.6; B.tgx = spot === 'left' ? 0.8 : spot === 'right' ? -0.8 : 0; B.tgy = spot === 'bottom' ? -0.8 : 0; }
            if (Math.random() < dt * 0.4) B.tilt.vel += rnd(-0.6, 0.6);                // a tiny twitch, it can't stay perfectly still
            if (t > until) {
              const surprise = peeks >= 1 && Math.random() < 0.3 + T.drama * 0.5;
              if (surprise || peeks >= 3) {
                // BOO: it pops out, big and bright
                go('surprise', 1500);
                place(B, g, spot === 'small' ? 'left' : spot, 0);
                B.scale.to = 1 + 0.22 * ampK() * (0.6 + T.drama); B.glow.to = 1.45; B.pupil.to = 1.5; B.lid.to = 0; B.tgx = 0; B.tgy = 0.1; B.look.to = 1; B.sq.vel += 5;
                react('greet-big', true);
              } else { peeks++; go('peek', rnd(900, 1500) * (T.shyness > 0.6 ? 0.7 : 1)); }
            }
            break;
          }
          case 'peek': {
            // it eases in, looks right at you, and ducks back out
            if (spot === 'small') { B.scale.to = 0.78; B.lid.to = 0.3; B.tgx = 0; B.tgy = 0.15; }
            else { place(B, g, spot, 0.72); B.tgx = 0; B.tgy = 0.12; B.look.to = 1; B.pupil.to = 1.25; }
            if (t > until) { go('hidden', rnd(1800, 4200) * (1.3 - T.curiosity * 0.6)); if (T.energy > 0.7 && spot !== 'small' && Math.random() < 0.35) { spot = pick(); lastSpot = spot; } }
            break;
          }
          case 'surprise': { if (t > until) { B.scale.to = 1; B.glow.to = 1; B.pupil.to = 1; go('here', rnd(2500, 4000)); } break; }
          case 'found': { if (t > until) { B.lid.to = 0; B.scale.to = 1; go('here', rnd(2200, 3800)); } break; }
        }
      },
      paint() {},
      moving() { return ph !== 'here' && ph !== 'hidden' && ph !== 'youHide'; },
      _s: () => ph,
      eyeIsTarget: true
    };
  }

  // =====================================================================================================
  // Company (Hangout's company, for one Eye and you)
  // =====================================================================================================
  function Company() {
    const T = temper();
    const sleepy = clamp(1 - T.energy * 0.8 - T.curiosity * 0.2);
    let next = 0, lastTouch = 0, doze = false, stroke = null, motes = [], lastPet = 0, hold = null, settledSince = 0;
    const baseLid = 0.05 + 0.12 * sleepy;
    function wake() { if (!doze) return; doze = false; const B = S.B; B.lid.to = baseLid; B.breathPeriod = 5200; B.breathAmp = 0.014; react('stir'); }
    return {
      enter(g) {
        const B = S.B; S.baseLid = baseLid; B.lid.to = baseLid; B.breathAmp = 0.014; B.breathPeriod = 5200; B.tgx = 0; B.tgy = 0.1; B.look.to = 0.6;
        next = ms() + 2500; lastTouch = ms(); settledSince = ms();
        line('Nothing to do. Just keep each other company.', 4200);
      },
      down(p) {
        lastTouch = ms(); wake();
        const g = S.g;
        stroke = { x: p.x, y: p.y, t: ms(), dist: 0, onEye: Math.hypot(p.x - g.cx, p.y - g.cy) < g.size * 1.5, at: ms() };
        hold = { x: p.x, y: p.y, at: ms() };
      },
      move(p) {
        if (!stroke) return;
        const t = ms(), d = Math.hypot(p.x - stroke.x, p.y - stroke.y), dt = Math.max(8, t - stroke.t) / 1000, sp = d / dt;
        stroke.dist += d; stroke.x = p.x; stroke.y = p.y; stroke.t = t; lastTouch = t;
        if (hold && Math.hypot(p.x - hold.x, p.y - hold.y) > 18) hold = { x: p.x, y: p.y, at: t };
        const g = S.g, B = S.B, near = Math.hypot(p.x - g.cx, p.y - g.cy) < g.size * 1.7;
        if (near && sp > 60 && sp < 1100 && stroke.dist > 40) {
          // soothed: it leans into your finger and its lids get heavy, happily
          B.lid.to = 0.38; B.glow.to = 1.16; B.pupil.to = 1.1;
          B.dx.to = clamp((p.x - g.cx) * 0.18, -g.size * 0.18, g.size * 0.18) * ampK(); B.dy.to = clamp((p.y - g.cy) * 0.12, -g.size * 0.12, g.size * 0.12) * ampK();
          B.tilt.to = clamp((p.x - g.cx) / (g.size * 10), -0.08, 0.08);
          if (t - lastPet > 3200) { lastPet = t; react('pet'); }
        } else if (sp > 2400) { B.pupil.to = 0.8; B.sq.vel -= 1.5; }
      },
      up() {
        const s = stroke; stroke = null; hold = null;
        const B = S.B;
        if (s && s.onEye && s.dist < 14 && ms() - s.at < 280) tease(T);     // a poke
        later(() => { if (S && !stroke) { B.lid.to = baseLid; B.glow.to = 1; B.pupil.to = 1; B.dx.to = 0; B.dy.to = 0; B.tilt.to = 0; } }, 900);
      },
      step(dt, g) {
        const B = S.B, t = ms();
        if (hold && stroke && t - hold.at > 650) {
          // a finger resting nearby: it looks at it and nuzzles toward it
          gazeAt(B, g, hold.x, hold.y, 0.9);
          B.dx.to = clamp((hold.x - g.cx) * 0.1, -g.size * 0.14, g.size * 0.14) * ampK(); B.dy.to = clamp((hold.y - g.cy) * 0.08, -g.size * 0.1, g.size * 0.1) * ampK();
        }
        if (!stroke && !doze && t - lastTouch > 45000 * (S.gentle ? 0.8 : 1) * (1.2 - sleepy * 0.6)) {
          doze = true; B.lid.to = 0.72 + 0.15 * sleepy; B.breathPeriod = 7000; B.breathAmp = 0.02; B.look.to = 0.3; B.tgx = 0; B.tgy = 0.3;
        }
        if (doze) { if (Math.random() < dt * 0.05) { B.lid.to = 0.5; later(() => { if (S && doze) S.B.lid.to = 0.72 + 0.15 * sleepy; }, 1400); } }
        else if (!stroke && t > next) {
          // something small, then a long, comfortable nothing
          const r = Math.random(), quietK = (1 + Math.min(2, (t - settledSince) / 60000)) * speedK();
          next = t + rnd(3500, 10000) * quietK;
          B.dx.to = 0; B.dy.to = 0; B.tilt.to = 0;
          if (r < 0.32) gazeAt(B, g, rnd(0.15, 0.85) * g.w, rnd(0.2, 0.85) * g.h, rnd(0.5, 0.9));     // a glance somewhere
          else if (r < 0.5) { B.tgx = 0; B.tgy = 0.12; B.look.to = 0.9; }                           // at you
          else if (r < 0.64) { B.dx.to = rnd(-1, 1) * g.size * 0.12 * ampK(); B.tilt.to = rnd(-0.06, 0.06); }   // a lean
          else if (r < 0.76) { B.lid.to = 0.92; later(() => { if (S && !doze) S.B.lid.to = baseLid; }, 520 * speedK()); }   // a slow blink
          else if (r < 0.84 && T.energy > 0.35) { B.sq.to = 0.07 * ampK(); later(() => { if (S) S.B.sq.to = 0; }, 900); } // a stretch
          else { B.look.to = 0.35; }                                                                   // nothing at all
        }
        // a few dust motes drifting very slowly: the room is alive even when nothing happens
        if (motes.length < 3 && Math.random() < dt * 0.08) motes.push({ x: rnd(0.1, 0.9) * g.w, y: g.h * rnd(0.55, 0.9), vx: rnd(-6, 6), vy: -rnd(4, 9), t0: t, d: rnd(9000, 16000), col: eyeColour() });
        for (const m of motes) { m.x += m.vx * dt; m.y += m.vy * dt; }
        motes = motes.filter((m) => t - m.t0 < m.d);
      },
      paint(c) {
        const t = ms();
        c.save(); c.globalCompositeOperation = 'lighter';
        for (const m of motes) { const k = (t - m.t0) / m.d; glow(c, m.x, m.y, 3.2, m.col, 0.18 * Math.sin(Math.PI * clamp(k))); }
        c.restore();
      },
      moving() { return !!stroke; },
      settled() { return !stroke && (doze || ms() > next - 3000 ? true : false); },
      dozing: () => doze,
      eyeIsTarget: true
    };
  }

  // =====================================================================================================
  // the Play session: picker, overlay, input, lifecycle
  // =====================================================================================================
  function playAvailable() { try { return !!(root.HavenDNA && HavenDNA.has()); } catch (e) { return false; } }
  function playActivate(api, opts) {
    const h = api.host();
    if (S) teardown('restart');
    S = { api, B: makeBody(), act: null, actId: null, timers: new Set(), at: ms(), lastT: ms(), g: null, closing: 0, gentle: !!(h && h.gentle()), motion: !!(h && h.motion()), pointer: null, el: null, lineEl: null, from: (opts && opts.launched) ? 'launch' : 'wheel' };
    buildOverlay();
    showPicker(true);
    // it perks up: a little hop of interest, pupil wide, looking at the choices
    const B = S.B; B.pupil.to = 1.18; B.glow.to = 1.08; B.sq.vel += 2.2 * ampK(); B.tgx = 0; B.tgy = 0.55; B.look.to = 0.9;
    react('anticipate');
    api.redraw();
  }
  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'eyesPlaytime';
    el.className = 'pt' + (S.gentle ? ' pt-gentle' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Play');
    el.innerHTML = `<div class="pt-top"><button type="button" class="pt-icon pt-back" aria-label="Back to Play" hidden><span aria-hidden="true">‹</span></button>
        <p class="pt-title" aria-hidden="true"></p>
        <button type="button" class="pt-icon pt-close" aria-label="Close Play"><span aria-hidden="true">×</span></button></div>
      <p class="pt-line" role="status" aria-live="polite"></p>
      <div class="pt-pick" role="menu" aria-label="Play with your Eye"></div>`;
    document.body.appendChild(el);
    S.el = el; S.lineEl = el.querySelector('.pt-line');
    el.querySelector('.pt-close').addEventListener('click', (e) => { e.stopPropagation(); beginClose('button'); });
    el.querySelector('.pt-back').addEventListener('click', (e) => { e.stopPropagation(); backToPicker(); });
    // input for the activities: one pointer at a time, always released
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    for (const ty of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ty, onUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // keep Play's touches to itself: the home screen's document-level swipe handlers (swipe up = app drawer,
    // down from the top = inbox, the iris drag) must never see them. Capture-phase trackers still do.
    for (const ty of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'click']) el.addEventListener(ty, (e) => e.stopPropagation());
    requestAnimationFrame(() => { if (S && S.el === el) el.classList.add('pt-in'); });
  }
  function showPicker(first) {
    if (!S || !S.el) return;
    const pick = S.el.querySelector('.pt-pick');
    S.el.querySelector('.pt-back').hidden = true;
    S.el.querySelector('.pt-title').textContent = '';
    S.el.dataset.mode = 'pick';
    if (!S.motion) {
      pick.innerHTML = '<p class="pt-note">Play needs motion to come alive. You can turn Motion on in The Optic.</p>';
      return;
    }
    pick.innerHTML = ACTS.map((a, i) => `<button type="button" class="pt-chip" role="menuitem" data-act="${a.id}"><b>${a.title}</b><span>${a.sub}</span></button>`).join('') +
      '<button type="button" class="pt-chip pt-surprise" role="menuitem" data-act="surprise"><b>Surprise me</b><span>Let your Eye choose.</span></button>';
    pick.querySelectorAll('.pt-chip').forEach((b, i) => {
      b.style.setProperty('--i', String(i));     // set through the CSSOM: the page's CSP forbids inline style attributes
      b.addEventListener('click', (e) => { e.stopPropagation(); if (b.dataset.act === 'surprise') surprise(); else { cancelSurprise(); choose(b.dataset.act); } });
      b.addEventListener('pointerenter', () => { if (S && S.g) { const r = b.getBoundingClientRect(); gazeAt(S.B, S.g, r.left + r.width / 2, r.top + r.height / 2, 1); } });
      b.addEventListener('focus', () => { if (S && S.g) { const r = b.getBoundingClientRect(); gazeAt(S.B, S.g, r.left + r.width / 2, r.top + r.height / 2, 1); } });
    });
    pick.hidden = false;
    fitPicker();
    if (S.api.keyboard && S.api.keyboard()) setTimeout(() => { const f = pick.querySelector('.pt-chip'); if (f) f.focus({ preventScroll: true }); }, 60);
  }
  // 5.0: the choices must never cover the Eye. If they would (short or narrow screens, large text), they go
  // compact: no descriptions, three rows of two, Surprise me in the last cell.
  function fitPicker() {
    if (!S || !S.el) return;
    const pick = S.el.querySelector('.pt-pick');
    if (!pick || pick.hidden) return;
    S.el.classList.remove('pt-compact');
    const g = S.g, cx = g ? g.cx : innerWidth / 2, cy = g ? g.cy : innerHeight * 0.49, size = g ? g.size : Math.min(innerWidth * 0.235, 101, innerHeight * 0.125);
    const r = pick.getBoundingClientRect(), reach = size * 1.15 + 8;
    const covers = (rr) => rr.top < cy + reach && rr.bottom > cy - reach && rr.left < cx + reach && rr.right > cx - reach;
    if (covers(r)) S.el.classList.add('pt-compact');
  }
  function choose(id, via) {
    if (!S || S.closing || !S.motion) return;
    if (S.surprise && via !== 'surprise') cancelSurprise();
    if (ACTS.some((a) => a.id === id)) rememberAct(id);
    if (id === 'stare') return startStare();
    const make = { firefly: Firefly, catch: Catch, peekaboo: Peekaboo, company: Company }[id];
    if (!make) return;
    if (S.api.state() === 'PLAY_PICK' && !S.api.go('PLAY_ACTIVE', id)) return;
    resetBody();
    S.actId = id; S.act = make(); S.actAt = ms();
    S.el.dataset.mode = id;
    S.el.querySelector('.pt-pick').hidden = true;
    S.el.querySelector('.pt-back').hidden = false;
    S.el.querySelector('.pt-title').textContent = (ACTS.find((a) => a.id === id) || {}).title || '';
    if (S.g) { try { S.act.enter(S.g); } catch (e) { console.error(e); backToPicker(); return; } }
    else S.pendingEnter = true;
    S.api.redraw();
  }
  function resetBody() {
    const B = S.B;
    for (const k of ['dx', 'dy', 'sq', 'tilt', 'lid']) B[k].to = 0;
    B.scale.to = 1; B.pupil.to = 1; B.glow.to = 1; B.breathAmp = 0.008; B.breathPeriod = 4200; S.baseLid = 0;
  }
  function settleTime() {   // 5.0: how long each activity was really played this session
    if (!S || !S.actId || !S.actAt) return;
    S.played = S.played || {};
    S.played[S.actId] = (S.played[S.actId] || 0) + (ms() - S.actAt);
    S.actAt = 0;
  }
  function backToPicker() {
    if (!S || !S.act) return false;
    endPointer();
    settleTime();
    S.act = null; S.actId = null; S.pendingEnter = false;
    S.api.go('PLAY_PICK', 'back');
    resetBody();
    const B = S.B; B.tgx = 0; B.tgy = 0.55; B.look.to = 0.9; B.pupil.to = 1.12;
    if (S.lineEl) S.lineEl.classList.remove('show');
    S.el.querySelector('.pt-pick').hidden = false;
    showPicker(false);
    S.api.redraw();
    return true;
  }
  function startStare() {
    // the existing contest (eyes-play.js) runs on the home screen as before; Play steps aside for it
    const p = root.Haven && Haven.debug && Haven.debug.play ? Haven.debug.play() : null;
    if (!p || !p.startStare) return;
    const api = S.api;
    teardown('stare');
    api.done('stare');
    try { p.startStare(); } catch (e) { console.error(e); }
  }
  // ---------- input ----------
  const pt = (e) => ({ x: e.clientX, y: e.clientY });
  function onDown(e) {
    if (!S || !S.act || S.closing) return;
    if (e.target.closest && e.target.closest('button')) return;
    if (S.pointer != null) return;                 // one finger plays; a second is ignored
    S.pointer = e.pointerId;
    try { S.el.setPointerCapture(e.pointerId); } catch (er) {}
    e.preventDefault();
    const p = pt(e);
    // a tap on the Eye itself (activities that don't use the Eye as their target tease it)
    S.downAt = { x: p.x, y: p.y, t: ms() };
    try { S.act.down && S.act.down(p); } catch (er) { console.error(er); }
    S.api.redraw();
  }
  function onMove(e) {
    if (!S || !S.act || e.pointerId !== S.pointer) return;
    try { S.act.move && S.act.move(pt(e)); } catch (er) { console.error(er); }
  }
  function onUp(e) {
    if (!S || e.pointerId !== S.pointer) return;
    endPointer(e);
  }
  function endPointer(e) {
    if (!S || S.pointer == null) return;
    const id = S.pointer; S.pointer = null;
    try { if (S.el && S.el.hasPointerCapture && S.el.hasPointerCapture(id)) S.el.releasePointerCapture(id); } catch (er) {}
    const d = S.downAt;
    if (S.act && e && d && S.g && !S.act.eyeIsTarget && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 12 && ms() - d.t < 300 &&
        Math.hypot(e.clientX - S.g.cx, e.clientY - S.g.cy) < S.g.size * 0.95 && S.act.tapEye) { try { S.act.tapEye(); } catch (er) {} }
    try { S.act && S.act.up && S.act.up(); } catch (er) { console.error(er); }
    S.downAt = null;
  }
  // ---------- closing ----------
  function beginClose(reason) {
    if (!S || S.closing) return;
    endPointer();
    const quick = !S.motion;
    S.closing = ms(); S.closeReason = reason;
    if (S.el) S.el.classList.add('pt-out');
    resetBody();
    const B = S.B; B.look.to = 0; B.tgx = 0; B.tgy = 0;
    if (S.api.state() !== 'PLAY_CLOSING') S.api.go('PLAY_CLOSING', reason);
    if (quick) finishClose();
    else later(finishClose, S.gentle ? 380 : 320);
    S.api.redraw();
  }
  function finishClose() {
    if (!S) return;
    const api = S.api, why = S.closeReason || 'closed';
    teardown(why);
    api.done(why);
  }
  function teardown(why) {
    if (!S) return;
    settleTime();
    const s = S;
    S = null;
    // 5.0: what you did together lingers once the home screen is the Eye's again
    const played = s.played || {}, total = Object.values(played).reduce((a, b) => a + b, 0), comp = played.company || 0;
    if (total >= 12000) { try { if (root.EyesFeel) EyesFeel.report(comp >= 20000 && comp >= total * 0.6 ? 'company' : 'play', { seconds: Math.round(total / 1000), acts: Object.keys(played) }); } catch (e) {} }
    if (s.pointer != null) { try { s.el && s.el.releasePointerCapture(s.pointer); } catch (e) {} }
    s.timers.forEach(clearTimeout); s.timers.clear();
    clearTimeout(s.lineT);
    if (s.el) s.el.remove();
    s.el = s.lineEl = null; s.act = null;
  }
  // ---------- what the ability system calls ----------
  function playPose() {
    if (!S) return null;
    const t = ms(), dt = Math.min(0.05, Math.max(0, (t - S.lastT) / 1000));
    S.lastT = t;
    if (S.g) {
      if (S.pendingEnter && S.act) { S.pendingEnter = false; try { S.act.enter(S.g); } catch (e) { console.error(e); } }
      if (S.act && !S.closing) { try { S.act.step(dt, S.g); } catch (e) { console.error(e); backToPicker(); } }
      else if (!S.act && !S.closing && S.motion && !S.surprise) {
        // in the picker it keeps glancing between the choices and you
        if (!S.nextGlance || t > S.nextGlance) { S.nextGlance = t + rnd(1400, 2600); if (Math.random() < 0.45) { S.B.tgx = 0; S.B.tgy = 0.1; } else { S.B.tgx = rnd(-0.6, 0.6); S.B.tgy = 0.6; } }
      }
    }
    const slow = !!(S.act && S.act.dozing && S.act.dozing());
    stepBody(S.B, dt, slow || S.gentle);
    const p = bodyPose(S.B);
    if (S.closing) {
      const k = 1 - ease((t - S.closing) / (S.gentle ? 380 : 320));
      p.look *= k;
    }
    return p;
  }
  function playFrame(ctx, g) {
    if (!S) return;
    S.g = g;
    if (S.act && S.act.paint) { try { S.act.paint(ctx, g); } catch (e) { console.error(e); } }
  }
  function playFps(t, low) {
    if (!S) return 0;
    const B = S.B, now = ms();
    if (S.closing) return low ? 30 : 45;
    const springing = Math.abs(B.dx.vel) + Math.abs(B.dy.vel) + Math.abs(B.sq.vel) * 40 + Math.abs(B.tilt.vel) * 40 + Math.abs(B.scale.vel) * 60 > 6 ||
      Math.abs(B.dx.to - B.dx.v) + Math.abs(B.dy.to - B.dy.v) > 1 || Math.abs(B.gx - B.tgx) + Math.abs(B.gy - B.tgy) > 0.01;
    if (!S.act) return now - S.at < 900 || springing ? (low ? 30 : 45) : (low ? 12 : 20);
    if (S.act.moving && S.act.moving()) return low ? 30 : 60;
    if (springing) return low ? 30 : 45;
    if (S.act.dozing && S.act.dozing()) return low ? 6 : 10;      // breathing only
    if (S.act.settled && S.act.settled()) return low ? 10 : 15;
    return low ? 20 : 30;
  }
  function playBack() {
    if (!S) return false;
    if (S.closing) return true;
    if (S.act) return backToPicker();
    beginClose('back');
    return true;
  }
  function playInterrupt(reason) {
    if (!S) return;
    const api = S.api;
    teardown(reason || 'interrupt');
    api.done(reason || 'interrupt');
  }

  // ---------- registration ----------
  function register() {
    if (!root.EyesAbility) return;
    EyesAbility.register({
      id: 'contact', label: 'Eye Contact', icon: CONTACT_ICON,
      available: contactAvailable,
      entry: 'CONTACT_OPENING',
      states: { CONTACT_OPENING: [] },
      activate: contactActivate,
      pose: contactPose,
      fps: () => (C.api ? 45 : 0),
      frame() {},
      back() { contactCancel('back'); return true; },
      interrupt(reason) { contactCancel(reason); },
      suspend(reason) { contactCancel(reason); }
    });
    EyesAbility.register({
      id: 'play', label: 'Play', icon: PLAY_ICON,
      available: playAvailable,
      entry: 'PLAY_PICK',
      states: { PLAY_PICK: ['PLAY_ACTIVE', 'PLAY_CLOSING'], PLAY_ACTIVE: ['PLAY_PICK', 'PLAY_CLOSING'], PLAY_CLOSING: [] },
      activate: playActivate,
      pose: playPose,
      fps: playFps,
      frame: playFrame,
      back: playBack,
      interrupt: playInterrupt,
      suspend: playInterrupt
    });
  }
  register();
  addEventListener('blur', () => { if (S) endPointer(); });
  addEventListener('resize', () => { if (S && S.act && S.actId === 'peekaboo') backToPicker(); else if (S && !S.act) fitPicker(); });

  root.EyesPlaytime = {
    open: (reason) => (root.Haven && Haven.playtime ? Haven.playtime(reason) : root.EyesAbility ? EyesAbility.launch('play', reason || 'api') : false),
    active: () => (S ? S.actId || 'pick' : null),
    choose: (id) => choose(id),
    back: () => playBack(),
    close: () => beginClose('api'),
    surprise: () => surprise(),
    _surprise: { weights: () => surpriseWeights(), pick: () => surprisePick(), recent: () => recentActs.slice(), choosing: () => !!(S && S.surprise) },
    diagnostics: () => (S ? { mode: S.actId || 'pick', closing: !!S.closing, played: { ...(S.played || {}) }, pointer: S.pointer, overlay: !!(S.el && S.el.isConnected), timers: S.timers.size, gentle: S.gentle, motion: S.motion } : { mode: null, overlay: !!document.getElementById('eyesPlaytime') }),
    activities: () => ACTS.map((a) => a.id),
    // read-only test hooks
    _body: () => (S ? { dx: S.B.dx.v, dy: S.B.dy.v, gx: S.B.gx, gy: S.B.gy, lid: S.B.lid.v, glow: S.B.glow.v, scale: S.B.scale.v, sq: S.B.sq.v } : null),
    _ball: () => (S && S.actId === 'catch' && S.act._s ? S.act._s() : null),
    _phase: () => (S && S.actId === 'peekaboo' && S.act._s ? S.act._s() : null),
    _eye: () => (S && S.g ? { x: S.g.cx, y: S.g.cy, r: S.g.size, scale: S.B.scale.v } : null)
  };
})(window);
