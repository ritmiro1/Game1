// ============================================================================
//  Квесты и достижения. Полностью на русском, с проверкой условий по
//  состоянию игры (рыба, деньги, исследование, время суток).
// ============================================================================

export const QUESTS = [
  {
    id: 'first_catch',
    title: 'Первая рыба',
    desc: 'Возьмите удочку (F) и поймайте любую рыбу с причала или с лодки.',
    steps: [{ id: 'catch1', label: 'Поймать рыбу', check: (s) => s.totalCatches >= 1 }],
    reward: { money: 60, baits: { worm: 10 } },
    hint: 'Нажмите ЛКМ и удерживайте, затем отпустите — заброс. Дождитесь поклёвки и снова ЛКМ.',
  },
  {
    id: 'three_species',
    title: 'Разнообразие улова',
    desc: 'Поймайте три разных вида рыб — залив щедр к любопытным.',
    steps: [{ id: 'species3', label: 'Открыть 3 вида', check: (s) => s.speciesCaught >= 3 }],
    reward: { money: 150, baits: { corn: 10, dough: 10 } },
  },
  {
    id: 'lighthouse_trip',
    title: 'Огонь на утёсе',
    desc: 'Доберитесь до маяка на Маячном утёсе и осмотрите его.',
    steps: [{ id: 'visit_lh', label: 'Подойти к маяку', check: (s) => s.visitedLighthouse }],
    reward: { money: 220, baits: { spinner: 1 } },
    hint: 'Сядьте в лодку на причале (E) и правьте на северо-восток.',
  },
  {
    id: 'night_fishing',
    title: 'Ночной лов',
    desc: 'Поймайте рыбу после 21:00 — у ночи свой улов.',
    steps: [{ id: 'night', label: 'Поймать рыбу ночью', check: (s) => s.caughtAtNight }],
    reward: { money: 260, baits: { livebait: 3 } },
  },
  {
    id: 'big_fish',
    title: 'Трофей',
    desc: 'Поймайте рыбу весом более 3 кг.',
    steps: [{ id: 'big', label: 'Трофей 3+ кг', check: (s) => s.biggestWeight >= 3 }],
    reward: { money: 400, baits: { livebait: 5 } },
  },
  {
    id: 'moonfish_hunt',
    title: 'Легенда залива',
    desc: 'Поймайте Лунную рыбу в тумане. Без лунной приманки её не взять.',
    steps: [{ id: 'moon', label: 'Поймать Лунную рыбу', check: (s) => s.speciesSet.has('moonfish') }],
    reward: { money: 1200, baits: { moonbait: 1 } },
    hint: 'Лунная приманка продаётся в мастерской после 5 видов рыб.',
    secret: true,
  },
  {
    id: 'all_islands',
    title: 'Картограф',
    desc: 'Посетите все 6 крупных островов архипелага.',
    steps: [{ id: 'islands', label: 'Побывать на 6 островах', check: (s) => s.islandsVisited.size >= 6 }],
    reward: { money: 500, baits: { worm: 40 } },
  },
  {
    id: 'storm_ride',
    title: 'Сквозь грозу',
    desc: 'Пройдите на лодке не меньше 200 метров во время грозы.',
    steps: [{ id: 'storm', label: 'Плавание в грозу', check: (s) => s.stormDistance >= 200 }],
    reward: { money: 320, baits: { spinner: 1 } },
  },
];

export const ACHIEVEMENTS = [
  { id: 'first_cast', name: 'Первый заброс', desc: 'Сделайте свой первый заброс.', icon: '🎣', check: (s) => s.casts >= 1 },
  { id: 'first_fish', name: 'Есть контакт', desc: 'Поймайте первую рыбу.', icon: '🐟', check: (s) => s.totalCatches >= 1 },
  { id: 'ten_fish', name: 'Рыбак', desc: 'Поймайте 10 рыб.', icon: '🎏', check: (s) => s.totalCatches >= 10 },
  { id: 'fifty_fish', name: 'Мастер удочки', desc: 'Поймайте 50 рыб.', icon: '🏆', check: (s) => s.totalCatches >= 50 },
  { id: 'all_species', name: 'Ихтиолог', desc: 'Откройте все 12 видов рыб.', icon: '📖', check: (s) => s.speciesSet.size >= 12 },
  { id: 'trophy', name: 'Трофей', desc: 'Поймайте рыбу тяжелее 5 кг.', icon: '🥇', check: (s) => s.biggestWeight >= 5 },
  { id: 'rich', name: 'Залив платит', desc: 'Заработайте 3000 ₽.', icon: '💰', check: (s) => s.totalEarned >= 3000 },
  { id: 'night_owl', name: 'Ночная смена', desc: 'Поймайте 5 рыб ночью.', icon: '🌙', check: (s) => s.nightCatches >= 5 },
  { id: 'explorer', name: 'Исследователь', desc: 'Посетите 6 островов.', icon: '🗺️', check: (s) => s.islandsVisited.size >= 6 },
  { id: 'lighthouse', name: 'Свет в тумане', desc: 'Дойдите до маяка.', icon: '🗼', check: (s) => s.visitedLighthouse },
  { id: 'legend', name: 'Легенда', desc: 'Поймайте Лунную рыбу.', icon: '🌕', check: (s) => s.speciesSet.has('moonfish') },
  { id: 'storm', name: 'Штормовой капитан', desc: 'Пройдите 200 м в грозу.', icon: '⛈️', check: (s) => s.stormDistance >= 200 },
  { id: 'rod_max', name: 'Полный комплект', desc: 'Улучшите удочку до максимума.', icon: '⚙️', check: (s) => s.rodLevel >= 3 },
  { id: 'night_ride', name: 'Огни на воде', desc: 'Прокатитесь на лодке ночью.', icon: '🚤', check: (s) => s.nightBoatRide },
];

export class QuestSystem {
  constructor() {
    this.active = new Map(); // id -> { progress }
    this.completed = new Set();
    this.active.set('first_catch', {});
    this.events = {};
    this.defs = QUESTS;
  }

  on(n, cb) { this.events[n] = cb; return this; }
  emit(n, p) { this.events[n]?.(p); }

  get list() {
    return this.defs.filter((q) => this.active.has(q.id) || this.completed.has(q.id));
  }

  get current() {
    for (const q of this.defs) if (this.active.has(q.id)) return q;
    return null;
  }

  stepDone(q, stepId) {
    const rec = this.active.get(q.id);
    if (!rec) return false;
    return !!rec[stepId];
  }

  /** Проверка всех квестов — вызывать при изменениях. */
  update(state) {
    for (const q of [...this.defs]) {
      if (!this.active.has(q.id) || this.completed.has(q.id)) continue;
      const rec = this.active.get(q.id);
      let allDone = true;
      for (const step of q.steps) {
        if (!rec[step.id] && step.check(state)) {
          rec[step.id] = true;
          this.emit('step', { quest: q, step });
        }
        if (!rec[step.id]) allDone = false;
      }
      if (allDone) {
        this.completed.add(q.id);
        this.active.delete(q.id);
        this.emit('completed', q);
      }
    }
    // открытие новых квестов по мере прогресса
    this._unlock(state);
  }

  _unlock(state) {
    if (state.totalCatches >= 2 && !this.active.has('three_species') && !this.completed.has('three_species')) this.active.set('three_species', {});
    if (state.totalCatches >= 1 && !this.active.has('lighthouse_trip') && !this.completed.has('lighthouse_trip')) this.active.set('lighthouse_trip', {});
    if (state.totalCatches >= 3 && !this.active.has('night_fishing') && !this.completed.has('night_fishing')) this.active.set('night_fishing', {});
    if (state.biggestWeight >= 1.2 && !this.active.has('big_fish') && !this.completed.has('big_fish')) this.active.set('big_fish', {});
    if (state.speciesSet.size >= 4 && !this.active.has('all_islands') && !this.completed.has('all_islands')) this.active.set('all_islands', {});
    if (state.speciesSet.size >= 5 && !this.active.has('moonfish_hunt') && !this.completed.has('moonfish_hunt')) this.active.set('moonfish_hunt', {});
    if (state.boatDistance >= 400 && !this.active.has('storm_ride') && !this.completed.has('storm_ride')) this.active.set('storm_ride', {});
  }
}

export class AchievementSystem {
  constructor() {
    this.unlocked = new Set();
    this.defs = ACHIEVEMENTS;
    this.events = {};
  }

  on(n, cb) { this.events[n] = cb; return this; }
  emit(n, p) { this.events[n]?.(p); }

  update(state) {
    for (const a of this.defs) {
      if (this.unlocked.has(a.id)) continue;
      let ok = false;
      try {
        ok = a.check(state);
      } catch (e) {
        ok = false;
      }
      if (ok) {
        this.unlocked.add(a.id);
        this.emit('unlocked', a);
      }
    }
  }

  get progress() {
    return `${this.unlocked.size} / ${this.defs.length}`;
  }
}
