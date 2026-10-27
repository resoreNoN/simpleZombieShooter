/* ---------- Построение уровня ----------
 * Пол тайлами, статические препятствия (ящики/стены), растительность
 * (деревья с круглым стволом + кусты) и плоский кэш геометрии препятствий.
 *
 * Дерево: крона — просто картинка поверх юнитов (depth 20),
 * ствол — невидимое КРУГЛОЕ статическое тело в общей группе obstacles:
 * коллайдеры и депентрация работают через AABB bounding-бокса,
 * поэтому для них круг неотличим от вписанного квадрата.
 * Куст — чистый декор: проходной, скрывает юнитов под собой.
 *
 * Данные: scene.worldSize. Результат: scene.obstacles, scene.treeList,
 * scene.bushList, scene.obstacleCache. */

import { TILE } from '../data/levels.js';
import { DEPTH } from '../data/depth.js';

/* Растительность */
const TREE_TRUNK_R = 13;      // радиус коллизии ствола
const TREE_HIDE_R = 38;       // радиус кроны (половина ширины спрайта 76px)
const BUSH_HIDE_R = 23;       // радиус куста (половина спрайта 46px)
const HIDDEN_ALPHA = 0.55;    // юнит под кроной/в кусте
const VEG_DEPTH = DEPTH.VEG;  // кроны/кусты поверх юнитов (10), под пулями (30)

export function buildLevel(scene, level) {
  scene.add
    .tileSprite(0, 0, scene.worldSize.width, scene.worldSize.height, 'floorTile')
    .setOrigin(0);

  scene.obstacles = scene.physics.add.staticGroup();

  /** Глифы внутри тайлов Kenney не занимают все 64px:
   *  ящик — 54px (поля по 5px), стена — 52px (поля по 6px).
   *  Масштабируем спрайт так, чтобы глиф заполнял тайл целиком,
   *  а соседние ящики/стены соприкасались без «травяных» щелей. */
  const crateDisplay = (TILE * TILE) / (TILE - 10); // ≈75.9
  const wallDisplay = (TILE * TILE) / (TILE - 12);  // ≈78.8

  level.crates.forEach(({ tx, ty }) => {
    const crate = scene.obstacles.create(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'crateTile');
    crate.setDisplaySize(crateDisplay, crateDisplay).refreshBody();
  });

  level.wallRuns.forEach(({ from, length, vertical }) => {
    for (let i = 0; i < length; i++) {
      const tx = vertical ? from.tx : from.tx + i;
      const ty = vertical ? from.ty + i : from.ty;
      const wall = scene.obstacles.create(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'wallTile');
      wall.setDisplaySize(wallDisplay, wallDisplay).refreshBody();
    }
  });

  buildVegetation(scene, level);

  // Препятствия статичны: один раз снимаем их геометрию в плоский кэш,
  // чтобы depenetrate/wouldHitObstacle/рейкаст/спавн не ходили по
  // children.entries и не читали body.* каждый вызов
  scene.obstacleCache =
    scene.obstacles.children.entries
      .filter((ob) => ob.body)
      .map((ob) => {
        const o = ob.body;
        return {
          x: o.x,            // AABB bounding-бокса (у круга — вписанный квадрат)
          y: o.y,
          w: o.width,
          h: o.height,
          // Круговые тела (стволы) из тайлового AABB-прохода рейкаста исключены:
          // для них есть отдельный «луч↔круг» в clampBulletRange
          skipRay: !!o.isCircle
        };
      });
}

function buildVegetation(scene, level) {
  scene.treeList = [];
  scene.bushList = [];

  (level.trees ?? []).forEach(({ tx, ty }) => {
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;

    scene.add.image(x, y, 'oakTree').setDepth(VEG_DEPTH);

    // Невидимое круглое тело ствола: текстура 26×26 → setCircle центрирует круг
    const trunk = scene.obstacles.create(x, y, 'trunkMask');
    trunk.setVisible(false);
    trunk.body.setCircle(TREE_TRUNK_R);

    scene.treeList.push({ x, y, r: TREE_TRUNK_R, hideR: TREE_HIDE_R });
  });

  (level.bushes ?? []).forEach(({ tx, ty }) => {
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;
    scene.add.image(x, y, 'bush').setDepth(VEG_DEPTH);
    scene.bushList.push({ x, y, hideR: BUSH_HIDE_R });
  });
}

/* Юнит под кроной дерева или в кусте приглушается — объект «не виден
   через листву». Переключение мгновенное, без твинтов (считается дёшево). */
export function updateVegetationVisibility(scene) {
  const units = [scene.player, ...scene.zombies.children.entries];
  for (const u of units) {
    if (!u.active) continue;
    let hidden = false;
    for (const tree of scene.treeList) {
      const dx = u.x - tree.x;
      const dy = u.y - tree.y;
      if (dx * dx + dy * dy < tree.hideR * tree.hideR) {
        hidden = true;
        break;
      }
    }
    if (!hidden) {
      for (const bush of scene.bushList) {
        const dx = u.x - bush.x;
        const dy = u.y - bush.y;
        if (dx * dx + dy * dy < bush.hideR * bush.hideR) {
          hidden = true;
          break;
        }
      }
    }
    const target = hidden ? HIDDEN_ALPHA : 1;
    if (u.alpha !== target) u.setAlpha(target);
  }
}
