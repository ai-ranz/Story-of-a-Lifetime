import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { CharacterState } from '../systems/SaveSystem';

export class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOverScene' }); }

  create(data: { character: CharacterState }): void {
    this.cameras.main.setBackgroundColor(0x110000);

    const cx = GAME_WIDTH / 2;
    let y = GAME_HEIGHT / 3;

    this.add.text(cx, y, 'Game Over', {
      fontSize: '24px', color: '#cc3333', fontFamily: 'monospace',
    }).setOrigin(0.5);

    y += 40;
    if (data.character) {
      this.add.text(cx, y, `${data.character.name} has fallen.`, {
        fontSize: '12px', color: '#999999', fontFamily: 'monospace',
      }).setOrigin(0.5);
      y += 24;
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
