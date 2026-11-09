// ============================================================================
//  Лодка: физика плавучести (выталкивание по погружённому объёму),
//  инерция, крен на волнах, управление (газ/руль), расчёт кильватерной волны.
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp, damp, smoothstep, TAU } from '../core/math.js';
import { waterNormal } from '../core/water.js';

export class Boat {
  constructor(opts) {
    const { group, dims, anchors, world, water, audio, fx } = opts;
    this.group = group;
    this.dims = dims;
    this.anchors = anchors;
    this.world = world;
    this.water = water;
    this.audio = audio;
    this.fx = fx;
    this.terrain = world.terrain;

    // Состояние
    this.position = group.position.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = group.rotation.y;
    this.yawRate = 0;
    this.pitch = 0;
    this.roll = 0;
    this.pitchVel = 0;
    this.rollVel = 0;
    this.heave = 0;
    this.heaveVel = 0;
    this.throttle = 0;
    this.rudder = 0;
    this.engineOn = false;
    this.occupied = false;
    this.engineRpm = 0;
    this.bobPhase = Math.random() * TAU;
    this.splashTimer = 0;
    this.wakeTimer = 0;

    // Физические параметры
    this.mass = 380;
    this.drag = 0.9;
    this.maxThrust = 5200;
    this.maxSpeed = 7.4;
    this.turnRate = 0.72;
    this.buoyancy = 1.0;

    this._tmp = new THREE.Vector3();
    this._bowPos = new THREE.Vector3();
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get seatWorldPosition() {
    const p = this.position.clone();
    const off = new THREE.Vector3(0, 0.32, -this.dims.length * 0.14);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return p.add(off);
  }

  getSeatPosition() {
    const p = this.position.clone();
    const off = new THREE.Vector3(0, 0.3, -this.dims.length * 0.2);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return p.add(off);
  }

  /** Забраться в лодку / выйти. */
  enter() {
    this.occupied = true;
    this.engineOn = true;
    this.audio?.sfx('engine_start', { volume: 0.8 });
  }

  exit() {
    this.occupied = false;
    this.throttle = 0;
    this.rudder = 0;
    this.engineOn = false;
  }

  update(dt, input, atmosphere) {
    const waterH = this.water.getHeight(this.position.x, this.position.z);
    const n = waterNormal(this.position.x, this.position.z, this.water.time, this.water.ampScale);

    // ---- Тяга
    let throttleTarget = 0;
    let rudderTarget = 0;
    if (input && this.occupied) {
      if (input.forward) throttleTarget = 1;
      if (input.back) throttleTarget = -0.45;
      if (input.left) rudderTarget = 1;
      if (input.right) rudderTarget = -1;
    }
    this.throttle = damp(this.throttle, throttleTarget, 2.6, dt);
    this.rudder = damp(this.rudder, rudderTarget, 4.2, dt);
    this.engineRpm = damp(this.engineRpm, Math.abs(this.throttle) * 0.85 + (this.engineOn ? 0.12 : 0), 3, dt);

    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);

    // сопротивление воды зависит от скорости
    const speed = this.speed;
    let thrust = this.throttle * this.maxThrust * (1 - clamp(speed / (this.maxSpeed * 1.15), 0, 0.92));
    // мелководье/берег — сопротивление
    const groundH = this.terrain.heightAt(this.position.x, this.position.z);
    const depth = waterH - groundH;
    const draft = 0.55;
    if (depth < draft * 1.8) thrust *= clamp((depth - 0.1) / (draft * 1.8), 0, 1);

    this.velocity.x += (fwd.x * thrust / this.mass) * dt;
    this.velocity.z += (fwd.z * thrust / this.mass) * dt;

    // боковое сопротивление (киль держит)
    const latVel = this.velocity.x * right.x + this.velocity.z * right.z;
    const fwdVel = this.velocity.x * fwd.x + this.velocity.z * fwd.z;
    const latDrag = Math.exp(-6.5 * dt);
    const fwdDrag = Math.exp(-0.85 * dt);
    this.velocity.x = right.x * latVel * latDrag + fwd.x * fwdVel * fwdDrag;
    this.velocity.z = right.z * latVel * latDrag + fwd.z * fwdVel * fwdDrag;

    // курс: поворот от руля (эффективнее на ходу)
    const steerAuthority = clamp(0.28 + Math.abs(fwdVel) / 3.4, 0, 1.6);
    this.yawRate = damp(this.yawRate, this.rudder * this.turnRate * steerAuthority * (fwdVel < -0.2 ? -1 : 1), 6, dt);
    this.yaw += this.yawRate * dt;

    // ---- Движение
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // ---- Плавучесть: пружина к уровню воды + наклон по нормали волны
    const sampleFront = this.water.getHeight(this.position.x + fwd.x * this.dims.length * 0.4, this.position.z + fwd.z * this.dims.length * 0.4);
    const sampleBack = this.water.getHeight(this.position.x - fwd.x * this.dims.length * 0.4, this.position.z - fwd.z * this.dims.length * 0.4);
    const sampleL = this.water.getHeight(this.position.x - right.x * this.dims.beam * 0.5, this.position.z - right.z * this.dims.beam * 0.5);
    const sampleR = this.water.getHeight(this.position.x + right.x * this.dims.beam * 0.5, this.position.z + right.z * this.dims.beam * 0.5);
    const avgH = (sampleFront + sampleBack + sampleL + sampleR + waterH) / 5;

    // высота «погружения» — чем быстрее, тем сильнее поднимается нос на волне
    const targetY = avgH + 0.06;
    const springK = 55, springD = 9.6;
    this.heaveVel += (targetY - this.position.y) * springK * dt;
    this.heaveVel *= Math.exp(-springD * dt);
    this.position.y += this.heaveVel * dt;

    // Дифферент (pitch) по разнице высот нос/корма + реакция на тягу
    const pitchWave = Math.atan2(sampleFront - sampleBack, this.dims.length * 0.8);
    const pitchThrust = -this.throttle * 0.075 - clamp(fwdVel * 0.012, -0.12, 0.16);
    const targetPitch = pitchWave * 0.8 + pitchThrust;
    this.pitchVel += (targetPitch - this.pitch) * 36 * dt;
    this.pitchVel *= Math.exp(-7 * dt);
    this.pitch += this.pitchVel * dt;

    // Крен по разнице бортов + центробежный в повороте
    const rollWave = Math.atan2(sampleR - sampleL, this.dims.beam);
    const rollTurn = -this.yawRate * 1.5 * clamp(Math.abs(fwdVel) / 4, 0, 1);
    const targetRoll = rollWave * 0.9 + rollTurn;
    this.rollVel += (targetRoll - this.roll) * 36 * dt;
    this.rollVel *= Math.exp(-6.5 * dt);
    this.roll += this.rollVel * dt;

    // ---- Применяем трансформации
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.yaw, 0);
    this.group.rotateX(this.pitch);
    this.group.rotateZ(this.roll);

    // ---- Волновые брызги и кильватер
    this.splashTimer -= dt;
    this.wakeTimer -= dt;
    const speedFactor = clamp(Math.abs(fwdVel) / this.maxSpeed, 0, 1.4);
    if (speedFactor > 0.32 && this.wakeTimer <= 0) {
      this.wakeTimer = lerp(0.19, 0.045, speedFactor);
      const bow = new THREE.Vector3(0, 0.02, this.dims.length * 0.45);
      bow.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      bow.add(this.position);
      bow.y = waterH + 0.03;
      this.fx?.ripples.spawn(bow, 0.9 + speedFactor * 0.9, 1.6);
      const stern = new THREE.Vector3(0, 0.02, -this.dims.length * 0.5);
      stern.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      stern.add(this.position);
      stern.y = waterH + 0.02;
      this.fx?.ripples.spawn(stern, 0.75 + speedFactor, 2.0);
      if (Math.random() < 0.4) {
        this.fx?.splash.spawn(
          bow,
          new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + speedFactor, (Math.random() - 0.5) * 1.2),
          { size: 0.5, ttl: 0.7, gravity: -8, floor: waterH }
        );
      }
    }

    // Звук мотора
    if (this.audio) {
      this.audio.setAmbience({
        rain: atmosphere?.weather?.rain ?? 0,
        wind: atmosphere?.weather?.wind ?? 0.5,
        engine: this.engineOn ? 0.35 + speedFactor * 0.65 : 0,
        engineRpm: this.engineRpm,
      });
    }

    // Столкновение с берегом — мягкий отскок
    if (depth < 0.35) {
      this.velocity.multiplyScalar(0.86);
      if (speed > 0.6 && this.splashTimer <= 0) {
        this.splashTimer = 0.4;
        const p = this.position.clone();
        p.y = waterH;
        this.fx?.splashAt(p, 0.7);
        this.audio?.sfx('splash', { volume: 0.5, pos: p });
      }
    }
  }

  /** Возвращает местоположение и точку прицеливания для отладки. */
  debugState() {
    return { pos: this.position.clone(), speed: this.speed, throttle: this.throttle, yaw: this.yaw };
  }

  /** Установить лодку в точку (для сейвов). */
  setPosition(x, y, z, yaw) {
    this.position.set(x, y, z);
    this.yaw = yaw ?? this.yaw;
    this.velocity.set(0, 0, 0);
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.yaw, 0);
  }

  /** Ближайшая точка входа (для UI подсказки). */
  canBoard(fromPos) {
    return fromPos.distanceTo(this.seatWorldPosition) < 3.4;
  }
}
