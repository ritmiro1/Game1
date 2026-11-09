// ============================================================================
//  Природные объекты: деревья, кусты, камни, камыш, трава, лилии, водоросли.
//  Всё строится процедурно из сложных мешей (не примитивы): изогнутые
//  стволы, ветки-трубы, карты листвы с альфа-тестом, вершинные цвета.
// ============================================================================
import * as THREE from 'three';
import { GeoBuilder, tube, capsule, noisySphere, lathe } from '../gen/geobuilder.js';
import { makeRNG, TAU, clamp, lerp } from '../gen/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Плавно изогнутая ветка/ствол как сплайн-труба с сужением. */
function branchTube(from, to, r0, r1, bend = 0.15, segs = 6, rng = Math.random) {
  const pts = [];
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const side = new THREE.Vector3().crossVectors(dir, V(0, 1, 0));
  if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
  side.normalize();
  const bendDir = side.multiplyScalar(rng() > 0.5 ? 1 : -1);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = from.clone().addScaledVector(dir, t * len);
    const b = Math.sin(t * Math.PI) * bend * len;
    p.addScaledVector(bendDir, b);
    // лёгкая «живость» — дрожание по второй оси
    p.y += Math.sin(t * 4.2 + from.x) * len * 0.02;
    pts.push(p);
  }
  return tube(pts, r0, 7, { radiusFn: (t) => lerp(r0, r1, Math.pow(t, 0.8)), smooth: true });
}

/** Карта листвы: два пересечённых квада (кросс-биллборд) — дёшево и объёмно. */
function leafCard(builder, center, size, rng, color) {
  for (let k = 0; k < 2; k++) {
    const ang = rng() * Math.PI + k * Math.PI * 0.5;
    const dx = Math.cos(ang) * size * 0.5;
    const dz = Math.sin(ang) * size * 0.5;
    const tilt = (rng() - 0.5) * 0.5;
    const dy = Math.sin(tilt) * size * 0.3;
    const a = V(center.x - dx, center.y - size * 0.4 + dy, center.z - dz);
    const b = V(center.x + dx, center.y - size * 0.4 - dy, center.z + dz);
    const c = V(center.x + dx, center.y + size * 0.6 - dy, center.z + dz);
    const d = V(center.x - dx, center.y + size * 0.6 + dy, center.z - dz);
    const base = builder.vertexCount;
    builder.vertV(a, 0, 0, color);
    builder.vertV(b, 1, 0, color);
    builder.vertV(c, 1, 1, color);
    builder.vertV(d, 0, 1, color);
    builder.quad(base, base + 1, base + 2, base + 3);
    // нормаль «вверх-наружу» — чтобы листва мягко освещалась
    builder.normals = builder.normals || [];
    const n = V(0, 0.86, 0).normalize();
    for (let i = 0; i < 4; i++) builder.normals[base + i] = [n.x, n.y, n.z];
  }
}

/** Сосна: ствол + мутовки ветвей + хвоя. */
export function makePine(rngSeed = 1, opts = {}) {
  const rng = makeRNG(rngSeed);
  const height = opts.height ?? rng.range(9, 16);
  const trunkR = opts.trunkR ?? rng.range(0.17, 0.28);
  const build = new GeoBuilder({ smooth: true });
  const foliage = new GeoBuilder({ smooth: false });

  // Ствол с изгибом
  const trunkPts = [];
  const bendX = rng.range(-0.6, 0.6), bendZ = rng.range(-0.6, 0.6);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    trunkPts.push(V(bendX * Math.sin(t * 2.1) * t, t * height, bendZ * Math.sin(t * 1.7) * t));
  }
  const trunk = tube(trunkPts, trunkR, 9, { radiusFn: (t) => lerp(trunkR, trunkR * 0.16, Math.pow(t, 0.7)) });
  build.append(trunk);
  // корневой «вал» у основания
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rng.range(-0.2, 0.2);
    const from = V(Math.cos(a) * trunkR * 0.6, 0.06, Math.sin(a) * trunkR * 0.6);
    const to = V(Math.cos(a) * trunkR * 2.6, -trunkR * 0.5, Math.sin(a) * trunkR * 2.6);
    build.append(branchTube(from, to, trunkR * 0.55, trunkR * 0.16, 0.05, 3, rng));
  }

  // Мутовки ветвей
  const whorls = Math.floor(height / 1.35);
  const leafColorBase = new THREE.Color(0x2c4a2a);
  for (let w = 0; w < whorls; w++) {
    const t = 0.28 + (w / whorls) * 0.68;
    const y = t * height;
    const tr = lerp(trunkR, trunkR * 0.2, t);
    const count = Math.max(3, Math.round(6 * (1 - t * 0.55)));
    const branchLen = (1 - t) * height * 0.34 * rng.range(0.75, 1.15) + 0.7;
    for (let b = 0; b < count; b++) {
      const a = (b / count) * TAU + w * 0.9 + rng.range(-0.25, 0.25);
      const from = V(Math.cos(a) * tr * 0.4, y, Math.sin(a) * tr * 0.4);
      const to = V(
        Math.cos(a) * branchLen * 0.82,
        y + branchLen * rng.range(0.05, 0.3),
        Math.sin(a) * branchLen * 0.82
      );
      build.append(branchTube(from, to, tr * 0.5, tr * 0.12, 0.12, 4, rng));
      // хвоя на ветви: несколько карт
      const cards = 3 + Math.round(rng() * 3);
      for (let c = 0; c < cards; c++) {
        const tt = rng.range(0.45, 1.0);
        const p = from.clone().lerp(to, tt);
        p.x += rng.range(-0.35, 0.35);
        p.z += rng.range(-0.35, 0.35);
        p.y += rng.range(-0.2, 0.25);
        const col = leafColorBase.clone().offsetHSL(rng.range(-0.02, 0.03), rng.range(-0.06, 0.08), rng.range(-0.05, 0.06));
        leafCard(foliage, p, rng.range(1.0, 1.9) * (0.7 + (1 - t) * 0.5), rng, col);
      }
    }
  }
  // макушка
  const topCol = leafColorBase.clone().offsetHSL(0, 0.02, 0.04);
  for (let i = 0; i < 6; i++) {
    leafCard(foliage, V(bendX * 0.8, height * rng.range(0.9, 1.02), bendZ * 0.8), rng.range(0.9, 1.5), rng, topCol);
  }

  return { trunk: build, foliage, height, radius: trunkR };
}

/** Берёза / лиственное дерево. */
export function makeBirch(rngSeed = 2, opts = {}) {
  const rng = makeRNG(rngSeed);
  const height = opts.height ?? rng.range(7, 12);
  const trunkR = opts.trunkR ?? rng.range(0.13, 0.2);
  const build = new GeoBuilder({ smooth: true });
  const foliage = new GeoBuilder({ smooth: false });

  const lean = rng.range(-1.2, 1.2);
  const pts = [];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    pts.push(V(lean * t * t * 0.9, t * height, Math.sin(t * 3.4) * 0.25 * t));
  }
  const trunk = tube(pts, trunkR, 9, { radiusFn: (t) => lerp(trunkR, trunkR * 0.25, Math.pow(t, 0.75)) });
  // белая кора с тёмными «чечевичками» через вершинные цвета
  for (let i = 0; i < trunk.vertexCount; i++) {
    const y = trunk.positions[i * 3 + 1];
    const k = 0.82 + 0.1 * Math.sin(y * 9.1) + 0.06 * Math.sin(y * 31.7 + i);
    const dark = Math.sin(y * 13.3 + i * 12.1) > 0.86 ? 0.28 : 1;
    trunk.colors[i * 3] = 0.90 * k * dark;
    trunk.colors[i * 3 + 1] = 0.90 * k * dark;
    trunk.colors[i * 3 + 2] = 0.86 * k * dark;
  }
  build.append(trunk);

  const leafColor = new THREE.Color(0x4f7038);
  const crownY = height * rng.range(0.55, 0.66);
  const branches = 5 + Math.round(rng() * 3);
  for (let b = 0; b < branches; b++) {
    const a = (b / branches) * TAU + rng.range(-0.3, 0.3);
    const fromY = crownY + rng.range(0, height * 0.22);
    const t = fromY / height;
    const tr = lerp(trunkR, trunkR * 0.25, t);
    const from = V(lean * t * t * 0.9, fromY, 0);
    const len = height * rng.range(0.16, 0.3);
    const to = V(Math.cos(a) * len, fromY + len * rng.range(0.5, 0.9), Math.sin(a) * len);
    build.append(branchTube(from, to, tr * 0.55, tr * 0.12, 0.2, 5, rng));
    const cards = 5 + Math.round(rng() * 4);
    for (let c = 0; c < cards; c++) {
      const p = from.clone().lerp(to, rng.range(0.35, 1.05));
      p.x += rng.range(-0.8, 0.8);
      p.z += rng.range(-0.8, 0.8);
      p.y += rng.range(-0.5, 0.6);
      const col = leafColor.clone().offsetHSL(rng.range(-0.03, 0.03), rng.range(-0.1, 0.1), rng.range(-0.07, 0.09));
      leafCard(foliage, p, rng.range(1.3, 2.3), rng, col);
    }
  }
  // центральный «зонт» кроны
  for (let i = 0; i < 10; i++) {
    const a = rng() * TAU;
    const r = rng.range(0.2, 1.4);
    leafCard(
      foliage,
      V(lean * 0.9 + Math.cos(a) * r, height * rng.range(0.82, 0.98), Math.sin(a) * r),
      rng.range(1.4, 2.2),
      rng,
      leafColor.clone().offsetHSL(0, 0.03, rng.range(-0.03, 0.08))
    );
  }
  return { trunk: build, foliage, height, radius: trunkR };
}

/** Сухое корявое дерево (мёртвое) — для атмосферы. */
export function makeDeadTree(rngSeed = 3, opts = {}) {
  const rng = makeRNG(rngSeed);
  const height = opts.height ?? rng.range(4, 8);
  const build = new GeoBuilder({ smooth: true });
  const r = 0.26;
  const pts = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    pts.push(V(Math.sin(t * 2.4) * 1.2 * t, t * height, Math.cos(t * 1.9) * 0.8 * t));
  }
  build.append(tube(pts, r, 8, { radiusFn: (t) => lerp(r, r * 0.25, t) }));
  const branches = 6 + Math.round(rng() * 5);
  for (let b = 0; b < branches; b++) {
    const t = rng.range(0.25, 0.95);
    const from = pts[Math.floor(t * 7)].clone();
    const a = rng() * TAU;
    const len = rng.range(0.8, 2.6) * (1 - t * 0.4);
    const to = from.clone().add(V(Math.cos(a) * len, rng.range(0.3, 1.3) * len, Math.sin(a) * len));
    build.append(branchTube(from, to, r * 0.42, r * 0.06, 0.3, 4, rng));
    // мелкие веточки
    for (let k = 0; k < 2; k++) {
      const p2 = from.clone().lerp(to, rng.range(0.4, 1));
      const a2 = a + rng.range(-1.2, 1.2);
      const l2 = len * rng.range(0.25, 0.5);
      build.append(branchTube(p2, p2.clone().add(V(Math.cos(a2) * l2, l2 * 0.7, Math.sin(a2) * l2)), r * 0.16, r * 0.03, 0.25, 3, rng));
    }
  }
  // тёмная кора
  for (let i = 0; i < build.vertexCount; i++) {
    const k = 0.5 + 0.2 * Math.sin(build.positions[i * 3] * 7.3 + build.positions[i * 3 + 1] * 5.1);
    build.colors[i * 3] = k * 0.55;
    build.colors[i * 3 + 1] = k * 0.48;
    build.colors[i * 3 + 2] = k * 0.42;
  }
  return { trunk: build, foliage: null, height, radius: r };
}

/** Куст (черника/можжевельник) — несколько стволиков и карт листвы. */
export function makeBush(rngSeed = 4, opts = {}) {
  const rng = makeRNG(rngSeed);
  const size = opts.size ?? rng.range(0.7, 1.6);
  const build = new GeoBuilder({ smooth: true });
  const foliage = new GeoBuilder({ smooth: false });
  const stems = 3 + Math.round(rng() * 4);
  for (let s = 0; s < stems; s++) {
    const a = rng() * TAU;
    const base = V(Math.cos(a) * size * 0.12, 0, Math.sin(a) * size * 0.12);
    const tip = V(Math.cos(a) * size * 0.5, size * rng.range(0.5, 1), Math.sin(a) * size * 0.5);
    build.append(branchTube(base, tip, size * 0.05, size * 0.015, 0.25, 3, rng));
    for (let c = 0; c < 5; c++) {
      const p = base.clone().lerp(tip, rng.range(0.3, 1));
      p.x += rng.range(-0.3, 0.3) * size;
      p.z += rng.range(-0.3, 0.3) * size;
      const col = new THREE.Color(0x35502c).offsetHSL(rng.range(-0.04, 0.04), rng.range(-0.1, 0.1), rng.range(-0.08, 0.08));
      leafCard(foliage, p, size * rng.range(0.6, 1.0), rng, col);
    }
  }
  return { trunk: build, foliage, height: size, radius: size * 0.5 };
}

/** Камень/валун с шумовым смещением и вершинными цветами. */
export function makeRock(rngSeed = 5, opts = {}) {
  const rng = makeRNG(rngSeed);
  const radius = opts.radius ?? rng.range(0.5, 2.2);
  const detail = opts.detail ?? 24;
  const squash = opts.squash ?? rng.range(0.5, 0.95);
  const b = noisySphere(radius, detail, (nx, ny, nz) => {
    const n1 = Math.sin(nx * 3.1 + rngSeed) * Math.cos(nz * 2.7 + rngSeed * 0.5);
    const n2 = Math.sin(ny * 5.3 + nx * 4.1) * 0.5;
    const n3 = Math.cos(nz * 7.9 + ny * 3.3) * 0.25;
    return 1 + (n1 * 0.16 + n2 * 0.09 + n3 * 0.05) + (Math.abs(ny) > 0.75 ? 0.05 : 0);
  }, { widthSeg: detail, heightSeg: Math.max(8, detail * 0.7 | 0), squash, colorFn: (u, v, px, py, pz) => {
    const n = 0.5 + 0.5 * Math.sin(px * 4.7 + py * 6.1 + pz * 5.3);
    const up = clamp(py / radius + 0.5, 0, 1);
    const moss = clamp((up - 0.55) * 2.2 + n * 0.35, 0, 1) * 0.55;
    const base = 0.62 + n * 0.24;
    return {
      r: lerp(base, 0.30, moss) * 0.96,
      g: lerp(base, 0.42, moss),
      b: lerp(base * 1.02, 0.26, moss),
    };
  } });
  return b;
}

/** Скальный утёс / гряда — несколько камней. */
export function makeCliffChunk(rngSeed = 6, opts = {}) {
  const rng = makeRNG(rngSeed);
  const b = new GeoBuilder({ smooth: true });
  const count = opts.count ?? rng.int(2, 4);
  for (let i = 0; i < count; i++) {
    const r = makeRock(rngSeed + i * 17, {
      radius: opts.radius ?? rng.range(1.6, 4.2),
      detail: 20,
      squash: rng.range(0.7, 1.5),
    });
    const m = new THREE.Matrix4().makeRotationY(rng() * TAU);
    m.setPosition(rng.range(-2, 2), rng.range(-0.5, 0.8), rng.range(-2, 2));
    b.append(r, m);
  }
  return b;
}

/** Пучок травы: несколько пересечённых карт + мелкие стебли. */
export function makeGrassTuft(rngSeed = 7, opts = {}) {
  const rng = makeRNG(rngSeed);
  const h = opts.height ?? rng.range(0.3, 0.75);
  const b = new GeoBuilder({ smooth: false });
  const cards = opts.cards ?? 3;
  for (let i = 0; i < cards; i++) {
    const ang = (i / cards) * Math.PI + rng.range(-0.3, 0.3);
    const dx = Math.cos(ang) * h * 0.55;
    const dz = Math.sin(ang) * h * 0.55;
    const lean = rng.range(-0.1, 0.1);
    const base = b.vertexCount;
    b.vert(-dx, 0, -dz, 0, 0, new THREE.Color(0x546b30));
    b.vert(dx, 0, dz, 1, 0, new THREE.Color(0x546b30));
    b.vert(dx * 1.06 + lean, h, dz * 1.06, 1, 1, new THREE.Color(0x7d9448));
    b.vert(-dx * 1.06 + lean, h, -dz * 1.06, 0, 1, new THREE.Color(0x7d9448));
    b.quad(base, base + 1, base + 2, base + 3);
  }
  return b;
}

/** Камыш: тонкие стебли с метёлками. */
export function makeReeds(rngSeed = 8, opts = {}) {
  const rng = makeRNG(rngSeed);
  const b = new GeoBuilder({ smooth: true });
  const h = opts.height ?? rng.range(1.2, 2.4);
  const count = opts.count ?? rng.int(6, 12);
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU;
    const r = rng.range(0, 0.35);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const hh = h * rng.range(0.7, 1.15);
    const lean = rng.range(-0.25, 0.25);
    const pts = [];
    const segs = 5;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      pts.push(V(x + lean * t * t * hh * 0.2, t * hh, z + lean * 0.4 * t * t * hh * 0.2));
    }
    const stalk = tube(pts, 0.018, 5, { radiusFn: (t) => lerp(0.022, 0.008, t) });
    for (let k = 0; k < stalk.vertexCount; k++) {
      const t = stalk.positions[k * 3 + 1] / hh;
      stalk.colors[k * 3] = lerp(0.42, 0.62, t);
      stalk.colors[k * 3 + 1] = lerp(0.46, 0.58, t);
      stalk.colors[k * 3 + 2] = lerp(0.24, 0.32, t);
    }
    b.append(stalk);
    // метёлка
    const tip = pts[segs];
    const head = lathe(
      [
        { x: 0.0, y: 0 },
        { x: 0.05, y: 0.1 },
        { x: 0.065, y: 0.28 },
        { x: 0.03, y: 0.42 },
        { x: 0, y: 0.46 },
      ],
      6,
      { colorFn: () => ({ r: 0.50, g: 0.42, b: 0.26 }) }
    );
    const m = new THREE.Matrix4().makeTranslation(tip.x, tip.y - 0.05, tip.z);
    b.append(head, m);
    // пара листьев
    for (let l = 0; l < 2; l++) {
      const t = rng.range(0.25, 0.7);
      const p = pts[Math.floor(t * segs)];
      const dir = V(rng.range(-1, 1), 0.5, rng.range(-1, 1)).normalize();
      const len = rng.range(0.3, 0.6);
      const start = b.vertexCount;
      const col = new THREE.Color(0x5f7238);
      b.vertV(p, 0, 0, col);
      b.vertV(p.clone().addScaledVector(dir, len * 0.5), 0.5, 0.4, col);
      b.vertV(p.clone().addScaledVector(dir, len).add(V(0, -0.18, 0)), 1, 1, col);
      b.tri(start, start + 1, start + 2);
    }
  }
  return b;
}

/** Лист кувшинки / лилия на воде. */
export function makeLilyPad(rngSeed = 9) {
  const rng = makeRNG(rngSeed);
  const b = new GeoBuilder({ smooth: true });
  const r = rng.range(0.22, 0.5);
  const segs = 16;
  const notch = rng.range(0.25, 0.5);
  const center = b.vert(0, 0, 0, 0.5, 0.5, new THREE.Color(0x2f5c33));
  const ring = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * TAU;
    const rr = r * (0.94 + 0.06 * Math.sin(a * 5));
    const y = Math.sin(a * 3) * 0.012;
    ring.push(b.vert(Math.cos(a) * rr, y, Math.sin(a) * rr, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, new THREE.Color(0x3a6b38)));
  }
  for (let i = 0; i < segs; i++) b.tri(center, ring[i + 1], ring[i]);
  return b;
}

/** Водоросли/трава под водой (для отмелей). */
export function makeKelp(rngSeed = 10, opts = {}) {
  const rng = makeRNG(rngSeed);
  const b = new GeoBuilder({ smooth: true });
  const h = opts.height ?? rng.range(0.8, 2.2);
  const count = opts.count ?? rng.int(3, 7);
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU;
    const x = Math.cos(a) * rng.range(0, 0.4);
    const z = Math.sin(a) * rng.range(0, 0.4);
    const hh = h * rng.range(0.6, 1.1);
    const sway = rng.range(-1, 1);
    const segs = 6;
    const pts = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      pts.push(V(x + Math.sin(t * 2.4) * 0.22 * sway * t, t * hh, z + Math.cos(t * 2.1) * 0.18 * sway * t));
    }
    const stem = tube(pts, 0.024, 4, { radiusFn: (t) => lerp(0.03, 0.006, t) });
    for (let k = 0; k < stem.vertexCount; k++) {
      const t = stem.positions[k * 3 + 1] / hh;
      stem.colors[k * 3] = lerp(0.16, 0.30, t);
      stem.colors[k * 3 + 1] = lerp(0.34, 0.46, t);
      stem.colors[k * 3 + 2] = lerp(0.20, 0.26, t);
    }
    b.append(stem);
    // листья-ленты
    for (let l = 0; l < 4; l++) {
      const t = rng.range(0.2, 0.95);
      const p = pts[Math.floor(t * segs)];
      const ang = rng() * TAU;
      const len = rng.range(0.2, 0.45);
      const dir = V(Math.cos(ang), rng.range(0.1, 0.7), Math.sin(ang)).normalize();
      const s0 = b.vertexCount;
      const col = new THREE.Color(0x33562c);
      const p1 = p.clone(), p2 = p.clone().addScaledVector(dir, len * 0.6), p3 = p.clone().addScaledVector(dir, len);
      const w = 0.05;
      const side = V(-dir.z, 0, dir.x).normalize().multiplyScalar(w);
      b.vertV(p1.clone().add(side), 0, 0, col);
      b.vertV(p2.clone().add(side), 0.5, 0.2, col);
      b.vertV(p3, 1, 1, col);
      b.tri(s0, s0 + 1, s0 + 2);
      b.vertV(p1.clone().sub(side), 0, 0, col);
      b.vertV(p2.clone().sub(side), 0.5, 0.2, col);
      b.vertV(p3, 1, 1, col);
      b.tri(s0 + 3, s0 + 5, s0 + 4);
    }
  }
  return b;
}

/** Чайка (летающая) — тело + крылья, анимация взмахов через userData. */
export function makeSeagull(rngSeed = 11) {
  const rng = makeRNG(rngSeed);
  const body = new GeoBuilder({ smooth: true });
  const profile = [
    { x: 0.0, y: -0.22 },
    { x: 0.06, y: -0.16 },
    { x: 0.105, y: -0.05 },
    { x: 0.115, y: 0.05 },
    { x: 0.10, y: 0.14 },
    { x: 0.07, y: 0.22 },
    { x: 0.035, y: 0.30 },
    { x: 0.0, y: 0.34 },
  ];
  const b = lathe(profile, 12, { colorFn: (u, v) => (v > 0.72 ? { r: 0.95, g: 0.95, b: 0.93 } : { r: 0.86, g: 0.88, b: 0.90 }) });
  // развернуть вдоль Z
  const m = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  body.append(b, m);
  // голова
  const head = lathe([{ x: 0.0, y: 0 }, { x: 0.055, y: 0.03 }, { x: 0.06, y: 0.09 }, { x: 0.0, y: 0.13 }], 10, {
    colorFn: () => ({ r: 0.96, g: 0.96, b: 0.95 }),
  });
  const hm = new THREE.Matrix4().makeTranslation(0, 0.045, 0.3);
  body.append(head, hm);
  // клюв
  const beak = lathe([{ x: 0.03, y: 0 }, { x: 0.018, y: 0.06 }, { x: 0.0, y: 0.10 }], 6, { colorFn: () => ({ r: 0.92, g: 0.72, b: 0.24 }) });
  const bm = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const bm2 = new THREE.Matrix4().makeTranslation(0, 0.05, 0.38);
  body.append(beak, bm2.multiply(bm));
  // хвост
  const tailB = new GeoBuilder({ smooth: false });
  const ts = tailB.vertexCount;
  tailB.vert(-0.06, 0, 0, 0, 0, new THREE.Color(0.82, 0.84, 0.86));
  tailB.vert(0.06, 0, 0, 1, 0, new THREE.Color(0.82, 0.84, 0.86));
  tailB.vert(0, -0.02, -0.26, 0.5, 1, new THREE.Color(0.9, 0.92, 0.94));
  tailB.tri(ts, ts + 2, ts + 1);
  body.append(tailB, new THREE.Matrix4().makeTranslation(0, 0, -0.16));

  // Крылья — отдельные меши для анимации
  const makeWing = (side) => {
    const w = new GeoBuilder({ smooth: false });
    const s = side;
    const pts = [
      [0, 0, 0.04], [s * 0.35, 0.02, 0.06], [s * 0.7, 0.0, 0.02], [s * 0.98, -0.02, -0.06],
      [s * 0.72, 0.0, -0.16], [s * 0.36, 0.02, -0.12], [0, 0, -0.08],
    ];
    const idx = [];
    for (const p of pts) idx.push(w.vert(p[0], p[1], p[2], 0, 0, new THREE.Color(side > 0 ? 0.88 : 0.86, 0.90, 0.93)));
    for (let i = 1; i < idx.length - 1; i++) {
      if (s > 0) w.tri(idx[0], idx[i], idx[i + 1]);
      else w.tri(idx[0], idx[i + 1], idx[i]);
    }
    // тёмные кончики
    return w;
  };
  const wingL = makeWing(1).toGeometry();
  const wingR = makeWing(-1).toGeometry();
  return { body, wingL, wingR, radius: 0.4 };
}
