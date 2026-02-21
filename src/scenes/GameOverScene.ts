import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { CharacterState } from '../systems/SaveSystem';

export class GameOverScene extends Phaser.Scene {
  private character!: CharacterState;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: any): void {
    this.character = data.character;
  }

  create(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x110000);

    this.add.text(GAME_WIDTH / 2, 60, 'You Have Fallen', {
      fontSize: '20px', color: '#cc2222', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 110, [
      `Class: ${this.character.class}`,
      `Level: ${this.character.level}`,
      `Skills: ${this.character.learnedSkills.join(', ') || 'none'}`,
      `Chapters: ${this.character.completedChapters.length}`,
    ].join('\n'), {
      fontSize: '9px', color: '#aaaaaa', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 180, 'Your knowledge endures.\nMaterial possessions are lost.', {
      fontSize: '9px', color: '#cc8866', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);

    const btn = this.add.text(GAME_WIDTH / 2, 240, '[ Return to Menu ]', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive();

    btn.on('pointerdown', () => this.scene.start('MainMenuScene'));

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ENTER', () => this.scene.start('MainMenuScene'));
      this.input.keyboard.on('keydown-SPACE', () => this.scene.start('MainMenuScene'));
    }
  }
}
