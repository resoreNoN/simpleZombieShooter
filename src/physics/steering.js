/* ---------- Рулевой обход препятствий (steering) ----------
 * Прямая погоня к игроку хороша на открытой арене, но упирание в бок
 * ящика/стены стопорит зомби навечно (collider гасит скорость, а
 * депетрация только выталкивает из препятствия — рулить она не умеет).
 *
 * Три ступени, от дешёвой к дорогой:
 *  1. Прямая линия к игроку видна (общий рейкаст — те же границы мира,
 *     тайлы и стволы, что у пуль) → бег в лоб, без искажений.
 *  2. Прямая заблокирована → пробы ±25°/±50°; лучшее свободное
 *     направление (максимум прогресса к игроку) держится 200 мс —
 *     гистерезис против дрожания на углу ящика.
 *  3. Пробы не помогли (все закрыты) или зомби отстаёт от ожидаемого
 *     хода >350 мс → путь по тайловой BFS-сетке (гарантия): сетка
 *     строится из obstacleCache/treeList один раз на уровень, путь
 *     ведёт ровно через ворота форта, коридоры и вокруг ящиков.
 *     Пока прямая не откроется, зомби идёт по waypoint'ам.
 *
 * Данные: scene.player, scene.navGrid (buildNavGrid в GameScene.create),
 * scene.obstacleCache, scene.treeList, scene.worldSize.
 * Состояние живёт на экземпляре зомби: steerAngle/steerUntil,
 * sampleX/sampleY/sampleAt, path/pathIdx/lastPathAt. */

import Phaser from 'phaser';
import { TILE } from '../data/levels.js';
import { clampBulletRange } from './raycast.js';

const TOUCH_TOL = 24;  // прямая «видна», если рейкаст не срезает её сильнее
const PROBES = [-50, -25, 0, 25, 50].map((d) => (d * Math.PI) / 180);
const PROBE_MIN = 60;  // минимальная свободная трасса для пробы (тело+запас)
const HOLD_MS = 200;   // гистерезис обходного направления
const STUCK_WINDOW = 350; // окно детектора застревания
const STUCK_MEFF = 0.25;  // сдвиг < 25% ожидаемого хода = застревание
const WAYPOINT_DIST = 12; // достижимость waypoint'а
const REPATH_MS = 1100;   // пересчёт пути, если совсем не идём по waypoint'ам

export function chaseAngle(scene, zombie, time, directAngle) {
  const player = scene.player;
  const dist = Phaser.Math.Distance.Between(zombie.x, zombie.y, player.x, player.y);
  if (dist < 1) return directAngle;

  /* 0. Книга движения: фактический ход против ожидаемого, независимо от
   * прочих веток. Шаг 2 ниже больше НЕ сбрасывает замер — иначе зомби,
   * вмерший в физический корпус стены (он чуть выше визуальной грани),
   * вечно «видел бы прямой путь» и никогда не доходил до BFS. */
  let needPath = false;
  if (zombie.sampleAt === undefined) {
    zombie.sampleAt = time;
    zombie.sampleX = zombie.x;
    zombie.sampleY = zombie.y;
  }
  if (time - zombie.sampleAt >= STUCK_WINDOW) {
    const moved = Phaser.Math.Distance.Between(zombie.x, zombie.y, zombie.sampleX, zombie.sampleY);
    const expected = zombie.speed * ((time - zombie.sampleAt) / 1000);
    needPath = moved < expected * STUCK_MEFF;
    zombie.sampleAt = time;
    zombie.sampleX = zombie.x;
    zombie.sampleY = zombie.y;
  }

  /* 1. Уже есть путь — идём по waypoint'ам, пока прямая не откроется */
  if (zombie.path) {
    // Совсем не идём по пути (толпа прижала) — пересчёт не чаще REPATH_MS
    if (!zombie.lastPathAt) zombie.lastPathAt = time;
    if (time - zombie.lastPathAt > REPATH_MS) {
      const moved = Math.abs(zombie.x - (zombie.sampleX ?? zombie.x)) +
        Math.abs(zombie.y - (zombie.sampleY ?? zombie.y));
      if (moved < 4) zombie.path = null; // сброс → пересчёт ниже
      zombie.lastPathAt = time;
      zombie.sampleX = zombie.x;
      zombie.sampleY = zombie.y;
    }
    if (zombie.path) {
      let wp = zombie.path[zombie.pathIdx];
      while (wp && Phaser.Math.Distance.Between(zombie.x, zombie.y, wp.x, wp.y) < WAYPOINT_DIST) {
        zombie.pathIdx++;
        wp = zombie.path[zombie.pathIdx];
      }
      if (wp) {
        const a = Phaser.Math.Angle.Between(zombie.x, zombie.y, wp.x, wp.y);
        zombie.steerAngle = a;
        zombie.steerUntil = time + HOLD_MS;
        return a;
      }
      zombie.path = null; // путь кончился — доверяем пробам/прямой
    }
  }

  /* 2. Прямая видна и ход нормальный — погоня в лоб, сброс обходного стейта */
  const raysClear = clampBulletRange(scene, zombie.x, zombie.y, directAngle, dist) >= dist - TOUCH_TOL;
  if (raysClear && !needPath) {
    zombie.steerUntil = 0;
    return directAngle;
  }

  /* 3. Ход нулевой (вмер в корпус стены / толпа) — путь по BFS-сетке сразу */
  if (needPath) {
    const path = findPath(scene, zombie.x, zombie.y, player.x, player.y);
    if (path) {
      zombie.path = path;
      zombie.pathIdx = 0;
      zombie.lastPathAt = time;
      const wp = path[0];
      return Phaser.Math.Angle.Between(zombie.x, zombie.y, wp.x, wp.y);
    }
    // Сетка не спала (клетка зомби отрезана) — падаем в пробы/прямую
  }

  /* 4. Гистерезис руления */
  if (time < zombie.steerUntil) return zombie.steerAngle;

  /* 5. Пробы направлений: максимум прогресса к игроку по свободной трассе */
  let best = null;
  for (const off of PROBES) {
    const a = directAngle + off;
    const free = clampBulletRange(scene, zombie.x, zombie.y, a, Math.min(dist, 220));
    if (free < PROBE_MIN) continue;
    const reach = Math.min(free, 90);
    const px = zombie.x + Math.cos(a) * reach;
    const py = zombie.y + Math.sin(a) * reach;
    const progress = Phaser.Math.Distance.Between(px, py, player.x, player.y);
    if (!best || progress < best.progress) best = { a, progress };
  }
  if (best) {
    zombie.steerAngle = best.a;
    zombie.steerUntil = time + HOLD_MS;
    return best.a;
  }

  /* 6. Все пробы заняты — не ждём детектор, строим путь сразу */
  const path = findPath(scene, zombie.x, zombie.y, player.x, player.y);
  if (path) {
    zombie.path = path;
    zombie.pathIdx = 0;
    zombie.lastPathAt = time;
    const wp = path[0];
    return Phaser.Math.Angle.Between(zombie.x, zombie.y, wp.x, wp.y);
  }

  /* 7. Сетка не спасла (не бывает) — гасим в прямой как раньше */
  return directAngle;
}

/* ---------- Навигационная сетка уровня (строится один раз на create) ---------- */

export function buildNavGrid(scene) {
  const cols = Math.ceil(scene.worldSize.width / TILE);
  const rows = Math.ceil(scene.worldSize.height / TILE);
  const cells = Array.from({ length: rows }, () => new Array(cols).fill(false));

  // Препятствия: тайловые AABB визуальных граней (как у рейкаста)
  for (const o of scene.obstacleCache) {
    const minX = o.x + (o.w - TILE) / 2;
    const maxX = minX + TILE;
    const minY = o.y + (o.h - TILE) / 2;
    const maxY = minY + TILE;
    for (let r = Math.floor(minY / TILE); r <= Math.floor((maxY - 1) / TILE); r++) {
      for (let c = Math.floor(minX / TILE); c <= Math.floor((maxX - 1) / TILE); c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) cells[r][c] = true;
      }
    }
  }

  // Стволы деревьев: круги, с запасом на габарит тела зомби
  for (const tree of scene.treeList ?? []) {
    const pad = tree.r + 14;
    const r0 = Math.floor((tree.y - pad) / TILE);
    const r1 = Math.floor((tree.y + pad) / TILE);
    const c0 = Math.floor((tree.x - pad) / TILE);
    const c1 = Math.floor((tree.x + pad) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const cx = c * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2;
        if (Phaser.Math.Distance.Between(cx, cy, tree.x, tree.y) < pad) cells[r][c] = true;
      }
    }
  }

  scene.navGrid = { cols, rows, cells };
}

/* ---------- BFS от игрока: дивергентный спуск по дистанциям ---------- */

export function findPath(scene, fromX, fromY, toX, toY) {
  if (!scene.navGrid) buildNavGrid(scene);
  const { cols, rows, cells } = scene.navGrid;
  const N = cols * rows;

  const tc = Math.min(cols - 1, Math.max(0, Math.floor(toX / TILE)));
  const tr = Math.min(rows - 1, Math.max(0, Math.floor(toY / TILE)));
  const sc = Math.min(cols - 1, Math.max(0, Math.floor(fromX / TILE)));
  const sr = Math.min(rows - 1, Math.max(0, Math.floor(fromY / TILE)));

  // BFS от клетки игрока (даже если она занята — старт разрешён), рост
  // только через свободные клетки. Диагонали — только если обе
  // ортогонали свободны (без срезания углов стен).
  const dist = new Int32Array(N).fill(-1);
  const queue = [tr * cols + tc];
  dist[tr * cols + tc] = 0;
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (cells[nr][nc]) continue;
        if (dr !== 0 && dc !== 0 && (cells[r][nc] || cells[nr][c])) continue;
        const nidx = nr * cols + nc;
        if (dist[nidx] !== -1) continue;
        dist[nidx] = dist[idx] + 1;
        queue.push(nidx);
      }
    }
  }

  // Спуск от зомби к клетке игрока; клетка зомби может быть занята
  // (зомби вжат в препятствие/стоит в кроне) — тогда спускаемся от
  // ближайшей свободной ДОСТИЖИМОЙ клетки в радиусе 2 тайлов: первые
  // waypoint'ы выведут из занятой зоны к нормальной трассе.
  let r = sr;
  let c = sc;
  if (dist[r * cols + c] === -1) {
    let bestD = Infinity;
    let fallback = null;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = sr + dr;
        const nc = sc + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (cells[nr][nc]) continue;
        const v = dist[nr * cols + nc];
        if (v === -1) continue;
        const d2 = dr * dr + dc * dc;
        if (d2 < bestD) { bestD = d2; fallback = { r: nr, c: nc }; }
      }
    }
    if (!fallback) return null;
    r = fallback.r;
    c = fallback.c;
  }
  const path = [];
  const maxSteps = cols * rows;
  for (let steps = 0; steps < maxSteps; steps++) {
    if (r === tr && c === tc) break;
    let br = -1;
    let bc = -1;
    let bv = dist[r * cols + c];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (cells[nr][nc]) continue;
        if (dr !== 0 && dc !== 0 && (cells[r][nc] || cells[nr][c])) continue;
        const v = dist[nr * cols + nc];
        if (v !== -1 && v < bv) { bv = v; br = nr; bc = nc; }
      }
    }
    if (br === -1) break;
    r = br;
    c = bc;
    path.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
  }
  return path.length ? path : null;
}
