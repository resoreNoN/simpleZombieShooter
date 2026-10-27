import Phaser from 'phaser';
import { WEAPONS } from '../data/weapons.js';
import { DEPTH } from '../data/depth.js';
import { sfx } from '../audio/sfx.js';

/** «Дуло вплотную»: заряды с меньшей эффективной дальностью не вылетают */
const MIN_EFFECTIVE = 8;

/**
 * Игрок: движение WASD, поворот к мыши, запас здоровья, стрельба.
 * Готов к расширению: новый контент — только новые конфиги в data/weapons.js.
 */
export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDepth(DEPTH.PLAYER);

    // Игрока нельзя сдвигать сепарацией от зомби — иначе толпа
    // продавливает его в препятствия (ящики/стены).
    this.body.pushable = false;

    /** Скорость движения, пикс/с */
    this.speed = 200;
    /** Здоровье */
    this.maxHP = 100;
    this.hp = this.maxHP;
    /** Смещение кончика ствола в локальных координатах спрайта (ствол смотрит вправо) */
    this.muzzleLocal = { x: 23, y: 9 };

    this.keys = scene.input.keyboard.addKeys('W,A,S,D');
    this.sceneRef = scene;

    /** Оружие: экземпляры конфигов с индивидуальным остатком патронов */
    this.weapons = {
      pistol: { ...WEAPONS.pistol },
      shotgun: { ...WEAPONS.shotgun },
      rifle: { ...WEAPONS.rifle }
    };
    this.currentWeapon = this.weapons.pistol;
    this.lastFiredAt = 0;
  }

  /** Переключение оружия (клавиши 1/2/3) */
  equip(weaponId) {
    if (this.weapons[weaponId]) {
      this.currentWeapon = this.weapons[weaponId];
    }
  }

  /** Клавиши 1/2/3 — смена оружия */
  bindWeaponKeys() {
    this.sceneRef.input.keyboard.on('keydown-ONE', () => this.equip('pistol'));
    this.sceneRef.input.keyboard.on('keydown-TWO', () => this.equip('shotgun'));
    this.sceneRef.input.keyboard.on('keydown-THREE', () => this.equip('rifle'));
  }

  /** Движение, поворот и огонь — вызывается из update сцены */
  update(time) {
    this.updateMovement();
    this.rotateToPointer();
    this.handleShooting(time);
  }

  updateMovement() {
    const { W, A, S, D } = this.keys;
    let vx = 0;
    let vy = 0;

    if (A.isDown) vx -= 1;
    if (D.isDown) vx += 1;
    if (W.isDown) vy -= 1;
    if (S.isDown) vy += 1;

    // Нормализация диагонали: скорость постоянна в любом направлении
    if (vx !== 0 && vy !== 0) {
      const k = Math.SQRT1_2;
      vx *= k;
      vy *= k;
    }

    this.setVelocity(vx * this.speed, vy * this.speed);
  }

  rotateToPointer() {
    const pointer = this.sceneRef.input.activePointer;
    const worldPoint = pointer.positionToCamera(this.sceneRef.cameras.main);
    const angle = Phaser.Math.Angle.Between(this.x, this.y, worldPoint.x, worldPoint.y);
    this.setRotation(angle);
  }

  /** Точка вылета пули (срез ствола) в мировых координатах, с учётом поворота */
  getMuzzlePoint() {
    const offset = new Phaser.Math.Vector2(this.muzzleLocal.x, this.muzzleLocal.y);
    offset.rotate(this.rotation);
    return new Phaser.Math.Vector2(this.x + offset.x, this.y + offset.y);
  }

  /** Прицел в мировых координатах */
  getAimPoint() {
    const pointer = this.sceneRef.input.activePointer;
    return pointer.positionToCamera(this.sceneRef.cameras.main);
  }

  /* ---------- Стрельба ---------- */

  handleShooting(time) {
    const weapon = this.currentWeapon;
    if (weapon.ammo <= 0) return;

    const isDown = this.sceneRef.input.activePointer.leftButtonDown();
    if (!isDown) {
      this.triggerHeld = false;
      return;
    }
    if (!weapon.auto && this.triggerHeld) return;
    if (time - this.lastFiredAt < weapon.fireRate) return;

    this.triggerHeld = true;
    this.lastFiredAt = time;
    if (weapon.ammo !== Infinity) weapon.ammo -= 1;
    this.fireBullet(weapon);
    // Один звук на спусковой крючок — даже веер дробовика не дробится на 6
    sfx.play(weapon.id);
  }

  fireBullet(weapon) {
    const scene = this.sceneRef;
    const muzzle = this.getMuzzlePoint();
    const aim = this.getAimPoint();

    // Направление: от ствола к точке прицела + разброс
    const baseAngle = Phaser.Math.Angle.Between(muzzle.x, muzzle.y, aim.x, aim.y);

    // Веер зарядов: одиночный выстрел — случайный разброс; pellets > 1 —
    // равномерный конус с лёгким дрожанием (дробовик)
    let angles;
    if (weapon.pellets <= 1) {
      angles = [baseAngle + Phaser.Math.FloatBetween(-weapon.spread, weapon.spread)];
    } else {
      const step = (weapon.spread * 2) / (weapon.pellets - 1);
      angles = [];
      for (let i = 0; i < weapon.pellets; i++) {
        angles.push(baseAngle - weapon.spread + step * i + Phaser.Math.FloatBetween(-0.02, 0.02));
      }
    }

    const bullets = scene.getBullets();
    for (const angle of angles) {
      // Лучевой расчёт: препятствия/границы мира отсекают дальность по прямой
      const effective = scene.clampBulletRange(muzzle.x, muzzle.y, angle, weapon.range);
      if (effective < MIN_EFFECTIVE) continue; // дуло вплотную к препятствию — этот заряд не летит

      const bullet = bullets.get(muzzle.x, muzzle.y);
      if (bullet) {
        bullet.fire(muzzle.x, muzzle.y, angle, weapon.bulletSpeed, weapon.damage, effective, weapon.knockback ?? 0);
        if (weapon.bulletScale !== 1) bullet.setScale(weapon.bulletScale);
      } else if (!bullets.overflowWarned) {
        // Пул конечен: тихая потеря зарядов — источник трудноуловимых «осечек»
        bullets.overflowWarned = true;
        console.warn(`Пул пуль переполнен (${bullets.maxSize}) — заряды теряются`);
      }
    }
    this.showMuzzleFlash(muzzle.x, muzzle.y, weapon.pellets > 1 ? 1.4 : 1);
  }

  showMuzzleFlash(x, y, scale = 1) {
    const scene = this.sceneRef;
    const flash = scene.add
      .image(x, y, 'muzzleFlash')
      .setRotation(this.rotation)
      .setDepth(DEPTH.FLASH);

    scene.tweens.add({
      targets: flash,
      scale: { from: 0.5 * scale, to: 1.3 * scale },
      alpha: { from: 1, to: 0 },
      duration: 90,
      onComplete: () => flash.destroy()
    });
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    sfx.play('playerHurt');
    // Короткая вспышка красным при ударе
    this.setTintFill(0xff3333);
    this.sceneRef.time.delayedCall(80, () => this.clearTint());
    return this.hp === 0;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHP, this.hp + amount);
  }

  /**
   * Пополняем боезапас (пикап-ящик): каждому оружию из amounts,
   * шапка — 2× его начального боекомплекта (WEAPONS не мутируется).
   * Возвращает фактически добавленное — 0 означает «всё под шапки»,
   * пикап тогда честно остаётся лежать.
   */
  addAmmo(amounts) {
    let gained = 0;
    for (const [id, amount] of Object.entries(amounts)) {
      const w = this.weapons[id];
      if (!w || w.ammo === Infinity) continue;
      const cap = WEAPONS[id].ammo * 2;
      const add = Math.min(amount, Math.max(0, cap - w.ammo));
      w.ammo += add;
      gained += add;
    }
    return gained;
  }

  isDead() {
    return this.hp <= 0;
  }
}
