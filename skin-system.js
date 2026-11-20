/* HAVEN skins — one glass-marble creature in different light.
   Every skin keeps the same shape, lids, rim, glow and dance; only colour and material change.
   Skins are built from a few soft gradients and points, never per-pixel textures, to spare the battery. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const materials = Object.freeze({
    original: Object.freeze({
      id: 'original',
      name: 'Your Eye',
      description: 'Its own colours, from its DNA.',
      accent: [111, 193, 202],
      link: [131, 237, 243],
      resonance: [195, 165, 255],
      rim: 1,
      caustic: 1,
      catch: 1,
      halo: 1,
      material: 'glass'
    }),
    ember: Object.freeze({
      id: 'ember',
      name: 'Ember',
      description: 'Warm amber glass with a softly glowing coal for a pupil.',
      accent: [236, 150, 82],
      link: [255, 178, 112],
      resonance: [255, 214, 150],
      rim: 0.85,
      caustic: 1.4,
      catch: 0.85,
      halo: 1.2,
      material: 'ember'
    }),
    frost: Object.freeze({
      id: 'frost',
      name: 'Frost',
      description: 'Clear, cold glass with a crisp white rim and an icy pupil.',
      accent: [196, 232, 250],
      link: [214, 242, 255],
      resonance: [190, 215, 255],
      rim: 1.75,
      caustic: 0.7,
      catch: 1.25,
      halo: 0.9,
      material: 'frost'
    }),
    nebula: Object.freeze({
      id: 'nebula',
      name: 'Nebula',
      description: 'Deep violet glass with slow, drifting specks of starlight.',
      accent: [170, 140, 250],
      link: [196, 172, 255],
      resonance: [240, 160, 230],
      rim: 1,
      caustic: 1.1,
      catch: 0.9,
      halo: 1.1,
      material: 'nebula'
    })
  });
  const nameKey = 'haven.skin.material.v1';
  const valid = (id) => Object.prototype.hasOwnProperty.call(materials, id);
  function rand(seed) {
    let s = seed >>> 0;
    return () => {
      s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0;
      s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0;
      return ((s ^= s >>> 16) >>> 0) / 4294967296;
    };
  }
  // Fixed point sets, made once: starlight for Nebula, frost grains for Frost.
  const stars = (() => {
    const r = rand(0x5ea7);
    return Array.from({ length: 24 }, () => {
      const a = r() * TAU,
        d = Math.sqrt(r()) * 0.92;
      return {
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        size: 0.6 + r() * 1.2,
        phase: r() * TAU,
        speed: 0.6 + r() * 1.2,
        depth: 0.4 + r() * 0.6
      };
    });
  })();
  const grains = (() => {
    const r = rand(0xf205);
    return Array.from({ length: 70 }, () => {
      const a = r() * TAU,
        d = 0.8 + r() * 0.2;
      return {
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        size: 0.4 + r() * 0.9,
        alpha: 0.05 + r() * 0.12
      };
    });
  })();
  function createHavenSkins({ read, save, draw, now }) {
    let id = read(nameKey, 'original');
    if (!valid(id)) id = 'original';
    let lastChanged = 0,
      clock = 0,
      lastT = 0;
    function apply() {
      if (typeof document === 'undefined') return;
      document.documentElement.dataset.skin = id;
      const picker = document.getElementById('skinStyle'),
        small = document.getElementById('skinDescription');
      if (picker) picker.value = id;
      if (small) small.textContent = materials[id].description;
    }
    function set(value) {
      if (!valid(value)) return false;
      if (value !== id) {
        id = value;
        lastChanged = now();
        save(nameKey, id);
      }
      apply();
      draw(now());
      return true;
    }
    // Each skin maps HAVEN's mood colours into its own hue, so night, charge and alert still read differently.
    function color(v, mult, alpha, alternate = false, musicTone = null, musicMorph = 0) {
      const k = (musicTone?.strength || 0) * HavenPresence.ease(musicMorph);
      const target = alternate ? musicTone?.secondary : musicTone?.primary;
      let [r, g, b] = [v.r, v.g, v.b];
      if (id === 'ember') {
        [r, g, b] = [g * 0.9 + 66, g * 0.6 + 34, b * 0.25 + 30];
      } else if (id === 'frost') {
        [r, g, b] = [g * 0.5 + 108, g * 0.45 + 148, b * 0.4 + 170];
      } else if (id === 'nebula') {
        [r, g, b] = alternate
          ? [b * 0.75 + 60, r * 0.3 + 90, b * 0.5 + 120]
          : [b * 0.5 + 64, r * 0.4 + 96, b * 0.6 + 129];
      }
      // Your HAVEN: the eye's DNA colour takes the place of the original teal.
      if (id === 'original' && root.HavenDNA && root.HavenDNA.active()) [r, g, b] = root.HavenDNA.mapColor(r, g, b);
      if (target) {
        r += k * (target[0] - r);
        g += k * (target[1] - g);
        b += k * (target[2] - b);
      }
      return (
        'rgba(' +
        [r, g, b].map((x) => clamp(Math.round(x * mult), 0, 255)).join(',') +
        ',' +
        clamp(alpha) +
        ')'
      );
    }
    // A private clock that stops with Motion Off.
    function tick(t, motion) {
      const dt = lastT ? clamp(t - lastT, 0, 90) : 0;
      lastT = t;
      if (motion) clock += dt;
      return clock;
    }
    function flicker(c) {
      return (
        0.5 +
        0.5 *
          (Math.sin(c * 0.0047) * 0.5 +
            Math.sin(c * 0.0113 + 1) * 0.3 +
            Math.sin(c * 0.023 + 2) * 0.2)
      );
    }
    function paintBody(ctx, { rx, ry, size, gx, gy, t, motion, lowPower }) {
      const c = tick(t, motion);
      if (id === 'original') return;
      ctx.save();
      if (id === 'ember') {
        // Smoked amber: a warm core fading into deep brown glass.
        const g = ctx.createRadialGradient(gx * 0.3, gy * 0.3, size * 0.2, 0, 0, rx * 1.1);
        g.addColorStop(0, 'rgba(60,20,4,0)');
        g.addColorStop(0.7, 'rgba(28,8,2,.42)');
        g.addColorStop(1, 'rgba(12,3,1,.8)');
        ctx.fillStyle = g;
        ctx.fillRect(-rx * 1.2, -ry * 1.2, rx * 2.4, ry * 2.4);
        // Two slow embers drift low in the glass.
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 2; i++) {
          const x = Math.sin(c * 0.00027 + i * 2.4) * rx * 0.42 - gx * 0.25,
            y = ry * (0.38 + 0.12 * Math.sin(c * 0.00019 + i)) - gy * 0.2;
          const f = flicker(c + i * 900),
            e = ctx.createRadialGradient(x, y, 0, x, y, size * 0.42);
          e.addColorStop(0, `rgba(255,130,50,${0.16 * f})`);
          e.addColorStop(1, 'rgba(255,90,30,0)');
          ctx.fillStyle = e;
          ctx.beginPath();
          ctx.arc(x, y, size * 0.42, 0, TAU);
          ctx.fill();
        }
      } else if (id === 'frost') {
        // Frosted glass is lighter at the edge, the opposite of the other skins.
        const g = ctx.createRadialGradient(-size * 0.15, -size * 0.2, size * 0.1, 0, 0, rx * 1.08);
        g.addColorStop(0, 'rgba(225,245,255,.07)');
        g.addColorStop(0.72, 'rgba(190,225,245,.05)');
        g.addColorStop(1, 'rgba(205,235,255,.22)');
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = g;
        ctx.fillRect(-rx * 1.2, -ry * 1.2, rx * 2.4, ry * 2.4);
        for (const p of grains) {
          ctx.fillStyle = `rgba(235,250,255,${p.alpha})`;
          ctx.beginPath();
          ctx.arc(p.x * rx, p.y * ry, p.size, 0, TAU);
          ctx.fill();
        }
      } else if (id === 'nebula') {
        const g = ctx.createRadialGradient(0, 0, size * 0.25, 0, 0, rx * 1.1);
        g.addColorStop(0, 'rgba(20,8,50,0)');
        g.addColorStop(0.7, 'rgba(14,5,38,.4)');
        g.addColorStop(1, 'rgba(6,2,20,.82)');
        ctx.fillStyle = g;
        ctx.fillRect(-rx * 1.2, -ry * 1.2, rx * 2.4, ry * 2.4);
        ctx.globalCompositeOperation = 'screen';
        // Two soft clouds sit deep in the glass; they shift against the gaze for depth.
        const clouds = [
          [220, 90, 200, -0.35, 0.25],
          [90, 120, 255, 0.38, -0.2]
        ];
        clouds.forEach(([r, g2, b, ox, oy], i) => {
          const x = rx * (ox + 0.08 * Math.sin(c * 0.00016 + i * 3)) - gx * 0.4,
            y = ry * (oy + 0.08 * Math.cos(c * 0.00013 + i)) - gy * 0.4;
          const cl = ctx.createRadialGradient(x, y, 0, x, y, size * 0.62);
          cl.addColorStop(0, `rgba(${r},${g2},${b},.17)`);
          cl.addColorStop(1, `rgba(${r},${g2},${b},0)`);
          ctx.fillStyle = cl;
          ctx.beginPath();
          ctx.arc(x, y, size * 0.62, 0, TAU);
          ctx.fill();
        });
        // Starlight: slowly turning, twinkling, with deeper stars shifting more.
        const turn = c * 0.000025,
          co = Math.cos(turn),
          si = Math.sin(turn);
        for (let i = 0; i < stars.length; i += lowPower ? 2 : 1) {
          const s = stars[i];
          const x = (s.x * co - s.y * si) * rx - gx * 0.6 * s.depth,
            y = (s.x * si + s.y * co) * ry - gy * 0.6 * s.depth;
          const tw = motion
            ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(c * 0.0016 * s.speed + s.phase))
            : 0.7;
          ctx.fillStyle = `rgba(235,225,255,${0.75 * tw})`;
          ctx.beginPath();
          ctx.arc(x, y, s.size, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    // Drawn just before the pupil: Ember's pupil is a coal that breathes unevenly.
    function paintIris(ctx, { gx, gy, size, t, motion }) {
      if (id !== 'ember') return;
      const f = motion ? flicker(clock * 1.6) : 0.6;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, size * 0.36);
      g.addColorStop(0, `rgba(255,190,110,${0.22 + 0.2 * f})`);
      g.addColorStop(0.5, `rgba(255,120,50,${0.08 + 0.08 * f})`);
      g.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, size * 0.36, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    function palette() {
      return materials[id];
    }
    apply();
    return {
      get value() {
        return id;
      },
      materials,
      available: () => Object.values(materials),
      set,
      apply,
      palette,
      color,
      paintBody,
      paintIris,
      get changedAt() {
        return lastChanged;
      },
      diagnostics: () => ({
        id,
        material: materials[id].material,
        materialTime: Math.round(clock),
        renderer: 'glass-' + materials[id].material
      })
    };
  }
  root.createHavenSkins = createHavenSkins;
  if (typeof module !== 'undefined') module.exports = { createHavenSkins, materials };
})(typeof window === 'undefined' ? globalThis : window);
