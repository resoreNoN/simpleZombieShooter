/* ---------- Луч пуля → препятствие ----------
 * Физический коллайдер пуль с препятствиями не используется:
 * Arcade-сепарация позволяла пуле пролетать насквозь и «умирать в воздухе».
 * Вместо этого дальность отсекается прямой лучевой проверкой (slab method)
 * по AABB статических тел и границам мира.
 *
 * Данные: scene.worldSize, scene.obstacleCache, scene.treeList. */

import { TILE } from '../data/levels.js';

export function clampBulletRange(scene, x0, y0, angle, maxRange) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let range = maxRange;

  // Границы мира
  if (dx !== 0) {
    const t = (dx > 0 ? scene.worldSize.width - x0 : -x0) / dx;
    if (t >= 0) range = Math.min(range, t);
  }
  if (dy !== 0) {
    const t = (dy > 0 ? scene.worldSize.height - y0 : -y0) / dy;
    if (t >= 0) range = Math.min(range, t);
  }

  // Препятствия: ближайшая грань по лучу.
  // Луч считаем по границам ТАЙЛА 64px (визуальной грани), а не по расширенным
  // физическим телам (~75.9px: спрайты растянуты, чтобы глиф Kenney без щелей
  // заполнял тайл). Иначе дуло, прижатое вплотную, попадает внутрь тела
  // и рейкаст даёт эффективную дальность ~0 — пуля вообще не появляется.
  for (const o of scene.obstacleCache) {
    // Стволы (круговые тела) считаются отдельным проходом ниже,
    // тайловый AABB-проход их не должен видеть
    if (o.skipRay) continue;
    // Тайловый AABB визуальной грани: центр тела ≠ центр спрайта
    // (спрайты растянуты ~75.9/78.8px, глиф Kenney занимает 64px)
    const minX = o.x + (o.w - TILE) / 2;
    const maxX = minX + TILE;
    const minY = o.y + (o.h - TILE) / 2;
    const maxY = minY + TILE;

    let tx0 = -Infinity;
    let tx1 = Infinity;
    if (dx !== 0) {
      tx0 = (minX - x0) / dx;
      tx1 = (maxX - x0) / dx;
      if (tx0 > tx1) [tx0, tx1] = [tx1, tx0];
    } else if (x0 < minX || x0 > maxX) continue;

    let ty0 = -Infinity;
    let ty1 = Infinity;
    if (dy !== 0) {
      ty0 = (minY - y0) / dy;
      ty1 = (maxY - y0) / dy;
      if (ty0 > ty1) [ty0, ty1] = [ty1, ty0];
    } else if (y0 < minY || y0 > maxY) continue;

    const tEntry = Math.max(tx0, ty0);
    const tExit = Math.min(tx1, ty1);

    // Прямоугольник целиком позади луча — уже не промах, а «не в этом направлении»
    if (tExit < 0) continue;
    if (tEntry > tExit) continue; // промах мимо прямоугольника

    if (tEntry >= 0) {
      range = Math.min(range, tEntry);
    } else {
      // Дуло внутри препятствия — пуля не летит вовсе
      return 0;
    }
  }

  // Стволы деревьев: отдельный проход «луч↔круг» (не по тайлам —
  // выше по коду рейкаст завязан на TILE/2, а ствол всего 13px)
  for (const tree of scene.treeList ?? []) {
    const fx = x0 - tree.x;
    const fy = y0 - tree.y;
    const c = fx * fx + fy * fy - tree.r * tree.r;
    if (c < 0) return 0; // дуло внутри ствола

    const b = 2 * (fx * dx + fy * dy);
    const disc = b * b - 4 * c;
    if (disc < 0) continue;

    const t = (-b - Math.sqrt(disc)) / 2; // ближняя точка входа
    if (t >= 0 && t < range) range = t;
  }

  return range;
}
