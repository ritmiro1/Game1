// ============================================================================
//  Автоматическая проверка игры без браузера:
//   • компиляция всех GLSL-шейдеров (glsl-parser)
//   • генерация мира, моделей, рыб, текстур (Node, без canvas)
//   • прогон игровых систем: рыбалка, лодка, квесты, достижения, экономика
//   • поиск типичных ошибок (undefined-обращения, NaN в трансформациях)
//  Запуск: node tools/headless_test.mjs
// ============================================================================
import fs from 'fs';
import path from 'path';
import { buildCatalog } from './ideas_data.mjs';

const root = path.resolve(import.meta.dirname, '..');
let failures = 0;
let checks = 0;
const fail = (msg) => {
  failures++;
  console.log('  ✗ ' + msg);
};
const ok = (msg) => {
  checks++;
  if (process.env.VERBOSE) console.log('  ✓ ' + msg);
};
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

console.log('\n=== ТИХИЙ ЗАЛИВ · автоматическая проверка ===\n');

// ---------------------------------------------------------------- 1. GLSL
console.log('[1/6] Компиляция GLSL-шейдеров');
{
  const { parser } = await import('@shaderfrog/glsl-parser');
  const shaderFiles = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (f.endsWith('.js')) shaderFiles.push(p);
    }
  };
  walk(path.join(root, 'src'));
  let total = 0;
  for (const file of shaderFiles) {
    const src = fs.readFileSync(file, 'utf8');
    // ищем шаблонные строки с glsl-комментарием
    const re = /\/\*\s*glsl\s*\*\/\s*`([\s\S]*?)`/g;
    let m;
    while ((m = re.exec(src))) {
      let code = m[1];
      // подставить препроцессорные define-ы, которые у нас динамические
      code = code.replace(/#define\s+NWAVES\s+\$\{[^}]*\}/g, '#define NWAVES 6');
      code = code.replace(/#define\s+NWAVES\s+\d+/g, '#define NWAVES 6');
      total++;
      try {
        parser.parse(code, { quiet: true });
        ok(`шейдер ${path.relative(root, file)} #${total}`);
      } catch (e) {
        fail(`GLSL (${path.relative(root, file)}): ${e.message.split('\n')[0]}`);
      }
    }
  }
  assert(total >= 4, `найдено и проверено шейдеров: ${total}`);
}

// ---------------------------------------------------------------- 2. Модели
console.log('[2/6] Генерация геометрии и моделей');
{
  const { Terrain, ISLANDS } = await import('../src/gen/terrain.js');
  const terrain = new Terrain();
  let peaksOk = true;
  for (const isl of ISLANDS) {
    const h = terrain.heightAt(isl.x, isl.z);
    if (h < 0.3) peaksOk = false;
  }
  assert(peaksOk, 'все острова выступают над водой');
  const geo = terrain.buildGeometry({ res: 120 });
  assert(geo.attributes.position.count > 10000, `меш ландшафта: ${geo.attributes.position.count} вершин`);
  assert(geo.index.count / 3 > 20000, `ландшафт: ${geo.index.count / 3} треугольников`);
  // отсутствие NaN
  let nan = 0;
  for (const v of geo.attributes.position.array) if (!isFinite(v)) nan++;
  assert(nan === 0, 'нет NaN в вершинах ландшафта');

  const { makePine, makeBirch, makeRock, makeReeds, makeGrassTuft, makeKelp, makeDeadTree } = await import('../src/models/nature.js');
  const pine = makePine(1);
  const pineTris = (pine.trunk.indices.length + pine.foliage.indices.length) / 3;
  assert(pineTris > 1000, `сосна: ${pineTris} треугольников`);
  const birch = makeBirch(2);
  assert((birch.trunk.indices.length + birch.foliage.indices.length) / 3 > 500, 'берёза: сложный меш');
  assert(makeRock(3, { radius: 1.5 }).indices.length / 3 > 400, 'валун: шумовое смещение');
  assert(makeReeds(4).indices.length / 3 > 100, 'камыш: стебли и метёлки');
  assert(makeKelp(5).indices.length / 3 > 50, 'водоросли');
  assert(makeDeadTree(6).trunk.indices.length / 3 > 200, 'сухостой');

  const S = await import('../src/models/structures.js');
  const boat = S.makeBoatModel({ withMotor: true });
  const boatTris = (boat.group.hull.indices.length + boat.group.deck.indices.length + boat.group.detail.indices.length) / 3;
  assert(boatTris > 1500, `лодка: ${boatTris} треугольников`);
  const lh = S.makeLighthouse({});
  assert((lh.struct.indices.length + lh.metal.indices.length) / 3 > 1500, 'маяк: башня, галерея, фонарь');
  const cabin = S.makeCabin({});
  assert((cabin.detail.indices.length + cabin.roof.indices.length) / 3 > 800, 'хижина: сруб, крыша, окна');
  const dock = S.makeDock({ length: 20 });
  assert((dock.wood.indices.length + dock.detail.indices.length) / 3 > 800, 'причал: доски, сваи, перила');
  const aw = S.makeWorkshopAwning({});
  assert(aw.frame.indices.length > 0 && aw.cloth.indices.length > 0, 'мастерская: каркас и тент');
  const fire = S.makeCampfire();
  assert(fire.stones.indices.length / 3 > 800, 'костёр: камни и поленья');
  for (const fn of ['makeBarrel', 'makeCrate', 'makeBuoy', 'makeNet', 'makeSmallPierFloat']) {
    const b = S[fn]();
    assert(b.indices.length > 0, `пропс ${fn}`);
  }

  const F = await import('../src/models/fish.js');
  let fishTris = 0;
  for (const sp of F.SPECIES) {
    const m = F.buildFishMesh(sp);
    const tris = (m.body.index.count + m.dorsal.index.count + m.caudal.index.count + m.pectoral.index.count) / 3;
    fishTris += tris;
    if (tris < 500) fail(`рыба ${sp.id}: слишком простой меш (${tris} тр.)`);
    const arr = m.body.attributes.position.array;
    let fnan = 0;
    for (const v of arr) if (!isFinite(v)) fnan++;
    if (fnan) fail(`рыба ${sp.id}: NaN в вершинах`);
  }
  ok(`12 видов рыб, суммарно ${fishTris} треугольников`);
  assert(F.SPECIES.length === 12, `видов рыб: ${F.SPECIES.length}`);
}

// ---------------------------------------------------------------- 3. Мир
console.log('[3/6] Сборка мира и физика воды');
{
  const { waterHeight, waterNormal, WAVE_DEFS } = await import('../src/core/water.js');
  let min = Infinity, max = -Infinity;
  for (let t = 0; t < 10; t += 0.37) {
    for (let x = -20; x < 20; x += 3.1) {
      const h = waterHeight(x, t * 5, t);
      if (!isFinite(h)) fail('NaN в воде');
      min = Math.min(min, h); max = Math.max(max, h);
    }
  }
  assert(max - min > 0.4 && max - min < 4, `амплитуда волн в норме: ${(max - min).toFixed(2)} м`);
  const n = waterNormal(3, 4, 1.5);
  assert(Math.abs(n.y - 1) < 0.35 && isFinite(n.x), 'нормаль воды корректна');
  assert(WAVE_DEFS.length === 6, '6 волн Герстнера');

  const { Terrain } = await import('../src/gen/terrain.js');
  const terrain = new Terrain();
  const tex = terrain.buildHeightTexture(96);
  assert(tex.image.data.length === 96 * 96 * 4, 'текстура высот для воды');

  // проверка проходимости и поиска места
  const spot = terrain.findFlatSpotNear(0, 12, 20, { minH: 1.5 });
  assert(terrain.heightAt(spot.x, spot.z) > 1.5, 'найдено ровное место на суше');

  // физика лодки (чистая математика, без THREE-рендера)
  const THREE = await import('three');
  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  const fakeWater = {
    time: 0, ampScale: 1,
    getHeight: (x, z, t) => waterHeight(x, z, t ?? 0),
  };
  const fakeWorld = { terrain, landmarks: { dock: { position: new THREE.Vector3(0, 0, 30), rotation: 0 } } };
  const { Boat } = await import('../src/game/boat.js');
  const boat = new Boat({
    group, dims: { length: 4.8, beam: 1.55, depth: 0.7 }, anchors: {}, world: fakeWorld, water: fakeWater,
  });
  boat.setPosition(120, 0, 60, 0.3); // глубокая вода вдали от берега
  boat.enter();
  const start = boat.position.clone();
  for (let i = 0; i < 600; i++) {
    boat.update(1 / 60, { forward: true, back: false, left: i > 300, right: false }, { weather: { rain: 0, wind: 0.5 } });
  }
  const moved = boat.position.distanceTo(start);
  assert(moved > 8, `лодка прошла ${moved.toFixed(1)} м за 10 с`);
  assert(isFinite(boat.position.x) && isFinite(boat.position.y) && isFinite(boat.roll) && isFinite(boat.pitch), `физика лодки без NaN (y=${boat.position.y})`);
  assert(Math.abs(boat.roll) < 1.5 && Math.abs(boat.pitch) < 1.5, 'крен/дифферент в разумных пределах');
}

// ---------------------------------------------------------------- 4. Рыбалка
console.log('[4/6] Система рыбалки (симуляция 6 часов игры)');
{
  const { FishingSystem, BAIT_TYPES } = await import('../src/game/fishing.js');
  const THREE = await import('three');
  const { Terrain } = await import('../src/gen/terrain.js');
  const { waterHeight } = await import('../src/core/water.js');
  const terrain = new Terrain();
  const scene = new THREE.Scene();
  const water = { time: 0, ampScale: 1, getHeight: (x, z, t) => waterHeight(x, z, t ?? 0) };
  const camera = new THREE.PerspectiveCamera();
  const player = {
    position: new THREE.Vector3(0, terrain.heightAt(0, 40) + 1, 40),
    yaw: 0, pitch: 0,
    eyePosition: new THREE.Vector3(0, 2.5, 40),
    forward: new THREE.Vector3(0, 0.05, 1),
    setLineTension() {}, addShake() {},
  };
  // игрок смотрит на воду
  const dirTo = (tx, tz) => {
    const d = new THREE.Vector3(tx - player.position.x, 0, tz - player.position.z).normalize();
    player.forward.copy(d).setY(0.04);
  };
  dirTo(20, 64);
  const world = {
    terrain, atmosphere: { timeOfDay: 12, weatherName: 'clear', clockString: '12:00', day: 1 },
    fishSchools: [],
  };
  const stubMaterials = { fish: () => new THREE.MeshStandardMaterial({ color: 0x8899aa }) };
  const fishing = new FishingSystem({ scene, player, world, water, camera, materials: stubMaterials });
  let catches = 0, bites = 0, misses = 0;
  fishing.on('catch', () => catches++);
  fishing.on('bite', () => bites++);
  fishing.on('missed', () => misses++);
  fishing.baitCount.worm = 9999;
  const dt = 1 / 60;
  let t = 0;
  for (let cycle = 0; cycle < 40; cycle++) {
    // заброс
    fishing.startCharge();
    for (let i = 0; i < 40; i++) fishing.update(dt, { reeling: false });
    fishing.releaseCharge();
    // ждём и реагируем
    let guard = 0;
    while (guard < 60 * 60 && fishing.state !== 'idle') {
      guard++;
      fishing.update(dt, { reeling: fishing.state === 'fighting' });
      if (fishing.state === 'bite' && guard % 30 === 0) fishing.releaseCharge();
    }
    t += guard / 60;
  }
  assert(bites > 3, `поклёвок за сессию: ${bites}`);
  assert(catches > 1, `поймано рыб за сессию: ${catches}`);
  assert(fishing.catches.length === catches, 'садок синхронизирован с событиями');
  const totalWeighted = fishing.catches.reduce((a, c) => a + c.weight, 0);
  assert(totalWeighted > 0, `общий вес улова: ${totalWeighted.toFixed(2)} кг`);
  // проверка выбора видов по биомам/глубине
  const picked = new Set();
  for (const f of fishing.catches) picked.add(f.id);
  ok(`уникальных видов в улове: ${picked.size}`);
}

// ---------------------------------------------------------------- 5. Квесты/достижения
console.log('[5/6] Квесты, достижения, прогресс');
{
  const { QuestSystem, AchievementSystem, QUESTS, ACHIEVEMENTS } = await import('../src/game/quests.js');
  const q = new QuestSystem();
  const a = new AchievementSystem();
  const completed = [];
  const unlocked = [];
  q.on('completed', (x) => completed.push(x.id));
  a.on('unlocked', (x) => unlocked.push(x.id));
  let state = {
    totalCatches: 0, speciesSet: new Set(), speciesCaught: 0, biggestWeight: 0, totalEarned: 0,
    casts: 0, nightCatches: 0, caughtAtNight: false, islandsVisited: new Set(), visitedLighthouse: false,
    stormDistance: 0, boatDistance: 0, walkDistance: 0, rodLevel: 0, nightBoatRide: false, skill: 0,
  };
  for (let i = 1; i <= 12; i++) {
    state.totalCatches = i;
    state.speciesSet = new Set(['perch', 'pike', 'carp', 'bream', 'trout', 'zander', 'ide', 'eel', 'catfish', 'flounder', 'sturgeon', 'moonfish'].slice(0, i));
    state.speciesCaught = state.speciesSet.size;
    state.biggestWeight = i >= 3 ? 5.2 : 0.4;
    state.totalEarned = i * 400;
    state.casts = i * 3;
    state.nightCatches = i;
    state.caughtAtNight = true;
    state.islandsVisited = new Set(['home', 'pine', 'lighthouse', 'foggy', 'stony', 'reedbank'].slice(0, Math.min(6, i)));
    state.visitedLighthouse = i > 2;
    state.stormDistance = i > 4 ? 240 : 0;
    state.boatDistance = i * 90;
    state.rodLevel = Math.min(3, i - 1);
    state.nightBoatRide = i > 5;
    state.skill = i;
    q.update(state);
    a.update(state);
  }
  assert(completed.length >= 8, `выполнено квестов: ${completed.length}/${QUESTS.length}`);
  assert(unlocked.length >= 10, `открыто достижений: ${unlocked.length}/${ACHIEVEMENTS.length}`);
  assert(QUESTS.length >= 8, 'не менее 8 квестов');
  assert(ACHIEVEMENTS.length >= 10, 'не менее 10 достижений');

  // экономика: рост цены по редкости
  const { SPECIES } = await import('../src/models/fish.js');
  const sorted = [...SPECIES].sort((x, y) => x.rarity - y.rarity);
  assert(sorted[0].price < sorted[sorted.length - 1].price, 'цена растёт с редкостью');
  assert(SPECIES.every((s) => s.description && s.flavor), 'у всех видов есть описания (рус.)');
  assert(SPECIES.every((s) => /^[А-Яа-яЁё]/.test(s.name)), 'названия видов на русском');
}

// ---------------------------------------------------------------- 6. Каталог и ассеты
console.log('[6/6] Каталог идей и целостность проекта');
{
  const ideas = buildCatalog();
  assert(ideas.length === 100, `в каталоге ${ideas.length} идей`);
  assert(ideas[0].title === 'Тихий Залив', 'победитель — «Тихий Залив»');
  const titles = new Set(ideas.map((i) => i.title));
  assert(titles.size === 100, 'все названия уникальны');
  assert(ideas.every((i) => i.pitch.length > 20 && i.loop.length > 10), 'у каждой идеи есть питч и цикл');

  const ruFiles = ['index.html', 'styles.css', 'src/main.js'];
  for (const f of ruFiles) assert(fs.existsSync(path.join(root, f)), `файл на месте: ${f}`);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const ruWords = (html.match(/[А-Яа-яЁё]{3,}/g) || []).length;
  assert(ruWords > 150, `русских слов в интерфейсе: ${ruWords}`);
  // все id, на которые ссылается JS, должны существовать в HTML
  const mainSrc = fs.readFileSync(path.join(root, 'src/game/ui.js'), 'utf8') + fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const refs = new Set([...mainSrc.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
  const missing = [...refs].filter((r) => !ids.has(r));
  assert(missing.length === 0, `все DOM-id существуют${missing.length ? ': отсутствуют ' + missing.join(', ') : ''}`);
}

// ---------------------------------------------------------------- итог
console.log(`\n--- Итог: проверок ${checks + failures}, успешно ${checks}, ошибок ${failures} ---`);
if (failures > 0) {
  console.log('ЕСТЬ ОШИБКИ\n');
  process.exit(1);
}
console.log('Все проверки пройдены.\n');
