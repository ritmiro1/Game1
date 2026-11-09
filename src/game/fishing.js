// ============================================================================
//  Рыбалка: заброс по баллистике, физика лески (провис/натяжение),
//  поплавок с поклёвками, подсечка, вываживание (борьба с рыбой),
//  садок, учёт квот и видов. Всё в метрах/секундах.
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp, damp, smoothstep, TAU, makeRNG } from '../core/math.js';
import { waterHeight, waterNormal } from '../core/water.js';
import { SPECIES, SPECIES_BY_ID, createFish } from '../models/fish.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const BAIT_TYPES = {
  worm: { id: 'worm', name: 'Червь', count: 30, price: 2, quality: 1.0, icon: 'worm', desc: 'Универсальная наживка. Берёт почти всё.' },
  maggot: { id: 'maggot', name: 'Опарыш', count: 40, price: 1, quality: 0.9, icon: 'maggot', desc: 'Мелкая наживка для мелочи и леща.' },
  corn: { id: 'corn', name: 'Кукуруза', count: 20, price: 3, quality: 1.05, icon: 'corn', desc: 'Карп и лещ не откажутся.' },
  dough: { id: 'dough', name: 'Тесто', count: 25, price: 2, quality: 0.95, icon: 'dough', desc: 'Пахнет хлебом — нравится мирной рыбе.' },
  livebait: { id: 'livebait', name: 'Живец', count: 10, price: 12, quality: 1.35, icon: 'livebait', desc: 'Для хищника: щука, сом, судак.' },
  spinner: { id: 'spinner', name: 'Блесна', count: 1, price: 45, quality: 1.2, icon: 'spinner', desc: 'Металл, вращение, блеск. Хищник рядом.' },
  fly: { id: 'fly', name: 'Мухоморка', count: 1, price: 38, quality: 1.15, icon: 'fly', desc: 'Для форели у холодных скал.' },
  moonbait: { id: 'moonbait', name: 'Лунная приманка', count: 1, price: 300, quality: 1.8, icon: 'moonbait', desc: 'Светится в темноте. Только для легенды.' },
};

export const ROD_LEVELS = [
  { level: 1, name: 'Бамбуковая удочка', power: 1.0, castDist: 14, reelSpeed: 1.0, price: 0, desc: 'Дедова удочка. Простая, но честная.' },
  { level: 2, name: 'Углепластиковое удилище', power: 1.35, castDist: 22, reelSpeed: 1.25, price: 480, desc: 'Дальше бросок, крепче борьба.' },
  { level: 3, name: 'Карбоновый спиннинг «Бриз»', power: 1.75, castDist: 30, reelSpeed: 1.55, price: 1500, desc: 'Для хищника и ветра.' },
  { level: 4, name: 'Удилище «Маячный страж»', power: 2.3, castDist: 38, reelSpeed: 1.9, price: 4200, desc: 'Выдерживает сома-гиганта.' },
];

export class FishingSystem {
  constructor(opts) {
    const { scene, player, world, water, audio, fx, materials, camera } = opts;
    this.scene = scene;
    this.player = player;
    this.world = world;
    this.water = water;
    this.audio = audio;
    this.fx = fx;
    this.materials = materials;
    this.camera = camera;
    this.terrain = world.terrain;

    this.state = 'idle'; // idle | charging | casting | flying | sinking | waiting | bite | hooked | fighting | landed
    this.stateTime = 0;
    this.rodLevel = 0;
    this.bait = 'worm';
    this.baitCount = { worm: 30, maggot: 25, corn: 12, dough: 20, livebait: 6, spinner: 1, fly: 1, moonbait: 0 };

    this.castPower = 0;
    this.chargeDir = 1;
    this.lineTension = 0;
    this.fishStamina = 1;
    this.fishStruggle = 0;
    this.reelProgress = 0;
    this.distanceToFish = 0;
    this.hookedFish = null;
    this.lastCatch = null;
    this.catches = [];
    this.totalCatches = 0;
    this.skill = 0;

    // Визуал: поплавок, леска, грузило
    this._buildVisuals();

    // Пружина лески (простая 2-х или 3-точечная цепь)
    this.linePoints = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.lineVel = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

    this.floatPos = new THREE.Vector3();
    this.floatVel = new THREE.Vector3();
    this.tipPos = new THREE.Vector3();
    this.biteTimer = 0;
    this.waitTimer = 0;
    this.fishApproach = 0;

    this.events = {};
    this.notify = null;
    this._rng = makeRNG(4242);
  }
  on(name, cb) {
    this.events[name] = cb;
    return this;
  }
  emit(name, payload) {
    this.events[name]?.(payload);
  }

  // ------------------------------------------------------------- визуал
  _buildVisuals() {
    // Поплавок — тело из двух конусов + антенна
    const floatGroup = new THREE.Group();
    const redMat = new THREE.MeshStandardMaterial({ color: 0xd8402e, roughness: 0.45, emissive: 0x3a0a05, emissiveIntensity: 0.4 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.4 });
    const bodyTop = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 10), redMat);
    bodyTop.position.y = 0.055;
    const bodyBottom = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 10), whiteMat);
    bodyBottom.position.y = -0.04;
    bodyBottom.rotation.x = Math.PI;
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.14, 6), redMat);
    antenna.position.y = 0.17;
    floatGroup.add(bodyTop, bodyBottom, antenna);
    floatGroup.scale.setScalar(1.6);
    floatGroup.visible = false;
    this.scene.add(floatGroup);
    this.floatMesh = floatGroup;

    // Леска — линия с толщиной (используем TubeGeometry, обновляем позиции)
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.55 });
    this.lineMesh = new THREE.Line(this.lineGeo, lineMat);
    this.lineMesh.frustumCulled = false;
    this.lineMesh.visible = false;
    this.scene.add(this.lineMesh);

    // Приманка (висящая на крючке)
    const baitGeo = new THREE.SphereGeometry(0.022, 8, 6);
    const baitMat = new THREE.MeshStandardMaterial({ color: 0xc06060, roughness: 0.6 });
    this.baitMesh = new THREE.Mesh(baitGeo, baitMat);
    this.baitMesh.visible = false;
    this.scene.add(this.baitMesh);

    // Рыба на леске (визуал во время вываживания)
    this.fightingFishMesh = null;
  }

  get rod() {
    return ROD_LEVELS[this.rodLevel];
  }

  upgradeRod() {
    if (this.rodLevel >= ROD_LEVELS.length - 1) return false;
    this.rodLevel++;
    this.emit('rod_upgraded', this.rod);
    return true;
  }

  setBait(id) {
    if (!(id in this.baitCount)) return;
    if (this.baitCount[id] <= 0) return;
    this.bait = id;
    this.audio?.sfx('click_bait');
    this.emit('bait_changed', id);
  }

  addBait(id, n = 1) {
    this.baitCount[id] = (this.baitCount[id] || 0) + n;
  }

  // ------------------------------------------------------------- управление
  /** Нажатие ЛКМ: зарядить заброс, затем отпустить. */
  startCharge() {
    if (this.state === 'idle') {
      this.state = 'charging';
      this.castPower = 0;
      this.chargeDir = 1;
      this.stateTime = 0;
      this.holdSeconds = 0;
    }
  }

  /** Отпускание — бросок с силой (или подсечка/вываживание, если уже клюёт). */
  releaseCharge() {
    if (this.state === 'charging') {
      this._cast(this.castPower);
    } else if (this.state === 'bite') {
      this._hookSet();
    } else if (this.state === 'waiting' || this.state === 'sinking') {
      this._reelIn();
    }
  }

  _cast(power) {
    const rod = this.rod;
    const minD = 4, maxD = rod.castDist;
    const dist = lerp(minD, maxD, clamp(power, 0.08, 1));
    const origin = this.player.eyePosition.clone();
    const dir = this.player.forward.clone();
    // баллистическая траектория
    const speed = lerp(9, 21, power) * (rod.power * 0.35 + 0.75);
    const angle = clamp(dir.y + 0.36, 0.05, 0.85);
    const horiz = Math.cos(angle);
    const vel = V(dir.x, 0, dir.z).normalize().multiplyScalar(speed * horiz);
    vel.y = speed * Math.sin(angle);

    this.castOrigin = origin.clone();
    this.castVel = vel.clone();
    this.floatPos.copy(origin);
    this.floatVel.copy(vel);
    this.state = 'flying';
    this.stateTime = 0;
    this.floatMesh.visible = true;
    this.baitMesh.visible = false;
    this.lineMesh.visible = true;
    this.audio?.sfx('cast', { volume: 0.75 });
    this.emit('cast', { power, dist });
  }

  _reelIn() {
    this.state = 'idle';
    this.stateTime = 0;
    this.floatMesh.visible = false;
    this.baitMesh.visible = false;
    this.lineMesh.visible = false;
    this.audio?.sfx('reel', { volume: 0.5 });
    this.emit('reeled');
    if (this.fightingFishMesh) {
      this.scene.remove(this.fightingFishMesh);
      this.fightingFishMesh = null;
    }
  }

  _pickSpecies(pos) {
    const depthHere = Math.max(0.4, -this.terrain.heightAt(pos.x, pos.z));
    const hour = this.world.atmosphere?.timeOfDay ?? 12;
    const biomeHere = this.world.terrain.nearestIsland(pos.x, pos.z);
    const biome = this.world.terrain.biomeAt(pos.x, pos.z);
    const bait = BAIT_TYPES[this.bait];
    const weighted = [];
    for (const s of SPECIES) {
      let w = 0;
      // биом
      const nearBiome = biomeHere.island?.biome ?? 'meadow';
      const biomes = s.biome || [];
      if (biomes.includes(nearBiome) || biomes.includes(biome) || biomes.includes(biomeHere.island?.id)) w += 1;
      else w += 0.08;
      // глубина
      const [dmin, dmax] = s.depthRange || [0.5, 8];
      if (depthHere >= dmin && depthHere <= dmax) w *= 1.8;
      else w *= clamp(1 - Math.abs(depthHere - clamp(depthHere, dmin, dmax)) / 8, 0.02, 1);
      // время суток
      const [t0, t1] = s.timeOfDay || [0, 24];
      const inTime = t0 <= t1 ? hour >= t0 && hour <= t1 : hour >= t0 || hour <= t1;
      w *= inTime ? 1.7 : 0.16;
      // наживка
      if ((s.bait || []).includes(this.bait)) w *= 2.6;
      else w *= 0.18;
      // редкость
      w /= Math.pow(s.rarity, 1.85);
      // наживка-качество
      w *= bait?.quality ?? 1;
      if (s.id === 'moonfish' && this.world.atmosphere && this.world.atmosphere.weatherName !== 'fog') w *= 0.05;
      weighted.push({ s, w: Math.max(0.0001, w) });
    }
    const total = weighted.reduce((a, b) => a + b.w, 0);
    let r = this._rng() * total;
    for (const it of weighted) {
      r -= it.w;
      if (r <= 0) return it.s;
    }
    return weighted[0].s;
  }

  _hookSet() {
    if (this.state !== 'bite') return;
    const success = this._rng() < this.biteHookChance;
    this.audio?.sfx('hookset', { volume: 0.9 });
    if (!success) {
      this.emit('missed', {});
      this.audio?.sfx('error', { volume: 0.4 });
      this._reelIn();
      this.state = 'idle';
      return;
    }
    this.state = 'fighting';
    this.stateTime = 0;
    this.fishStamina = 1;
    this.reelProgress = 0;
    this.distanceToFish = this.hookedFish.distance;
    this.audio?.sfx('splash', { volume: 0.8, pos: this.floatPos });
    this.fx?.splashAt(this.floatPos, 0.9);
    this.player.setLineTension(1);
    this.emit('hooked', this.hookedFish);
    // визуал рыбы на леске
    const fishMesh = createFish(this.hookedFish.species, this.materials);
    fishMesh.scale.setScalar(clamp(this.hookedFish.weight / 2.2, 0.45, 1.6));
    this.scene.add(fishMesh);
    this.fightingFishMesh = fishMesh;
  }

  _landFish() {
    const f = this.hookedFish;
    const price = Math.round(f.species.price * (f.weight / f.species.weightRange[0]) * 0.42 + f.species.price * 0.5);
    const record = {
      id: f.species.id,
      name: f.species.name,
      weight: f.weight,
      length: f.length,
      price,
      time: this.world.atmosphere?.clockString ?? '--:--',
      day: this.world.atmosphere?.day ?? 1,
    };
    this.catches.push(record);
    this.totalCatches++;
    this.lastCatch = record;
    this.skill += 0.12;
    this.state = 'idle';
    this.stateTime = 0;
    this.floatMesh.visible = false;
    this.lineMesh.visible = false;
    this.baitMesh.visible = false;
    if (this.fightingFishMesh) {
      this.scene.remove(this.fightingFishMesh);
      this.fightingFishMesh = null;
    }
    this.audio?.sfx('fish_flop', { volume: 0.9 });
    this.audio?.jingle('catch');
    this.emit('catch', record);
  }

  // ------------------------------------------------------------- update
  update(dt, input) {
    this.stateTime += dt;
    const waterH = this.water.getHeight(this.floatPos.x, this.floatPos.z);

    // Позиция кончика удилища (в руках игрока)
    const rodTipOffset = V(0.16, 1.35, 0.55);
    rodTipOffset.applyAxisAngle(V(0, 1, 0), this.player.yaw);
    this.tipPos.copy(this.player.position).add(rodTipOffset);

    switch (this.state) {
      case 'charging': {
        // сила нарастает «маятником»
        this.holdSeconds = (this.holdSeconds || 0) + dt;
        this.castPower += dt * 1.55 * this.chargeDir;
        if (this.castPower >= 1) {
          this.castPower = 1;
          this.chargeDir = -1;
        }
        if (this.castPower <= 0.08) {
          this.castPower = 0.08;
          this.chargeDir = 1;
        }
        this.emit('charge', this.castPower);
        break;
      }
      case 'flying': {
        this.floatVel.y -= 9.81 * dt;
        this.floatPos.addScaledVector(this.floatVel, dt);
        // столкновение с водой
        const wh = this.water.getHeight(this.floatPos.x, this.floatPos.z);
        if (this.floatPos.y <= wh) {
          this.floatPos.y = wh;
          const impact = clamp(Math.abs(this.floatVel.y) / 12, 0.2, 1.4);
          this.audio?.sfx('splash', { volume: 0.5 + impact * 0.4, pos: this.floatPos });
          this.fx?.splashAt(this.floatPos, 0.35 + impact * 0.5);
          this.state = 'sinking';
          this.stateTime = 0;
          this.floatSink = 0;
          // определяем будущую рыбу
          const species = this._pickSpecies(this.floatPos);
          const wr = species.weightRange;
          const weight = lerp(wr[0], wr[1], Math.pow(this._rng(), 2.1));
          const length = species.length * (0.7 + (weight / wr[1]) * 0.8);
          this.pendingFish = { species, weight, length };
        }
        break;
      }
      case 'sinking': {
        this.floatSink = clamp(this.floatSink + dt * 1.4, 0, 1);
        this.floatPos.y = lerp(this.floatPos.y, waterH - 0.12, 1 - Math.exp(-3 * dt));
        if (this.floatSink >= 1) {
          this.state = 'waiting';
          this.stateTime = 0;
          // время до поклёвки зависит от наживки и глубины
          const depth = Math.max(0.5, -this.terrain.heightAt(this.floatPos.x, this.floatPos.z));
          const bait = BAIT_TYPES[this.bait];
          const base = 5.5 + this._rng() * 9;
          const factor = (bait?.quality ?? 1) * (1 + (this.skill * 0.06));
          this.waitTimer = base / factor;
          this.biteTimer = 0;
          // если в точке нет рыбы (слишком мелко/далеко от воды)
          this.hasFishHere = -this.terrain.heightAt(this.floatPos.x, this.floatPos.z) > 0.55;
        }
        break;
      }
      case 'waiting': {
        this.waitTimer -= dt;
        // поплавок покачивается на воде
        const bob = Math.sin(this.stateTime * 2.4) * 0.02 + Math.sin(this.stateTime * 5.7) * 0.008;
        this.floatPos.y = waterH - 0.1 + bob;
        this.floatPos.x += Math.sin(this.stateTime * 0.31) * dt * 0.06;
        this.floatPos.z += Math.cos(this.stateTime * 0.27) * dt * 0.06;
        // движение поплавка от волн
        if (this.waitTimer <= 0 && this.hasFishHere) {
          this.state = 'bite';
          this.stateTime = 0;
          this.biteWindow = clamp(1.5 - this.skill * 0.02, 0.75, 1.5);
          // шанс подсечки зависит от реакции
          this.biteHookChance = clamp(0.62 + this.skill * 0.02, 0.62, 0.95);
          this.hookedFish = {
            species: this.pendingFish.species,
            weight: this.pendingFish.weight,
            length: this.pendingFish.length,
            distance: this.floatPos.distanceTo(this.player.position),
          };
          this.audio?.sfx('fish_take', { volume: 0.8, pos: this.floatPos });
          this.fx?.ripples.spawn(this.floatPos.clone().setY(waterH + 0.02), 1.1, 1.3);
          this.emit('bite', { species: this.hookedFish.species });
        }
        break;
      }
      case 'bite': {
        // поплавок уходит под воду — визуально
        this.floatPos.y = waterH - 0.28 - Math.sin(this.stateTime * 12) * 0.05;
        this.fx?.ripples.spawn(this.floatPos.clone().setY(waterH + 0.015), 0.5, 0.9);
        if (this.stateTime > this.biteWindow) {
          this.emit('missed', { reason: 'too_slow' });
          this.audio?.sfx('error', { volume: 0.35 });
          this.state = 'waiting';
          this.stateTime = 0;
          this.waitTimer = 6 + this._rng() * 6;
        }
        break;
      }
      case 'fighting': {
        this._updateFight(dt, input);
        break;
      }
      default:
        break;
    }

    // Обновление поплавка/лески
    if (this.state !== 'idle') {
      this.floatMesh.position.copy(this.floatPos);
      const splashY = waterH;
      this.floatMesh.rotation.z = Math.sin(this.stateTime * 3.1) * 0.12;
      // Леска: цепь из 4 точек с пружинной релаксацией
      this._updateLine(dt);
    }
    if (this.fightingFishMesh) {
      this.fightingFishMesh.position.copy(this.floatPos);
      const toPlayer = this.player.position.clone().sub(this.floatPos).normalize();
      this.fightingFishMesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      this.fightingFishMesh.userData.anim?.(performance.now() * 0.004, 1.6 + Math.sin(performance.now() * 0.006) * 0.8);
    }
  }

  _updateLine(dt) {
    const pts = this.linePoints;
    pts[0].copy(this.tipPos);
    pts[3].copy(this.floatPos);
    // промежуточные точки — провисание под гравитацией
    for (let i = 1; i <= 2; i++) {
      const t = i / 3;
      const target = pts[0].clone().lerp(pts[3], t);
      target.y -= Math.sin(t * Math.PI) * (1 - this.lineTension) * 0.55;
      pts[i].lerp(target, 1 - Math.exp(-14 * dt));
    }
    const arr = this.lineGeo.attributes.position.array;
    for (let i = 0; i < 4; i++) {
      arr[i * 3] = pts[i].x;
      arr[i * 3 + 1] = pts[i].y;
      arr[i * 3 + 2] = pts[i].z;
    }
    this.lineGeo.attributes.position.needsUpdate = true;
    this.lineMesh.visible = true;
    // приманка у поплавка
    this.baitMesh.visible = this.state === 'waiting' || this.state === 'sinking';
    this.baitMesh.position.copy(this.floatPos).setY(this.floatPos.y - 0.35);
  }

  _updateFight(dt, input) {
    const f = this.hookedFish;
    const rod = this.rod;
    const staminaDrain = (input?.reeling ? 0.30 : -0.10) * rod.reelSpeed;
    this.fishStamina = clamp(this.fishStamina - staminaDrain * dt, 0, 1);

    // рыба борется: рывки
    const struggleWave = Math.sin(this.stateTime * (3.2 + f.species.strength * 3)) * 0.5 + 0.5;
    this.fishStruggle = struggleWave * f.species.strength * (1 - this.fishStamina * 0.4);

    // натяжение растёт при вываживании
    const targetTension = input?.reeling ? 0.55 + this.fishStruggle * 0.5 : 0.25 + this.fishStruggle * 0.3;
    this.lineTension = damp(this.lineTension, clamp(targetTension, 0, 1.4), 4, dt);
    this.player.setLineTension(this.lineTension);

    // прогресс вываживания
    const pull = input?.reeling ? 1 : 0;
    const drag = this.fishStruggle * 0.8 + 0.35;
    this.reelProgress += (pull * rod.reelSpeed * 0.42 - drag * 0.16) * dt;
    this.reelProgress = clamp(this.reelProgress, 0, 1);
    this.distanceToFish = Math.max(0.8, this.distanceToFish - pull * rod.reelSpeed * 1.5 * dt);

    // позиция рыбы/поплавка приближается к игроку
    const target = this.player.position.clone();
    const dir = this.floatPos.clone().sub(target).setY(0).normalize();
    this.floatPos.copy(target).addScaledVector(dir, this.distanceToFish);
    const wh = this.water.getHeight(this.floatPos.x, this.floatPos.z);
    this.floatPos.y = wh + Math.sin(this.stateTime * 8) * 0.05 * this.fishStruggle - 0.05;

    // обрыв лески при перенатяжении
    if (this.lineTension > 1.28 && this.fishStruggle > 0.7) {
      if (this._rng() < dt * 1.6 / rod.power) {
        this.audio?.sfx('line_tension', { volume: 1 });
        this.audio?.sfx('error');
        this.emit('line_broke', { fish: f });
        this.state = 'idle';
        this.lineMesh.visible = false;
        this.floatMesh.visible = false;
        if (this.fightingFishMesh) {
          this.scene.remove(this.fightingFishMesh);
          this.fightingFishMesh = null;
        }
        return;
      }
    }

    // звук катушки при вываживании
    if (input?.reeling && Math.random() < dt * 11) {
      this.audio?.sfx('reel_tick', { volume: 0.5 });
    }
    if (this.fishStruggle > 0.55 && Math.random() < dt * 2.4) {
      const p = this.floatPos.clone();
      this.fx?.splashAt(p.setY(wh), 0.35 + this.fishStruggle * 0.5);
      this.audio?.sfx('splash', { volume: 0.3 + this.fishStruggle * 0.4, pos: p });
      this.player.addShake(0.08);
    }

    if (this.reelProgress >= 1 || this.fishStamina <= 0.03) {
      this._landFish();
    }
  }

  /** Отмена текущего заброса (например, при смене оружия/режима). */
  cancel() {
    this.state = 'idle';
    this.lineMesh.visible = false;
    this.floatMesh.visible = false;
    this.baitMesh.visible = false;
    this.fightingFishMesh && this.scene.remove(this.fightingFishMesh);
    this.fightingFishMesh = null;
  }

  get statusText() {
    switch (this.state) {
      case 'idle': return 'ЛКМ — заброс';
      case 'charging': return `Заброс: ${Math.round(this.castPower * 100)}%`;
      case 'flying': return 'Заброс...';
      case 'sinking': return 'Приманка погружается...';
      case 'waiting': return 'Ждём поклёвки... (ЛКМ 0.6 с — смотать)';
      case 'bite': return 'ПОКЛЁВКА! ЛКМ — подсечь!';
      case 'fighting': return 'Вываживайте! Удерживайте ЛКМ';
      default: return '';
    }
  }
}
