import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { SaveSystem } from '../systems/SaveSystem';
import classesData from '../data/classes.json';
import chapter1Data from '../data/chapters/chapter1.json';

const CLASSES = Object.entries(classesData) as [string, any][];

export class ClassSelectScene extends Phaser.Scene {
  constructor() { super({ key: 'ClassSelectScene' }); }

  create(): void {
    this.cameras.main.setBackgroundColor(0x111122);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 30, 'Choose Your Class', {
      fontSize: '18px', color: '#ffcc44', fontFamily: 'monospace',
    }).setOrigin(0.5);

    const cardW = 200, cardH = 160, gap = 20;
    const totalW = CLASSES.length * cardW + (CLASSES.length - 1) * gap;
    const startX = (GAME_WIDTH - totalW) / 2;
    const cardY = 80;

    for (let i = 0; i < CLASSES.length; i++) {
      const [key, data] = CLASSES[i];
      const x = startX + i * (cardW + gap);

      // Card background
      const bg = this.add.rectangle(x + cardW / 2, cardY + cardH / 2, cardW, cardH, 0x222244, 0.8)
        .setInteractive({ useHandCursor: true }).setStrokeStyle(1, 0x444466);

      let ly = cardY + 12;
      this.add.text(x + cardW / 2, ly, data.name, { fontSize: '14px', color: '#ffcc44', fontFamily: 'monospace' }).setOrigin(0.5);
      ly += 22;
      this.add.text(x + 8, ly, data.description, { fontSize: '9px', color: '#aaaacc', fontFamily: 'monospace', wordWrap: { width: cardW - 16 } });
      ly += 36;
      const stats = data.baseStats;
      this.add.text(x + 8, ly, `HP:${stats.hp}  MP:${stats.mp}\nATK:${stats.attack}  DEF:${stats.defense}\nSPD:${stats.speed}  MAG:${stats.magic}`, {
        fontSize: '9px', color: '#88aacc', fontFamily: 'monospace',
      });

      bg.on('pointerover', () => bg.setFillStyle(0x333366));
      bg.on('pointerout', () => bg.setFillStyle(0x222244));
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
