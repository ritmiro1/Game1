// ============================================================================
//  Рендер-конвейер: HDR, пост-обработка (GTAO/SSAO, Bloom, Tilt-Shift DOF,
//  SMAA), пресеты качества. Всё настраивается из русскоязычного меню.
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { clamp } from './math.js';

/** Финальный проход: виньетка, градация цвета, лёгкое зерно, «тёплый» грейд. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.022 },
    uSat: { value: 1.06 },
    uContrast: { value: 1.03 },
    uLift: { value: new THREE.Vector3(0.012, 0.014, 0.02) },
    uWarm: { value: 0.035 },
    uUnderwater: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uSat;
    uniform float uContrast;
    uniform vec3 uLift;
    uniform float uWarm;
    uniform float uUnderwater;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // Насыщенность и контраст
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c += uLift;

      // Тёплый сдвиг в светах, холодный в тенях (кинематографичный грейд)
      vec3 warm = vec3(uWarm, uWarm * 0.45, -uWarm * 0.5);
      c += warm * smoothstep(0.45, 1.0, l);
      c -= warm * 0.6 * (1.0 - smoothstep(0.0, 0.35, l));

      // Подводная среда: сине-зелёный фильтр и лёгкая волна
      if (uUnderwater > 0.001) {
        vec3 uw = c * vec3(0.42, 0.78, 1.05) + vec3(0.02, 0.09, 0.13);
        float wobble = sin(vUv.y * 42.0 + uTime * 2.2) * sin(vUv.x * 26.0 - uTime * 1.4);
        uw += wobble * 0.018;
        c = mix(c, uw, uUnderwater);
      }

      // Виньетка
      vec2 d = vUv - 0.5;
      float vign = 1.0 - uVignette * dot(d, d) * 1.75;
      c *= vign;

      // Плёночное зерно
      float g = hash(vUv * 1024.0 + fract(uTime) * 37.0) - 0.5;
      c += g * uGrain;

      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export const QUALITY_PRESETS = {
  low: {
    label: 'Низкое',
    pixelRatio: 0.8,
    shadows: false,
    shadowMapSize: 512,
    ssao: false,
    bloom: false,
    dof: false,
    smaa: false,
    refractions: false,
    waterTess: 96,
    grassDensity: 0.45,
    particles: 0.4,
    reflections: false,
    aniso: 1,
  },
  medium: {
    label: 'Среднее',
    pixelRatio: 1.0,
    shadows: true,
    shadowMapSize: 1024,
    ssao: false,
    bloom: true,
    dof: false,
    smaa: true,
    refractions: false,
    waterTess: 160,
    grassDensity: 0.75,
    particles: 0.7,
    reflections: false,
    aniso: 4,
  },
  high: {
    label: 'Высокое',
    pixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 2048,
    ssao: true,
    bloom: true,
    dof: true,
    smaa: true,
    refractions: true,
    waterTess: 220,
    grassDensity: 1.0,
    particles: 1.0,
    reflections: true,
    aniso: 8,
  },
  ultra: {
    label: 'Ультра (How to Fish)',
    pixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 4096,
    ssao: true,
    bloom: true,
    dof: true,
    smaa: true,
    refractions: true,
    waterTess: 288,
    grassDensity: 1.35,
    particles: 1.4,
    reflections: true,
    aniso: 16,
  },
};

export class RenderPipeline {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.quality = opts.quality || 'high';
    this.preset = QUALITY_PRESETS[this.quality];

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.preset.pixelRatio);
    renderer.shadowMap.enabled = this.preset.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x0a1520, 1);
    this.renderer = renderer;
    this.renderer.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.08, 4000);
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.timeScale = 1;
    this.frame = 0;
    this.stats = { fps: 60, ms: 16.6, frames: 0, fpsAcc: 0, fpsTime: 0 };

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this._buildComposer();
  }

  _buildComposer() {
    const { renderer, scene, camera } = this;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 2,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);

    this.renderPass = new RenderPass(scene, camera);
    composer.addPass(this.renderPass);

    // GTAO — качественное затенение в экранном пространстве
    if (this.preset.ssao) {
      const gtao = new GTAOPass(scene, camera, size.x, size.y);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
      gtao.blendIntensity = 0.85;
      this.gtao = gtao;
      composer.addPass(gtao);
    }

    if (this.preset.bloom) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.34, 0.72, 0.86);
      this.bloom = bloom;
      composer.addPass(bloom);
    }

    if (this.preset.dof) {
      const bokeh = new BokehPass(scene, camera, {
        focus: 12,
        aperture: 0.00022,
        maxblur: 0.011,
        width: size.x,
        height: size.y,
      });
      this.bokeh = bokeh;
      composer.addPass(bokeh);
    }

    const grade = new ShaderPass(GradeShader);
    this.grade = grade;
    composer.addPass(grade);

    composer.addPass(new OutputPass());

    if (this.preset.smaa) {
      const smaa = new SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio());
      this.smaa = smaa;
      composer.addPass(smaa);
    }

    this.composer = composer;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.preset.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(size.x, size.y);
      if (this.smaa) this.smaa.setSize(size.x, size.y);
      if (this.bokeh) this.bokeh.setSize(size.x, size.y);
      if (this.gtao) this.gtao.setSize(size.x, size.y);
    }
  }

  setQuality(name) {
    if (this.quality === name) return;
    this.quality = name;
    this.preset = QUALITY_PRESETS[name];
    this.renderer.shadowMap.enabled = this.preset.shadows;
    // Полная пересборка конвейера (простой и надёжный путь)
    const old = this.composer;
    this.composer = null;
    this._buildComposer();
    if (old) {
      old.passes.length = 0;
      old.renderTarget1.dispose();
      old.renderTarget2.dispose();
    }
    this.resize();
    if (this.onQualityChanged) this.onQualityChanged(this.preset);
  }

  /** Установить фокус глубины резкости по расстоянию до цели. */
  setFocus(distance) {
    if (!this.bokeh) return;
    const u = this.bokeh.materialBokeh.uniforms;
    u.focus.value = clamp(distance, 0.5, 200);
  }

  setBokehAperture(aperture) {
    if (!this.bokeh) return;
    this.bokeh.materialBokeh.uniforms.aperture.value = aperture;
  }

  setUnderwater(v) {
    if (this.grade) this.grade.uniforms.uUnderwater.value = clamp(v, 0, 1);
  }

  setExposure(v) {
    this.renderer.toneMappingExposure = v;
  }

  render(dt) {
    this.clock.getDelta();
    this.frame++;
    if (this.grade) this.grade.uniforms.uTime.value = this.clock.elapsedTime;
    this.renderer.info.reset();
    this.composer.render(dt);
    const s = this.stats;
    s.frames++;
    s.fpsAcc += dt;
    s.fpsTime += dt;
    if (s.fpsTime > 0.4) {
      s.fps = s.frames / s.fpsTime;
      s.ms = (s.fpsTime / s.frames) * 1000;
      s.frames = 0;
      s.fpsTime = 0;
    }
  }
}
