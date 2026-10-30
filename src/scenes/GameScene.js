import Phaser from 'phaser';
import Player from '../entities/Player.js';
import Bullet from '../entities/Bullet.js';
import { LEVELS, TILE } from '../data/levels.js';
import { WAVES_PER_LEVEL } from '../data/waves.js';
import { getBest, saveBest } from '../data/highscore.js';
import { DEPTH } from '../data/depth.js';
import { sfx } from '../audio/sfx.js';
import { buildLevel, updateVegetationVisibility } from '../world/LevelBuilder.js';
import { initPickups, spawnMedkit, spawnAmmoBox, updatePickups } from '../systems/PickupManager.js';
import { PICKUPS } from '../data/pickups.js';
import {
  resolveObstaclePenetration,
  resolveDynamicPenetration,
  depenetrate,
  evictPair,
  evictOut,
  wouldHitObstacle,
  shiftSprite
} from '../physics/depenetration.js';
import { clampBulletRange } from '../physics/raycast.js';
import {
  manageWaves as manageWavesSys,
  startWave as startWaveSys,
  spawnZombie as spawnZombieSys,
  findSpawnPoint as findSpawnPointSys,
  pointInObstacle as pointInObstacleSys
} from '../systems/WaveManager.js';

/**
 * Игровая сцена: «сборка + коллайдеры + игровые события».
 * Прикладные подсистемы вынесены в модули:
 *  - world/LevelBuilder   — пол, препятствия, растительность, кэш геометрии;
 *  - physics/depenetration— выталкивание тел из препятствий, разводка пар;
 *  - physics/raycast      — обрезка дальности пуль (вместо физ-коллайдера);
 *  - systems/WaveManager  — волны, спавн зомби, точки спавна.
 * Делегаты ниже преследуют цель: debug-скрипты и Player.js продолжают
 * работать с прежним API сцены (scene.clampBulletRange(...) и т.п.).
 */
export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    this.levelIndex = data.levelIndex ?? 0;
    this.gameState = 'playing'; // playing | over | won
    this.score = this.registry.get('score') ?? 0;
  }

  create() {
    const level = LEVELS[this.levelIndex];

    // Guard рассинхрона LEVELS ↔ WAVES_PER_LEVEL (ревью №4 мелочей):
    // разваливаемся с понятной ошибкой, а не с undefined в manageWaves
    this.levelWaves = WAVES_PER_LEVEL[this.levelIndex];
    if (!this.levelWaves) {
      console.error(`Нет раскладки волн для уровня ${this.levelIndex} — проверь WAVES_PER_LEVEL (уровней: ${LEVELS.length})`);
      this.levelWaves = WAVES_PER_LEVEL[0];
    }

    // Границы арены — из описания уровня (в тайлах), не из хардкода
    this.worldSize = {
      width: level.width * TILE,
      height: level.height * TILE
    };

    this.physics.world.setBounds(0, 0, this.worldSize.width, this.worldSize.height);

    buildLevel(this, level);
    this.createPlayer(level);
    this.createBullets();
    this.createZombies();
    this.createPickups();
    this.createInput();
    this.createCamera();
    this.createEffects();
    this.createUi();

    // Выталкивание «задавленных» тел из препятствий + разводка динамических
    // пар (конвои зомби, игрок↔зомби) после шага физики.
    // ВАЖНО: подписка счищается в shutdown, иначе каждый scene.restart
    // добавляет ещё один обработчик (кадры дублируют всю физику).
    this.events.on('postupdate', this.postUpdate, this);
    this.events.once('shutdown', () => {
      this.events.off('postupdate', this.postUpdate, this);
    });

    // Волны (nextWaveAt выставит manageWaves на первой паузе)
    this.waveIdx = -1;
    this.pendingSpawns = 0;
    this.waveTimerStarted = false;

    this.showLevelBanner(level.name);
  }

  /* ---------- Игрок ---------- */

  createPlayer(level) {
    this.player = new Player(
      this,
      level.playerSpawn.tx * TILE + TILE / 2,
      level.playerSpawn.ty * TILE + TILE / 2
    );

    this.physics.add.collider(this.player, this.obstacles);
    this.player.bindWeaponKeys();
  }

  createInput() {
    this.crosshair = this.add.graphics({ add: false });
    this.crosshair.setScrollFactor(0);
    this.crosshair.setDepth(DEPTH.UI_CROSSHAIR); // поверх крон/кустов (depth 20)

    this.input.keyboard.on('keydown-R', () => {
      if (this.gameState === 'over') this.scene.restart({ levelIndex: this.levelIndex });
    });
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.gameState !== 'playing') this.scene.start('Menu');
    });
  }

  /* ---------- Пули ---------- */

  createBullets() {
    // Пул пуль: reuse через group.get() в Player.fireBullet.
    // Коллайдер пуль с препятствиями НЕ нужен:
    // clampBulletRange() отсекает дальность лучом точно по грани препятствия.
    this.bullets = this.physics.add.group({
      classType: Bullet,
      defaultKey: 'bullet',
      maxSize: 90   // веер дробовика + автомат в очереди
    });
  }

  /* ---------- Зомби ---------- */

  createZombies() {
    this.zombies = this.physics.add.group();

    // ВАЖЕН ПОРЯДОК: пары «динамик↔динамик» регистрируются раньше
    // «динамик↔статик», чтобы сепарация препятствия была последней
    // и тела всегда оставались вне ящиков/стен (иначе толпа
    // продавливает зомби/игрока внутрь препятствий).

    // Атака при контакте с игроком
    this.physics.add.collider(this.player, this.zombies, (p, zombie) => {
      if (this.gameState !== 'playing') return;
      if (zombie.canAttack(this.time.now)) {
        this.player.takeDamage(zombie.damage);
        this.cameras.main.shake(90, 0.006);
        if (this.player.isDead()) this.endGame('over');
      }
    });

    // Зомби расталкиваются между собой
    this.physics.add.collider(this.zombies, this.zombies);

    // Зомби упираются в препятствия (обеспечивает выход из ящика после толчка)
    this.physics.add.collider(this.zombies, this.obstacles);

    // Попадания пуль
    this.physics.add.overlap(
      this.bullets,
      this.zombies,
      (bullet, zombie) => this.onBulletHit(bullet, zombie),
      (bullet, zombie) => bullet.active && zombie.active
    );
  }

  onBulletHit(bullet, zombie) {
    if (!zombie.active) return;
    const dir = { x: Math.cos(bullet.rotation), y: Math.sin(bullet.rotation) };
    bullet.kill();
    sfx.play('hit');

    this.spawnBlood(zombie.x, zombie.y, 4);

    if (zombie.takeHit(bullet.damage)) {
      this.killZombie(zombie, dir);
    } else {
      zombie.applyKnockback(dir.x, dir.y, bullet.knockback ?? 0);
    }
  }

  killZombie(zombie, dir) {
    this.score += zombie.score;
    this.registry.set('score', this.score);
    sfx.play('zombieDeath');
    this.maybeDropPickup(zombie.x, zombie.y);
    this.spawnBlood(zombie.x, zombie.y, 14, dir);
    zombie.destroy();
  }

  /* ---------- Пикапы ---------- */

  createPickups() {
    initPickups(this);
  }

  /** Выпадение после смерти зомби: сначала медкит, иначе — боезапас */
  maybeDropPickup(x, y) {
    if (Math.random() < PICKUPS.medkit.dropChance) {
      spawnMedkit(this, x, y);
    } else if (Math.random() < PICKUPS.ammoBox.dropChance) {
      spawnAmmoBox(this, x, y);
    }
  }

  /* ---------- Эффекты ---------- */

  createEffects() {
    // Радиальный всплеск (немотивированный) + направленный (по ходу пули).
    // Направленный эмиттер перестраивает угол лениво, с привязкой к 10° —
    // иначе setConfig на каждое попадание пересобирал бы конфиг эмиттера.
    this.bloodEmitter = this.add.particles(0, 0, 'blood', {
      lifespan: { min: 300, max: 600 },
      speed: { min: 40, max: 160 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      emitting: false
    });
    this.bloodEmitter.setDepth(DEPTH.BLOOD);

    this.bloodBeam = this.add.particles(0, 0, 'blood', {
      lifespan: { min: 300, max: 600 },
      speed: { min: 60, max: 180 },
      angle: { min: -30, max: 30 },
      scale: { start: 1, end: 0 },
      emitting: false
    });
    this.bloodBeam.setDepth(DEPTH.BLOOD);
    this.bloodAngleBucket = null;
  }

  spawnBlood(x, y, count, dir = null) {
    if (!dir) {
      this.bloodEmitter.emitParticleAt(x, y, count);
      return;
    }
    const deg = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    const bucket = Math.round(deg / 10);
    if (this.bloodAngleBucket !== bucket) {
      this.bloodAngleBucket = bucket;
      this.bloodBeam.setConfig({
        angle: { min: bucket * 10 - 30, max: bucket * 10 + 30 }
      });
    }
    this.bloodBeam.emitParticleAt(x, y, count);
  }

  /* ---------- Камера и UI ---------- */

  createCamera() {
    this.cameras.main.setBounds(0, 0, this.worldSize.width, this.worldSize.height);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
  }

  /** HUD живёт в отдельной UIScene (текст не мигает от поворота камеры) */
  createUi() {
    // Перезапускаем HUD при каждом входе в сцену; «спящая»/задержанная UI
    // не считается активной — launch ставит её в очередь заново
    if (!this.scene.isActive('UI') && !this.scene.isSleeping('UI')) {
      this.scene.launch('UI');
    }
    this.banner = this.add
      .text(this.scale.width / 2, this.scale.height * 0.4, '', {
        fontFamily: 'Arial',
        fontSize: '34px',
        color: '#8ce68c',
        stroke: '#16321a',
        strokeThickness: 5,
        align: 'center'
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.BANNER)
      .setAlpha(0);
  }

  showLevelBanner(name) {
    this.banner
      .setText(`Уровень ${this.levelIndex + 1}\n${name}`)
      .setAlpha(1);
    this.tweens.add({
      targets: this.banner,
      alpha: 0,
      delay: 1400,
      duration: 600
    });
  }

  /* ---------- Делегаты подсистем ----------
   * Тонкие обёртки: GameScene остаётся единым API-фасадом для
   * Player.js и debug-скриптов, логика живёт в модулях. */

  postUpdate() {
    resolveObstaclePenetration(this);
    resolveDynamicPenetration(this);
  }

  resolveObstaclePenetration() {
    resolveObstaclePenetration(this);
  }

  resolveDynamicPenetration() {
    resolveDynamicPenetration(this);
  }

  depenetrate(sprite) {
    depenetrate(this, sprite);
  }

  evictPair(a, b) {
    evictPair(this, a, b);
  }

  evictOut(sprite, axis, dir, overlap, share) {
    evictOut(this, sprite, axis, dir, overlap, share);
  }

  wouldHitObstacle(sprite, axis, dir, dist) {
    wouldHitObstacle(this, sprite, axis, dir, dist);
  }

  shiftSprite(sprite, axis, d) {
    shiftSprite(this, sprite, axis, d);
  }

  clampBulletRange(x0, y0, angle, maxRange) {
    return clampBulletRange(this, x0, y0, angle, maxRange);
  }

  manageWaves(time) {
    manageWavesSys(this, time);
  }

  startWave() {
    startWaveSys(this);
  }

  spawnZombie(typeId) {
    spawnZombieSys(this, typeId);
  }

  findSpawnPoint() {
    return findSpawnPointSys(this);
  }

  pointInObstacle(x, y) {
    return pointInObstacleSys(this, x, y);
  }

  updateVegetationVisibility() {
    updateVegetationVisibility(this);
  }

  getBullets() {
    return this.bullets;
  }

  /* ---------- Завершение ---------- */

  /** Экран завершения: снимаем приглушение «под кроной/в кусте»,
   *  иначе юниты остаются призраками с α=0.55 поверх надписи
   *  (updateVegetationVisibility работает только при playing). */
  restoreUnitAlpha() {
    if (this.player?.active) this.player.setAlpha(1);
    // Оружие в руках живёт собственной альфой (syncWeaponSprite в update)
    if (this.player?.weaponSprite?.active) this.player.weaponSprite.setAlpha(1);
    for (const z of this.zombies.children.entries) {
      if (z.active) z.setAlpha(1);
    }
  }

  levelCompleted() {
    this.gameState = 'won';
    this.restoreUnitAlpha();
    const next = this.levelIndex + 1;
    if (next < LEVELS.length) {
      sfx.play('levelWin');
      this.banner
        .setText(`Уровень ${this.levelIndex + 1} пройден!\nСчёт: ${this.score}`)
        .setAlpha(1);
      this.time.delayedCall(1800, () => {
        this.registry.set('score', this.score);
        this.scene.restart({ levelIndex: next });
      });
    } else {
      sfx.play('allLevelsWin');
      const record = saveBest(this.score);
      this.banner
        .setText([
          'ВСЕ УРОВНИ ПРОЙДЕНЫ!',
          `Итоговый счёт: ${this.score}`,
          record ? 'НОВЫЙ РЕКОРД!' : `Рекорд: ${getBest()}`,
          '',
          'ПРОБЕЛ — в меню'
        ].join('\n'))
        .setAlpha(1);
    }
  }

  endGame(state) {
    this.gameState = state;
    this.zombies.children.entries.forEach((z) => z.body.stop());
    this.restoreUnitAlpha();
    sfx.play('gameOver');
    saveBest(this.score);
    this.banner
      .setText([
        'ВЫ ПОГИБЛИ',
        `Счёт: ${this.score}`,
        `Рекорд: ${getBest()}`,
        '',
        'R — заново, ПРОБЕЛ — меню'
      ].join('\n'))
      .setAlpha(1);
  }

  /* ---------- Обновление ---------- */

  update(time) {
    if (this.gameState === 'playing') {
      this.player.update(time);
      this.zombies.children.entries.forEach((z) => z.update(time, 'playing'));
      this.manageWaves(time);
      this.updateVegetationVisibility();
      updatePickups(this);
    }

    this.drawCrosshair();
  }

  drawCrosshair() {
    const pointer = this.input.activePointer;
    this.crosshair.clear();
    this.crosshair.lineStyle(1.5, 0xff6666, 0.9);
    this.crosshair.strokeCircle(pointer.x, pointer.y, 6);
    this.crosshair.lineBetween(pointer.x - 9, pointer.y, pointer.x - 4, pointer.y);
    this.crosshair.lineBetween(pointer.x + 4, pointer.y, pointer.x + 9, pointer.y);
    this.crosshair.lineBetween(pointer.x, pointer.y - 9, pointer.x, pointer.y - 4);
    this.crosshair.lineBetween(pointer.x, pointer.y + 4, pointer.x, pointer.y + 9);
  }
}
