// ============================================================================
//  Вода: волны Герстнера, аналитические нормали, преломление, отражения,
//  глубинная абсорбция, пена у берега и на гребнях, подповерхностное
//  рассеяние, каустика и «фонарики» на поверхности.
//  JS-реплика волновой функции используется физикой (лодка, поплавок).
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp, smoothstep, TAU } from './math.js';

/** Параметры волн — единый источник истины для GPU и CPU. */
export const WAVE_DEFS = [
  // dirX, dirZ, длина волны, амплитуда, крутизна
  { dx: 0.98, dz: 0.18, len: 26.0, amp: 0.42, steep: 0.55 },
  { dx: 0.72, dz: -0.69, len: 15.5, amp: 0.28, steep: 0.5 },
  { dx: -0.42, dz: 0.91, len: 9.5, amp: 0.17, steep: 0.45 },
  { dx: 0.31, dz: 0.95, len: 5.8, amp: 0.11, steep: 0.42 },
  { dx: -0.88, dz: -0.47, len: 3.4, amp: 0.065, steep: 0.4 },
  { dx: 0.55, dz: 0.83, len: 2.1, amp: 0.04, steep: 0.35 },
];

const GRAVITY = 9.81;

/** Высота поверхности воды в точке (x,z) — точно повторяет шейдер. */
export function waterHeight(x, z, t, opts = {}) {
  const ampScale = opts.ampScale ?? 1;
  const waterLevel = opts.level ?? 0;
  let y = 0;
  for (let i = 0; i < WAVE_DEFS.length; i++) {
    const w = WAVE_DEFS[i];
    const k = TAU / w.len;
    const c = Math.sqrt(GRAVITY / k);
    const px = (w.dx * x + w.dz * z) * k - c * k * t * (opts.speed ?? 1) * (0.75 + i * 0.03);
    y += (w.amp * ampScale) * Math.sin(px);
  }
  return waterLevel + y;
}

/** Полное смещение Герстнера (включая горизонтальный сдвиг). */
export function waterDisplace(x, z, t, ampScale = 1) {
  let dx = 0, dy = 0, dz = 0;
  for (let i = 0; i < WAVE_DEFS.length; i++) {
    const w = WAVE_DEFS[i];
    const k = TAU / w.len;
    const c = Math.sqrt(GRAVITY / k);
    const phase = (w.dx * x + w.dz * z) * k - c * k * t * (0.75 + i * 0.03);
    const a = w.amp * ampScale;
    const q = w.steep / (a * k * WAVE_DEFS.length + 1e-4);
    dy += a * Math.sin(phase);
    const horiz = q * a * Math.cos(phase);
    dx += w.dx * horiz;
    dz += w.dz * horiz;
  }
  return { x: x + dx, y: dy, z: z + dz };
}

/** Нормаль поверхности (для пены и мелких объектов). */
export function waterNormal(x, z, t, ampScale = 1) {
  const e = 0.35;
  const hL = waterHeight(x - e, z, t, { ampScale });
  const hR = waterHeight(x + e, z, t, { ampScale });
  const hD = waterHeight(x, z - e, t, { ampScale });
  const hU = waterHeight(x, z + e, t, { ampScale });
  return new THREE.Vector3(-(hR - hL) / (2 * e), 1, -(hU - hD) / (2 * e)).normalize();
}

const WATER_VERT = /* glsl */ `
  #define NWAVES ${WAVE_DEFS.length}
  uniform float uTime;
  uniform float uAmpScale;
  uniform vec4 uWaves[NWAVES];   // dirX, dirZ, len, amp
  uniform float uSteep[NWAVES];
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec2 vFlowUv;
  varying float vCrest;

  void main() {
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    float ddx = 0.0, ddy = 0.0, ddz = 0.0;
    float steepSum = 0.0;
    for (int i = 0; i < NWAVES; i++) {
      vec4 w = uWaves[i];
      float k = 6.28318530718 / w.z;
      float c = sqrt(9.81 / k);
      float phase = (w.x * wp.x + w.z * wp.z) * k - c * k * uTime * (0.75 + float(i) * 0.03);
      float a = w.w * uAmpScale;
      float q = uSteep[i] / (a * k * float(NWAVES) + 0.0001);
      float s = sin(phase);
      float co = cos(phase);
      ddy += a * s;
      float horiz = q * a * co;
      ddx += w.x * horiz;
      ddz += w.z * horiz;
      steepSum += a * k * co;
    }
    wp.x += ddx;
    wp.y += ddy;
    wp.z += ddz;
    vCrest = clamp(steepSum * 0.55, 0.0, 1.5);
    vWorldPos = wp;
    vFlowUv = wp.xz * 0.05;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vNormalW = vec3(0.0, 1.0, 0.0);
  }
`;

const WATER_FRAG = /* glsl */ `
  precision highp float;
  #define NWAVES ${WAVE_DEFS.length}

  uniform float uTime;
  uniform float uAmpScale;
  uniform vec4 uWaves[NWAVES];
  uniform float uSteep[NWAVES];

  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform vec3 uCameraPos;
  uniform float uWaterLevel;
  uniform float uFresnel;
  uniform float uRefraction;
  uniform float uClarity;
  uniform float uFoamAmount;
  uniform float uWindStrength;
  uniform vec3 uSunSpecColor;

  uniform sampler2D uNormalMapA;
  uniform sampler2D uNormalMapB;
  uniform sampler2D uCaustics;
  uniform sampler2D uHeightMap;
  uniform vec4 uHeightBounds;   // minX, minZ, 1/sizeX, 1/sizeZ
  uniform vec2 uHeightRange;    // minH, 1/(maxH-minH)
  uniform sampler2D uReflectionTex;
  uniform float uHasReflection;
  uniform sampler2D uSceneColor;
  uniform float uHasScene;
  uniform vec2 uResolution;
  uniform sampler2D uSceneDepth;
  uniform float uFoamTrail;

  varying vec3 vWorldPos;
  varying float vCrest;

  // --- нормаль по 4 волнам (аналитически)
  vec3 waveNormal(vec2 p) {
    vec3 n = vec3(0.0, 1.0, 0.0);
    for (int i = 0; i < NWAVES; i++) {
      vec4 w = uWaves[i];
      float k = 6.28318530718 / w.z;
      float c = sqrt(9.81 / k);
      float phase = (w.x * p.x + w.z * p.y) * k - c * k * uTime * (0.75 + float(i) * 0.03);
      float a = w.w * uAmpScale;
      float co = cos(phase);
      n.x -= w.x * a * k * co;
      n.z -= w.z * a * k * co;
    }
    return normalize(n);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 p = vWorldPos.xz;
    vec3 baseN = waveNormal(p);
    vec3 V = normalize(uCameraPos - vWorldPos);
    float dist = length(uCameraPos - vWorldPos);

    // --- детальные нормали (две прокручивающиеся карты)
    float t = uTime;
    vec2 uvA = p * 0.045 + vec2(t * 0.012, t * 0.008);
    vec2 uvB = p * 0.11 - vec2(t * 0.02, t * 0.011);
    vec3 nA = texture2D(uNormalMapA, uvA).xyz * 2.0 - 1.0;
    vec3 nB = texture2D(uNormalMapB, uvB).xyz * 2.0 - 1.0;
    float detailFade = smoothstep(120.0, 12.0, dist) * (0.55 + uWindStrength * 0.45);
    vec3 detail = normalize(vec3((nA.x + nB.x * 1.4) * detailFade, 1.0, (nA.y + nB.y * 1.4) * detailFade));
    vec3 N = normalize(mix(baseN, normalize(baseN + detail - vec3(0.0, 1.0, 0.0)), 0.72));

    // --- глубина из карты высот (для цвета и пены у берега)
    vec2 hUv = (p - uHeightBounds.xy) * uHeightBounds.zw;
    float terrainH = -3.0;
    if (hUv.x > -0.02 && hUv.x < 1.02 && hUv.y > -0.02 && hUv.y < 1.02) {
      terrainH = texture2D(uHeightMap, clamp(hUv, 0.001, 0.999)).r / uHeightRange.y + uHeightRange.x;
    }
    float depth = max(uWaterLevel - terrainH, 0.0);

    // --- отражение: планарная RT или аналитическое небо
    vec3 refl;
    if (uHasReflection > 0.5) {
      vec2 ruv = gl_FragCoord.xy / uResolution;
      refl = texture2D(uReflectionTex, ruv + N.xz * 0.02).rgb;
    } else {
      vec3 R = reflect(-V, N);
      refl = mix(uHorizonColor, uSkyColor, clamp(R.y * 1.3, 0.0, 1.0));
    }

    // --- преломление (если есть захват сцены)
    vec3 refrColor;
    if (uHasScene > 0.5) {
      vec2 suv = gl_FragCoord.xy / uResolution + N.xz * 0.016 * clamp(3.0 / max(depth, 0.4), 0.2, 1.6);
      refrColor = texture2D(uSceneColor, clamp(suv, 0.001, 0.999)).rgb;
    } else {
      refrColor = uShallowColor;
    }

    // --- цвет воды по глубине с абсорбцией
    float absorption = 1.0 - exp(-depth * (0.34 + uClarity * 1.15));
    vec3 waterCol = mix(uShallowColor, uDeepColor, clamp(absorption, 0.0, 1.0));
    // мелководье просвечивает
    vec3 body = mix(refrColor * vec3(0.82, 0.94, 0.95), waterCol, clamp(absorption * 0.9 + 0.22, 0.0, 1.0));

    // --- подповерхностное рассеяние на гребнях (солнце сквозь толщу)
    float sss = pow(clamp(dot(V, -uSunDir) * 0.5 + 0.5, 0.0, 1.0), 2.0) * max(vCrest, 0.0);
    body += uShallowColor * sss * 0.55 + uSunColor * sss * 0.18;

    // --- каустика на мелководье (видна сквозь воду)
    vec2 cuv = p * 0.09 + vec2(t * 0.014, -t * 0.011);
    float caustic = texture2D(uCaustics, cuv).a * texture2D(uCaustics, cuv * 1.7 + 0.3).a;
    body += uSunColor * caustic * smoothstep(6.0, 0.4, depth) * 0.45 * clamp(uSunDir.y * 3.0, 0.0, 1.0);

    // --- френель
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
    fres = mix(0.02, 1.0, fres * uFresnel);
    vec3 col = mix(body, refl, clamp(fres, 0.0, 0.92));

    // --- блик солнца (модель Кука-Торранса с шероховатостью)
    vec3 H = normalize(uSunDir + V);
    float rough = mix(0.06, 0.22, clamp(uWindStrength, 0.0, 1.0));
    float a2 = rough * rough * rough * rough;
    float NdotH = max(dot(N, H), 0.0);
    float denom = NdotH * NdotH * (a2 - 1.0) + 1.0;
    float D = a2 / (3.14159 * denom * denom + 1e-5);
    float spec = clamp(D * 0.06, 0.0, 26.0) * clamp(dot(N, uSunDir) * 1.6, 0.0, 1.0);
    col += uSunColor * spec * 0.85;
    // «Лунная дорожка» ночью — широкий блик по нормали
    float moonRoad = pow(clamp(dot(reflect(-V, N), normalize(vec3(uSunDir.x, abs(uSunDir.y) * 0.35 + 0.05, uSunDir.z))), 0.0, 1.0), 26.0);
    col += uSunSpecColor * moonRoad * 0.6;

    // --- пена у берега
    float shore = smoothstep(1.35, 0.02, depth);
    float flick = texture2D(uNormalMapB, p * 0.31 + vec2(t * 0.05, t * 0.03)).x;
    float foamNoise = texture2D(uNormalMapA, p * 0.22 - vec2(t * 0.03, 0.0)).y;
    shore *= smoothstep(0.32, 0.72, flick * 0.6 + foamNoise * 0.6 + shore * 0.35);
    // пена на гребнях
    float crestFoam = smoothstep(0.62, 1.25, vCrest * (0.5 + uWindStrength)) * (0.35 + uWindStrength * 0.65);
    crestFoam *= smoothstep(0.42, 0.78, foamNoise * 0.7 + flick * 0.55);
    float foam = clamp(shore * uFoamAmount + crestFoam * uFoamAmount, 0.0, 1.0);
    col = mix(col, uFoamColor * (0.82 + 0.35 * clamp(dot(N, uSunDir) + 0.35, 0.0, 1.0)), foam * 0.92);

    // --- след пены (от лодки/двигателя) через шумовую полосу
    if (uFoamTrail > 0.001) {
      float trail = 0.0;
      col = mix(col, uFoamColor, trail);
    }

    // --- затухание детали вдали (против мерцания)
    float fogFactor = 0.0;
    col = mix(col, uHorizonColor, smoothstep(90.0, 320.0, dist) * 0.55);

    // прозрачность: мелководье прозрачнее
    float alpha = clamp(mix(0.62, 0.97, absorption) + foam * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

export class Water {
  constructor(opts) {
    const {
      scene,
      size = 1400,
      segments = 200,
      level = 0,
      heightMap = null,
      heightBounds = { minX: -300, minZ: -300, sizeX: 600, sizeZ: 600 },
      quality = 'high',
      renderer = null,
    } = opts || {};

    this.level = level;
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.time = 0;
    this.ampScale = 1.0;
    this.windStrength = 0.5;
    this.foamAmount = 1.0;

    this.group = new THREE.Group();
    this.group.name = 'water';

    // --- Геометрия: неравномерная сетка (плотная в центре)
    const geo = makeRadialGrid(size, segments);
    this.geometry = geo;

    // --- Текстуры
    this.normalMapA = makeNoiseNormalTexture(256, 3, 0.55);
    this.normalMapB = makeNoiseNormalTexture(256, 7, 0.35);
    this.normalMapA.wrapS = this.normalMapA.wrapT = THREE.RepeatWrapping;
    this.normalMapB.wrapS = this.normalMapB.wrapT = THREE.RepeatWrapping;

    const waveUniform = [];
    for (const w of WAVE_DEFS) waveUniform.push(new THREE.Vector4(w.dx, w.dz, w.len, w.amp));
    // ПРИМЕЧАНИЕ: w.z — длина волны, w.w — амплитуда; в шейдере w.z==len
    this.uniforms = {
      uTime: { value: 0 },
      uAmpScale: { value: 1 },
      uWaves: { value: waveUniform },
      uSteep: { value: WAVE_DEFS.map((w) => w.steep) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
      uSunColor: { value: new THREE.Color(0xfff2dc) },
      uSkyColor: { value: new THREE.Color(0x88b6dd) },
      uHorizonColor: { value: new THREE.Color(0xc8dae6) },
      uDeepColor: { value: new THREE.Color(0x0a2430) },
      uShallowColor: { value: new THREE.Color(0x2d7a72) },
      uFoamColor: { value: new THREE.Color(0xe8f4f8) },
      uCameraPos: { value: new THREE.Vector3() },
      uWaterLevel: { value: level },
      uFresnel: { value: 1.0 },
      uRefraction: { value: 1 },
      uClarity: { value: 0.55 },
      uFoamAmount: { value: 1 },
      uWindStrength: { value: 0.5 },
      uNormalMapA: { value: this.normalMapA },
      uNormalMapB: { value: this.normalMapB },
      uCaustics: { value: makeCausticsTexture(256) },
      uHeightMap: { value: heightMap || makeFlatHeightTexture() },
      uHeightBounds: {
        value: new THREE.Vector4(heightBounds.minX, heightBounds.minZ, 1 / heightBounds.sizeX, 1 / heightBounds.sizeZ),
      },
      uHeightRange: { value: new THREE.Vector2(-14, 1 / 40) },
      uReflectionTex: { value: null },
      uHasReflection: { value: 0 },
      uSceneColor: { value: null },
      uSceneDepth: { value: null },
      uHasScene: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uFoamTrail: { value: 0 },
      uSunSpecColor: { value: new THREE.Color(0x9fc4ff) },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'waterSurface';
    this.group.add(this.mesh);

    // --- Вторая плоскость «дальней воды» для бесконечного горизонта
    const farGeo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    farGeo.rotateX(-Math.PI / 2);
    const farMat = new THREE.MeshBasicMaterial({
      color: 0x1d4a5c,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      fog: false,
    });
    this.farWater = new THREE.Mesh(farGeo, farMat);
    this.farWater.position.y = level - 0.06;
    this.farWater.renderOrder = 9;
    this.farWater.visible = true;
    this.group.add(this.farWater);

    // --- Пленочная поверхность у берега (тонкий слой / грязь)
    this.scene.add(this.group);

    this._reflectionRT = null;
    this._mirrorCam = new THREE.PerspectiveCamera();
    this._reflectionEnabled = false;
  }

  /** Включает планарные отражения (дорого — половина разрешения). */
  enableReflections(renderer, enabled) {
    this._reflectionEnabled = enabled;
    if (!enabled) {
      this.uniforms.uHasReflection.value = 0;
      if (this._reflectionRT) {
        this._reflectionRT.dispose();
        this._reflectionRT = null;
      }
      return;
    }
    if (!this._reflectionRT) {
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      this._reflectionRT = new THREE.WebGLRenderTarget(Math.max(2, s.x >> 1), Math.max(2, s.y >> 1), {
        type: THREE.HalfFloatType,
        colorSpace: THREE.LinearSRGBColorSpace,
      });
      this.uniforms.uReflectionTex.value = this._reflectionRT.texture;
      this.uniforms.uHasReflection.value = 1;
    }
  }

  setSceneCapture(rt, enabled) {
    if (enabled && rt) {
      this.uniforms.uSceneColor.value = rt.texture;
      this.uniforms.uSceneDepth.value = rt.depthTexture || null;
      this.uniforms.uHasScene.value = 1;
    } else {
      this.uniforms.uHasScene.value = 0;
    }
  }

  /** Задать диапазон высот карты (для пены и цвета мелководья). */
  setHeightRange(minH, maxH) {
    this.uniforms.uHeightRange.value.set(minH, 1 / Math.max(0.001, maxH - minH));
  }

  setSun(dir, color, intensity) {
    this.uniforms.uSunDir.value.copy(dir).normalize();
    this.uniforms.uSunColor.value.copy(color).multiplyScalar(clamp(intensity * 0.5, 0, 3));
  }

  setSky(zenith, horizon, deep, shallow) {
    this.uniforms.uSkyColor.value.copy(zenith);
    this.uniforms.uHorizonColor.value.copy(horizon);
    if (deep) this.uniforms.uDeepColor.value.copy(deep);
    if (shallow) this.uniforms.uShallowColor.value.copy(shallow);
    this.farWater.material.color.copy(deep || zenith).multiplyScalar(0.85);
  }

  setWeather(rain, windStrength, foamAmount) {
    this.windStrength = windStrength;
    this.uniforms.uWindStrength.value = clamp(windStrength, 0, 1.8);
    this.uniforms.uFoamAmount.value = clamp(foamAmount ?? 1, 0, 2.2);
    this.uniforms.uClarity.value = clamp(0.55 - rain * 0.3, 0.15, 0.9);
  }

  setWind(vec) {
    this.uniforms.uWindDir = this.uniforms.uWindDir || { value: vec };
  }

  update(dt, camera, ampScale = 1) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uAmpScale.value = ampScale;
    this.ampScale = ampScale;
    this.uniforms.uCameraPos.value.copy(camera.position);
    // вода следует за камерой, чтобы покрывать горизонт
    this.mesh.position.x = Math.round(camera.position.x / 8) * 8;
    this.mesh.position.z = Math.round(camera.position.z / 8) * 8;
    this.mesh.position.y = this.level;
    this.farWater.position.x = camera.position.x;
    this.farWater.position.z = camera.position.z;
    this.farWater.position.y = this.level - 0.06;
    this.farWater.material.opacity = 0.94;
    this.uniforms.uResolution.value.set(
      this.renderer ? this.renderer.domElement.width : 1920,
      this.renderer ? this.renderer.domElement.height : 1080
    );
  }

  getHeight(x, z, t = this.time) {
    return waterHeight(x, z, t, { ampScale: this.ampScale, level: this.level });
  }

  getNormal(x, z, t = this.time) {
    return waterNormal(x, z, t, this.ampScale);
  }

  /** Рендер планарного отражения — вызывать до основного прохода. */
  renderReflection(renderer, scene, camera, hideObjects = []) {
    if (!this._reflectionEnabled || !this._reflectionRT) return;
    const rt = this._reflectionRT;
    const cam = this._mirrorCam;
    cam.copy(camera);
    cam.position.set(camera.position.x, 2 * this.level - camera.position.y, camera.position.z);
    const target = new THREE.Vector3();
    camera.getWorldDirection(target);
    const lookAt = new THREE.Vector3(
      camera.position.x + target.x,
      2 * this.level - (camera.position.y + target.y),
      camera.position.z + target.z
    );
    cam.up.set(0, -1, 0);
    cam.lookAt(lookAt);
    cam.up.set(0, 1, 0);
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    const prevVisible = this.mesh.visible;
    const prevFar = this.farWater.visible;
    this.mesh.visible = false;
    this.farWater.visible = false;
    const hidden = hideObjects.map((o) => o.visible);
    hideObjects.forEach((o) => (o.visible = false));

    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevRT);
    this.mesh.visible = prevVisible;
    this.farWater.visible = prevFar;
    hideObjects.forEach((o, i) => (o.visible = hidden[i]));
  }

  /** Вызывается при изменении размера. */
  resize(renderer) {
    if (!this._reflectionRT || !renderer) return;
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    this._reflectionRT.setSize(Math.max(2, s.x >> 1), Math.max(2, s.y >> 1));
  }
}

// ---------------------------------------------------------------- сетка
/** Сетка с радиальным сгущением: мелкие ячейки у камеры, крупные вдали. */
function makeRadialGrid(size, segments) {
  const N = segments;
  const half = size / 2;
  const positions = new Float32Array((N + 1) * (N + 1) * 3);
  const warp = (u) => {
    // u in -1..1 -> нелинейное распределение
    const s = Math.sign(u);
    const a = Math.abs(u);
    return s * (Math.pow(a, 1.9) * half);
  };
  let k = 0;
  for (let j = 0; j <= N; j++) {
    const v = (j / N) * 2 - 1;
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1;
      positions[k++] = warp(u) * 1.35;
      positions[k++] = 0;
      positions[k++] = warp(v) * 1.35;
    }
  }
  const indices = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const c = a + (N + 1);
      const d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  g.boundingSphere.radius = size;
  return g;
}

/** Нормаль-карта из тайлящегося шума (canvas → DataTexture). */
function makeNoiseNormalTexture(size, freq, strength) {
  const data = new Float32Array(size * size * 4);
  const height = new Float32Array(size * size);
  const hash = (ix, iy) => {
    const x = ((ix % size) + size) % size, y = ((iy % size) + size) % size;
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = sm(x - x0), fy = sm(y - y0);
    const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0, amp = 1, f = 1, norm = 0;
      for (let o = 0; o < 4; o++) {
        h += amp * noise(((x / size) * freq * f) % freq, ((y / size) * freq * f) % freq);
        norm += amp;
        amp *= 0.55;
        f *= 2;
      }
      height[y * size + x] = h / norm;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x - 1 + size) % size)];
      const r = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const d = height[((y + 1) % size) * size + x];
      let nx = (l - r) * strength * 6;
      let ny = (u - d) * strength * 6;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = (nx / len) * 0.5 + 0.5;
      data[i + 1] = (ny / len) * 0.5 + 0.5;
      data[i + 2] = (nz / len) * 0.5 + 0.5;
      data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Каустика — периодическая текстура (альфа-канал как интенсивность). */
export function makeCausticsTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const hash = (ix, iy) => {
    const x = ((ix % size) + size) % size, y = ((iy % size) + size) % size;
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ 0x9e3779b9;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = sm(x - x0), fy = sm(y - y0);
    const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 8, v = (y / size) * 8;
      const a = noise(u, v) * 0.6 + noise(u * 2.1, v * 2.1) * 0.3 + noise(u * 4.3, v * 4.3) * 0.1;
      const b = noise(u + 3.1, v + 1.7) * 0.6 + noise(u * 2.1 + 2.3, v * 2.1 + 1.1) * 0.3 + noise(u * 4.3, v * 4.3) * 0.1;
      const net = Math.pow(clamp(Math.abs(a - b) * 7.5, 0, 1), 2.4);
      const ridge = Math.pow(clamp(1 - Math.abs(a * 2 - 1) * 2.0, 0, 1), 3.2);
      const val = clamp(net * 0.9 + ridge * 0.6, 0, 1);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = val * 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function makeFlatHeightTexture() {
  const data = new Uint8Array([72, 0, 0, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}
