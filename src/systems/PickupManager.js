/* ---------- Пикапы ----------
 * Из убитых зомби падают аптечки и ящики боезапаса (шансы из
 * data/pickups.js), лежат ограниченное время с мягким пульсом
 * прозрачности и подбираются при касании игроком.
 *
 * Правило «честности»: пикап, который сейчас бесполезен
 * (аптечка при полном HP; ящик, когда всё оружие под шапками),
 * не расходуется — лежит дальше для следующей нужды.
 *
 * Разбор: подбор — ручная проверка расстояния в updatePickups, а не
 * Arcade-overlap: у пикапов нет тел, они на экране единицы и O(kits)
 * за кадр ничего не стоит; детерминированно и тест-дружелюбно.
 *
 * Данные: scene.player, scene.gameState. Результат: scene.pickups
 * (создание в initPickups). Сцене достаточно вызывать
 * initPickups(this), spawnMedkit/spawnAmmoBox(this, x, y) и
 * updatePickups(this) в update при playing. */

import { PICKUPS } from '../data/pickups.js';
import { DEPTH } from '../data/depth.js';
import { sfx } from '../audio/sfx.js';

const PICKUP_DIST = 28; // радиус подбора (центр игрока ↔ центр пикапа)

export function initPickups(scene) {
  // Чистое присваивание, не ??=: инстанс сцены переживает restart, а
  // старые изображения уничтожаются shutdown'ом — ссылки им не нужны,
  // накопление мёртвых записей между рестартами уровня недопустимо.
  scene.pickups = [];
}

export function spawnMedkit(scene, x, y, opts = {}) {
  const cfg = { ...PICKUPS.medkit, ...opts };
  return spawnPickup(scene, x, y, 'medkit', cfg, { kind: 'medkit', heal: cfg.heal });
}

export function spawnAmmoBox(scene, x, y, opts = {}) {
  const cfg = { ...PICKUPS.ammoBox, ...opts };
  return spawnPickup(scene, x, y, 'ammoBox', cfg, { kind: 'ammoBox', amounts: cfg.amounts });
}

function spawnPickup(scene, x, y, texture, cfg, data) {
  const kit = scene.add.image(x, y, texture).setDepth(DEPTH.PICKUP);
  Object.assign(kit, data);

  scene.pickups.push(kit);

  // Лёгкий пульс прозрачности: жив-лежит на полу
  scene.tweens.add({
    targets: kit,
    alpha: { from: 1, to: 0.55 },
    duration: 600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut'
  });

  // Уборка вне зависимости от подбора
  scene.time.delayedCall(cfg.lifetime, () => {
    if (kit.active) kit.destroy();
  });
  return kit;
}

/** Ежекадровая проверка подбора: только при playing */
export function updatePickups(scene) {
  if (!scene.player) return;
  const player = scene.player;
  for (const kit of scene.pickups) {
    if (!kit.active) continue;
    const dx = player.x - kit.x;
    const dy = player.y - kit.y;
    if (dx * dx + dy * dy > PICKUP_DIST * PICKUP_DIST) continue;
    collect(scene, kit);
  }
}

function collect(scene, kit) {
  if (!kit.active || scene.gameState !== 'playing') return;
  const player = scene.player;

  if (kit.kind === 'medkit') {
    if (player.hp >= player.maxHP) return; // полное здоровье — лежит дальше
    player.heal(kit.heal);
  } else if (kit.kind === 'ammoBox') {
    const gained = player.addAmmo(kit.amounts);
    if (gained === 0) return; // всё оружие под шапками — лежит дальше
  }

  sfx.play(kit.kind);

  // Вспышка игрока сигнализирует эффект: лечение — зелёный, боезапас — жёлтый
  player.setTintFill(kit.kind === 'medkit' ? 0x6ce86c : 0xffdd66);
  scene.time.delayedCall(90, () => player.clearTint());

  kit.destroy();
}
