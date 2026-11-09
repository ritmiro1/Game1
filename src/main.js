// ============================================================================
//  ТИХИЙ ЗАЛИВ — главный модуль игры.
//  Связывает рендер, атмосферу, воду, мир, игрока, рыбалку, звук и UI.
// ============================================================================
import * as THREE from 'three';
import { RenderPipeline, QUALITY_PRESETS } from './core/renderer.js';
import { Atmosphere, WEATHER_TYPES } from './core/atmosphere.js';
import { Water, waterHeight } from './core/water.js';
import { MaterialLibrary } from './core/materials.js';
import { AudioEngine } from './core/audio.js';
import { World } from './game/world.js';
import { Player } from './game/player.js';
import { Boat } from './game/boat.js';
import { FishingSystem, BAIT_TYPES, ROD_LEVELS } from './game/fishing.js';
import { FXSystem } from './game/particles.js';
import { QuestSystem, AchievementSystem, QUESTS, ACHIEVEMENTS } from './game/quests.js';
import { UI, LOAD_TIPS } from './game/ui.js';
import { SPECIES, SPECIES_BY_ID } from './models/fish.js';
import { clamp, lerp, makeRNG } from './core/math.js';

const SAVE_KEY = 'tihiy_zaliv_save_v1';
const SETTINGS_KEY = 'tihiy_zaliv_settings_v1';

export class Game {
  constructor() {
    this.state = 'loading'; // loading | menu | playing | paused
    this.canvas = document.getElementById('game');
    this.quality = 'high';
    this.gfxScale = 1;
    this.sensitivity = 1;
    this.invertY = false;
    this.headBobScale = 1;
    this.settings = { reflections: true };
    this.keybinds = {
      forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
      jump: 'Space', run: 'ShiftLeft', crouch: 'KeyC', interact: 'KeyE',
      rod: 'KeyF', inventory: 'Tab', journal: 'KeyJ', view: 'KeyV',
    };
    this.money = 0;
    this.economy = { money: 120 };
    this.notes = [];
    this.stats = this._freshStats();
    this.hasSave = false;
    this.rodEquipped = false;
    this.interactTarget = null;
    this.nearestFishInfo = '—';
    this._acc = { questCheck: 0, autosave: 0, hud: 0, fishNear: 0 };
    this._lastPos = new THREE.Vector3();
    this._loadAccum = 0;
    this._frameTimes = [];
  }

  _freshStats() {
    return {
      totalCatches: 0,
      speciesSet: new Set(),
      speciesBest: {},
      biggestWeight: 0,
      totalEarned: 0,
      casts: 0,
      walkDistance: 0,
      boatDistance: 0,
      islandsVisited: new Set(),
      visitedLighthouse: false,
      caughtAtNight: false,
      nightCatches: 0,
      stormDistance: 0,
      nightBoatRide: false,
      rodLevel: 0,
      skill: 0,
      daysSurvived: 1,
      questsCompleted: 0,
    };
  }

  // ==========================================================================
  //  ЗАГРУЗКА
  // ==========================================================================
  async boot() {
    this.ui = new UI(this);
    this.ui.showLoading(true);
    this.ui.setLoadProgress(3, 'Чтение настроек…', LOAD_TIPS[0]);
    this.loadSettings();
    // даём кадру отрисоваться
    await this._frame();

    this.ui.setLoadProgress(9, 'Инициализация WebGL2 и пост-обработки…', LOAD_TIPS[1]);
    await this._frame();
    try {
      this.pipeline = new RenderPipeline(this.canvas, { quality: this.quality });
    } catch (err) {
      this._failBoot('Не удалось инициализировать WebGL2: ' + (err?.message || err));
      return;
    }
    this.scene = this.pipeline.scene;
    this.camera = this.pipeline.camera;
    this.renderer = this.pipeline.renderer;
    this.pipeline.applyScale = (s) => {
      this.gfxScale = s;
    };

    this.ui.setLoadProgress(16, 'Синтез PBR-текстур (дерево, камень, песок, металл)…', LOAD_TIPS[2]);
    await this._frame();
    this.materials = new MaterialLibrary(this.pipeline.renderer, this.quality);

    this.ui.setLoadProgress(30, 'Построение архипелага и высотных карт…', LOAD_TIPS[3]);
    await this._frame();
    // Атмосфера создаётся до мира, чтобы мир мог читать погоду
    this.atmosphere = new Atmosphere(this.scene, this.renderer);
    this.atmosphere.events.onLightning = () => {
      this.audio?.sfx('thunder', { volume: 0.9 });
      if (this.state === 'playing') this.player?.addShake(0.25);
    };
    this.atmosphere.events.onWeatherChange = (name) => {
      if (this.state === 'playing') this.ui.toast('Погода: ' + (WEATHER_TYPES[name]?.label || name));
    };

    this.world = new World(this.scene, this.materials, this.pipeline);
    this.world.atmosphere = this.atmosphere;

    this.ui.setLoadProgress(48, 'Заливка воды: волны Герстнера, каустика, пена…', LOAD_TIPS[4]);
    await this._frame();
    this.water = new Water({
      scene: this.scene,
      size: 1500,
      segments: Math.round(this.pipeline.preset.waterTess * 0.85),
      level: 0,
      heightMap: this.world.heightTexture,
      heightBounds: this.world.heightTexture.userData.bounds,
      quality: this.quality,
      renderer: this.renderer,
    });
    const hr = this.world.heightTexture.userData;
    this.water.setHeightRange(hr.minH, hr.maxH);

    this.ui.setLoadProgress(60, 'Частицы, светлячки, дым, брызги…', LOAD_TIPS[5]);
    await this._frame();
    this.fx = new FXSystem(this.scene, this.world.terrain, this.water);

    this.ui.setLoadProgress(70, 'Игрок, удочка, физика лески…', LOAD_TIPS[6]);
    await this._frame();
    this.player = new Player({
      scene: this.scene,
      camera: this.camera,
      world: this.world,
      audio: null,
      fx: this.fx,
      materials: this.materials,
      pipeline: this.pipeline,
    });
    this.player.acceptPointerLock = false;

    this.boat = new Boat({
      group: this.world.boatGroup,
      dims: this.world.boatDims,
      anchors: this.world.boatAnchors,
      world: this.world,
      water: this.water,
      audio: null,
      fx: this.fx,
    });

    this.fishing = new FishingSystem({
      scene: this.scene,
      player: this.player,
      world: this.world,
      water: this.water,
      audio: null,
      fx: this.fx,
      materials: this.materials,
      camera: this.camera,
    });

    this.quests = new QuestSystem();
    this.achievements = new AchievementSystem();
    this._wireEvents();

    this.ui.setLoadProgress(82, 'Звуковой движок: музыка, эмбиент, 3D-эффекты…', LOAD_TIPS[7]);
    await this._frame();
    this.audio = new AudioEngine();
    this.player.audio = this.audio;
    this.boat.audio = this.audio;
    this.fishing.audio = this.audio;
    this._applyAudioSettings();

    this.ui.setLoadProgress(92, 'Достижения, квесты, сейвы…', LOAD_TIPS[8]);
    await this._frame();
    this.hasSave = !!localStorage.getItem(SAVE_KEY);
    this.ui.updateMenuStats(this);
    this._seedNotes();

    this.ui.setLoadProgress(100, 'Готово. Добро пожаловать в Тихий Залив.', LOAD_TIPS[9]);
    await this._frame();
    // небольшой прогрев: рендерим несколько кадров, чтобы шейдеры скомпилировались
    this.water.update(0.016, this.camera);
    this.pipeline.render(0.016);
    this.pipeline.render(0.016);

    this.state = 'menu';
    this.ui.showLoading(false);
    this.ui.showMenu();
    this.ui.updateMenuStats(this);
    this.clock = new THREE.Clock();
    this._loop();
  }

  _failBoot(msg) {
    const el = document.getElementById('loadStatus');
    if (el) {
      el.textContent = msg;
      el.style.color = '#d9594c';
      el.style.fontSize = '13px';
    }
    document.getElementById('loadTitle')?.remove?.();
    const tip = document.getElementById('loadTip');
    if (tip) tip.textContent = 'Обновите страницу или включите аппаратное ускорение в браузере.';
    this.state = 'error';
  }

  _frame() {
    return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  }

  // ==========================================================================
  //  СОБЫТИЯ
  // ==========================================================================
  _wireEvents() {
    this.fishing.on('cast', () => {
      this.stats.casts++;
      this.rodEquipped = true;
    });
    this.fishing.on('catch', (rec) => {
      this.stats.totalCatches++;
      this.stats.speciesSet.add(rec.id);
      this.stats.speciesBest[rec.id] = Math.max(this.stats.speciesBest[rec.id] || 0, rec.weight);
      this.stats.biggestWeight = Math.max(this.stats.biggestWeight, rec.weight);
      const night = this.atmosphere.isNight;
      if (night) {
        this.stats.caughtAtNight = true;
        this.stats.nightCatches++;
      }
      // доход
      const money = rec.price;
      this.economy.money += money;
      this.stats.totalEarned += money;
      this.stats.skill += 0.15;
      // расход наживки
      const bait = this.fishing.bait;
      const consumable = ['worm', 'maggot', 'corn', 'dough', 'livebait'].includes(bait);
      if (consumable) this.fishing.baitCount[bait] = Math.max(0, (this.fishing.baitCount[bait] || 0) - 1);
      this.ui.showCatch(rec);
      this.audio?.jingle('catch');
      this._checkProgress();
      if (this.stats.speciesSet.size === 1) {
        this.ui.toast('Первый улов! Откройте журнал (J) — там описание видов.', 'good');
      }
    });
    this.fishing.on('missed', (p) => {
      this.ui.toast(p?.reason === 'too_slow' ? 'Слишком медленно — рыба ушла' : 'Пустая подсечка', 'bad');
    });
    this.fishing.on('line_broke', () => {
      this.ui.toast('Леска оборвалась! Ослабляйте натяжение.', 'bad');
      this.player.addShake(0.2);
    });
    this.fishing.on('hooked', () => {
      this.player.addShake(0.1);
      this.audio?.setMusicState('tension');
    });
    this.quests.on('completed', (q) => {
      this.stats.questsCompleted++;
      if (q.reward?.money) {
        this.economy.money += q.reward.money;
        this.stats.totalEarned += q.reward.money;
      }
      if (q.reward?.baits) {
        for (const [b, n] of Object.entries(q.reward.baits)) this.fishing.addBait(b, n);
      }
      this.ui.toast(`Задание выполнено: ${q.title}`, 'good');
      this.audio?.jingle('complete');
      this._checkProgress();
    });
    this.quests.on('step', ({ quest, step }) => {
      this.ui.toast(`Задание «${quest.title}»: ${step.label} — готово`, 'good');
    });
    this.achievements.on('unlocked', (a) => {
      this.ui.showAchievement(a);
      this.audio?.sfx('achievement', { volume: 0.9 });
    });
    this.player.onViewChange = (v) => this.ui.toast(v === 'third' ? 'Вид от третьего лица' : 'Вид от первого лица');
    this.player.onRodChange = (on) => {
      this.rodEquipped = on;
      if (on) {
        this.ui.toast('Удочка в руках. ЛКМ — заброс');
        this.audio?.sfx('click_bait');
      }
    };
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'playing') return;
      if (e.code === 'KeyF') this.toggleRod();
      if (e.code === 'Tab') {
        e.preventDefault();
        this.ui.openModal('inventoryModal');
      }
      if (e.code === 'KeyJ') this.ui.openModal('journalModal');
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'F9') this.cycleDebugView();
    });
  }

  _seedNotes() {
    this.notes = [
      { author: 'старик Матвей, смотритель маяка', text: 'Вода в заливе помнит больше, чем мы. Не жадничай — бери столько, сколько съешь.' },
      { author: 'записка в хижине', text: 'Если туман встал стеной — не глуши мотор. Слушай колокол на утёсе и правь на него.' },
      { author: 'дневник деда', text: 'Лунная рыба приходит в третью ночь тумана. Приманка должна светиться. Только не смотри ей в глаза слишком долго.' },
      { author: 'капитан порта', text: 'Камышовая отмель мелеет к осени. Щука там держится у самой кромки — забрасывай тихо.' },
    ];
  }

  // ==========================================================================
  //  МЕНЮ / СОСТОЯНИЯ
  // ==========================================================================
  async onMenuAction(act) {
    switch (act) {
      case 'continue':
        if (this.hasSave) {
          await this.startGame(true);
        } else {
          this.ui.toast('Сохранение не найдено', 'bad');
        }
        break;
      case 'new':
        await this.startGame(false);
        break;
      case 'settings':
        this.ui.openModal('settingsModal');
        break;
      case 'journal':
        if (this.state === 'playing') this.ui.openModal('journalModal');
        else {
          this.ui.openModal('journalModal');
        }
        break;
      case 'achievements':
        this.ui.openModal('achievementsModal');
        break;
      case 'presets':
        this.ui.openModal('presetsModal');
        break;
      case 'ideas':
        this.ui.openModal('ideasModal');
        break;
      case 'quit':
        this.ui.toast('В веб-версии выход — это закрытие вкладки. Спасибо за игру!');
        break;
      case 'resume':
        this.togglePause();
        break;
      case 'save':
        this.save();
        break;
      case 'load':
        if (this.hasSave) {
          this.load();
          this.ui.closeAllModals();
          this.resumeToPlaying();
        } else this.ui.toast('Сохранение не найдено', 'bad');
        break;
      case 'menu':
        this.toMenu();
        break;
      default:
        break;
    }
  }

  async startGame(fromSave = false) {
    this.ui.hideMenu();
    this.ui.closeAllModals();
    this.ui.showHUD(true);
    this.state = 'playing';
    this.player.acceptPointerLock = true;
    // Первый жест — инициализация звука
    await this.audio.init();
    this._applyAudioSettings();
    this.audio.setMusicState(this.atmosphere.isNight ? 'night' : 'explore');
    if (fromSave) this.load();
    else this.newGame();
    this.player.updateCameraImmediate();
    this.audio.resume();
    this.ui.toast('Тихий Залив. День ' + this.atmosphere.day, 'good');
    if (!fromSave) {
      setTimeout(() => {
        this.ui.showDialog([
          { name: 'Голос залива', text: 'Туман ещё держится над водой. Залив просыпается медленно, как старик.' },
          { name: 'Голос залива', text: 'Возьмите удочку — F. Заброс — ЛКМ с зажатием. Поклёвка — снова ЛКМ.' },
          { name: 'Голос залива', text: 'Лодка у причала. Подойдите и нажмите E, чтобы выйти на воду. Удачи, рыбак.' },
        ]);
      }, 1200);
    }
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.ui.openModal('pauseModal');
      this.ui.showPrompt(null);
      document.exitPointerLock?.();
      const s = this.stats;
      document.getElementById('pauseStats').innerHTML =
        `Поймано рыб: ${s.totalCatches} · Видов: ${s.speciesSet.size}/12 · Заработано: ${Math.round(s.totalEarned)} ₽<br>` +
        `День ${this.atmosphere.day}, ${this.atmosphere.clockString} · Погода: ${this.atmosphere.weatherLabel}`;
    } else if (this.state === 'paused') {
      this.ui.closeAllModals();
      this.resumeToPlaying();
    }
  }

  resumeToPlaying() {
    this.state = 'playing';
    this.player.acceptPointerLock = true;
    this.audio?.resume();
  }

  toMenu() {
    this.state = 'menu';
    this.ui.closeAllModals();
    this.ui.showHUD(false);
    this.ui.showMenu();
    this.ui.updateMenuStats(this);
    this.player.acceptPointerLock = false;
    document.exitPointerLock?.();
    this.fishing.cancel();
    this.audio?.setMusicState('explore');
  }

  newGame() {
    this.stats = this._freshStats();
    this.economy.money = 120;
    this.fishing.catches = [];
    this.fishing.totalCatches = 0;
    this.fishing.rodLevel = 0;
    this.fishing.baitCount = { worm: 30, maggot: 25, corn: 12, dough: 20, livebait: 6, spinner: 1, fly: 1, moonbait: 0 };
    this.quests = new QuestSystem();
    this.achievements = new AchievementSystem();
    this._wireQuestEvents();
    this.atmosphere.day = 1;
    this.atmosphere.timeOfDay = 8.25;
    this.atmosphere.setWeather('clear', true);
    const home = this.world.landmarks.home.position;
    this.player.teleport(home.x + 5, this.world.terrain.heightAt(home.x + 5, home.z + 7) + 0.5, home.z + 7, -0.6);
    this.rodEquipped = false;
    this.player.equipRod(false);
    this.player.mode = 'walk';
    this.player.boat = null;
    this.boat.exit();
    if (this.world.boatSpawn) this.boat.setPosition(this.world.boatSpawn.x, 0, this.world.boatSpawn.z, this.world.boatGroup.rotation.y);
    this.ui.refreshInventory();
    this._checkProgress();
  }

  _wireQuestEvents() {
    // события квестов переподключаются после newGame/load
    this.quests.on('completed', (q) => {
      this.stats.questsCompleted++;
      if (q.reward?.money) {
        this.economy.money += q.reward.money;
        this.stats.totalEarned += q.reward.money;
      }
      if (q.reward?.baits) for (const [b, n] of Object.entries(q.reward.baits)) this.fishing.addBait(b, n);
      this.ui.toast(`Задание выполнено: ${q.title}`, 'good');
      this.audio?.jingle('complete');
      this._checkProgress();
    });
    this.quests.on('step', ({ quest, step }) => {
      this.ui.toast(`Задание «${quest.title}»: ${step.label} — готово`, 'good');
    });
    this.achievements.on('unlocked', (a) => {
      this.ui.showAchievement(a);
      this.audio?.sfx('achievement', { volume: 0.9 });
    });
  }

  toggleRod() {
    if (this.player.mode === 'boat' && !this.boat.occupied) return;
    this.rodEquipped = !this.rodEquipped;
    this.player.equipRod(this.rodEquipped);
    if (!this.rodEquipped) this.fishing.cancel();
  }

  /** Взаимодействие (E). */
  interact() {
    // лодка
    if (this.player.mode === 'walk' && this.boat.canBoard(this.player.position)) {
      this.boardBoat();
      return;
    }
    if (this.player.mode === 'boat') {
      this.leaveBoat();
      return;
    }
    // костёр
    const fire = this.world.landmarks.campfire;
    if (fire && this.player.position.distanceTo(fire.position) < 3) {
      this.ui.showDialog([
        { name: 'Костёр', text: 'Огонь тихо трещит. Тепло расходится по рукам. Здесь хорошо думается.' },
        { name: 'Костёр', text: 'Вы отдохнули. Силы восстановлены.' },
      ]);
      this.player.stamina = this.player.maxStamina;
      this.audio?.sfx('fire');
      return;
    }
    // маяк
    const lh = this.world.landmarks.lighthouse;
    if (lh && this.player.position.distanceTo(lh.position) < 7) {
      if (!this.stats.visitedLighthouse) {
        this.stats.visitedLighthouse = true;
        this.ui.toast('Маяк осмотрен', 'good');
      }
      this.ui.showDialog([
        { name: 'Маяк', text: 'Старая лампа ещё жива: стекло тёплое, механизм вращается с сухим щелчком.' },
        { name: 'Маяк', text: 'С высоты залив виден целиком — весь, до последней отмели. Где-то там, в тумане, ждёт Лунная рыба.' },
      ]);
      this.audio?.sfx('lamp_on');
      return;
    }
    // дом
    const home = this.world.landmarks.home;
    if (home && this.player.position.distanceTo(home.position) < 5.5) {
      this.ui.showDialog([
        { name: 'Дом рыбака', text: 'Внутри пахнет смолой и старой сетью. На столе — карта залива с пометками.' },
        { name: 'Дом рыбака', text: 'В углу стоит ящик с наживкой. Можно взять немного червей.' },
      ]);
      this.fishing.addBait('worm', 5);
      return;
    }
    // мастерская — магазин
    const ws = this.world.landmarks.workshop;
    if (ws && this.player.position.distanceTo(ws.position) < 4.5) {
      this.openShop();
      return;
    }
    // причал — подсказка
    const dock = this.world.landmarks.dock;
    if (dock && this.player.position.distanceTo(dock.position) < 12) {
      this.ui.toast('Причал: хорошее место для заброса. Лодка рядом — E, чтобы сесть.');
    }
  }

  openShop() {
    const money = Math.round(this.economy.money);
    this.ui.showDialog([
      { name: 'Мастерская', text: `Верстак, ящики с наживкой и снастями. У вас ${money} ₽.` },
      { name: 'Мастерская', text: 'Червь 2₽ · опарыш 1₽ · кукуруза 3₽ · тесто 2₽ · живец 12₽ · блесна 45₽ · мушка 38₽.' },
      { name: 'Мастерская', text: 'Покупки — в инвентаре (Tab): нажмите «+5» рядом с наживкой. Лунная приманка появится, когда откроете 5 видов.' },
    ]);
  }

  /** Покупка наживки (из инвентаря). */
  buyBait(id, qty = 5) {
    const def = BAIT_TYPES[id];
    if (!def) return false;
    if (id === 'moonbait' && this.stats.speciesSet.size < 5) {
      this.ui.toast('Лунная приманка откроется после 5 видов рыб', 'bad');
      return false;
    }
    const cost = def.price * qty;
    if (this.economy.money < cost) {
      this.ui.toast(`Не хватает денег: нужно ${cost} ₽`, 'bad');
      this.audio?.sfx('error');
      return false;
    }
    this.economy.money -= cost;
    this.fishing.addBait(id, qty);
    this.audio?.sfx('pickup');
    this.ui.toast(`Куплено: ${def.name} ×${qty} за ${cost} ₽`, 'good');
    this.ui.refreshInventory();
    return true;
  }

  boardBoat() {
    this.boat.enter();
    this.player.mode = 'boat';
    this.player.boat = this.boat;
    this.player.yaw = this.boat.yaw;
    this.ui.toast('Вы в лодке. W — газ, A/D — руль, E — выйти');
    this.audio?.sfx('engine_start');
  }

  leaveBoat() {
    const seat = this.boat.seatWorldPosition;
    this.player.mode = 'walk';
    this.player.boat = null;
    this.boat.exit();
    const shore = this.world.dockShore || this.world.landmarks.dock.position;
    const spot = this.world.terrain.findFlatSpotNear(shore.x, shore.z, 6, { minH: 0.9 });
    this.player.teleport(spot.x ?? shore.x, (spot.h ?? shore.y) + 0.4, spot.z ?? shore.z);
    this.ui.toast('Вы на берегу');
  }

  // ==========================================================================
  //  ГРАФИКА
  // ==========================================================================
  setQuality(q) {
    if (!QUALITY_PRESETS[q]) return;
    this.quality = q;
    this.pipeline.setQuality(q);
    this.water.enableReflections(this.renderer, QUALITY_PRESETS[q].reflections);
    this.renderer.shadowMap.enabled = QUALITY_PRESETS[q].shadows;
    this.atmosphere.sun.castShadow = QUALITY_PRESETS[q].shadows;
    const size = QUALITY_PRESETS[q].shadowMapSize;
    this.atmosphere.sun.shadow.mapSize.set(size, size);
    if (this.atmosphere.sun.shadow.map) {
      this.atmosphere.sun.shadow.map.dispose();
      this.atmosphere.sun.shadow.map = null;
    }
    this.ui._syncQualityButtons(q);
    this.ui.toast('Качество: ' + QUALITY_PRESETS[q].label);
    this.saveSettings();
  }

  setGfxOption(key, on) {
    this.settings[key] = on;
    if (key === 'reflections') this.water.enableReflections(this.renderer, on);
    if (key === 'shadows') {
      this.renderer.shadowMap.enabled = on;
      this.atmosphere.sun.castShadow = on;
    }
    if (key === 'dof' && this.pipeline.bokeh) this.pipeline.bokeh.enabled = on;
    if (key === 'bloom' && this.pipeline.bloom) this.pipeline.bloom.enabled = on;
    if (key === 'ssao' && this.pipeline.gtao) this.pipeline.gtao.enabled = on;
    this.ui.toast((on ? 'Включено' : 'Отключено') + ': ' + ({ reflections: 'отражения', shadows: 'тени', dof: 'DOF', bloom: 'Bloom', ssao: 'SSAO' }[key] || key));
  }

  setGfxScale(s) {
    this.gfxScale = s;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.pipeline.preset.pixelRatio * s);
    this.pipeline.resize();
  }

  /**
   * Пошаговая диагностика графики (F9). Помогает определить источник
   * артефактов на конкретной видеокарте: растительность, точки, вода,
   * постобработка или сама сцена.
   */
  cycleDebugView() {
    const steps = [
      { name: 'обычный кадр', apply: () => this._debugReset() },
      { name: 'без растительности', apply: () => { this._debugReset(); this._hideByName(/leaf|grass|reeds|fern|flower|bush|lily/i); } },
      { name: 'без любых прозрачных объектов', apply: () => { this._debugReset(); this._hideTransparent(); } },
      { name: 'без частиц и точек', apply: () => { this._debugReset(); this._hidePoints(); } },
      { name: 'без воды', apply: () => { this._debugReset(); this.water.mesh.visible = false; if (this.water.farWater) this.water.farWater.visible = false; } },
      { name: 'без постобработки (прямой рендер)', apply: () => { this._debugReset(); this._debugNoPost = true; } },
      { name: 'только геометрия, все материалы простые', apply: () => { this._debugReset(); this._debugFlatMaterials(); } },
    ];
    this._debugStep = ((this._debugStep ?? -1) + 1) % steps.length;
    const step = steps[this._debugStep];
    step.apply();
    this.ui.toast(`Диагностика ${this._debugStep + 1}/${steps.length}: ${step.name}`, 'good');
    console.log('[F9]', this._debugStep + 1, step.name);
  }

  _debugReset() {
    this._debugNoPost = false;
    this.scene.traverse((o) => {
      if (o.userData.__dbgHidden) {
        o.visible = o.userData.__dbgWasVisible;
        delete o.userData.__dbgHidden;
      }
      if (o.userData.__dbgMat) {
        o.material = o.userData.__dbgMat;
        delete o.userData.__dbgMat;
        if (Array.isArray(o.userData.__dbgMatAlt)) delete o.userData.__dbgMatAlt;
      }
    });
    this.water.mesh.visible = true;
    if (this.water.farWater) this.water.farWater.visible = true;
    if (this.player?.model) this.player.model.root.visible = this.player.viewMode === 'third';
  }

  _hideObj(o) {
    if (!o.visible) return;
    o.userData.__dbgWasVisible = o.visible;
    o.userData.__dbgHidden = true;
    o.visible = false;
  }

  _hideByName(re) {
    this.scene.traverse((o) => {
      if ((o.isMesh || o.isInstancedMesh || o.isPoints) && re.test(o.name || '')) this._hideObj(o);
    });
  }

  _hideTransparent() {
    this.scene.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh || o.isPoints)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m && (m.transparent || m.alphaTest > 0))) this._hideObj(o);
    });
  }

  _hidePoints() {
    this.scene.traverse((o) => {
      if (o.isPoints) this._hideObj(o);
    });
  }

  _debugFlatMaterials() {
    const flat = new THREE.MeshBasicMaterial({ color: 0xb9c6cc, wireframe: false });
    this.scene.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh) || !o.visible) return;
      if (o.material === flat) return;
      o.userData.__dbgMat = o.material;
      o.material = flat;
    });
  }

  setGrassDensity(d) {
    for (const im of this.world.instanceGroups) {
      if (im.name === 'grass') im.count = Math.floor(im.userData.fullCount || im.count);
    }
    this.grassDensity = d;
  }

  setExposure(v) {
    this.exposureOverride = v;
  }

  setGrade(v) {
    if (this.pipeline.grade) {
      this.pipeline.grade.uniforms.uGrain.value = 0.01 + v * 0.05;
      this.pipeline.grade.uniforms.uVignette.value = 0.24 + v * 0.4;
      this.pipeline.grade.uniforms.uSat.value = 0.94 + v * 0.24;
    }
  }

  applyGraphicsPreset(letter) {
    const map = { A: 'ultra', B: 'high', C: 'high', D: 'medium' };
    this.setQuality(map[letter] || 'high');
    if (letter === 'A') {
      this.setGrade(0.55);
      this.pipeline.setBokehAperture(0.00026);
    } else if (letter === 'D') {
      this.setGrade(0.75);
      this.pipeline.setBokehAperture(0.0004);
    }
    this.ui.closeModal('presetsModal');
    this.ui.toast('Пресет применён: ' + letter);
    this.saveSettings();
  }

  // ==========================================================================
  //  ЗВУК
  // ==========================================================================
  _applyAudioSettings() {
    if (!this.audio) return;
    const s = this.loadRaw(SETTINGS_KEY) || {};
    this.audio.setVolume('master', s.volMaster ?? 0.85);
    this.audio.setVolume('music', s.volMusic ?? 0.62);
    this.audio.setVolume('sfx', s.volSfx ?? 0.85);
    this.audio.setVolume('ambience', s.volAmb ?? 0.7);
    this.audio.setMusicEnabled(s.musicOn !== false);
  }

  setVolume(kind, v) {
    this.audio?.setVolume(kind, v);
    const s = this.loadRaw(SETTINGS_KEY) || {};
    s[{ master: 'volMaster', music: 'volMusic', sfx: 'volSfx', ambience: 'volAmb' }[kind]] = v;
    this.saveRaw(SETTINGS_KEY, s);
  }

  setMusicEnabled(on) {
    this.audio?.setMusicEnabled(on);
    const s = this.loadRaw(SETTINGS_KEY) || {};
    s.musicOn = on;
    this.saveRaw(SETTINGS_KEY, s);
  }

  setSpatialAudio(on) {
    this.spatialAudio = on;
    this.ui.toast(on ? 'Пространственный звук: HRTF' : 'Пространственный звук: стерео');
  }

  setSensitivity(v) {
    this.sensitivity = v;
    this.player?.setSensitivity(0.0022 * v);
  }

  setHeadBob(v) {
    this.headBobScale = v;
    if (this.player) this.player.headBobAmount = 0.028 * v;
  }

  setInvertY(on) {
    this.invertY = on;
    if (this.player) this.player.invertY = on;
  }

  resetKeybinds() {
    this.keybinds = {
      forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
      jump: 'Space', run: 'ShiftLeft', crouch: 'KeyC', interact: 'KeyE',
      rod: 'KeyF', inventory: 'Tab', journal: 'KeyJ', view: 'KeyV',
    };
    this.ui.syncSettings();
    this.ui.toast('Управление сброшено');
  }

  // ==========================================================================
  //  СОХРАНЕНИЯ
  // ==========================================================================
  loadRaw(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }

  saveRaw(key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }

  loadSettings() {
    const s = this.loadRaw(SETTINGS_KEY);
    if (!s) return;
    this.quality = s.quality || this.quality;
    this.sensitivity = s.sensitivity ?? 1;
    this.invertY = !!s.invertY;
    this.gfxScale = s.gfxScale ?? 1;
    this.settings.reflections = s.reflections !== false;
    this.grassDensity = s.grassDensity ?? 1;
    if (s.keybinds) this.keybinds = { ...this.keybinds, ...s.keybinds };
  }

  saveSettings() {
    this.saveRaw(SETTINGS_KEY, {
      quality: this.quality,
      sensitivity: this.sensitivity,
      invertY: this.invertY,
      gfxScale: this.gfxScale,
      reflections: this.settings.reflections,
      grassDensity: this.grassDensity,
      keybinds: this.keybinds,
      volMaster: this.audio?.volumes.master ?? 0.85,
      volMusic: this.audio?.volumes.music ?? 0.62,
      volSfx: this.audio?.volumes.sfx ?? 0.85,
      volAmb: this.audio?.volumes.ambience ?? 0.7,
      musicOn: this.audio?.musicEnabled !== false,
    });
  }

  save() {
    const data = {
      version: 1,
      savedAt: Date.now(),
      player: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
        yaw: this.player.yaw,
        mode: this.player.mode,
        stamina: this.player.stamina,
      },
      boat: {
        x: this.boat.position.x,
        y: this.boat.position.y,
        z: this.boat.position.z,
        yaw: this.boat.yaw,
      },
      atmosphere: {
        day: this.atmosphere.day,
        timeOfDay: this.atmosphere.timeOfDay,
        weather: this.atmosphere.weatherName || 'clear',
        cloudCover: this.atmosphere.weather.cloudCover,
        fog: this.atmosphere.weather.fog,
        wind: this.atmosphere.weather.wind,
      },
      economy: { money: this.economy.money },
      stats: {
        ...this.stats,
        speciesSet: [...this.stats.speciesSet],
        islandsVisited: [...this.stats.islandsVisited],
      },
      fishing: {
        rodLevel: this.fishing.rodLevel,
        bait: this.fishing.bait,
        baitCount: this.fishing.baitCount,
        catches: this.fishing.catches.slice(-200),
        totalCatches: this.fishing.totalCatches,
        skill: this.fishing.skill,
      },
      quests: { active: [...this.quests.active.keys()], completed: [...this.quests.completed] },
      achievements: [...this.achievements.unlocked],
      notes: this.notes,
      rodEquipped: this.rodEquipped,
    };
    this.saveRaw(SAVE_KEY, data);
    this.hasSave = true;
    this.ui.toast('Игра сохранена', 'good');
    this.ui.updateMenuStats(this);
  }

  load() {
    const data = this.loadRaw(SAVE_KEY);
    if (!data) {
      this.ui.toast('Сохранение повреждено или отсутствует', 'bad');
      return;
    }
    this.stats = this._freshStats();
    Object.assign(this.stats, data.stats || {});
    this.stats.speciesSet = new Set(data.stats?.speciesSet || []);
    this.stats.islandsVisited = new Set(data.stats?.islandsVisited || []);
    this.economy.money = data.economy?.money ?? 120;
    this.atmosphere.day = data.atmosphere?.day ?? 1;
    this.atmosphere.timeOfDay = data.atmosphere?.timeOfDay ?? 8.25;
    this.atmosphere.setWeather(data.atmosphere?.weather || 'clear', true);
    this.atmosphere.applyTimeOfDay(this.atmosphere.timeOfDay, true);

    this.fishing.rodLevel = data.fishing?.rodLevel ?? 0;
    this.fishing.bait = data.fishing?.bait ?? 'worm';
    this.fishing.baitCount = data.fishing?.baitCount ?? this.fishing.baitCount;
    this.fishing.catches = data.fishing?.catches ?? [];
    this.fishing.totalCatches = data.fishing?.totalCatches ?? 0;
    this.fishing.skill = data.fishing?.skill ?? 0;
    this.rodEquipped = !!data.rodEquipped;
    this.player.equipRod(this.rodEquipped);

    this.notes = data.notes || this.notes;

    if (data.player) {
      this.player.teleport(data.player.x, data.player.y, data.player.z, data.player.yaw);
      this.player.mode = data.player.mode || 'walk';
      if (this.player.mode === 'boat') {
        this.boat.enter();
        this.player.boat = this.boat;
      }
    }
    if (data.boat) {
      this.boat.position.set(data.boat.x, data.boat.y, data.boat.z);
      this.boat.yaw = data.boat.yaw;
      this.world.boatGroup.position.copy(this.boat.position);
    }
    this.quests = new QuestSystem();
    this.achievements = new AchievementSystem();
    for (const id of data.quests?.completed || []) this.quests.completed.add(id);
    for (const id of data.quests?.active || []) this.quests.active.set(id, {});
    for (const id of data.achievements || []) this.achievements.unlocked.add(id);
    this._wireQuestEvents();
    this.ui.updateMenuStats(this);
    this.ui.toast('Игра загружена', 'good');
  }

  // ==========================================================================
  //  ПРОГРЕСС
  // ==========================================================================
  _checkProgress() {
    const state = {
      totalCatches: this.stats.totalCatches,
      speciesSet: this.stats.speciesSet,
      speciesCaught: this.stats.speciesSet.size,
      biggestWeight: this.stats.biggestWeight,
      totalEarned: this.stats.totalEarned,
      casts: this.stats.casts,
      nightCatches: this.stats.nightCatches,
      caughtAtNight: this.stats.caughtAtNight,
      islandsVisited: this.stats.islandsVisited,
      visitedLighthouse: this.stats.visitedLighthouse,
      stormDistance: this.stats.stormDistance,
      boatDistance: this.stats.boatDistance,
      walkDistance: this.stats.walkDistance,
      rodLevel: this.fishing.rodLevel,
      nightBoatRide: this.stats.nightBoatRide,
      skill: this.stats.skill,
    };
    this.quests.update(state);
    this.achievements.update(state);
  }

  // ==========================================================================
  //  ГЛАВНЫЙ ЦИКЛ
  // ==========================================================================
  _loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const dtRaw = Math.min(0.05, this.clock.getDelta());
      this._update(dtRaw);
    };
    tick();
  }

  _update(dt) {
    this._frameDt = Math.min(dt, 0.1);
    const playing = this.state === 'playing';
    // Атмосфера идёт всегда (для меню — живой фон)
    this.atmosphere.update(dt, this.camera.position);
    const w = this.atmosphere.weather;
    // вода: амплитуда от погоды
    this.water.update(dt, this.camera, w.waveAmp ?? 1);
    this.water.setSun(this.atmosphere.skyUniforms.uSunDir.value, this.atmosphere.skyUniforms.uSunColor.value, this.atmosphere.sun.intensity / 3);
    this.water.setSky(
      this.atmosphere.skyUniforms.uZenith.value,
      this.atmosphere.skyUniforms.uHorizon.value,
      new THREE.Color(0x0b2a33),
      new THREE.Color(0x2d7a72)
    );
    this.water.setWeather(w.rain ?? 0, clamp((w.wind ?? 0.5) * 0.6, 0, 1.4), 0.7 + (w.wind ?? 0) * 0.4);
    this.water.level = 0;
    this.water.uniforms.uWaterLevel.value = 0;

    this.world.update(dt, this.camera, this.atmosphere, this.water, this.fx, playing ? null : null);
    this.fx.update(dt);
    this.fx.pollen(dt, this.camera, clamp(this.atmosphere.sunElevationNorm * 3, 0, 1));

    // Игрок и лодка
    if (playing) {
      const input = this._boatInput();
      if (this.player.mode === 'boat') {
        this.boat.update(dt, input, this.atmosphere);
        // расстояние на лодке
        const dist = this.boat.position.distanceTo(this._lastPos);
        if (dist < 40) {
          this.stats.boatDistance += dist;
          if (this.atmosphere.weatherName === 'storm') this.stats.stormDistance += dist;
          if (this.atmosphere.isNight && dist > 0.4) this.stats.nightBoatRide = true;
        }
        this._lastPos.copy(this.boat.position);
      } else {
        this.boat.update(dt, null, this.atmosphere);
        this._lastPos.copy(this.player.position);
      }
      this.player.update(dt, this.atmosphere, this.water);
      if (this.player.mode !== 'boat') {
        const d = this.player.position.distanceTo(this._lastPos);
        if (d < 20) this.stats.walkDistance += d;
        this._lastPos.copy(this.player.position);
      }
      // рыбалка
      const fishInput = { reeling: this.player.mouse.buttons.has(0) };
      this.fishing.update(dt, fishInput);
      this._handleFishingInput();
      // исследование островов
      this._updateIslandVisits();
      // взаимодействие
      this._updateInteractPrompt();
      // фокус DOF
      this.updateDepthOfField();
      // музыкальный штат
      this._updateMusicState();
      // периодические задачи
      this._acc.questCheck += dt;
      if (this._acc.questCheck > 1.2) {
        this._acc.questCheck = 0;
        this._checkProgress();
        this._updateFishNear();
      }
      this._acc.autosave += dt;
      if (this._acc.autosave > 90) {
        this._acc.autosave = 0;
        this.save();
      }
      this._acc.hud += dt;
      if (this._acc.hud > 0.1) {
        this._acc.hud = 0;
        this.ui.updateHUD(this);
      }
      // звук
      if (this.audio?.ready) {
        this.audio.updateMusic(dt);
        this.audio.updateListener(this.camera);
        if (this.player.mode !== 'boat') {
          this.audio.setAmbience({
            rain: w.rain ?? 0,
            wind: w.wind ?? 0.5,
            engine: 0,
          });
        }
        this._updateAmbientSfx(dt);
      }
    } else {
      // в меню — медленный облёт камеры
      this._menuCamera(dt);
      if (this.audio?.ready) this.audio.updateMusic(dt);
    }

    // затенение/постобработка
    if (this.exposureOverride) this.pipeline.setExposure(this.exposureOverride * (0.9 + 0.2 * 0.5));

    // отражения воды
    if (this.settings.reflections && this.water._reflectionEnabled) {
      this.world.boatGroup.visible = this.player.mode !== 'boat' ? true : true;
      this.water.renderReflection(this.renderer, this.scene, this.camera, []);
    }

    if (this._debugNoPost) {
      this.renderer.renderer.setRenderTarget(null);
      this.renderer.renderer.render(this.scene, this.camera);
    } else {
      this.pipeline.render(dt);
    }
  }

  _boatInput() {
    const k = this.player.keys;
    return {
      forward: k.has('KeyW') || k.has('ArrowUp'),
      back: k.has('KeyS') || k.has('ArrowDown'),
      left: k.has('KeyA') || k.has('ArrowLeft'),
      right: k.has('KeyD') || k.has('ArrowRight'),
    };
  }

  /**
   * Мышь управляет снастью:
   *  ЛКМ (отпустить) — заброс / подсечка;
   *  ЛКМ (держать) в поклёвку — подсечка;
   *  ЛКМ 0.6 с на «ждём» — смотать;
   *  ЛКМ (держать) на вываживании — тянуть (обрабатывается в fishing.update).
   */
  _handleFishingInput() {
    const pressed = this.player.mouse.buttons.has(0);
    const justPressed = pressed && !this._prevMouseDown;
    const justReleased = !pressed && this._prevMouseDown;
    const f = this.fishing;
    const dt = this._frameDt || 0.016;

    if (justPressed) {
      if (f.state === 'idle') f.startCharge();
      else if (f.state === 'bite') f.releaseCharge();
      this._waitHold = 0;
    }
    if (justReleased) {
      if (f.state === 'charging') f.releaseCharge();
      this._waitHold = 0;
    }
    if (pressed && (f.state === 'waiting' || f.state === 'sinking')) {
      this._waitHold = (this._waitHold || 0) + dt;
      if (this._waitHold > 0.6) {
        this._waitHold = 0;
        f.releaseCharge();
      }
    } else if (!pressed) {
      this._waitHold = 0;
    }
    this._prevMouseDown = pressed;
  }

  _updateMusicState() {
    if (!this.audio || !this.audio.ready) return;
    let state = 'explore';
    if (this.fishing.state === 'fighting' || this.fishing.state === 'bite') state = 'tension';
    else if (this.atmosphere.isNight) state = 'night';
    else if (this.atmosphere.weatherName === 'storm') state = 'tension';
    this.audio.setMusicState(state);
  }

  _updateAmbientSfx(dt) {
    this._ambientTimers = this._ambientTimers || { bird: 5, cricket: 3, gull: 12 };
    const t = this._ambientTimers;
    const day = clamp(this.atmosphere.sunElevationNorm * 3, 0, 1);
    t.bird -= dt;
    if (t.bird <= 0 && day > 0.4) {
      t.bird = 6 + Math.random() * 12;
      this.audio.sfx('bird', { volume: 0.45 + Math.random() * 0.3 });
    }
    t.cricket -= dt;
    if (t.cricket <= 0 && day < 0.25) {
      t.cricket = 2.4 + Math.random() * 3;
      this.audio.sfx('crickets', { volume: 0.35 });
    }
    t.gull -= dt;
    if (t.gull <= 0 && day > 0.3) {
      t.gull = 14 + Math.random() * 20;
      this.audio.sfx('seagull', { volume: 0.3, pos: this.camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 40, 12, (Math.random() - 0.5) * 40)) });
    }
    if (this.atmosphere.weather.wind > 1.4 && Math.random() < dt * 0.06) {
      this.audio.sfx('wind_gust', { volume: 0.4 });
    }
  }

  _updateIslandVisits() {
    const p = this.player.position;
    const { island } = this.world.terrain.nearestIsland(p.x, p.z);
    if (island && this.world.terrain.heightAt(p.x, p.z) > 0.8) {
      if (!this.stats.islandsVisited.has(island.id)) {
        this.stats.islandsVisited.add(island.id);
        this.ui.toast(`Открыт остров: ${island.name}`, 'good');
        this.audio?.sfx('pickup');
      }
    }
  }

  _updateInteractPrompt() {
    const p = this.player.position;
    let text = null;
    if (this.player.mode === 'boat') text = 'E — выйти на берег';
    else if (this.boat.canBoard(p)) text = 'E — сесть в лодку';
    else {
      const marks = [
        ['home', 5.5, 'E — войти в дом'],
        ['workshop', 4.5, 'E — мастерская (наживка)'],
        ['campfire', 3.0, 'E — отдохнуть у костра'],
        ['lighthouse', 7.0, 'E — осмотреть маяк'],
      ];
      for (const [k, r, label] of marks) {
        const m = this.world.landmarks[k];
        if (m && p.distanceTo(m.position) < r) {
          text = label;
          break;
        }
      }
      if (!text && this.world.terrain.heightAt(p.x, p.z) < 0.2 && p.y < 2.2) text = 'Вы в воде — идите к берегу';
    }
    this.interactTarget = text;
    this.ui.showPrompt(text);
  }

  _updateFishNear() {
    const p = this.player.position;
    let nearest = null;
    let bestD = 26;
    for (const school of this.world.fishSchools) {
      const d = Math.hypot(school.center.x - (p.x), school.center.z - (p.z));
      if (d < bestD) {
        bestD = d;
        nearest = school;
      }
    }
    this.nearestFishInfo = nearest && bestD < 18 ? nearest.species.name : '—';
  }

  updateDepthOfField() {
    if (!this.pipeline.bokeh) return;
    const target = this.player.mode === 'boat' ? 10 : 7;
    this.pipeline.setFocus(target);
  }

  _menuCamera(dt) {
    this._menuT = (this._menuT || 0) + dt * 0.055;
    const r = 96;
    const x = Math.cos(this._menuT) * r;
    const z = Math.sin(this._menuT) * r;
    const h = this.world.terrain.heightAt(x, z);
    this.camera.position.set(x, Math.max(h, 0) + 16 + Math.sin(this._menuT * 2.1) * 3, z);
    this.camera.lookAt(0, 6, 0);
    this.player.updateCameraImmediate?.();
  }
}

// ============================================================================
//  Старт
// ============================================================================
const game = new Game();
window.__game = game;

function bootGame() {
  game.boot().catch((err) => {
    console.error(err);
    game._failBoot('Ошибка запуска: ' + (err?.message || err));
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootGame);
} else {
  bootGame();
}
