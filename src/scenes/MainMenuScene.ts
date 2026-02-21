import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { SaveSystem } from '../systems/SaveSystem';
import { AudioManager } from '../systems/AudioManager';

export class MainMenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MainMenuScene' }); }

  create(): void {
    this.cameras.main.setBackgroundColor(0x111122);

    // Initialize audio on first user gesture
    this.input.once('pointerdown', () => {
      AudioManager.getInstance().init();
      AudioManager.getInstance().resume();
    });

    const cx = GAME_WIDTH / 2;
    let y = GAME_HEIGHT / 3;

    this.add.text(cx, y, 'Story of a Lifetime', {
      fontSize: '24px', color: '#ffcc44', fontFamily: 'monospace',
    }).setOrigin(0.5);

    y += 50;
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
      fontSize: '14px', color: '#aaaacc', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    t.on('pointerover', () => t.setColor('#ffcc44'));
    t.on('pointerout', () => t.setColor('#aaaacc'));
    t.on('pointerdown', () => {
      AudioManager.getInstance().init();
      AudioManager.getInstance().resume();
      AudioManager.getInstance().playSelect();
      cb();
    });
  }
}
