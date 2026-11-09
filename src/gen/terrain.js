// ============================================================================
//  Ландшафт: архипелаг «Тихий Залив».
//  Высотное поле строится аналитически из описания островов + шума,
//  поэтому одинаково доступно физике, ИИ, расстановке объектов и GPU.
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm2, ridged2, noise2, TAU, makeRNG } from './math.js';
import { GeoBuilder } from './geobuilder.js';

/** Описание островов: x, z, радиус, высота, тип берега, характер. */
export const ISLANDS = [
  {
    id: 'home',
    name: 'Родной берег',
    x: 0,
    z: 0,
    r: 46,
    h: 7.2,
    beach: 12,
    seed: 11,
    biome: 'meadow',
    shoreRough: 0.34,
  },
  {
    id: 'pine',
    name: 'Сосновый остров',
    x: -138,
    z: 96,
    r: 58,
    h: 15.5,
    beach: 9,
    seed: 27,
    biome: 'pine',
    shoreRough: 0.28,
  },
  {
    id: 'lighthouse',
    name: 'Маячный утёс',
    x: 168,
    z: -126,
    r: 34,
    h: 26.0,
    beach: 5,
    seed: 41,
    biome: 'cliff',
    shoreRough: 0.22,
  },
  {
    id: 'foggy',
    name: 'Туманный остров',
    x: -196,
    z: -158,
    r: 66,
    h: 11.0,
    beach: 16,
    seed: 63,
    biome: 'bog',
    shoreRough: 0.4,
  },
  {
    id: 'stony',
    name: 'Каменная гряда',
    x: 74,
    z: 178,
    r: 26,
    h: 9.0,
    beach: 6,
    seed: 83,
    biome: 'rock',
    shoreRough: 0.5,
  },
  {
    id: 'reedbank',
    name: 'Камышовая отмель',
    x: -62,
    z: -108,
    r: 30,
    h: 2.4,
    beach: 20,
    seed: 97,
    biome: 'marsh',
    shoreRough: 0.55,
  },
  // мелкие островки-камни
  { id: 'islet1', name: 'Островок', x: 132, z: 74, r: 9, h: 3.4, beach: 5, seed: 101, biome: 'rock', shoreRough: 0.4 },
  { id: 'islet2', name: 'Островок', x: -104, z: 24, r: 7.5, h: 2.6, beach: 4, seed: 113, biome: 'rock', shoreRough: 0.45 },
  { id: 'islet3', name: 'Островок', x: 46, z: -186, r: 11, h: 4.2, beach: 6, seed: 127, biome: 'pine', shoreRough: 0.35 },
  { id: 'islet4', name: 'Островок', x: -238, z: 30, r: 13, h: 5.0, beach: 7, seed: 139, biome: 'meadow', shoreRough: 0.3 },
];

export const WORLD = {
  size: 720, // метров по стороне (игровая зона)
  gridRes: 400, // сегментов на сторону для рендера (160к треугольников)
  seaLevel: 0,
  seabedBase: -7.4,
  maxDepth: -16,
  heightMapRes: 512,
};

export class Terrain {
  constructor(opts = {}) {
    this.size = opts.size ?? WORLD.size;
    this.gridRes = opts.gridRes ?? WORLD.gridRes;
    this.seaLevel = opts.seaLevel ?? WORLD.seaLevel;
    this.islands = opts.islands ?? ISLANDS;
    this.seed = opts.seed ?? 1337;
    this._cacheMap = new Map();
    // Предрасчёт «влияния» островов для быстрого поиска ближайшего
    this.islandSorted = [...this.islands];
  }

  /** Угловая модуляция радиуса берега — изрезанная береговая линия. */
  _shoreRadius(island, ang) {
    const n1 = noise2(Math.cos(ang) * 2.1 + island.seed, Math.sin(ang) * 2.1 + island.seed, 7);
    const n2 = noise2(Math.cos(ang) * 5.3 + island.seed, Math.sin(ang) * 5.3 + island.seed, 13);
    const mod = 1 + (n1 - 0.5) * island.shoreRough * 2 + (n2 - 0.5) * island.shoreRough * 0.8;
    return island.r * mod;
  }

  /** Дно моря между островами. */
  _seabed(x, z) {
    const bank = fbm2(x * 0.006, z * 0.006, 4, 2, 0.5, this.seed);
    const ripple = fbm2(x * 0.032, z * 0.032, 3, 2, 0.5, this.seed + 41);
    const dunes = Math.sin(x * 0.05 + ripple * 6) * Math.cos(z * 0.043 - ripple * 5) * 0.6;
    let h = WORLD.seabedBase + (bank - 0.5) * 5.2 + (ripple - 0.5) * 1.6 + dunes;
    // глубокий канал через залив (не затрагивает окрестности островов)
    const channel = Math.abs(z * 0.7 + x * 0.28 + Math.sin(x * 0.011) * 26);
    let nearIsland = 0;
    for (const isl of this.islands) {
      const d = Math.hypot(x - isl.x, z - isl.z) / (isl.r * 2.6);
      nearIsland = Math.max(nearIsland, clamp(1 - d, 0, 1));
    }
    h -= smoothstep(26, 0, channel) * 6.5 * (1 - nearIsland);
    return Math.max(h, WORLD.maxDepth);
  }

  /** Основная функция высоты. Возвращает мировую Y. */
  heightAt(x, z) {
    const key = `${x.toFixed(1)},${z.toFixed(1)}`;
    let cached = this._cacheMap.get(key);
    if (cached !== undefined) return cached;

    let base = this._seabed(x, z);

    // 1) «Отмель»: дно поднимается к берегам островов (пологий шельф)
    for (const isl of this.islands) {
      const dx = x - isl.x, dz = z - isl.z;
      const d = Math.hypot(dx, dz);
      if (d > isl.r * 3.2) continue;
      const rEff = this._shoreRadius(isl, Math.atan2(dz, dx));
      const toShore = d - rEff;
      const apron = -0.85 - Math.max(0, toShore) * 0.30 - Math.max(0, -toShore) * 0.05;
      if (apron > base) base = apron;
    }

    let h = base;

    // 2) Рельеф островов
    for (const isl of this.islands) {
      const dx = x - isl.x;
      const dz = z - isl.z;
      const d = Math.hypot(dx, dz);
      if (d > isl.r * 2.3) continue;
      const ang = Math.atan2(dz, dx);
      const rEff = this._shoreRadius(isl, ang);
      const t = d / rEff;
      if (t >= 2.1) continue;
      const core = Math.pow(clamp(1 - t * t, 0, 1), 1.28);
      const ridge = ridged2(x * 0.016 + isl.seed, z * 0.016 + isl.seed, 4, isl.seed + 3);
      const detail = fbm2(x * 0.05 + isl.seed, z * 0.05 + isl.seed, 4, 2, 0.5, isl.seed + 8);
      const bump = isl.h * core * (0.78 + ridge * 0.46 + detail * 0.2);
      h += bump;
      // пляж: мягкая терраса у воды
      if (isl.beach > 0) h += smoothstep(1.5, 0.9, t) * 0.4;
      // скалистый берег: приподнятый вал у кромки
      if (isl.biome === 'cliff' || isl.biome === 'rock') {
        h += smoothstep(1.25, 0.86, t) * smoothstep(0.72, 0.92, t) * 2.1;
      }
      // болото — плоские низины
      if (isl.biome === 'bog') h = lerp(h, Math.min(h, 0.9), smoothstep(0.95, 0.6, t) * 0.55);
      if (isl.biome === 'marsh') h = lerp(h, Math.min(h, 0.45), smoothstep(0.95, 0.5, t) * 0.7);
    }

    // 3) Общая мелкая неровность (только на суше, чтобы не портить дно)
    if (h > -0.5) h += (fbm2(x * 0.12, z * 0.12, 2, 2, 0.5, this.seed + 77) - 0.5) * 0.22;

    if (this._cacheMap.size > 300000) this._cacheMap.clear();
    this._cacheMap.set(key, h);
    return h;
  }

  normalAt(x, z, eps = 0.6) {
    const hL = this.heightAt(x - eps, z);
    const hR = this.heightAt(x + eps, z);
    const hD = this.heightAt(x, z - eps);
    const hU = this.heightAt(x, z + eps);
    return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
  }

  slopeAt(x, z) {
    const n = this.normalAt(x, z);
    return 1 - n.y;
  }

  /** Тип покрытия по высоте/уклону/биому. */
  biomeAt(x, z) {
    const h = this.heightAt(x, z);
    const slope = this.slopeAt(x, z);
    if (h < this.seaLevel - 0.2) return 'underwater';
    if (h < this.seaLevel + 0.95) return 'sand';
    let nearest = null;
    let bestD = Infinity;
    for (const isl of this.islands) {
      const d = Math.hypot(x - isl.x, z - isl.z) / isl.r;
      if (d < bestD) {
        bestD = d;
        nearest = isl;
      }
    }
    if (slope > 0.42 || h > nearest.h * 0.78) return 'rock';
    if (nearest.biome === 'bog' && h < this.seaLevel + 2.6) return 'marsh';
    if (nearest.biome === 'cliff') return slope > 0.3 ? 'rock' : 'grass';
    if (h > this.seaLevel + 12) return 'rock';
    return nearest.biome === 'pine' ? 'forestFloor' : 'grass';
  }

  /** Является ли точка сушей (для размещения объектов). */
  isLand(x, z, minH = 0.6) {
    return this.heightAt(x, z) > this.seaLevel + minH;
  }

  /** Найти свободное место на главном острове рядом с точкой. */
  findFlatSpotNear(x, z, radius, opts = {}) {
    const { tries = 60, maxSlope = 0.22, minH = 1.0 } = opts;
    const rng = makeRNG(Math.floor(x * 71 + z * 13) >>> 0);
    let best = { x, z, h: this.heightAt(x, z), score: Infinity };
    for (let i = 0; i < tries; i++) {
      const a = rng() * TAU;
      const d = Math.sqrt(rng()) * radius;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const h = this.heightAt(px, pz);
      if (h < this.seaLevel + minH) continue;
      const slope = this.slopeAt(px, pz);
      const score = slope * 12 + d * 0.05 + Math.abs(h - 3) * 0.1;
      if (slope < maxSlope && score < best.score) best = { x: px, z: pz, h, score };
    }
    if (!isFinite(best.score)) best.h = this.heightAt(x, z);
    return best;
  }

  // ------------------------------------------------------------ геометрия
  /**
   * Строит меш ландшафта с вершинными цветами (смешение песка/травы/камня)
   * и атласными UV. Плотность неравномерна: центр подробнее.
   */
  buildGeometry({ res = this.gridRes, size = this.size } = {}) {
    const b = new GeoBuilder({ smooth: true, weld: false });
    const n = res + 1;
    const idx = [];
    const half = size / 2;
    const positions = new Float32Array(n * n * 3);
    const uvs = new Float32Array(n * n * 2);
    const colors = new Float32Array(n * n * 3);
    const sand = new THREE.Color(0xbfae8a);
    const grass = new THREE.Color(0x4a5c32);
    const forest = new THREE.Color(0x36452a);
    const rock = new THREE.Color(0x6d6f6a);
    const marsh = new THREE.Color(0x3d4a30);
    const wet = new THREE.Color(0x6b6650);
    const deep = new THREE.Color(0x2c3b40);
    const tmp = new THREE.Color();
    let k = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        // неравномерная сетка: центр острова подробнее
        const u = (i / res) * 2 - 1;
        const v = (j / res) * 2 - 1;
        const warp = (t) => Math.sign(t) * Math.pow(Math.abs(t), 1.22);
        const x = warp(u) * half;
        const z = warp(v) * half;
        const y = this.heightAt(x, z);
        positions[k * 3] = x;
        positions[k * 3 + 1] = y;
        positions[k * 3 + 2] = z;
        uvs[k * 2] = x / 16;
        uvs[k * 2 + 1] = z / 16;

        // цвет по биому и высоте
        const slope = this.slopeAt(x, z);
        const sea = this.seaLevel;
        if (y < sea - 0.15) {
          const t2 = clamp((sea - y) / 9, 0, 1);
          tmp.copy(wet).lerp(deep, t2);
        } else if (y < sea + 1.15) {
          tmp.copy(sand).lerp(wet, clamp((sea + 1.15 - y) / 1.4, 0, 1) * 0.4);
        } else {
          const biome = this.biomeAt(x, z);
          if (biome === 'rock') tmp.copy(rock);
          else if (biome === 'forestFloor') tmp.copy(forest);
          else if (biome === 'marsh') tmp.copy(marsh);
          else tmp.copy(grass);
          // переход к песку у кромки
          tmp.lerp(sand, smoothstep(1.15, 2.4, 1.15 + (sea + 2.4 - y)) * 0.0 + smoothstep(sea + 2.6, sea + 1.2, y) * 0.7);
          // пятна растительности
          const patch = fbm2(x * 0.07, z * 0.07, 3, 2, 0.5, 17);
          tmp.offsetHSL(0, 0, (patch - 0.5) * 0.07);
          // камень на крутых склонах
          tmp.lerp(rock, smoothstep(0.2, 0.55, slope) * 0.85);
        }
        colors[k * 3] = tmp.r;
        colors[k * 3 + 1] = tmp.g;
        colors[k * 3 + 2] = tmp.b;
        k++;
      }
    }
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const a = j * n + i;
        const b2 = a + 1;
        const c = a + n;
        const d = c + 1;
        idx.push(a, c, d, a, d, b2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.name = 'terrain';
    g.userData.stats = { verts: n * n, tris: res * res * 2 };
    return g;
  }

  /** Текстура высот для воды (пена/мелководье) — R = нормированная высота. */
  buildHeightTexture(res = WORLD.heightMapRes) {
    const size = this.size;
    const data = new Uint8Array(res * res * 4);
    const minH = -14, maxH = 26;
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const wx = (x / (res - 1) - 0.5) * size;
        const wz = (y / (res - 1) - 0.5) * size;
        const h = this.heightAt(wx, wz);
        const v = clamp((h - minH) / (maxH - minH), 0, 1) * 255;
        const i = (y * res + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    tex.userData = { minH, maxH, bounds: { minX: -size / 2, minZ: -size / 2, sizeX: size, sizeZ: size } };
    return tex;
  }

  /** Точки для расстановки растительности/камней по биомам. */
  scatter({ count = 4000, seed = 5, area = this.size * 0.85, filter = null } = {}) {
    const rng = makeRNG(seed);
    const out = [];
    let guard = 0;
    while (out.length < count && guard < count * 40) {
      guard++;
      const x = (rng() - 0.5) * area;
      const z = (rng() - 0.5) * area;
      const y = this.heightAt(x, z);
      if (y < this.seaLevel + 0.7) continue;
      const slope = this.slopeAt(x, z);
      if (slope > 0.5) continue;
      const biome = this.biomeAt(x, z);
      const p = filter ? filter(x, z, y, biome, slope, rng) : 1;
      if (p <= 0 || rng() > p) continue;
      out.push({ x, y, z, biome, slope, rng: rng() });
    }
    return out;
  }

  /** Ближайший остров (для квестов/навигации). */
  nearestIsland(x, z) {
    let best = this.islands[0], bestD = Infinity;
    for (const isl of this.islands) {
      const d = Math.hypot(x - isl.x, z - isl.z);
      if (d < bestD) {
        bestD = d;
        best = isl;
      }
    }
    return { island: best, distance: bestD };
  }
}
