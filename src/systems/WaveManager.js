/* ---------- Волновой менеджер ----------
 * Управляет паузами между волнами, раскрывает состав волны
 * {тип: количество} в перемешанную очередь спавна и выбирает
 * точки спавна вне препятствий и вдали от игрока.
 *
 * Данные: scene.gameState, scene.zombies, scene.levelWaves,
 * scene.player, scene.worldSize, scene.obstacleCache, scene.treeList.
 * События: scene.levelCompleted() при зачистке последней волны. */

import Phaser from 'phaser';
import Zombie from '../entities/Zombie.js';
import { ZOMBIE_TYPES } from '../data/zombies.js';
import { sfx } from '../audio/sfx.js';

const SPAWN_EDGE_MARGIN = 64;    // отступ от границы мира при спавне зомби
const SPAWN_WAVE_INTERVAL = 380; // мс между спавнами зомби волны
const WAVE_BREAK = 2200;         // мс между волнами
const SPAWN_PLAYER_DIST = 400;   // зомби не спавнятся ближе к игроку
const SPAWN_CLEARANCE = 24;      // запас свободного места вокруг препятствия при спавне

export function manageWaves(scene, time) {
  if (scene.gameState !== 'playing') return;

  const activeZombies = scene.zombies.countActive(true);
  const started = scene.waveIdx >= 0;
  const lastWave = scene.waveIdx === scene.levelWaves.length - 1;
  const waveCleared = activeZombies === 0 && scene.pendingSpawns === 0;

  if (!started || (!lastWave && waveCleared)) {
    // Пауза между волнами
    if (!scene.waveTimerStarted) {
      scene.waveTimerStarted = true;
      scene.nextWaveAt = time + WAVE_BREAK;
    }
    if (time >= scene.nextWaveAt) {
      scene.waveTimerStarted = false;
      startWave(scene);
    }
  } else if (started && lastWave && waveCleared) {
    scene.levelCompleted();
  }
}

export function startWave(scene) {
  scene.waveIdx++;
  sfx.play('waveStart');
  const wave = scene.levelWaves[scene.waveIdx];

  // Раскрываем {тип: количество} в список и перемешиваем
  const queue = [];
  for (const [typeId, count] of Object.entries(wave)) {
    for (let i = 0; i < count; i++) queue.push(typeId);
  }
  Phaser.Utils.Array.Shuffle(queue);

  scene.spawnQueue = queue;
  scene.pendingSpawns = queue.length;

  scene.time.addEvent({
    delay: SPAWN_WAVE_INTERVAL,
    repeat: queue.length - 1,
    callback: () => {
      const typeId = scene.spawnQueue.shift();
      spawnZombie(scene, typeId);
      scene.pendingSpawns--;
    }
  });
}

export function spawnZombie(scene, typeId) {
  const point = findSpawnPoint(scene);
  if (!point) return;
  const zombie = new Zombie(scene, point.x, point.y, ZOMBIE_TYPES[typeId]);
  scene.zombies.add(zombie);
}

export function findSpawnPoint(scene) {
  const margin = SPAWN_EDGE_MARGIN;
  const player = scene.player;
  for (let attempt = 0; attempt < 24; attempt++) {
    const side = Phaser.Math.Between(0, 3);
    let x, y;
    if (side === 0) { x = Phaser.Math.Between(margin, scene.worldSize.width - margin); y = margin; }
    else if (side === 1) { x = scene.worldSize.width - margin; y = Phaser.Math.Between(margin, scene.worldSize.height - margin); }
    else if (side === 2) { x = Phaser.Math.Between(margin, scene.worldSize.width - margin); y = scene.worldSize.height - margin; }
    else { x = margin; y = Phaser.Math.Between(margin, scene.worldSize.height - margin); }

    if (Phaser.Math.Distance.Between(x, y, player.x, player.y) < SPAWN_PLAYER_DIST) continue;
    if (pointInObstacle(scene, x, y)) continue;
    return { x, y };
  }
  // Fallback: ближайший к центру безопасный угол
  return { x: scene.worldSize.width / 2, y: SPAWN_EDGE_MARGIN };
}

export function pointInObstacle(scene, x, y) {
  for (const o of scene.obstacleCache) {
    if (x > o.x - SPAWN_CLEARANCE && x < o.x + o.w + SPAWN_CLEARANCE &&
        y > o.y - SPAWN_CLEARANCE && y < o.y + o.h + SPAWN_CLEARANCE) return true;
  }
  // Стволы: точка (+запас на размер зомби) не должна попадать в круг
  for (const tree of scene.treeList ?? []) {
    if (Phaser.Math.Distance.Between(x, y, tree.x, tree.y) < tree.r + SPAWN_CLEARANCE) return true;
  }
  return false;
}
