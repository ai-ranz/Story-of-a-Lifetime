import Phaser from 'phaser';
import { InputManager } from '../systems/InputManager';

const PAD_ALPHA = 0.35;
const BUTTON_SIZE = 34;
const PAD_SIZE = 80;
const MARGIN = 10;
const BTN_RADIUS = BUTTON_SIZE / 2;

/**
 * On-screen virtual D-pad (left) and A/B + utility buttons (right).
 * Only created when touch is detected. Renders in HUDScene's display list.
 */
export class VirtualPad {
  private scene: Phaser.Scene;
  private input: InputManager;
  private container: Phaser.GameObjects.Container;
  onInventory?: () => void;

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
    const diagOff = Math.round(halfPad * 0.65);

    // Background circle
    const bg = this.scene.add.circle(cx, cy, PAD_SIZE / 2 + 12, 0x000000, 0.2);
    this.container.add(bg);

    // Cardinal + diagonal directions
    const dirs: Array<{ label: string; ox: number; oy: number; dx: number; dy: number }> = [
      { label: '\u25B2', ox: 0, oy: -halfPad + 2, dx: 0, dy: -1 },
      { label: '\u25BC', ox: 0, oy: halfPad - 2, dx: 0, dy: 1 },
      { label: '\u25C0', ox: -halfPad + 2, oy: 0, dx: -1, dy: 0 },
      { label: '\u25B6', ox: halfPad - 2, oy: 0, dx: 1, dy: 0 },
      { label: '\u25E4', ox: -diagOff, oy: -diagOff, dx: -1, dy: -1 },
      { label: '\u25E5', ox: diagOff, oy: -diagOff, dx: 1, dy: -1 },
      { label: '\u25E3', ox: -diagOff, oy: diagOff, dx: -1, dy: 1 },
      { label: '\u25E2', ox: diagOff, oy: diagOff, dx: 1, dy: 1 },
    ];

    for (const dir of dirs) {
      const isDiag = dir.dx !== 0 && dir.dy !== 0;
      const r = isDiag ? 10 : 16;
      const btn = this.scene.add.circle(cx + dir.ox, cy + dir.oy, r, 0xffffff, isDiag ? PAD_ALPHA * 0.7 : PAD_ALPHA)
        .setInteractive();
      const txt = this.scene.add.text(cx + dir.ox, cy + dir.oy, dir.label, {
        fontSize: isDiag ? '8px' : '14px', color: '#000', fontFamily: 'monospace',
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
    const baseX = w - MARGIN - BTN_RADIUS - 8;
    const baseY = h - MARGIN - BTN_RADIUS - 8;

    // A button (action) — bottom-right
    const aBtn = this.scene.add.circle(baseX, baseY, BTN_RADIUS, 0x44aa44, PAD_ALPHA)
      .setInteractive();
    const aTxt = this.scene.add.text(baseX, baseY, 'A', {
      fontSize: '14px', color: '#fff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    aBtn.on('pointerdown', () => this.input.setPadAction(true));
    aBtn.on('pointerup', () => this.input.setPadAction(false));
    aBtn.on('pointerout', () => this.input.setPadAction(false));

    // B button (cancel) — left of A
    const bBtn = this.scene.add.circle(baseX - 44, baseY, BTN_RADIUS, 0xaa4444, PAD_ALPHA)
      .setInteractive();
    const bTxt = this.scene.add.text(baseX - 44, baseY, 'B', {
      fontSize: '14px', color: '#fff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    bBtn.on('pointerdown', () => this.input.setPadCancel(true));
    bBtn.on('pointerup', () => this.input.setPadCancel(false));
    bBtn.on('pointerout', () => this.input.setPadCancel(false));

    // Inventory button — above A
    const invBtn = this.scene.add.circle(baseX, baseY - 48, BTN_RADIUS * 0.75, 0xddaa00, PAD_ALPHA)
      .setInteractive();
    const invTxt = this.scene.add.text(baseX, baseY - 48, 'I', {
      fontSize: '12px', color: '#fff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    invBtn.on('pointerdown', () => { if (this.onInventory) this.onInventory(); });

    this.container.add([aBtn, aTxt, bBtn, bTxt, invBtn, invTxt]);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }
}
