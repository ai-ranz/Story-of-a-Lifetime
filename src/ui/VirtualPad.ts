import Phaser from 'phaser';
import { InputManager } from '../systems/InputManager';

const PAD_ALPHA = 0.35;
const BUTTON_SIZE = 28;
const PAD_SIZE = 64;
const MARGIN = 12;

/**
 * On-screen virtual D-pad (left) and A/B buttons (right).
 * Only created when touch is detected. Renders in HUDScene's display list.
 */
export class VirtualPad {
  private scene: Phaser.Scene;
  private input: InputManager;
  private container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, input: InputManager) {
    this.scene = scene;
    this.input = input;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1000);
    this.container.setScrollFactor(0);

    this.createDPad();
    this.createButtons();
  }

  private createDPad(): void {
    const cx = MARGIN + PAD_SIZE / 2 + 8;
    const cy = this.scene.scale.height - MARGIN - PAD_SIZE / 2 - 8;
    const halfPad = PAD_SIZE / 2;

    // Background circle
    const bg = this.scene.add.circle(cx, cy, PAD_SIZE / 2 + 8, 0x000000, 0.2);
    this.container.add(bg);

    const dirs: Array<{ label: string; ox: number; oy: number; dx: number; dy: number }> = [
      { label: '^', ox: 0, oy: -halfPad + 4, dx: 0, dy: -1 },
      { label: 'v', ox: 0, oy: halfPad - 4, dx: 0, dy: 1 },
      { label: '<', ox: -halfPad + 4, oy: 0, dx: -1, dy: 0 },
      { label: '>', ox: halfPad - 4, oy: 0, dx: 1, dy: 0 },
    ];

    for (const dir of dirs) {
      const btn = this.scene.add.circle(cx + dir.ox, cy + dir.oy, 14, 0xffffff, PAD_ALPHA)
        .setInteractive();
      const txt = this.scene.add.text(cx + dir.ox, cy + dir.oy, dir.label, {
        fontSize: '12px', color: '#000', fontFamily: 'monospace',
      }).setOrigin(0.5);

      btn.on('pointerdown', () => this.input.setPadDirection(dir.dx, dir.dy));
      btn.on('pointerup', () => this.input.setPadDirection(0, 0));
      btn.on('pointerout', () => this.input.setPadDirection(0, 0));

      this.container.add([btn, txt]);
    }
  }

  private createButtons(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const baseX = w - MARGIN - BUTTON_SIZE - 8;
    const baseY = h - MARGIN - BUTTON_SIZE - 8;

    // A button (action) — bottom
    const aBtn = this.scene.add.circle(baseX, baseY, BUTTON_SIZE / 2, 0x44aa44, PAD_ALPHA)
      .setInteractive();
    const aTxt = this.scene.add.text(baseX, baseY, 'A', {
      fontSize: '12px', color: '#fff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    aBtn.on('pointerdown', () => this.input.setPadAction(true));
    aBtn.on('pointerup', () => this.input.setPadAction(false));
    aBtn.on('pointerout', () => this.input.setPadAction(false));

    // B button (cancel) — top-left of A
    const bBtn = this.scene.add.circle(baseX - 36, baseY - 20, BUTTON_SIZE / 2, 0xaa4444, PAD_ALPHA)
      .setInteractive();
    const bTxt = this.scene.add.text(baseX - 36, baseY - 20, 'B', {
      fontSize: '12px', color: '#fff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    bBtn.on('pointerdown', () => this.input.setPadCancel(true));
    bBtn.on('pointerup', () => this.input.setPadCancel(false));
    bBtn.on('pointerout', () => this.input.setPadCancel(false));

    this.container.add([aBtn, aTxt, bBtn, bTxt]);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }
}
