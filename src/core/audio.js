// ============================================================================
//  Звуковой движок: полностью процедурный (без внешних файлов).
//  • Многослойная динамическая музыка (4 состояния, плавные переходы)
//  • 3D-позиционные эффекты (WebAudio PannerNode) + реверберация
//  • Синтез воды, дождя, ветра, двигателя, шагов, удочки, птиц, сверчков
// ============================================================================

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

// Гаммы
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = true;
    this.volumes = { master: 0.85, music: 0.62, sfx: 0.85, ambience: 0.7 };
    this.state = 'explore'; // explore | night | tension | victory
    this.musicLayers = {};
    this.musicEnabled = true;
    this.sfxCache = new Map();
    this._listeners = [];
    this._lastStep = 0;
    this._birdsTimer = 4;
    this._cricketsTimer = 2;
    this._ambienceNodes = {};
    this._started = false;
  }

  /** Требуется пользовательский жест — вызывать из обработчика клика. */
  async init() {
    if (this.ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;

    // --- Мастер-шина
    this.master = ctx.createGain();
    this.master.gain.value = this.volumes.master;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 3.2;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.22;
    this.master.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    // --- Шины
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.volumes.music;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.volumes.sfx;
    this.sfxBus.connect(this.master);

    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = this.volumes.ambience;
    this.ambienceBus.connect(this.master);

    // --- Реверберация (импульсный отклик генерируется шумом)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(2.9, 2.4);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.34;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    // --- Буферы шума
    this.noiseBuffer = this._makeNoise(2.2, 'white');
    this.pinkBuffer = this._makeNoise(3.0, 'pink');
    this.brownBuffer = this._makeNoise(3.0, 'brown');

    // --- 3D-слушатель
    ctx.listener.setPosition(0, 1.6, 0);
    if (ctx.listener.forwardX) {
      ctx.listener.forwardX.value = 0;
      ctx.listener.forwardY.value = 0;
      ctx.listener.forwardZ.value = -1;
      ctx.listener.upX.value = 0;
      ctx.listener.upY.value = 1;
      ctx.listener.upZ.value = 0;
    }

    this.ready = true;
    this._buildAmbienceBeds();
    this._startMusic();
    this._started = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ------------------------------------------------------------ служебное
  _makeNoise(seconds, type = 'white') {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'white') d[i] = w;
        else if (type === 'pink') {
          b0 = 0.99765 * b0 + w * 0.0990460;
          b1 = 0.96300 * b1 + w * 0.2965164;
          b2 = 0.57000 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
      // плавные края — без щелчков при зацикливании
      const fade = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        d[i] *= k;
        d[len - 1 - i] *= k;
      }
    }
    return buf;
  }

  _makeImpulse(seconds = 2.5, decay = 2.0) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // ранние отражения + затухающий шум
        const env = Math.pow(1 - t, decay);
        const early = i < rate * 0.09 && Math.random() > 0.986 ? (Math.random() * 2 - 1) * 0.9 : 0;
        d[i] = ((Math.random() * 2 - 1) * 0.55 * env + early * env) * 0.9;
      }
    }
    return buf;
  }

  _now() {
    return this.ctx.currentTime;
  }

  /** PannerNode для 3D-позиции. */
  _makePanner(pos = null, refDist = 6, maxDist = 120, rolloff = 1.1) {
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDist;
    p.maxDistance = maxDist;
    p.rolloffFactor = rolloff;
    p.coneInnerAngle = 360;
    if (pos) this.setPannerPos(p, pos);
    return p;
  }

  setPannerPos(panner, pos) {
    const ctx = this.ctx;
    if (panner.positionX) {
      panner.positionX.setTargetAtTime(pos.x, ctx.currentTime, 0.02);
      panner.positionY.setTargetAtTime(pos.y, ctx.currentTime, 0.02);
      panner.positionZ.setTargetAtTime(pos.z, ctx.currentTime, 0.02);
    } else {
      panner.setPosition(pos.x, pos.y, pos.z);
    }
  }

  /** Обновление слушателя (камера). */
  updateListener(camera) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const l = ctx.listener;
    const p = camera.position;
    l.positionX?.setTargetAtTime(p.x, ctx.currentTime, 0.03);
    l.positionY?.setTargetAtTime(p.y, ctx.currentTime, 0.03);
    l.positionZ?.setTargetAtTime(p.z, ctx.currentTime, 0.03);
    if (!this._listenerDir) {
      this._listenerDir = new THREE_V3();
      this._listenerUp = new THREE_V3(0, 1, 0);
    }
    const dir = this._listenerDir;
    camera.getWorldDirection(dir);
    const up = this._listenerUp;
    if (l.forwardX) {
      l.forwardX.setTargetAtTime(dir.x, ctx.currentTime, 0.03);
      l.forwardY.setTargetAtTime(dir.y, ctx.currentTime, 0.03);
      l.forwardZ.setTargetAtTime(dir.z, ctx.currentTime, 0.03);
      l.upX.setTargetAtTime(up.x, ctx.currentTime, 0.03);
      l.upY.setTargetAtTime(up.y, ctx.currentTime, 0.03);
      l.upZ.setTargetAtTime(up.z, ctx.currentTime, 0.03);
    }
  }

  setVolume(kind, value) {
    this.volumes[kind] = value;
    if (!this.ready) return;
    const t = this._now();
    if (kind === 'master') this.master.gain.setTargetAtTime(value, t, 0.08);
    if (kind === 'music') this.musicBus.gain.setTargetAtTime(value * 0.8, t, 0.08);
    if (kind === 'sfx') this.sfxBus.gain.setTargetAtTime(value, t, 0.08);
    if (kind === 'ambience') this.ambienceBus.gain.setTargetAtTime(value, t, 0.08);
  }

  // ------------------------------------------------------------ СИНТЕЗ
  /** Общий «голос»: осциллятор -> фильтр -> АДСР -> шина. */
  _tone({ freq = 440, type = 'sine', attack = 0.01, decay = 0.2, sustain = 0.001, release = 0.3, gain = 0.2, detune = 0, filter = null, bus = null, when = 0, pan = null, reverbSend = 0.25, glideTo = null }) {
    if (!this.ready || !this.enabled) return null;
    const ctx = this.ctx;
    const t0 = (when || this._now()) + 0.001;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + attack + decay);
    if (detune) osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * sustain), t0 + attack + decay);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + release);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.setValueAtTime(filter.freq ?? 1400, t0);
      if (filter.sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, filter.sweepTo), t0 + (filter.sweepTime ?? attack + decay));
      f.Q.value = filter.q ?? 0.7;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    const out = bus || this.sfxBus;
    if (pan !== null) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(out);
    } else {
      g.connect(out);
    }
    if (reverbSend > 0) {
      const rg = ctx.createGain();
      rg.gain.value = reverbSend;
      g.connect(rg);
      rg.connect(this.reverb);
    }
    osc.start(t0);
    osc.stop(t0 + attack + decay + release + 0.05);
    return { osc, gain: g };
  }

  /** Шумовой всплеск (вода, ветер, шаги). */
  _noiseBurst({ duration = 0.3, gain = 0.25, type = 'bandpass', freq = 900, q = 1.0, sweepTo = null, buffer = null, when = 0, pan = null, bus = null, attack = 0.004, reverbSend = 0.2 }) {
    if (!this.ready || !this.enabled) return null;
    const ctx = this.ctx;
    const t0 = (when || this._now()) + 0.001;
    const src = ctx.createBufferSource();
    src.buffer = buffer || this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + duration);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(f);
    f.connect(g);
    const out = bus || this.sfxBus;
    if (pan !== null) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(out);
    } else g.connect(out);
    if (reverbSend > 0) {
      const rg = ctx.createGain();
      rg.gain.value = reverbSend;
      g.connect(rg);
      rg.connect(this.reverb);
    }
    src.start(t0, Math.random() * 1.5, duration + 0.05);
    return { src, gain: g };
  }

  // ------------------------------------------------------------ SFX API
  sfx(name, opts = {}) {
    if (!this.ready || !this.enabled) return;
    const pos = opts.pos || null;
    const busGain = this.ctx.createGain();
    if (pos) {
      const panner = this._makePanner(pos, opts.refDist ?? 8, 160, 1.2);
      busGain.connect(panner);
      panner.connect(this.sfxBus);
    } else {
      busGain.connect(this.sfxBus);
    }
    const prev = this._activeOut;
    this._activeOut = busGain;
    const vol = opts.volume ?? 1;
    switch (name) {
      case 'ui_click':
        this._tone({ freq: 1180, type: 'triangle', attack: 0.002, decay: 0.045, gain: 0.14 * vol, release: 0.05, bus: busGain, reverbSend: 0.12 });
        this._tone({ freq: 1760, type: 'sine', attack: 0.002, decay: 0.03, gain: 0.06 * vol, release: 0.04, bus: busGain, reverbSend: 0.1 });
        break;
      case 'ui_hover':
        this._tone({ freq: 720, type: 'sine', attack: 0.004, decay: 0.04, gain: 0.05 * vol, release: 0.06, bus: busGain, reverbSend: 0.05 });
        break;
      case 'ui_back':
        this._tone({ freq: 620, type: 'triangle', attack: 0.003, decay: 0.08, gain: 0.1 * vol, release: 0.1, bus: busGain, glideTo: 380, reverbSend: 0.15 });
        break;
      case 'ui_bell':
        [0, 4, 7, 12].forEach((semi, i) =>
          this._tone({ freq: NOTE(72 + semi), type: 'sine', attack: 0.01, decay: 0.5, gain: (0.09 / (i + 1)) * vol, release: 1.0, bus: busGain, when: this._now() + i * 0.075, reverbSend: 0.45 })
        );
        break;
      case 'achievement':
        [0, 7, 12, 16, 19, 24].forEach((semi, i) =>
          this._tone({ freq: NOTE(64 + semi), type: 'triangle', attack: 0.005, decay: 0.4, gain: (0.1 / (1 + i * 0.4)) * vol, release: 0.9, bus: busGain, when: this._now() + i * 0.09, reverbSend: 0.6 })
        );
        break;
      case 'cast':
        // свист лески + всплеск приманки
        this._noiseBurst({ duration: 0.55, gain: 0.12 * vol, type: 'bandpass', freq: 2600, sweepTo: 900, q: 2.2, bus: busGain, reverbSend: 0.3 });
        this._tone({ freq: 900, type: 'sine', attack: 0.05, decay: 0.4, gain: 0.03 * vol, release: 0.2, glideTo: 1600, bus: busGain, reverbSend: 0.2 });
        break;
      case 'splash':
        this._noiseBurst({ duration: 0.5, gain: 0.2 * vol, type: 'lowpass', freq: 2400, sweepTo: 300, q: 0.9, bus: busGain, reverbSend: 0.4 });
        this._noiseBurst({ duration: 0.22, gain: 0.12 * vol, type: 'highpass', freq: 3200, sweepTo: 1400, q: 1.2, bus: busGain, reverbSend: 0.3 });
        break;
      case 'splash_big':
        this._noiseBurst({ duration: 0.9, gain: 0.3 * vol, type: 'lowpass', freq: 3000, sweepTo: 180, q: 0.8, bus: busGain, reverbSend: 0.5 });
        this._noiseBurst({ duration: 0.4, gain: 0.16 * vol, type: 'bandpass', freq: 1800, sweepTo: 600, q: 1.5, bus: busGain, reverbSend: 0.4 });
        break;
      case 'reel':
        // трещотка катушки
        for (let i = 0; i < 7; i++) {
          this._noiseBurst({ duration: 0.02, gain: 0.09 * vol, type: 'highpass', freq: 3200, q: 2, bus: busGain, when: this._now() + i * 0.055, reverbSend: 0.08 });
          this._tone({ freq: 2200 + Math.random() * 400, type: 'square', attack: 0.001, decay: 0.012, gain: 0.02 * vol, release: 0.02, bus: busGain, when: this._now() + i * 0.055, reverbSend: 0.05 });
        }
        break;
      case 'reel_tick':
        this._noiseBurst({ duration: 0.015, gain: 0.05 * vol, type: 'highpass', freq: 4200, q: 2, bus: busGain, reverbSend: 0.05 });
        break;
      case 'line_tension':
        // скрип лески
        this._tone({ freq: 320, type: 'sawtooth', attack: 0.06, decay: 0.3, gain: 0.035 * vol, release: 0.3, filter: { type: 'bandpass', freq: 1200, q: 6 }, bus: busGain, reverbSend: 0.25 });
        break;
      case 'hookset':
        this._tone({ freq: 180, type: 'triangle', attack: 0.004, decay: 0.14, gain: 0.18 * vol, release: 0.2, glideTo: 90, bus: busGain, reverbSend: 0.2 });
        this._noiseBurst({ duration: 0.12, gain: 0.12 * vol, type: 'bandpass', freq: 1600, q: 1.4, bus: busGain, reverbSend: 0.2 });
        break;
      case 'fish_flop':
        for (let i = 0; i < 3; i++) {
          this._noiseBurst({ duration: 0.11, gain: 0.14 * vol, type: 'bandpass', freq: 700 + Math.random() * 500, q: 1.6, bus: busGain, when: this._now() + i * 0.16, reverbSend: 0.15 });
        }
        break;
      case 'footstep_wood':
        this._noiseBurst({ duration: 0.11, gain: 0.14 * vol, type: 'bandpass', freq: 420 + Math.random() * 120, q: 1.8, bus: busGain, reverbSend: 0.12 });
        this._tone({ freq: 120 + Math.random() * 30, type: 'sine', attack: 0.003, decay: 0.09, gain: 0.06 * vol, release: 0.1, bus: busGain });
        break;
      case 'footstep_grass':
        this._noiseBurst({ duration: 0.16, gain: 0.11 * vol, type: 'highpass', freq: 1800 + Math.random() * 800, q: 0.8, bus: busGain, reverbSend: 0.08 });
        break;
      case 'footstep_sand':
        this._noiseBurst({ duration: 0.2, gain: 0.1 * vol, type: 'bandpass', freq: 1600, q: 0.6, bus: busGain, reverbSend: 0.06 });
        break;
      case 'footstep_stone':
        this._noiseBurst({ duration: 0.09, gain: 0.13 * vol, type: 'bandpass', freq: 900, q: 2.4, bus: busGain, reverbSend: 0.16 });
        this._tone({ freq: 220, type: 'triangle', attack: 0.002, decay: 0.05, gain: 0.05 * vol, release: 0.08, bus: busGain, reverbSend: 0.2 });
        break;
      case 'footstep_water':
        this._noiseBurst({ duration: 0.28, gain: 0.16 * vol, type: 'lowpass', freq: 1400, sweepTo: 400, q: 0.7, bus: busGain, reverbSend: 0.3 });
        break;
      case 'thunder':
        this._noiseBurst({ duration: 0.28, gain: 0.5 * vol, type: 'lowpass', freq: 700, sweepTo: 120, q: 0.7, buffer: this.brownBuffer, bus: busGain, reverbSend: 0.6 });
        this._noiseBurst({ duration: 1.9 + Math.random(), gain: 0.24 * vol, type: 'lowpass', freq: 240, sweepTo: 60, q: 0.5, buffer: this.brownBuffer, when: this._now() + 0.12, bus: busGain, reverbSend: 0.75 });
        break;
      case 'bird':
        for (let i = 0; i < 3; i++) {
          const base = 2200 + Math.random() * 1600;
          this._tone({ freq: base, type: 'sine', attack: 0.01, decay: 0.06, gain: 0.05 * vol, release: 0.08, glideTo: base * (1 + Math.random() * 0.5), when: this._now() + i * 0.12, bus: busGain, reverbSend: 0.4, pan: Math.random() * 2 - 1 });
        }
        break;
      case 'seagull':
        for (let i = 0; i < 2; i++) {
          this._tone({ freq: 1500, type: 'sawtooth', attack: 0.05, decay: 0.22, gain: 0.035 * vol, release: 0.2, glideTo: 900, filter: { type: 'bandpass', freq: 1800, q: 4 }, when: this._now() + i * 0.4, bus: busGain, reverbSend: 0.5, pan: Math.random() * 2 - 1 });
        }
        break;
      case 'crickets':
        for (let i = 0; i < 4; i++) {
          this._tone({ freq: 4200 + Math.random() * 500, type: 'sine', attack: 0.004, decay: 0.03, gain: 0.02 * vol, release: 0.03, when: this._now() + i * 0.07, bus: busGain, reverbSend: 0.3, pan: Math.random() * 2 - 1 });
        }
        break;
      case 'fire':
        for (let i = 0; i < 5; i++) {
          this._noiseBurst({ duration: 0.05 + Math.random() * 0.07, gain: 0.06 * vol, type: 'bandpass', freq: 900 + Math.random() * 2200, q: 3, bus: busGain, when: this._now() + Math.random() * 0.35, reverbSend: 0.15 });
        }
        break;
      case 'fish_take':
        this._noiseBurst({ duration: 0.3, gain: 0.16 * vol, type: 'lowpass', freq: 1100, sweepTo: 260, q: 1.1, bus: busGain, reverbSend: 0.35 });
        break;
      case 'click_bait':
        this._tone({ freq: 480, type: 'square', attack: 0.002, decay: 0.05, gain: 0.06 * vol, release: 0.05, bus: busGain });
        break;
      case 'pickup':
        [0, 7, 12].forEach((semi, i) =>
          this._tone({ freq: NOTE(76 + semi), type: 'sine', attack: 0.005, decay: 0.16, gain: 0.07 * vol, release: 0.3, when: this._now() + i * 0.06, bus: busGain, reverbSend: 0.4 })
        );
        break;
      case 'craft':
        for (let i = 0; i < 4; i++) {
          this._noiseBurst({ duration: 0.09, gain: 0.1 * vol, type: 'bandpass', freq: 1200 + i * 300, q: 2, when: this._now() + i * 0.13, bus: busGain, reverbSend: 0.2 });
        }
        break;
      case 'error':
        this._tone({ freq: 220, type: 'square', attack: 0.004, decay: 0.12, gain: 0.07 * vol, release: 0.12, glideTo: 160, bus: busGain });
        break;
      case 'lamp_on':
        this._tone({ freq: 120, type: 'sawtooth', attack: 0.02, decay: 0.3, gain: 0.05 * vol, release: 0.4, filter: { type: 'lowpass', freq: 900, sweepTo: 2400 }, bus: busGain, reverbSend: 0.3 });
        break;
      case 'engine_start':
        this._tone({ freq: 42, type: 'sawtooth', attack: 0.3, decay: 0.6, gain: 0.2 * vol, release: 0.8, filter: { type: 'lowpass', freq: 420, sweepTo: 800 }, bus: busGain, reverbSend: 0.25 });
        this._noiseBurst({ duration: 0.5, gain: 0.1 * vol, type: 'bandpass', freq: 300, q: 1.2, bus: busGain });
        break;
      case 'wind_gust':
        this._noiseBurst({ duration: 2.2, gain: 0.18 * vol, type: 'bandpass', freq: 500, sweepTo: 1400, q: 0.6, buffer: this.pinkBuffer, bus: busGain, reverbSend: 0.2, attack: 0.7 });
        break;
      default:
        break;
    }
    this._activeOut = prev;
  }

  // ------------------------------------------------------------ ЭМБИЕНС
  _buildAmbienceBeds() {
    const ctx = this.ctx;
    // Ветер — розовый шум через полосовой фильтр с медленной модуляцией
    const wind = ctx.createBufferSource();
    wind.buffer = this.pinkBuffer;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 520;
    wf.Q.value = 0.75;
    const wg = ctx.createGain();
    wg.gain.value = 0.045;
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.ambienceBus);
    wind.start();

    // ЛФО на ветер
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(wg.gain);
    lfo.start();

    // Прибой — низкий рокот у берега
    const surf = ctx.createBufferSource();
    surf.buffer = this.brownBuffer;
    surf.loop = true;
    const sf = ctx.createBiquadFilter();
    sf.type = 'lowpass';
    sf.frequency.value = 380;
    const sg = ctx.createGain();
    sg.gain.value = 0.05;
    surf.connect(sf);
    sf.connect(sg);
    sg.connect(this.ambienceBus);
    surf.start();
    const surfLfo = ctx.createOscillator();
    surfLfo.frequency.value = 0.13;
    const surfLfoGain = ctx.createGain();
    surfLfoGain.gain.value = 0.028;
    surfLfo.connect(surfLfoGain);
    surfLfoGain.connect(sg.gain);
    surfLfo.start();

    // Дождь (включается по погоде)
    const rain = ctx.createBufferSource();
    rain.buffer = this.pinkBuffer;
    rain.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'highpass';
    rf.frequency.value = 1400;
    const rf2 = ctx.createBiquadFilter();
    rf2.type = 'lowpass';
    rf2.frequency.value = 7200;
    const rg = ctx.createGain();
    rg.gain.value = 0.0;
    rain.connect(rf);
    rf.connect(rf2);
    rf2.connect(rg);
    rg.connect(this.ambienceBus);
    rain.start();

    // Двигатель лодки (запускается на ходу)
    const eng = ctx.createOscillator();
    eng.type = 'sawtooth';
    eng.frequency.value = 46;
    const eng2 = ctx.createOscillator();
    eng2.type = 'square';
    eng2.frequency.value = 23;
    const ef = ctx.createBiquadFilter();
    ef.type = 'lowpass';
    ef.frequency.value = 340;
    const eg = ctx.createGain();
    eg.gain.value = 0.0;
    eng.connect(ef);
    eng2.connect(ef);
    ef.connect(eg);
    eg.connect(this.ambienceBus);
    eng.start();
    eng2.start();

    this._ambienceNodes = { wind, wg, surf, sg, rain, rg, eng, eng2, eg, ef };
  }

  /** Погодный/сценический микс эмбиента. */
  setAmbience({ rain = 0, wind = 0.5, night = false, engine = 0, engineRpm = 0 }) {
    if (!this.ready) return;
    const t = this._now();
    const n = this._ambienceNodes;
    n.rg.gain.setTargetAtTime(rain * 0.16, t, 0.6);
    n.wg.gain.setTargetAtTime(0.02 + wind * 0.05, t, 0.9);
    n.sg.gain.setTargetAtTime(0.03 + wind * 0.03, t, 1.2);
    n.eg.gain.setTargetAtTime(engine * 0.14, t, 0.25);
    n.eng.frequency.setTargetAtTime(42 + engineRpm * 58, t, 0.2);
    n.eng2.frequency.setTargetAtTime(22 + engineRpm * 29, t, 0.2);
    n.ef.frequency.setTargetAtTime(300 + engineRpm * 700, t, 0.2);
    this._nightAmbience = night;
  }

  // ------------------------------------------------------------ МУЗЫКА
  _startMusic() {
    // Слоистая генеративная музыка: 4 состояния
    this._musicTimer = 0;
    this._beat = 0;
    this._chordIndex = 0;
    this._nextBeatTime = this._now() + 0.2;
    this._scheduleAhead = 0.6;
  }

  setMusicState(state) {
    if (this.state === state) return;
    this.state = state;
  }

  onMusicStateChange(cb) {
    this._listeners.push(cb);
  }

  // Прогрессии аккордов (MIDI-ноты) для разных состояний
  static PROGRESSIONS = {
    explore: {
      scale: 'lydian',
      root: 55, // G3
      chords: [[0, 4, 7, 11], [2, 5, 9, 12], [-3, 2, 5, 9], [-5, 0, 4, 7]],
      tempo: 66,
      layers: { pad: 0.5, arp: 0.34, bass: 0.42, bell: 0.2, perc: 0.1 },
    },
    night: {
      scale: 'dorian',
      root: 50,
      chords: [[0, 3, 7, 10], [-2, 3, 5, 10], [3, 7, 10, 14], [-4, 0, 3, 7]],
      tempo: 54,
      layers: { pad: 0.55, arp: 0.18, bass: 0.34, bell: 0.32, perc: 0.04 },
    },
    tension: {
      scale: 'minor',
      root: 48,
      chords: [[0, 3, 7, 10], [1, 4, 8, 11], [0, 3, 7, 10], [-1, 3, 6, 10]],
      tempo: 84,
      layers: { pad: 0.42, arp: 0.2, bass: 0.6, bell: 0.08, perc: 0.44 },
    },
    victory: {
      scale: 'major',
      root: 60,
      chords: [[0, 4, 7, 12], [5, 9, 12, 16], [7, 11, 14, 19], [0, 4, 7, 12]],
      tempo: 92,
      layers: { pad: 0.5, arp: 0.4, bass: 0.46, bell: 0.5, perc: 0.3 },
    },
  };

  /** Планировщик музыки — вызывать каждый кадр. */
  updateMusic(dt) {
    if (!this.ready || !this.musicEnabled || !this.enabled) return;
    const cfg = AudioEngine.PROGRESSIONS[this.state] || AudioEngine.PROGRESSIONS.explore;
    const beatDur = 60 / cfg.tempo;
    this._nextBeatTime = this._nextBeatTime || this._now();
    while (this._nextBeatTime < this._now() + this._scheduleAhead) {
      this._scheduleBeat(cfg, this._nextBeatTime, beatDur);
      this._nextBeatTime += beatDur;
    }
  }

  _scheduleBeat(cfg, when, beatDur) {
    const beat = this._beat++ % 8;
    const chordIdx = Math.floor((this._beat % 32) / 8) % cfg.chords.length;
    const chord = cfg.chords[chordIdx];
    const root = cfg.root;
    const scale = SCALES[cfg.scale];
    const L = cfg.layers;
    const tone = (semi, oct = 0) => NOTE(root + semi + oct * 12);

    // PAD — мягкие долгие ноты (каждый 8-й бит)
    if (beat === 0) {
      chord.forEach((semi, i) => {
        this._tone({
          freq: tone(semi, 1),
          type: 'sine',
          attack: 1.1,
          decay: 2.2,
          sustain: 0.12,
          release: 3.0,
          gain: 0.05 * L.pad,
          detune: (i - 1.5) * 6,
          filter: { type: 'lowpass', freq: 1600 },
          bus: this.musicBus,
          when,
          reverbSend: 0.7,
        });
        this._tone({
          freq: tone(semi, 1) * 1.004,
          type: 'triangle',
          attack: 1.4,
          decay: 2.4,
          sustain: 0.08,
          release: 3.2,
          gain: 0.028 * L.pad,
          filter: { type: 'lowpass', freq: 900 },
          bus: this.musicBus,
          when,
          reverbSend: 0.8,
        });
      });
    }

    // BASS — пульс на 1 и 3
    if (beat === 0 || beat === 3 || (this.state === 'tension' && beat % 2 === 0)) {
      this._tone({
        freq: tone(chord[0], -1),
        type: 'sine',
        attack: 0.06,
        decay: 0.55,
        sustain: 0.1,
        release: 0.6,
        gain: 0.16 * L.bass,
        filter: { type: 'lowpass', freq: 320 },
        bus: this.musicBus,
        when,
        reverbSend: 0.25,
      });
    }

    // ARP — арпеджио восьмыми
    if (this.state !== 'night' || beat % 2 === 0) {
      const step = this._beat % 12;
      const semi = chord[step % chord.length] + (step > 7 ? 12 : 0);
      this._tone({
        freq: tone(semi, 2),
        type: 'triangle',
        attack: 0.006,
        decay: 0.28,
        sustain: 0.02,
        release: 0.42,
        gain: 0.07 * L.arp,
        filter: { type: 'lowpass', freq: 4200, sweepTo: 1400 },
        bus: this.musicBus,
        when,
        reverbSend: 0.55,
        pan: (step % 4) * 0.14 - 0.2,
      });
    }

    // BELL — редкие высокие «капли»
    if (beat % 4 === 2 || (this.state === 'victory' && beat % 2 === 1)) {
      const semi = scale[(this._beat * 3) % scale.length] + 12;
      this._tone({
        freq: tone(semi, 2),
        type: 'sine',
        attack: 0.008,
        decay: 0.9,
        sustain: 0.001,
        release: 1.4,
        gain: 0.09 * L.bell,
        bus: this.musicBus,
        when,
        reverbSend: 0.85,
        pan: Math.random() * 0.7 - 0.35,
      });
    }

    // PERC — мягкая перкуссия (гидравлический «сердцебиение»)
    if (L.perc > 0.15 && (beat === 0 || beat === 4)) {
      this._noiseBurst({
        duration: 0.16,
        gain: 0.09 * L.perc,
        type: 'lowpass',
        freq: 180,
        q: 1.2,
        buffer: this.brownBuffer,
        bus: this.musicBus,
        when,
        reverbSend: 0.3,
      });
    }
    if (L.perc > 0.3 && beat % 2 === 1) {
      this._noiseBurst({
        duration: 0.06,
        gain: 0.022 * L.perc,
        type: 'highpass',
        freq: 6800,
        q: 1.2,
        bus: this.musicBus,
        when,
        reverbSend: 0.2,
      });
    }
  }

  /** Короткий джингл для событий (поимка, квест). */
  jingle(kind = 'catch') {
    if (!this.ready) return;
    const t = this._now();
    const seqs = {
      catch: [72, 76, 79, 84],
      quest: [67, 72, 76, 79, 84],
      complete: [72, 79, 84, 88, 91],
      fail: [67, 65, 62],
    };
    const seq = seqs[kind] || seqs.catch;
    seq.forEach((n, i) => {
      this._tone({
        freq: NOTE(n),
        type: 'triangle',
        attack: 0.006,
        decay: 0.3,
        sustain: 0.05,
        release: 0.5,
        gain: 0.11,
        bus: this.musicBus,
        when: t + i * 0.1,
        reverbSend: 0.6,
      });
    });
  }

  setMusicEnabled(on) {
    this.musicEnabled = on;
    if (!this.ready) return;
    this.musicBus.gain.setTargetAtTime(on ? this.volumes.music * 0.8 : 0, this._now(), 0.25);
  }

  setSfxEnabled(on) {
    this.enabled = on;
    if (!this.ready) return;
    this.sfxBus.gain.setTargetAtTime(on ? this.volumes.sfx : 0, this._now(), 0.1);
    this.ambienceBus.gain.setTargetAtTime(on ? this.volumes.ambience : 0, this._now(), 0.2);
  }
}

// Мини-вектор, чтобы не тянуть THREE в аудио-модуль
class THREE_V3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  negate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }
  clone() {
    return new THREE_V3(this.x, this.y, this.z);
  }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= l;
    this.y /= l;
    this.z /= l;
    return this;
  }
}
