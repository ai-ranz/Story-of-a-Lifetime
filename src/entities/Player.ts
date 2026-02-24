import Phaser from 'phaser';
import { TILE_SIZE, MOVE_DURATION } from '../config';

export class Player extends Phaser.GameObjects.Sprite {
  gridX: number;
  gridY: number;
  isMoving = false;
  facing: { x: number; y: number } = { x: 0, y: 1 }; // facing down

  constructor(scene: Phaser.Scene, gridX: number, gridY: number, texture: string) {
    super(scene, gridX * TILE_SIZE + TILE_SIZE / 2, gridY * TILE_SIZE + TILE_SIZE / 2, texture);
    this.gridX = gridX;
    this.gridY = gridY;
    scene.add.existing(this);
    this.setDepth(10);
  }

  /**
   * Attempt to move one tile in the given direction.
   * Returns true if movement started, false if blocked.
   * @param dx -1/0/1
   * @param dy -1/0/1
   * @param canMove callback that checks if the target tile is walkable
   */
  tryMove(dx: number, dy: number, canMove: (gx: number, gy: number) => boolean): boolean {
    if (this.isMoving) return false;
    if (dx === 0 && dy === 0) return false;

    this.facing = { x: dx, y: dy };

    const newGx = this.gridX + dx;
    const newGy = this.gridY + dy;

    if (!canMove(newGx, newGy)) return false;

    this.isMoving = true;
    this.gridX = newGx;
    this.gridY = newGy;

    this.scene.tweens.add({
      targets: this,
      x: newGx * TILE_SIZE + TILE_SIZE / 2,
      y: newGy * TILE_SIZE + TILE_SIZE / 2,
      duration: MOVE_DURATION,
      ease: 'Linear',
      onComplete: () => {
        this.isMoving = false;
      },
    });

    return true;
  }

  /** Teleport to grid position instantly (no tween). */
  setGridPosition(gx: number, gy: number): void {
    this.gridX = gx;
    this.gridY = gy;
    this.x = gx * TILE_SIZE + TILE_SIZE / 2;
    this.y = gy * TILE_SIZE + TILE_SIZE / 2;
  }
}
