import Phaser from 'phaser';

export interface InputState {
  direction: { x: number; y: number };
  action: boolean;    // confirm / interact (Enter, A button)
  cancel: boolean;    // back / cancel (Esc, B button)
  inventory: boolean; // open inventory (I key)
  menu: boolean;      // open menu (M key)
}

/**
 * Unified input manager — reads keyboard on desktop, receives virtual pad
 * events on mobile. All game systems query this instead of raw input.
 */
export class InputManager {
  private scene: Phaser.Scene;
  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    enter: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
    i: Phaser.Input.Keyboard.Key;
    m: Phaser.Input.Keyboard.Key;
  };

  // Virtual pad state (set by VirtualPad)
  private padDirection = { x: 0, y: 0 };
  private padAction = false;
  private padCancel = false;
  private padActionJust = false;

  // Edge-trigger tracking — returns true only on the frame the key goes down
  private actionConsumed = false;
  private cancelConsumed = false;
  private inventoryConsumed = false;
  private menuConsumed = false;
  private directionConsumed = false;
  private lastDirection = { x: 0, y: 0 };

  readonly isTouchDevice: boolean;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (scene.input.keyboard) {
      this.keys = {
        up: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
        down: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
        left: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        right: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
        w: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        enter: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
        space: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
        esc: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
        i: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I),
        m: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M),
      };
    }
  }

  /** Called by VirtualPad to set direction. */
  setPadDirection(x: number, y: number): void {
    this.padDirection.x = x;
    this.padDirection.y = y;
  }

  /** Called by VirtualPad on A button. */
  setPadAction(pressed: boolean): void {
    if (pressed && !this.padAction) this.padActionJust = true;
    this.padAction = pressed;
  }

  /** Called by VirtualPad on B button. */
  setPadCancel(pressed: boolean): void {
    this.padCancel = pressed;
  }

  /** Get current input state. Direction is normalized to -1/0/1 per axis. */
  getState(): InputState {
    let dx = this.padDirection.x;
    let dy = this.padDirection.y;

    if (this.keys) {
      if (this.keys.left.isDown || this.keys.a.isDown) dx = -1;
      else if (this.keys.right.isDown || this.keys.d.isDown) dx = 1;
      if (this.keys.up.isDown || this.keys.w.isDown) dy = -1;
      else if (this.keys.down.isDown || this.keys.s.isDown) dy = 1;
    }

    return {
      direction: { x: dx, y: dy },
      action: this.isActionDown(),
      cancel: this.isCancelDown(),
      inventory: this.isInventoryDown(),
      menu: this.isMenuDown(),
    };
  }

  /** Edge-triggered direction — returns true only when direction changes. */
  getDirectionJustPressed(): { x: number; y: number } | null {
    const state = this.getState();
    const { x, y } = state.direction;

    if (x === 0 && y === 0) {
      this.lastDirection = { x: 0, y: 0 };
      this.directionConsumed = false;
      return null;
    }

    if (x === this.lastDirection.x && y === this.lastDirection.y && this.directionConsumed) {
      return null;
    }

    this.lastDirection = { x, y };
    this.directionConsumed = true;
    return { x, y };
  }

  /** Returns true once per press cycle (edge trigger). */
  private isActionDown(): boolean {
    const raw = this.padAction
      || (this.keys && (this.keys.enter.isDown || this.keys.space.isDown));
    if (raw && !this.actionConsumed) {
      this.actionConsumed = true;
      return true;
    }
    if (!raw) this.actionConsumed = false;
    return false;
  }

  private isCancelDown(): boolean {
    const raw = this.padCancel || (this.keys && this.keys.esc.isDown);
    if (raw && !this.cancelConsumed) {
      this.cancelConsumed = true;
      return true;
    }
    if (!raw) this.cancelConsumed = false;
    return false;
  }

  private isInventoryDown(): boolean {
    const raw = this.keys && this.keys.i.isDown;
    if (raw && !this.inventoryConsumed) {
      this.inventoryConsumed = true;
      return true;
    }
    if (!raw) this.inventoryConsumed = false;
    return false;
  }

  private isMenuDown(): boolean {
    const raw = this.keys && this.keys.m.isDown;
    if (raw && !this.menuConsumed) {
      this.menuConsumed = true;
      return true;
    }
    if (!raw) this.menuConsumed = false;
    return false;
  }

  /** Check if direction keys are held (for repeated grid movement). */
  isDirectionHeld(): boolean {
    const state = this.getState();
    return state.direction.x !== 0 || state.direction.y !== 0;
  }

  /** Get pad direction without triggering edge-detection side effects. */
  getPadDirection(): { x: number; y: number } {
    return { x: this.padDirection.x, y: this.padDirection.y };
  }

  /** Returns true once per A-button press cycle (edge trigger for pad only). */
  consumePadAction(): boolean {
    if (this.padActionJust) {
      this.padActionJust = false;
      return true;
    }
    return false;
  }
}
