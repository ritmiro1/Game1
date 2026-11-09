// ============================================================================
//  Тихий Залив — ядро математики и процедурного шума
//  Все алгоритмы детерминированы (seed) — мир восстанавливается из сейва.
// ============================================================================

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Нелинейный вход для value-noise — без нулей в целых узлах. */
const NOISE_MIX = 1.618033988749895;
const nlin = (v) => v * NOISE_MIX + 37.719;
export const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));
export const smoothstep = (e0, e1, x) => {
  const t = clamp(invLerp(e0, e1, x), 0, 1);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (e0, e1, x) => {
  const t = clamp(invLerp(e0, e1, x), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
// Кадро-независимое сглаживание
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const shortestAngle = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const dampAngle = (a, b, lambda, dt) => a + shortestAngle(a, b) * (1 - Math.exp(-lambda * dt));

// ---------------------------------------------------------------- ГПСЧ
// mulberry32 — быстрый, стабильный, повторяемый
export function makeRNG(seed = 1) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.range = (lo, hi) => lo + rnd() * (hi - lo);
  rnd.int = (lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  rnd.chance = (p) => rnd() < p;
  // нормальное распределение (Бокс-Мюллер)
  rnd.gauss = (mean = 0, sd = 1) => {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  return rnd;
}

// ---------------------------------------------------------------- hash / value noise
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function hash3(ix, iy, iz, seed) {
  let h =
    Math.imul(ix, 374761393) ^
    Math.imul(iy, 668265263) ^
    Math.imul(iz, 2147483647) ^
    Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** 2D value-noise, диапазон 0..1 */
export function noise2(x, y, seed = 0) {
  x = nlin(x); y = nlin(y);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

/** 3D value-noise, 0..1 — для объёма волн и облаков */
export function noise3(x, y, z, seed = 0) {
  x = nlin(x); y = nlin(y); z = nlin(z);
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = fade(x - x0), fy = fade(y - y0), fz = fade(z - z0);
  const n = (i, j, k) => hash3(x0 + i, y0 + j, z0 + k, seed);
  const x00 = lerp(n(0, 0, 0), n(1, 0, 0), fx);
  const x10 = lerp(n(0, 1, 0), n(1, 1, 0), fx);
  const x01 = lerp(n(0, 0, 1), n(1, 0, 1), fx);
  const x11 = lerp(n(0, 1, 1), n(1, 1, 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

/** Фрактальный (fBm) шум 2D */
export function fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5, seed = 0) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq, seed + i * 131);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Рифлёный шум (ridged) — хребты гор / скалы */
export function ridged2(x, y, octaves = 4, seed = 0) {
  let amp = 0.5, freq = 1, sum = 0, prev = 1;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2(x * freq, y * freq, seed + i * 97) * 2 - 1);
    sum += n * n * amp * prev;
    prev = n;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum;
}

/** Доменный (warped) шум — извилистые берега, «живые» линии */
export function warped2(x, y, warp = 0.6, seed = 0) {
  const wx = fbm2(x + 5.2, y + 1.3, 3, 2, 0.5, seed + 7);
  const wy = fbm2(x + 9.7, y + 4.1, 3, 2, 0.5, seed + 19);
  return fbm2(x + warp * (wx - 0.5) * 4, y + warp * (wy - 0.5) * 4, 5, 2, 0.5, seed);
}

// ---------------------------------------------------------------- кривые
export const catmullRom = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
};

export function makeBezierSampler(pts, steps = 32) {
  // Де Кастельжо для произвольного числа контрольных точек
  const sample = (t) => {
    const p = pts.map((q) => ({ x: q.x, y: q.y, z: q.z }));
    for (let k = 1; k < p.length; k++) {
      for (let i = 0; i < p.length - k; i++) {
        p[i].x = lerp(p[i].x, p[i + 1].x, t);
        p[i].y = lerp(p[i].y, p[i + 1].y, t);
        p[i].z = lerp(p[i].z, p[i + 1].z, t);
      }
    }
    return p[0];
  };
  const out = [];
  for (let i = 0; i <= steps; i++) out.push(sample(i / steps));
  return out;
}

// ---------------------------------------------------------------- цвет
export function hexToRgb01(hex) {
  const n = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
export function mixRgb(a, b, t) {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}
export const rgbToCss = (c, a = 1) =>
  `rgba(${Math.round(clamp(c.r, 0, 1) * 255)},${Math.round(clamp(c.g, 0, 1) * 255)},${Math.round(
    clamp(c.b, 0, 1) * 255
  )},${a})`;
