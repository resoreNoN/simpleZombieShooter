/* ---------- Депентрация и разводка динамических пар ----------
 * Arcade-сепарация не справляется, когда динамическое тело задавлено
 * в статическое (игрок/толпа продавливает зомби в ящик) — оно «залипает»
 * внутри. Каждый кадр после обработки коллайдеров доталкиваем
 * игрока и зомби наружу, вдоль ближайшей грани препятствия.
 *
 * Пары поверх Arcade: Arcade-сепарация не разводит динамики, у которых
 * равные скорости по оси («конвой» — толпа зомби идёт к игроку колонной):
 * GetOverlapX/Y при равных _dx/_dy просто не находят перекрытия. А тела,
 * уже зашедшие глубоко (overlap больше сдвига за шаг + bias), сепаратор
 * отказывается разъезжать вовсе, чтобы не «ловить туннелинг» — пара
 * навеки залипает. Поэтому после шага физики вручную разводим
 * зомби↔зомби (пополам) и игрок↔зомби (целиком зомби, игрок сам
 * не толкается).
 *
 * Данные: scene.player, scene.zombies, scene.obstacleCache. */

export function resolveObstaclePenetration(scene) {
  if (!scene.player || !scene.player.body) return;
  depenetrate(scene, scene.player);
  for (const z of scene.zombies.children.entries) {
    if (z.active && z.body) depenetrate(scene, z);
  }
}

export function depenetrate(scene, sprite) {
  const b = sprite.body;
  for (const o of scene.obstacleCache) {
    if (b.right <= o.x || b.x >= o.x + o.w || b.bottom <= o.y || b.y >= o.y + o.h) continue;

    // Расстояния для выхода по каждой из четырёх граней (верх тела > грани)
    const left = b.right - o.x;
    const right = (o.x + o.w) - b.x;
    const up = b.bottom - o.y;
    const down = (o.y + o.h) - b.y;
    const min = Math.min(left, right, up, down);

    if (min === left)      sprite.x -= left + 0.5;
    else if (min === right) sprite.x += right + 0.5;
    else if (min === up)    sprite.y -= up + 0.5;
    else                    sprite.y += down + 0.5;

    // Тело пересчитается по спрайту в следующем preUpdate
    b.updateFromGameObject();
  }
}

export function resolveDynamicPenetration(scene) {
  if (!scene.player || !scene.player.body) return;
  const dynamics = [scene.player, ...scene.zombies.children.entries.filter((z) => z.active && z.body?.enable)];
  for (let i = 0; i < dynamics.length; i++) {
    for (let j = i + 1; j < dynamics.length; j++) {
      evictPair(scene, dynamics[i], dynamics[j]);
    }
  }
}

export function evictPair(scene, a, b) {
  const A = a.body;
  const B = b.body;
  const ox = Math.min(A.right, B.right) - Math.max(A.x, B.x);
  const oy = Math.min(A.bottom, B.bottom) - Math.max(A.y, B.y);
  if (ox <= 0 || oy <= 0) return;

  // Разводим по оси с меньшим перекрытием
  const horizontal = ox <= oy;
  const overlap = horizontal ? ox : oy;
  const axis = horizontal ? 'x' : 'y';
  // Направление наружу: из центра a к центру b
  const dir = Math.sign(B.center[axis] - A.center[axis]) || 1;

  const player = a === scene.player ? a : b === scene.player ? b : null;
  const zombie = player === a ? b : a;

  if (player) {
    // Игрока не сдвигаем — выталкиваем зомби целиком
    const d = player === a ? dir : -dir;
    const moved = evictOut(scene, zombie, axis, d, overlap, 1);
    if (!moved) {
      // Зомби зажат препятствием — притесняем игрока (толпа в узком проёме)
      if (!wouldHitObstacle(scene, player, axis, -d, overlap)) {
        shiftSprite(scene, player, axis, -d * (overlap + 0.5));
      }
    }
  } else {
    // Зомби↔зомби: каждый отступает на половину
    const movedA = evictOut(scene, a, axis, -dir, overlap, 0.5);
    const movedB = evictOut(scene, b, axis, dir, overlap, 0.5);
    // Если одна из половин упёрлась в препятствие, вторая дочищает остальное
    if (!movedA && movedB) evictOut(scene, b, axis, dir, overlap, 0.5);
    else if (!movedB && movedA) evictOut(scene, a, axis, -dir, overlap, 0.5);
  }
}

export function evictOut(scene, sprite, axis, dir, overlap, share) {
  const d = dir * (overlap * share + 0.25);
  if (wouldHitObstacle(scene, sprite, axis, dir, overlap * share)) return false;
  if (axis === 'x') sprite.x += d;
  else sprite.y += d;
  sprite.body.updateFromGameObject();
  return true;
}

// Не упрётся ли тело спрайта в препятствие, если сместить его по оси на overlap
export function wouldHitObstacle(scene, sprite, axis, dir, dist) {
  const b = sprite.body;
  const nx = axis === 'x' ? b.x + dir * dist : b.x;
  const ny = axis === 'y' ? b.y + dir * dist : b.y;
  for (const o of scene.obstacleCache) {
    if (
      o.x + o.w > nx + 0.5 &&
      o.x < nx + b.width - 0.5 &&
      o.y + o.h > ny + 0.5 &&
      o.y < ny + b.height - 0.5
    ) return true;
  }
  return false;
}

export function shiftSprite(scene, sprite, axis, d) {
  if (axis === 'x') sprite.x += d;
  else sprite.y += d;
  sprite.body.updateFromGameObject();
}
