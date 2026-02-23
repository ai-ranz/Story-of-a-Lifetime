import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { SaveSystem } from '../systems/SaveSystem';
import { AudioManager } from '../systems/AudioManager';

const FONT = "'Palatino Linotype', 'Book Antiqua', Palatino, serif";

export class MainMenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MainMenuScene' }); }

  create(): void {
    this.cameras.main.setBackgroundColor(0x2a2418);

    // Initialize audio on first user gesture
    this.input.once('pointerdown', () => {
      AudioManager.getInstance().init();
      AudioManager.getInstance().resume();
    });

    // Parchment vignette border
    const g = this.add.graphics();
    g.lineStyle(3, 0x6b5a42, 0.6);
    g.strokeRect(8, 8, GAME_WIDTH - 16, GAME_HEIGHT - 16);
    g.lineStyle(1, 0x8b7355, 0.3);
    g.strokeRect(12, 12, GAME_WIDTH - 24, GAME_HEIGHT - 24);

    const cx = GAME_WIDTH / 2;
    let y = GAME_HEIGHT / 3;

    this.add.text(cx, y, 'Story of a Lifetime', {
      fontSize: '26px', color: '#ffcc44', fontFamily: FONT, fontStyle: 'bold',
      stroke: '#2a1a0a', strokeThickness: 3,
    }).setOrigin(0.5);

    // Decorative line under title
    g.lineStyle(1, 0x8b7355, 0.5);
    g.lineBetween(cx - 100, y + 20, cx + 100, y + 20);

    y += 55;
    const hasSave = SaveSystem.hasRun();

    if (hasSave) {
      this.menuItem(cx, y, 'Continue', () => this.scene.start('WorldScene'));
      y += 36;
    }

    this.menuItem(cx, y, 'New Game', () => {
      if (hasSave) SaveSystem.deleteRun();
      this.scene.start('ClassSelectScene');
    });
    y += 36;

    if (hasSave) {
      this.menuItem(cx, y, 'Delete Save', () => {
        SaveSystem.deleteAll();
        this.scene.restart();
      });
    }
  }

  private menuItem(x: number, y: number, label: string, cb: () => void): void {
    const t = this.add.text(x, y, label, {
      fontSize: '15px', color: '#aa9977', fontFamily: FONT,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    t.on('pointerover', () => t.setColor('#ffcc44'));
    t.on('pointerout', () => t.setColor('#aa9977'));
    t.on('pointerdown', () => {
      AudioManager.getInstance().init();
      AudioManager.getInstance().resume();
      AudioManager.getInstance().playSelect();
      cb();
    });
  }
}
