/**
 * Процедурные звуковые эффекты на WebAudio API — в духе проекта:
 * визуальные эффекты у нас генерируются кодом (generateTexture, GLB→PNG),
 * и звук не заводит бинарных ассетов, оставаясь в том же стиле.
 *
 * Архитектура:
 *  - AudioContext создаётся лениво при первом жесте пользователя
 *    (браузерная политика автоплея); до разблокировки play() молчит.
 *  - Один мастер-гейн → шина-компрессор → destination: разные эффекты
 *    (шотган + hit + смерть в один момент) не троттлятся между собой и
 *    суммарно могут клиппить; компрессор сглаживает пики без потери
 *    громкости (master gain остаётся 0.5).
 *  - Каждый эффект — небольшая граф секции: осциллятор/шум + огибающая.
 *    Шум общий (заготовленный белый буфер), со случайным смещением и
 *    детюном — повторные выстрелы звучат чуть по-разному.
 *  - Троттлинг на эффект: трассер автомата и веер дробовика в один
 *    тик не обязаны наслаиваться 6-кратным «флешем».
 *
 * Нюанс UX: самое первое нажатие M ещё только разблокирует контекст
 * (до него play() молчит по политике автоплея), поэтому глушение
 * происходит со ВТОРОГО нажатия. Это осознанно оставлено как есть.
 *
 * Геймплейные точки вызова: Player.fireBullet (выстрел), GameScene
 * (попадание/смерть зомби/конец игры), Player.takeDamage (урон игрока),
 * WaveManager.startWave (старт волны).
 */

const MASTER_GAIN = 0.5;

class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this._muted = false;
    this._lastAt = new Map();

    // Политика автоплея: первый жест anywhere разблокирует контекст.
    // { once: true } — после срабатывания слушатели больше не участвуют.
    const unlock = () => this._unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && this.ctx) {
        this.toggleMute();
      } else {
        unlock();
      }
    }, { once: false });
  }

  _unlock() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : MASTER_GAIN;
      // Компрессор как страховка от клиппинга: эффекты разного имени
      // не троттлятся между собой и при толпе суммируются в мастер
      this.compressor = this.ctx.createDynamicsCompressor();
      this.master.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
      this._prepareNoise();
    } catch {
      // Без WebAudio (редко в новых браузерах) игра продолжает молчать
      this.ctx = null;
    }
  }

  _prepareNoise() {
    const len = Math.floor(this.ctx.sampleRate * 1.0);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  get muted() {
    return this._muted;
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this.master) {
      this.master.gain.value = this._muted ? 0 : MASTER_GAIN;
    }
  }

  /**
   * Играть эффект по имени. Имена методов названы по эффектам
   * (pistol, shotgun, rifle, hit, ...) — диспетчеризация через них же.
   */
  play(name, opts = {}) {
    if (!this.ctx || this._muted) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
      // Первый после разблокировки тик всё равно успеет — не дропаем
    }
    // Тротллинг: не более N звуков одного типа в кадр/такт
    const now = performance.now();
    const minGap = opts.minGap ?? 25;
    if (now - (this._lastAt.get(name) ?? -1e9) < minGap) return;
    this._lastAt.set(name, now);
    // Неизвестное имя — с typo новый эффект диагностируется сразу, а не молчит
    if (import.meta.env.DEV && !this[name]) {
      console.warn(`[sfx] нет эффекта "${name}" — проверь имя или добавь метод в Sfx`);
      return;
    }
    this[name]?.();
  }

  /* ---------- Примитивы ---------- */

  /** Короткий шумовой всплеск через фильтр */
  _noise(t0, dur, { freq, type = 'bandpass', q = 1, gain = 0.5, decay = 0.9 }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    // Случайное смещение чтения — один буфер «разнообразит» повторы
    const offset = Math.random() * (1.0 - dur);
    src.loop = true;
    src.loopStart = offset;
    src.loopEnd = offset + dur;

    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur * decay);

    src.connect(filt).connect(env).connect(this.master);
    src.start(t0, offset);
    src.stop(t0 + dur);
    src.onended = () => src.disconnect();
  }

  /** Осциллятор с глиссандо частоты и экспоненциальным хвостом */
  _tone(t0, dur, { type = 'sine', f0 = 200, f1 = 60, gain = 0.5, decay = 0.9, detuneJitter = 0 }) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detuneJitter ? (Math.random() * 2 - 1) * detuneJitter : 0;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur * decay);

    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur);
    osc.onended = () => osc.disconnect();
  }

  /** Короткая нота без глиссандо (для мелодических заголовков волн) */
  _note(t0, dur, { type = 'sine', freq = 220, gain = 0.25, attack = 0.005 }) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur);
    osc.onended = () => osc.disconnect();
  }

  /** 0...1 — случайное давление на заготовку звука (полезная вариативность) */
  _rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /* ---------- Эффекты ---------- */

  pistol() {
    const t = this.ctx.currentTime;
    this._noise(t, 0.08, { freq: 1400, type: 'highpass', gain: 0.6 });
    this._tone(t, 0.09, { type: 'triangle', f0: this._rand(150, 180), f1: 50, gain: 0.55 });
  }

  shotgun() {
    const t = this.ctx.currentTime;
    this._noise(t, 0.16, { freq: 520, q: 0.7, gain: 0.85 });
    this._tone(t, 0.18, { type: 'sine', f0: this._rand(110, 135), f1: 42, gain: 0.7 });
  }

  rifle() {
    const t = this.ctx.currentTime;
    this._noise(t, 0.05, { freq: 1900, type: 'highpass', gain: 0.45 });
    this._tone(t, 0.055, { type: 'square', f0: this._rand(270, 330), f1: 110, gain: 0.3 });
  }

  hit() {
    const t = this.ctx.currentTime;
    this._noise(t, 0.05, { freq: 700, type: 'lowpass', gain: 0.35 });
    this._tone(t, 0.07, { type: 'sine', f0: this._rand(200, 240), f1: 85, gain: 0.45 });
  }

  zombieDeath() {
    const t = this.ctx.currentTime;
    this._tone(t, 0.35, { type: 'sawtooth', f0: this._rand(130, 160), f1: 34, gain: 0.4, decay: 0.95 });
    this._noise(t, 0.2, { freq: 300, type: 'lowpass', gain: 0.4 });
  }

  playerHurt() {
    const t = this.ctx.currentTime;
    this._tone(t, 0.15, { type: 'square', f0: 190, f1: 65, gain: 0.4, decay: 0.92 });
    this._noise(t, 0.12, { freq: 260, q: 0.8, gain: 0.5 });
  }

  medkit() {
    const t = this.ctx.currentTime;
    this._note(t, 0.12, { freq: 523, gain: 0.2 });
    this._note(t + 0.08, 0.16, { freq: 784, gain: 0.22 });
  }

  ammoBox() {
    const t = this.ctx.currentTime;
    // Металлический клик обоймы: короткий «щелчок» + высокая нота
    this._noise(t, 0.04, { freq: 2200, type: 'highpass', gain: 0.3 });
    this._note(t + 0.03, 0.1, { freq: 1046, gain: 0.16 });
    this._note(t + 0.09, 0.12, { freq: 1318, gain: 0.16 });
  }

  waveStart() {
    const t = this.ctx.currentTime;
    this._note(t, 0.12, { freq: 110, type: 'square', gain: 0.16 });
    this._note(t + 0.14, 0.2, { freq: 146.8, type: 'square', gain: 0.18 });
  }

  levelWin() {
    const t = this.ctx.currentTime;
    this._note(t, 0.1, { freq: 262, gain: 0.2 });
    this._note(t + 0.09, 0.1, { freq: 330, gain: 0.2 });
    this._note(t + 0.18, 0.22, { freq: 392, gain: 0.22 });
  }

  allLevelsWin() {
    const t = this.ctx.currentTime;
    const notes = [262, 330, 392, 523, 659];
    notes.forEach((f, i) => this._note(t + i * 0.11, 0.3 - i * 0.03, { freq: f, gain: 0.2 }));
    this._note(t + notes.length * 0.11 + 0.05, 0.4, { freq: 784, gain: 0.24 });
  }

  gameOver() {
    const t = this.ctx.currentTime;
    this._note(t, 0.28, { freq: 220, type: 'sawtooth', gain: 0.18 });
    this._note(t + 0.3, 0.28, { freq: 175, type: 'sawtooth', gain: 0.18 });
    this._note(t + 0.6, 0.5, { freq: 147, type: 'sawtooth', gain: 0.2 });
  }
}

export const sfx = new Sfx();

// Как с __game: глобальный доступ нужен автотестам и ручной отладке
if (import.meta.env.DEV) {
  window.__sfx = sfx;
}
