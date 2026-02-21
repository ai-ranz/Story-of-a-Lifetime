import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { CharacterState } from '../systems/SaveSystem';

export class ChapterCompleteScene extends Phaser.Scene {
  private character!: CharacterState;
  private chapterTitle = '';
  private outro = '';

  constructor() {
    super({ key: 'ChapterCompleteScene' });
  }

  init(data: any): void {
    this.character = data.character;
    this.chapterTitle = data.chapterTitle ?? 'Chapter Complete';
    this.outro = data.outro ?? '';
  }

  create(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x001122);

    this.add.text(GAME_WIDTH / 2, 40, 'Chapter Complete', {
      fontSize: '18px', color: '#44ccff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 65, this.chapterTitle, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    if (this.outro) {
      this.add.text(GAME_WIDTH / 2, 120, this.outro, {
        fontSize: '9px', color: '#cccccc', fontFamily: 'monospace',
        wordWrap: { width: GAME_WIDTH - 40 }, align: 'center',
      }).setOrigin(0.5);
    }

    this.add.text(GAME_WIDTH / 2, 200, [
      `Level: ${this.character.level}`,
      `Skills carried forward: ${this.character.learnedSkills.join(', ')}`,
      `Chapters completed: ${this.character.completedChapters.length}`,
    ].join('\n'), {
      fontSize: '9px', color: '#88aacc', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 260, 'Your wisdom and skills endure.\nA new chapter awaits...', {
      fontSize: '9px', color: '#aaccdd', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);

    const btn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30, '[ Continue ]', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive();

    btn.on('pointerdown', () => this.scene.start('MainMenuScene'));

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ENTER', () => this.scene.start('MainMenuScene'));
      this.input.keyboard.on('keydown-SPACE', () => this.scene.start('MainMenuScene'));
    }
  }
}
