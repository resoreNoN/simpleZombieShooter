import Phaser from 'phaser';
import { DEPTH } from '../data/depth.js';
import { sfx } from '../audio/sfx.js';

/**
 * UI-сцена: HUD поверх игры. Запускается параллельно с GameScene,
 * состояние читает напрямую у сцены Game каждый кадр, так что
 * рестарт-уровня её не касается.
 *
 * Состав:
 *  - верхний блок: уровень/волна, HP-бар с вспышкой урона, счёт, подсказка;
 *  - винетка по краям экрана при HP < 30%;
 *  - слоты оружия 1/2/3 слева внизу (активный подсвечен, пустой затемнён);
 *  - метка волны: во время волны «Волна N/M», в паузе — обратный отсчёт.
 */

const BAR_W = 180;
const BAR_H = 14;
const SLOT_W = 96;
const SLOT_H = 36;
const SLOT_GAP = 8;
const SLOT_Y_OFFSET = 38;

const COLOR_GREEN = 0x35c25a;
const COLOR_YELLOW = 0xe8b93c;
const COLOR_RED = 0xd64545;

export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  create() {
    const hudStyle = {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#e8e8f4',
      backgroundColor: 'rgba(0,0,0,0.35)',
      padding: { x: 8, y: 4 }
    };

    /* ---------- Верхний блок ---------- */

    this.levelText = this.add
      .text(14, 10, '', hudStyle)
      .setDepth(DEPTH.HUD);

    // HP-бар: подложка + заливка + вспышка урона + число внутри
    this.hpContainer = this.add.container(14, 36);
    this.hpBg = this.add
      .rectangle(0, 0, BAR_W, BAR_H, 0x0d0d16, 0.85)
      .setOrigin(0)
      .setStrokeStyle(1, 0x7a7a92, 0.9);
    this.hpFill = this.add
      .rectangle(2, 2, Math.max(BAR_W - 4, 0), BAR_H - 4, COLOR_GREEN)
      .setOrigin(0);
    this.hpFlash = this.add
      .rectangle(0, 0, BAR_W, BAR_H, 0xff4444)
      .setOrigin(0)
      .setAlpha(0);
    this.hpText = this.add
      .text(5, 1, '100/100', {
        fontFamily: 'Arial',
        fontSize: '10px',
        color: '#f0f0f8'
      })
      .setDepth(DEPTH.HUD_UNDER);
    this.hpContainer.add([this.hpBg, this.hpFill, this.hpFlash, this.hpText]);

    this.scoreText = this.add
      .text(14, 58, 'Счёт: 0', {
        ...hudStyle,
        fontSize: '15px',
        color: '#ffe08a'
      })
      .setDepth(DEPTH.HUD);

    this.hintText = this.add
      .text(14, 84, '', {
        ...hudStyle,
        color: '#ff9f66'
      })
      .setDepth(DEPTH.HUD);

    /* ---------- Винетка (HP < 30%) ---------- */

    const { width, height } = this.scale;
    this.vignette = this.add.graphics().setDepth(DEPTH.VIGNETTE);
    this.vignette.fillStyle(0x991111, 1);
    this.vignette.fillRect(0, 0, width, 16);
    this.vignette.fillRect(0, height - 16, width, 16);
    this.vignette.fillRect(0, 0, 16, height);
    this.vignette.fillRect(width - 16, 0, 16, height);
    this.vignette.setAlpha(0);
    this.vignetteTween = null;
    this.vignetteOn = false;

    /* ---------- Слоты оружия ---------- */

    this.slots = [];
    const weaponOrder = ['pistol', 'shotgun', 'rifle'];
    weaponOrder.forEach((id, i) => {
      const x = 16 + i * (SLOT_W + SLOT_GAP);
      const y = this.scale.height - SLOT_Y_OFFSET;

      const bg = this.add
        .rectangle(0, 0, SLOT_W, SLOT_H, 0x101018, 0.45)
        .setOrigin(0)
        .setStrokeStyle(1, 0x555566, 1);

      const label = this.add
        .text(7, 5, '', {
          fontFamily: 'Arial',
          fontSize: '11px',
          color: '#c9c9dd'
        })
        .setDepth(DEPTH.HUD_UNDER);

      const ammoText = this.add
        .text(7, 18, '', {
          fontFamily: 'Arial',
          fontSize: '13px',
          color: '#ffe08a'
        })
        .setDepth(DEPTH.HUD_UNDER);

      const container = this.add.container(x, y, [bg, label, ammoText]);

      this.slots.push({ id, container, bg, label, ammoText });
    });
    this.activeSlotIdx = -1;

    /* ---------- Метка волны ---------- */

    this.waveLabel = this.add
      .text(this.scale.width / 2, 16, '', {
        ...hudStyle,
        fontSize: '18px',
        color: '#ffbd2e',
        padding: { x: 10, y: 4 }
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.HUD);

    /* ---------- Индикатор звука [M] ---------- */

    this.soundLabel = this.add
      .text(this.scale.width - 14, 16, '', {
        ...hudStyle,
        color: '#a8d8a0'
      })
      .setOrigin(1, 0)
      .setDepth(DEPTH.HUD);

    /* ---------- Кэш dirty-check ---------- */
    /* ВАЖНО: инстанс сцены переживает остановку/перезапуск, а create()
       пересоздаёт объекты — поэтому все кэши сбрасываем здесь руками */
    this.lastWaveHead = null;
    this.lastWaveMark = null;
    this.lastHp = null;
    this.lastScore = null;
    this.lastHint = null;
    this.lastSoundLabel = null;
  }

  update() {
    const game = this.scene.get('Game');
    if (!game || !game.player || !this.scene.isActive('Game')) {
      this.scene.stop();
      return;
    }
    const p = game.player;
    const activeWeapon = p.currentWeapon;

    /* Уровень / волна (только при изменении) */
    const waveHead = `Уровень ${game.levelIndex + 1} | Волна ${Math.max(game.waveIdx + 1, 0)}/${game.levelWaves.length}`;
    if (waveHead !== this.lastWaveHead) {
      this.levelText.setText(waveHead);
      this.lastWaveHead = waveHead;
    }

    /* HP-бар */
    const hp = p.hp;
    if (hp !== this.lastHp) {
      if (this.lastHp !== null && hp < this.lastHp) {
        this.onDamage();
      }
      const pct = Phaser.Math.Clamp(hp / p.maxHP, 0, 1);
      this.hpFill.displayWidth = Math.max((BAR_W - 4) * pct, pct > 0 ? 2 : 0);
      this.hpFill.setFillStyle(pct > 0.6 ? COLOR_GREEN : pct > 0.3 ? COLOR_YELLOW : COLOR_RED);
      this.hpText.setText(`${Math.ceil(hp)}/${p.maxHP}`);
      this.lastHp = hp;
    }

    /* Винетка при низком HP */
    const lowHP = hp > 0 && hp <= p.maxHP * 0.3;
    if (lowHP !== this.vignetteOn) {
      this.vignetteOn = lowHP;
      if (lowHP) {
        this.vignetteTween = this.tweens.add({
          targets: this.vignette,
          alpha: { from: 0.12, to: 0.4 },
          duration: 500,
          yoyo: true,
          repeat: -1
        });
      } else if (this.vignetteTween) {
        this.vignetteTween.stop();
        this.vignetteTween = null;
        this.tweens.add({ targets: this.vignette, alpha: 0, duration: 200 });
      }
    }

    /* Счёт */
    if (game.score !== this.lastScore) {
      this.scoreText.setText(`Счёт: ${game.score}`);
      this.lastScore = game.score;
    }

    /* Подсказка при пустом магазине активного оружия (без аллокаций массива) */
    let hint = '';
    if (activeWeapon.ammo === 0) {
      let hasAlternative = false;
      for (const key in p.weapons) {
        const w = p.weapons[key];
        if (w.ammo !== 0 && w.ammo !== Infinity) {
          hasAlternative = true;
          break;
        }
      }
      hint = hasAlternative
        ? `Патроны кончились — выбери другое (клавиши 1/2/3)`
        : `Патроны кончились — пистолет ∞`;
    }
    if (hint !== this.lastHint) {
      this.hintText.setText(hint);
      this.lastHint = hint;
    }

    /* Индикатор звука: сцена переключает флаг клавишей M глобально,
       меняется редко — dirty-check как у остальных подписей */
    const soundLabel = sfx.muted ? 'Звук: выкл [M]' : 'Звук: вкл [M]';
    if (soundLabel !== this.lastSoundLabel) {
      this.soundLabel.setText(soundLabel).setColor(sfx.muted ? '#9a9aa6' : '#a8d8a0');
      this.lastSoundLabel = soundLabel;
    }

    /* Слоты оружия: подписи статичны, цифры/цвета — только при изменении */
    for (const slot of this.slots) {
      const w = p.weapons[slot.id];
      const isActive = activeWeapon.id === slot.id;
      const empty = w.ammo === 0;

      if (!slot.labelInit) {
        slot.label.setText(`${w.key} · ${w.name}`);
        slot.labelInit = true;
      }

      const ammoStr = w.ammo === Infinity ? '∞' : String(w.ammo);
      if (ammoStr !== slot.lastAmmo) {
        slot.ammoText.setText(ammoStr);
        slot.lastAmmo = ammoStr;
      }

      if (slot.lastActive !== isActive || slot.lastEmpty !== empty) {
        slot.lastActive = isActive;
        slot.lastEmpty = empty;

        slot.bg.setFillStyle(isActive ? 0x2a2a3e : 0x101018, isActive ? 0.85 : 0.45);
        slot.bg.setStrokeStyle(isActive ? 2 : 1, isActive ? 0xffbd2e : 0x555566, 1);
        slot.label.setColor(isActive ? '#ffbd2e' : '#c9c9dd');
        slot.ammoText.setColor(empty ? '#9a9aa6' : isActive ? '#ffe08a' : '#d0d0dc');
      }

      if (isActive) {
        const idx = this.slots.indexOf(slot);
        if (this.activeSlotIdx !== idx) {
          // Пульс при переключении: гасим прошлый твин, иначе наложения
          this.tweens.killTweensOf(slot.container);
          this.tweens.add({
            targets: slot.container,
            scale: { from: 1.14, to: 1 },
            duration: 130,
            ease: 'Quad.Out'
          });
          this.activeSlotIdx = idx;
        }
      }
    }

    /* Метка волны: таймер пересобирается только при смене десятых долей секунды,
       метка активной волны — при смене номера волны */
    const runningText = `Волна ${Math.max(game.waveIdx + 1, 0)}/${game.levelWaves.length}`;
    if (game.waveTimerStarted) {
      const tenths = Math.max(0, Math.floor((game.nextWaveAt - game.time.now) / 100));
      const isFirst = game.waveIdx < 0;
      const mark = `${isFirst ? 'f' : 'n'}${tenths}`;
      if (this.lastWaveMark !== mark) {
        this.lastWaveMark = mark;
        this.waveLabel.setText(
          isFirst ? `Первая волна: ${(tenths / 10).toFixed(1)}с` : `Следующая волна: ${(tenths / 10).toFixed(1)}с`
        );
      }
    } else if (this.lastWaveMark !== runningText) {
      this.lastWaveMark = runningText;
      this.waveLabel.setText(runningText);
    }
  }

  /** Вспышка бара + микро-дрожь при получении урона */
  onDamage() {
    this.tweens.add({
      targets: this.hpFlash,
      alpha: { from: 0.75, to: 0 },
      duration: 160
    });
    this.hpContainer.setX(18);
    this.tweens.add({
      targets: this.hpContainer,
      x: 10,
      duration: 45,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.InOut',
      onComplete: () => this.hpContainer.setX(14)
    });
  }
}
