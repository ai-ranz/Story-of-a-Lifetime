import Phaser from 'phaser';
import { TILE_SIZE, MOVE_DURATION } from '../config';

export class Enemy extends Phaser.GameObjects.Sprite {
  gridX: number;
  gridY: number;
  enemyId: string;
  /** Index used to track defeated state across saves */
  spawnIndex: number;
  /** True while the enemy is tweening between tiles */
  isMoving = false;
  /** True once the enemy has spotted the player (stays aggressive) */
  alert = false;
  /** Turns remaining before alert decays when out of LOS */
  alertTurns = 0;

  constructor(
    scene: Phaser.Scene,
    gridX: number,
    gridY: number,
    texture: string,
    enemyId: string,
    spawnIndex: number,
  ) {
    super(scene, gridX * TILE_SIZE + TILE_SIZE / 2, gridY * TILE_SIZE + TILE_SIZE / 2, texture);
    this.gridX = gridX;
    this.gridY = gridY;
    this.enemyId = enemyId;
    this.spawnIndex = spawnIndex;
    scene.add.existing(this);
  }

  /** Tween to a new grid position. Updates gridX/gridY immediately. */
  moveTo(gx: number, gy: number): void {
    this.gridX = gx;
    this.gridY = gy;
    this.isMoving = true;
    this.scene.tweens.add({
      targets: this,
      x: gx * TILE_SIZE + TILE_SIZE / 2,
      y: gy * TILE_SIZE + TILE_SIZE / 2,
      duration: MOVE_DURATION,
      ease: 'Linear',
      onComplete: () => { this.isMoving = false; },
    });
  }
}
