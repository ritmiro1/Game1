// ============================================================================
//  Атмосфера: небесный купол с процедурными облаками, солнце/луна, звёзды,
//  объёмный туман, погодные системы (ясно / дождь / туман / гроза / снег).
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp, smoothstep, mixRgb, hexToRgb01, TAU, makeRNG } from './math.js';
import { createCanvas, makeRadialSprite } from '../gen/textures.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * wp;
    gl_Position.z = gl_Position.w; // всегда на дальней плоскости
  }
`;

const SKY_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uMoonDir;
  uniform float uSunIntensity;
  uniform float uMoonIntensity;
  uniform float uTime;
  uniform float uCloudCover;
  uniform float uCloudSharp;
  uniform float uStars;
  uniform float uFogDensity;
  uniform vec3 uCloudColor;
  uniform vec3 uCloudShadow;
  varying vec3 vWorldDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) {
      v += a * vnoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float up = clamp(dir.y, -1.0, 1.0);

    // --- Базовый градиент неба
    float t = pow(clamp(up * 0.5 + 0.5, 0.0, 1.0), 0.72);
    vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 1.0, t));
    // подсветка горизонта в сторону солнца
    float sunAmount = max(dot(dir, uSunDir), 0.0);
    sky += uSunColor * pow(sunAmount, 6.0) * 0.28 * uSunIntensity;
    sky += uSunColor * pow(sunAmount, 1.6) * 0.09 * uSunIntensity;

    // --- Диск солнца + ореол
    float sunDisk = smoothstep(0.9992, 0.99975, sunAmount);
    sky += uSunColor * sunDisk * 22.0 * uSunIntensity;
    sky += uSunColor * pow(sunAmount, 220.0) * 1.4 * uSunIntensity;

    // --- Луна
    float moonAmount = max(dot(dir, uMoonDir), 0.0);
    float moonDisk = smoothstep(0.99955, 0.99988, moonAmount);
    sky += vec3(0.72, 0.80, 1.0) * moonDisk * 4.5 * uMoonIntensity;
    sky += vec3(0.42, 0.55, 0.9) * pow(moonAmount, 60.0) * 0.35 * uMoonIntensity;

    // --- Звёзды (только в верхней полусфере)
    if (up > -0.02) {
      vec2 sp = dir.xz / max(up + 0.18, 0.001);
      float s1 = hash(floor(sp * 220.0));
      float star = pow(s1, 68.0) * 4.0;
      float twinkle = 0.62 + 0.38 * sin(uTime * 2.4 + s1 * 90.0);
      // полоса Млечного Пути
      float band = exp(-pow((dot(dir, normalize(vec3(0.35, 0.18, 0.92))) * 2.4), 2.0)) * 0.35;
      sky += (vec3(0.85, 0.9, 1.0) * star * twinkle + vec3(0.5, 0.6, 0.85) * band * 0.10) * uStars * smoothstep(-0.02, 0.24, up);
    }

    // --- Облака (плоскостная проекция на сферу)
    if (up > 0.0) {
      vec2 cuv = dir.xz / (dir.y + 0.09) * 0.55;
      cuv += vec2(uTime * 0.0032, uTime * 0.0017);
      float n = fbm(cuv * 1.5);
      float n2 = fbm(cuv * 3.9 + 3.1);
      float cover = smoothstep(uCloudSharp, uCloudSharp + 0.42, n * 0.7 + n2 * 0.42) * uCloudCover;
      cover *= smoothstep(0.0, 0.30, up);
      // объём: подсветка верхних кромок солнцем, тени снизу
      float lit = clamp(dot(normalize(vec3(cuv.x, 0.9, cuv.y)), uSunDir) * 0.5 + 0.58, 0.0, 1.0);
      vec3 cloudCol = mix(uCloudShadow, uCloudColor, lit);
      cloudCol += uSunColor * pow(sunAmount, 3.0) * 0.55 * uSunIntensity;
      sky = mix(sky, cloudCol, cover * 0.94);
      // Мягкое «сияние» вокруг облаков
      sky += uCloudColor * cover * 0.06;
    }

    // --- Нижняя полусфера (земля/вода у горизонта)
    if (up < 0.0) {
      float g = smoothstep(0.0, -0.22, up);
      sky = mix(sky, uGround, g * 0.92);
    }
    // туманная дымка у горизонта
    float haze = exp(-abs(up) * 6.5) * uFogDensity;
    sky = mix(sky, uHorizon * 1.06, clamp(haze, 0.0, 0.82));

    gl_FragColor = vec4(sky, 1.0);
  }
`;

/** Ключевые цвета суток (в линейном sRGB 0..1). */
const TIME_KEYS = [
  { t: 0.0, zen: '#050a16', hor: '#0b1526', gnd: '#070c15', sun: '#1b2a4a', sunI: 0.0, moonI: 1.0, amb: '#16233a', ambI: 0.22, cloud: '#1a2438', cloudS: '#0c1220', fog: '#0a1220', exp: 1.18 },
  { t: 4.4, zen: '#0a1424', hor: '#17243a', gnd: '#0a1018', sun: '#2a3a55', sunI: 0.0, moonI: 0.7, amb: '#1c2a42', ambI: 0.26, cloud: '#22304a', cloudS: '#111a2a', fog: '#0d1726', exp: 1.15 },
  { t: 5.6, zen: '#22385c', hor: '#8a6a72', gnd: '#20232e', sun: '#ff9a5c', sunI: 0.55, moonI: 0.15, amb: '#3d4a63', ambI: 0.42, cloud: '#c48a86', cloudS: '#4a4258', fog: '#5d5468', exp: 1.1 },
  { t: 6.6, zen: '#4a7ab0', hor: '#e8a882', gnd: '#38322e', sun: '#ffb87a', sunI: 1.55, moonI: 0.0, amb: '#6a7d99', ambI: 0.62, cloud: '#f0c3a8', cloudS: '#7a6b76', fog: '#c39988', exp: 1.0 },
  { t: 8.5, zen: '#4f8cc8', hor: '#bcd3e4', gnd: '#4a4a3e', sun: '#ffe4c0', sunI: 2.6, moonI: 0.0, amb: '#8fa6bd', ambI: 0.85, cloud: '#f4f7fa', cloudS: '#a9b6c4', fog: '#b8cbd8', exp: 0.94 },
  { t: 12.0, zen: '#3f7fc4', hor: '#d3e3ee', gnd: '#5a5a44', sun: '#fff6e4', sunI: 3.35, moonI: 0.0, amb: '#9db4c9', ambI: 1.0, cloud: '#ffffff', cloudS: '#b9c6d2', fog: '#c8dae6', exp: 0.9 },
  { t: 15.5, zen: '#4281c0', hor: '#d6e2e6', gnd: '#5c5a42', sun: '#ffefd6', sunI: 3.0, moonI: 0.0, amb: '#9cb2c4', ambI: 0.95, cloud: '#fbfdff', cloudS: '#b2c0cc', fog: '#c6d6de', exp: 0.92 },
  { t: 17.6, zen: '#4878ae', hor: '#f0c090', gnd: '#4e4a38', sun: '#ffd7a0', sunI: 2.35, moonI: 0.0, amb: '#8f9fb2', ambI: 0.82, cloud: '#ffe3c4', cloudS: '#9c8f94', fog: '#dcc0a2', exp: 0.96 },
  { t: 18.8, zen: '#2e5080', hor: '#e88a5e', gnd: '#332e2c', sun: '#ff9350', sunI: 1.5, moonI: 0.05, amb: '#6a6f85', ambI: 0.6, cloud: '#e8a184', cloudS: '#5c5060', fog: '#b98a70', exp: 1.04 },
  { t: 19.7, zen: '#1d2f52', hor: '#8c5560', gnd: '#1c1c24', sun: '#c96a54', sunI: 0.5, moonI: 0.3, amb: '#3f4762', ambI: 0.44, cloud: '#9c7078', cloudS: '#3a3348', fog: '#5f4a56', exp: 1.12 },
  { t: 21.0, zen: '#0a1426', hor: '#1c2a3e', gnd: '#080d16', sun: '#243452', sunI: 0.05, moonI: 0.9, amb: '#1c2a44', ambI: 0.28, cloud: '#1e2a40', cloudS: '#0d1424', fog: '#0e1828', exp: 1.16 },
  { t: 24.0, zen: '#050a16', hor: '#0b1526', gnd: '#070c15', sun: '#1b2a4a', sunI: 0.0, moonI: 1.0, amb: '#16233a', ambI: 0.22, cloud: '#1a2438', cloudS: '#0c1220', fog: '#0a1220', exp: 1.18 },
].map((k) => ({
  ...k,
  zen: hexToRgb01(k.zen),
  hor: hexToRgb01(k.hor),
  gnd: hexToRgb01(k.gnd),
  sun: hexToRgb01(k.sun),
  amb: hexToRgb01(k.amb),
  cloud: hexToRgb01(k.cloud),
  cloudS: hexToRgb01(k.cloudS),
  fog: hexToRgb01(k.fog),
}));

export const WEATHER_TYPES = {
  clear: { label: 'Ясно', cloudCover: 0.34, cloudSharp: 0.50, fog: 0.30, wind: 0.5, rain: 0, wetness: 0, waveMul: 1.0, sunMul: 1.0, waveAmp: 1.0 },
  partly: { label: 'Переменная облачность', cloudCover: 0.62, cloudSharp: 0.42, fog: 0.42, wind: 0.9, rain: 0, wetness: 0, waveMul: 1.2, sunMul: 0.92, waveAmp: 1.45 },
  overcast: { label: 'Пасмурно', cloudCover: 0.95, cloudSharp: 0.24, fog: 0.58, wind: 1.3, rain: 0, wetness: 0.15, waveMul: 1.4, sunMul: 0.55, waveAmp: 1.8 },
  fog: { label: 'Туман', cloudCover: 0.78, cloudSharp: 0.4, fog: 1.0, wind: 0.35, rain: 0, wetness: 0.35, waveMul: 1.0, sunMul: 0.45, waveAmp: 0.85 },
  rain: { label: 'Дождь', cloudCover: 1.0, cloudSharp: 0.18, fog: 0.78, wind: 1.5, rain: 0.75, wetness: 0.85, waveMul: 1.7, sunMul: 0.34, waveAmp: 2.2 },
  storm: { label: 'Гроза', cloudCover: 1.0, cloudSharp: 0.10, fog: 0.85, wind: 2.3, rain: 1.0, wetness: 1.0, waveMul: 2.2, sunMul: 0.18, waveAmp: 3.0 },
  snow: { label: 'Снегопад', cloudCover: 0.92, cloudSharp: 0.26, fog: 0.82, wind: 1.1, rain: 0, wetness: 0.3, waveMul: 1.15, sunMul: 0.5, waveAmp: 1.4, snow: 0.85 },
};

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    // Время суток: 0..24 (часы)
    this.timeOfDay = 8.25;
    this.timeScale = 1;
    this.dayLengthMinutes = 14; // реальных минут на полные сутки
    this.day = 1;

    this.weather = { ...WEATHER_TYPES.clear };
    this.targetWeather = { ...WEATHER_TYPES.clear };
    this.weatherWetness = 0;
    this.wind = new THREE.Vector2(0.6, 0.35);
    this.windStrength = 0.5;
    this.lightning = 0;
    this._lightningTimer = 6;

    // --- Небесный купол
    this.skyUniforms = {
      uZenith: { value: new THREE.Color(0x3f7fc4) },
      uHorizon: { value: new THREE.Color(0xd3e3ee) },
      uGround: { value: new THREE.Color(0x5a5a44) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff6e4) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uSunIntensity: { value: 1 },
      uMoonIntensity: { value: 0 },
      uTime: { value: 0 },
      uCloudCover: { value: 0.34 },
      uCloudSharp: { value: 0.5 },
      uStars: { value: 0 },
      uFogDensity: { value: 0.3 },
      uCloudColor: { value: new THREE.Color(0xffffff) },
      uCloudShadow: { value: new THREE.Color(0xb9c6d2) },
    };
    const skyGeo = new THREE.SphereGeometry(1, 32, 24);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.scale.setScalar(3000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    // --- Свет
    this.sun = new THREE.DirectionalLight(0xfff2dc, 3);
    this.sun.castShadow = true;
    const shadowSize = renderer?.preset?.shadowMapSize ?? 2048;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.shadowRadius = 90;
    const cam = this.sun.shadow.camera;
    cam.left = -this.shadowRadius;
    cam.right = this.shadowRadius;
    cam.top = this.shadowRadius;
    cam.bottom = -this.shadowRadius;
    cam.updateProjectionMatrix();
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.moon = new THREE.DirectionalLight(0x93b4ff, 0.0);
    scene.add(this.moon);

    this.hemi = new THREE.HemisphereLight(0xbfd8ef, 0x3a3a2c, 0.9);
    scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x8095b0, 0.22);
    scene.add(this.ambient);

    // --- Туман
    this.fogColor = new THREE.Color(0xc8dae6);
    scene.fog = new THREE.FogExp2(this.fogColor.getHex(), 0.0042);

    // --- Дождь/снег (GPU-частицы через точки)
    this._buildPrecip();

    // --- Молнии
    this.flashLight = new THREE.PointLight(0xdfe9ff, 0, 400, 2);
    scene.add(this.flashLight);

    this.events = { onLightning: null, onWeatherChange: null, onNewDay: null };
    this.applyTimeOfDay(8.25, true);
  }

  _buildPrecip() {
    const COUNT = 9000;
    const pos = new Float32Array(COUNT * 3);
    const speed = new Float32Array(COUNT);
    const rng = makeRNG(777);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = rng.range(-45, 45);
      pos[i * 3 + 1] = rng.range(0, 42);
      pos[i * 3 + 2] = rng.range(-45, 45);
      speed[i] = rng.range(0.7, 1.4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    this.precipUniforms = {
      uTime: { value: 0 },
      uRain: { value: 0 },
      uSnow: { value: 0 },
      uWind: { value: new THREE.Vector2(0.6, 0.35) },
      uCenter: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color(0xcfe0ee) },
      uPixelRatio: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.precipUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute float aSpeed;
        uniform float uTime; uniform float uRain; uniform float uSnow;
        uniform vec2 uWind; uniform vec3 uCenter; uniform float uPixelRatio;
        varying float vAlpha; varying float vSize;
        void main() {
          vec3 p = position;
          float fall = uTime * (14.0 + aSpeed * 9.0) * (uRain + uSnow * 0.35);
          p.y = mod(position.y - fall * aSpeed, 42.0);
          p.x = mod(position.x + uWind.x * uTime * 5.0 * aSpeed + uCenter.x + 45.0, 90.0) - 45.0;
          p.z = mod(position.z + uWind.y * uTime * 5.0 * aSpeed + uCenter.z + 45.0, 90.0) - 45.0;
          p.y += uCenter.y - 6.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          gl_Position = projectionMatrix * mv;
          vAlpha = clamp(1.0 - dist / 62.0, 0.0, 1.0);
          gl_PointSize = clamp(mix(1.4, 2.6, uSnow) * uPixelRatio * 130.0 / max(dist, 6.0), 1.0, 14.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uRain; uniform float uSnow;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          float a = smoothstep(0.5, 0.05, r);
          float streak = uRain * smoothstep(0.5, 0.0, length(vec2(d.x * 5.0, d.y)));
          float shape = mix(streak, a, uSnow);
          gl_FragColor = vec4(uColor, shape * vAlpha * (uRain * 0.42 + uSnow * 0.85));
          if (gl_FragColor.a < 0.01) discard;
        }
      `,
    });
    this.precip = new THREE.Points(geo, mat);
    this.precip.frustumCulled = false;
    this.precip.renderOrder = 900;
    this.precip.visible = false;
    this.scene.add(this.precip);

    // Брызги на воде во время дождя — кольца через instanced mesh
    const ringGeo = new THREE.RingGeometry(0.06, 0.1, 12);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xdceaf4,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.rainRipples = new THREE.InstancedMesh(ringGeo, ringMat, 160);
    this.rainRipples.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rainRipples.frustumCulled = false;
    this.rainRipples.count = 160;
    this.rainRipples.visible = false;
    this._rippleState = [];
    for (let i = 0; i < 160; i++) this._rippleState.push({ life: Math.random(), x: 0, z: 0, scale: 1 });
    this.scene.add(this.rainRipples);
  }

  // ---------------------------------------------------------------- погода
  setWeather(name, instant = false) {
    const w = WEATHER_TYPES[name];
    if (!w) return;
    this.weatherName = name;
    this.targetWeather = { ...w };
    if (instant) {
      this.weather = { ...w };
      this.precip.visible = w.rain > 0 || w.snow > 0;
      this.rainRipples.visible = w.rain > 0;
    }
    this.events.onWeatherChange?.(name, w);
  }

  /** Угол солнца по времени суток (наклон оси — «северная» широта). */
  _celestial() {
    const t = (this.timeOfDay / 24) * TAU - Math.PI / 2;
    // Солнце: восход ~6:00, закат ~19:00
    const sunElev = Math.sin(((this.timeOfDay - 6) / 13) * Math.PI);
    const sunAzim = Math.cos(((this.timeOfDay - 6) / 13) * Math.PI);
    const dir = new THREE.Vector3(sunAzim * 0.82, sunElev, sunAzim * 0.24 + 0.55).normalize();
    if (this.timeOfDay < 6 || this.timeOfDay > 19) {
      // ночь — солнце под горизонтом, луна напротив
      const nightT = this.timeOfDay < 6 ? (this.timeOfDay + 24 - 19) / 11 : (this.timeOfDay - 19) / 11;
      const el = Math.sin(nightT * Math.PI);
      dir.set(-sunAzim * 0.7, el * 0.95, -sunAzim * 0.2 + 0.4).normalize();
    }
    const moon = dir.clone().multiplyScalar(-1);
    moon.y = Math.abs(moon.y) * 0.9 + 0.1;
    moon.normalize();
    return { sunDir: dir, moonDir: moon };
  }

  _sampleKeys(t) {
    const keys = TIME_KEYS;
    let a = keys[0], b = keys[1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (t >= keys[i].t && t <= keys[i + 1].t) {
        a = keys[i];
        b = keys[i + 1];
        break;
      }
    }
    const f = clamp((t - a.t) / Math.max(1e-5, b.t - a.t), 0, 1);
    const s = smoothstep(0, 1, f);
    return {
      zen: mixRgb(a.zen, b.zen, s),
      hor: mixRgb(a.hor, b.hor, s),
      gnd: mixRgb(a.gnd, b.gnd, s),
      sun: mixRgb(a.sun, b.sun, s),
      amb: mixRgb(a.amb, b.amb, s),
      cloud: mixRgb(a.cloud, b.cloud, s),
      cloudS: mixRgb(a.cloudS, b.cloudS, s),
      fog: mixRgb(a.fog, b.fog, s),
      sunI: lerp(a.sunI, b.sunI, s),
      moonI: lerp(a.moonI, b.moonI, s),
      ambI: lerp(a.ambI, b.ambI, s),
      exp: lerp(a.exp, b.exp, s),
    };
  }

  applyTimeOfDay(t, instant = false) {
    const k = this._sampleKeys(t);
    const w = this.weather;
    const { sunDir, moonDir } = this._celestial();
    const u = this.skyUniforms;
    const tc = (c) => new THREE.Color(c.r, c.g, c.b);
    // погода гасит солнце и делает небо более серым
    const overcast = clamp((w.cloudCover - 0.4) * 1.7, 0, 0.82);
    u.uZenith.value.copy(tc(mixRgb(k.zen, k.cloudS, overcast * 0.55)));
    u.uHorizon.value.copy(tc(mixRgb(k.hor, mixRgb(k.cloudS, { r: 0.62, g: 0.66, b: 0.7 }, 0.5), overcast * 0.7)));
    u.uGround.value.copy(tc(k.gnd));
    u.uSunDir.value.copy(sunDir);
    u.uMoonDir.value.copy(moonDir);
    u.uSunColor.value.copy(tc(k.sun));
    u.uSunIntensity.value = k.sunI * w.sunMul;
    u.uMoonIntensity.value = k.moonI;
    u.uCloudCover.value = w.cloudCover;
    u.uCloudSharp.value = w.cloudSharp;
    u.uFogDensity.value = w.fog;
    u.uCloudColor.value.copy(tc(mixRgb(k.cloud, { r: 0.72, g: 0.75, b: 0.79 }, overcast * 0.6)));
    u.uCloudShadow.value.copy(tc(mixRgb(k.cloudS, { r: 0.32, g: 0.34, b: 0.38 }, overcast * 0.4)));
    // звёзды видны ночью при ясном небе
    const night = 1 - smoothstep(0.0, 0.35, k.sunI / 3.0);
    u.uStars.value = night * (1 - w.cloudCover * 0.9);

    // --- свет
    const sunUp = clamp(sunDir.y * 1.6 + 0.18, 0, 1);
    this.sun.intensity = k.sunI * w.sunMul * sunUp * 2.9;
    this.sun.color.setRGB(k.sun.r, k.sun.g, k.sun.b);
    this.moon.intensity = k.moonI * 0.55 * (1 - overcast * 0.6);
    this.moon.color.set(0x8fb0ff);
    this.moon.position.copy(moonDir).multiplyScalar(120);
    this.hemi.intensity = k.ambI * (0.55 + (1 - overcast) * 0.6) * 0.95;
    this.hemi.color.setRGB(k.amb.r, k.amb.g, k.amb.b);
    this.hemi.groundColor.setRGB(k.gnd.r * 1.1, k.gnd.g * 1.05, k.gnd.b);
    this.ambient.intensity = k.ambI * 0.35 * (0.6 + overcast * 0.9);
    this.ambient.color.setRGB(k.amb.r, k.amb.g, k.amb.b);

    // --- туман
    const fogMix = mixRgb(k.fog, { r: 0.55, g: 0.58, b: 0.62 }, overcast * 0.5);
    this.fogColor.setRGB(fogMix.r, fogMix.g, fogMix.b);
    if (this.scene.fog) {
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.density = 0.0032 + w.fog * 0.007 + overcast * 0.002;
    }
    if (this.renderer) this.renderer.toneMappingExposure = k.exp * (1 + overcast * 0.05);
    this.exposureTarget = k.exp;

    // позиция солнца для теней задаётся камерой (в update)
    this.sunElevation = sunDir.y;
  }

  /** Позиция теневой камеры следует за игроком. */
  followTarget(pos) {
    this.sun.target.position.copy(pos);
    this.sun.target.updateMatrixWorld();
    const d = this._sunDirCache || new THREE.Vector3(0.5, 0.8, 0.3);
    this.sun.position.copy(pos).addScaledVector(d, 150);
    this.sun.position.y += 60;
  }

  update(dt, cameraPos) {
    // Время суток
    const hoursPerSec = 24 / (this.dayLengthMinutes * 60);
    const prev = this.timeOfDay;
    const scale = Number.isFinite(this.timeScale) ? this.timeScale : 1;
    const nextTime = this.timeOfDay + dt * hoursPerSec * scale;
    this.timeOfDay = Number.isFinite(nextTime) ? ((nextTime % 24) + 24) % 24 : 8.25;
    if (this.timeOfDay < prev) {
      this.day++;
      this.events.onNewDay?.(this.day);
    }

    // Погода плавно интерполируется к целевой
    const lerpKeys = ['cloudCover', 'cloudSharp', 'fog', 'wind', 'rain', 'wetness', 'waveMul', 'sunMul', 'waveAmp', 'snow'];
    for (const key of lerpKeys) {
      const tgt = this.targetWeather[key] ?? 0;
      const cur = this.weather[key] ?? 0;
      this.weather[key] = lerp(cur, tgt, 1 - Math.exp(-dt * 0.5));
    }
    this.weatherWetness = this.weather.wetness;

    const { sunDir, moonDir } = this._celestial();
    this._sunDirCache = sunDir.clone();
    this.sun.position.copy(cameraPos).addScaledVector(sunDir, 170);
    this.sun.target.position.copy(cameraPos);
    this.sun.target.updateMatrixWorld();
    // смещение теневой камеры — к камере игрока для резкости
    this.sun.shadow.camera.updateProjectionMatrix();

    this.applyTimeOfDay(this.timeOfDay);

    // Небо следует за камерой
    this.sky.position.copy(cameraPos);

    // Осадки
    const w = this.weather;
    const rainActive = w.rain > 0.05 || w.snow > 0.05;
    this.precip.visible = rainActive;
    this.rainRipples.visible = w.rain > 0.15;
    if (rainActive) {
      this.precipUniforms.uTime.value += dt;
      this.precipUniforms.uRain.value = w.rain;
      this.precipUniforms.uSnow.value = w.snow;
      this.precipUniforms.uWind.value.copy(this.wind).multiplyScalar(w.wind * 0.7);
      this.precipUniforms.uCenter.value.copy(cameraPos);
      this.precipUniforms.uColor.value.setRGB(
        this.fogColor.r * 1.1 + 0.1,
        this.fogColor.g * 1.1 + 0.1,
        this.fogColor.b * 1.1 + 0.1
      );
    }
    if (w.rain > 0.15) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      for (let i = 0; i < this._rippleState.length; i++) {
        const st = this._rippleState[i];
        st.life += dt * (0.9 + (i % 7) * 0.09);
        if (st.life > 1) {
          st.life = 0;
          st.x = cameraPos.x + (Math.random() - 0.5) * 46;
          st.z = cameraPos.z + (Math.random() - 0.5) * 46;
          st.scale = 0.4 + Math.random() * 0.9;
        }
        const s = st.scale * (0.35 + st.life * 2.4);
        m.compose(
          new THREE.Vector3(st.x, this.waterHeightAt ? this.waterHeightAt(st.x, st.z) + 0.03 : 0.03, st.z),
          q,
          new THREE.Vector3(s, 1, s)
        );
        this.rainRipples.setMatrixAt(i, m);
      }
      this.rainRipples.instanceMatrix.needsUpdate = true;
      this.rainRipples.material.opacity = 0.34 * w.rain;
    }

    // Молнии в грозу
    if (w.rain > 0.7 && w.wind > 1.6) {
      this._lightningTimer -= dt;
      if (this._lightningTimer <= 0) {
        this._lightningTimer = 6 + Math.random() * 14;
        this.lightning = 1;
        this.flashLight.position.set(
          cameraPos.x + (Math.random() - 0.5) * 120,
          70,
          cameraPos.z + (Math.random() - 0.5) * 120
        );
        this.events.onLightning?.();
      }
    }
    if (this.lightning > 0) {
      this.lightning = Math.max(0, this.lightning - dt * 3.4);
      const flick = this.lightning > 0.75 ? 1 : this.lightning > 0.5 ? 0.3 : this.lightning * 2;
      this.flashLight.intensity = flick * 900;
      this.hemi.intensity += flick * 1.6;
      this.skyUniforms.uCloudColor.value.addScalar(flick * 0.35);
    } else {
      this.flashLight.intensity = 0;
    }

    this.precipUniforms.uPixelRatio.value = this.renderer ? this.renderer.getPixelRatio() : 1;
  }

  get isNight() {
    return this.timeOfDay < 5.6 || this.timeOfDay > 20.2;
  }
  get sunElevationNorm() {
    return this.sunElevation ?? 0;
  }
  get clockString() {
    const h = Math.floor(this.timeOfDay);
    const m = Math.floor((this.timeOfDay - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  get weatherLabel() {
    return this.targetWeather.label || '';
  }
}

export { TIME_KEYS };
