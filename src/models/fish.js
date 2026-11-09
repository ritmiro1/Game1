// ============================================================================
//  Рыбы: 12 видов с индивидуальной геометрией (тело, плавники, хвост, окраска),
//  процедурной анимацией плавания и параметрами для рыбалки.
// ============================================================================
import * as THREE from 'three';
import { GeoBuilder, tube, lathe } from '../gen/geobuilder.js';
import { makeRNG, clamp, lerp, TAU } from '../gen/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * species.body: параметры сечения тела
 *  len — длина в метрах, girth — толщина, hump — горб, snout — форма рыла,
 *  tailType — 'fork'|'round'|'fan', finScale — размер плавников
 */
export const SPECIES = [
  {
    id: 'perch',
    name: 'Окунь',
    latin: 'Perca fluviatilis',
    rarity: 1,
    weightRange: [0.1, 1.2],
    price: 18,
    strength: 0.45,
    biome: ['meadow', 'pine', 'rock'],
    depthRange: [1.0, 6.0],
    timeOfDay: [5, 23],
    bait: ['worm', 'maggot'],
    length: 0.28,
    girth: 0.115,
    hump: 0.18,
    tailType: 'fork',
    finScale: 1.0,
    rgb: [0.36, 0.42, 0.28],
    bellyRgb: [0.86, 0.84, 0.62],
    tintRgb: [0.18, 0.26, 0.2],
    stripes: 6,
    seed: 11,
    description: 'Полосатый обитатель камышей. Берёт почти на любую наживку.',
    flavor: 'Полосы на боках — как тени камыша на воде.',
  },
  {
    id: 'pike',
    name: 'Щука',
    latin: 'Esox lucius',
    rarity: 2,
    weightRange: [0.8, 7.5],
    price: 42,
    strength: 0.82,
    biome: ['marsh', 'meadow', 'pine'],
    depthRange: [0.8, 4.0],
    timeOfDay: [4, 22],
    bait: ['livebait', 'spinner', 'worm'],
    length: 0.62,
    girth: 0.13,
    hump: 0.02,
    tailType: 'fan',
    finScale: 0.9,
    rgb: [0.30, 0.40, 0.24],
    bellyRgb: [0.80, 0.80, 0.66],
    tintRgb: [0.42, 0.46, 0.24],
    spots: 22,
    seed: 23,
    description: 'Хищница камышовых отмелей. Длинная, зубастая, упрямая.',
    flavor: 'Камыш шевельнулся — и её уже нет.',
  },
  {
    id: 'zander',
    name: 'Судак',
    latin: 'Sander lucioperca',
    rarity: 3,
    weightRange: [1.0, 6.0],
    price: 56,
    strength: 0.75,
    biome: ['rock', 'islet1', 'islet3'],
    depthRange: [3.0, 11.0],
    timeOfDay: [18, 6],
    bait: ['livebait', 'spinner'],
    length: 0.55,
    girth: 0.12,
    hump: 0.06,
    tailType: 'fork',
    finScale: 1.1,
    rgb: [0.44, 0.48, 0.46],
    bellyRgb: [0.88, 0.89, 0.85],
    tintRgb: [0.2, 0.26, 0.28],
    stripes: 9,
    seed: 37,
    iridescent: true,
    description: 'Сумеречный охотник глубоких мест. Уважает тишину и глубину.',
    flavor: 'Стеклянный глаз, колючий плавник.',
  },
  {
    id: 'carp',
    name: 'Карп',
    latin: 'Cyprinus carpio',
    rarity: 3,
    weightRange: [1.5, 12.0],
    price: 64,
    strength: 0.9,
    biome: ['meadow', 'marsh'],
    depthRange: [1.5, 5.0],
    timeOfDay: [5, 21],
    bait: ['corn', 'dough', 'worm'],
    length: 0.68,
    girth: 0.24,
    hump: 0.3,
    tailType: 'fan',
    finScale: 1.2,
    rgb: [0.62, 0.48, 0.26],
    bellyRgb: [0.92, 0.86, 0.62],
    tintRgb: [0.45, 0.32, 0.14],
    seed: 41,
    description: 'Тяжёлый, осторожный, упорный. Тянет как трактор.',
    flavor: 'Он не торопится. Торопится вода.',
  },
  {
    id: 'bream',
    name: 'Лещ',
    latin: 'Abramis brama',
    rarity: 2,
    weightRange: [0.4, 3.2],
    price: 34,
    strength: 0.55,
    biome: ['meadow', 'bog'],
    depthRange: [2.0, 7.0],
    timeOfDay: [4, 20],
    bait: ['dough', 'maggot', 'corn'],
    length: 0.42,
    girth: 0.2,
    hump: 0.45,
    tailType: 'fork',
    finScale: 1.35,
    rgb: [0.50, 0.44, 0.30],
    bellyRgb: [0.86, 0.82, 0.66],
    tintRgb: [0.3, 0.26, 0.16],
    seed: 53,
    iridescent: true,
    description: 'Высокий, как медный таз. Любит илистое дно и утро.',
    flavor: 'Медь в воде становится светом.',
  },
  {
    id: 'trout',
    name: 'Форель',
    latin: 'Salmo trutta',
    rarity: 4,
    weightRange: [0.3, 2.5],
    price: 88,
    strength: 0.7,
    biome: ['cliff', 'pine', 'islet3'],
    depthRange: [0.6, 4.0],
    timeOfDay: [5, 10],
    bait: ['spinner', 'fly', 'worm'],
    length: 0.38,
    girth: 0.105,
    hump: 0.04,
    tailType: 'fan',
    finScale: 0.85,
    rgb: [0.44, 0.50, 0.44],
    bellyRgb: [0.94, 0.90, 0.78],
    tintRgb: [0.82, 0.42, 0.34],
    spots: 40,
    seed: 61,
    iridescent: true,
    description: 'Холодная вода у скал. Пятна, как россыпь гальки.',
    flavor: 'Прыжок — и снова только круги.',
  },
  {
    id: 'catfish',
    name: 'Сом',
    latin: 'Silurus glanis',
    rarity: 5,
    weightRange: [4.0, 25.0],
    price: 140,
    strength: 1.0,
    biome: ['bog', 'rock'],
    depthRange: [6.0, 14.0],
    timeOfDay: [20, 4],
    bait: ['livebait'],
    length: 1.15,
    girth: 0.24,
    hump: -0.15,
    tailType: 'round',
    finScale: 0.8,
    whiskers: true,
    rgb: [0.28, 0.28, 0.26],
    bellyRgb: [0.68, 0.66, 0.60],
    tintRgb: [0.18, 0.18, 0.17],
    seed: 71,
    description: 'Хозяин ямы. Ночной, тяжёлый, усы как водоросли.',
    flavor: 'Глубина дышит. Это он.',
  },
  {
    id: 'flounder',
    name: 'Камбала',
    latin: 'Platichthys flesus',
    rarity: 2,
    weightRange: [0.2, 1.8],
    price: 30,
    strength: 0.4,
    biome: ['rock', 'islet1', 'islet2', 'islet4'],
    depthRange: [1.0, 6.0],
    timeOfDay: [3, 24],
    bait: ['worm', 'maggot'],
    length: 0.26,
    girth: 0.12,
    hump: 0.0,
    flat: 0.55,
    tailType: 'fan',
    finScale: 1.0,
    rgb: [0.42, 0.36, 0.26],
    bellyRgb: [0.9, 0.88, 0.84],
    tintRgb: [0.3, 0.26, 0.2],
    spots: 30,
    seed: 83,
    description: 'Лежит на дне и притворяется песком. Получается неплохо.',
    flavor: 'Два глаза на одной стороне — смотрит на тебя.',
  },
  {
    id: 'eel',
    name: 'Угорь',
    latin: 'Anguilla anguilla',
    rarity: 4,
    weightRange: [0.5, 3.0],
    price: 96,
    strength: 0.85,
    biome: ['bog', 'marsh'],
    depthRange: [1.0, 6.0],
    timeOfDay: [21, 5],
    bait: ['livebait', 'worm'],
    length: 0.85,
    girth: 0.075,
    hump: -0.1,
    tailType: 'round',
    finScale: 0.35,
    rgb: [0.24, 0.30, 0.24],
    bellyRgb: [0.66, 0.64, 0.50],
    tintRgb: [0.18, 0.22, 0.16],
    seed: 97,
    description: 'Скользкий, ночной, будто из другого мира. Крутится в руках.',
    flavor: 'Тёмная вода хранит длинные тайны.',
  },
  {
    id: 'ide',
    name: 'Язь',
    latin: 'Leuciscus idus',
    rarity: 2,
    weightRange: [0.3, 2.2],
    price: 32,
    strength: 0.6,
    biome: ['pine', 'meadow', 'islet4'],
    depthRange: [1.0, 4.5],
    timeOfDay: [6, 20],
    bait: ['worm', 'fly', 'dough'],
    length: 0.36,
    girth: 0.1,
    hump: 0.1,
    tailType: 'fork',
    finScale: 1.0,
    rgb: [0.48, 0.54, 0.54],
    bellyRgb: [0.9, 0.9, 0.84],
    tintRgb: [0.7, 0.34, 0.24],
    seed: 101,
    iridescent: true,
    description: 'Серебристый, с краснопёрными плавниками. Живёт стаями.',
    flavor: 'Стая идёт как одно дыхание.',
  },
  {
    id: 'moonfish',
    name: 'Лунная рыба',
    latin: 'Selene lunata (легендарная)',
    rarity: 6,
    weightRange: [2.0, 9.0],
    price: 420,
    strength: 1.15,
    biome: ['foggy', 'lighthouse', 'cliff'],
    depthRange: [4.0, 16.0],
    timeOfDay: [22, 3],
    bait: ['moonbait'],
    length: 0.78,
    girth: 0.26,
    hump: 0.25,
    tailType: 'fan',
    finScale: 1.5,
    rgb: [0.58, 0.66, 0.78],
    bellyRgb: [0.95, 0.95, 0.99],
    tintRgb: [0.42, 0.52, 0.72],
    seed: 111,
    iridescent: true,
    glow: true,
    description: 'Легенда Тихого Залива. Показывается только в тумане, при луне.',
    flavor: 'Говорят, она светится изнутри — как фонарь на дне.',
  },
  {
    id: 'sturgeon',
    name: 'Осётр',
    latin: 'Acipenser sturio',
    rarity: 5,
    weightRange: [6.0, 30.0],
    price: 260,
    strength: 1.2,
    biome: ['rock', 'foggy'],
    depthRange: [8.0, 16.0],
    timeOfDay: [18, 6],
    bait: ['livebait', 'worm'],
    length: 1.3,
    girth: 0.2,
    hump: 0.0,
    tailType: 'shark',
    finScale: 0.7,
    scutes: true,
    rgb: [0.36, 0.38, 0.34],
    bellyRgb: [0.86, 0.84, 0.78],
    tintRgb: [0.24, 0.26, 0.22],
    seed: 127,
    description: 'Древний, как сам залив. Ряды костяных жучек вдоль спины.',
    flavor: 'Он помнит воду ещё пресной.',
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/**
 * Строит тело рыбы в локальных координатах: нос в +Z, спина +Y.
 * Возвращает { body, finDorsal, finCaudal, finPectoral }
 */
export function buildFishMesh(species, opts = {}) {
  const rng = makeRNG(species.seed ?? 1);
  const L = species.length * 1.0; // длина по Z
  const G = species.girth; // полувысота тела
  const hump = species.hump ?? 0;
  const flat = species.flat ?? 1; // <1 — плоская (камбала)
  const sections = 26;
  const ring = 14;

  const body = new GeoBuilder({ smooth: true, weld: false });
  const grid = [];
  for (let i = 0; i <= sections; i++) {
    const t = i / sections; // 0 хвост -> 1 голова
    const z = lerp(-L * 0.5, L * 0.5, t);
    // Профиль: тонкий хвост, полная середина, заострённый нос
    const prof = Math.pow(Math.sin(Math.pow(t, 0.82) * Math.PI), 0.62);
    const headTaper = 1 - Math.pow(clamp((t - 0.72) / 0.28, 0, 1), 1.7) * 0.82;
    let hgt = G * (prof * 0.92 + 0.12) * headTaper;
    let wid = G * 0.62 * (prof * 0.9 + 0.1) * headTaper;
    // горб/спина
    const dorsalBoost = hump * G * Math.pow(Math.sin(clamp(t, 0, 1) * Math.PI), 1.4);
    const row = [];
    for (let j = 0; j <= ring; j++) {
      const u = j / ring;
      const ang = u * TAU;
      // сечение: сплюснутое по бокам, с «килем» снизу
      const cy = Math.cos(ang);
      const sy = Math.sin(ang);
      let y = cy * hgt + dorsalBoost * clamp(cy, 0, 1);
      let x = sy * wid * flat;
      // брюшко чуть плоское
      if (cy < 0) y *= 0.86;
      // «плечи» у головы
      if (t > 0.72) y *= 1 + (t - 0.72) * 0.35;
      row.push(body.vert(x, y, z, u, t));
    }
    grid.push(row);
  }
  for (let i = 0; i < sections; i++) {
    for (let j = 0; j < ring; j++) {
      const a = grid[i][j], b = grid[i][j + 1];
      const c = grid[i + 1][j], d = grid[i + 1][j + 1];
      body.quad(a, b, d, c);
    }
  }
  // закрыть нос и хвост
  const noseCap = body.vert(0, 0, L * 0.5 + 0.002, 0.5, 1);
  const lastRow = grid[sections];
  for (let j = 0; j < ring; j++) body.tri(lastRow[j], lastRow[j + 1], noseCap);
  const tailCap = body.vert(0, 0, -L * 0.5, 0.5, 0);
  const firstRow = grid[0];
  for (let j = 0; j < ring; j++) body.tri(firstRow[j + 1], firstRow[j], tailCap);

  // окраска по телу: тёмная спина, светлое брюхо, полосы/пятна
  const spine = new THREE.Color().setRGB(...species.rgb);
  const belly = new THREE.Color().setRGB(...(species.bellyRgb ?? [0.9, 0.9, 0.85]));
  const tint = new THREE.Color().setRGB(...(species.tintRgb ?? [0.3, 0.35, 0.3]));
  const stripeCount = species.stripes ?? 0;
  const spotCount = species.spots ?? 0;
  const rngSpot = makeRNG((species.seed ?? 1) + 5);
  const spots = [];
  for (let i = 0; i < spotCount; i++) spots.push({ u: rngSpot(), v: rngSpot(), r: rngSpot.range(0.02, 0.05) });
  for (let i = 0; i < body.vertexCount; i++) {
    const x = body.positions[i * 3], y = body.positions[i * 3 + 1], z = body.positions[i * 3 + 2];
    const u = body.uvs[i * 2], v = body.uvs[i * 2 + 1];
    const up = clamp(y / (G * 1.4) + 0.5, 0, 1);
    const c = belly.clone().lerp(spine, Math.pow(clamp(up, 0, 1), 1.5));
    // полосы
    if (stripeCount > 0) {
      const s = Math.sin(v * Math.PI * stripeCount) * 0.5 + 0.5;
      if (s > 0.55) c.lerp(tint, (s - 0.55) * 1.4 * clamp(up, 0, 1));
    }
    // пятна
    if (spots.length) {
      for (const sp of spots) {
        let du = Math.abs(u - sp.u);
        du = Math.min(du, 1 - du);
        const dv = Math.abs(v - sp.v);
        if (du < sp.r && dv < sp.r * 1.6) c.lerp(tint, 0.7);
      }
    }
    // радужный отлив
    if (species.iridescent) {
      const sheen = Math.sin(v * 14 + up * 6) * 0.5 + 0.5;
      c.lerp(tint, sheen * 0.12);
    }
    // костяные жучки (осётр)
    if (species.scutes && up > 0.7 && (Math.floor(v * 22) % 2 === 0)) c.multiplyScalar(0.75);
    body.colors[i * 3] = c.r;
    body.colors[i * 3 + 1] = c.g;
    body.colors[i * 3 + 2] = c.b;
  }

  // --- Плавники
  const finScale = species.finScale ?? 1;
  const finMatColor = tint.clone().lerp(belly, 0.35);

  const makeFin = (points2D, thickness, tintCol) => {
    const b = new GeoBuilder({ smooth: false });
    for (const side of [1, -1]) {
      const base = b.vertexCount;
      for (const p of points2D) b.vert(p[0], p[1], p[2] * side, 0, 0, tintCol);
      for (let i = 1; i < points2D.length - 1; i++) {
        if (side > 0) b.tri(base, base + i, base + i + 1);
        else b.tri(base, base + i + 1, base + i);
      }
    }
    return b;
  };

  // Спинной плавник
  const dorsalH = G * 1.5 * finScale;
  const dorsalPts = [];
  const dLen = L * 0.26;
  const dZ = L * 0.06;
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    dorsalPts.push([0, G * 0.92 + hump * G + Math.sin(t * Math.PI) * dorsalH, dZ + (t - 0.5) * dLen]);
  }
  const dorsal = makeFin(dorsalPts, 0.004, finMatColor.clone().multiplyScalar(0.9));

  // Хвост
  const caudal = new GeoBuilder({ smooth: false });
  const tailBase = V(0, 0, -L * 0.5 - 0.002);
  const tailLen = L * (species.tailType === 'fan' ? 0.24 : 0.2);
  const tailSpread = G * (species.tailType === 'fan' ? 2.6 : 2.1) * finScale;
  const tailShape = () => {
    switch (species.tailType) {
      case 'fork':
        return [V(0, tailSpread * 0.9, -tailLen), V(0, 0, -tailLen * 0.35), V(0, -tailSpread * 0.9, -tailLen), V(0, 0, -tailLen * 0.1)];
      case 'round':
        return [V(0, tailSpread, -tailLen * 0.7), V(0, 0, -tailLen * 0.85), V(0, -tailSpread, -tailLen * 0.7), V(0, 0, 0)];
      case 'shark':
        return [V(0, tailSpread * 1.5, -tailLen * 1.35), V(0, tailSpread * 0.2, -tailLen * 0.5), V(0, -tailSpread * 0.7, -tailLen * 0.8), V(0, 0, 0)];
      default:
        return [V(0, tailSpread, -tailLen), V(0, tailSpread * 0.5, -tailLen * 0.4), V(0, -tailSpread, -tailLen), V(0, 0, 0)];
    }
  };
  const shape = tailShape();
  for (const side of [1, -1]) {
    const base = caudal.vertexCount;
    caudal.vertV(tailBase, 0, 0, finMatColor);
    for (const p of shape) caudal.vert(p.x, p.y, p.z + tailBase.z * 0, 0, 0, finMatColor);
    // простая триангуляция веером от основания
    const n = shape.length;
    for (let i = 0; i < n; i++) {
      const a = base + 1 + i;
      const b = base + 1 + ((i + 1) % n);
      if (side > 0) caudal.tri(base, a, b);
      else caudal.tri(base, b, a);
    }
  }

  // Грудные плавники (парные), положение — у жаберных крышек
  const pectoral = new GeoBuilder({ smooth: false });
  for (const side of [1, -1]) {
    const base = pectoral.vertexCount;
    const p0 = V(side * G * 0.55 * flat, -G * 0.25, L * 0.18);
    const p1 = V(side * (G * 0.55 + 0.1 * finScale) * flat, -G * 0.75, L * 0.02);
    const p2 = V(side * G * 0.4 * flat, -G * 0.4, L * 0.02);
    const p3 = V(side * G * 0.6 * flat, -G * 0.1, L * 0.24);
    for (const p of [p0, p1, p2, p3]) pectoral.vertV(p, 0, 0, finMatColor);
    if (side > 0) pectoral.quad(base, base + 1, base + 2, base + 3);
    else pectoral.quad(base, base + 3, base + 2, base + 1);
  }

  // Усы сома
  const whiskers = new GeoBuilder({ smooth: true });
  if (species.whiskers) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const from = V(side * G * 0.35, -G * 0.1, L * 0.46);
        const pts = [from];
        for (let s = 1; s <= 4; s++) {
          const t = s / 4;
          pts.push(
            V(
              side * (G * 0.35 + t * L * 0.18),
              -G * 0.1 - t * L * 0.05 - k * 0.01,
              L * 0.46 + t * L * (k === 0 ? 0.22 : 0.12)
            )
          );
        }
        whiskers.append(tube(pts, 0.008, 4, { radiusFn: (t) => 0.009 * (1 - t), colorFn: () => ({ r: 0.5, g: 0.46, b: 0.4 }) }));
      }
    }
  }

  const geometry = body.toGeometry({ name: 'fishBody' });
  return {
    body: geometry,
    dorsal: dorsal.toGeometry(),
    caudal: caudal.toGeometry(),
    pectoral: pectoral.toGeometry(),
    whiskers: whiskers.vertexCount > 0 ? whiskers.toGeometry() : null,
    length: L,
    girth: G,
  };
}

/**
 * Создаёт THREE.Group рыбы с анимацией плавания.
 * Возвращает объект с методом animate(t, speed).
 */
export function createFish(species, materials, opts = {}) {
  const mesh = buildFishMesh(species);
  const mat = materials.fish(species);
  const group = new THREE.Group();
  group.name = 'fish:' + species.id;

  const body = new THREE.Mesh(mesh.body, mat);
  body.castShadow = true;
  body.receiveShadow = false;
  group.add(body);

  const dorsal = new THREE.Mesh(mesh.dorsal, mat);
  dorsal.castShadow = false;
  group.add(dorsal);

  // Хвост — отдельный узел для анимации
  const caudalPivot = new THREE.Group();
  caudalPivot.position.set(0, 0, -mesh.length * 0.5);
  const caudal = new THREE.Mesh(mesh.caudal, mat);
  caudalPivot.add(caudal);
  group.add(caudalPivot);

  const pecL = new THREE.Mesh(mesh.pectoral, mat);
  group.add(pecL);

  if (mesh.whiskers) {
    const w = new THREE.Mesh(mesh.whiskers, materials.fish(species));
    group.add(w);
  }
  if (species.glow) {
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x8fb6ff,
      emissive: 0x9ec6ff,
      emissiveIntensity: 2.2,
      transparent: true,
      opacity: 0.32,
      roughness: 0.2,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(mesh.length * 0.42, 14, 10), glowMat);
    halo.scale.set(1, 0.8, 1.7);
    group.add(halo);
    group.userData.halo = halo;
  }

  // Пружинная анимация тела (изгиб по Z)
  group.userData.anim = (t, speed = 1) => {
    const w = 5.4 * speed;
    const amp = 0.16 * clamp(speed, 0.3, 2.2);
    caudalPivot.rotation.y = Math.sin(t * w) * amp * 1.7;
    body.rotation.y = Math.sin(t * w - 0.4) * amp * 0.28;
    dorsal.rotation.y = Math.sin(t * w - 0.2) * amp * 0.15;
    pecL.rotation.z = Math.sin(t * w * 0.7) * amp * 0.5;
    pecL.rotation.y = Math.sin(t * w * 0.5 + 1) * 0.12;
    if (group.userData.halo) {
      const s = 1 + Math.sin(t * 2.1) * 0.06;
      group.userData.halo.scale.set(1 * s, 0.8 * s, 1.7 * s);
    }
  };
  return group;
}

/** Ведро с рыбой (для инвентаря/садка) — визуал. */
export function makeFishBucket() {
  const b = new GeoBuilder({ smooth: true });
  b.append(
    lathe(
      [
        { x: 0.16, y: 0 }, { x: 0.19, y: 0.24 }, { x: 0.2, y: 0.26 }, { x: 0.175, y: 0.26 }, { x: 0.15, y: 0.02 },
      ],
      14,
      { colorFn: () => ({ r: 0.44, g: 0.47, b: 0.48 }) }
    )
  );
  // ручка
  b.append(tube([V(-0.2, 0.25, 0), V(0, 0.42, 0), V(0.2, 0.25, 0)], 0.008, 4, { colorFn: () => ({ r: 0.3, g: 0.3, b: 0.3 }) }));
  return b;
}
