// ============================================================================
//  GeoBuilder — низкоуровневый сборщик мешей
//  Строит BufferGeometry с позициями/нормалями/UV/вершинными цветами и
//  поддерживает сварку вершин (для гладких нормалей на изогнутых моделях).
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp, TAU } from './math.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export class GeoBuilder {
  constructor(opts = {}) {
    this.positions = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
    this.smoothGroups = new Map(); // key -> accumulated normals
    this.smooth = opts.smooth !== false;
    this.smoothGroup = opts.smoothGroup ?? 0;
    this.weldTolerance = opts.weldTolerance ?? 1e-4;
    this.useWeld = opts.weld ?? false;
    this._weldMap = new Map();
    this.uvScale = opts.uvScale ?? 1;
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  _key(x, y, z) {
    const t = this.weldTolerance;
    return `${Math.round(x / t)},${Math.round(y / t)},${Math.round(z / t)}`;
  }

  /** Добавить вершину. Возвращает индекс. */
  vert(x, y, z, u = 0, v = 0, color = null) {
    if (this.useWeld) {
      const k = this._key(x, y, z);
      const hit = this._weldMap.get(k);
      if (hit !== undefined) return hit;
      this._weldMap.set(k, this.vertexCount);
    }
    const i = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.uvs.push(u, v);
    if (color) this.colors.push(color.r, color.g, color.b);
    else this.colors.push(1, 1, 1);
    return i;
  }

  vertV(p, u = 0, v = 0, color) {
    return this.vert(p.x, p.y, p.z, u, v, color);
  }

  tri(a, b, c) {
    this.indices.push(a, b, c);
  }

  /** Треугольник с гарантированным направлением нормали (CCW при виде снаружи). */
  triOut(a, b, c) {
    this.indices.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  /** Плоский треугольник (свои нормали — для фасетных поверхностей). */
  flatTri(p0, p1, p2, uv = null, color = null) {
    const n = _v.copy(p1).sub(p0).cross(_v2.copy(p2).sub(p0)).normalize();
    if (!isFinite(n.x)) return;
    const base = this.vertexCount;
    const uv0 = uv ? uv[0] : [0, 0];
    const uv1 = uv ? uv[1] : [1, 0];
    const uv2 = uv ? uv[2] : [1, 1];
    this.vert(p0.x, p0.y, p0.z, uv0[0], uv0[1], color);
    this.vert(p1.x, p1.y, p1.z, uv1[0], uv1[1], color);
    this.vert(p2.x, p2.y, p2.z, uv2[0], uv2[1], color);
    for (let k = 0; k < 3; k++) this.normals[base + k] = [n.x, n.y, n.z];
    this.indices.push(base, base + 1, base + 2);
  }

  /** Плоский выпуклый полигон (n вершин) — «веер». */
  flatPolygon(pts, color = null, uvFn = null) {
    if (pts.length < 3) return;
    const n = _v.copy(pts[1]).sub(pts[0]).cross(_v2.copy(pts[2]).sub(pts[0])).normalize();
    if (n.lengthSq() < 1e-12) return;
    const base = this.vertexCount;
    for (const p of pts) {
      const uv = uvFn ? uvFn(p) : [0, 0];
      this.vert(p.x, p.y, p.z, uv[0], uv[1], color);
    }
    for (let i = 1; i < pts.length - 1; i++) this.indices.push(base, base + i, base + i + 1);
    if (!this.normals) this.normals = [];
    for (let i = 0; i < pts.length; i++) this.normals[base + i] = [n.x, n.y, n.z];
  }

  /** Копирование другого билдера со смещением/поворотом/масштабом. */
  append(other, matrix = null, colorOverride = null) {
    const base = this.vertexCount;
    const p = new THREE.Vector3();
    for (let i = 0; i < other.positions.length; i += 3) {
      p.set(other.positions[i], other.positions[i + 1], other.positions[i + 2]);
      if (matrix) p.applyMatrix4(matrix);
      this.positions.push(p.x, p.y, p.z);
      this.uvs.push(other.uvs[i / 3 * 2] ?? 0, other.uvs[i / 3 * 2 + 1] ?? 0);
      if (colorOverride) this.colors.push(colorOverride.r, colorOverride.g, colorOverride.b);
      else this.colors.push(other.colors[i / 3 * 3] ?? 1, other.colors[i / 3 * 3 + 1] ?? 1, other.colors[i / 3 * 3 + 2] ?? 1);
    }
    for (const idx of other.indices) this.indices.push(base + idx);
    if (other.normals) {
      if (!this.normals) this.normals = [];
      const n = new THREE.Vector3();
      for (let i = 0; i < other.normals.length; i++) {
        const nn = other.normals[i];
        n.set(nn[0], nn[1], nn[2]);
        if (matrix) n.applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
        this.normals.push([n.x, n.y, n.z]);
      }
    }
    return base;
  }

  /** Сварка вершин по позиции (уменьшает число вершин и включает гладкость). */
  welded() {
    const out = new GeoBuilder({ smooth: this.smooth, uvScale: this.uvScale });
    const map = new Map();
    const remap = new Array(this.vertexCount);
    for (let i = 0; i < this.vertexCount; i++) {
      const k = this._key(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);
      let ni = map.get(k);
      if (ni === undefined) {
        ni = out.vert(
          this.positions[i * 3],
          this.positions[i * 3 + 1],
          this.positions[i * 3 + 2],
          this.uvs[i * 2],
          this.uvs[i * 2 + 1],
          { r: this.colors[i * 3], g: this.colors[i * 3 + 1], b: this.colors[i * 3 + 2] }
        );
        map.set(k, ni);
      }
      remap[i] = ni;
    }
    for (let i = 0; i < this.indices.length; i += 3) {
      const a = remap[this.indices[i]], b = remap[this.indices[i + 1]], c = remap[this.indices[i + 2]];
      if (a === b || b === c || a === c) continue;
      out.indices.push(a, b, c);
    }
    if (this.normals) out.normals = this.normals;
    return out;
  }

  /** Знаковая вместимость (только для замкнутых мешей) — для проверки ориентации. */
  signedVolume() {
    const { positions: p, indices: idx } = this;
    let v = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      v +=
        (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
          p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
          p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
        6;
    }
    return v;
  }

  /** Развернуть все треугольники (нормали наружу) если меш вывернут. */
  orientOutward() {
    if (this.signedVolume() < 0) this.flip();
    return this;
  }

  flip() {
    const idx = this.indices;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    this.normals = null;
    return this;
  }

  computeNormals() {
    const count = this.vertexCount;
    const acc = new Float32Array(count * 3);
    const { positions, indices } = this;
    for (let i = 0; i < indices.length; i += 3) {
      const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
      const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
      const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
      const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const area2 = nx * nx + ny * ny + nz * nz;
      if (!(area2 > 1e-20)) continue;
      // нормируем вклад — устойчивее для вырожденных/тонких треугольников
      const inv = 1 / Math.sqrt(area2);
      nx *= inv; ny *= inv; nz *= inv;
      acc[ia] += nx; acc[ia + 1] += ny; acc[ia + 2] += nz;
      acc[ib] += nx; acc[ib + 1] += ny; acc[ib + 2] += nz;
      acc[ic] += nx; acc[ic + 1] += ny; acc[ic + 2] += nz;
    }
    const normals = new Array(count);
    for (let i = 0; i < count; i++) {
      let x = acc[i * 3], y = acc[i * 3 + 1], z = acc[i * 3 + 2];
      const len = Math.hypot(x, y, z) || 1;
      normals[i] = [x / len, y / len, z / len];
    }
    return normals;
  }

  toGeometry({ recomputeNormals = true, name = '' } = {}) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(this.positions);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uvs), 2));
    const cols = new Float32Array(this.colors);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    if (recomputeNormals || !this.normals) {
      const n = this.computeNormals();
      const nbuf = new Float32Array(n.length * 3);
      for (let i = 0; i < n.length; i++) {
        nbuf[i * 3] = n[i][0];
        nbuf[i * 3 + 1] = n[i][1];
        nbuf[i * 3 + 2] = n[i][2];
      }
      g.setAttribute('normal', new THREE.BufferAttribute(nbuf, 3));
    } else {
      const nbuf = new Float32Array(this.normals.length * 3);
      for (let i = 0; i < this.normals.length; i++) {
        nbuf[i * 3] = this.normals[i][0];
        nbuf[i * 3 + 1] = this.normals[i][1];
        nbuf[i * 3 + 2] = this.normals[i][2];
      }
      g.setAttribute('normal', new THREE.BufferAttribute(nbuf, 3));
    }
    const idx = this.indices.length > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.name = name;
    g.userData.stats = { verts: this.vertexCount, tris: this.indices.length / 3 };
    return g;
  }
}

// ============================================================================
//  Утилиты построения поверхностей
// ============================================================================

/**
 * Поверхность вращения по профилю (профиль: [{x:radius, y:height, uvV}]).
 * closed: замкнуть по кругу. Гладкие нормали через сварку.
 */
export function lathe(profile, segments = 24, opts = {}) {
  const { startAngle = 0, endAngle = TAU, colorFn = null, smooth = true } = opts;
  const b = new GeoBuilder({ smooth, weld: smooth, weldTolerance: opts.weldTolerance ?? 1e-5 });
  const rows = profile.length;
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const p = profile[r];
    const row = [];
    for (let s = 0; s <= segments; s++) {
      const a = lerp(startAngle, endAngle, s / segments);
      const x = Math.cos(a) * p.x;
      const z = Math.sin(a) * p.x;
      const u = s / segments;
      const v = p.uvV ?? r / (rows - 1);
      const col = colorFn ? colorFn(u, v, r, s) : null;
      row.push(b.vert(x, p.y, z, u, v, col));
    }
    grid.push(row);
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const i0 = grid[r][s], i1 = grid[r][s + 1];
      const i2 = grid[r + 1][s], i3 = grid[r + 1][s + 1];
      b.quad(i0, i2, i3, i1);
    }
  }
  b.orientOutward();
  return b;
}

/** Труба/верёвка по массиву точек с радиусом. */
export function tube(points, radius = 0.05, radial = 8, opts = {}) {
  const { closed = false, radiusFn = null, colorFn = null, smooth = true, upHint = null } = opts;
  const b = new GeoBuilder({ smooth, weld: false });
  const n = points.length;
  const up = upHint ? upHint.clone().normalize() : new THREE.Vector3(0, 1, 0);
  let normal = new THREE.Vector3();
  // параллельный перенос системы координат — стабильно на изгибах
  const t0 = new THREE.Vector3().subVectors(points[1] ?? points[0], points[0]).normalize();
  const ref = Math.abs(t0.dot(up)) > 0.95 ? new THREE.Vector3(1, 0, 0) : up;
  normal.crossVectors(t0, ref).normalize();
  const frames = [];
  for (let i = 0; i < n; i++) {
    const ip = Math.min(i + 1, n - 1), ip0 = Math.max(i - 1, 0);
    const tan = new THREE.Vector3().subVectors(points[ip], points[ip0]).normalize();
    // поворот normal в плоскость, перпендикулярную tan
    normal.sub(_v.copy(tan).multiplyScalar(normal.dot(tan))).normalize();
    if (normal.lengthSq() < 0.5) normal.crossVectors(tan, up).normalize();
    const bin = new THREE.Vector3().crossVectors(tan, normal).normalize();
    frames.push({ tan, n: normal.clone(), b: bin });
  }
  const grid = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = radiusFn ? radiusFn(t, i) : radius;
    const f = frames[i];
    const p = points[i];
    const row = [];
    for (let s = 0; s <= radial; s++) {
      const a = (s / radial) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = p.x + (f.n.x * ca + f.b.x * sa) * r;
      const y = p.y + (f.n.y * ca + f.b.y * sa) * r;
      const z = p.z + (f.n.z * ca + f.b.z * sa) * r;
      row.push(b.vert(x, y, z, s / radial, t, colorFn ? colorFn(t, s / radial) : null));
    }
    grid.push(row);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < radial; s++) {
      const i0 = grid[i][s], i1 = grid[i][s + 1];
      const i2 = grid[i + 1][s], i3 = grid[i + 1][s + 1];
      b.quad(i0, i2, i3, i1);
    }
  }
  b.orientOutward();
  return b;
}

/** Капсула (для веток/пластика) от точки A до B. */
export function capsule(a, bpt, r0, r1 = r0, radial = 10, capSegs = 4, color = null) {
  const dir = new THREE.Vector3().subVectors(bpt, a);
  const len = dir.length();
  dir.normalize();
  const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const nx = new THREE.Vector3().crossVectors(up, dir).normalize();
  const ny = new THREE.Vector3().crossVectors(dir, nx).normalize();
  const pts = [];
  const rows = Math.max(2, Math.ceil(len / 0.1));
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    pts.push(a.clone().addScaledVector(dir, len * t));
  }
  return tube(pts, r0, radial, {
    radiusFn: (t) => lerp(r0, r1, t),
    colorFn: color ? () => color : null,
  });
}

/** Экструзия 2D-контура вдоль Y с толщиной (корпус лодки, доски, вёсла). */
export function extrudeProfile(profile2D, depth, opts = {}) {
  const { bevel = 0.01, colorTop = null, colorSide = null, segmentsUv = 1 } = opts;
  const b = new GeoBuilder({ smooth: false });
  const n = profile2D.length;
  const hz = depth / 2;
  // боковые стенки
  for (let i = 0; i < n; i++) {
    const p = profile2D[i];
    const q = profile2D[(i + 1) % n];
    const uv0 = [i / n, 0], uv1 = [(i + 1) / n, 0];
    const A = new THREE.Vector3(p.x, p.y, hz);
    const B = new THREE.Vector3(q.x, q.y, hz);
    const C = new THREE.Vector3(q.x, q.y, -hz);
    const D = new THREE.Vector3(p.x, p.y, -hz);
    const base = b.vertexCount;
    b.vertV(A, uv0[0], 1, colorSide);
    b.vertV(B, uv1[0], 1, colorSide);
    b.vertV(C, uv1[0], 0, colorSide);
    b.vertV(D, uv0[0], 0, colorSide);
    b.quad(base, base + 3, base + 2, base + 1);
  }
  // крышки (треугольники веером из центра)
  const center = profile2D.reduce((acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n }), { x: 0, y: 0 });
  for (const sign of [1, -1]) {
    const cb = b.vert(center.x, center.y, hz * sign, 0.5, 0.5, colorTop);
    const ring = [];
    for (let i = 0; i < n; i++) {
      const p = profile2D[i];
      ring.push(b.vert(p.x, p.y, hz * sign, 0.5 + (p.x - center.x) * 0.5, 0.5 + (p.y - center.y) * 0.5, colorTop));
    }
    for (let i = 0; i < n; i++) {
      const a = ring[i], c = ring[(i + 1) % n];
      if (sign > 0) b.tri(cb, a, c);
      else b.tri(cb, c, a);
    }
  }
  b.orientOutward();
  return b;
}

/** Сфера с шумовым смещением (камни, валуны, кусты). */
export function noisySphere(radius, detail, displace, opts = {}) {
  const { widthSeg = detail, heightSeg = detail, squash = 1, colorFn = null } = opts;
  const b = new GeoBuilder({ smooth: true, weld: true, weldTolerance: 1e-5 });
  const grid = [];
  for (let iy = 0; iy <= heightSeg; iy++) {
    const v = iy / heightSeg;
    const phi = v * Math.PI;
    const row = [];
    for (let ix = 0; ix <= widthSeg; ix++) {
      const u = ix / widthSeg;
      const theta = u * TAU;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      let r = radius;
      if (displace) r = displace(nx, ny, nz, u, v) * radius || radius;
      const px = nx * r, py = ny * r * squash, pz = nz * r;
      row.push(b.vert(px, py, pz, u, v, colorFn ? colorFn(u, v, px, py, pz) : null));
    }
    grid.push(row);
  }
  for (let iy = 0; iy < heightSeg; iy++) {
    for (let ix = 0; ix < widthSeg; ix++) {
      const i0 = grid[iy][ix], i1 = grid[iy][ix + 1];
      const i2 = grid[iy + 1][ix], i3 = grid[iy + 1][ix + 1];
      b.quad(i0, i2, i3, i1);
    }
  }
  b.orientOutward();
  return b;
}

/** Плоскость с сеткой и функцией высоты (земля, вода, крыши). */
export function gridPlane(w, d, sw, sd, opts = {}) {
  const { heightFn = null, colorFn = null, uvScale = 1 } = opts;
  const b = new GeoBuilder({ smooth: true, weld: true, weldTolerance: 1e-5 });
  const grid = [];
  for (let iz = 0; iz <= sd; iz++) {
    const row = [];
    for (let ix = 0; ix <= sw; ix++) {
      const x = (ix / sw - 0.5) * w;
      const z = (iz / sd - 0.5) * d;
      const y = heightFn ? heightFn(x, z) : 0;
      row.push(b.vert(x, y, z, (ix / sw) * uvScale, (iz / sd) * uvScale, colorFn ? colorFn(x, z, y) : null));
    }
    grid.push(row);
  }
  for (let iz = 0; iz < sd; iz++) {
    for (let ix = 0; ix < sw; ix++) {
      const i0 = grid[iz][ix], i1 = grid[iz][ix + 1];
      const i2 = grid[iz + 1][ix], i3 = grid[iz + 1][ix + 1];
      b.quad(i0, i2, i3, i1);
    }
  }
  return b;
}

export { TAU, clamp, lerp };
