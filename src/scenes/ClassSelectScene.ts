import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { SaveSystem } from '../systems/SaveSystem';
import classesData from '../data/classes.json';
import chapter1Data from '../data/chapters/chapter1.json';

const CLASSES = Object.entries(classesData) as [string, any][];
const FONT = "'Palatino Linotype', 'Book Antiqua', Palatino, serif";

export class ClassSelectScene extends Phaser.Scene {
  constructor() { super({ key: 'ClassSelectScene' }); }

  create(): void {
    this.cameras.main.setBackgroundColor(0x2a2418);

    // Parchment border
    const border = this.add.graphics();
    border.lineStyle(2, 0x6b5a42, 0.5);
    border.strokeRect(8, 8, GAME_WIDTH - 16, GAME_HEIGHT - 16);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 30, 'Choose Your Class', {
      fontSize: '20px', color: '#ffcc44', fontFamily: FONT, fontStyle: 'bold',
      stroke: '#2a1a0a', strokeThickness: 2,
    }).setOrigin(0.5);

    // Decorative line
    border.lineStyle(1, 0x8b7355, 0.4);
    border.lineBetween(cx - 80, 48, cx + 80, 48);

    const cardW = 200, cardH = 160, gap = 20;
    const totalW = CLASSES.length * cardW + (CLASSES.length - 1) * gap;
    const startX = (GAME_WIDTH - totalW) / 2;
    const cardY = 68;

    for (let i = 0; i < CLASSES.length; i++) {
      const [key, data] = CLASSES[i];
      const x = startX + i * (cardW + gap);

      // Parchment card background
      const bg = this.add.rectangle(x + cardW / 2, cardY + cardH / 2, cardW, cardH, 0x3d3020, 0.9)
        .setInteractive({ useHandCursor: true }).setStrokeStyle(1, 0x8b7355);

      let ly = cardY + 12;
      this.add.text(x + cardW / 2, ly, data.name, { fontSize: '15px', color: '#ffcc44', fontFamily: FONT, fontStyle: 'bold' }).setOrigin(0.5);
      ly += 24;
      this.add.text(x + 8, ly, data.description, { fontSize: '10px', color: '#aa9977', fontFamily: FONT, wordWrap: { width: cardW - 16 } });
      ly += 38;
      const stats = data.baseStats;
      this.add.text(x + 8, ly, `HP:${stats.hp}  MP:${stats.mp}\nATK:${stats.attack}  DEF:${stats.defense}\nSPD:${stats.speed}  MAG:${stats.magic}`, {
        fontSize: '10px', color: '#c4aa82', fontFamily: FONT,
      });

      bg.on('pointerover', () => bg.setFillStyle(0x4a3c2e));
      bg.on('pointerout', () => bg.setFillStyle(0x3d3020));
      bg.on('pointerdown', () => this.selectClass(key, data));
    }
  }

  private selectClass(classKey: string, data: any): void {
    const name = data.name;
    const character = SaveSystem.createNewCharacter(classKey, name, data);
    SaveSystem.saveCharacter(character);
    const run = SaveSystem.createNewRun(chapter1Data.id, character, data, chapter1Data);
    SaveSystem.saveRun(run);
    this.scene.start('WorldScene');
  }
}
