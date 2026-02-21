import Phaser from 'phaser';

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 320;
export const TILE_SIZE = 16;
export const TILES_X = GAME_WIDTH / TILE_SIZE;   // 30
export const TILES_Y = GAME_HEIGHT / TILE_SIZE;   // 20

export const MOVE_DURATION = 150; // ms per tile movement tween
export const TYPEWRITER_SPEED = 30; // ms per character in dialog

export const SAVE_KEYS = {
  CHARACTER: 'soal-character',
  RUN: 'soal-run',
} as const;

export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [], // scenes registered in main.ts
};
