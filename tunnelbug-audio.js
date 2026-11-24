/* EYES 4.4.4 · Tunnelbug sounds. Every sound is synthesised on the spot with Web Audio: no files, no music,
   nothing borrowed. Short, soft and few. Pocket Arcade (arcade.js) decides whether sound is on and owns the
   AudioContext; when it says no, nothing here makes a sound or creates anything. */
'use strict';
(function (root) {
  const noiseCache = new WeakMap();
  function noiseBuffer(ac) {
    let b = noiseCache.get(ac);
    if (!b) {
      b = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.4), ac.sampleRate);
      const d = b.getChannelData(0);
      let s = 1;
      for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
      noiseCache.set(ac, b);
    }
    return b;
  }
  function tone(ac, out, t0, o) {
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
    const v = o.vol == null ? 0.1 : o.vol, a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(out);
    osc.start(t0); osc.stop(t0 + o.dur + 0.02);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch {} };
  }
  function hiss(ac, out, t0, o) {
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuffer(ac);
    f.type = 'bandpass'; f.frequency.setValueAtTime(o.f || 900, t0); f.Q.value = o.q || 1.2;
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
    g.gain.setValueAtTime(o.vol || 0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t0, Math.random() * 0.2, o.dur + 0.02);
    src.onended = () => { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch {} };
  }
  const notes = (ac, out, t0, list, step, o) => list.forEach((f, i) => tone(ac, out, t0 + i * step, { ...o, f0: f, dur: o.dur || step * 1.2 }));

  const SOUNDS = {
    dig: (ac, out, t) => hiss(ac, out, t, { f: 700 + Math.random() * 500, dur: 0.05, vol: 0.16, q: 1.6 }),
    crystal: (ac, out, t) => notes(ac, out, t, [988, 1319], 0.055, { type: 'square', vol: 0.06 }),
    rare: (ac, out, t) => notes(ac, out, t, [784, 988, 1175, 1568], 0.05, { type: 'triangle', vol: 0.11, dur: 0.09 }),
    pulse: (ac, out, t) => { tone(ac, out, t, { type: 'sine', f0: 200, f1: 900, dur: 0.18, vol: 0.14 }); hiss(ac, out, t, { f: 2000, f1: 500, dur: 0.22, vol: 0.06, q: 0.7 }); },
    nope: (ac, out, t) => tone(ac, out, t, { type: 'square', f0: 170, dur: 0.05, vol: 0.035 }),
    pop: (ac, out, t) => tone(ac, out, t, { type: 'sine', f0: 520, f1: 1300, dur: 0.09, vol: 0.13 }),
    hit: (ac, out, t) => { tone(ac, out, t, { type: 'square', f0: 420, f1: 105, dur: 0.22, vol: 0.09 }); hiss(ac, out, t, { f: 400, dur: 0.12, vol: 0.08 }); },
    warn: (ac, out, t) => notes(ac, out, t, [523, 440], 0.07, { type: 'triangle', vol: 0.05 }),
    ready: (ac, out, t) => tone(ac, out, t, { type: 'triangle', f0: 523, dur: 0.09, vol: 0.06 }),
    go: (ac, out, t) => notes(ac, out, t, [659, 988], 0.07, { type: 'triangle', vol: 0.08 }),
    win: (ac, out, t) => { notes(ac, out, t, [523, 659, 784], 0.09, { type: 'square', vol: 0.06 }); tone(ac, out, t + 0.27, { type: 'triangle', f0: 1047, dur: 0.4, vol: 0.09 }); },
    lose: (ac, out, t) => notes(ac, out, t, [392, 330, 262, 196], 0.14, { type: 'triangle', vol: 0.08, dur: 0.16 })
  };

  function create(getOutput) {
    let lastAt = {};
    return {
      play(name) {
        const fn = SOUNDS[name];
        if (!fn || typeof getOutput !== 'function') return false;
        const o = getOutput();
        if (!o || !o.ctx || o.ctx.state === 'closed') return false;
        const t = o.ctx.currentTime;
        if (lastAt[name] != null && t - lastAt[name] < 0.03) return false;   // never stack the same sound
        lastAt[name] = t;
        try { fn(o.ctx, o.out, t + 0.005); return true; } catch { return false; }
      },
      stop() { lastAt = {}; }
    };
  }
  root.TunnelbugAudio = { create, names: Object.keys(SOUNDS) };
})(typeof window === 'undefined' ? globalThis : window);
