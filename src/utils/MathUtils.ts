import Phaser from 'phaser';

export const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
} as const;

export type Direction = keyof typeof DIRECTIONS;

/** Roll a random integer between min and max (inclusive). */
export function rollInt(min: number, max: number): number {
  return Phaser.Math.Between(min, max);
}

/** Roll a float between 0 and 1. */
export function rollFloat(): number {
  return Math.random();
}

/** Shuffle array in place (Fisher-Yates). */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
