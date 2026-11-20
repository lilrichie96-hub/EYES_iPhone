/* EYES 4.0 · Play: two toys for the eye itself. Shared by Android and iPhone.
   Chase the light   Drag a little light around and flick it; it bounces off the edges and the eye
                     can't help following it. It perks up when the light swoops close.
   Staring contest   Hold your finger on its eye. It stares back and tries everything (fake blinks,
                     glances, wobbles) to make you let go. Whoever "blinks" first loses. How long it lasts
                     depends on its temperament: sleepy and hyper eyes crack early, calm and smug ones don't.
   Record: eyes.play.v1 { wins, losses, best } */
'use strict';
window.createEyesPlay = function ({ core, personality, now, schedule, eyeCentre }) {
  const KEY = 'eyes.play.v1';
  let rec = { wins: 0, losses: 0, best: 0 }; try { Object.assign(rec, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) {} };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dna = () => (window.HavenDNA && HavenDNA.dna()) || null;
  let mode = null;            // 'light' | 'stare'
  let ui = null;

  // ---------- overlay ----------
  function overlay(html) {
    close(true);
    ui = document.createElement('div'); ui.id = 'eyesPlay'; ui.innerHTML = html;
    document.body.appendChild(ui);
    ui.querySelector('[data-done]').addEventListener('click', () => close());
    return ui;
  }
  function close(silent) {
    if (ui) { ui.remove(); ui = null; }
    if (mode === 'stare' && stare && stare.state === 'on' && !silent) endStare('quit');
    mode = null; light = null; stare = null; schedule();
  }
  function wakeIt() { if (core.asleep && personality.wake) personality.wake('stir'); }

  // ---------- chase the light ----------
  let light = null;
  function startLight() {
    wakeIt();
    const el = overlay('<p class="play-hint">Drag the light. Flick it.</p><button data-done type="button" class="play-done">Done</button>');
    mode = 'light';
    const c = eyeCentre();
    light = { x: c.x + 90, y: c.y - 140, vx: 0, vy: 0, held: false, last: now(), trail: [], idleAt: now() };
    let lastPt = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      light.held = true; light.x = e.clientX; light.y = e.clientY; light.vx = light.vy = 0; lastPt = { x: e.clientX, y: e.clientY, t: now() };
      el.setPointerCapture(e.pointerId); el.querySelector('.play-hint').style.opacity = '0';
    });
    el.addEventListener('pointermove', (e) => {
      if (!light || !light.held) return;
      const t = now(), dt = Math.max(8, t - lastPt.t);
      light.vx = ((e.clientX - lastPt.x) / dt) * 1000; light.vy = ((e.clientY - lastPt.y) / dt) * 1000;
      light.x = e.clientX; light.y = e.clientY; lastPt = { x: e.clientX, y: e.clientY, t };
    });
    const up = () => { if (light) { light.held = false; light.idleAt = now(); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    schedule();
  }
  function tickLight(t) {
    const L = light, dt = Math.min(0.05, (t - L.last) / 1000); L.last = t;
    const W = innerWidth, H = innerHeight;
    if (!L.held) {
      const f = Math.exp(-0.9 * dt); L.vx *= f; L.vy *= f;
      L.x += L.vx * dt; L.y += L.vy * dt;
      if (L.x < 14 || L.x > W - 14) { L.vx *= -0.85; L.x = clamp(L.x, 14, W - 14); }
      if (L.y < 40 || L.y > H - 60) { L.vy *= -0.85; L.y = clamp(L.y, 40, H - 60); }
      if (Math.hypot(L.vx, L.vy) < 8) { L.vx += (Math.random() - 0.5) * 30; L.vy += (Math.random() - 0.5) * 30; }   // it never quite settles
    }
    L.trail.push({ x: L.x, y: L.y }); if (L.trail.length > 14) L.trail.shift();
    // the eye can't look away
    const c = eyeCentre(), dx = L.x - c.x, dy = L.y - c.y, d = Math.hypot(dx, dy), reach = Math.max(120, c.size * 2.6);
    core.aim(clamp(dx / reach, -1, 1), clamp(dy / reach, -1, 1), t, 160);
    if (d < c.size * 1.6 && (!L.close || t - L.close > 2500)) { L.close = t; core.react('inspect', t); if (personality.nudge) personality.nudge({ curiosity: 0.04, content: 0.03 }); }
  }
  function paintLight(ctx, t) {
    const L = light; if (!L) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const col = dna() ? dna().accent2 : [180, 240, 245];
    L.trail.forEach((p, i) => { const a = (i / L.trail.length) * 0.25; ctx.fillStyle = `rgba(${col.join(',')},${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, 3 + i * 0.3, 0, Math.PI * 2); ctx.fill(); });
    const pulse = 1 + Math.sin(t / 180) * 0.12, g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, 26 * pulse);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, `rgba(${col.join(',')},0.6)`); g.addColorStop(1, `rgba(${col.join(',')},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L.x, L.y, 26 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- staring contest ----------
  let stare = null;
  function startStare() {
    wakeIt();
    const el = overlay(`<p class="play-hint" id="stareMsg">Hold your finger on its eye.<br>Don't let go.</p>
      <p class="play-score" id="stareScore"></p><button data-done type="button" class="play-done">Done</button>`);
    mode = 'stare';
    const d = dna(), T = d ? d.T : { energy: 0.5, drama: 0.5, grump: 0.5, shyness: 0.5 };
    // how long it can hold: calm, smug and grumpy eyes are stubborn; sleepy, hyper and shy ones crack
    const stamina = (6 + 22 * (1 - Math.abs(T.energy - 0.5) * 2) * 0.6 + 10 * T.grump + 6 * (1 - T.shyness)) * (0.6 + Math.random() * 0.8);
    stare = { state: 'ready', limit: stamina * 1000, startedAt: 0, nextTrick: 0, d };
    score();
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || !stare) return;
      const c = eyeCentre();
      if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > c.size * 1.4) { msg('On its eye. Right in the middle.'); return; }
      if (stare.state === 'ready' || stare.state === 'over') {
        stare.state = 'on'; stare.startedAt = now(); stare.nextTrick = now() + 2500; msg('…');
        core.react('anticipate', now());
      }
      el.setPointerCapture(e.pointerId);
    });
    const up = () => { if (stare && stare.state === 'on') endStare('you'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    schedule();
  }
  const msg = (s) => { const m = ui && ui.querySelector('#stareMsg'); if (m) m.innerHTML = s; };
  const score = () => { const s = ui && ui.querySelector('#stareScore'); if (s) s.textContent = `you ${rec.wins} · it ${rec.losses}${rec.best ? ` · longest ${rec.best.toFixed(1)} s` : ''}`; };
  function tickStare(t) {
    const S = stare;
    if (S.state !== 'on') return;
    core.blink.next = t + 4000;                         // it is not allowed to blink. it's trying.
    core.aim((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04, t, 200);
    const held = t - S.startedAt;
    if (held > S.limit) return endStare('it');
    if (t > S.nextTrick) {                              // tricks to make you let go
      const tricks = ['peek', 'look-around', 'anticipate', 'touch', 'startle'];
      const k = tricks[Math.floor(Math.random() * tricks.length)];
      if (k === 'look-around') { core.aim(Math.random() < 0.5 ? -0.9 : 0.9, -0.2, t, 380); setTimeout(() => core.aim(0, 0, now(), 300), 450); }
      else core.react(k, t);
      if (Math.random() < 0.35) msg(['It is very serious about this.', 'Do not trust it.', 'Its eye is watering. Probably.', 'It is pretending to be a rock.'][Math.floor(Math.random() * 4)]);
      S.nextTrick = t + 1800 + Math.random() * 3200;
    }
  }
  function endStare(loser) {
    const S = stare; if (!S || S.state !== 'on') return;
    const t = now(), secs = (t - S.startedAt) / 1000;
    S.state = 'over';
    if (loser === 'it') {
      core.startBlink(t);
      rec.wins++; rec.best = Math.max(rec.best, secs);
      setTimeout(() => core.react('annoyed', now()), 260);
      if (personality.nudge) personality.nudge({ content: -0.04, curiosity: 0.05 });
      msg(`It blinked. <b>You win</b> (${secs.toFixed(1)} s).<br>Touch it again for a rematch.`);
    } else if (loser === 'you') {
      rec.losses++;
      core.react('pet', t);
      if (personality.nudge) personality.nudge({ content: 0.06 });
      msg(`You let go. <b>It wins</b> and it knows it.<br>Touch it again for a rematch.`);
    }
    save(); score(); schedule();
  }

  return {
    startLight, startStare, close,
    active: () => mode,
    tick(t) { if (mode === 'light' && light) tickLight(t); else if (mode === 'stare' && stare) tickStare(t); },
    paint(ctx, t) { if (mode === 'light') paintLight(ctx, t); },
    busy: () => !!mode,
    record: () => ({ ...rec })
  };
};
