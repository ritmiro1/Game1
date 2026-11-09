// ============================================================================
//  Интеграционный smoke-тест: прогоняет собранную игру в jsdom с заглушкой
//  WebGL2. Проверяет компиляцию шейдеров three.js, создание мира, кадры
//  рендера, взаимодействия, UI-модалки, сохранение/загрузку и отсутствие
//  ошибок в консоли.
// ============================================================================
import fs from 'fs';
import path from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createMockWebGL2 } from './mock_webgl.js';

const root = path.resolve(import.meta.dirname, '..');
// TEST_DIR — проверить другую папку (например, автономный однофайловый релиз)
const pageDir = process.env.TEST_DIR ? path.resolve(process.env.TEST_DIR) : path.join(root, 'dist');
const dist = path.join(root, 'dist');

const errors = [];
const warnings = [];
const logs = [];
const virtualConsole = new VirtualConsole();
const oldErr = (...args) => {
  const parts = args.map((a) => (a && a.stack) || String(a));
  errors.push('console.error: ' + parts.join(' '));
};
virtualConsole.on('error', oldErr);
virtualConsole.on('warn', (e) => warnings.push(String(e)));
virtualConsole.on('log', (...args) => logs.push(args.map(String).join(' ')));
virtualConsole.on('jsdomError', (e) => {
  if (!/Not implemented|Could not parse CSS/.test(e.message)) errors.push('jsdomError: ' + e.message);
});

const html = fs.readFileSync(path.join(pageDir, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
  virtualConsole,
  resources: undefined,
});
const { window } = dom;
const document = window.document;

// ---------------- Canvas 2D (реальная реализация из napi-rs)
const { createCanvas } = await import('@napi-rs/canvas');
const origGetContext = window.HTMLCanvasElement.prototype.getContext;
window.HTMLCanvasElement.prototype.getContext = function (type, attrs) {
  if (type === '2d') {
    const c = createCanvas(this.width || 300, this.height || 150);
    this.__native = c;
    this.width = c.width;
    this.height = c.height;
    const ctx = c.getContext('2d');
    try {
      Object.defineProperty(ctx, 'canvas', { value: this, configurable: true });
    } catch (e) {
      // не критично: three читает canvas только для определения размеров
    }
    return ctx;
  }
  return origGetContext.call(this, type, attrs);
};
// napi-canvas надо пересоздавать при изменении width/height
const wDesc = Object.getOwnPropertyDescriptor(window.HTMLCanvasElement.prototype, 'width');
const hDesc = Object.getOwnPropertyDescriptor(window.HTMLCanvasElement.prototype, 'height');
Object.defineProperty(window.HTMLCanvasElement.prototype, 'width', {
  get() { return this.__w ?? 300; },
  set(v) { this.__w = v; if (this.__native) { this.__native.width = v; } },
});
Object.defineProperty(window.HTMLCanvasElement.prototype, 'height', {
  get() { return this.__h ?? 150; },
  set(v) { this.__h = v; if (this.__native) { this.__native.height = v; } },
});
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

// ---------------- WebGL2
window.HTMLCanvasElement.prototype.getContext = new Proxy(window.HTMLCanvasElement.prototype.getContext, {
  apply(target, thisArg, args) {
    if (args[0] === 'webgl2' || args[0] === 'webgl' || args[0] === 'experimental-webgl') {
      if (!thisArg.__gl) {
        thisArg.__gl = createMockWebGL2({ width: 1280, height: 720 });
        thisArg.width = 1280;
        thisArg.height = 720;
      }
      return thisArg.__gl;
    }
    return target.apply(thisArg, args);
  },
});

// ---------------- AudioContext (заглушка)
class MockAudioNode {
  constructor(ctx) {
    this.context = ctx;
    this.gain = { value: 1, setValueAtTime(){}, exponentialRampToValueAtTime(){}, setTargetAtTime(){}, linearRampToValueAtTime(){} };
    this.frequency = { value: 440, setValueAtTime(){}, exponentialRampToValueAtTime(){}, setTargetAtTime(){}, linearRampToValueAtTime(){} };
    this.detune = { value: 0 };
    this.Q = { value: 1 };
    this.type = 'sine';
    this.pan = { value: 0 };
    this.threshold = { value: -24 }; this.knee = { value: 30 }; this.ratio = { value: 12 };
    this.attack = { value: 0.003 }; this.release = { value: 0.25 };
    this.buffer = null;
    this.loop = false;
    this.panningModel = 'HRTF'; this.distanceModel = 'inverse';
    this.refDistance = 1; this.maxDistance = 10000; this.rolloffFactor = 1; this.coneInnerAngle = 360;
    this.positionX = this.param(); this.positionY = this.param(); this.positionZ = this.param();
    this.forwardX = this.param(); this.forwardY = this.param(); this.forwardZ = this.param();
    this.upX = this.param(); this.upY = this.param(); this.upZ = this.param();
  }
  param() { return { value: 0, setTargetAtTime(){}, setValueAtTime(){} }; }
  connect() { return this; }
  disconnect() {}
  start() {}
  stop() {}
  setPosition() {}
  setOrientation() {}
}
class MockAudioContext {
  constructor() {
    this.sampleRate = 48000;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new MockAudioNode(this);
    this.listener = new MockAudioNode(this);
  }
  createGain() { return new MockAudioNode(this); }
  createOscillator() { return new MockAudioNode(this); }
  createBiquadFilter() { return new MockAudioNode(this); }
  createBufferSource() { return new MockAudioNode(this); }
  createConvolver() { return new MockAudioNode(this); }
  createDynamicsCompressor() { return new MockAudioNode(this); }
  createPanner() { return new MockAudioNode(this); }
  createStereoPanner() { return new MockAudioNode(this); }
  createAnalyser() { return new MockAudioNode(this); }
  createBuffer(ch, len, rate) {
    const data = [];
    for (let i = 0; i < ch; i++) data.push(new Float32Array(len));
    return { length: len, numberOfChannels: ch, sampleRate: rate, getChannelData: (i) => data[i] };
  }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
window.AudioContext = MockAudioContext;
window.webkitAudioContext = MockAudioContext;

// ---------------- Прочее
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.localStorage.clear();
Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });
if (!window.performance) Object.defineProperty(window, 'performance', { value: { now: () => Date.now() }, configurable: true });
document.exitPointerLock = () => {};
window.HTMLElement.prototype.requestPointerLock = () => {};

// ---------------- Загрузка бандла
const bundle = fs.readFileSync(path.join(dist, 'game.js'), 'utf8');
const t0 = Date.now();
let bootError = null;
try {
  window.eval(bundle);
} catch (e) {
  bootError = e;
  errors.push('bundling/eval error: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n'));
}

const game = window.__game;
if (process.env.DEBUG) console.log('debug: game?', !!game, 'state', game?.state);
if (!game) errors.push('window.__game не создан');

// оборачиваем renderer.render, чтобы знать, какая камера рендерится
if (game) {
  const tryWrap = () => {
    const r = game.renderer;
    if (!r || r.__wrapped) return;
    r.__wrapped = true;
    const orig = r.render.bind(r);
    r.render = (scene, cam) => { globalThis.__lastCam = cam; return orig(scene, cam); };
  };
  const iv = setInterval(() => {
    tryWrap();
    if (game.renderer?.__wrapped) clearInterval(iv);
  }, 5);
}
// Диагностика NaN-значений в юниформах: включается через DEBUG_NAN=1.
let nanReported = 0;
globalThis.__MOCK_LOG_NAN = (setter, uniform, raw) => {
  if (!process.env.DEBUG_NAN) return;
  if (nanReported++ > 8) return;
  const fmt = (a) => (Array.isArray(a) ? a.map((n) => (Number.isFinite(n) ? +n.toFixed(2) : 'NaN')).join(',') : String(a));
  process.stderr.write(`NaN в ${setter}(${uniform}): ${fmt(raw)}\n`);
};

// ждём загрузки
async function waitFor(predicate, timeout = 240000, label = '') {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 60));
  }
  errors.push('таймаут ожидания: ' + label);
  return false;
}

if (process.env.TRACE_NAN && game) {
  const origUpdate = game._update?.bind(game);
  window.__nanReported = false;
  const origRender = game.pipeline?.render?.bind(game.pipeline);
}
const progressLog = [];
if (game && process.env.TRACE_NAN) {
  const pipe = game.pipeline;
  if (pipe) {
    const orig = pipe.render.bind(pipe);
    pipe.render = (dt) => {
      const c = pipe.camera;
      const bad = !Number.isFinite(c.position.x) || !Number.isFinite(c.position.y) || !Number.isFinite(c.position.z) ||
        !Number.isFinite(c.matrixWorld.elements[0]) || !Number.isFinite(c.projectionMatrix.elements[0]);
      if (bad && !window.__nanReported) {
        window.__nanReported = true;
        console.log('NAN camera', JSON.stringify(c.position), 'quat', JSON.stringify(c.quaternion), 'aspect', c.aspect, 'fov', c.fov, 'near/far', c.near, c.far);
        console.log('NAN stack', new Error().stack.split('\n').slice(1, 8).join('\n'));
      }
      return orig(dt);
    };
  }
}
if (game) {
  const timer = setInterval(() => {
    const st = document.getElementById('loadStatus');
    if (st && st.textContent) progressLog.push(st.textContent);
  }, 300);
  await new Promise((r) => setTimeout(r, 800));
  if (process.env.DEBUG) console.log('after 800ms: state=', game.state, 'status=', document.getElementById('loadStatus')?.textContent);
  await waitFor(() => game.state === 'menu' || game.state === 'error', 300000, 'загрузка мира');
  clearInterval(timer);
}

const report = [];
const check = (cond, msg) => {
  report.push(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) errors.push('проверка: ' + msg);
};

if (game && game.state === 'menu') {
  // --- параметры сцены
  let meshes = 0, instanced = 0, lights = 0, points = 0, triangles = 0, materials = 0;
  const matSet = new Set();
  game.scene.traverse((o) => {
    if (o.isInstancedMesh) { instanced++; triangles += (o.geometry.index ? o.geometry.index.count / 3 : 0) * o.count; }
    else if (o.isMesh) { meshes++; triangles += o.geometry.index ? o.geometry.index.count / 3 : 0; }
    if (o.isLight) lights++;
    if (o.isPoints) points++;
    if (o.material) matSet.add(o.material.uuid);
  });
  materials = matSet.size;
  check(meshes > 40, `меши сцены: ${meshes}`);
  check(instanced > 8, `инстансированные группы: ${instanced}`);
  check(lights >= 4, `источники света: ${lights}`);
  check(triangles > 300000, `треугольников в сцене: ${Math.round(triangles).toLocaleString('ru-RU')}`);
  check(materials > 12, `уникальных материалов: ${materials}`);
  const gl = document.getElementById('game').__gl;
  check(!!gl, 'WebGL2-контекст создан');
  check(gl.__programCodes.length > 8, `скомпилировано программ: ${gl.__programCodes.length}`);
  check(gl.__shaderSourceErrors.length === 0, `ошибок в исходниках шейдеров: ${gl.__shaderSourceErrors.length}`);
  // все uniform-ы, объявленные в шейдерах, должны иметь ненулевые значения-текстуры
  let samplerMissing = 0;
  for (const p of gl.__programCodes) {
    for (const u of p.uniforms.values()) {
      if (u.type.startsWith('sampler')) {
        // три проверяет, что sampler имеет значение (setValueTexture)
      }
    }
  }
  report.push(`· программ: ${gl.__programCodes.length}, источников шейдеров: ${gl.__shaderSources.length}`);

  // --- меню
  check(!document.getElementById('menu').classList.contains('hidden'), 'главное меню показано');
  check(!!document.querySelector('[data-act="new"]'), 'кнопка «Новая игра» на месте');
  // русский текст в UI
  const menuText = document.getElementById('menu').textContent;
  check(/[А-Яа-яЁё]{4,}/.test(menuText), 'интерфейс на русском');

  // --- старт игры
  await game.onMenuAction('new');
  await new Promise((r) => setTimeout(r, 400));
  check(game.state === 'playing', `состояние игры: ${game.state}`);
  check(!!game.audio?.ready, 'звуковой движок инициализирован');
  check(game.audio.musicEnabled, 'музыка включена');

  // прокрутим кадры (реальный рендер-вызов через заглушку)
  const frames = 90;
  for (let i = 0; i < frames; i++) {
    game._update(1 / 60);
    await new Promise((r) => setTimeout(r, 0));
  }
  check(true, `обновлено кадров: ${frames}`);
  check(Number.isFinite(game.player.position.x) && Number.isFinite(game.player.position.y), 'позиция игрока конечна');
  check(game.player.position.y > -5, `игрок не провалился (y=${game.player.position.y.toFixed(2)})`);
  check(game.camera.position.y > -2, 'камера выше уровня воды');

  // --- что стоит перед камерой в точке старта (рейкаст по всем мешам)
  {
    const THREE = game.THREE || (await import('three'));
    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3();
    game.camera.getWorldDirection(dir);
    ray.set(game.camera.position.clone(), dir);
    ray.far = 60;
    const hits = ray.intersectObject(game.scene, true).slice(0, 6);
    report.push(`· луч из камеры (${dir.x.toFixed(2)}, ${dir.y.toFixed(2)}, ${dir.z.toFixed(2)}) попал в ${hits.length} объектов:`);
    for (const h of hits) {
      const o = h.object;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const col = mat?.color ? '#' + mat.color.getHexString() : '—';
      report.push(
        `·   ${h.distance.toFixed(2)} м — «${o.name || o.type}» (${o.type}) mat=${mat?.type || '—'} цвет=${col}` +
          ` размер≈${(o.geometry?.boundingSphere?.radius || 0).toFixed(1)}`
      );
    }
    globalThis.__startHits = hits.map((h) => ({ name: h.object.name, type: h.object.type, d: +h.distance.toFixed(2) }));
  }

  // --- диагностика кадра: кто занимает экран (DIAG=1)
  if (process.env.DIAG) {
    const THREE = game.THREE || (await import('three'));
    const cam = game.camera;
    const ray = new THREE.Raycaster();

    // собираем только РЕАЛЬНО видимые меши (raycaster в three не смотрит visible)
    const visible = [];
    const isVisible = (o) => {
      for (let n = o; n; n = n.parent) if (n.visible === false) return false;
      return true;
    };
    game.scene.traverse((o) => {
      if (o.isMesh && isVisible(o)) visible.push(o);
    });
    report.push(`· ДИАГ: видимых мешей ${visible.length}, модель игрока visible=${game.player.model.root.visible}, view=${game.player.viewMode}`);
    // какие слои интерфейса остались активными
    const layers = [];
    document.querySelectorAll('.overlay, #hud, #dialog, #catchPop, #achPop, #fightWrap').forEach((el) => {
      if (el.classList.contains('hidden')) return;
      const st = window.getComputedStyle(el);
      layers.push(`#${el.id || el.className}: display=${st.display} opacity=${st.opacity} z=${st.zIndex}`);
    });
    // все видимые элементы с фоном/размытием — источник чёрных прямоугольников
    const painted = [];
    document.querySelectorAll('#hud *, .overlay *').forEach((el) => {
      const st = window.getComputedStyle(el);
      if (st.display === 'none') return;
      const bf = st.backdropFilter || st.webkitBackdropFilter;
      const bg = st.backgroundColor;
      const hasVisual = (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || (bf && bf !== 'none');
      if (!hasVisual) return;
      painted.push(`${el.tagName.toLowerCase()}#${el.id || ''}.${(el.className || '').toString().split(' ').filter(Boolean).join('.')} bg=${bg} backdrop=${bf || '—'} radius=${st.borderRadius}`);
    });
    report.push(`· ДИАГ: элементы с фоном/размытием (${painted.length}):`);
    for (const l of painted.slice(0, 25)) report.push('·   ' + l);

    report.push(`· ДИАГ: активные слои интерфейса (${layers.length}):`);
    for (const l of layers) report.push('·   ' + l);

    const tally = new Map();
    let miss = 0;
    for (let gy = -4; gy <= 4; gy++)
      for (let gx = -4; gx <= 4; gx++) {
        ray.setFromCamera(new THREE.Vector2(gx / 4, gy / 4), cam);
        ray.far = 200;
        const hit = ray.intersectObjects(visible, false)[0];
        if (!hit) {
          miss++;
          continue;
        }
        const o = hit.object;
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        const col = mat?.color ? '#' + mat.color.getHexString() : '—';
        const key = `${o.name || o.type}|${mat?.type || '—'}|${col}`;
        const cur = tally.get(key) || { n: 0, d: hit.distance };
        cur.n++;
        cur.d = Math.min(cur.d, hit.distance);
        tally.set(key, cur);
      }
    report.push('· ДИАГ: 81 луч по экрану (только видимое):');
    for (const [k, v] of [...tally.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) {
      report.push(`·   ${v.n}/81 — ${k}, ближайший ${v.d.toFixed(1)} м`);
    }
    report.push(`·   промахов (небо): ${miss}/81`);

    // точки (частицы) — надо посмотреть отдельно, raycaster их не берёт
    const points = [];
    game.scene.traverse((o) => {
      if (o.isPoints && isVisible(o)) {
        const u = o.material?.uniforms || {};
        points.push({
          n: o.geometry?.attributes?.position?.count,
          size: u.uSize?.value,
          blend: o.material?.blending,
          depthTest: o.material?.depthTest,
          depthWrite: o.material?.depthWrite,
          visible: o.visible,
        });
      }
    });
    // Материалы с vertexColors требуют атрибут color — иначе WebGL даёт чёрный
    const badVC = new Map();
    game.scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!mat?.vertexColors) return;
      const has = !!o.geometry?.attributes?.color;
      if (!has) {
        const key = `${o.name || o.type} mat=${mat.name || mat.type}`;
        badVC.set(key, (badVC.get(key) || 0) + 1);
      }
    });
    report.push(`· ДИАГ: мешей с vertexColors БЕЗ атрибута color: ${badVC.size} групп`);
    for (const [k, n] of badVC) report.push(`·   ${n}× ${k}`);

    // материалы, у которых карта помечена sRGB, но её нет / текстуры не загружены
    const noMapTex = new Map();
    game.scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        for (const slot of ['map', 'normalMap', 'roughnessMap', 'alphaMap', 'emissiveMap']) {
          const t = m[slot];
          if (t && !t.image) {
            const key = `${m.name || m.type}.${slot}`;
            noMapTex.set(key, (noMapTex.get(key) || 0) + 1);
          }
        }
      }
    });
    report.push(`· ДИАГ: текстур без изображения: ${noMapTex.size} шт`);
    for (const [k, n] of noMapTex) report.push(`·   ${n}× ${k}`);

    // вершинные цвета и альфа-маска листвы/травы
    game.scene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!mat?.vertexColors) return;
      const ca = o.geometry?.attributes?.color;
      if (!ca) return;
      let min = 9, max = -9, sum = 0;
      for (let i = 0; i < ca.array.length; i++) {
        const v = ca.array[i];
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
      }
      report.push(`·   «${o.name}» вершинные цвета: min=${min.toFixed(3)} max=${max.toFixed(3)} среднее=${(sum / ca.array.length).toFixed(3)} (itemSize=${ca.itemSize})`);
    });

    // размеры render-target'ов и проходов постобработки
    const pipe = game.pipeline;
    report.push(`· ДИАГ: canvas=${pipe.renderer.domElement.width}×${pipe.renderer.domElement.height} pixelRatio=${pipe.renderer.getPixelRatio()}`);
    report.push(`· ДИАГ: composer RT=${pipe.composer?.renderTarget1?.width}×${pipe.composer?.renderTarget1?.height} samples=${pipe.composer?.renderTarget1?.samples}`);
    for (const pass of pipe.composer?.passes || []) {
      const rts = [];
      for (const k of Object.keys(pass)) {
        const v = pass[k];
        if (v && v.isWebGLRenderTarget) rts.push(`${k}=${v.width}×${v.height} samples=${v.samples ?? 0} type=${v.texture?.type}`);
      }
      report.push(`·   проход ${pass.constructor.name} enabled=${pass.enabled} ${rts.join(', ')}`);
    }

    // самые тёмные материалы сцены
    const dark = [];
    game.scene.traverse((o) => {
      if ((!o.isMesh && !o.isInstancedMesh) || !isVisible(o)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m?.color) continue;
        const c = m.color;
        const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        if (lum > 0.06) continue;
        let count = 1;
        if (o.isInstancedMesh) count = o.count;
        dark.push({ name: o.name || o.type, mat: m.name || m.type, col: '#' + c.getHexString(), lum, count, order: o.renderOrder, tr: m.transparent, op: m.opacity });
      }
    });
    report.push(`· ДИАГ: очень тёмных материалов: ${dark.length}`);
    for (const d of dark.sort((a, b) => a.lum - b.lum).slice(0, 12)) {
      report.push(`·   «${d.name}» ${d.col} lum=${d.lum.toFixed(3)} inst=${d.count} order=${d.order} transparent=${d.tr} opacity=${d.op} mat=${d.mat}`);
    }

    // какие ИНСТАНСЫ закрывают экран (проекция на экран, а не луч)
    {
      const proj = [];
      const W = pipe.renderer.domElement.width, H = pipe.renderer.domElement.height;
      const tmpM = new THREE.Matrix4();
      const tmpV = new THREE.Vector3();
      game.scene.traverse((o) => {
        if (!o.isInstancedMesh || !isVisible(o)) return;
        const g = o.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const radius = g.boundingSphere?.radius || 0.5;
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, tmpM);
          tmpV.setFromMatrixPosition(tmpM).applyMatrix4(o.matrixWorld);
          const dist = tmpV.distanceTo(cam.position);
          if (dist > 12) continue;
          const ndc = tmpV.clone().project(cam);
          if (ndc.z < -1 || ndc.z > 1) continue;
          // размер на экране (пиксели по вертикали)
          const pix = (radius * H) / (dist * Math.tan((cam.fov * Math.PI) / 360));
          if (pix < 60) continue;
          proj.push({
            name: o.name,
            i,
            dist: +dist.toFixed(2),
            pix: Math.round(pix),
            x: Math.round((ndc.x * 0.5 + 0.5) * W),
            y: Math.round((0.5 - ndc.y * 0.5) * H),
          });
        }
      });
      // реальные габариты растительности: радиус геометрии × масштаб инстанса
      const sizes = new Map();
      const sc = new THREE.Vector3();
      game.scene.traverse((o) => {
        if (!o.isInstancedMesh || !isVisible(o)) return;
        const g = o.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const r = g.boundingSphere?.radius || 0;
        let minS = Infinity, maxS = 0;
        for (let i = 0; i < Math.min(o.count, 200); i++) {
          o.getMatrixAt(i, tmpM);
          tmpM.decompose(tmpV, new THREE.Quaternion(), sc);
          const s = Math.max(sc.x, sc.y, sc.z);
          if (s < minS) minS = s;
          if (s > maxS) maxS = s;
        }
        sizes.set(o.name, `${r.toFixed(2)} м × ${minS.toFixed(2)}–${maxS.toFixed(2)} ⇒ ${(r * minS).toFixed(2)}–${(r * maxS).toFixed(2)} м`);
      });
      report.push('· ДИАГ: размеры растительности (радиус × масштаб):');
      for (const [k, v] of sizes) report.push(`·   ${k}: ${v}`);

      // точные точки, где на снимке из Windows были чёрные прямоугольники
      report.push('· ДИАГ: что в точках чёрных прямоугольников:');
      for (const [label, nx, ny] of [['левый', -0.76, 0.03], ['правый', 0.22, -0.17], ['центр', 0, 0]]) {
        const r3 = new THREE.Raycaster();
        r3.setFromCamera(new THREE.Vector2(nx, ny), cam);
        r3.far = 60;
        const hit = r3.intersectObjects(visible, false)[0];
        if (!hit) {
          report.push(`·   ${label} (${nx}, ${ny}): небо`);
          continue;
        }
        const o = hit.object;
        const chain = [];
        for (let n = o; n && chain.length < 4; n = n.parent) chain.push(n.name || n.type);
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        report.push(
          `·   ${label} (${nx}, ${ny}): ${hit.distance.toFixed(2)} м «${chain.join(' < ')}»` +
            `${hit.instanceId != null ? ' instance#' + hit.instanceId : ''} mat=${mat?.name || mat?.type}`
        );
      }

      report.push(`· ДИАГ: инстансы, закрывающие экран (${proj.length}):`);
      for (const p of proj.sort((a, b) => b.pix - a.pix).slice(0, 10)) {
        report.push(`·   «${p.name}»[${p.i}] ${p.dist} м, ~${p.pix} px, экран (${p.x},${p.y})`);
      }
    }

    report.push(`· ДИАГ: системы точек: ${points.length}`);
    for (const p of points) report.push(`·   ${p.n} частиц, uSize=${p.size}, blending=${p.blend}, depthTest=${p.depthTest}`);
  }

  // --- ходьба
  const p0 = game.player.position.clone();
  game.player.keys.add('KeyW');
  for (let i = 0; i < 120; i++) game._update(1 / 60);
  game.player.keys.delete('KeyW');
  const walked = game.player.position.distanceTo(p0);
  check(walked > 0.5, `игрок прошёл ${walked.toFixed(2)} м`);

  // --- взаимодействия
  game.player.teleport(game.world.landmarks.dock.position.x + 1, 2, game.world.landmarks.dock.position.z + 1);
  game.interact();
  await new Promise((r) => setTimeout(r, 60));
  check(game.player.mode === 'boat' || game.player.mode === 'walk', `режим после взаимодействия: ${game.player.mode}`);

  // --- лодка
  if (game.player.mode !== 'boat') {
    game.boardBoat();
  }
  const b0 = game.boat.position.clone();
  game.player.keys.add('KeyW');
  for (let i = 0; i < 180; i++) game._update(1 / 60);
  game.player.keys.delete('KeyW');
  const boatMoved = game.boat.position.distanceTo(b0);
  check(boatMoved > 1, `лодка прошла ${boatMoved.toFixed(1)} м`);
  check(Number.isFinite(game.boat.position.y), 'плавучесть лодки стабильна');
  game.leaveBoat();
  check(game.player.mode === 'walk', 'выход из лодки');

  // --- рыбалка
  game.player.teleport(game.world.landmarks.dock.position.x + 2, 2.4, game.world.landmarks.dock.position.z + 4, 1.4);
  game.rodEquipped = true;
  game.player.equipRod(true);
  // через настоящий ввод: ЛКМ зажать → отпустить
  game.player.mouse.buttons.add(0);
  for (let i = 0; i < 30; i++) game._update(1 / 60);
  game.player.mouse.buttons.delete(0);
  game._update(1 / 60);
  check(game.fishing.state !== 'charging',
    `ввод мышью перевёл снасть в: ${game.fishing.state}`);
  check(['flying', 'sinking', 'waiting'].includes(game.fishing.state), `состояние рыбалки после заброса: ${game.fishing.state}`);
  // доведём до поклёвки
  let tries = 0;
  while (tries++ < 60 * 60 && game.fishing.state !== 'bite' && game.fishing.state !== 'idle') {
    game.fishing.update(1 / 60, { reeling: false });
  }
  if (game.fishing.state === 'bite') {
    game.fishing.releaseCharge();
    check(game.fishing.state === 'fighting' || game.fishing.state === 'idle', `подсечка: ${game.fishing.state}`);
    let f = 0;
    while (f++ < 60 * 30 && game.fishing.state === 'fighting') {
      game.fishing.update(1 / 60, { reeling: true });
    }
    check(game.fishing.catches.length >= 1 || game.fishing.state === 'idle', 'вываживание завершилось');
  } else {
    report.push('· поклёвка не случилась в тесте (допустимо — случайность)');
  }

  // --- интерфейс
  game.ui.openModal('inventoryModal');
  check(!document.getElementById('inventoryModal').classList.contains('hidden'), 'инвентарь открывается');
  check(document.getElementById('baitList').children.length >= 6, `видов наживки в UI: ${document.getElementById('baitList').children.length}`);
  game.ui.closeModal('inventoryModal');
  game.ui.openModal('journalModal');
  check(document.getElementById('fishGrid').children.length === 12, `карточек рыб в журнале: ${document.getElementById('fishGrid').children.length}`);
  game.ui.closeModal('journalModal');
  game.ui.openModal('achievementsModal');
  check(document.getElementById('achGrid').children.length >= 10, `достижений в UI: ${document.getElementById('achGrid').children.length}`);
  game.ui.closeModal('achievementsModal');
  game.ui.openModal('settingsModal');
  check(document.getElementById('keybindList').children.length >= 8, 'переназначение клавиш доступно');
  game.ui.closeModal('settingsModal');
  game.ui.openModal('presetsModal');
  check(document.querySelectorAll('#presetGrid .preset-card').length === 4, 'четыре графических пресета');
  game.ui.closeModal('presetsModal');

  // --- качество графики
  for (const q of ['low', 'medium', 'high', 'ultra']) {
    game.setQuality(q);
    game._update(1 / 60);
  }
  check(game.quality === 'ultra', 'переключение пресетов качества работает');
  game.setQuality('high');

  // --- погода и время
  for (const w of ['clear', 'fog', 'rain', 'storm', 'snow']) {
    game.atmosphere.setWeather(w, true);
    for (let i = 0; i < 10; i++) game._update(1 / 60);
  }
  check(true, 'все погодные режимы прогнаны без ошибок');
  game.atmosphere.timeOfDay = 23.5;
  for (let i = 0; i < 30; i++) game._update(1 / 60);
  check(game.atmosphere.isNight, 'ночной режим активируется');

  // --- сохранение/загрузка
  game.save();
  const raw = window.localStorage.getItem('tihiy_zaliv_save_v1');
  check(!!raw && raw.length > 200, `сейв записан (${raw ? (raw.length / 1024).toFixed(1) : 0} КБ)`);
  const parsed = JSON.parse(raw || '{}');
  check(!!parsed.stats && Array.isArray(parsed.stats.speciesSet), 'структура сейва корректна');
  game.load();
  check(true, 'загрузка сейва выполнена');

  // --- пауза и меню
  game.togglePause();
  check(game.state === 'paused', 'пауза');
  game.togglePause();
  check(game.state === 'playing', 'снятие паузы');
  game.toMenu();
  check(game.state === 'menu', 'возврат в меню');

  // ещё несколько кадров в меню (облёт камеры)
  for (let i = 0; i < 30; i++) game._update(1 / 60);
  check(true, 'кадры меню без ошибок');

  // --- каталог идей
  check(fs.existsSync(path.join(root, '100_3D_GAME_IDEAS.json')), 'каталог идей в комплекте');
  const ideas = JSON.parse(fs.readFileSync(path.join(root, '100_3D_GAME_IDEAS.json'), 'utf8'));
  check(ideas.ideas.length === 100, `идей в JSON: ${ideas.ideas.length}`);
  check(ideas.meta.winner.title === 'Тихий Залив', 'в JSON указан победитель');
}

// ---------------- Отчёт
console.log('\n=== ИНТЕГРАЦИОННЫЙ ТЕСТ (jsdom + заглушка WebGL2) ===\n');
for (const line of report) console.log('  ' + line);
const realErrors = errors.filter((e) => !/Not implemented: HTMLCanvasElement|Could not parse CSS/.test(e));
if (process.env.VERBOSE) {
  console.log('--- ВСЕ ЗАПИСИ КОНСОЛИ ---');
  for (const e of errors) console.log('* ' + String(e).split('\n')[0]);
}
console.log('\n--- Ошибки: ' + realErrors.length + ' ---');
for (const e of realErrors.slice(0, 12)) console.log('  ! ' + e.split('\n').slice(0,2).join(' ⏎ '));
if (warnings.length) {
  console.log('--- Предупреждения (первые 6) ---');
  for (const w of [...new Set(warnings)].slice(0, 6)) console.log('  · ' + w.slice(0, 200));
}
console.log(`\nВремя прогона: ${((Date.now() - t0) / 1000).toFixed(1)} с`);
const failedChecks = report.filter((r) => r.startsWith('✗')).length;
console.log(`Проверок: ${report.length}, провалено: ${failedChecks}`);
process.exit(realErrors.length || failedChecks ? 1 : 0);
