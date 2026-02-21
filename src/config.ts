import Phaser from 'phaser';

export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 500;
export const TILE_SIZE = 16;

// Map now fills the entire screen; HUD overlays on top
export const MAP_WIDTH = GAME_WIDTH;
export const MAP_HEIGHT = GAME_HEIGHT;

export const TILES_X = Math.floor(MAP_WIDTH / TILE_SIZE);   // 50
export const TILES_Y = Math.floor(MAP_HEIGHT / TILE_SIZE);   // 31

export const MOVE_DURATION = 120; // ms per tile movement tween
export const TYPEWRITER_SPEED = 25; // ms per character in dialog
export const VIEW_RADIUS = 8; // fog of war sight radius in tiles
export const LOG_FADE_MS = 4000; // how long log messages stay visible

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
