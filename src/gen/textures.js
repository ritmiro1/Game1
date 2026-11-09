// ============================================================================
//  Процедурная генерация PBR-текстур (albedo / normal / roughness / emissive)
//  Всё рисуется кодом на canvas — никаких внешних файлов, полная оффлайн-работа.
// ============================================================================
import { makeRNG, clamp, lerp, noise2, fbm2 } from './math.js';

export function createCanvas(w, h) {
  if (typeof globalThis.__makeCanvas === 'function') return globalThis.__makeCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasTexture(canvas, renderer) {
  return canvas;
}

/** Создаёт ImageData и вызывает fn(x,y)->[r,g,b,a] (0..255) */
function fillCanvas(canvas, fn) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const out = fn(x, y, w, h);
      const i = (y * w + x) * 4;
      d[i] = out[0];
      d[i + 1] = out[1];
      d[i + 2] = out[2];
      d[i + 3] = out.length > 3 ? out[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Периодический шум для бесшовных текстур. */
function pnoise(x, y, period, seed) {
  // тайлим через блочный шум: берём noise2 на торе
  const p = period;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sm = (t) => t * t * (3 - 2 * t);
  const sx = sm(fx), sy = sm(fy);
  const h = (a, b) => {
    const ax = ((a % p) + p) % p, by = ((b % p) + p) % p;
    let n = Math.imul(ax, 374761393) ^ Math.imul(by, 668265263) ^ Math.imul(seed, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const v00 = h(xi, yi), v10 = h(xi + 1, yi), v01 = h(xi, yi + 1), v11 = h(xi + 1, yi + 1);
  return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
}

/** Периодический fBm */
export function pfbm(x, y, period, octaves = 4, seed = 0, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * pnoise(x * freq, y * freq, period * freq, seed + i * 71);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}

/** Карта нормалей из карты высот (Sobel), возвращает canvas. */
function heightToNormalCanvas(heightData, w, h, strength = 2.5) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const at = (x, y) => heightData[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), dn = at(x, y + 1);
      let nx = (l - r) * strength;
      let ny = (u - dn) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayCanvas(data, w, h) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = clamp(data[i], 0, 1) * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function rgbCanvas(rgb, w, h) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = clamp(rgb[i * 3], 0, 1) * 255;
    img.data[i * 4 + 1] = clamp(rgb[i * 3 + 1], 0, 1) * 255;
    img.data[i * 4 + 2] = clamp(rgb[i * 3 + 2], 0, 1) * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ============================================================================
//  ГЕНЕРАТОРЫ МАТЕРИАЛОВ
// ============================================================================

/** Деревянные доски (причал, стены хижины, лодка) */
export function makeWoodTextures(size = 512, opts = {}) {
  const { plankCount = 6, base = [0.42, 0.29, 0.18], variation = 0.16, seed = 3, grime = 0.25 } = opts;
  const w = size, h = size;
  const rgb = new Float32Array(w * h * 3);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  const rnd = makeRNG(seed);
  const plankHues = [];
  for (let i = 0; i < plankCount; i++) plankHues.push(rnd.range(-variation, variation));
  const plankW = h / plankCount;
  for (let y = 0; y < h; y++) {
    const pi = Math.floor(y / plankW);
    const py = (y % plankW) / plankW;
    const offset = rnd.range(0, 1);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const grain = pfbm(u * 26 + offset * 10, (y / h) * 3 + pi * 5.3, 26, 4, seed + pi * 13);
      const fine = pnoise(u * 90, (y / h) * 120 + pi * 40, 90, seed + pi) ;
      // кольца древесины
      const ring = Math.sin((grain * 9 + fine * 1.5) * Math.PI) * 0.5 + 0.5;
      const k = 0.72 + (grain * 0.5 + ring * 0.28 + fine * 0.22) * 0.6;
      const tint = plankHues[pi];
      // щели между досками
      const gap = Math.min(py, 1 - py);
      const gapDark = gap < 0.035 ? 0.45 : gap < 0.07 ? lerp(0.75, 1, (gap - 0.035) / 0.035) : 1;
      // гвозди/тёмные пятна
      const nail = (Math.abs(((u * 3) % 1) - 0.5) < 0.012 && gap < 0.09) ? 0.55 : 1;
      const grimeN = pfbm(u * 6, (y / h) * 6, 6, 4, seed + 55);
      const gm = 1 - grime * Math.pow(grimeN, 2.2) * 0.8;
      const i = y * w + x;
      const r = (base[0] + tint) * k * gapDark * nail * gm;
      const g = (base[1] + tint * 0.85) * k * gapDark * nail * gm;
      const b = (base[2] + tint * 0.7) * k * gapDark * nail * gm;
      rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
      height[i] = (gap < 0.05 ? 0.05 : 0.6) + grain * 0.25 + fine * 0.12;
      rough[i] = clamp(0.72 + grimeN * 0.22 - ring * 0.06, 0.35, 1);
    }
  }
  return {
    map: rgbCanvas(rgb, w, h),
    normalMap: heightToNormalCanvas(height, w, h, 3.2),
    roughnessMap: grayCanvas(rough, w, h),
  };
}

/** Скала / утёс / валун */
export function makeRockTextures(size = 512, seed = 11) {
  const w = size, h = size;
  const rgb = new Float32Array(w * h * 3);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  const mossRng = makeRNG(seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n1 = pfbm(u * 9, v * 9, 9, 5, seed);
      const n2 = pfbm(u * 34, v * 34, 34, 3, seed + 4);
      const crack = Math.abs(pfbm(u * 14, v * 14, 14, 4, seed + 9) - 0.5);
      const veins = Math.pow(1 - clamp(crack * 7, 0, 1), 4);
      const moss = clamp((pfbm(u * 5, v * 5, 5, 4, seed + 33) - 0.52) * 3.4, 0, 1);
      const base = 0.40 + n1 * 0.26 + n2 * 0.12;
      const i = y * w + x;
      let r = base * 1.0, g = base * 0.98, b = base * 0.92;
      // синеватый холодный камень
      r *= 0.94; b *= 1.06;
      // тёмные трещины
      r *= 1 - veins * 0.45; g *= 1 - veins * 0.45; b *= 1 - veins * 0.4;
      // мох
      r = lerp(r, 0.19 + n2 * 0.1, moss * 0.55);
      g = lerp(g, 0.30 + n2 * 0.12, moss * 0.6);
      b = lerp(b, 0.13, moss * 0.5);
      rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
      height[i] = n1 * 0.55 + n2 * 0.35 - veins * 0.5 + moss * 0.12;
      rough[i] = clamp(0.86 - n2 * 0.12 + moss * 0.1, 0.5, 1);
    }
  }
  return {
    map: rgbCanvas(rgb, w, h),
    normalMap: heightToNormalCanvas(height, w, h, 4.5),
    roughnessMap: grayCanvas(rough, w, h),
  };
}

/** Земля/трава/мох — для террейна (крупный тайл) */
export function makeGroundTextures(size = 512, seed = 21) {
  const w = size, h = size;
  const rgb = new Float32Array(w * h * 3);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const big = pfbm(u * 4, v * 4, 4, 4, seed);
      const mid = pfbm(u * 18, v * 18, 18, 4, seed + 3);
      const fine = pnoise(u * 128, v * 128, 128, seed + 8);
      const blades = Math.pow(pnoise(u * 200, v * 40, 200, seed + 12), 2);
      const i = y * w + x;
      const dryness = clamp((big - 0.45) * 2.4, 0, 1);
      let r = lerp(0.16, 0.30, dryness) + mid * 0.06 + fine * 0.04;
      let g = lerp(0.26, 0.27, dryness) + mid * 0.09 + fine * 0.05;
      let b = lerp(0.10, 0.11, dryness) + mid * 0.03;
      r += blades * 0.05; g += blades * 0.10; b += blades * 0.02;
      rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
      height[i] = mid * 0.4 + fine * 0.25 + blades * 0.45;
      rough[i] = clamp(0.86 + fine * 0.1, 0.6, 1);
    }
  }
  return {
    map: rgbCanvas(rgb, w, h),
    normalMap: heightToNormalCanvas(height, w, h, 2.6),
    roughnessMap: grayCanvas(rough, w, h),
  };
}

/** Песок / галька пляжа */
export function makeSandTextures(size = 512, seed = 31) {
  const w = size, h = size;
  const rgb = new Float32Array(w * h * 3);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  const rnd = makeRNG(seed);
  const pebbles = [];
  for (let i = 0; i < 90; i++) pebbles.push({ x: rnd(), y: rnd(), r: rnd.range(0.004, 0.02), s: rnd.range(0.6, 1.2) });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n = pfbm(u * 40, v * 40, 40, 3, seed);
      const fine = pnoise(u * 180, v * 180, 180, seed + 2);
      let peb = 0;
      for (const p of pebbles) {
        let dx = Math.abs(u - p.x); dx = Math.min(dx, 1 - dx);
        let dy = Math.abs(v - p.y); dy = Math.min(dy, 1 - dy);
        const d = Math.hypot(dx, dy);
        if (d < p.r) peb = Math.max(peb, (1 - d / p.r) * p.s);
      }
      const i = y * w + x;
      const base = 0.52 + n * 0.16 + fine * 0.05;
      let r = base * 1.02, g = base * 0.95, b = base * 0.80;
      r = lerp(r, 0.42, peb * 0.5); g = lerp(g, 0.40, peb * 0.5); b = lerp(b, 0.36, peb * 0.4);
      rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
      height[i] = peb * 0.7 + n * 0.2 + fine * 0.1;
      rough[i] = clamp(0.9 - peb * 0.15, 0.5, 1);
    }
  }
  return {
    map: rgbCanvas(rgb, w, h),
    normalMap: heightToNormalCanvas(height, w, h, 3.0),
    roughnessMap: grayCanvas(rough, w, h),
  };
}

/** Потёртая краска + ржавчина (лодка, металл маяка) */
export function makePaintTextures(size = 512, opts = {}) {
  const { base = [0.20, 0.36, 0.38], rust = [0.36, 0.18, 0.09], seed = 41, wear = 0.55 } = opts;
  const w = size, h = size;
  const rgb = new Float32Array(w * h * 3);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n = pfbm(u * 7, v * 7, 7, 5, seed);
      const streak = pfbm(u * 30, v * 3, 30, 3, seed + 5);
      const chip = pfbm(u * 16, v * 16, 16, 4, seed + 9);
      const isRust = clamp((n - (1 - wear)) * 4.0, 0, 1) * clamp(streak * 1.4, 0, 1);
      const isChip = chip > 0.62 ? clamp((chip - 0.62) * 6, 0, 1) : 0;
      const i = y * w + x;
      let r = base[0], g = base[1], b = base[2];
      // выцветание
      r = lerp(r, 0.44, n * 0.25); g = lerp(g, 0.47, n * 0.25); b = lerp(b, 0.46, n * 0.25);
      r = lerp(r, rust[0] * (0.7 + n * 0.6), isRust * 0.92);
      g = lerp(g, rust[1] * (0.7 + n * 0.6), isRust * 0.92);
      b = lerp(b, rust[2] * (0.7 + n * 0.6), isRust * 0.92);
      r = lerp(r, 0.30, isChip * 0.5); g = lerp(g, 0.30, isChip * 0.5); b = lerp(b, 0.31, isChip * 0.5);
      rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
      height[i] = isChip * 0.5 + n * 0.18 + isRust * 0.25;
      rough[i] = clamp(0.35 + isRust * 0.5 + isChip * 0.2 + n * 0.15, 0.3, 1);
    }
  }
  return {
    map: rgbCanvas(rgb, w, h),
    normalMap: heightToNormalCanvas(height, w, h, 3.6),
    roughnessMap: grayCanvas(rough, w, h),
  };
}

/** Кора дерева */
export function makeBarkTextures(size = 256, seed = 51) {
  const w = size, h = size;
  const rgb = new Float32Array(w * h * 3);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const ridge = Math.abs(pfbm(u * 22, v * 4, 22, 4, seed) - 0.5) * 2;
      const n = pfbm(u * 9, v * 9, 9, 4, seed + 6);
      const i = y * w + x;
      const k = 0.30 + n * 0.25 + ridge * 0.18;
      rgb[i * 3] = k * 0.92; rgb[i * 3 + 1] = k * 0.78; rgb[i * 3 + 2] = k * 0.62;
      height[i] = ridge * 0.8 + n * 0.3;
      rough[i] = clamp(0.85 + n * 0.12, 0.7, 1);
    }
  }
  return {
    map: rgbCanvas(rgb, w, h),
    normalMap: heightToNormalCanvas(height, w, h, 3.4),
    roughnessMap: grayCanvas(rough, w, h),
  };
}

/** Листва / хвоя: альфа-текстура пучка листьев */
export function makeLeafTexture(size = 128, opts = {}) {
  const { color = [0.22, 0.42, 0.20], seed = 61, needle = false } = opts;
  const w = size, h = size;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const rnd = makeRNG(seed);
  const count = needle ? 90 : 42;
  for (let i = 0; i < count; i++) {
    const ang = rnd.range(-Math.PI, Math.PI);
    const len = rnd.range(0.18, 0.46) * w;
    const cx = w / 2, cy = h * 0.62;
    const x2 = cx + Math.cos(ang) * len * (needle ? 1 : 0.75);
    const y2 = cy + Math.sin(ang) * len * (needle ? 1 : 0.9) - rnd.range(0, h * 0.25);
    ctx.strokeStyle = `rgba(${Math.round(color[0] * 255 * rnd.range(0.75, 1.25))},${Math.round(
      color[1] * 255 * rnd.range(0.8, 1.3)
    )},${Math.round(color[2] * 255 * rnd.range(0.7, 1.2))},0.95)`;
    ctx.lineCap = 'round';
    if (needle) {
      ctx.lineWidth = rnd.range(1.2, 2.6);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // хвоинки
      for (let k = 1; k < 5; k++) {
        const t = k / 5;
        const px = lerp(cx, x2, t), py = lerp(cy, y2, t);
        const sl = len * 0.16;
        ctx.beginPath();
        ctx.lineWidth = 1.1;
        ctx.moveTo(px - sl, py - sl * 0.9);
        ctx.lineTo(px + sl, py - sl * 0.5);
        ctx.stroke();
      }
    } else {
      ctx.lineWidth = rnd.range(2, 4);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo((cx + x2) / 2 + rnd.range(-6, 6), (cy + y2) / 2 - 6, x2, y2);
      ctx.stroke();
    }
  }
  // мягкое затухание краёв
  const img = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x / w - 0.5, dy = y / h - 0.55;
      const d = Math.hypot(dx, dy * 1.1) * 2;
      const fade = clamp(1 - Math.pow(clamp(d, 0, 1), 2.2), 0, 1);
      const i = (y * w + x) * 4 + 3;
      img.data[i] = Math.round(img.data[i] * fade);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Нормаль-карта поверхности воды (две частоты) */
export function makeWaterNormalTexture(size = 256, seed = 71) {
  const w = size, h = size;
  const height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      height[y * w + x] =
        pfbm(u * 8, v * 8, 8, 4, seed) * 0.6 + pfbm(u * 22, v * 22, 22, 3, seed + 3) * 0.4;
    }
  }
  return heightToNormalCanvas(height, w, h, 2.2);
}

/** Каустика (для подводных бликов / проецирования) */
export function makeCausticsTexture(size = 256, seed = 81) {
  const w = size, h = size;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const a = pfbm(u * 6, v * 6, 6, 3, seed);
      const b = pfbm(u * 6 + 0.5, v * 6 + 0.5, 6, 3, seed + 11);
      // изолинии «сети» — характерный рисунок каустики
      const net = Math.pow(clamp(Math.abs(a - b) * 9, 0, 1), 2.2);
      const ridges = Math.pow(clamp(1 - Math.abs(a * 2 - 1) * 2.2, 0, 1), 3);
      const val = clamp(net * 0.8 + ridges * 0.55, 0, 1);
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = val * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Пена: пушистые пятна с прозрачностью */
export function makeFoamTexture(size = 256, seed = 91) {
  const w = size, h = size;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n = pfbm(u * 10, v * 10, 10, 5, seed);
      const bubbles = Math.pow(pnoise(u * 46, v * 46, 46, seed + 4), 3.2);
      const a = clamp((n - 0.34) * 2.9, 0, 1) * 0.85 + bubbles * 0.6;
      const i = (y * w + x) * 4;
      img.data[i] = 250; img.data[i + 1] = 252; img.data[i + 2] = 255;
      img.data[i + 3] = clamp(a, 0, 1) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Чешуя рыбы */
export function makeScalesTexture(size = 256, opts = {}) {
  const { base = [0.55, 0.62, 0.68], belly = [0.92, 0.93, 0.90], seed = 101, tint = [0.28, 0.42, 0.46] } = opts;
  const w = size, h = size;
  const rgb = new Float32Array(w * h * 3);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  const cols = 18;
  const rows = 18;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const rowF = v * rows;
      const row = Math.floor(rowF);
      const colF = u * cols + (row % 2) * 0.5;
      const col = Math.floor(colF);
      const du = colF - col - 0.5;
      const dv = rowF - row;
      const d = Math.hypot(du * 1.1, (dv - 0.5) * 1.9);
      const scale = clamp(1 - Math.pow(d * 1.7, 2), 0, 1);
      const n = pfbm(u * 8, v * 8, 8, 3, seed);
      const band = Math.sin(v * Math.PI * 7 + n * 2.2) * 0.5 + 0.5;
      const i = y * w + x;
      const darkening = 0.62 + scale * 0.5;
      const grad = clamp(v, 0, 1);
      let r = lerp(base[0], belly[0], Math.pow(grad, 2.2));
      let g = lerp(base[1], belly[1], Math.pow(grad, 2.2));
      let b = lerp(base[2], belly[2], Math.pow(grad, 2.2));
      r = lerp(r, tint[0], band * 0.35); g = lerp(g, tint[1], band * 0.35); b = lerp(b, tint[2], band * 0.35);
      r *= darkening; g *= darkening; b *= darkening;
      rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
      height[i] = scale * 0.7 + n * 0.2;
      rough[i] = clamp(0.36 + (1 - scale) * 0.28, 0.2, 0.75);
    }
  }
  return {
    map: rgbCanvas(rgb, w, h),
    normalMap: heightToNormalCanvas(height, w, h, 2.2),
    roughnessMap: grayCanvas(rough, w, h),
  };
}

/** Ткань / парусина / тент */
export function makeCanvasClothTextures(size = 256, seed = 111) {
  const w = size, h = size;
  const rgb = new Float32Array(w * h * 3);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const weaveX = Math.sin(u * Math.PI * 120) * 0.5 + 0.5;
      const weaveY = Math.sin(v * Math.PI * 120) * 0.5 + 0.5;
      const weave = (weaveX + weaveY) * 0.5;
      const stain = pfbm(u * 5, v * 5, 5, 4, seed);
      const i = y * w + x;
      const k = 0.58 + weave * 0.16 + stain * 0.12;
      rgb[i * 3] = k * 1.0; rgb[i * 3 + 1] = k * 0.93; rgb[i * 3 + 2] = k * 0.82;
      height[i] = weave * 0.6 + stain * 0.3;
      rough[i] = clamp(0.88 + stain * 0.1, 0.7, 1);
    }
  }
  return {
    map: rgbCanvas(rgb, w, h),
    normalMap: heightToNormalCanvas(height, w, h, 2.0),
    roughnessMap: grayCanvas(rough, w, h),
  };
}

/** Металл (поручни, двигатель, фонарь) — с царапинами */
export function makeMetalTextures(size = 256, opts = {}) {
  const { base = [0.40, 0.42, 0.45], seed = 121, rustAmount = 0.25 } = opts;
  const w = size, h = size;
  const rgb = new Float32Array(w * h * 3);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const scratch = Math.pow(pnoise(u * 200, v * 6, 200, seed), 14) * 3;
      const n = pfbm(u * 7, v * 7, 7, 4, seed + 5);
      const rust = clamp((pfbm(u * 11, v * 11, 11, 5, seed + 17) - 0.6) * 4, 0, 1) * rustAmount * 3;
      const i = y * w + x;
      let r = base[0] * (0.86 + n * 0.3) + scratch * 0.3;
      let g = base[1] * (0.86 + n * 0.3) + scratch * 0.3;
      let b = base[2] * (0.86 + n * 0.3) + scratch * 0.3;
      r = lerp(r, 0.34, clamp(rust, 0, 1)); g = lerp(g, 0.16, clamp(rust, 0, 1)); b = lerp(b, 0.08, clamp(rust, 0, 1));
      rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
      height[i] = scratch * 0.4 + n * 0.15 + clamp(rust, 0, 1) * 0.35;
      rough[i] = clamp(0.28 + n * 0.16 + clamp(rust, 0, 1) * 0.5, 0.15, 1);
    }
  }
  return {
    map: rgbCanvas(rgb, w, h),
    normalMap: heightToNormalCanvas(height, w, h, 2.4),
    roughnessMap: grayCanvas(rough, w, h),
  };
}

/** Ночное небо: звёзды + млечный путь (RGBA, прозрачное) */
export function makeStarTexture(size = 1024, seed = 131) {
  const w = size, h = size;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const rnd = makeRNG(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const band = h * 0.42;
  for (let i = 0; i < 26000; i++) {
    const x = Math.floor(rnd() * w);
    // млечный путь — гауссово распределение вокруг полосы
    const y = Math.floor(rnd.gauss(band + Math.sin((x / w) * Math.PI * 2) * h * 0.1, h * 0.11));
    if (y < 0 || y >= h) continue;
    const bright = Math.pow(rnd(), 3.2);
    const idx = (y * w + x) * 4;
    const tint = rnd.range(0.86, 1.0);
    img.data[idx] = 255 * tint;
    img.data[idx + 1] = 255 * tint;
    img.data[idx + 2] = 255;
    img.data[idx + 3] = clamp(bright * 460, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  // крупные звёзды с ореолом
  for (let i = 0; i < 420; i++) {
    const x = rnd() * w;
    const y = rnd.gauss(band, h * 0.2);
    if (y < 0 || y > h) continue;
    const r = rnd.range(0.6, 2.1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(220,235,255,0.45)');
    g.addColorStop(1, 'rgba(180,210,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

/** Круглый спрайт дымки/облака/блика */
export function makeRadialSprite(size = 128, color = '255,255,255', softness = 0.45) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(softness, `rgba(${color},0.45)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Пятно ряски / водоросли */
export function makeKelpTexture(size = 128, seed = 141) {
  const w = size, h = size;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const rnd = makeRNG(seed);
  for (let i = 0; i < 16; i++) {
    const x0 = rnd.range(0.2, 0.8) * w;
    ctx.strokeStyle = `rgba(${Math.round(rnd.range(30, 70))},${Math.round(rnd.range(80, 130))},${Math.round(
      rnd.range(50, 90)
    )},0.9)`;
    ctx.lineWidth = rnd.range(2, 5);
    ctx.beginPath();
    ctx.moveTo(x0, h);
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      ctx.lineTo(x0 + Math.sin(t * 6 + i) * w * 0.09, h - t * h * rnd.range(0.7, 1.0));
    }
    ctx.stroke();
  }
  return c;
}

/** Декали: бумага/карта (для UI и квестов) */
export function makePaperTexture(size = 256, seed = 151) {
  const w = size, h = size;
  const rgb = new Float32Array(w * h * 3);
  const rough = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n = pfbm(u * 6, v * 6, 6, 4, seed);
      const fibers = pnoise(u * 160, v * 160, 160, seed + 3);
      const i = y * w + x;
      const k = 0.80 + n * 0.14 + fibers * 0.04;
      rgb[i * 3] = k; rgb[i * 3 + 1] = k * 0.96; rgb[i * 3 + 2] = k * 0.86;
      rough[i] = 0.92;
    }
  }
  return { map: rgbCanvas(rgb, w, h), roughnessMap: grayCanvas(rough, w, h) };
}
