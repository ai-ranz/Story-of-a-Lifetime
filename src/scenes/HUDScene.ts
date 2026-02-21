import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE } from '../config';
import { VirtualPad } from '../ui/VirtualPad';

export class HUDScene extends Phaser.Scene {
  private hpText!: Phaser.GameObjects.Text;
  private mpText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private worldScene: any;
  private virtualPad: VirtualPad | null = null;

  constructor() {
    super({ key: 'HUDScene' });
  }

  init(data: any): void {
    this.worldScene = data.worldScene;
  }

  create(): void {
    // Top-left: HP/MP bar
    const panelBg = this.add.rectangle(2, 2, 120, 28, 0x000000, 0.6).setOrigin(0, 0);

    this.hpText = this.add.text(6, 4, 'HP: --/--', {
      fontSize: '9px', color: '#ff4444', fontFamily: 'monospace',
    });
    this.mpText = this.add.text(6, 16, 'MP: --/--', {
      fontSize: '9px', color: '#4488ff', fontFamily: 'monospace',
    });

    // Top-right: gold
    this.goldText = this.add.text(GAME_WIDTH - 6, 4, 'Gold: 0', {
      fontSize: '9px', color: '#ffdd44', fontFamily: 'monospace',
    }).setOrigin(1, 0);

    // Virtual pad on mobile
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      this.virtualPad = new VirtualPad(this, this.worldScene?.input2);
    }
  }

  update(): void {
    if (!this.worldScene) return;
    const run = this.worldScene.getRunState?.();
    if (!run) return;

    this.hpText.setText(`HP: ${run.hp}/${run.maxHp}`);
    this.mpText.setText(`MP: ${run.mp}/${run.maxMp}`);
    this.goldText.setText(`Gold: ${run.gold ?? 0}`);
  }
}
