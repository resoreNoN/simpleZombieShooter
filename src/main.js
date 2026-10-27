import Phaser from 'phaser';

import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';

const debugMode = new URLSearchParams(window.location.search).has('debug');

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 640,
  backgroundColor: '#111111',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: debugMode // http://localhost:5173/?debug=1 — визуализация тел
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, MenuScene, GameScene, UIScene]
};

const game = new Phaser.Game(config);

// Глобальный доступ для отладки и авторежимов — только в dev-сборке
if (import.meta.env.DEV) {
  window.__game = game;
}
