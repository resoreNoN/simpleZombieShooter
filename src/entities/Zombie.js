import Phaser from 'phaser';
import { DEPTH } from '../data/depth.js';

/**
 * Зомби: прямое движение к игроку (без поиска пути), урон при контакте.
 */
export default class Zombie extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, config) {
    super(scene, x, y, 'zombie');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(DEPTH.ZOMBIE);

    this.typeId = config.id;
    this.speed = config.speed;
    this.hp = config.hp;
    this.maxHP = config.hp;
    this.damage = config.damage;
    this.score = config.score;
    this.typeTint = config.tint;
    this.mass = config.mass ?? 1;

    /** Отброс от пуль: затухающая добавка к скорости погони */
    this.knockVX = 0;
    this.knockVY = 0;

    this.setScale(config.scale);
    this.setTint(config.tint);

    // Arcade-тело не следует за масштабом спрайта — задаём в явном виде
    this.body.setSize(this.width * config.scale, this.height * config.scale);

    /** Пауза между атаками, мс */
    this.attackRate = 800;
    this.nextAttackAt = 0;
  }

  /** Движение к игроку — вызывается из update сцены */
  update(time, gameState) {
    if (!this.active || gameState !== 'playing') return;

    const player = this.scene.player;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    this.setRotation(angle);
    this.scene.physics.velocityFromRotation(angle, this.speed, this.body.velocity);

    // Отброс: складываем с погоней и гасим экспоненциально (полупериод ~80мс)
    if (this.knockVX !== 0 || this.knockVY !== 0) {
      this.body.velocity.x += this.knockVX;
      this.body.velocity.y += this.knockVY;

      // Кламп дельты: лаг-спайк (свёрнутая вкладка) в один кадр иначе
      // мгновенно гасит весь накопленный импульс отброса
      const k = Math.exp(-Math.min(this.scene.game.loop.delta, 50) / 115);
      this.knockVX *= k;
      this.knockVY *= k;
      if (Math.abs(this.knockVX) < 4 && Math.abs(this.knockVY) < 4) {
        this.knockVX = 0;
        this.knockVY = 0;
      }
    }
  }

  /** Импульс от попадания пули; тяжёлые типы (mass больше) поддаются меньше.
   *  Импульс = strength / mass, эталон ходока — mass 1.0. */
  applyKnockback(dirX, dirY, strength) {
    this.knockVX += (dirX * strength) / this.mass;
    this.knockVY += (dirY * strength) / this.mass;
  }

  canAttack(time) {
    if (time >= this.nextAttackAt) {
      this.nextAttackAt = time + this.attackRate;
      return true;
    }
    return false;
  }

  takeHit(amount) {
    this.hp = Math.max(0, this.hp - amount);
    // Вспышка белым при попадании, затем возврат к типовой окраске
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (this.active) this.setTint(this.typeTint);
    });
    return this.hp === 0;
  }
}
