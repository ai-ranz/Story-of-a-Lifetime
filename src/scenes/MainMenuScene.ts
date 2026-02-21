import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { SaveSystem } from '../systems/SaveSystem';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    // Title
    this.add.text(GAME_WIDTH / 2, 60, 'Story of a Lifetime', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 90, 'A rogue-like RPG', {
      fontSize: '10px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const hasSave = SaveSystem.hasCharacter();
    const hasRun = SaveSystem.hasRun();

    const menuItems: Array<{ label: string; action: () => void }> = [];

    if (hasRun) {
      menuItems.push({
        label: 'Continue',
        action: () => this.scene.start('WorldScene', { continue: true }),
      });
    }

    if (hasSave && !hasRun) {
      menuItems.push({
        label: 'Next Chapter',
        action: () => this.scene.start('WorldScene', { continue: false, newChapter: true }),
      });
    }

    menuItems.push({
      label: 'New Game',
      action: () => {
        SaveSystem.deleteAll();
        this.scene.start('ClassSelectScene');
      },
    });

    // Render menu items
    const startY = 150;
    let selectedIndex = 0;

    const items = menuItems.map((item, i) => {
      const txt = this.add.text(GAME_WIDTH / 2, startY + i * 30, item.label, {
        fontSize: '14px',
        color: i === 0 ? '#ffff00' : '#ffffff',
        fontFamily: 'monospace',
      }).setOrigin(0.5).setInteractive();

      txt.on('pointerdown', () => item.action());
      return txt;
    });

    const updateSelection = () => {
      items.forEach((txt, i) => {
        txt.setColor(i === selectedIndex ? '#ffff00' : '#ffffff');
        txt.setText(i === selectedIndex ? `> ${menuItems[i].label} <` : menuItems[i].label);
      });
    };
    updateSelection();

    // Keyboard navigation
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-UP', () => {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateSelection();
      });
      this.input.keyboard.on('keydown-DOWN', () => {
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSelection();
      });
      this.input.keyboard.on('keydown-ENTER', () => {
        menuItems[selectedIndex].action();
      });
      this.input.keyboard.on('keydown-SPACE', () => {
        menuItems[selectedIndex].action();
      });
    }

    // Version
    this.add.text(GAME_WIDTH - 4, GAME_HEIGHT - 4, 'v0.1', {
      fontSize: '8px',
      color: '#666666',
      fontFamily: 'monospace',
    }).setOrigin(1, 1);
  }
}
