import Phaser from 'phaser';

/**
 * Загрузка всех игровых ассетов.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Персонажи (вид сверху, смотрят вправо)
    this.load.image('player', 'assets/characters/player.png');
    this.load.image('zombie', 'assets/characters/zombie.png');

    // Тайлы карты (вырезаны из тайлшита Kenney)
    this.load.image('floorTile', 'assets/tiles/tile_floor.png');
    this.load.image('crateTile', 'assets/tiles/tile_crate.png');
    this.load.image('wallTile', 'assets/tiles/tile_wall.png');

    // Растительность (пререндер GLB → PNG, см. debug/render_veg.mjs)
    this.load.image('oakTree', 'assets/environment/oak_tree.png');
    this.load.image('bush', 'assets/environment/bush.png');
  }

  create() {
    this.generateEffectTextures();
    this.scene.start('Menu');
  }

  generateEffectTextures() {
    const g = this.add.graphics();

    // Пуля: короткий жёлтый трассер
    g.fillStyle(0xffdd66, 1);
    g.fillRoundedRect(0, 0, 12, 4, 2);
    g.generateTexture('bullet', 12, 4);
    g.clear();

    // Прозрачная заглушка для круглого тела ствола (визуал — у кроны oakTree)
    g.generateTexture('trunkMask', 26, 26);
    g.clear();

    // Вспышка из ствола
    g.fillStyle(0xfff2b0, 0.85);
    g.fillCircle(8, 8, 8);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 4);
    g.generateTexture('muzzleFlash', 16, 16);
    g.clear();

    // Капля крови
    g.fillStyle(0xbb2232, 1);
    g.fillCircle(3, 3, 3);
    g.generateTexture('blood', 6, 6);
    g.clear();

    // Аптечка: светлый кейс с красным крестом
    g.fillStyle(0xf4f4f4, 1);
    g.fillRect(0, 0, 16, 16);
    g.lineStyle(1, 0x2a2a38, 1);
    g.strokeRect(0.5, 0.5, 15, 15);
    g.fillStyle(0xc93030, 1);
    g.fillRect(6.5, 3, 3, 10); // вертикаль креста
    g.fillRect(3, 6.5, 10, 3); // горизонталь
    g.generateTexture('medkit', 16, 16);
    g.clear();

    // Ящик боезапаса: тёмно-оливковый с жёлтыми пулями
    g.fillStyle(0x5a5240, 1);
    g.fillRect(0, 0, 18, 14);
    g.lineStyle(1, 0x2a2a24, 1);
    g.strokeRect(0.5, 0.5, 17, 13);
    g.fillStyle(0xffdd66, 1);
    g.fillRect(4, 3, 2, 8);   // три «пули» — вертикальные штрихи сверху
    g.fillRect(8, 3, 2, 8);
    g.fillRect(12, 3, 2, 8);
    g.generateTexture('ammoBox', 18, 14);
    g.clear();

    g.destroy();
  }
}
