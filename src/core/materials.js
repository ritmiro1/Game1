// ============================================================================
//  Библиотека PBR-материалов. Текстуры генерируются процедурно один раз и
//  переиспользуются всеми моделями (batch-дружелюбно).
// ============================================================================
import * as THREE from 'three';
import {
  makeWoodTextures,
  makeRockTextures,
  makeGroundTextures,
  makeSandTextures,
  makePaintTextures,
  makeBarkTextures,
  makeLeafTexture,
  makeMetalTextures,
  makeScalesTexture,
  makeCanvasClothTextures,
  makePaperTexture,
  makeFoamTexture,
  makeRadialSprite,
  normalizeVertexColors,
} from '../gen/textures.js';

function canvasToTexture(canvas, { repeat = [1, 1], aniso = 8, srgb = true, wrapping = THREE.RepeatWrapping } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = wrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export class MaterialLibrary {
  constructor(renderer, quality = 'high') {
    this.renderer = renderer;
    this.aniso = renderer?.preset?.aniso ?? 8;
    this.cache = new Map();
    this.maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
    this.aniso = Math.min(this.aniso, this.maxAniso);
    this._textures = new Map();
  }

  _tex(key, factory, opts = {}) {
    if (!this._textures.has(key)) {
      const c = factory();
      this._textures.set(key, canvasToTexture(c, { aniso: this.aniso, ...opts }));
    }
    return this._textures.get(key);
  }

  /** Набор карт для материала (map/normal/rough) из генератора. */
  _set(key, genFn, opts = {}) {
    const cacheKey = key + JSON.stringify(opts);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const t = genFn();
    const repeat = opts.repeat ?? [1, 1];
    const maps = {
      map: canvasToTexture(t.map, { repeat, aniso: this.aniso }),
      normalMap: t.normalMap ? canvasToTexture(t.normalMap, { repeat, aniso: this.aniso, srgb: false }) : null,
      roughnessMap: t.roughnessMap ? canvasToTexture(t.roughnessMap, { repeat, aniso: this.aniso, srgb: false }) : null,
    };
    this.cache.set(cacheKey, maps);
    return maps;
  }

  // ------------------------------------------------------------ материалы
  wood(repeat = [1, 1], opts = {}) {
    const k = `wood${repeat}${JSON.stringify(opts)}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const m = this._set(`woodTex${JSON.stringify(opts)}`, () => makeWoodTextures(512, opts));
    const mat = new THREE.MeshStandardMaterial({
      map: m.map,
      normalMap: m.normalMap,
      roughnessMap: m.roughnessMap,
      roughness: 1,
      metalness: 0,
      color: opts.color ?? 0xffffff,
      vertexColors: false,
    });
    mat.map.repeat.set(repeat[0], repeat[1]);
    mat.normalMap.repeat.set(repeat[0], repeat[1]);
    mat.roughnessMap.repeat.set(repeat[0], repeat[1]);
    mat.name = 'wood';
    this.cache.set(k, mat);
    return mat;
  }

  woodDark() {
    return this.wood([1, 1], { base: [0.26, 0.17, 0.11], seed: 9, grime: 0.35, plankCount: 7, color: 0xc8c0b4 });
  }

  woodBoat() {
    return this.wood([2, 2], { base: [0.55, 0.40, 0.26], seed: 23, grime: 0.18, plankCount: 5, variation: 0.1 });
  }

  woodDock() {
    return this.wood([3, 3], { base: [0.36, 0.25, 0.16], seed: 31, grime: 0.42, plankCount: 8 });
  }

  woodPale() {
    return this.wood([1, 1], { base: [0.62, 0.52, 0.38], seed: 37, grime: 0.22, plankCount: 6, variation: 0.08 });
  }

  bark() {
    if (this.cache.has('bark')) return this.cache.get('bark');
    const m = this._set('barkTex', () => makeBarkTextures(256));
    const mat = new THREE.MeshStandardMaterial({ map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, roughness: 1 });
    mat.map.repeat.set(1, 1);
    mat.name = 'bark';
    this.cache.set('bark', mat);
    return mat;
  }

  barkBirch() {
    if (this.cache.has('barkBirch')) return this.cache.get('barkBirch');
    const m = this._set('barkTex', () => makeBarkTextures(256));
    const mat = new THREE.MeshStandardMaterial({
      map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, roughness: 1, vertexColors: true,
    });
    mat.name = 'barkBirch';
    this.cache.set('barkBirch', mat);
    return mat;
  }

  rock(repeat = [2, 2]) {
    const k = 'rock' + repeat;
    if (this.cache.has(k)) return this.cache.get(k);
    const m = this._set('rockTex', () => makeRockTextures(512, 11));
    const mat = new THREE.MeshStandardMaterial({
      map: m.map,
      normalMap: m.normalMap,
      roughnessMap: m.roughnessMap,
      roughness: 1,
      vertexColors: true,
    });
    mat.map.repeat.set(repeat[0], repeat[1]);
    mat.normalMap.repeat.set(repeat[0], repeat[1]);
    mat.name = 'rock';
    this.cache.set(k, mat);
    return mat;
  }

  ground() {
    if (this.cache.has('ground')) return this.cache.get('ground');
    const m = this._set('groundTex', () => makeGroundTextures(512, 21));
    const mat = new THREE.MeshStandardMaterial({
      map: m.map,
      normalMap: m.normalMap,
      roughnessMap: m.roughnessMap,
      roughness: 1,
      vertexColors: true,
    });
    mat.map.repeat.set(1, 1);
    mat.name = 'ground';
    this.cache.set('ground', mat);
    return mat;
  }

  sand() {
    if (this.cache.has('sand')) return this.cache.get('sand');
    const m = this._set('sandTex', () => makeSandTextures(512, 31));
    const mat = new THREE.MeshStandardMaterial({ map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, roughness: 1, vertexColors: true });
    mat.name = 'sand';
    this.cache.set('sand', mat);
    return mat;
  }

  metal(tint = 0xffffff, rust = 0.25) {
    const k = `metal${tint}${rust}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const m = this._set(`metalTex${rust}`, () => makeMetalTextures(256, { rustAmount: rust }));
    const mat = new THREE.MeshStandardMaterial({
      map: m.map,
      normalMap: m.normalMap,
      roughnessMap: m.roughnessMap,
      metalness: 0.82,
      roughness: 1,
      color: tint,
    });
    mat.name = 'metal';
    this.cache.set(k, mat);
    return mat;
  }

  brass() {
    return this.metal(0xd8b06a, 0.1);
  }

  paint(color, wear = 0.55, rustColor = [0.36, 0.18, 0.09]) {
    const k = `paint${color}${wear}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const base = [
      ((color >> 16) & 255) / 255,
      ((color >> 8) & 255) / 255,
      (color & 255) / 255,
    ];
    const m = this._set(`paintTex${color}${wear}`, () => makePaintTextures(256, { base, wear, rust: rustColor }));
    const mat = new THREE.MeshStandardMaterial({
      map: m.map,
      normalMap: m.normalMap,
      roughnessMap: m.roughnessMap,
      roughness: 1,
      metalness: 0.12,
      color: 0xffffff,
    });
    mat.name = 'paint';
    this.cache.set(k, mat);
    return mat;
  }

  cloth(color = 0xffffff) {
    const k = `cloth${color}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const m = this._set('clothTex', () => makeCanvasClothTextures(256, 111));
    const mat = new THREE.MeshStandardMaterial({
      map: m.map,
      normalMap: m.normalMap,
      roughnessMap: m.roughnessMap,
      color,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    mat.name = 'cloth';
    this.cache.set(k, mat);
    return mat;
  }

  fish(species) {
    const k = 'fish' + species.id;
    if (this.cache.has(k)) return this.cache.get(k);
    const m = this._set(`scales${species.id}`, () =>
      makeScalesTexture(256, { base: species.rgb, belly: species.bellyRgb ?? [0.9, 0.9, 0.86], tint: species.tintRgb ?? [0.28, 0.42, 0.46], seed: species.seed ?? 5 })
    );
    const mat = new THREE.MeshPhysicalMaterial({
      map: m.map,
      normalMap: m.normalMap,
      roughnessMap: m.roughnessMap,
      roughness: 0.55,
      metalness: 0.35,
      clearcoat: 0.55,
      clearcoatRoughness: 0.35,
      iridescence: species.iridescent ? 0.45 : 0,
      iridescenceIOR: 1.3,
      vertexColors: true,
    });
    mat.name = 'fish';
    this.cache.set(k, mat);
    return mat;
  }

  glass(tint = 0xbfe4ef, opacity = 0.28) {
    const k = `glass${tint}${opacity}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const mat = new THREE.MeshPhysicalMaterial({
      color: tint,
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity,
      transmission: 0.75,
      thickness: 0.4,
      ior: 1.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.cache.set(k, mat);
    return mat;
  }

  emissive(color = 0xffd9a0, intensity = 2.6) {
    const k = `emis${color}${intensity}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x201a10,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.6,
      toneMapped: true,
    });
    this.cache.set(k, mat);
    return mat;
  }

  lampGlass() {
    if (this.cache.has('lampGlass')) return this.cache.get('lampGlass');
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2418,
      emissive: 0xffd08a,
      emissiveIntensity: 3.4,
      transparent: true,
      opacity: 0.85,
      roughness: 0.15,
    });
    this.cache.set('lampGlass', mat);
    return mat;
  }

  leaf(kind = 'deciduous') {
    const key = 'leaf' + kind;
    if (this.cache.has(key)) return this.cache.get(key);
    // если генератор карт недоступен — материал будет без текстуры,
    // но с цветом; чёрных квадов при этом не появляется
    const color = kind === 'pine' ? [0.13, 0.30, 0.20] : kind === 'birch' ? [0.36, 0.50, 0.20] : [0.22, 0.42, 0.20];
    const canvas = makeLeafTexture(128, { color, needle: kind === 'pine' || kind === 'fir', seed: kind === 'pine' ? 61 : 63 });
    const tex = canvasToTexture(canvas, { aniso: this.aniso });
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      alphaTest: 0.42,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 0.85,
      color: 0xffffff,
      vertexColors: true,
    });
    mat.name = 'leaf-' + kind;
    this.cache.set(key, mat);
    return mat;
  }

  grass() {
    if (this.cache.has('grassMat')) return this.cache.get('grassMat');
    const canvas = makeLeafTexture(128, { color: [0.30, 0.46, 0.20], seed: 71 });
    const tex = canvasToTexture(canvas, { aniso: this.aniso });
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.95,
      vertexColors: true,
    });
    this.cache.set('grassMat', mat);
    return mat;
  }

  paper() {
    if (this.cache.has('paper')) return this.cache.get('paper');
    const m = this._set('paperTex', () => makePaperTexture(256, 151));
    const mat = new THREE.MeshStandardMaterial({ map: m.map, roughness: 0.92, color: 0xf0e6cc });
    this.cache.set('paper', mat);
    return mat;
  }

  foamSprite() {
    if (this.cache.has('foamSprite')) return this.cache.get('foamSprite');
    const tex = canvasToTexture(makeFoamTexture(128, 91), { aniso: 4 });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.7, color: 0xffffff });
    this.cache.set('foamSprite', mat);
    return mat;
  }

  softSprite(color = '255,255,255', opacity = 0.5) {
    const k = 'sprite' + color + opacity;
    if (this.cache.has(k)) return this.cache.get(k);
    const tex = canvasToTexture(makeRadialSprite(128, color), { aniso: 4 });
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity, blending: THREE.AdditiveBlending });
    this.cache.set(k, mat);
    return mat;
  }

  rope() {
    if (this.cache.has('rope')) return this.cache.get('rope');
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7450, roughness: 0.95, metalness: 0 });
    this.cache.set('rope', mat);
    return mat;
  }

  dispose() {
    for (const v of this.cache.values()) {
      if (v && v.isMaterial) v.dispose();
    }
    for (const v of this._textures.values()) v?.dispose?.();
    this.cache.clear();
    this._textures.clear();
  }
}
