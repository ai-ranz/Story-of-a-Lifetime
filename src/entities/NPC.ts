import Phaser from 'phaser';
import { TILE_SIZE } from '../config';

export class NPC extends Phaser.GameObjects.Sprite {
  gridX: number;
  gridY: number;
  npcId: string;
  dialogId: string;

  constructor(
    scene: Phaser.Scene,
    gridX: number,
    gridY: number,
    texture: string,
    npcId: string,
    dialogId: string,
  ) {
    super(scene, gridX * TILE_SIZE + TILE_SIZE / 2, gridY * TILE_SIZE + TILE_SIZE / 2, texture);
    this.gridX = gridX;
    this.gridY = gridY;
    this.npcId = npcId;
    this.dialogId = dialogId;
    scene.add.existing(this);
    this.setDepth(10);
  }
}
