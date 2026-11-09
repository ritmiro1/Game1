// ============================================================================
//  Сооружения и техника: лодка, маяк, хижина, причал, навес, костёр,
//  бак, бочки, ящики, сети, фонари, буи, плотик.
//  Все модели — сложные многосоставные меши (обшивка, обводы, такелаж).
// ============================================================================
import * as THREE from 'three';
import { GeoBuilder, tube, lathe, noisySphere, extrudeProfile, gridPlane, capsule } from '../gen/geobuilder.js';
import { makeRNG, TAU, clamp, lerp } from '../gen/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Корпус лодки: набор сечений (шпангоутов) вдоль киля, между ними — обшивка.
 * Получаем настоящие обводы: острый нос, расширяющаяся середина, плоский транец.
 */
export function makeBoatHull(opts = {}) {
  const {
    length = 4.6,
    beam = 1.5,
    depth = 0.72,
    sections = 22,
    ringPts = 14,
    sheer = 0.28, // подъём борта к носу
    deadrise = 0.32, // килеватость
    rocker = 0.16,
  } = opts;
  const b = new GeoBuilder({ smooth: true, weld: false });
  const halfL = length / 2;
  const grid = [];
  for (let i = 0; i <= sections; i++) {
    const t = i / sections; // 0 корма -> 1 нос
    const z = -halfL + t * length;
    // Плановая ширина: транец ~0.72, максимум к 55%, нос = 0
    const beamT =
      t < 0.55
        ? lerp(0.72, 1.0, Math.sin((t / 0.55) * Math.PI * 0.5))
        : Math.pow(Math.cos(((t - 0.55) / 0.45) * Math.PI * 0.5), 0.85);
    const w = (beam / 2) * Math.max(0.02, beamT);
    // Высота борта: подъём к носу
    const topY = depth + Math.pow(t, 2.2) * sheer + Math.sin(t * Math.PI) * 0.03;
    // Днище: подъём к носу (rocker)
    const bottomY = -depth * 0.35 + Math.pow(t, 2.6) * rocker;
    const row = [];
    for (let j = 0; j <= ringPts; j++) {
      const u = j / ringPts; // 0 левый борт -> 1 правый борт
      const ang = u * Math.PI;
      // профиль сечения: от левого борта вниз к килю и вверх к правому
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      let x = -cosA * w;
      let y = lerp(bottomY, topY, Math.pow(Math.abs(sinA), 0.75));
      // килеватость — V-образное днище
      const keel = (1 - Math.abs(cosA)) * deadrise * w;
      y -= keel;
      // борт слегка заваливается наружу
      x *= 1 + (1 - Math.abs(cosA)) * 0.06;
      row.push(b.vert(x, y, z, u, t));
    }
    grid.push(row);
  }
  const nCols = ringPts + 1;
  for (let i = 0; i < sections; i++) {
    for (let j = 0; j < ringPts; j++) {
      const a = grid[i][j], bb = grid[i][j + 1];
      const c = grid[i + 1][j], d = grid[i + 1][j + 1];
      b.quad(a, c, d, bb);
    }
  }
  // Транец (кормовая переборка)
  const transom = grid[0];
  const tbase = b.vertexCount;
  const cz = -halfL;
  const centerY = -depth * 0.2;
  const ci = b.vert(0, centerY, cz - 0.02, 0.5, 0.5);
  const ring = transom.map((idx) => idx);
  for (let j = 0; j < ringPts; j++) {
    b.tri(ci, ring[j + 1], ring[j]);
  }
  // Палуба/настил (внутренняя поверхность)
  const deck = new GeoBuilder({ smooth: true });
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    const z = -halfL + t * length;
    const beamT =
      t < 0.55 ? lerp(0.72, 1.0, Math.sin((t / 0.55) * Math.PI * 0.5)) : Math.pow(Math.cos(((t - 0.55) / 0.45) * Math.PI * 0.5), 0.85);
    const w = (beam / 2) * Math.max(0.02, beamT) * 0.93;
    const topY = -depth * 0.05 + Math.pow(t, 2.2) * sheer * 0.6;
    const row = [];
    for (let j = 0; j <= ringPts; j++) {
      const u = j / ringPts;
      const x = -Math.cos(u * Math.PI) * w;
      row.push(deck.vert(x, topY, z, u, t));
    }
    grid[i] = row;
  }
  for (let i = 0; i < sections; i++) {
    for (let j = 0; j < ringPts; j++) {
      const a = grid[i][j], bb = grid[i][j + 1];
      const c = grid[i + 1][j], d = grid[i + 1][j + 1];
      deck.quad(a, bb, d, c);
    }
  }
  // вершинные цвета: тёмное днище, полоса краски, дерево внутри
  const paint = new THREE.Color(0x2f5d63);
  const stripe = new THREE.Color(0xd9cfae);
  const bottom = new THREE.Color(0x5a3524);
  for (let i = 0; i < b.vertexCount; i++) {
    const y = b.positions[i * 3 + 1];
    const t = clamp((y + depth * 0.4) / (depth * 1.4), 0, 1);
    let c = bottom.clone().lerp(paint, clamp(t * 2.4, 0, 1));
    if (y > depth * 0.62) c = stripe.clone().lerp(paint, 0.15);
    b.colors[i * 3] = c.r;
    b.colors[i * 3 + 1] = c.g;
    b.colors[i * 3 + 2] = c.b;
  }
  return { hull: b, deck, length, beam, depth };
}

/** Полная лодка: корпус, планширь, банки, вёсла, мотор (опционально), фонарь, снасти. */
export function makeBoatModel(opts = {}) {
  const rng = makeRNG(opts.seed ?? 12);
  const { length = 4.6, beam = 1.5, withMotor = false, withOars = true } = opts;
  const { hull, deck, depth } = makeBoatHull({ length, beam, depth: 0.7 });
  const detail = new GeoBuilder({ smooth: true });
  const halfL = length / 2;

  // Планширь (обвязка борта) — труба по периметру
  const gunwalePts = [];
  const segs = 26;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const z = -halfL + t * length;
    const beamT =
      t < 0.55 ? lerp(0.72, 1.0, Math.sin((t / 0.55) * Math.PI * 0.5)) : Math.pow(Math.cos(((t - 0.55) / 0.45) * Math.PI * 0.5), 0.85);
    const w = (beam / 2) * Math.max(0.02, beamT) * 1.005;
    const topY = depth + Math.pow(t, 2.2) * 0.28 + Math.sin(t * Math.PI) * 0.03;
    gunwalePts.push(V(-w, topY, z));
  }
  const gunwaleR = gunwalePts.slice().reverse();
  detail.append(tube(gunwalePts, 0.035, 6, { colorFn: () => ({ r: 0.72, g: 0.66, b: 0.5 }) }));
  detail.append(tube(gunwaleR, 0.035, 6, { colorFn: () => ({ r: 0.72, g: 0.66, b: 0.5 }) }));

  // Банки (сидения)
  const seatY = -0.05;
  for (const t of [0.28, 0.55, 0.78]) {
    const z = -halfL + t * length;
    const beamT =
      t < 0.55 ? lerp(0.72, 1.0, Math.sin((t / 0.55) * Math.PI * 0.5)) : Math.pow(Math.cos(((t - 0.55) / 0.45) * Math.PI * 0.5), 0.85);
    const w = (beam / 2) * beamT * 0.95;
    const prof = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      prof.push({ x: Math.abs(Math.cos(a)) * 0.055 + 0.01, y: Math.sin(a) * 0.035 });
    }
    const seat = extrudeProfile(
      [
        { x: -w, y: -0.035 },
        { x: w, y: -0.035 },
        { x: w, y: 0.035 },
        { x: -w, y: 0.035 },
      ],
      0.26,
      { colorTop: new THREE.Color(0x9c8256), colorSide: new THREE.Color(0x8a7048) }
    );
    const m = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    m.setPosition(0, seatY + Math.pow(t, 2) * 0.1, z);
    detail.append(seat, m);
  }

  // Носовой настил / палуба
  const fore = gridPlane(beam * 0.55, 0.7, 4, 3, {
    colorFn: () => new THREE.Color(0x8d7448),
  });
  detail.append(fore, new THREE.Matrix4().makeTranslation(0, -0.02, halfL * 0.66));

  // Вёсла
  if (withOars) {
    for (const side of [-1, 1]) {
      const shaft = new GeoBuilder({ smooth: true });
      const p0 = V(side * 0.12, 0.08, -0.2);
      const p1 = V(side * 1.15, 0.16, 0.9);
      shaft.append(tube([p0, p0.clone().lerp(p1, 0.5), p1], 0.028, 6, { colorFn: () => ({ r: 0.78, g: 0.70, b: 0.52 }) }));
      // лопасть
      const blade = extrudeProfile(
        [
          { x: 0.0, y: -0.09 },
          { x: 0.34, y: -0.055 },
          { x: 0.38, y: 0.0 },
          { x: 0.34, y: 0.055 },
          { x: 0.0, y: 0.09 },
        ],
        0.016,
        { colorTop: new THREE.Color(0x9b8a66), colorSide: new THREE.Color(0x8a7a58) }
      );
      const m = new THREE.Matrix4().makeRotationZ(side * -0.1);
      const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir);
      m.makeRotationFromQuaternion(q);
      m.setPosition(p1.x, p1.y, p1.z);
      detail.append(blade, m);
      // уключина
      const oarlock = lathe([{ x: 0.02, y: 0 }, { x: 0.028, y: 0.06 }, { x: 0.02, y: 0.1 }, { x: 0.005, y: 0.11 }], 8, {
        colorFn: () => ({ r: 0.42, g: 0.36, b: 0.28 }),
      });
      detail.append(oarlock, new THREE.Matrix4().makeTranslation(side * 0.62, depth * 0.92, 0.0));
    }
  }

  // Подвесной мотор
  if (withMotor) {
    const motor = new GeoBuilder({ smooth: true });
    // корпус мотора
    const body = noisySphere(0.2, 12, (nx, ny, nz) => 1 + 0.06 * Math.sin(ny * 6), {
      colorFn: () => new THREE.Color(0x27313a),
      squash: 1.35,
    });
    motor.append(body, new THREE.Matrix4().makeTranslation(0, 0, 0));
    // нога
    motor.append(
      tube([V(0, -0.05, 0), V(0, -0.55, 0.02)], 0.05, 8, { colorFn: () => ({ r: 0.2, g: 0.22, b: 0.25 }) })
    );
    // винт
    const prop = new GeoBuilder({ smooth: false });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const s = prop.vertexCount;
      prop.vert(0, 0, 0, 0, 0, new THREE.Color(0.55, 0.5, 0.4));
      prop.vert(Math.cos(a) * 0.16, Math.sin(a) * 0.16 * 0.4, 0.04, 1, 0, new THREE.Color(0.6, 0.55, 0.45));
      prop.vert(Math.cos(a + 0.6) * 0.14, Math.sin(a + 0.6) * 0.14 * 0.4, 0.06, 1, 1, new THREE.Color(0.5, 0.46, 0.38));
      prop.tri(s, s + 1, s + 2);
      prop.tri(s, s + 2, s + 1);
    }
    motor.append(prop, new THREE.Matrix4().makeTranslation(0, -0.62, 0.03));
    // бак
    motor.append(lathe([{ x: 0.09, y: 0 }, { x: 0.11, y: 0.02 }, { x: 0.11, y: 0.18 }, { x: 0.08, y: 0.2 }], 10, {
      colorFn: () => ({ r: 0.62, g: 0.22, b: 0.18 }),
    }), new THREE.Matrix4().makeTranslation(0, 0.1, 0));
    detail.append(motor, new THREE.Matrix4().makeTranslation(0, depth * 0.92, -halfL + 0.12));
  }

  // Ящик для снастей + ведёрко
  const crate = extrudeProfile(
    [
      { x: -0.22, y: -0.14 }, { x: 0.22, y: -0.14 }, { x: 0.22, y: 0.14 }, { x: -0.22, y: 0.14 },
    ],
    0.3,
    { colorTop: new THREE.Color(0x6d5a3a), colorSide: new THREE.Color(0x5c4a2e) }
  );
  const cm = new THREE.Matrix4();
  cm.copy(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  cm.setPosition(0.0, 0.02, -halfL * 0.42);
  detail.append(crate, cm);
  const bucket = lathe(
    [
      { x: 0.13, y: 0 }, { x: 0.15, y: 0.18 }, { x: 0.155, y: 0.2 }, { x: 0.135, y: 0.2 }, { x: 0.125, y: 0.02 },
    ],
    12,
    { colorFn: () => ({ r: 0.45, g: 0.47, b: 0.48 }) }
  );
  detail.append(bucket, new THREE.Matrix4().makeTranslation(-0.35, -0.05, -halfL * 0.62));

  // Фонарь на носу (для ночной рыбалки)
  const lampPost = tube([V(0, 0, 0), V(0, 0.42, 0.02)], 0.022, 6, { colorFn: () => ({ r: 0.3, g: 0.3, b: 0.32 }) });
  detail.append(lampPost, new THREE.Matrix4().makeTranslation(0, depth * 0.98, halfL * 0.72));
  const lampBody = lathe([{ x: 0.0, y: 0 }, { x: 0.05, y: 0.02 }, { x: 0.06, y: 0.12 }, { x: 0.045, y: 0.18 }, { x: 0.0, y: 0.2 }], 10);
  const lampBuilder = new GeoBuilder();
  detail.append(lampBody, new THREE.Matrix4().makeTranslation(0, depth * 0.98 + 0.44, halfL * 0.72));

  return {
    group: { hull, deck, detail },
    dims: { length, beam, depth },
    anchors: {
      rodMount: V(0.34, depth * 0.9, halfL * 0.42),
      seat: V(0, -0.04, -halfL * 0.38),
      motor: V(0, depth * 0.92, -halfL + 0.12),
      lamp: V(0, depth * 0.98 + 0.5, halfL * 0.72),
      bow: V(0, depth + 0.2, halfL * 0.95),
      stern: V(0, depth * 0.9, -halfL + 0.2),
    },
  };
}

/** Маяк: коническая башня с винтовой лестницей снаружи, фонарная комната, галерея. */
export function makeLighthouse(opts = {}) {
  const { height = 15, baseR = 3.0, topR = 1.55 } = opts;
  const struct = new GeoBuilder({ smooth: true });
  const glass = new GeoBuilder({ smooth: true });
  const metal = new GeoBuilder({ smooth: true });

  // Цоколь
  struct.append(
    lathe(
      [
        { x: baseR * 1.28, y: 0 },
        { x: baseR * 1.24, y: 0.4 },
        { x: baseR * 1.12, y: 0.9 },
        { x: baseR * 1.04, y: 1.3 },
        { x: baseR, y: 1.35 },
      ],
      28,
      { colorFn: () => ({ r: 0.55, g: 0.55, b: 0.52 }) }
    )
  );
  // Башня с лёгким сужением и полосами
  const profile = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = lerp(baseR, topR, Math.pow(t, 0.92));
    profile.push({ x: r, y: 1.35 + t * height });
  }
  struct.append(
    lathe(profile, 30, {
      colorFn: (u, v) => {
        const band = Math.floor(v * 7) % 2;
        if (band === 0) return { r: 0.86, g: 0.84, b: 0.78 };
        return { r: 0.62, g: 0.24, b: 0.20 };
      },
    })
  );
  // Галерея
  const galleryY = 1.35 + height;
  const gallery = lathe(
    [
      { x: topR + 0.5, y: galleryY - 0.12 },
      { x: topR + 0.62, y: galleryY + 0.02 },
      { x: topR + 0.62, y: galleryY + 0.1 },
      { x: topR + 0.1, y: galleryY + 0.16 },
    ],
    26,
    { colorFn: () => ({ r: 0.46, g: 0.47, b: 0.48 }) }
  );
  metal.append(gallery);
  // Перила
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    const px = Math.cos(a) * (topR + 0.55), pz = Math.sin(a) * (topR + 0.55);
    metal.append(
      tube([V(px, galleryY + 0.1, pz), V(px, galleryY + 0.72, pz)], 0.022, 5, { colorFn: () => ({ r: 0.32, g: 0.33, b: 0.34 }) })
    );
  }
  const rail = lathe(
    [
      { x: topR + 0.56, y: galleryY + 0.72 },
      { x: topR + 0.58, y: galleryY + 0.76 },
      { x: topR + 0.56, y: galleryY + 0.78 },
    ],
    30,
    { colorFn: () => ({ r: 0.30, g: 0.31, b: 0.32 }) }
  );
  metal.append(rail);

  // Фонарная комната (стекло)
  const lampY = galleryY + 0.16;
  const lampR = topR * 0.92;
  glass.append(
    lathe(
      [
        { x: lampR, y: lampY },
        { x: lampR * 0.99, y: lampY + 1.55 },
        { x: lampR * 0.86, y: lampY + 1.9 },
      ],
      16,
      { colorFn: () => ({ r: 0.96, g: 0.86, b: 0.62 }) }
    )
  );
  // рёбра фонаря
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    metal.append(
      tube(
        [V(Math.cos(a) * lampR, lampY, Math.sin(a) * lampR), V(Math.cos(a) * lampR * 0.87, lampY + 1.9, Math.sin(a) * lampR * 0.87)],
        0.035,
        5,
        { colorFn: () => ({ r: 0.25, g: 0.26, b: 0.28 }) }
      )
    );
  }
  // купол
  metal.append(
    lathe(
      [
        { x: lampR * 0.9, y: lampY + 1.88 },
        { x: lampR * 0.78, y: lampY + 2.2 },
        { x: lampR * 0.5, y: lampY + 2.6 },
        { x: lampR * 0.2, y: lampY + 2.78 },
        { x: 0, y: lampY + 2.85 },
      ],
      22,
      { colorFn: () => ({ r: 0.34, g: 0.35, b: 0.33 }) }
    )
  );
  // шпиль и флюгер
  metal.append(tube([V(0, lampY + 2.8, 0), V(0, lampY + 3.6, 0)], 0.03, 6, { colorFn: () => ({ r: 0.5, g: 0.48, b: 0.42 }) }));
  // дверь
  const door = new GeoBuilder({ smooth: false });
  const dw = 0.55, dh = 1.9;
  const db = struct.vertexCount;
  struct.vert(-dw, 0, baseR * 1.3, 0, 0, new THREE.Color(0x3b2d20));
  struct.vert(dw, 0, baseR * 1.3, 1, 0, new THREE.Color(0x3b2d20));
  struct.vert(dw, dh, baseR * 1.28, 1, 1, new THREE.Color(0x3b2d20));
  struct.vert(-dw, dh, baseR * 1.28, 0, 1, new THREE.Color(0x3b2d20));
  struct.quad(db, db + 1, db + 2, db + 3);
  // Окна по спирали — тёмные проёмы с рамой
  const windowCol = new THREE.Color(0x1a2733);
  const frameCol = new THREE.Color(0xe8e3d4);
  for (let i = 1; i <= 5; i++) {
    const t = i / 6.2;
    const a = t * TAU * 0.9 + 0.5;
    const r = lerp(baseR, topR, Math.pow(t, 0.92)) + 0.005;
    const y = 1.35 + t * height;
    const winW = 0.24, winH = 0.4;
    const dirX = Math.cos(a), dirZ = Math.sin(a);
    const tangent = V(-dirZ, 0, dirX);
    const normal = V(dirX, 0, dirZ);
    const wb = struct.vertexCount;
    const c = V(dirX * r, y, dirZ * r);
    struct.vertV(c.clone().addScaledVector(tangent, -winW).add(V(0, -winH, 0)), 0, 0, windowCol);
    struct.vertV(c.clone().addScaledVector(tangent, winW).add(V(0, -winH, 0)), 1, 0, windowCol);
    struct.vertV(c.clone().addScaledVector(tangent, winW).add(V(0, winH, 0)), 1, 1, windowCol);
    struct.vertV(c.clone().addScaledVector(tangent, -winW).add(V(0, winH, 0)), 0, 1, windowCol);
    struct.quad(wb, wb + 1, wb + 2, wb + 3);
    // рама — чуть снаружи
    const fb = struct.vertexCount;
    const cc = c.clone().addScaledVector(normal, 0.03);
    struct.vertV(cc.clone().addScaledVector(tangent, -winW - 0.06).add(V(0, -winH - 0.06, 0)), 0, 0, frameCol);
    struct.vertV(cc.clone().addScaledVector(tangent, winW + 0.06).add(V(0, -winH - 0.06, 0)), 1, 0, frameCol);
    struct.vertV(cc.clone().addScaledVector(tangent, winW + 0.06).add(V(0, winH + 0.06, 0)), 1, 1, frameCol);
    struct.vertV(cc.clone().addScaledVector(tangent, -winW - 0.06).add(V(0, winH + 0.06, 0)), 0, 1, frameCol);
    struct.quad(fb, fb + 1, fb + 2, fb + 3);
  }
  return { struct: struct, glass, metal, height, baseR, topR, lampY: lampY + 0.8, radius: baseR * 1.3, totalHeight: lampY + 3.6 };
}

/** Хижина рыбака/смотрителя: сруб, крыша, крыльцо, окна, труба. */
export function makeCabin(opts = {}) {
  const { w = 5.4, d = 4.2, h = 2.7, roofOverhang = 0.55, style = 'log' } = opts;
  const walls = new GeoBuilder({ smooth: false });
  const roof = new GeoBuilder({ smooth: false });
  const detail = new GeoBuilder({ smooth: true });
  const glass = new GeoBuilder({ smooth: true });

  const halfW = w / 2, halfD = d / 2;
  const logR = 0.16;
  const rows = Math.floor(h / (logR * 1.7));
  for (let r = 0; r < rows; r++) {
    const y = logR + r * logR * 1.7;
    for (const [axis, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
      const len = axis === 'z' ? w + 0.5 : d + 0.5;
      const isZ = axis === 'z';
      const from = isZ ? V(-halfW - 0.25, y, sign * halfD) : V(sign * halfW, y, -halfD - 0.25);
      const to = isZ ? V(halfW + 0.25, y, sign * halfD) : V(sign * halfW, y, halfD + 0.25);
      const col = 0.62 + ((r * 7) % 3) * 0.03;
      detail.append(
        tube([from, to], logR * 0.9, 9, {
          radiusFn: (t) => logR * (0.94 + 0.06 * Math.sin(t * 9 + r)),
          colorFn: () => ({ r: 0.52 * col, g: 0.38 * col, b: 0.25 * col }),
        })
      );
    }
  }
  // Фронтоны (треугольники) на торцах
  const gableH = 1.35;
  for (const sign of [1, -1]) {
    const gb = detail.vertexCount;
    const z = sign * halfD;
    detail.vertV(V(-halfW, h, z), 0, 0, new THREE.Color(0x4a3624));
    detail.vertV(V(halfW, h, z), 1, 0, new THREE.Color(0x4a3624));
    detail.vertV(V(0, h + gableH, z), 0.5, 1, new THREE.Color(0x4a3624));
    if (sign > 0) detail.tri(gb, gb + 1, gb + 2);
    else detail.tri(gb, gb + 2, gb + 1);
  }
  // Крыша: двускатная, с выносом, «дранка» через вершинные цвета
  const ridgeY = h + gableH;
  for (const sign of [1, -1]) {
    const slopePts = [];
    const segsX = 12, segsZ = 6;
    const gridR = [];
    for (let i = 0; i <= segsX; i++) {
      const tx = i / segsX;
      const x = lerp(-halfW - roofOverhang, halfW + roofOverhang, tx);
      const row = [];
      for (let j = 0; j <= segsZ; j++) {
        const tz = j / segsZ;
        const z = lerp(-halfD - roofOverhang, halfD + roofOverhang, tz) * sign;
        const y = lerp(ridgeY, h - 0.05, Math.abs(z) / (halfD + roofOverhang)) + 0.02 * Math.sin(tx * 20);
        const shingle = (Math.floor(tx * 22) + Math.floor(tz * 9)) % 2 === 0 ? 0.9 : 0.78;
        row.push(
          roof.vert(x, y, z, tx * 6, tz * 3, { r: 0.22 * shingle, g: 0.18 * shingle, b: 0.15 * shingle })
        );
      }
      gridR.push(row);
    }
    for (let i = 0; i < segsX; i++) {
      for (let j = 0; j < segsZ; j++) {
        const a = gridR[i][j], b2 = gridR[i + 1][j], c = gridR[i + 1][j + 1], d2 = gridR[i][j + 1];
        if (sign > 0) roof.quad(a, b2, c, d2);
        else roof.quad(a, d2, c, b2);
      }
      // конёк
      const i0 = gridR[i][0];
      if (i === 0) {
        // ничb — конёк добавляем отдельно
      }
    }
  }
  // конёк
  detail.append(
    tube([V(-halfW - roofOverhang, ridgeY + 0.04, 0), V(halfW + roofOverhang, ridgeY + 0.04, 0)], 0.09, 7, {
      colorFn: () => ({ r: 0.3, g: 0.24, b: 0.18 }),
    })
  );
  // Дверь
  const doorW = 0.8, doorH = 1.95;
  const db = walls.vertexCount;
  const dz = halfD + 0.02;
  walls.vert(-doorW / 2, 0, dz, 0, 0, new THREE.Color(0x3c2a1a));
  walls.vert(doorW / 2, 0, dz, 1, 0, new THREE.Color(0x3c2a1a));
  walls.vert(doorW / 2, doorH, dz, 1, 1, new THREE.Color(0x3c2a1a));
  walls.vert(-doorW / 2, doorH, dz, 0, 1, new THREE.Color(0x3c2a1a));
  walls.quad(db, db + 1, db + 2, db + 3);
  // ручка
  detail.append(noisySphere(0.045, 7, null, { colorFn: () => ({ r: 0.6, g: 0.5, b: 0.28 }) }), new THREE.Matrix4().makeTranslation(0.28, 1.0, dz + 0.05));
  // Окна с наличниками
  const windows = [
    { x: -halfW * 0.62, y: 1.55, z: halfD + 0.02, rot: 0 },
    { x: halfW * 0.62, y: 1.55, z: halfD + 0.02, rot: 0 },
    { x: halfW + 0.02, y: 1.55, z: 0, rot: Math.PI / 2 },
  ];
  for (const win of windows) {
    const ww = 0.42, wh = 0.5;
    const m = new THREE.Matrix4().makeRotationY(win.rot);
    // стекло
    const gb = glass.vertexCount;
    const c = new THREE.Color(0x9fd0e0);
    const pts = [
      V(-ww, win.y - wh, 0), V(ww, win.y - wh, 0), V(ww, win.y + wh, 0), V(-ww, win.y + wh, 0),
    ];
    for (const p of pts) glass.vertV(p, 0, 0, c);
    glass.quad(gb, gb + 1, gb + 2, gb + 3);
    const frameM = new THREE.Matrix4().copy(m);
    frameM.setPosition(win.x, 0, win.z);
    // рама (4 бруска)
    for (const [ax, ay, bx, by] of [
      [-ww - 0.06, win.y - wh - 0.06, ww + 0.06, win.y - wh - 0.03],
      [-ww - 0.06, win.y + wh + 0.03, ww + 0.06, win.y + wh + 0.06],
      [-ww - 0.06, win.y - wh - 0.06, -ww - 0.03, win.y + wh + 0.06],
      [ww + 0.03, win.y - wh - 0.06, ww + 0.06, win.y + wh + 0.06],
    ]) {
      const fb = detail.vertexCount;
      detail.vert(ax, ay, 0.05, 0, 0, new THREE.Color(0xd8cdb2));
      detail.vert(bx, ay, 0.05, 1, 0, new THREE.Color(0xd8cdb2));
      detail.vert(bx, by, 0.05, 1, 1, new THREE.Color(0xd8cdb2));
      detail.vert(ax, by, 0.05, 0, 1, new THREE.Color(0xd8cdb2));
      detail.quad(fb, fb + 1, fb + 2, fb + 3);
    }
    for (let k = glass.vertexCount - 4; k < glass.vertexCount; k++) {
      const p = new THREE.Vector3(glass.positions[k * 3], glass.positions[k * 3 + 1], glass.positions[k * 3 + 2]);
      p.applyMatrix4(frameM);
      glass.positions[k * 3] = p.x;
      glass.positions[k * 3 + 1] = p.y;
      glass.positions[k * 3 + 2] = p.z;
    }
    const dcount = 16;
    for (let k = detail.vertexCount - dcount; k < detail.vertexCount; k++) {
      const p = new THREE.Vector3(detail.positions[k * 3], detail.positions[k * 3 + 1], detail.positions[k * 3 + 2]);
      p.applyMatrix4(frameM);
      detail.positions[k * 3] = p.x;
      detail.positions[k * 3 + 1] = p.y;
      detail.positions[k * 3 + 2] = p.z;
    }
  }
  // Труба
  detail.append(
    lathe([{ x: 0.28, y: 0 }, { x: 0.3, y: 0.2 }, { x: 0.3, y: 1.6 }, { x: 0.42, y: 1.72 }, { x: 0.42, y: 1.78 }, { x: 0.3, y: 1.8 }], 12, {
      colorFn: () => ({ r: 0.52, g: 0.5, b: 0.48 }),
    }),
    new THREE.Matrix4().makeTranslation(-halfW * 0.55, h + 0.55, -halfD * 0.4)
  );
  // Крыльцо
  const porch = new GeoBuilder({ smooth: false });
  const porchY = 0.12;
  const pb = porch.vertexCount;
  porch.vert(-1.1, porchY, halfD + 0.02, 0, 0, new THREE.Color(0x5a4630));
  porch.vert(1.1, porchY, halfD + 0.02, 1, 0, new THREE.Color(0x5a4630));
  porch.vert(1.1, porchY, halfD + 1.5, 1, 1, new THREE.Color(0x5a4630));
  porch.vert(-1.1, porchY, halfD + 1.5, 0, 1, new THREE.Color(0x5a4630));
  porch.quad(pb, pb + 1, pb + 2, pb + 3);
  // столбы крыльца
  for (const sx of [-1.0, 1.0]) {
    detail.append(
      tube([V(sx, 0, halfD + 1.4), V(sx, 2.15, halfD + 1.4)], 0.07, 7, { colorFn: () => ({ r: 0.42, g: 0.3, b: 0.2 }) })
    );
  }
  // навес
  const ab = roof.vertexCount;
  roof.vert(-1.15, 2.2, halfD + 1.55, 0, 0, { r: 0.2, g: 0.17, b: 0.14 });
  roof.vert(1.15, 2.2, halfD + 1.55, 1, 0, { r: 0.2, g: 0.17, b: 0.14 });
  roof.vert(1.15, 2.5, halfD - 0.05, 1, 1, { r: 0.24, g: 0.2, b: 0.16 });
  roof.vert(-1.15, 2.5, halfD - 0.05, 0, 1, { r: 0.24, g: 0.2, b: 0.16 });
  roof.quad(ab, ab + 1, ab + 2, ab + 3);

  return {
    walls,
    roof,
    porch,
    detail,
    glass,
    dims: { w, d, h: h + gableH, eave: h },
    anchors: { door: V(0, 0, halfD + 0.6), interior: V(0, 1.2, 0), porch: V(0, 0.12, halfD + 1.0) },
  };
}

/** Причал: сваи + настил + перила + лестница + швартовые. */
export function makeDock(opts = {}) {
  const { length = 18, width = 2.6, deckY = 1.05, postsEvery = 2.6 } = opts;
  const wood = new GeoBuilder({ smooth: false });
  const detail = new GeoBuilder({ smooth: true });
  const halfW = width / 2;

  // Настил из отдельных досок с зазорами
  const planks = Math.floor(length / 0.24);
  for (let i = 0; i < planks; i++) {
    const z = -length / 2 + i * 0.245;
    const jitter = Math.sin(i * 12.9898) * 0.012;
    const pb = wood.vertexCount;
    const tint = 0.62 + (i % 3) * 0.05;
    wood.vert(-halfW, deckY + jitter, z, 0, 0, { r: 0.36 * tint, g: 0.27 * tint, b: 0.18 * tint });
    wood.vert(halfW, deckY + jitter, z, 1, 0, { r: 0.36 * tint, g: 0.27 * tint, b: 0.18 * tint });
    wood.vert(halfW, deckY + jitter, z + 0.2, 1, 1, { r: 0.4 * tint, g: 0.3 * tint, b: 0.2 * tint });
    wood.vert(-halfW, deckY + jitter, z + 0.2, 0, 1, { r: 0.4 * tint, g: 0.3 * tint, b: 0.2 * tint });
    wood.quad(pb, pb + 1, pb + 2, pb + 3);
    // торец доски
    const tb = wood.vertexCount;
    wood.vert(-halfW, deckY - 0.05 + jitter, z + 0.2, 0, 0, { r: 0.24, g: 0.18, b: 0.12 });
    wood.vert(halfW, deckY - 0.05 + jitter, z + 0.2, 1, 0, { r: 0.24, g: 0.18, b: 0.12 });
    wood.vert(halfW, deckY + jitter, z + 0.2, 1, 1, { r: 0.3, g: 0.22, b: 0.15 });
    wood.vert(-halfW, deckY + jitter, z + 0.2, 0, 1, { r: 0.3, g: 0.22, b: 0.15 });
    wood.quad(tb, tb + 1, tb + 2, tb + 3);
  }
  // Лаги (продольные балки)
  for (const x of [-halfW + 0.18, 0, halfW - 0.18]) {
    detail.append(
      tube([V(x, deckY - 0.12, -length / 2), V(x, deckY - 0.12, length / 2)], 0.09, 7, {
        colorFn: () => ({ r: 0.26, g: 0.19, b: 0.13 }),
      })
    );
  }
  // Сваи — уходят под воду, с наклоном и «юбкой» из водорослей
  const postCount = Math.max(2, Math.floor(length / postsEvery));
  for (let i = 0; i <= postCount; i++) {
    const z = -length / 2 + (i / postCount) * length;
    for (const sign of [-1, 1]) {
      const x = sign * (halfW + 0.12);
      const lean = Math.sin(i * 1.7 + sign) * 0.06;
      detail.append(
        tube(
          [V(x + lean, deckY - 0.05, z), V(x + lean * 2.2, -4.2, z + lean)],
          0.14,
          8,
          { radiusFn: (t) => lerp(0.15, 0.12, t), colorFn: (t) => ({ r: lerp(0.32, 0.16, t), g: lerp(0.24, 0.14, t), b: lerp(0.16, 0.1, t) }) }
        )
      );
      // водоросли у воды
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;
        const y0 = 0.05 + k * 0.12;
        detail.append(
          tube(
            [V(x + Math.cos(a) * 0.16, y0, z + Math.sin(a) * 0.16), V(x + Math.cos(a) * 0.22, y0 + 0.3, z + Math.sin(a) * 0.22)],
            0.03,
            4,
            { colorFn: () => ({ r: 0.22, g: 0.3, b: 0.16 }) }
          )
        );
      }
    }
  }
  // Перила с одной стороны (где нет швартовки)
  for (let i = 0; i <= postCount; i += 1) {
    const z = -length / 2 + (i / postCount) * length;
    detail.append(
      tube([V(-halfW + 0.1, deckY, z), V(-halfW + 0.1, deckY + 0.9, z)], 0.045, 6, {
        colorFn: () => ({ r: 0.3, g: 0.22, b: 0.15 }),
      })
    );
  }
  detail.append(
    tube([V(-halfW + 0.1, deckY + 0.9, -length / 2), V(-halfW + 0.1, deckY + 0.9, length / 2)], 0.05, 6, {
      colorFn: () => ({ r: 0.34, g: 0.25, b: 0.17 }),
    })
  );
  // Швартовы (кнехты)
  for (const z of [-length / 2 + 1.5, length / 2 - 3]) {
    detail.append(
      lathe([{ x: 0.09, y: 0 }, { x: 0.1, y: 0.1 }, { x: 0.07, y: 0.16 }, { x: 0.09, y: 0.22 }, { x: 0.02, y: 0.24 }], 9, {
        colorFn: () => ({ r: 0.35, g: 0.31, b: 0.26 }),
      }),
      new THREE.Matrix4().makeTranslation(halfW - 0.35, deckY, z)
    );
  }
  // Лестница в воду
  const ladder = new GeoBuilder({ smooth: true });
  for (const sign of [-1, 1]) {
    ladder.append(tube([V(0.3 * sign, deckY, 0.3), V(0.3 * sign, -1.6, 0.9)], 0.035, 6, { colorFn: () => ({ r: 0.3, g: 0.26, b: 0.2 }) }));
  }
  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    ladder.append(
      tube([V(-0.3, lerp(deckY, -1.5, t), lerp(0.3, 0.87, t)), V(0.3, lerp(deckY, -1.5, t), lerp(0.3, 0.87, t))], 0.022, 5, {
        colorFn: () => ({ r: 0.32, g: 0.28, b: 0.22 }),
      })
    );
  }
  detail.append(ladder, new THREE.Matrix4().makeTranslation(-halfW + 0.4, 0, length / 2 - 2));

  return { wood, detail, length, width, deckY, anchors: { boatMoor: V(halfW + 1.2, 0, 2), ladder: V(-halfW + 0.4, deckY, length / 2 - 2) } };
}

/** Навес/мастерская: каркас + тент + верстак + инструменты. */
export function makeWorkshopAwning(opts = {}) {
  const { w = 4.4, d = 3.2, h = 2.4 } = opts;
  const frame = new GeoBuilder({ smooth: true });
  const cloth = new GeoBuilder({ smooth: false });
  const detail = new GeoBuilder({ smooth: true });
  const posts = [
    [-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2],
  ];
  for (const [x, z] of posts) {
    frame.append(tube([V(x, 0, z), V(x, h, z)], 0.075, 8, { colorFn: () => ({ r: 0.35, g: 0.26, b: 0.17 }) }));
  }
  // обвязка
  for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
    const A = posts[a], B = posts[b];
    frame.append(
      tube([V(A[0], h, A[1]), V(B[0], h, B[1])], 0.055, 7, { colorFn: () => ({ r: 0.33, g: 0.24, b: 0.16 }) })
    );
  }
  // тент с «парусом» (провис)
  const segsX = 10, segsZ = 8;
  const grid = [];
  for (let i = 0; i <= segsX; i++) {
    const row = [];
    for (let j = 0; j <= segsZ; j++) {
      const tx = i / segsX, tz = j / segsZ;
      const x = lerp(-w / 2 - 0.25, w / 2 + 0.25, tx);
      const z = lerp(-d / 2 - 0.25, d / 2 + 0.25, tz);
      const sag = Math.sin(tx * Math.PI) * Math.sin(tz * Math.PI) * 0.22;
      const y = h + 0.12 - sag;
      const shade = 0.86 + 0.14 * Math.sin(tx * 8 + tz * 5);
      row.push(cloth.vert(x, y, z, tx * 4, tz * 4, { r: 0.72 * shade, g: 0.62 * shade, b: 0.42 * shade }));
    }
    grid.push(row);
  }
  for (let i = 0; i < segsX; i++) {
    for (let j = 0; j < segsZ; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d2 = grid[i][j + 1];
      cloth.quad(a, d2, c, b);
    }
  }
  // верстак
  const bench = new GeoBuilder({ smooth: false });
  const by = 0.9;
  const bb = bench.vertexCount;
  bench.vert(-1.1, by, -0.45, 0, 0, new THREE.Color(0x5a442c));
  bench.vert(1.1, by, -0.45, 1, 0, new THREE.Color(0x5a442c));
  bench.vert(1.1, by, 0.35, 1, 1, new THREE.Color(0x5a442c));
  bench.vert(-1.1, by, 0.35, 0, 1, new THREE.Color(0x5a442c));
  bench.quad(bb, bb + 1, bb + 2, bb + 3);
  const bb2 = bench.vertexCount;
  bench.vert(-1.1, by, 0.35, 0, 0, new THREE.Color(0x3f2f1e));
  bench.vert(1.1, by, 0.35, 1, 0, new THREE.Color(0x3f2f1e));
  bench.vert(1.1, by - 0.1, 0.35, 1, 1, new THREE.Color(0x3f2f1e));
  bench.vert(-1.1, by - 0.1, 0.35, 0, 1, new THREE.Color(0x3f2f1e));
  bench.quad(bb2, bb2 + 1, bb2 + 2, bb2 + 3);
  for (const x of [-1.0, 1.0]) {
    for (const z of [-0.4, 0.3]) {
      frame.append(tube([V(x, 0, z), V(x, by, z)], 0.05, 6, { colorFn: () => ({ r: 0.3, g: 0.22, b: 0.15 }) }));
    }
  }
  detail.append(bench, new THREE.Matrix4().makeTranslation(0, 0, -d / 2 + 0.7));
  // инструменты на стене: пила, молоток, плоскогубцы (условно)
  const toolWall = new THREE.Matrix4().makeTranslation(0, 0, -d / 2 + 0.1);
  const saw = new GeoBuilder({ smooth: false });
  const sb = saw.vertexCount;
  saw.vert(-0.35, 1.3, 0, 0, 0, new THREE.Color(0x8a8f94));
  saw.vert(0.35, 1.55, 0, 1, 0, new THREE.Color(0x8a8f94));
  saw.vert(0.38, 1.45, 0, 1, 1, new THREE.Color(0x6d7276));
  saw.vert(-0.32, 1.24, 0, 0, 1, new THREE.Color(0x6d7276));
  saw.quad(sb, sb + 1, sb + 2, sb + 3);
  detail.append(saw, toolWall);
  detail.append(
    tube([V(0.5, 1.35, 0), V(0.5, 1.55, 0)], 0.03, 6, { colorFn: () => ({ r: 0.45, g: 0.3, b: 0.2 }) }),
    toolWall
  );
  // бочка
  detail.append(
    lathe(
      [
        { x: 0.24, y: 0 }, { x: 0.3, y: 0.2 }, { x: 0.31, y: 0.45 }, { x: 0.28, y: 0.7 }, { x: 0.24, y: 0.72 },
      ],
      14,
      { colorFn: (u, v) => (v > 0.3 && v < 0.36 ? { r: 0.3, g: 0.3, b: 0.32 } : { r: 0.42, g: 0.3, b: 0.18 }) }
    ),
    new THREE.Matrix4().makeTranslation(-w / 2 + 0.6, 0, d / 2 - 0.6)
  );
  return { frame, cloth, detail, dims: { w, d, h } };
}

/** Костёр: камни, поленья, зола. */
export function makeCampfire() {
  const rng = makeRNG(31);
  const stones = new GeoBuilder({ smooth: true });
  const wood = new GeoBuilder({ smooth: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const b = noisySphere(0.18, 10, (nx, ny, nz) => 1 + 0.18 * Math.sin(nx * 8 + ny * 5 + nz * 3), {
      colorFn: () => new THREE.Color(0x6a6a64),
      squash: 0.72,
    });
    stones.append(b, new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.62, 0.04, Math.sin(a) * 0.62));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.3;
    const p0 = V(Math.cos(a) * 0.4, 0.02, Math.sin(a) * 0.4);
    const p1 = V(Math.cos(a + 2.2) * 0.42, 0.06, Math.sin(a + 2.2) * 0.42);
    wood.append(
      tube([p0, p0.clone().lerp(p1, 0.5).add(V(0, 0.14, 0)), p1], 0.07, 6, {
        colorFn: (t) => (t > 0.35 && t < 0.65 ? { r: 0.14, g: 0.1, b: 0.08 } : { r: 0.28, g: 0.19, b: 0.12 }),
      })
    );
  }
  // зола
  stones.append(
    gridPlane(0.9, 0.9, 6, 6, { colorFn: () => new THREE.Color(0x2a2620) }),
    new THREE.Matrix4().makeTranslation(0, 0.01, 0)
  );
  return { stones, wood };
}

/** Бочка / ящик / сеть / буй — мелкие пропсы. */
export function makeBarrel(rngSeed = 33) {
  const b = lathe(
    [
      { x: 0.22, y: 0 }, { x: 0.3, y: 0.16 }, { x: 0.32, y: 0.42 }, { x: 0.29, y: 0.68 }, { x: 0.23, y: 0.76 },
    ],
    16,
    {
      colorFn: (u, v) => {
        if (Math.abs(v - 0.28) < 0.035 || Math.abs(v - 0.72) < 0.035) return { r: 0.3, g: 0.31, b: 0.33 };
        const k = 0.9 + 0.1 * Math.sin(u * 40);
        return { r: 0.42 * k, g: 0.3 * k, b: 0.18 * k };
      },
    }
  );
  return b;
}

export function makeCrate(size = 0.6, rngSeed = 35) {
  const b = new GeoBuilder({ smooth: false });
  const s = size / 2;
  const faces = [
    [[-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]],
    [[s, -s, -s], [-s, -s, -s], [-s, s, -s], [s, s, -s]],
    [[s, -s, s], [s, -s, -s], [s, s, -s], [s, s, s]],
    [[-s, -s, -s], [-s, -s, s], [-s, s, s], [-s, s, -s]],
    [[-s, s, s], [s, s, s], [s, s, -s], [-s, s, -s]],
    [[-s, -s, -s], [s, -s, -s], [s, -s, s], [-s, -s, s]],
  ];
  for (const f of faces) {
    const base = b.vertexCount;
    const col = new THREE.Color(0x7a6244).offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
    for (const p of f) b.vert(p[0], p[1], p[2], 0, 0, col);
    b.quad(base, base + 1, base + 2, base + 3);
  }
  // рёбра жёсткости
  const edges = new GeoBuilder({ smooth: true });
  for (let i = 0; i < 3; i++) {
    for (const a of [-s, s]) {
      for (const c of [-s, s]) {
        const p = [a, c];
        if (i === 0) edges.append(tube([V(-s, a, c), V(s, a, c)], 0.02, 4, { colorFn: () => ({ r: 0.42, g: 0.32, b: 0.2 }) }));
        if (i === 1) edges.append(tube([V(a, -s, c), V(a, s, c)], 0.02, 4, { colorFn: () => ({ r: 0.42, g: 0.32, b: 0.2 }) }));
        if (i === 2) edges.append(tube([V(a, c, -s), V(a, c, s)], 0.02, 4, { colorFn: () => ({ r: 0.42, g: 0.32, b: 0.2 }) }));
      }
    }
  }
  b.append(edges);
  return b;
}

export function makeBuoy(rngSeed = 37) {
  const b = new GeoBuilder({ smooth: true });
  b.append(
    lathe(
      [
        { x: 0, y: -0.3 }, { x: 0.18, y: -0.22 }, { x: 0.26, y: -0.05 }, { x: 0.24, y: 0.14 }, { x: 0.12, y: 0.26 }, { x: 0.0, y: 0.3 },
      ],
      14,
      {
        colorFn: (u, v) => (v > 0.45 ? { r: 0.82, g: 0.24, b: 0.2 } : { r: 0.9, g: 0.9, b: 0.88 }),
      }
    )
  );
  b.append(tube([V(0, 0.24, 0), V(0, 0.42, 0)], 0.02, 5, { colorFn: () => ({ r: 0.3, g: 0.3, b: 0.3 }) }));
  return b;
}

export function makeNet(rngSeed = 39) {
  const b = new GeoBuilder({ smooth: true });
  const w = 1.8, h = 1.0;
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(-w / 2, w / 2, t);
    const sag = Math.sin(t * Math.PI) * 0.28;
    b.append(
      tube([V(x, h - sag, -0.5), V(x + 0.05, h - sag + 0.02, 0.5)], 0.012, 4, {
        colorFn: () => ({ r: 0.55, g: 0.55, b: 0.5 }),
      })
    );
    b.append(
      tube([V(-w / 2 + t * 0.1, h - sag + 0.02, lerp(-0.5, 0.5, t)), V(w / 2 - t * 0.1, h - sag + 0.02, lerp(-0.5, 0.5, t))], 0.012, 4, {
        colorFn: () => ({ r: 0.55, g: 0.55, b: 0.5 }),
      })
    );
  }
  // поплавки
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const y = h + 0.04;
    b.append(
      lathe([{ x: 0, y: -0.05 }, { x: 0.06, y: 0 }, { x: 0, y: 0.05 }], 8, { colorFn: () => ({ r: 0.75, g: 0.7, b: 0.5 }) }),
      new THREE.Matrix4().makeTranslation(lerp(-w / 2, w / 2, t), y, -0.5)
    );
  }
  return b;
}

/** Плотик/дебаркадер у причала (для антуража). */
export function makeSmallPierFloat() {
  const b = new GeoBuilder({ smooth: false });
  const planks = 14;
  for (let i = 0; i < planks; i++) {
    const z = -1.9 + i * 0.28;
    const base = b.vertexCount;
    const tint = 0.7 + (i % 4) * 0.05;
    b.vert(-1.2, 0.35 + Math.sin(i * 3.1) * 0.01, z, 0, 0, { r: 0.4 * tint, g: 0.3 * tint, b: 0.2 * tint });
    b.vert(1.2, 0.35 + Math.sin(i * 3.1) * 0.01, z, 1, 0, { r: 0.4 * tint, g: 0.3 * tint, b: 0.2 * tint });
    b.vert(1.2, 0.35 + Math.sin(i * 3.1) * 0.01, z + 0.24, 1, 1, { r: 0.44 * tint, g: 0.33 * tint, b: 0.22 * tint });
    b.vert(-1.2, 0.35 + Math.sin(i * 3.1) * 0.01, z + 0.24, 0, 1, { r: 0.44 * tint, g: 0.33 * tint, b: 0.22 * tint });
    b.quad(base, base + 1, base + 2, base + 3);
  }
  // понтоны
  for (const x of [-0.9, 0.9]) {
    b.append(
      tube([V(x, 0.0, -1.9), V(x, 0.0, 1.9)], 0.22, 10, { colorFn: () => ({ r: 0.3, g: 0.33, b: 0.35 }) })
    );
  }
  return b;
}
