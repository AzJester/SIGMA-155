/* SIGMA 155: FIRE MISSION — utilities (math, RNG, noise, formatting) */
'use strict';

const Util = {
  clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  remap(v, a0, a1, b0, b1) { return b0 + (b1 - b0) * ((v - a0) / (a1 - a0)); },
  smoothstep(t) { t = Util.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
  easeOutCubic(t) { t = Util.clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); },
  deg2rad(d) { return d * Math.PI / 180; },
  rad2deg(r) { return r * 180 / Math.PI; },
  dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); },

  // Mulberry32 seeded PRNG — returns a function in [0,1)
  rng(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  // Box–Muller gaussian, mean 0 std 1, using given rng (or Math.random)
  gauss(rand) {
    const r = rand || Math.random;
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  },

  // Deterministic 1D hash noise in [-1, 1]
  hash1(ix, seed) {
    let h = (ix | 0) * 374761393 + (seed | 0) * 668265263;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return (h / 2147483648) - 1.0;
  },

  // Smooth 1D value noise, x in arbitrary units
  noise1(x, seed) {
    const ix = Math.floor(x);
    const fx = x - ix;
    const a = Util.hash1(ix, seed);
    const b = Util.hash1(ix + 1, seed);
    return Util.lerp(a, b, Util.smoothstep(fx));
  },

  // Fractal noise: octaves of noise1
  fbm(x, seed, octaves, lacunarity, gain) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * Util.noise1(x * freq, seed + i * 101);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  },

  pick(arr, rand) { return arr[Math.floor((rand || Math.random)() * arr.length)]; },

  shuffle(arr, rand) {
    const r = rand || Math.random, a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  },

  fmtKm(meters, digits) {
    return (meters / 1000).toFixed(digits === undefined ? 1 : digits) + ' km';
  },
  fmtTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  },
  pad(n, w) {
    let s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Util;
