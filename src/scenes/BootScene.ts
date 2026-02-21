import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE } from '../config';

/**
 * BootScene — generates all placeholder art programmatically and loads data.
 * No external asset files needed for the prototype.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Show loading bar
    const barW = 200;
    const barH = 16;
    const bx = (GAME_WIDTH - barW) / 2;
    const by = GAME_HEIGHT / 2;
    const bg = this.add.rectangle(bx + barW / 2, by, barW, barH, 0x333333);
    const fill = this.add.rectangle(bx + 1, by, 0, barH - 2, 0x22cc44).setOrigin(0, 0.5);

    this.load.on('progress', (v: number) => {
      fill.width = (barW - 2) * v;
    });
    this.load.on('complete', () => {
      bg.destroy();
      fill.destroy();
    });

    // We generate textures in create(), so nothing to actually preload file-wise
    // Add a tiny delay so the bar is visible
    this.load.image('__placeholder__', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  }

  create(): void {
    this.generateTextures();
    this.scene.start('MainMenuScene');
  }

  private generateTextures(): void {
    const T = TILE_SIZE;

    // --- Tilesets ---
    this.makeRect('tile_grass', T, T, 0x4a8c3f);
    this.makeRect('tile_path', T, T, 0xc8a96e);
    this.makeRect('tile_wall', T, T, 0x555555);
    this.makeRect('tile_floor', T, T, 0x8b7355);
    this.makeRect('tile_water', T, T, 0x3366aa);
    this.makeRect('tile_tree', T, T, 0x2d6e1e);
    this.makeRect('tile_door', T, T, 0x8b4513);
    this.makeRect('tile_stairs_down', T, T, 0xcccc00);
    this.makeRect('tile_stairs_up', T, T, 0x00cccc);
    this.makeRect('tile_chest', T, T, 0xdd8800);

    // --- House tiles ---
    this.makeRect('tile_house_wall', T, T, 0x886644);
    this.makeRect('tile_house_roof', T, T, 0xaa3333);
    this.makeRect('tile_house_door', T, T, 0x553311);

    // --- Player sprites (different colors per class) ---
    this.makeCharSprite('player_warrior', 0x3355cc);
    this.makeCharSprite('player_mage', 0x9933cc);
    this.makeCharSprite('player_rogue', 0x33aa33);

    // --- NPC sprites ---
    this.makeCharSprite('npc_elder', 0xcccc33);
    this.makeCharSprite('npc_mother', 0xcc66aa);
    this.makeCharSprite('npc_shopkeeper', 0xcc8833);
    this.makeCharSprite('npc_friend', 0x33cccc);

    // --- Enemy sprites ---
    this.makeCharSprite('enemy_wolf', 0x888888);
    this.makeCharSprite('enemy_boar', 0x885522);
    this.makeCharSprite('enemy_goblin', 0x44aa44);
    this.makeCharSprite('enemy_goblin_archer', 0x44cc66);
    this.makeCharSprite('enemy_goblin_chief', 0x227722);

    // --- Item sprites ---
    this.makeRect('item_potion_red', T, T, 0xcc2222);
    this.makeRect('item_potion_blue', T, T, 0x2255cc);
    this.makeRect('item_sword_wood', T, T, 0xbb9955);
    this.makeRect('item_sword_short', T, T, 0xaaaacc);
    this.makeRect('item_staff', T, T, 0x8833cc);
    this.makeRect('item_armor_leather', T, T, 0x886644);
    this.makeRect('item_herb', T, T, 0x33aa33);
    this.makeRect('item_key', T, T, 0xdddd44);

    // --- UI ---
    this.makeRect('ui_button', 80, 20, 0x444466);
    this.makeRect('ui_panel', 1, 1, 0x222233);
  }

  private makeRect(key: string, w: number, h: number, color: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color);
    g.fillRect(0, 0, w, h);
    // Add 1px outline for visibility
    g.lineStyle(1, 0x000000, 0.4);
    g.strokeRect(0, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  /** Character sprite: body rectangle + head circle */
  private makeCharSprite(key: string, color: number): void {
    const T = TILE_SIZE;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // Body
    g.fillStyle(color);
    g.fillRect(3, 6, T - 6, T - 6);

    // Head
    const lighter = Phaser.Display.Color.ValueToColor(color).lighten(30).color;
    g.fillStyle(lighter);
    g.fillCircle(T / 2, 5, 4);

    // Eyes
    g.fillStyle(0x000000);
    g.fillRect(6, 4, 1, 1);
    g.fillRect(9, 4, 1, 1);

    // Outline
    g.lineStyle(1, 0x000000, 0.5);
    g.strokeRect(0, 0, T, T);

    g.generateTexture(key, T, T);
    g.destroy();
  }
}
