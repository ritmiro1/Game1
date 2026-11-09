// ============================================================================
//  Сборка мира: ландшафт, растительность (инстансинг), постройки, декор,
//  рыбные стаи, птицы, погодные точки. Даёт API для физики и квестов.
// ============================================================================
import * as THREE from 'three';
import { Terrain, ISLANDS, WORLD } from '../gen/terrain.js';
import { GeoBuilder } from '../gen/geobuilder.js';
import { makeRNG, clamp, lerp, smoothstep, TAU } from '../core/math.js';
import { normalizeVertexColors } from '../gen/textures.js';
import {
  makePine,
  makeBirch,
  makeDeadTree,
  makeBush,
  makeRock,
  makeCliffChunk,
  makeGrassTuft,
  makeReeds,
  makeLilyPad,
  makeKelp,
  makeSeagull,
} from '../models/nature.js';
import {
  makeBoatModel,
  makeLighthouse,
  makeCabin,
  makeDock,
  makeWorkshopAwning,
  makeCampfire,
  makeBarrel,
  makeCrate,
  makeBuoy,
  makeNet,
} from '../models/structures.js';
import { SPECIES, createFish } from '../models/fish.js';
import { Fireflies, EmberSystem } from './particles.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class World {
  constructor(scene, materials, pipeline) {
    this.scene = scene;
    this.materials = materials;
    this.pipeline = pipeline;
    this.terrain = new Terrain();
    this.root = new THREE.Group();
    this.root.name = 'WorldRoot';
    scene.add(this.root);

    this.interactables = []; // объекты взаимодействия
    this.pois = []; // точки интереса (для квестов/карты)
    this.landmarks = {};
    this.instanceGroups = [];
    this.fishSchools = [];
    this.birds = [];
    this.stats = { triangles: 0, drawCalls: 0 };

    this._buildTerrain();
    this._buildVegetation();
    this._buildStructures();
    this._buildFish();
    this._buildBirds();
    this._buildAmbient();
  }

  // ---------------------------------------------------------------- земля
  _buildTerrain() {
    const t0 = performance.now ? performance.now() : Date.now();
    const geo = this.terrain.buildGeometry({ res: 300 });
    const mat = this.materials.ground();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'terrainMesh';
    this.root.add(mesh);
    this.terrainMesh = mesh;

    // Второй слой: дальний «низкополигональный» ландшафт за границей игровой зоны
    const farGeo = this.terrain.buildGeometry({ res: 90, size: WORLD.size * 2.6 });
    const farMesh = new THREE.Mesh(farGeo, mat);
    farMesh.position.y = -0.25;
    farMesh.receiveShadow = false;
    farMesh.name = 'terrainFar';
    this.root.add(farMesh);
    this.terrainFar = farMesh;

    // Текстура высот для шейдера воды
    this.heightTexture = this.terrain.buildHeightTexture(384);
    this.buildTime = (performance.now ? performance.now() : Date.now()) - t0;
  }

  // ---------------------------------------------------------------- флора
  _buildVegetation() {
    const rng = makeRNG(2024);
    const mkInstanced = (geometry, material, transforms, name, castShadow = true, receiveShadow = true) => {
      if (!transforms.length) return null;
      // цвета вершин для растительности — оттенок, а не яркость
      if (material?.vertexColors) normalizeVertexColors(geometry);
      const im = new THREE.InstancedMesh(geometry, material, transforms.length);
      im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      for (let i = 0; i < transforms.length; i++) {
        const t = transforms[i];
        q.setFromEuler(new THREE.Euler(t.rx || 0, t.ry || 0, t.rz || 0));
        s.set(t.s || 1, t.sy || t.s || 1, t.s || 1);
        m.compose(new THREE.Vector3(t.x, t.y, t.z), q, s);
        im.setMatrixAt(i, m);
        if (t.color) im.setColorAt(i, t.color);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.userData.fullCount = transforms.length;
      im.castShadow = castShadow;
      im.receiveShadow = receiveShadow;
      im.name = name;
      im.frustumCulled = true;
      this.root.add(im);
      this.instanceGroups.push(im);
      return im;
    };

    // --- Сосны: 3 варианта геометрии
    const pineTrunks = [];
    const pineFoliage = [];
    const pineData = [];
    for (let v = 0; v < 3; v++) {
      const p = makePine(500 + v * 37, { height: 11 + v * 1.6 });
      pineTrunks.push(p.trunk.toGeometry());
      pineFoliage.push(p.foliage.toGeometry());
    }
    const scatterPine = this.terrain.scatter({
      count: 620,
      seed: 31,
      filter: (x, z, y, biome, slope) => {
        if (biome === 'pine') return 0.95;
        if (biome === 'meadow') return 0.18;
        if (biome === 'forestFloor') return 0.7;
        if (biome === 'bog') return 0.35;
        if (biome === 'rock') return y > 8 ? 0.3 : 0.05;
        return 0;
      },
    });
    for (const s of scatterPine) {
      const variant = Math.floor(rng() * 3);
      const sc = rng.range(0.75, 1.35);
      pineData.push({ variant, x: s.x, y: s.y - 0.25, z: s.z, ry: rng() * TAU, s: sc });
    }
    for (let v = 0; v < 3; v++) {
      const subset = pineData.filter((p) => p.variant === v);
      mkInstanced(pineTrunks[v], this.materials.bark(), subset, `pineTrunk${v}`, true, true);
      mkInstanced(pineFoliage[v], this.materials.leaf('pine'), subset, `pineLeaf${v}`, false, true);
    }

    // --- Берёзы / лиственные
    const birchTrunks = [];
    const birchFoliage = [];
    const birchData = [];
    for (let v = 0; v < 3; v++) {
      const b = makeBirch(700 + v * 41, { height: 8 + v * 1.3 });
      birchTrunks.push(b.trunk.toGeometry());
      birchFoliage.push(b.foliage.toGeometry());
    }
    const scatterBirch = this.terrain.scatter({
      count: 420,
      seed: 47,
      filter: (x, z, y, biome, slope) => {
        if (biome === 'meadow') return 0.55;
        if (biome === 'forestFloor') return 0.5;
        if (biome === 'bog') return 0.22;
        if (biome === 'pine') return 0.12;
        return 0;
      },
    });
    for (const s of scatterBirch) {
      const variant = Math.floor(rng() * 3);
      birchData.push({ variant, x: s.x, y: s.y - 0.2, z: s.z, ry: rng() * TAU, s: rng.range(0.7, 1.25) });
    }
    for (let v = 0; v < 3; v++) {
      const subset = birchData.filter((p) => p.variant === v);
      mkInstanced(birchTrunks[v], this.materials.barkBirch(), subset, `birchTrunk${v}`, true, true);
      mkInstanced(birchFoliage[v], this.materials.leaf('birch'), subset, `birchLeaf${v}`, false, true);
    }

    // --- Кусты
    const bushGeo = makeBush(901, { size: 1.1 });
    const bushTrunk = bushGeo.trunk.toGeometry();
    const bushLeaf = bushGeo.foliage.toGeometry();
    const bushData = this.terrain.scatter({
      count: 700,
      seed: 53,
      filter: (x, z, y, biome) => (biome === 'meadow' ? 0.6 : biome === 'forestFloor' ? 0.5 : biome === 'bog' ? 0.4 : 0.05),
    }).map((s) => ({ x: s.x, y: s.y - 0.1, z: s.z, ry: rng() * TAU, s: rng.range(0.6, 1.5) }));
    mkInstanced(bushTrunk, this.materials.bark(), bushData, 'bushStem', false, true);
    mkInstanced(bushLeaf, this.materials.leaf('deciduous'), bushData, 'bushLeaf', false, true);

    // --- Мёртвые деревья (сухостой)
    const deadGeo = makeDeadTree(1001, { height: 6 });
    const deadTrunk = deadGeo.trunk.toGeometry();
    const deadData = this.terrain
      .scatter({
        count: 60,
        seed: 61,
        filter: (x, z, y, biome) => (biome === 'bog' ? 0.5 : biome === 'marsh' ? 0.4 : biome === 'pine' ? 0.08 : 0.02),
      })
      .map((s) => ({ x: s.x, y: s.y - 0.1, z: s.z, ry: rng() * TAU, s: rng.range(0.7, 1.3) }));
    mkInstanced(deadTrunk, this.materials.bark(), deadData, 'deadTree', true, true);

    // --- Камни / валуны
    const rockGeos = [];
    for (let v = 0; v < 4; v++) rockGeos.push(makeRock(1100 + v * 13, { radius: 1 + v * 0.35, detail: 18 }).toGeometry());
    const rockData = this.terrain.scatter({
      count: 900,
      seed: 67,
      filter: (x, z, y, biome, slope) => {
        if (y < 0.3) return 0.35; // камни в воде/у берега
        if (biome === 'rock') return 0.85;
        if (biome === 'sand') return 0.3;
        if (biome === 'grass') return 0.12;
        return 0.2;
      },
    });
    for (let v = 0; v < 4; v++) {
      const subset = rockData
        .filter((_, i) => i % 4 === v)
        .map((s) => ({
          x: s.x,
          y: s.y - 0.15,
          z: s.z,
          ry: rng() * TAU,
          rx: rng.range(-0.15, 0.15),
          rz: rng.range(-0.15, 0.15),
          s: rng.range(0.4, 1.7),
        }));
      mkInstanced(rockGeos[v], this.materials.rock([1, 1]), subset, `rock${v}`, true, true);
    }

    // --- Скальные утёсы у Маячного острова и на мысах
    const cliffGeos = [makeCliffChunk(1201, { radius: 3.2, count: 3 }).toGeometry(), makeCliffChunk(1249, { radius: 2.4, count: 4 }).toGeometry()];
    const cliffData = this.terrain.scatter({
      count: 120,
      seed: 71,
      filter: (x, z, y, biome, slope) => (biome === 'rock' && slope > 0.18 ? 0.8 : 0.0),
    });
    for (let v = 0; v < 2; v++) {
      const subset = cliffData
        .filter((_, i) => i % 2 === v)
        .map((s) => ({ x: s.x, y: s.y - 0.8, z: s.z, ry: rng() * TAU, s: rng.range(0.5, 1.5) }));
      mkInstanced(cliffGeos[v], this.materials.rock([2, 2]), subset, `cliff${v}`, true, true);
    }

    // --- Трава (пучки) — много инстансов, без теней
    const grassGeo = makeGrassTuft(1301, { height: 0.6 }).toGeometry();
    const grassData = this.terrain
      .scatter({
        count: Math.round(9000 * (this.pipeline?.preset?.grassDensity ?? 1)),
        seed: 79,
        filter: (x, z, y, biome, slope) => {
          if (biome === 'grass' || biome === 'forestFloor') return 1;
          if (biome === 'marsh') return 0.6;
          if (biome === 'sand') return 0.12;
          return 0;
        },
      })
      .map((s) => ({
        x: s.x,
        y: s.y - 0.05,
        z: s.z,
        ry: rng() * TAU,
        s: rng.range(0.6, 1.6),
        color: new THREE.Color().setHSL(0.22 + rng.range(-0.04, 0.05), 0.38, 0.24 + rng.range(-0.04, 0.08)),
      }));
    mkInstanced(grassGeo, this.materials.grass(), grassData, 'grass', false, true);

    // --- Камыш у воды
    const reedGeo = makeReeds(1401, { height: 1.8 }).toGeometry();
    const reedData = this.terrain
      .scatter({
        count: 900,
        seed: 83,
        filter: (x, z, y, biome) => (y > 0.05 && y < 1.1 ? 0.9 : biome === 'marsh' ? 0.5 : 0),
      })
      .map((s) => ({ x: s.x, y: s.y - 0.05, z: s.z, ry: rng() * TAU, s: rng.range(0.7, 1.4) }));
    mkInstanced(reedGeo, this.materials.grass(), reedData, 'reeds', false, true);

    // --- Листья кувшинок на воде
    const lilyGeo = makeLilyPad(1501).toGeometry();
    const lilyData = [];
    for (let i = 0; i < 220; i++) {
      const x = (rng() - 0.5) * 420;
      const z = (rng() - 0.5) * 420;
      const h = this.terrain.heightAt(x, z);
      if (h > -0.4 && h < 0.35) {
        lilyData.push({ x, y: 0.03, z, ry: rng() * TAU, s: rng.range(0.6, 1.4) });
      }
    }
    mkInstanced(lilyGeo, this.materials.leaf('deciduous'), lilyData, 'lilyPads', false, false);

    // --- Водоросли на мелководье
    const kelpGeo = makeKelp(1601, { height: 1.6 }).toGeometry();
    const kelpData = [];
    for (let i = 0; i < 500; i++) {
      const x = (rng() - 0.5) * 460;
      const z = (rng() - 0.5) * 460;
      const h = this.terrain.heightAt(x, z);
      if (h < -0.6 && h > -4.5) kelpData.push({ x, y: h + 0.05, z, ry: rng() * TAU, s: rng.range(0.6, 1.4) });
    }
    mkInstanced(kelpGeo, this.materials.leaf('deciduous'), kelpData, 'kelp', false, false);
  }

  // ---------------------------------------------------------------- постройки
  _buildStructures() {
    const rng = makeRNG(555);
    const addBuilder = (builder, material, name, { cast = true, receive = true, position = null, rotation = null } = {}) => {
      if (!builder || builder.vertexCount === 0) return null;
      const geo = builder.toGeometry({ name });
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.name = name;
      if (position) mesh.position.copy(position);
      if (rotation) mesh.rotation.y = rotation;
      this.root.add(mesh);
      return mesh;
    };

    // --- Дом игрока на «Родном берегу»
    const homeSpot = this.terrain.findFlatSpotNear(6, 12, 16, { maxSlope: 0.14, minH: 2.2 });
    const cabin = makeCabin({ w: 6.0, d: 4.6, h: 2.8 });
    const cabinRot = -0.35;
    const cabinPos = V(homeSpot.x, homeSpot.h - 0.15, homeSpot.z);
    const walls = addBuilder(cabin.walls, this.materials.woodDark(), 'cabinDoorWall', { position: cabinPos, rotation: cabinRot });
    const roof = addBuilder(cabin.roof, this.materials.woodDark(), 'cabinRoof', { position: cabinPos, rotation: cabinRot });
    const porch = addBuilder(cabin.porch, this.materials.woodDock(), 'cabinPorch', { position: cabinPos, rotation: cabinRot });
    const cabinDetail = addBuilder(cabin.detail, this.materials.woodPale(), 'cabinDetail', { position: cabinPos, rotation: cabinRot });
    if (walls) walls.visible = false; // стены уже собраны из брёвен в detail-группе
    const glass = addBuilder(cabin.glass, this.materials.glass(0x9fd0e0, 0.42), 'cabinGlass', { position: cabinPos, rotation: cabinRot, cast: false });
    this.landmarks.home = { position: cabinPos.clone(), rotation: cabinRot, mesh: cabinDetail };
    this.pois.push({ id: 'home', name: 'Дом рыбака', pos: cabinPos.clone(), icon: 'home' });

    // --- Мастерская/навес рядом с домом
    const shopSpot = this.terrain.findFlatSpotNear(homeSpot.x + 9, homeSpot.z + 3, 8, { maxSlope: 0.16, minH: 2.0 });
    const awning = makeWorkshopAwning({ w: 4.8, d: 3.4, h: 2.5 });
    const shopPos = V(shopSpot.x, shopSpot.h - 0.1, shopSpot.z);
    const shopRot = 0.7;
    addBuilder(awning.frame, this.materials.woodDock(), 'shopFrame', { position: shopPos, rotation: shopRot });
    addBuilder(awning.cloth, this.materials.cloth(0xd8c89a), 'shopCloth', { position: shopPos, rotation: shopRot });
    addBuilder(awning.detail, this.materials.woodPale(), 'shopDetail', { position: shopPos, rotation: shopRot });
    this.landmarks.workshop = { position: shopPos.clone(), rotation: shopRot };
    this.pois.push({ id: 'workshop', name: 'Мастерская', pos: shopPos.clone(), icon: 'craft' });

    // --- Костёр
    const fireSpot = this.terrain.findFlatSpotNear(homeSpot.x - 8, homeSpot.z - 6, 6, { maxSlope: 0.2, minH: 1.8 });
    const fire = makeCampfire();
    const firePos = V(fireSpot.x, fireSpot.h - 0.02, fireSpot.z);
    addBuilder(fire.stones, this.materials.rock([0.5, 0.5]), 'campfire', { position: firePos });
    addBuilder(fire.wood, this.materials.woodDark(), 'campfireWood', { position: firePos });
    this.landmarks.campfire = { position: firePos.clone() };
    this.pois.push({ id: 'campfire', name: 'Костёр', pos: firePos.clone(), icon: 'fire' });
    // искры + свет
    this.embers = new EmberSystem(this.root, firePos.clone().add(V(0, 0.1, 0)), 50);
    const fireLight = new THREE.PointLight(0xff9a44, 3.2, 14, 2);
    fireLight.position.copy(firePos).add(V(0, 0.7, 0));
    this.root.add(fireLight);
    this.fireLight = fireLight;

    // --- Причал: от берега в глубокую воду (ищем направление с быстрым свалом)
    let bestDock = null;
    for (let attempt = 0; attempt < 96; attempt++) {
      const a = (attempt / 96) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      // ищем линию берега: от суши к воде
      let shoreD = null, deepD = null;
      for (let d = 8; d < 90; d += 0.8) {
        const h = this.terrain.heightAt(homeSpot.x + dx * d, homeSpot.z + dz * d);
        if (shoreD === null && h < 0.45) shoreD = d;
        if (shoreD !== null && h < -2.4) {
          deepD = d;
          break;
        }
      }
      if (shoreD === null || deepD === null) continue;
      const runLength = deepD - shoreD;
      if (runLength < 6 || runLength > 34) continue;
      const score = -runLength + Math.abs(a + 0.7) * 2;
      if (!bestDock || score > bestDock.score) bestDock = { angle: a, shoreD, deepD, score };
    }
    if (!bestDock) bestDock = { angle: Math.PI * 0.5, shoreD: 30, deepD: 42, score: 0 };
    const dockLen = clamp(bestDock.deepD - bestDock.shoreD + 12, 16, 26);
    const dockMidD = bestDock.shoreD + dockLen * 0.5 - 2;
    const dockPos = V(
      homeSpot.x + Math.cos(bestDock.angle) * dockMidD,
      0,
      homeSpot.z + Math.sin(bestDock.angle) * dockMidD
    );
    this.dockPos = dockPos.clone();
    this.dockAngle = bestDock.angle - Math.PI / 2;
    this.dockAxis = { x: Math.cos(bestDock.angle), z: Math.sin(bestDock.angle) };
    const dock = makeDock({ length: dockLen, width: 2.8, deckY: 1.15, postsEvery: 2.6 });
    addBuilder(dock.wood, this.materials.woodDock(), 'dockDeck', { position: dockPos, rotation: this.dockAngle });
    addBuilder(dock.detail, this.materials.woodDock(), 'dockDetail', { position: dockPos, rotation: this.dockAngle });
    this.landmarks.dock = {
      position: dockPos.clone(),
      rotation: this.dockAngle,
      length: dockLen,
      width: 2.8,
      deckY: 1.15,
      axis: this.dockAxis,
      shoreD: bestDock.shoreD,
    };
    this.pois.push({ id: 'dock', name: 'Причал', pos: dockPos.clone(), icon: 'dock' });
    // точка на берегу у начала причала (для высадки)
    const landD = Math.max(2, bestDock.shoreD - 4);
    this.dockShore = V(
      homeSpot.x + this.dockAxis.x * landD,
      0,
      homeSpot.z + this.dockAxis.z * landD
    );
    this.dockShore.y = Math.max(0.7, this.terrain.heightAt(this.dockShore.x, this.dockShore.z));

    // лодка у причала — пришвартована
    const boat = makeBoatModel({ length: 4.8, beam: 1.55, withMotor: true, withOars: true });
    const boatGroup = new THREE.Group();
    boatGroup.name = 'playerBoat';
    const hullMesh = new THREE.Mesh(boat.group.hull.toGeometry({ name: 'boatHull' }), this.materials.woodBoat());
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    const deckMesh = new THREE.Mesh(boat.group.deck.toGeometry({ name: 'boatDeck' }), this.materials.woodPale());
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    const detailMesh = new THREE.Mesh(boat.group.detail.toGeometry({ name: 'boatDetail' }), this.materials.woodPale());
    detailMesh.castShadow = true;
    detailMesh.receiveShadow = true;
    boatGroup.add(hullMesh, deckMesh, detailMesh);
    const sideX = Math.cos(this.dockAngle), sideZ = -Math.sin(this.dockAngle);
    const boatSide = 2.6;
    const boatAlong = dockLen * 0.3;
    let bx = dockPos.x + sideX * boatSide + this.dockAxis.x * boatAlong;
    let bz = dockPos.z + sideZ * boatSide + this.dockAxis.z * boatAlong;
    // гарантируем глубину под килем
    for (let k = 0; k < 8; k++) {
      if (this.terrain.heightAt(bx, bz) < -1.1) break;
      bx += this.dockAxis.x * 2.5;
      bz += this.dockAxis.z * 2.5;
    }
    this.boatSpawn = V(bx, 0, bz);
    boatGroup.position.set(bx, 0, bz);
    boatGroup.rotation.y = this.dockAngle;
    this.root.add(boatGroup);
    this.boatGroup = boatGroup;
    this.boatDims = boat.dims;
    this.boatAnchors = boat.anchors;

    // --- Маяк на Маячном утёсе
    const lhIsland = ISLANDS.find((i) => i.id === 'lighthouse');
    const lhSpot = this.terrain.findFlatSpotNear(lhIsland.x, lhIsland.z, 4, { maxSlope: 0.6, minH: 12 });
    const lh = makeLighthouse({ height: 16, baseR: 3.1, topR: 1.6 });
    const lhPos = V(lhSpot.x, lhSpot.h - 0.3, lhSpot.z);
    addBuilder(lh.struct, this.materials.paint(0xe8e2d0, 0.4, [0.4, 0.2, 0.1]), 'lighthouseBody', { position: lhPos });
    addBuilder(lh.metal, this.materials.metal(0x9aa0a4, 0.3), 'lighthouseMetal', { position: lhPos });
    const lhGlass = addBuilder(lh.glass, this.materials.lampGlass(), 'lighthouseLamp', { position: lhPos, cast: false });
    this.landmarks.lighthouse = { position: lhPos.clone(), lampY: lh.lampY, totalHeight: lh.totalHeight, mesh: lhGlass };
    this.pois.push({ id: 'lighthouse', name: 'Маяк', pos: lhPos.clone(), icon: 'lighthouse' });
    // свет маяка — прожекторный конус (визуально вращается)
    const beamGeo = new THREE.ConeGeometry(14, 90, 20, 1, true);
    beamGeo.translate(0, -45, 0);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe8b8,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.copy(lhPos).add(V(0, lh.lampY, 0));
    this.root.add(beam);
    this.lighthouseBeam = beam;
    const lhLight = new THREE.PointLight(0xffdc9a, 6, 60, 2);
    lhLight.position.copy(lhPos).add(V(0, lh.lampY, 0));
    this.root.add(lhLight);
    this.lighthouseLight = lhLight;

    // --- Старая хижина на Туманном острове (для сюжета)
    const foggy = ISLANDS.find((i) => i.id === 'foggy');
    const fogSpot = this.terrain.findFlatSpotNear(foggy.x + 8, foggy.z - 4, 12, { maxSlope: 0.2, minH: 2.0 });
    const cabin2 = makeCabin({ w: 4.4, d: 3.6, h: 2.4 });
    const c2Pos = V(fogSpot.x, fogSpot.h - 0.2, fogSpot.z);
    addBuilder(cabin2.roof, this.materials.woodDark(), 'ruinRoof', { position: c2Pos, rotation: 2.1 });
    addBuilder(cabin2.detail, this.materials.woodDark(), 'ruinDetail', { position: c2Pos, rotation: 2.1 });
    this.landmarks.ruin = { position: c2Pos.clone() };
    this.pois.push({ id: 'ruin', name: 'Заброшенная хижина', pos: c2Pos.clone(), icon: 'ruin' });

    // --- Бочки, ящики, сети у причала
    const props = [
      { make: () => makeBarrel(31).toGeometry(), mat: this.materials.woodDock(), pos: [dockPos.x + 1.2, 0, dockPos.z + 4], s: 1 },
      { make: () => makeBarrel(37).toGeometry(), mat: this.materials.woodDock(), pos: [dockPos.x + 1.8, 0, dockPos.z + 5.1], s: 0.9 },
      { make: () => makeCrate(0.7).toGeometry(), mat: this.materials.woodPale(), pos: [dockPos.x + 2.4, 0, dockPos.z + 3.2], s: 1 },
      { make: () => makeCrate(0.5).toGeometry(), mat: this.materials.woodPale(), pos: [dockPos.x + 1.4, 0, dockPos.z + 6.1], s: 1 },
      { make: () => makeNet(41).toGeometry(), mat: this.materials.cloth(0xbfc4b4), pos: [dockPos.x + 2.2, 0.35, dockPos.z + 7.0], s: 1 },
    ];
    for (const p of props) {
      const g = p.make();
      const mesh = new THREE.Mesh(g, p.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const h = this.terrain.heightAt(p.pos[0], p.pos[2]);
      mesh.position.set(p.pos[0], Math.max(h, 0.2) + p.pos[1], p.pos[2]);
      mesh.scale.setScalar(p.s);
      mesh.rotation.y = rng() * TAU;
      this.root.add(mesh);
    }

    // --- Буи на воде (навигационные)
    const buoyGeo = makeBuoy(43).toGeometry();
    this.buoys = [];
    const buoySpots = [
      [40, 60], [-60, 40], [90, -40], [-30, -70], [120, 30], [-120, 90], [60, 120], [-90, -110],
    ];
    for (const [bx, bz] of buoySpots) {
      const mesh = new THREE.Mesh(buoyGeo, this.materials.paint(0xc03a2e, 0.5, [0.3, 0.15, 0.08]));
      mesh.castShadow = true;
      mesh.position.set(bx, 0, bz);
      this.root.add(mesh);
      this.buoys.push({ mesh, x: bx, z: bz, phase: rng() * TAU });
    }

    // --- Уличные фонари у причала
    this.lanterns = [];
    for (let i = 0; i < 3; i++) {
      const t = (i + 0.5) / 3;
      const lx = dockPos.x + Math.cos(this.dockAngle) * (t * 18 - 9) + Math.sin(this.dockAngle) * 1.1;
      const lz = dockPos.z - Math.sin(this.dockAngle) * (t * 18 - 9) + Math.cos(this.dockAngle) * 1.1;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 2.6, 8),
        this.materials.woodDark()
      );
      const groundY = Math.max(this.terrain.heightAt(lx, lz), 0.2);
      post.position.set(lx, groundY + 1.3, lz);
      post.castShadow = true;
      this.root.add(post);
      const bulbMat = this.materials.emissive(0xffcf8a, 3.0);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bulbMat);
      bulb.position.set(lx, groundY + 2.6, lz);
      this.root.add(bulb);
      const light = new THREE.PointLight(0xffb968, 0, 12, 2);
      light.position.copy(bulb.position);
      this.root.add(light);
      this.lanterns.push({ bulb, light, mat: bulbMat });
    }

    // --- Табличка/указатель
    this._addSignpost(V(homeSpot.x - 3, 0, homeSpot.z + 7));
  }

  _addSignpost(pos) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.0, 8), this.materials.woodDark());
    const groundY = Math.max(this.terrain.heightAt(pos.x, pos.z), 0.2);
    post.position.set(pos.x, groundY + 1.0, pos.z);
    post.castShadow = true;
    this.root.add(post);
    const board = makeGeoBoard();
    const mesh = new THREE.Mesh(board, this.materials.woodPale());
    mesh.position.set(pos.x + 0.4, groundY + 1.7, pos.z);
    mesh.rotation.y = 0.4;
    mesh.castShadow = true;
    this.root.add(mesh);
  }

  // ---------------------------------------------------------------- рыба
  _buildFish() {
    // Стаи: каждая — набор точек-рыб, курсирующих по маршруту вблизи биома
    const rng = makeRNG(777);
    const schoolSpots = [
      { x: 20, z: 66, sp: 'perch', n: 7 },
      { x: -40, z: -80, sp: 'pike', n: 4 },
      { x: 120, z: -100, sp: 'zander', n: 5 },
      { x: -120, z: 80, sp: 'ide', n: 6 },
      { x: -30, z: 30, sp: 'bream', n: 5 },
      { x: 150, z: -150, sp: 'trout', n: 4 },
      { x: -170, z: -140, sp: 'eel', n: 3 },
      { x: 70, z: 150, sp: 'flounder', n: 4 },
      { x: -190, z: -160, sp: 'catfish', n: 2 },
      { x: 160, z: -130, sp: 'moonfish', n: 1 },
    ];
    for (const spot of schoolSpots) {
      const species = SPECIES.find((s) => s.id === spot.sp);
      if (!species) continue;
      const group = new THREE.Group();
      const members = [];
      for (let i = 0; i < spot.n; i++) {
        const fish = createFish(species, this.materials);
        const depth = -1.6 - rng() * 3.2;
        fish.position.set(spot.x + rng.range(-4, 4), depth, spot.z + rng.range(-4, 4));
        fish.scale.setScalar(rng.range(0.6, 1.15));
        group.add(fish);
        members.push({
          mesh: fish,
          phase: rng() * TAU,
          speed: rng.range(0.7, 1.4),
          radius: rng.range(2.5, 7),
          depth,
          offset: rng() * TAU,
          big: i === 0,
          species,
        });
      }
      this.root.add(group);
      this.fishSchools.push({ center: V(spot.x, 0, spot.z), members, species, group, t: rng() * 100 });
    }
  }

  _buildBirds() {
    const rng = makeRNG(888);
    const gullGeo = makeSeagull(999);
    const bodyGeo = gullGeo.body.toGeometry();
    const wingLGeo = gullGeo.wingL;
    const wingRGeo = gullGeo.wingR;
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.8, side: THREE.DoubleSide, vertexColors: true });
    const flockCenters = [
      V(0, 26, 60), V(-100, 30, 60), V(140, 24, -100), V(-40, 28, -60), V(60, 32, 140),
    ];
    for (const center of flockCenters) {
      for (let i = 0; i < 4; i++) {
        const birdRoot = new THREE.Group();
        const body = new THREE.Mesh(bodyGeo, mat);
        body.castShadow = true;
        const wingL = new THREE.Mesh(wingLGeo, mat);
        const wingR = new THREE.Mesh(wingRGeo, mat);
        const wingPivotL = new THREE.Group();
        const wingPivotR = new THREE.Group();
        wingPivotL.add(wingL);
        wingPivotR.add(wingR);
        birdRoot.add(body, wingPivotL, wingPivotR);
        birdRoot.position.copy(center).add(V(rng.range(-14, 14), rng.range(-5, 5), rng.range(-14, 14)));
        birdRoot.scale.setScalar(rng.range(0.75, 1.25));
        this.root.add(birdRoot);
        this.birds.push({
          root: birdRoot,
          wingL: wingPivotL,
          wingR: wingPivotR,
          center: center.clone(),
          angle: rng() * TAU,
          radius: rng.range(12, 30),
          speed: rng.range(0.09, 0.16),
          phase: rng() * TAU,
          flap: rng.range(6, 9),
          height: rng.range(-6, 6),
        });
      }
    }
  }

  _buildAmbient() {
    // светлячки
    this.fireflies = new Fireflies(this.root, this.terrain, 320);
    // мошки/пыль в воздухе — уже в FX
    // «Портал» идей: указатели на карте
  }

  // ---------------------------------------------------------------- update
  update(dt, camera, atmosphere, water, fx) {
    const t = (this._time = (this._time || 0) + dt);

    // Рыбы плавают по кругу
    for (const school of this.fishSchools) {
      school.t += dt;
      for (const m of school.members) {
        m.phase += dt * 0.35 * m.speed;
        const a = m.phase + m.offset;
        const x = school.center.x + Math.cos(a) * m.radius;
        const z = school.center.z + Math.sin(a) * m.radius * 0.75;
        const y = m.depth + Math.sin(t * 0.6 + m.offset) * 0.5;
        m.mesh.position.lerp(V(x, y, z), 1 - Math.exp(-dt * 0.8));
        const dir = Math.atan2(Math.cos(a + 0.1) * m.radius, Math.sin(a + 0.1) * m.radius * 0.75);
        m.mesh.rotation.y = -a - Math.PI / 2;
        m.mesh.rotation.z = Math.sin(t * 0.9 + m.offset) * 0.08;
        m.mesh.userData.anim?.(t * m.speed, 0.9 + (m.big ? 0.2 : 0));
      }
    }

    // Птицы
    const dayF = clamp(atmosphere.sunElevationNorm * 3, 0, 1);
    for (const b of this.birds) {
      b.angle += dt * b.speed;
      const x = b.center.x + Math.cos(b.angle) * b.radius;
      const z = b.center.z + Math.sin(b.angle) * b.radius;
      const y = b.center.y + Math.sin(t * 0.4 + b.phase) * 2.2 + b.height * 0.2;
      b.root.position.set(x, y, z);
      b.root.rotation.y = -b.angle + Math.PI / 2;
      b.root.rotation.z = Math.sin(b.angle) * 0.22;
      const flap = Math.sin(t * b.flap + b.phase);
      b.wingL.rotation.z = flap * 0.62;
      b.wingR.rotation.z = -flap * 0.62;
      b.root.visible = dayF > 0.05;
    }

    // Мостки/лодка покачиваются (базовая анимация — физика в boat.js)
    for (const b of this.buoys) {
      const h = water ? water.getHeight(b.x, b.z) : 0;
      b.mesh.position.y = h + Math.sin(t * 1.1 + b.phase) * 0.06;
      b.mesh.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.12;
      b.mesh.rotation.x = Math.cos(t * 1.15 + b.phase) * 0.1;
    }

    // Фонари ночью
    const night = atmosphere.isNight ? 1 : 0;
    const lampOn = smoothstep(0.1, 0.45, 1 - dayF);
    for (const l of this.lanterns) {
      l.light.intensity = lampOn * 6.5;
      l.mat.emissiveIntensity = 0.4 + lampOn * 3.4;
    }
    if (this.lighthouseBeam) {
      // вращение луча
      this.lighthouseBeam.rotation.y = t * 0.55;
      this.lighthouseBeam.material.opacity = 0.02 + lampOn * 0.09;
      this.lighthouseLight.intensity = 1.5 + lampOn * 7;
    }
    if (this.fireLight) {
      const flick = 0.72 + Math.sin(t * 9.3) * 0.12 + Math.sin(t * 17.7) * 0.08 + Math.sin(t * 31.1) * 0.05;
      this.fireLight.intensity = flick * 4.2;
      this.fireLight.color.setHSL(0.075 + Math.sin(t * 3.1) * 0.008, 0.92, 0.56);
      if (fx && Math.random() < dt * 6) {
        fx.smokeAt(this.fireLight.position.clone().add(V(0, 0.4, 0)), 0.8);
      }
    }
    if (this.embers) this.embers.update(dt);
    if (this.fireflies) this.fireflies.update(dt, 1 - dayF * 1.6);

    // трава колышется — через вершинный шейдер невозможно без патча,
    // поэтому «дыхание» делаем вращением групп с малой амплитудой
    const wind = atmosphere.weather.wind ?? 0.5;
    for (let i = 0; i < this.instanceGroups.length; i++) {
      const g = this.instanceGroups[i];
      if (g.name === 'grass' || g.name === 'reeds' || g.name === 'kelp' || g.name === 'bushLeaf') {
        g.rotation.z = Math.sin(t * 0.9 + i) * 0.004 * wind;
        g.rotation.x = Math.cos(t * 0.7 + i) * 0.003 * wind;
      }
    }
  }

  /** Высота поверхности в точке (земля или вода). */
  groundHeight(x, z) {
    return this.terrain.heightAt(x, z);
  }

  /** Можно ли встать в точку (не вода, не слишком круто). */
  isWalkable(x, z, radius = 0.3) {
    const h = this.terrain.heightAt(x, z);
    if (h < 0.35) return false;
    const s = this.terrain.slopeAt(x, z);
    return s < 0.55;
  }
}

function makeGeoBoard() {
  const b = new GeoBuilder({ smooth: false });
  const w = 0.9, h = 0.5, t = 0.05;
  const bb = b.vertexCount;
  b.vert(-w / 2, 0, 0, 0, 0, new THREE.Color(0x8d7550));
  b.vert(w / 2, 0, 0, 1, 0, new THREE.Color(0x8d7550));
  b.vert(w / 2, h, 0, 1, 1, new THREE.Color(0x9c8458));
  b.vert(-w / 2, h, 0, 0, 1, new THREE.Color(0x9c8458));
  b.quad(bb, bb + 1, bb + 2, bb + 3);
  const bb2 = b.vertexCount;
  b.vert(-w / 2, 0, t, 0, 0, new THREE.Color(0x6d5a3c));
  b.vert(w / 2, 0, t, 1, 0, new THREE.Color(0x6d5a3c));
  b.vert(w / 2, h, t, 1, 1, new THREE.Color(0x7d6a4c));
  b.vert(-w / 2, h, t, 0, 1, new THREE.Color(0x7d6a4c));
  b.quad(bb2, bb2 + 3, bb2 + 2, bb2 + 1);
  return b.toGeometry();
}
