import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { SaveSystem } from '../systems/SaveSystem';
import classesData from '../data/classes.json';
import chapter1Data from '../data/chapters/chapter1.json';

export class ClassSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ClassSelectScene' });
  }

  create(): void {
    this.add.text(GAME_WIDTH / 2, 30, 'Choose Your Path', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const classes = Object.entries(classesData) as [string, any][];
    let selectedIndex = 0;

    const cards: Phaser.GameObjects.Container[] = [];

    classes.forEach(([key, data], i) => {
      const cx = 80 + i * 120;
      const cy = 130;

      const container = this.add.container(cx, cy);

      // Card background
      const bg = this.add.rectangle(0, 0, 100, 140, 0x333355, 0.8).setStrokeStyle(1, 0x6666aa);
      container.add(bg);

      // Sprite preview
      const sprite = this.add.sprite(0, -40, data.spriteKey);
      container.add(sprite);

      // Name
      const name = this.add.text(0, -10, data.name, {
        fontSize: '11px', color: '#ffffff', fontFamily: 'monospace',
      }).setOrigin(0.5);
      container.add(name);

      // Key stats
      const stats = `HP:${data.baseStats.hp} ATK:${data.baseStats.attack}\nDEF:${data.baseStats.defense} SPD:${data.baseStats.speed}\nMAG:${data.baseStats.magic} MP:${data.baseStats.mp}`;
      const statText = this.add.text(0, 20, stats, {
        fontSize: '8px', color: '#aaaaaa', fontFamily: 'monospace', align: 'center',
      }).setOrigin(0.5);
      container.add(statText);

      // Make interactive
      bg.setInteractive();
      bg.on('pointerdown', () => {
        selectedIndex = i;
        updateSelection();
        confirmSelection();
      });

      cards.push(container);
    });

    // Description at bottom
    const descText = this.add.text(GAME_WIDTH / 2, 230, '', {
      fontSize: '9px', color: '#cccccc', fontFamily: 'monospace', wordWrap: { width: 400 },
    }).setOrigin(0.5);

    const updateSelection = () => {
      cards.forEach((card, i) => {
        const bg = card.getAt(0) as Phaser.GameObjects.Rectangle;
        bg.setStrokeStyle(i === selectedIndex ? 2 : 1, i === selectedIndex ? 0xffff00 : 0x6666aa);
        card.setScale(i === selectedIndex ? 1.05 : 1.0);
      });
      descText.setText(classes[selectedIndex][1].description);
    };
    updateSelection();

    const confirmSelection = () => {
      const [classKey, classData] = classes[selectedIndex];
      const character = SaveSystem.createNewCharacter(classKey, classData.name, classData);
      SaveSystem.saveCharacter(character);
      const run = SaveSystem.createNewRun('chapter1', character, classData, chapter1Data);
      SaveSystem.saveRun(run);
      this.scene.start('WorldScene', { continue: true });
    };

    this.add.text(GAME_WIDTH / 2, 270, 'Arrow keys to select, Enter to confirm', {
      fontSize: '8px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5);

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-LEFT', () => {
        selectedIndex = (selectedIndex - 1 + classes.length) % classes.length;
        updateSelection();
      });
      this.input.keyboard.on('keydown-RIGHT', () => {
        selectedIndex = (selectedIndex + 1) % classes.length;
        updateSelection();
      });
      this.input.keyboard.on('keydown-ENTER', confirmSelection);
      this.input.keyboard.on('keydown-SPACE', confirmSelection);
    }
  }
}
