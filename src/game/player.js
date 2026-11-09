// ============================================================================
//  Игрок: контроллер передвижения (ходьба/бег/в лодке), процедурная
//  модель рыбака с IK-ногами, пружинная анимация рук и удочки, камера
//  от первого лица и с третьего (переключение), звук шагов по материалу.
// ============================================================================
import * as THREE from 'three';
import { GeoBuilder, capsule, lathe, noisySphere, gridPlane, tube } from '../gen/geobuilder.js';
import { clamp, lerp, damp, dampAngle, smoothstep, TAU, makeRNG } from '../core/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Процедурная модель рыбака: куртка, штаны, сапоги, шляпа, удочка. */
export function makeFisherman(materials) {
  const root = new THREE.Group();
  root.name = 'fisherman';

  const clothingMat = materials.cloth(0x2f4a52);
  const pantsMat = materials.cloth(0x2b3138);
  const vestMat = materials.cloth(0x5a4430);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc79a72, roughness: 0.85, metalness: 0 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.7, metalness: 0.05 });
  const hatMat = materials.cloth(0x6d5b3c);

  // ------- Торс
  const torso = new THREE.Group();
  torso.position.y = 1.06;
  root.add(torso);
  const chestGeo = lathe(
    [
      { x: 0.0, y: 0.0 },
      { x: 0.19, y: 0.06 },
      { x: 0.23, y: 0.22 },
      { x: 0.245, y: 0.42 },
      { x: 0.22, y: 0.56 },
      { x: 0.17, y: 0.62 },
      { x: 0.10, y: 0.66 },
      { x: 0.0, y: 0.68 },
    ],
    18,
    { colorFn: (u, v) => (v > 0.62 ? { r: 0.34, g: 0.30, b: 0.22 } : { r: 1, g: 1, b: 1 }) }
  );
  const chest = new THREE.Mesh(chestGeo.toGeometry(), clothingMat);
  chest.scale.set(1, 1, 0.72);
  chest.castShadow = true;
  torso.add(chest);
  // жилет
  const vestGeo = lathe(
    [
      { x: 0.0, y: 0.0 },
      { x: 0.2, y: 0.05 },
      { x: 0.245, y: 0.2 },
      { x: 0.26, y: 0.44 },
      { x: 0.235, y: 0.56 },
      { x: 0.0, y: 0.58 },
    ],
    16,
    { colorFn: () => ({ r: 0.9, g: 0.86, b: 0.76 }) }
  );
  const vest = new THREE.Mesh(vestGeo.toGeometry(), vestMat);
  vest.scale.set(1.02, 1, 0.76);
  vest.castShadow = true;
  torso.add(vest);
  // карманы
  for (const sx of [-0.13, 0.13]) {
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.02).toNonIndexed(), vestMat);
    pocket.position.set(sx, 0.28, 0.17);
    torso.add(pocket);
  }

  // ------- Голова
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.7;
  torso.add(headPivot);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skinMat);
  neck.position.y = 0.02;
  headPivot.add(neck);
  const headGeo = noisySphere(0.135, 16, (nx, ny, nz) => 1 + Math.sin(ny * 3.1) * 0.03, { squash: 1.12 });
  const head = new THREE.Mesh(headGeo.toGeometry(), skinMat);
  head.position.y = 0.17;
  head.castShadow = true;
  headPivot.add(head);
  // борода
  const beard = new THREE.Mesh(
    noisySphere(0.1, 12, (nx, ny, nz) => 1 + 0.18 * Math.sin(nx * 9) * Math.cos(nz * 7), {
      squash: 1.4,
      colorFn: () => new THREE.Color(0xb9b4ad),
    }).toGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xb0aaa2, roughness: 1 })
  );
  beard.position.set(0, 0.09, 0.075);
  beard.scale.set(0.85, 0.9, 0.7);
  headPivot.add(beard);
  // глаза
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.2 });
  for (const sx of [-0.05, 0.05]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), eyeMat);
    eye.position.set(sx, 0.185, 0.115);
    headPivot.add(eye);
  }
  // шляпа (широкополая)
  const hat = new THREE.Group();
  hat.position.y = 0.24;
  const brimGeo = lathe(
    [
      { x: 0.0, y: 0.0 },
      { x: 0.2, y: 0.005 },
      { x: 0.28, y: 0.02 },
      { x: 0.29, y: 0.035 },
      { x: 0.19, y: 0.03 },
      { x: 0.0, y: 0.03 },
    ],
    20
  );
  const brim = new THREE.Mesh(brimGeo.toGeometry(), hatMat);
  brim.castShadow = true;
  hat.add(brim);
  const crown = new THREE.Mesh(
    lathe(
      [
        { x: 0.0, y: 0.03 },
        { x: 0.13, y: 0.035 },
        { x: 0.145, y: 0.1 },
        { x: 0.135, y: 0.17 },
        { x: 0.09, y: 0.2 },
        { x: 0.0, y: 0.21 },
      ],
      18
    ).toGeometry(),
    hatMat
  );
  crown.castShadow = true;
  hat.add(crown);
  headPivot.add(hat);

  // ------- Руки (плечо -> локоть -> кисть)
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.235, 0.56, 0);
    torso.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.24, 6, 10), clothingMat);
    upper.position.y = -0.14;
    upper.castShadow = true;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.22, 6, 10), clothingMat);
    fore.position.y = -0.13;
    fore.castShadow = true;
    elbow.add(fore);
    const hand = new THREE.Group();
    hand.position.y = -0.27;
    elbow.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skinMat);
    palm.scale.set(1, 1.15, 0.7);
    hand.add(palm);
    return { shoulder, elbow, hand };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // ------- Ноги (бедро -> колено -> стопа)
  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.105, 1.04, 0);
    root.add(hip);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.3, 6, 10), pantsMat);
    thigh.position.y = -0.2;
    thigh.castShadow = true;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.3, 6, 10), pantsMat);
    shin.position.y = -0.19;
    shin.castShadow = true;
    knee.add(shin);
    const ankle = new THREE.Group();
    ankle.position.y = -0.4;
    knee.add(ankle);
    const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 6, 10), bootMat);
    boot.rotation.x = Math.PI / 2;
    boot.position.set(0, 0.02, 0.05);
    boot.castShadow = true;
    ankle.add(boot);
    return { hip, knee, ankle };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  return {
    root,
    torso,
    headPivot,
    armL,
    armR,
    legL,
    legR,
    materials: { clothingMat, pantsMat, vestMat, skinMat, bootMat, hatMat },
  };
}

/** Процедурная удочка (складная, с катушкой и кольцами). */
export function makeFishingRod(materials, opts = {}) {
  const length = opts.length ?? 2.1;
  const group = new THREE.Group();
  group.name = 'fishingRod';
  const blankMat = new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.42, metalness: 0.25 });
  const corkMat = new THREE.MeshStandardMaterial({ color: 0x9c7a4e, roughness: 0.95 });
  const metalMat = materials.metal(0xb8bcc0, 0.05);

  // колено удилища (сужается к концу), с лёгким изгибом
  const sections = 14;
  const pts = [];
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    pts.push(V(0, t * length, -Math.sin(t * Math.PI * 0.5) * 0.02));
  }
  const blank = tube(pts, 0.019, 8, { radiusFn: (t) => lerp(0.017, 0.0025, Math.pow(t, 0.75)) });
  const blankMesh = new THREE.Mesh(blank.toGeometry(), blankMat);
  blankMesh.castShadow = true;
  group.add(blankMesh);

  // рукоять
  const handle = new THREE.Mesh(
    lathe(
      [
        { x: 0.0, y: 0 },
        { x: 0.021, y: 0.01 },
        { x: 0.023, y: 0.16 },
        { x: 0.019, y: 0.3 },
        { x: 0.0, y: 0.32 },
      ],
      12
    ).toGeometry(),
    corkMat
  );
  handle.position.y = -0.02;
  handle.castShadow = true;
  group.add(handle);
  // катушка
  const reel = new THREE.Group();
  reel.position.set(0, 0.2, 0.055);
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 14), metalMat);
  spool.rotation.z = Math.PI / 2;
  reel.add(spool);
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.005, 6, 16, Math.PI * 1.4), metalMat);
  bail.rotation.y = Math.PI / 2;
  reel.add(bail);
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.012), metalMat);
  crankArm.position.set(0.05, 0, 0);
  reel.add(crankArm);
  group.add(reel);
  // кольца
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(lerp(0.014, 0.004, t), 0.0022, 4, 10), metalMat);
    ring.position.set(0, t * length, 0.012);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }
  // поплавок (креплён к леске в fishing.js, здесь — только для инвентаря)

  group.userData.tipLocal = V(0, length, -0.02);
  group.userData.length = length;
  return group;
}

export class Player {
  constructor(opts) {
    const { scene, camera, world, audio, fx, materials, pipeline } = opts;
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.fx = fx;
    this.materials = materials;
    this.pipeline = pipeline;
    this.terrain = world.terrain;

    // ---- модель
    this.model = makeFisherman(materials);
    this.model.root.visible = false; // от третьего лица
    scene.add(this.model.root);

    this.rod = makeFishingRod(materials);
    this.rod.visible = false;
    this.model.armR.hand.add(this.rod);
    this.rod.rotation.set(1.15, 0, 0);
    this.rod.position.set(0, -0.05, 0);
    this.rodInHands = false;

    // ---- состояние
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.05;
    this.height = 1.7;
    this.eyeHeight = 1.62;
    this.radius = 0.32;
    this.onGround = true;
    this.mode = 'walk'; // walk | boat | fish
    this.viewMode = 'first'; // first | third
    this.crouching = false;
    this.sprinting = false;
    this.speedWalk = 2.6;
    this.speedRun = 5.4;
    this.speedCrouch = 1.3;
    this.bob = 0;
    this.stepAccum = 0;
    this.lastStepSide = 1;
    this.stamina = 100;
    this.maxStamina = 100;
    this.swimming = false;
    this.inWater = false;
    this.sensitivity = 0.0022;
    this.headBobAmount = 0.028;
    this.footstepSurface = 'grass';
    this.boat = null;
    this.bobPhase = 0;
    this._tmpV = new THREE.Vector3();
    this._cameraShake = 0;

    // Пружинный наклон удочки
    this.rodBend = 0;
    this.rodBendVel = 0;

    // ---- ввод
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, locked: false, buttons: new Set(), wheel: 0 };
    this._bindInput();

    // Начальная позиция — у дома
    const home = world.landmarks.home?.position || V(0, 5, 0);
    this.position.set(home.x + 4, this.terrain.heightAt(home.x + 4, home.z + 6) + 1, home.z + 6);
    this.yaw = Math.atan2(-4, -6);
  }

  _bindInput() {
    const canvas = this.pipeline.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'KeyV') this.toggleView();
      if (e.code === 'KeyC') this.crouching = !this.crouching;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.mouse.locked && this.acceptPointerLock) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = document.pointerLockElement === canvas;
      if (this.onPointerLockChange) this.onPointerLockChange(this.mouse.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.mouse.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => this.mouse.buttons.add(e.button));
    window.addEventListener('mouseup', (e) => this.mouse.buttons.delete(e.button));
    window.addEventListener('wheel', (e) => {
      if (this.mouse.locked) this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: true });
  }

  toggleView() {
    this.viewMode = this.viewMode === 'first' ? 'third' : 'first';
    this.model.root.visible = this.viewMode === 'third';
    this.rod.visible = this.viewMode === 'third' && this.rodInHands;
    if (this.onViewChange) this.onViewChange(this.viewMode);
  }

  /** Переместить игрока (например, при загрузке сейва). */
  teleport(x, y, z, yaw = this.yaw) {
    this.position.set(x, y, z);
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.updateCameraImmediate();
  }

  /** Взять удочку — модель в руках, режим рыбалки. */
  equipRod(on) {
    this.rodInHands = on;
    this.rod.visible = on && this.viewMode === 'third';
    if (this.onRodChange) this.onRodChange(on);
  }

  setSensitivity(v) {
    this.sensitivity = v;
  }

  get eyePosition() {
    return this._tmpV.copy(this.position).setY(this.position.y + this.eyeHeight - (this.crouching ? 0.35 : 0));
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
  }

  get flatForward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  addShake(amount) {
    this._cameraShake = Math.min(1.2, this._cameraShake + amount);
  }

  update(dt, atmosphere, water) {
    // ---- обзор мышью
    const sens = this.sensitivity;
    this.yaw -= this.mouse.dx * sens;
    this.pitch -= this.mouse.dy * sens;
    this.pitch = clamp(this.pitch, -1.35, 1.2);
    this.mouse.dx = 0;
    this.mouse.dy = 0;

    if (this.mode === 'boat' && this.boat) {
      this._updateBoatMode(dt, atmosphere, water);
      return;
    }

    // ---- движение
    const forwardInput = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const strafeInput = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    this.sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const wantsMove = forwardInput !== 0 || strafeInput !== 0;

    let speed = this.crouching ? this.speedCrouch : this.sprinting && this.stamina > 1 ? this.speedRun : this.speedWalk;
    if (this.rodInHands) speed *= 0.72;
    // усталость
    if (this.sprinting && wantsMove) this.stamina = Math.max(0, this.stamina - dt * 17);
    else this.stamina = Math.min(this.maxStamina, this.stamina + dt * 11);
    if (this.stamina <= 0.5) speed = this.speedWalk * 0.85;

    const fwd = this.flatForward;
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, forwardInput)
      .addScaledVector(right, strafeInput);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    // ускорение/торможение
    const accel = this.onGround ? 14 : 4;
    this.velocity.x = damp(this.velocity.x, wish.x, accel, dt);
    this.velocity.z = damp(this.velocity.z, wish.z, accel, dt);

    // гравитация / вода
    const groundH = this.terrain.heightAt(this.position.x, this.position.z);
    this.inWater = groundH < 0.2 && this.position.y < 1.0;
    const waterH = water ? water.getHeight(this.position.x, this.position.z) : 0;
    const swimLevel = waterH + this.height * 0.55;
    this.swimming = groundH < waterH - 1.2 && this.position.y < swimLevel;

    if (this.swimming) {
      // плавание: держимся на поверхности
      this.velocity.y = damp(this.velocity.y, (swimLevel - this.position.y) * 4.2, 6, dt);
      this.onGround = false;
      if (wantsMove) this.velocity.y += Math.sin(performance.now() * 0.006) * 0.6 * dt;
    } else {
      this.velocity.y -= 19.6 * dt;
    }

    // смещение с проверкой проходимости
    const nextX = this.position.x + this.velocity.x * dt;
    const nextZ = this.position.z + this.velocity.z * dt;
    const slopeOk = (x, z) => {
      const h = this.terrain.heightAt(x, z);
      if (h < 0.25 && !this.swimming) return false;
      return this.terrain.slopeAt(x, z) < 0.62 || this.swimming;
    };
    if (this.world.isWalkable(nextX, nextZ) || this.swimming || this.terrain.heightAt(nextX, nextZ) > 0.25) {
      if (slopeOk(nextX, this.position.z)) this.position.x = nextX;
      if (slopeOk(this.position.x, nextZ)) this.position.z = nextZ;
    }
    // жёсткие границы мира
    const lim = 330;
    this.position.x = clamp(this.position.x, -lim, lim);
    this.position.z = clamp(this.position.z, -lim, lim);

    this.position.y += this.velocity.y * dt;
    const floor = groundH;
    if (this.position.y <= floor) {
      if (!this.onGround && this.velocity.y < -6) {
        this.addShake(clamp(-this.velocity.y * 0.012, 0, 0.2));
      }
      this.position.y = floor;
      this.velocity.y = 0;
      this.onGround = true;
    } else if (this.position.y > floor + 0.02) {
      this.onGround = false;
    }

    // Прыжок
    if (this.keys.has('Space') && this.onGround && !this.swimming) {
      this.velocity.y = 6.2;
      this.onGround = false;
      this.keys.delete('Space');
    }

    // ---- шаги/звук/анимация
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.bob += dt * horizSpeed * 2.2;
    this.stepAccum += horizSpeed * dt;
    const stepLen = this.sprinting ? 1.35 : this.crouching ? 0.75 : 1.05;
    if (this.stepAccum > stepLen) {
      this.stepAccum = 0;
      this._playFootstep(horizSpeed, waterH);
    }

    this._animateBody(dt, horizSpeed);
    this._updateCamera(dt, atmosphere, water);
  }

  _playFootstep(speed, waterH) {
    const x = this.position.x, z = this.position.z;
    const h = this.terrain.heightAt(x, z);
    let surface = 'grass';
    if (h < waterH - 0.05) surface = 'water';
    else if (h < 1.15) surface = 'sand';
    else {
      const biome = this.terrain.biomeAt(x, z);
      if (biome === 'rock') surface = 'stone';
      else if (this.world.landmarks.dock && this._nearDock(x, z)) surface = 'wood';
      else surface = 'grass';
    }
    this.footstepSurface = surface;
    const vol = this.crouching ? 0.5 : speed > 4 ? 1.15 : 0.85;
    const name = surface === 'water' ? 'footstep_water' : `footstep_${surface}`;
    this.audio?.sfx(name, { volume: vol });
    this.fx?.stepDust(V(x, this.position.y, z), surface);
    if (surface === 'water') {
      this.fx?.ripples.spawn(V(x, waterH + 0.03, z), 0.6, 1.2);
    }
  }

  _nearDock(x, z) {
    const d = this.world.landmarks.dock;
    if (!d) return false;
    const dx = x - d.position.x, dz = z - d.position.z;
    const c = Math.cos(-d.rotation), s = Math.sin(-d.rotation);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.abs(lx) < 2.0 && Math.abs(lz) < 13 && this.position.y > 0.6;
  }

  _animateBody(dt, speed) {
    const m = this.model;
    const t = (this._animT = (this._animT || 0) + dt);
    const walking = speed > 0.2 && this.onGround;
    const phase = this.bob * 2.4;
    const amp = clamp(speed / this.speedRun, 0, 1);

    if (this.mode === 'boat') {
      // сидячая поза
      m.torso.rotation.x = 0.1;
      m.legL.hip.rotation.x = -1.5;
      m.legR.hip.rotation.x = -1.4;
      m.legL.knee.rotation.x = 1.3;
      m.legR.knee.rotation.x = 1.25;
      return;
    }

    if (walking) {
      // IK-подобная походка: бёдра и колени противофазно
      const swing = Math.sin(phase) * 0.62 * amp;
      const swing2 = Math.sin(phase + Math.PI) * 0.62 * amp;
      m.legL.hip.rotation.x = swing;
      m.legR.hip.rotation.x = swing2;
      // колено сгибается только в одну сторону (как настоящая нога)
      m.legL.knee.rotation.x = Math.max(0, -Math.sin(phase - 0.6)) * 0.9 * amp;
      m.legR.knee.rotation.x = Math.max(0, -Math.sin(phase + Math.PI - 0.6)) * 0.9 * amp;
      // стопа компенсирует
      m.legL.ankle.rotation.x = -m.legL.knee.rotation.x * 0.4 - swing * 0.15;
      m.legR.ankle.rotation.x = -m.legR.knee.rotation.x * 0.4 - swing2 * 0.15;
      // корпус покачивается
      m.torso.rotation.z = Math.sin(phase) * 0.045 * amp;
      m.torso.rotation.y = Math.sin(phase) * 0.07 * amp;
      m.torso.position.y = 1.06 + Math.abs(Math.sin(phase)) * 0.028 * amp;
      // руки
      if (this.rodInHands) {
        this._poseFishingArms(dt);
      } else {
        m.armL.shoulder.rotation.x = -swing2 * 0.75;
        m.armR.shoulder.rotation.x = -swing * 0.75;
        m.armL.elbow.rotation.x = -0.35 - Math.abs(swing2) * 0.3;
        m.armR.elbow.rotation.x = -0.35 - Math.abs(swing) * 0.3;
        m.armL.shoulder.rotation.z = 0.09;
        m.armR.shoulder.rotation.z = -0.09;
      }
    } else {
      // стоячая поза с дыханием
      const breath = Math.sin(t * 1.6) * 0.012;
      m.torso.position.y = 1.06 + breath;
      m.torso.rotation.z = damp(m.torso.rotation.z, 0, 8, dt);
      m.torso.rotation.y = damp(m.torso.rotation.y, 0, 8, dt);
      m.torso.rotation.x = damp(m.torso.rotation.x, this.swimming ? 0.4 : 0.02, 6, dt);
      m.legL.hip.rotation.x = damp(m.legL.hip.rotation.x, 0.03, 8, dt);
      m.legR.hip.rotation.x = damp(m.legR.hip.rotation.x, -0.03, 8, dt);
      m.legL.knee.rotation.x = damp(m.legL.knee.rotation.x, 0.05, 8, dt);
      m.legR.knee.rotation.x = damp(m.legR.knee.rotation.x, 0.05, 8, dt);
      m.legL.ankle.rotation.x = damp(m.legL.ankle.rotation.x, 0, 8, dt);
      m.legR.ankle.rotation.x = damp(m.legR.ankle.rotation.x, 0, 8, dt);
      if (this.rodInHands) this._poseFishingArms(dt);
      else {
        m.armL.shoulder.rotation.x = damp(m.armL.shoulder.rotation.x, 0.06, 8, dt);
        m.armR.shoulder.rotation.x = damp(m.armR.shoulder.rotation.x, 0.06, 8, dt);
        m.armL.elbow.rotation.x = damp(m.armL.elbow.rotation.x, -0.22, 8, dt);
        m.armR.elbow.rotation.x = damp(m.armR.elbow.rotation.x, -0.22, 8, dt);
        m.armL.shoulder.rotation.z = 0.12;
        m.armR.shoulder.rotation.z = -0.12;
      }
    }

    // модель следует за позицией и поворотом
    m.root.position.copy(this.position);
    m.root.rotation.y = this.yaw;
    m.headPivot.rotation.x = damp(m.headPivot.rotation.x, clamp(this.pitch * 0.7, -0.5, 0.5), 8, dt);
    m.root.visible = this.viewMode === 'third';
  }

  _poseFishingArms(dt) {
    const m = this.model;
    // обе руки держат удилище перед собой
    m.armL.shoulder.rotation.x = damp(m.armL.shoulder.rotation.x, -1.05, 10, dt);
    m.armL.shoulder.rotation.z = damp(m.armL.shoulder.rotation.z, 0.38, 10, dt);
    m.armL.elbow.rotation.x = damp(m.armL.elbow.rotation.x, -0.75, 10, dt);
    m.armR.shoulder.rotation.x = damp(m.armR.shoulder.rotation.x, -0.82, 10, dt);
    m.armR.shoulder.rotation.z = damp(m.armR.shoulder.rotation.z, -0.22, 10, dt);
    m.armR.elbow.rotation.x = damp(m.armR.elbow.rotation.x, -1.0, 10, dt);
    // пружинный наклон удочки (реакция на натяжение)
    this.rodBendVel += (0 - this.rodBend) * 42 * dt;
    this.rodBendVel *= Math.exp(-8 * dt);
    this.rodBend += this.rodBendVel * dt;
    this.rod.rotation.x = 1.18 + this.rodBend;
    this.rod.rotation.z = Math.sin(performance.now() * 0.001) * 0.01;
  }

  /** Установить натяжение лески (0..1) — удочка прогибается. */
  setLineTension(v) {
    this.rodBendVel += (v - 0.35) * 1.6;
  }

  _updateBoatMode(dt, atmosphere, water) {
    // Игрок «в лодке» — позиция привязана к лодке, камера свободно вращается
    if (!this.boat) return;
    const seat = this.boat.getSeatPosition();
    this.position.copy(seat);
    this.model.root.position.copy(seat);
    this.model.root.rotation.y = this.boat.group.rotation.y + Math.PI;
    this.model.root.visible = this.viewMode === 'third';
    this.mode = 'boat';
    this._updateCamera(dt, atmosphere, water);
    this._animateBody(dt, 0);
  }

  _updateCamera(dt, atmosphere, water) {
    const cam = this.camera;
    const eye = this.eyePosition;

    if (this.mode === 'boat' && this.boat) {
      const seat = this.boat.getSeatPosition();
      eye.copy(seat).setY(seat.y + 1.32);
    }

    if (this.viewMode === 'first') {
      // покачивание камеры при ходьбе
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      const bobY = this.onGround ? Math.sin(this.bob * 2.4) * this.headBobAmount * clamp(speed / 3, 0, 1) : 0;
      const bobX = Math.cos(this.bob * 1.2) * this.headBobAmount * 0.5 * clamp(speed / 3, 0, 1);
      cam.position.copy(eye);
      cam.position.y += bobY;
      // тряска
      if (this._cameraShake > 0) {
        const s = this._cameraShake;
        cam.position.x += (Math.random() - 0.5) * 0.06 * s;
        cam.position.y += (Math.random() - 0.5) * 0.06 * s;
        cam.position.z += (Math.random() - 0.5) * 0.06 * s;
        this._cameraShake = Math.max(0, this._cameraShake - dt * 1.8);
      }
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw + Math.PI, 0, 'YXZ'));
      // наклон от бокового смещения
      const roll = clamp(-this.velocity.x * 0.004, -0.03, 0.03);
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, roll + bobX * 0.02)));
      cam.quaternion.slerp(q, 1 - Math.exp(-22 * dt));
    } else {
      // третье лицо: камера за спиной с проверкой земли
      const dist = this.mode === 'boat' ? 5.2 : 4.0;
      const targetY = this.mode === 'boat' ? 1.9 : 1.55;
      const look = this._tmpV.clone().copy(this.position).setY(this.position.y + targetY);
      const dir = new THREE.Vector3(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch)
      );
      const desired = look.clone().addScaledVector(dir, -dist);
      const gh = this.terrain.heightAt(desired.x, desired.z) + 0.6;
      if (desired.y < gh) desired.y = gh;
      cam.position.lerp(desired, 1 - Math.exp(-16 * dt));
      cam.lookAt(look);
      cam.rotation.z = 0;
    }

    // Ограничение под водой
    if (water) {
      const wh = water.getHeight(cam.position.x, cam.position.z);
      const depth = wh - cam.position.y;
      this.pipeline.setUnderwater(depth > 0 ? clamp(depth * 2.4, 0, 1) : 0);
      if (depth > 0) {
        cam.position.y = Math.max(cam.position.y, wh - 3.4);
      }
    }
  }

  updateCameraImmediate() {
    const cam = this.camera;
    const eye = this.eyePosition;
    cam.position.copy(eye);
    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw + Math.PI, 0, 'YXZ'));
  }
}
