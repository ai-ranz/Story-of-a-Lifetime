import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE } from '../config';

/**
 * BootScene — generates the tileset as a single spritesheet texture,
 * plus character and UI textures. No external assets needed.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const barW = 200, barH = 16;
    const bx = (GAME_WIDTH - barW) / 2, by = GAME_HEIGHT / 2;
    const bg = this.add.rectangle(bx + barW / 2, by, barW, barH, 0x333333);
    const fill = this.add.rectangle(bx + 1, by, 0, barH - 2, 0x22cc44).setOrigin(0, 0.5);
    this.load.on('progress', (v: number) => { fill.width = (barW - 2) * v; });
    this.load.on('complete', () => { bg.destroy(); fill.destroy(); });
    this.load.image('__placeholder__', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  }

  create(): void {
    this.generateTileset();
    this.generateCharSprites();
    this.generateUITextures();
    this.scene.start('MainMenuScene');
  }

  /** Generates a single tileset texture with all tile types in a row */
  private generateTileset(): void {
    // Tile order (must match T enum in WorldScene):
    // 0=grass 1=path 2=wall 3=floor 4=water 5=tree
    // 6=door 7=stairs_down 8=stairs_up 9=chest
    // 10=house_wall 11=house_roof 12=house_door
    const colors = [
      0x4a8c3f,  // grass
      0xc8a96e,  // path
      0x555555,  // wall
      0x8b7355,  // floor
      0x3366aa,  // water
      0x2d6e1e,  // tree
      0x8b4513,  // door
      0xcccc00,  // stairs_down
      0x00cccc,  // stairs_up
      0xdd8800,  // chest
      0x886644,  // house_wall
      0xaa3333,  // house_roof
      0x553311,  // house_door
    ];

    const count = colors.length;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < count; i++) {
      g.fillStyle(colors[i]);
      g.fillRect(i * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
      g.lineStyle(1, 0x000000, 0.3);
      g.strokeRect(i * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    }
    // Add some visual detail to special tiles
    // Tree: darker circle
    g.fillStyle(0x1a5510);
    g.fillCircle(5 * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 2, 5);
    // Chest: keyhole
    g.fillStyle(0x000000);
    g.fillRect(9 * TILE_SIZE + 7, 6, 2, 4);
    // Stairs down: arrow
    g.fillStyle(0x000000);
    g.fillTriangle(7 * TILE_SIZE + 4, 4, 7 * TILE_SIZE + 12, 4, 7 * TILE_SIZE + 8, 12);
    // Stairs up: arrow
    g.fillStyle(0x000000);
    g.fillTriangle(8 * TILE_SIZE + 4, 12, 8 * TILE_SIZE + 12, 12, 8 * TILE_SIZE + 8, 4);
    // Water: wave lines
    g.lineStyle(1, 0x5588cc);
    g.lineBetween(4 * TILE_SIZE + 2, 6, 4 * TILE_SIZE + 14, 6);
    g.lineBetween(4 * TILE_SIZE + 3, 10, 4 * TILE_SIZE + 13, 10);

    g.generateTexture('tileset', count * TILE_SIZE, TILE_SIZE);
    g.destroy();
  }

  private generateCharSprites(): void {
    const chars: [string, number][] = [
      ['player_warrior', 0x3355cc],
      ['player_mage', 0x9933cc],
      ['player_rogue', 0x33aa33],
      ['npc_elder', 0xcccc33],
      ['npc_mother', 0xcc66aa],
      ['npc_shopkeeper', 0xcc8833],
      ['npc_friend', 0x33cccc],
      ['npc_innkeeper', 0xcc6644],
      ['npc_blacksmith', 0x886655],
      ['npc_elara', 0xccaadd],
      ['npc_farmer', 0x88aa55],
      ['npc_mira', 0xee88aa],
      ['enemy_wolf', 0x888888],
      ['enemy_boar', 0x885522],
      ['enemy_bat', 0x554466],
      ['enemy_slime', 0x44cc88],
      ['enemy_spider', 0x663344],
      ['enemy_skeleton', 0xccccaa],
      ['enemy_goblin', 0x44aa44],
      ['enemy_goblin_archer', 0x44cc66],
      ['enemy_shaman', 0x884488],
      ['enemy_goblin_chief', 0x227722],
      ['enemy_forest_shaman', 0x338844],
      ['enemy_skeleton_mage', 0xaa99cc],
      ['enemy_goblin_berserker', 0xcc4422],
      ['enemy_cave_lurker', 0x444455],
      ['enemy_bone_archer', 0xbbaa88],
      ['enemy_goblin_healer', 0x66bb66],
    ];
    for (const [key, color] of chars) {
      this.makeCharSprite(key, color);
    }
  }

  private makeCharSprite(key: string, color: number): void {
    const s = TILE_SIZE;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color);
    g.fillRect(3, 6, s - 6, s - 6);
    const lighter = Phaser.Display.Color.ValueToColor(color).lighten(30).color;
    g.fillStyle(lighter);
    g.fillCircle(s / 2, 5, 4);
    g.fillStyle(0x000000);
    g.fillRect(6, 4, 1, 1);
    g.fillRect(9, 4, 1, 1);
    g.lineStyle(1, 0x000000, 0.5);
    g.strokeRect(0, 0, s, s);
    g.generateTexture(key, s, s);
    g.destroy();
  }

  private generateUITextures(): void {
    const g1 = this.make.graphics({ x: 0, y: 0 }, false);
    g1.fillStyle(0x444466);
    g1.fillRect(0, 0, 80, 20);
    g1.generateTexture('ui_button', 80, 20);
    g1.destroy();

    const g2 = this.make.graphics({ x: 0, y: 0 }, false);
    g2.fillStyle(0x222233);
    g2.fillRect(0, 0, 1, 1);
    g2.generateTexture('ui_panel', 1, 1);
    g2.destroy();
  }
}
