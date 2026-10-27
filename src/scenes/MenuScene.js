import { getBest } from '../data/highscore.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const { width, height } = this.scale;

    // Новая игра — свежий счёт (рекорд живёт в localStorage)
    this.registry.set('score', 0);

    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    this.add
      .text(width / 2, height * 0.3, 'ZOMBIE SHOOTER', {
        fontFamily: 'Arial',
        fontSize: '48px',
        color: '#8ce68c',
        stroke: '#22223a',
        strokeThickness: 6
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.45, 'Вид сверху • Волны зомби • Уровни', {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#a9a9c9'
      })
      .setOrigin(0.5);

    const best = getBest();
    if (best > 0) {
      this.add
        .text(width / 2, height * 0.52, `Рекорд: ${best}`, {
          fontFamily: 'Arial',
          fontSize: '20px',
          color: '#ffbd2e'
        })
        .setOrigin(0.5);
    }

    const controls = [
      'WASD — движение',
      'Мышь — прицел',
      'ЛКМ (удерживать) — стрельба',
      '1/2/3 — пистолет / дробовик / автомат',
      'M — вкл/выкл звук'
    ];
    this.add
      .text(width / 2, height * 0.63, controls.join('\n'), {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#c9c9dd',
        align: 'center',
        lineSpacing: 6
      })
      .setOrigin(0.5);

    const startText = this.add
      .text(width / 2, height * 0.78, 'Нажмите ПРОБЕЛ, чтобы начать', {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: '#ffbd2e'
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: startText,
      alpha: 0.2,
      duration: 700,
      yoyo: true,
      repeat: -1
    });

    this.input.keyboard.on('keydown-SPACE', () => {
      this.scene.start('Game');
    });
  }
}
