import Phaser from 'phaser';

export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 500;
export const TILE_SIZE = 16;

// Map viewport (left portion of screen)
export const MAP_WIDTH = 400;
export const MAP_HEIGHT = GAME_HEIGHT;

// Side panel (right portion of screen)
export const PANEL_X = MAP_WIDTH;
export const PANEL_WIDTH = GAME_WIDTH - MAP_WIDTH; // 400
export const PANEL_HEIGHT = GAME_HEIGHT;

export const TILES_X = Math.floor(MAP_WIDTH / TILE_SIZE);   // 25
export const TILES_Y = Math.floor(MAP_HEIGHT / TILE_SIZE);   // 31

export const MOVE_DURATION = 120; // ms per tile movement tween
export const TYPEWRITER_SPEED = 25; // ms per character in dialog

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
  scene: [], // scenes registered in main.ts
};
