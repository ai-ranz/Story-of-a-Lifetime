import Phaser from 'phaser';
import { TILE_SIZE } from '../config';

export class Enemy extends Phaser.GameObjects.Sprite {
  gridX: number;
  gridY: number;
  enemyId: string;
  /** Index used to track defeated state across saves */
  spawnIndex: number;

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
}
