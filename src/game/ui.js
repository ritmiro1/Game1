// ============================================================================
//  UI-контроллер: меню, HUD, настройки, инвентарь, журнал, достижения,
//  диалоги, тосты. Вся текстовая часть — на русском.
// ============================================================================
import { BAIT_TYPES, ROD_LEVELS } from './fishing.js';
import { SPECIES, SPECIES_BY_ID } from '../models/fish.js';
import { QUESTS, ACHIEVEMENTS } from './quests.js';
import { QUALITY_PRESETS } from '../core/renderer.js';
import IDEAS_CATALOG from '../data/ideas.json';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

export const LOAD_TIPS = [
  'Совет: в тумане рыба подходит ближе к берегу.',
  'Совет: ночью хорошо берёт сом и угорь.',
  'Совет: наживку «живец» обожает щука.',
  'Совет: у Маячного утёса холодная вода — там форель.',
  'Совет: на волнах лодку качает сильнее — держитесь за руль.',
  'Совет: камышовая отмель — дом леща и щуки.',
  'Совет: Лунная рыба показывается только в туманные ночи.',
  'Совет: не перетягивайте леску — она рвётся.',
  'Совет: присядьте (C), чтобы подойти к рыбе ближе.',
  'Совет: Tab открывает инвентарь и снасти.',
];

export class UI {
  constructor(game) {
    this.game = game;
    this.els = {};
    this.currentModal = null;
    this.dialogQueue = [];
    this.dialogActive = false;
    this._notifyTimer = null;
    this._catchTimer = null;
    this._achTimer = null;
    this._bind();
    this._buildKeybinds();
    this._buildCompass();
    this._buildHotbar();
  }

  _bind() {
    // кнопки главного меню
    $('#menuNav').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      this.game.audio?.sfx('ui_click');
      this.game.onMenuAction(btn.dataset.act);
    });
    // универсальные кнопки действий
    document.addEventListener('click', (e) => {
      const closeId = e.target.closest('[data-close]')?.dataset.close;
      if (closeId) {
        this.closeModal(closeId);
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act && !e.target.closest('#menuNav')) {
        this.game.onMenuAction(act);
      }
    });
    // пресеты
    $('#presetGrid').addEventListener('click', (e) => {
      const card = e.target.closest('[data-preset]');
      if (!card) return;
      $$('#presetGrid .preset-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      this.selectedPreset = card.dataset.preset;
      this.game.audio?.sfx('ui_hover');
    });
    $('#applyPreset').addEventListener('click', () => {
      this.game.applyGraphicsPreset(this.selectedPreset || 'A');
    });
    // качество в меню
    $('#qualitySeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      this.game.setQuality(b.dataset.q);
      this.game.audio?.sfx('ui_click');
    });
    // табы настроек
    $$('.tab[data-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.tab[data-tab]').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        $$('[data-body]').forEach((b) => b.classList.toggle('hidden', b.dataset.body !== tab.dataset.tab));
      });
    });
    // табы журнала
    $$('.tab[data-jtab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.tab[data-jtab]').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        $$('[data-jbody]').forEach((b) => b.classList.toggle('hidden', b.dataset.jbody !== tab.dataset.jtab));
        this.refreshJournal();
      });
    });
    // настройки графики внутри модалки
    $('#gfxQuality').addEventListener('click', (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      this.game.setQuality(b.dataset.q);
      this._syncQualityButtons(b.dataset.q);
    });
    $('#gfxShadows').addEventListener('change', (e) => this.game.setGfxOption('shadows', e.target.checked));
    $('#gfxSSAO').addEventListener('change', (e) => this.game.setGfxOption('ssao', e.target.checked));
    $('#gfxBloom').addEventListener('change', (e) => this.game.setGfxOption('bloom', e.target.checked));
    $('#gfxDOF').addEventListener('change', (e) => this.game.setGfxOption('dof', e.target.checked));
    $('#gfxReflect').addEventListener('change', (e) => this.game.setGfxOption('reflections', e.target.checked));
    $('#gfxScale').addEventListener('input', (e) => {
      $('#gfxScaleOut').textContent = Number(e.target.value).toFixed(2);
      this.game.setGfxScale(Number(e.target.value));
    });
    $('#gfxGrass').addEventListener('input', (e) => {
      $('#gfxGrassOut').textContent = Number(e.target.value).toFixed(2);
      this.game.setGrassDensity(Number(e.target.value));
    });
    $('#gfxExposure').addEventListener('input', (e) => {
      $('#gfxExposureOut').textContent = Number(e.target.value).toFixed(2);
      this.game.setExposure(Number(e.target.value));
    });
    $('#gfxGrade').addEventListener('input', (e) => this.game.setGrade(Number(e.target.value)));
    // звук
    const sndMap = [
      ['sndMaster', 'master'], ['sndMusic', 'music'], ['sndSfx', 'sfx'], ['sndAmb', 'ambience'],
    ];
    for (const [id, kind] of sndMap) {
      const el = $(`#${id}`);
      el.addEventListener('input', () => {
        const v = Number(el.value);
        $(`#${id}Out`).textContent = Math.round(v * 100) + '%';
        this.game.setVolume(kind, v);
      });
    }
    $('#sndMusicOn').addEventListener('change', (e) => this.game.setMusicEnabled(e.target.checked));
    $('#snd3D').addEventListener('change', (e) => this.game.setSpatialAudio(e.target.checked));
    // управление
    $('#ctlSens').addEventListener('input', (e) => {
      $('#ctlSensOut').textContent = Number(e.target.value).toFixed(2);
      this.game.setSensitivity(Number(e.target.value));
    });
    $('#ctlBob').addEventListener('input', (e) => {
      $('#ctlBobOut').textContent = Number(e.target.value).toFixed(2);
      this.game.setHeadBob(Number(e.target.value));
    });
    $('#ctlInvertY').addEventListener('change', (e) => this.game.setInvertY(e.target.checked));
    $('#resetKeys').addEventListener('click', () => this.game.resetKeybinds());
    $('#saveSettings').addEventListener('click', () => {
      this.game.saveSettings();
      this.toast('Настройки применены', 'good');
    });
    // инвентарь
    $('#baitList').addEventListener('click', (e) => {
      const buy = e.target.closest('[data-buy]');
      if (buy) {
        e.stopPropagation();
        this.game.buyBait(buy.dataset.buy, 5);
        return;
      }
      const item = e.target.closest('[data-bait]');
      if (!item) return;
      this.game.selectBait(item.dataset.bait);
    });
    $('#invSlots').addEventListener('click', (e) => {
      const slot = e.target.closest('[data-slot]');
      if (!slot) return;
      this.toast(slot.dataset.desc || slot.dataset.slot, 'good');
    });
    $('#upgradeRodBtn').addEventListener('click', () => this.game.upgradeRod());
    // клавиши
    window.addEventListener('keydown', (e) => {
      if (this.dialogActive && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        this.advanceDialog();
        return;
      }
      if (e.code === 'Escape') {
        if (this.currentModal && this.currentModal !== 'pauseModal') {
          this.closeModal(this.currentModal);
        } else if (this.game.state === 'playing') {
          this.game.togglePause();
        }
      }
    });
  }

  _buildKeybinds() {
    const list = $('#keybindList');
    if (!list) return;
    const actions = [
      ['forward', 'Вперёд'], ['back', 'Назад'], ['left', 'Влево'], ['right', 'Вправо'],
      ['jump', 'Прыжок'], ['run', 'Бег'], ['crouch', 'Присесть'], ['interact', 'Действие'],
      ['rod', 'Удочка'], ['inventory', 'Инвентарь'], ['journal', 'Журнал'], ['view', 'Вид'],
    ];
    list.innerHTML = actions
      .map(([id, name]) => `<div class="keybind" data-kb="${id}"><span>${name}</span><span class="k">${this.game.keybinds[id] || '—'}</span></div>`)
      .join('');
    list.addEventListener('click', (e) => {
      const kb = e.target.closest('[data-kb]');
      if (!kb) return;
      kb.classList.add('listening');
      kb.querySelector('.k').textContent = '…';
      const handler = (ev) => {
        ev.preventDefault();
        window.removeEventListener('keydown', handler, true);
        kb.classList.remove('listening');
        const label = ev.code.replace('Key', '').replace('Arrow', '↕');
        this.game.keybinds[kb.dataset.kb] = ev.code;
        kb.querySelector('.k').textContent = label;
        this.game.audio?.sfx('ui_click');
        this.game.saveSettings();
      };
      window.addEventListener('keydown', handler, true);
    });
  }

  _buildCompass() {
    const strip = $('#compassStrip');
    if (!strip) return;
    const dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
    let html = '';
    for (let r = 0; r < 5; r++) {
      for (let i = 0; i < 8; i++) {
        const card = i === 0 ? ' card' : '';
        html += `<span class="${card.trim()}">${dirs[i]}</span>`;
      }
    }
    strip.innerHTML = html;
  }

  _buildHotbar() {
    const bar = $('#hotbar');
    if (!bar) return;
    const items = [
      { key: '1', name: 'Удочка', icon: '🎣', id: 'rod' },
      { key: '2', name: 'Червь', icon: '🪱', id: 'bait' },
      { key: '3', name: 'Садок', icon: '🪣', id: 'bucket' },
      { key: '4', name: 'Фонарь', icon: '🔦', id: 'lamp' },
      { key: '5', name: 'Карта', icon: '🗺️', id: 'map' },
    ];
    bar.innerHTML = items
      .map((it, i) => `<div class="slot${i === 0 ? ' active' : ''}" data-hot="${it.id}"><span class="kb">${it.key}</span>${it.icon}</div>`)
      .join('');
  }

  // ------------------------------------------------------------ базовое
  setLoadProgress(pct, text, tip) {
    $('#loadFill').style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (text) $('#loadStatus').textContent = text;
    if (tip) $('#loadTip').textContent = tip;
  }

  showLoading(on) {
    $('#loading').classList.toggle('show', on);
    if (!on) $('#loading').classList.add('hidden');
  }

  showMenu() {
    $('#menu').classList.remove('hidden');
    $('#menu').classList.add('show');
    $('#hud').classList.add('hidden');
  }

  hideMenu() {
    $('#menu').classList.remove('show');
    $('#menu').classList.add('hidden');
  }

  showHUD(on) {
    $('#hud').classList.toggle('hidden', !on);
  }

  openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('show'));
    this.currentModal = id;
    if (id === 'settingsModal') this.syncSettings();
    if (id === 'inventoryModal') this.refreshInventory();
    if (id === 'journalModal') this.refreshJournal();
    if (id === 'achievementsModal') this.refreshAchievements();
    if (id === 'ideasModal') this.loadIdeas();
  }

  closeModal(id) {
    const el = document.getElementById(id || this.currentModal);
    if (!el) return;
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 250);
    if (!id || id === this.currentModal) this.currentModal = null;
    this.game.audio?.sfx('ui_back');
  }

  closeAllModals() {
    $$('.modal-overlay').forEach((m) => {
      m.classList.remove('show');
      m.classList.add('hidden');
    });
    this.currentModal = null;
  }

  toast(text, kind = '') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .4s, transform .4s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
      setTimeout(() => el.remove(), 420);
    }, 2600);
  }

  notify(text) {
    const el = $('#hudNotify');
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(this._notifyTimer);
    this._notifyTimer = setTimeout(() => (el.style.opacity = '0'), 1800);
  }

  showPrompt(text) {
    const el = $('#interactPrompt');
    if (!text) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.textContent = text;
  }

  // ------------------------------------------------------------ HUD
  updateHUD(game) {
    const { atmosphere, player, fishing, economy, quests } = game;
    const clock = $('#hudClock');
    if (clock) clock.textContent = atmosphere.clockString;
    $('#hudDay').textContent = `День ${atmosphere.day}`;
    $('#hudWeather').textContent = atmosphere.weatherLabel;
    // полоса суток: 0..24
    $('#sunBar').style.width = (atmosphere.timeOfDay / 24) * 100 + '%';
    $('#hudMoney').textContent = Math.round(economy.money).toLocaleString('ru-RU');
    $('#staminaBar').style.width = player.stamina + '%';
    $('#staminaBar').style.background =
      player.stamina < 22 ? 'linear-gradient(90deg,#d9594c,#e8886c)' : 'linear-gradient(90deg,#4fb3c4,#6fbf8c)';
    // компас
    const yawDeg = ((-player.yaw * 180) / Math.PI) % 360;
    const strip = $('#compassStrip');
    if (strip) {
      const pxPerDeg = 46 / 45;
      strip.style.transform = `translateX(${-((yawDeg + 360 * 2) % 360) * pxPerDeg + 170 - 23}px)`;
    }
    // глубина/грунт
    const px = game.camera.position.x, pz = game.camera.position.z;
    const gh = game.world.terrain.heightAt(px, pz);
    const depth = Math.max(0, -gh);
    $('#hudDepth').textContent = depth.toFixed(1) + ' м';
    const biome = game.world.terrain.biomeAt(px, pz);
    const biomes = { underwater: 'дно', sand: 'песок', grass: 'трава', forestFloor: 'лесная подстилка', rock: 'камень', marsh: 'болото' };
    $('#hudBottom').textContent = depth > 0.2 ? biomes.underwater : biomes[biome] || biome;
    $('#hudFishNear').textContent = game.nearestFishInfo || '—';
    // рыбалка
    const fp = $('#fishingPanel');
    if (game.rodEquipped) {
      fp.classList.remove('hidden');
      $('#fBait').textContent = BAIT_TYPES[fishing.bait]?.name ?? '—';
      $('#fBaitCount').textContent = '×' + (fishing.baitCount[fishing.bait] ?? 0);
      $('#fStatus').textContent = fishing.statusText;
      const ten = Math.min(1, fishing.lineTension / 1.4);
      $('#tensionBar').style.width = (ten * 100).toFixed(0) + '%';
      const fighting = fishing.state === 'fighting';
      $('#fightWrap').classList.toggle('hidden', !fighting);
      if (fighting) {
        $('#fightBar').style.width = (fishing.reelProgress * 100).toFixed(0) + '%';
        const f = fishing.hookedFish;
        $('#fishStrength').textContent = f ? `${(f.species.strength * 100).toFixed(0)}%` : '—';
      }
    } else {
      fp.classList.add('hidden');
    }
    // квест
    const q = quests.current;
    if (q) {
      $('#questTitle').textContent = q.title;
      $('#questDesc').textContent = q.desc;
      const rec = quests.active.get(q.id) || {};
      $('#questList').innerHTML = q.steps
        .map((s) => `<li class="${rec[s.id] ? 'done' : ''}">${s.label}</li>`)
        .join('');
    } else {
      $('#questTitle').textContent = 'Все задания выполнены';
      $('#questDesc').textContent = 'Залив спокоен. Ловите рыбу и исследуйте.';
      $('#questList').innerHTML = '';
    }
    // прицел
    $('#crosshair').classList.toggle('active', !!game.interactTarget);
  }

  showCatch(record) {
    const pop = $('#catchPopup');
    $('#catchTitle').textContent = 'ПОЙМАНА РЫБА';
    $('#catchName').textContent = record.name;
    $('#catchMeta').textContent = `${record.weight.toFixed(2)} кг · ${Math.round(record.length * 100)} см · ${record.price} ₽`;
    const sp = SPECIES_BY_ID[record.id];
    $('#catchNote').textContent = sp?.flavor || '';
    pop.classList.remove('hidden');
    pop.style.animation = 'none';
    void pop.offsetWidth;
    pop.style.animation = '';
    clearTimeout(this._catchTimer);
    this._catchTimer = setTimeout(() => pop.classList.add('hidden'), 4200);
  }

  showAchievement(a) {
    const pop = $('#achPopup');
    $('#achName').textContent = a.name;
    $('#achDesc').textContent = a.desc;
    $('.ach-icon').textContent = a.icon || '★';
    pop.classList.remove('hidden');
    pop.style.animation = 'none';
    void pop.offsetWidth;
    pop.style.animation = '';
    clearTimeout(this._achTimer);
    this._achTimer = setTimeout(() => pop.classList.add('hidden'), 4800);
  }

  // ------------------------------------------------------------ меню-статы
  updateMenuStats(game) {
    $('#mDay').textContent = game.atmosphere.day;
    $('#mClock').textContent = game.atmosphere.clockString;
    $('#mWeather').textContent = game.atmosphere.weatherLabel;
    $('#mFish').textContent = game.stats.totalCatches;
    $('#mSpecies').textContent = `${game.stats.speciesSet.size} / 12`;
    $('#mMoney').textContent = Math.round(game.economy.money).toLocaleString('ru-RU') + ' ₽';
    $('#versionTag').textContent = 'v1.0.0';
    $('#saveInfo').textContent = game.hasSave ? 'сохранение найдено' : 'сохранений нет';
    const contBtn = document.querySelector('[data-act="continue"]');
    if (contBtn) contBtn.disabled = !game.hasSave;
    $('#menuHint').textContent = game.atmosphere.weatherLabel === 'Гроза'
      ? 'На воде гроза — будьте осторожны.'
      : 'Тихий Залив ждёт. Возьмите удочку на причале.';
    this._syncQualityButtons(game.quality);
  }

  _syncQualityButtons(q) {
    $$('#qualitySeg button').forEach((b) => b.classList.toggle('active', b.dataset.q === q));
    $$('#gfxQuality button').forEach((b) => b.classList.toggle('active', b.dataset.q === q));
    const hint = $('#qualityHint');
    if (hint) {
      const p = QUALITY_PRESETS[q];
      if (p) hint.textContent = `${p.label}: тени ${p.shadows ? 'вкл' : 'выкл'}, SSAO ${p.ssao ? 'вкл' : 'выкл'}, Bloom ${p.bloom ? 'вкл' : 'выкл'}, Tilt-Shift ${p.dof ? 'вкл' : 'выкл'}, отражения ${p.reflections ? 'вкл' : 'выкл'}.`;
    }
  }

  syncSettings() {
    const g = this.game;
    $('#gfxScale').value = g.gfxScale;
    $('#gfxScaleOut').textContent = Number(g.gfxScale).toFixed(2);
    $('#gfxShadows').checked = g.pipeline.preset.shadows;
    $('#gfxSSAO').checked = !!g.pipeline.gtao;
    $('#gfxBloom').checked = !!g.pipeline.bloom;
    $('#gfxDOF').checked = !!g.pipeline.bokeh;
    $('#gfxReflect').checked = g.settings.reflections !== false;
    $('#ctlSens').value = g.sensitivity;
    $('#ctlSensOut').textContent = Number(g.sensitivity).toFixed(2);
    $('#ctlInvertY').checked = !!g.invertY;
    for (const [id, kind] of [['sndMaster', 'master'], ['sndMusic', 'music'], ['sndSfx', 'sfx'], ['sndAmb', 'ambience']]) {
      const v = g.audio?.volumes[kind] ?? 0.8;
      $(`#${id}`).value = v;
      $(`#${id}Out`).textContent = Math.round(v * 100) + '%';
    }
    this._syncQualityButtons(g.quality);
    // клавиши
    $$('#keybindList .keybind').forEach((kb) => {
      const k = g.keybinds[kb.dataset.kb];
      if (k) kb.querySelector('.k').textContent = k.replace('Key', '').replace('Arrow', '↕');
    });
  }

  // ------------------------------------------------------------ инвентарь
  refreshInventory() {
    const g = this.game;
    const f = g.fishing;
    // наживка
    $('#baitList').innerHTML = Object.values(BAIT_TYPES)
      .map(
        (b) => `<div class="bait-item ${f.bait === b.id ? 'active' : ''}" data-bait="${b.id}" title="${b.desc}">
          <span>${b.name}</span>
          <span class="bc">×${f.baitCount[b.id] ?? 0}</span>
          <button class="buy" data-buy="${b.id}" title="Купить 5 шт.">+5</button>
        </div>`
      )
      .join('');
    // рюкзак
    const slots = [
      { n: 'Удочка', ic: '🎣', desc: `${f.rod.name}: сила ${f.rod.power}, дальность ${f.rod.castDist} м` },
      { n: 'Сачок', ic: '🥅', desc: 'Сачок для бережного вынимания рыбы' },
      { n: 'Фонарь', ic: '🔦', desc: 'Фонарь для ночной рыбалки' },
      { n: 'Термос', ic: '☕', desc: 'Термос с чаем. Восстанавливает силы.' },
      { n: 'Компас', ic: '🧭', desc: 'Незаменим в тумане' },
      { n: 'Кружка', ic: '🥤', desc: 'Металлическая кружка деда' },
      { n: 'Карта', ic: '🗺️', desc: 'Карта Тихого Залива' },
      { n: 'Нож', ic: '🔪', desc: 'Разделочный нож' },
      { n: 'Верёвка', ic: '🪢', desc: 'Пеньковый трос, 12 метров' },
      { n: 'Сеть', ic: '🕸️', desc: 'Ставная сеть (запрещена)' },
    ];
    $('#invSlots').innerHTML = slots
      .map(
        (s) => `<div class="inv-slot" data-slot="${s.n}" data-desc="${s.desc}">
          <span class="ic">${s.ic}</span><span style="font-size:9px;opacity:.7">${s.n}</span>
        </div>`
      )
      .join('');
    // снасти
    $('#rodName').textContent = f.rod.name;
    $('#rodDesc').textContent = f.rod.desc;
    $('#rodStats').innerHTML = `<span>сила <b>${f.rod.power.toFixed(2)}</b></span><span>дальность <b>${f.rod.castDist} м</b></span><span>катушка <b>${f.rod.reelSpeed.toFixed(2)}</b></span>`;
    const next = ROD_LEVELS[f.rodLevel + 1];
    const btn = $('#upgradeRodBtn');
    if (next) {
      btn.textContent = `Улучшить — ${next.price} ₽`;
      btn.disabled = g.economy.money < next.price;
    } else {
      btn.textContent = 'Максимальный уровень';
      btn.disabled = true;
    }
    // садок
    const catches = f.catches.slice(-14).reverse();
    $('#catchList').innerHTML = catches.length
      ? catches.map((c) => `<div class="catch-item"><span>${c.name} · ${c.weight.toFixed(2)} кг</span><b>${c.price} ₽</b></div>`).join('')
      : '<div class="catch-item"><span>Садок пуст</span></div>';
    $('#invMoney').textContent = Math.round(g.economy.money).toLocaleString('ru-RU') + ' ₽';
  }

  // ------------------------------------------------------------ журнал
  refreshJournal() {
    const g = this.game;
    const s = g.stats;
    $('#fishGrid').innerHTML = SPECIES.map((sp) => {
      const caught = s.speciesSet.has(sp.id);
      const best = s.speciesBest[sp.id];
      return `<div class="fish-card ${caught ? '' : 'locked'} rarity-${sp.rarity}">
        <div class="fc-name">${caught ? sp.name : '???'}
          <span class="fc-badge">${'★'.repeat(Math.min(6, Math.ceil(sp.rarity / 1)))}</span>
        </div>
        <div class="fc-latin">${sp.latin}</div>
        <div class="fc-desc">${caught ? sp.description : 'Вид ещё не открыт. Ищите в подходящем месте, глубине и время.'}</div>
        <div class="fc-stats">
          <span>вес ${sp.weightRange[0]}–${sp.weightRange[1]} кг</span>
          <span>${best ? 'рекорд ' + best.toFixed(2) + ' кг' : 'рекорда нет'}</span>
        </div>
      </div>`;
    }).join('');
    // задания
    $('#questCards').innerHTML = QUESTS.map((q) => {
      const active = g.quests.active.has(q.id);
      const done = g.quests.completed.has(q.id);
      if (!active && !done) return '';
      const rec = g.quests.active.get(q.id) || {};
      const steps = q.steps.map((st) => `<div style="font-size:11px;color:${rec[st.id] || done ? '#6fbf8c' : '#7d94a1'};margin-top:4px">${rec[st.id] || done ? '✓' : '○'} ${st.label}</div>`).join('');
      return `<div class="quest-card ${done ? 'done' : ''}">
        <div class="qc-t">${q.title}${done ? ' — выполнено' : ''}</div>
        <div class="qc-d">${q.desc}</div>${steps}
        ${q.reward ? `<div class="qc-d" style="color:#c8a15c;margin-top:8px">Награда: ${q.reward.money || 0} ₽${q.reward.baits ? ' + наживка' : ''}</div>` : ''}
      </div>`;
    }).join('') || '<div class="hint">Пока нет активных заданий.</div>';
    // записки
    $('#notesList').innerHTML = g.notes
      .map((n) => `<div class="note">«${n.text}»<div style="margin-top:8px;font-size:10px;color:#8d7340;font-style:normal">— ${n.author}</div></div>`)
      .join('');
    // статистика
    const boxes = [
      ['Поймано рыб', s.totalCatches],
      ['Видов открыто', `${s.speciesSet.size} / 12`],
      ['Самый крупный', s.biggestWeight ? s.biggestWeight.toFixed(2) + ' кг' : '—'],
      ['Заработано всего', Math.round(s.totalEarned).toLocaleString('ru-RU') + ' ₽'],
      ['Забросов сделано', s.casts],
      ['Пройдено пешком', Math.round(s.walkDistance) + ' м'],
      ['Пройдено на лодке', Math.round(s.boatDistance) + ' м'],
      ['Ночей в заливе', g.atmosphere.day],
      ['Дней в заливе', g.atmosphere.day],
      ['Островов посещено', `${s.islandsVisited.size} / 6`],
      ['Опыт', s.skill.toFixed(1)],
      ['Достижений', `${g.achievements.unlocked.size} / ${ACHIEVEMENTS.length}`],
    ];
    $('#statsGrid').innerHTML = boxes
      .map(([l, v]) => `<div class="stat-box"><div class="sb-l">${l}</div><div class="sb-v">${v}</div></div>`)
      .join('');
  }

  refreshAchievements() {
    const g = this.game;
    $('#achGrid').innerHTML = ACHIEVEMENTS.map((a) => {
      const un = g.achievements.unlocked.has(a.id);
      return `<div class="ach-card ${un ? 'unlocked' : ''}">
        <div class="ai">${un ? a.icon : '🔒'}</div>
        <div><div class="an">${a.name}</div><div class="ad">${a.desc}</div></div>
      </div>`;
    }).join('');
    $('#achProgress').textContent = g.achievements.progress;
  }

  async loadIdeas() {
    const list = $('#ideasList');
    if (!list || list.dataset.loaded) return;
    const ideas = IDEAS_CATALOG.ideas || IDEAS_CATALOG;
    list.innerHTML = ideas
      .slice(0, 100)
      .map(
        (i, idx) => `<div class="idea ${i.rank === 1 ? 'winner' : ''}">
          <div class="i-n">№${String(i.rank ?? idx + 1).padStart(3, '0')}${i.total ? ' · ' + i.total.toFixed(1) : ''}</div>
          <div class="i-t">${i.title}</div>
          <div class="i-p">${i.pitch}</div>
        </div>`
      )
      .join('');
    list.dataset.loaded = '1';
  }

  // ------------------------------------------------------------ диалоги
  showDialog(lines) {
    this.dialogQueue = lines.slice();
    this.dialogActive = true;
    $('#dialog').classList.remove('hidden');
    this._nextDialogLine();
  }

  _nextDialogLine() {
    const line = this.dialogQueue.shift();
    if (!line) {
      $('#dialog').classList.add('hidden');
      this.dialogActive = false;
      return;
    }
    $('#dialogName').textContent = line.name || 'Голос залива';
    const el = $('#dialogText');
    el.textContent = '';
    let i = 0;
    clearInterval(this._typeTimer);
    this._typeTimer = setInterval(() => {
      el.textContent = line.text.slice(0, ++i);
      if (i >= line.text.length) clearInterval(this._typeTimer);
    }, 18);
  }

  advanceDialog() {
    if (!this.dialogActive) return;
    // если печатается — показать сразу
    const target = this.dialogQueue[0];
    const el = $('#dialogText');
    if (this._typeTimer) {
      clearInterval(this._typeTimer);
      this._typeTimer = null;
      if (target && el.textContent.length < target.text.length) {
        el.textContent = target.text;
        return;
      }
    }
    this._nextDialogLine();
  }
}
