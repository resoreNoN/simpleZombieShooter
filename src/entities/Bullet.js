import Phaser from 'phaser';
import { DEPTH } from '../data/depth.js';

/**
 * Пуля из пула сцены. Активируется методом fire(), гаснет по дальности или попаданию.
 * Наследуется от Sprite: у Image нет preUpdate.
 */
export default class Bullet extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, texture) {
    super(scene, x, y, texture);
    this.damage = 0;
    this.maxDistance = 0;
    this.traveled = 0;
    this.knockback = 0;
  }

  fire(x, y, angle, speed, damage, range, knockback = 0) {
    this.enableBody(true, x, y, true, true);
    this.setDepth(DEPTH.BULLET); // летит поверх крон/кустов (depth 20)
    this.rotation = angle;
    this.damage = damage;
    this.maxDistance = range;
    this.traveled = 0;
    this.knockback = knockback;
    this.scene.physics.velocityFromRotation(angle, speed, this.body.velocity);
  }

  preUpdate(_time, delta) {
    super.preUpdate(_time, delta);
    if (!this.active) return;
    this.traveled += this.body.speed * (delta / 1000);
    if (this.traveled >= this.maxDistance) {
      this.kill();
    }
  }

  kill() {
    this.disableBody(true, true);
  }
}
