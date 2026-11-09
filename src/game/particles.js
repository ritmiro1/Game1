// ============================================================================
//  Частицы: брызги, пена, пыль, искры костра, светлячки, дым, круги на воде.
//  Реализовано на InstancedMesh с CPU-обновлением — прозрачно и дёшево.
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp, TAU, makeRNG } from '../core/math.js';

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** Базовый пул частиц с гравитацией и затуханием. */
export class ParticlePool {
  constructor(scene, opts = {}) {
    const {
      count = 300,
      size = 0.06,
      color = 0xdff0f8,
      opacity = 0.7,
      blending = THREE.NormalBlending,
      gravity = -9.0,
      drag = 0.9,
      lifeRange = [0.4, 1.2],
      geometry = null,
      material = null,
      texture = null,
    } = opts;
    this.count = count;
    this.gravity = gravity;
    this.drag = drag;
    this.lifeRange = lifeRange;
    this.max = count;

    const geo = geometry || new THREE.SphereGeometry(size, 6, 4);
    const mat =
      material ||
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending,
        map: texture,
      });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        size: 1,
        life: 0,
        ttl: 1,
        color: new THREE.Color(1, 1, 1),
      });
    }
    this.cursor = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.useColor = true;
  }

  spawn(pos, vel, opts = {}) {
    let p = null;
    for (let i = 0; i < this.max; i++) {
      const idx = (this.cursor + i) % this.max;
      if (!this.particles[idx].alive) {
        p = this.particles[idx];
        this.cursor = (idx + 1) % this.max;
        break;
      }
    }
    if (!p) {
      p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
    }
    p.alive = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.life = 0;
    p.ttl = opts.ttl ?? lerp(this.lifeRange[0], this.lifeRange[1], Math.random());
    p.size = opts.size ?? 1;
    p.gravity = opts.gravity ?? this.gravity;
    p.drag = opts.drag ?? this.drag;
    if (opts.color) p.color.set(opts.color);
    p.rot.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
    p.spin.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4
    );
    p.grow = opts.grow ?? 0;
    p.floor = opts.floor ?? -999;
    return p;
  }

  update(dt) {
    let visible = 0;
    const colors = this.mesh.instanceColor.array;
    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      p.life += dt;
      const t = p.life / p.ttl;
      if (t >= 1) {
        p.alive = false;
        continue;
      }
      p.vel.y += (p.gravity ?? this.gravity) * dt;
      p.vel.multiplyScalar(Math.pow(p.drag ?? this.drag, dt * 60));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor) {
        p.pos.y = p.floor;
        p.vel.y *= -0.24;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      const scale = p.size * (1 - Math.pow(t, 2.4)) * (1 + (p.grow || 0) * t);
      _q.setFromEuler(p.rot);
      _s.setScalar(Math.max(0.0001, scale));
      _m4.compose(p.pos, _q, _s);
      this.mesh.setMatrixAt(visible, _m4);
      colors[visible * 3] = p.color.r;
      colors[visible * 3 + 1] = p.color.g;
      colors[visible * 3 + 2] = p.color.b;
      visible++;
    }
    this.mesh.count = visible;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const p of this.particles) p.alive = false;
    this.mesh.count = 0;
  }
}

/** Круги на воде от капель/поплавка. */
export class WaterRipples {
  constructor(scene, count = 40) {
    const geo = new THREE.RingGeometry(0.12, 0.2, 24, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xe6f4fa,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < count; i++) this.items.push({ alive: false, pos: new THREE.Vector3(), t: 0, ttl: 1, max: 1 });
    this.cursor = 0;
    this.count = count;
    this.mesh.count = count;
    for (let i = 0; i < count; i++) {
      _m4.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, _m4);
    }
  }

  spawn(pos, size = 1, ttl = 1.4) {
    let it = null;
    for (let i = 0; i < this.count; i++) {
      const idx = (this.cursor + i) % this.count;
      if (!this.items[idx].alive) {
        it = this.items[idx];
        this.cursor = (idx + 1) % this.count;
        it.idx = idx;
        break;
      }
    }
    if (!it) return;
    it.alive = true;
    it.pos.copy(pos);
    it.t = 0;
    it.ttl = ttl;
    it.max = size;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.alive) continue;
      it.t += dt;
      const t = it.t / it.ttl;
      if (t >= 1) {
        it.alive = false;
        _m4.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(it.idx, _m4);
        continue;
      }
      const s = it.max * (0.4 + t * 3.4);
      _m4.compose(it.pos, _q.identity(), _s.set(s, 1, s));
      this.mesh.setMatrixAt(it.idx, _m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Тлеющие угли/ искры костра — билборды с аддитивным блендингом. */
export class EmberSystem {
  constructor(scene, origin, count = 40) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = origin.x + (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 1] = origin.y + Math.random() * 0.2;
      pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.5;
      phase[i] = Math.random();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uOrigin: { value: origin.clone() },
      uColor: { value: new THREE.Color(0xffb057) },
      uSize: { value: 26 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aPhase; uniform float uTime; uniform float uSize;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float speed = 0.5 + mod(aPhase * 7.0, 1.0) * 0.9;
          float t = fract(uTime * speed * 0.45 + aPhase);
          p.y += t * 2.4;
          p.x += sin(t * 9.0 + aPhase * 12.0) * 0.35 * t;
          p.z += cos(t * 7.0 + aPhase * 9.0) * 0.35 * t;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vAlpha = (1.0 - t) * smoothstep(0.0, 0.15, t);
          gl_PointSize = uSize * (1.0 - t * 0.6) / max(-mv.z * 0.06, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor; varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          float a = smoothstep(0.5, 0.0, r) * vAlpha;
          gl_FragColor = vec4(uColor * (1.4 - r), a);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(dt) {
    this.uniforms.uTime.value += dt;
  }
}

/** Светлячки ночью (появляются у травы). */
export class Fireflies {
  constructor(scene, terrain, count = 240) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const rng = makeRNG(4242);
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 40) {
      guard++;
      const x = (rng() - 0.5) * 480;
      const z = (rng() - 0.5) * 480;
      const y = terrain.heightAt(x, z);
      if (y < 1.1 || y > 7) continue;
      pos[placed * 3] = x;
      pos[placed * 3 + 1] = y + rng.range(0.4, 2.6);
      pos[placed * 3 + 2] = z;
      phase[placed] = rng() * TAU;
      placed++;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uVisible: { value: 0 },
      uSize: { value: 2.6 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aPhase; uniform float uTime; uniform float uSize; uniform float uVisible;
        varying float vA;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.34 + aPhase) * 1.9;
          p.y += sin(uTime * 0.51 + aPhase * 1.7) * 0.55;
          p.z += cos(uTime * 0.29 + aPhase * 1.2) * 1.9;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float blink = pow(max(sin(uTime * 1.6 + aPhase * 3.0), 0.0), 3.0);
          vA = blink * uVisible;
          gl_PointSize = uSize * (0.6 + blink) * (300.0 / max(-mv.z, 1.0));
        }
      `,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          float a = smoothstep(0.5, 0.0, r) * vA;
          gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * 2.2, a);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(dt, nightFactor) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uVisible.value = clamp(nightFactor, 0, 1);
  }
}

/** Фабрика систем частиц для мира. */
export class FXSystem {
  constructor(scene, terrain, water) {
    this.scene = scene;
    this.terrain = terrain;
    this.water = water;

    this.splash = new ParticlePool(scene, {
      count: 260,
      size: 0.055,
      color: 0xe8f6fc,
      opacity: 0.8,
      gravity: -11,
      drag: 0.94,
      lifeRange: [0.35, 0.9],
    });
    this.foam = new ParticlePool(scene, {
      count: 180,
      size: 0.11,
      color: 0xffffff,
      opacity: 0.5,
      gravity: -1.2,
      drag: 0.9,
      lifeRange: [0.8, 2.4],
    });
    this.dust = new ParticlePool(scene, {
      count: 120,
      size: 0.05,
      color: 0xbfae92,
      opacity: 0.35,
      gravity: 0.4,
      drag: 0.88,
      lifeRange: [0.6, 1.6],
    });
    this.smoke = new ParticlePool(scene, {
      count: 90,
      size: 0.16,
      color: 0x6a6a6a,
      opacity: 0.24,
      gravity: 0.9,
      drag: 0.9,
      lifeRange: [1.4, 3.2],
    });
    this.motes = new ParticlePool(scene, {
      count: 140,
      size: 0.03,
      color: 0xffe9b8,
      opacity: 0.5,
      gravity: 0.02,
      drag: 0.97,
      lifeRange: [3, 7],
      blending: THREE.AdditiveBlending,
    });
    this.ripples = new WaterRipples(scene, 46);
    this._moteTimer = 0;
  }

  /** Всплеск в точке (x,y,z) с силой. */
  splashAt(pos, strength = 1) {
    const n = Math.min(40, Math.round(8 + strength * 16));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = Math.random() * 0.6;
      const up = (0.6 + Math.random() * 1.7) * strength;
      const outward = (0.3 + Math.random() * 1.9) * strength;
      this.splash.spawn(
        _v.copy(pos).add(new THREE.Vector3(Math.cos(a) * r, 0.02, Math.sin(a) * r)),
        new THREE.Vector3(Math.cos(a) * outward, up, Math.sin(a) * outward),
        { size: 0.7 + Math.random() * 0.8, ttl: 0.4 + Math.random() * 0.6, floor: pos.y - 0.02 }
      );
    }
    for (let i = 0; i < Math.round(3 + strength * 5); i++) {
      this.foam.spawn(
        _v.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.4 * strength, 0.03, (Math.random() - 0.5) * 1.4 * strength)),
        new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4),
        { size: 1.2 + Math.random(), ttl: 1.2 + Math.random(), gravity: -0.3, floor: pos.y }
      );
    }
    this.ripples.spawn(_v.copy(pos).setY(pos.y + 0.02), 0.7 * strength, 1.5);
  }

  stepDust(pos, surface = 'grass') {
    const color = surface === 'sand' ? 0xd8cba8 : surface === 'rock' ? 0xa8a8a2 : 0x9c9478;
    for (let i = 0; i < 3; i++) {
      this.dust.spawn(
        _v.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.04, (Math.random() - 0.5) * 0.3)),
        new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4),
        { color, size: 0.7 + Math.random() * 0.6, ttl: 0.7 + Math.random() }, { color }
      );
    }
  }

  smokeAt(pos, amount = 1) {
    this.smoke.spawn(
      _v.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2)),
      new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2),
      { size: (0.8 + Math.random() * 0.8) * amount, ttl: 1.8 + Math.random() * 1.4, grow: 2.4 }
    );
  }

  pollen(dt, camera, dayFactor) {
    this._moteTimer -= dt;
    if (this._moteTimer <= 0 && dayFactor > 0.3) {
      this._moteTimer = 0.09;
      for (let i = 0; i < 2; i++) {
        const p = _v
          .copy(camera.position)
          .add(new THREE.Vector3((Math.random() - 0.5) * 22, Math.random() * 7 - 2, (Math.random() - 0.5) * 22));
        this.motes.spawn(p, new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.1 + Math.random() * 0.16, (Math.random() - 0.5) * 0.2), {
          ttl: 4 + Math.random() * 4,
          size: 0.5 + Math.random() * 0.8,
          gravity: 0,
        });
      }
    }
  }

  update(dt) {
    this.splash.update(dt);
    this.foam.update(dt);
    this.dust.update(dt);
    this.smoke.update(dt);
    this.motes.update(dt);
    this.ripples.update(dt);
  }
}
