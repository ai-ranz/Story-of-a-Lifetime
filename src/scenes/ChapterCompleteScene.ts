import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { CharacterState } from '../systems/SaveSystem';

export class ChapterCompleteScene extends Phaser.Scene {
  constructor() { super({ key: 'ChapterCompleteScene' }); }

  create(data: { character: CharacterState; chapterTitle: string; outro: string }): void {
    this.cameras.main.setBackgroundColor(0x112211);

    const cx = GAME_WIDTH / 2;
    let y = 40;

    this.add.text(cx, y, 'Chapter Complete!', {
      fontSize: '20px', color: '#ffcc44', fontFamily: 'monospace',
    }).setOrigin(0.5);

    y += 34;
    this.add.text(cx, y, data.chapterTitle ?? '', {
      fontSize: '14px', color: '#88ccaa', fontFamily: 'monospace',
    }).setOrigin(0.5);

    y += 40;
    if (data.outro) {
      this.add.text(cx, y, data.outro, {
        fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
        wordWrap: { width: GAME_WIDTH - 80 }, align: 'center',
      }).setOrigin(0.5, 0);
      y += 100;
    }

    y += 20;
    const btn = this.add.text(cx, y, 'Return to Menu', {
      fontSize: '14px', color: '#aaaacc', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#ffcc44'));
    btn.on('pointerout', () => btn.setColor('#aaaacc'));
    btn.on('pointerdown', () => this.scene.start('MainMenuScene'));
  }
}
