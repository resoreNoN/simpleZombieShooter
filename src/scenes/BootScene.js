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

    /* Оружие в руках игрока: силуэты «смотрят вправо», правая грань
       полотна = кончик ствола (origin спрайта оружия — (1, 0.5)),
       поэтому любой из них упирается ровно в точку muzzleLocal.
       Пропорции сознательно контрастные (11×4 / 22×6 / 19×7),
       чтобы смена оружия читалась одним глазом. */

    // Пистолет: короткая болванка с рукоятью
    g.fillStyle(0x3a3a44, 1);
    g.fillRect(0, 1, 11, 2);                // ствол/затвор
    g.fillStyle(0x6a6a78, 1);
    g.fillRect(3, 1, 8, 1);                 // блик сверху
    g.fillStyle(0x24242c, 1);
    g.fillRect(0, 2, 3, 2);                 // рукоять
    g.generateTexture('w_pistol', 11, 4);
    g.clear();

    // Дробовик: ложа + приклад, двойной ствол, цевьё посередине
    g.fillStyle(0x6b4a2f, 1);
    g.fillRect(0, 1, 6, 4);                 // деревянный приклад
    g.fillStyle(0x44444e, 1);
    g.fillRect(6, 1, 4, 3);                 // ресивер
    g.fillStyle(0x7d5a39, 1);
    g.fillRect(10, 3, 6, 2);                // цевьё
    g.fillStyle(0x51525c, 1);
    g.fillRect(6, 0, 16, 1);                // верхний ствол
    g.fillStyle(0x33333c, 1);
    g.fillRect(6, 4, 16, 2);                // нижний ствол
    g.fillStyle(0x8a8a96, 1);
    g.fillRect(19, 0, 3, 1);                // блик дульного среза
    g.generateTexture('w_shotgun', 22, 6);
    g.clear();

    // Автомат: приклад, приёмник, тонкий ствол, магазин вниз
    g.fillStyle(0x39343a, 1);
    g.fillRect(0, 2, 4, 4);                 // приклад
    g.fillStyle(0x3a3a44, 1);
    g.fillRect(4, 2, 5, 3);                 // ресивер
    g.fillStyle(0x666a72, 1);
    g.fillRect(9, 2, 10, 2);                // светлый ствол
    g.fillStyle(0x2b2b32, 1);
    g.fillRect(6, 5, 3, 2);                 // магазин
    g.generateTexture('w_rifle', 19, 7);
    g.clear();

    g.destroy();
  }
}
