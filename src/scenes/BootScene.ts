import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE } from '../config';

// ── Paper / D&D palette ──
const PARCHMENT      = 0xf4e8c1;   // warm parchment base
const PARCHMENT_DARK = 0xd4c6a0;   // aged parchment shadow
const INK            = 0x3b2c1a;    // dark brown ink
const INK_LIGHT      = 0x6b5a42;    // faded ink
const INK_FAINT      = 0x9b8a72;    // very faint ink (grid lines)

/**
 * BootScene — generates all textures procedurally with a hand-drawn
 * paper / D&D tabletop aesthetic. No external assets needed.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const barW = 200, barH = 16;
    const bx = (GAME_WIDTH - barW) / 2, by = GAME_HEIGHT / 2;
    const bg = this.add.rectangle(bx + barW / 2, by, barW, barH, 0x3b2c1a);
    const fill = this.add.rectangle(bx + 1, by, 0, barH - 2, 0xc8a96e).setOrigin(0, 0.5);
    this.load.on('progress', (v: number) => { fill.width = (barW - 2) * v; });
    this.load.on('complete', () => { bg.destroy(); fill.destroy(); });
    this.load.image('__placeholder__', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  }

  create(): void {
    this.generateTileset();
    this.generateCharSprites();
    this.generatePortraits();
    this.generateUITextures();
    this.scene.start('MainMenuScene');
  }

  /** Seeded noise value for paper grain */
  private paperNoise(x: number, y: number): number {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  /** Fill a rectangle with paper texture grain */
  private fillPaperRect(g: Phaser.GameObjects.Graphics, ox: number, oy: number, w: number, h: number, baseColor: number): void {
    const base = Phaser.Display.Color.ValueToColor(baseColor);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const n = this.paperNoise(ox + px, oy + py);
        const shift = Math.floor((n - 0.5) * 18);
        const r = Phaser.Math.Clamp(base.red + shift, 0, 255);
        const gr = Phaser.Math.Clamp(base.green + shift, 0, 255);
        const b = Phaser.Math.Clamp(base.blue + shift - 4, 0, 255);
        g.fillStyle(Phaser.Display.Color.GetColor(r, gr, b));
        g.fillRect(ox + px, oy + py, 1, 1);
      }
    }
  }

  /** Generates a single tileset texture with all tile types in a row */
  private generateTileset(): void {
    // Tile order (must match T enum in WorldScene):
    // 0=grass 1=path 2=wall 3=floor 4=water 5=tree
    // 6=door 7=stairs_down 8=stairs_up 9=chest
    // 10=house_wall 11=house_roof 12=house_door
    const colors = [
      0x8caa6a,  // grass – muted sage green (ink-wash)
      0xd4c6a0,  // path – dusty parchment trail
      0x6b6560,  // wall – dark stone sketch
      0xc4aa82,  // floor – cave parchment brown
      0x7a99b5,  // water – faded ink blue
      0x5a7a48,  // tree – deep ink green
      0x8b6540,  // door – warm wood
      0xccbb44,  // stairs_down – gold ink
      0x55aaaa,  // stairs_up – teal ink
      0xcc9933,  // chest – amber
      0x9a8060,  // house_wall – timber
      0x8b4433,  // house_roof – brick red ink
      0x5a3a22,  // house_door – dark wood
    ];

    const S = TILE_SIZE;
    const count = colors.length;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    for (let i = 0; i < count; i++) {
      const ox = i * S;
      this.fillPaperRect(g, ox, 0, S, S, colors[i]);
      // Ink grid line (graph-paper feel)
      g.lineStyle(1, INK_FAINT, 0.35);
      g.strokeRect(ox + 0.5, 0.5, S - 1, S - 1);
    }

    // ── Tile detail overlays (hand-drawn ink style) ──

    // Tree: ink circle canopy + trunk stroke
    const treeX = 5 * S;
    g.fillStyle(0x3d5a2e, 0.7);
    g.fillCircle(treeX + S / 2, S / 2 - 1, 5);
    g.fillStyle(0x4a3520, 0.8);
    g.fillRect(treeX + 6, S / 2 + 2, 3, 5);
    g.lineStyle(1, INK, 0.5);
    g.strokeCircle(treeX + S / 2, S / 2 - 1, 5);

    // Chest: box with clasp
    const chestX = 9 * S;
    g.lineStyle(1, INK, 0.7);
    g.strokeRect(chestX + 3, 4, S - 6, S - 6);
    g.lineBetween(chestX + 3, S / 2, chestX + S - 3, S / 2);
    g.fillStyle(INK, 0.6);
    g.fillRect(chestX + 6, 6, 2, 3); // keyhole

    // Stairs down: hand-drawn down arrow
    g.lineStyle(1.5, INK, 0.7);
    g.lineBetween(7 * S + S / 2, 3, 7 * S + S / 2, S - 4);
    g.lineBetween(7 * S + 4, S - 6, 7 * S + S / 2, S - 3);
    g.lineBetween(7 * S + S - 4, S - 6, 7 * S + S / 2, S - 3);

    // Stairs up: hand-drawn up arrow
    g.lineStyle(1.5, INK, 0.7);
    g.lineBetween(8 * S + S / 2, S - 3, 8 * S + S / 2, 4);
    g.lineBetween(8 * S + 4, 6, 8 * S + S / 2, 3);
    g.lineBetween(8 * S + S - 4, 6, 8 * S + S / 2, 3);

    // Water: ink wave lines
    g.lineStyle(1, 0x4a7090, 0.6);
    g.lineBetween(4 * S + 2, 5, 4 * S + 7, 6);
    g.lineBetween(4 * S + 7, 6, 4 * S + 14, 5);
    g.lineStyle(1, 0x4a7090, 0.4);
    g.lineBetween(4 * S + 3, 10, 4 * S + 8, 11);
    g.lineBetween(4 * S + 8, 11, 4 * S + 13, 10);

    // Door: ink frame lines
    g.lineStyle(1, INK, 0.5);
    g.strokeRect(6 * S + 4, 2, S - 8, S - 3);
    g.fillStyle(INK, 0.3);
    g.fillRect(6 * S + S - 6, S / 2, 2, 2); // handle

    // House wall: horizontal plank line
    g.lineStyle(1, INK_LIGHT, 0.3);
    g.lineBetween(10 * S + 1, S / 2, 10 * S + S - 1, S / 2);

    // House roof: diagonal hatch
    g.lineStyle(1, INK, 0.25);
    g.lineBetween(11 * S + 2, S - 2, 11 * S + S - 2, 2);

    g.generateTexture('tileset', count * S, S);
    g.destroy();
  }

  private generateCharSprites(): void {
    // Brightened colors for cave visibility — all tokens are circular with ink borders
    const chars: [string, number, string][] = [
      // [key, color, symbol]
      ['player_warrior', 0x4477dd, 'W'],
      ['player_mage', 0xaa55dd, 'M'],
      ['player_rogue', 0x55bb55, 'R'],
      ['npc_elder', 0xddcc44, 'E'],
      ['npc_mother', 0xdd88bb, 'M'],
      ['npc_shopkeeper', 0xdd9944, 'S'],
      ['npc_friend', 0x55ccdd, 'F'],
      ['npc_innkeeper', 0xdd8855, 'I'],
      ['npc_blacksmith', 0xaa8866, 'B'],
      ['npc_elara', 0xddbbee, 'e'],
      ['npc_farmer', 0x99bb66, 'f'],
      ['npc_mira', 0xee99bb, 'm'],
      ['enemy_wolf', 0xaaaaaa, 'W'],
      ['enemy_boar', 0xbb7733, 'B'],
      ['enemy_bat', 0x9977aa, 'b'],
      ['enemy_slime', 0x66ddaa, 'S'],
      ['enemy_spider', 0xaa6677, 's'],
      ['enemy_skeleton', 0xddddbb, 'K'],
      ['enemy_goblin', 0x66cc66, 'G'],
      ['enemy_goblin_archer', 0x77dd88, 'A'],
      ['enemy_shaman', 0xbb77bb, 'H'],
      ['enemy_goblin_chief', 0x44aa44, 'C'],
      ['enemy_forest_shaman', 0x66aa77, 'H'],
      ['enemy_skeleton_mage', 0xccaaee, 'M'],
      ['enemy_goblin_berserker', 0xee6644, 'B'],
      ['enemy_cave_lurker', 0x8888aa, 'L'],
      ['enemy_bone_archer', 0xddcc99, 'A'],
      ['enemy_goblin_healer', 0x88dd88, '+'],
    ];
    for (const [key, color, sym] of chars) {
      this.makeCharSprite(key, color, sym);
    }
    // Flush canvas changes to GPU (required for WebGL renderer)
    for (const [key] of chars) {
      (this.textures.get(key) as Phaser.Textures.CanvasTexture).update();
    }
  }

  /** Draw a circular D&D-style token with ink border and initial */
  private makeCharSprite(key: string, color: number, symbol: string): void {
    const s = TILE_SIZE;
    const cx = s / 2, cy = s / 2, r = s / 2 - 1;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // Parchment base circle
    g.fillStyle(PARCHMENT, 0.9);
    g.fillCircle(cx, cy, r);

    // Color fill (slightly smaller)
    g.fillStyle(color, 0.85);
    g.fillCircle(cx, cy, r - 1);

    // Inner highlight (top-left) for dimension
    const lighter = Phaser.Display.Color.ValueToColor(color).lighten(30).color;
    g.fillStyle(lighter, 0.4);
    g.fillCircle(cx - 1, cy - 1, r - 3);

    // Ink border ring (double line for D&D token feel)
    g.lineStyle(1.5, INK, 0.8);
    g.strokeCircle(cx, cy, r);
    g.lineStyle(0.5, INK, 0.3);
    g.strokeCircle(cx, cy, r - 2);

    g.generateTexture(key, s, s);
    g.destroy();

    // Draw the symbol letter on top
    const canvas = this.textures.get(key).getSourceImage() as HTMLCanvasElement;
    if (canvas.getContext) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `bold ${Math.floor(s * 0.55)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#2a1a0a';
        ctx.fillText(symbol, cx, cy + 1);
      }
    }
  }

  /** Generate 48x48 D&D ink-on-parchment portrait textures */
  private generatePortraits(): void {
    const PS = 48, cx = PS / 2;
    const I = '#3b2c1a';       // ink
    const IL = '#6b5a42';      // light ink
    const SK = '#d4a574';      // skin tone

    // ── Helper: parchment base with ornate border ──
    const makeBase = (key: string, accent: number) => {
      const g = this.make.graphics({}, false);
      this.fillPaperRect(g, 0, 0, PS, PS, PARCHMENT);
      g.fillStyle(accent, 0.1);
      g.fillRect(4, 4, PS - 8, PS - 8);
      g.lineStyle(2, INK, 0.8); g.strokeRect(1, 1, PS - 2, PS - 2);
      g.lineStyle(0.5, INK, 0.35); g.strokeRect(3, 3, PS - 6, PS - 6);
      g.lineStyle(1, INK, 0.5);
      [[1,7,7,1],[PS-1,7,PS-7,1],[1,PS-7,7,PS-1],[PS-1,PS-7,PS-7,PS-1]].forEach(
        ([a,b,c,d]) => g.lineBetween(a,b,c,d)
      );
      g.generateTexture(key, PS, PS);
      g.destroy();
    };

    const getCtx = (key: string): CanvasRenderingContext2D | null => {
      const c = this.textures.get(key).getSourceImage() as HTMLCanvasElement;
      return c.getContext ? c.getContext('2d') : null;
    };

    // ── Helper: draw humanoid bust (body, neck, head, eyes) ──
    const humanBust = (c: CanvasRenderingContext2D, cloth: string, bw = 24) => {
      c.fillStyle = cloth;
      c.fillRect(cx - bw / 2, 30, bw, 16);
      c.strokeStyle = I; c.lineWidth = 0.5;
      c.strokeRect(cx - bw / 2, 30, bw, 16);
      c.fillStyle = SK; c.fillRect(cx - 3, 26, 6, 6);
      c.beginPath(); c.ellipse(cx, 18, 8, 9, 0, 0, Math.PI * 2);
      c.fill(); c.strokeStyle = I; c.lineWidth = 1; c.stroke();
      c.fillStyle = I;
      c.fillRect(cx - 4, 16, 2, 2); c.fillRect(cx + 2, 16, 2, 2);
    };

    // ── Helper: draw goblin head (big ears, small cranium, grin) ──
    const goblinHead = (c: CanvasRenderingContext2D, col: string) => {
      c.fillStyle = col;
      c.beginPath(); c.ellipse(cx, 20, 7, 8, 0, 0, Math.PI * 2); c.fill();
      // Big pointed ears
      c.beginPath(); c.moveTo(cx - 7, 18); c.lineTo(cx - 16, 10); c.lineTo(cx - 6, 14); c.fill();
      c.beginPath(); c.moveTo(cx + 7, 18); c.lineTo(cx + 16, 10); c.lineTo(cx + 6, 14); c.fill();
      c.strokeStyle = I; c.lineWidth = 1;
      c.beginPath(); c.ellipse(cx, 20, 7, 8, 0, 0, Math.PI * 2); c.stroke();
      // Eyes
      c.fillStyle = '#ff4444';
      c.fillRect(cx - 4, 17, 2, 2); c.fillRect(cx + 2, 17, 2, 2);
      // Grin
      c.strokeStyle = I; c.lineWidth = 0.8;
      c.beginPath(); c.arc(cx, 22, 4, 0.1, Math.PI - 0.1); c.stroke();
      // Teeth
      c.fillStyle = '#eeeecc';
      for (let t = -3; t <= 3; t += 2) c.fillRect(cx + t, 22, 1, 2);
    };

    // ── Helper: draw skull ──
    const skullHead = (c: CanvasRenderingContext2D) => {
      c.fillStyle = '#ddd8cc';
      c.beginPath(); c.ellipse(cx, 17, 9, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ccc8bb';
      c.fillRect(cx - 5, 26, 10, 6); // jaw
      c.strokeStyle = I; c.lineWidth = 1;
      c.beginPath(); c.ellipse(cx, 17, 9, 10, 0, 0, Math.PI * 2); c.stroke();
      // Eye sockets
      c.fillStyle = '#1a1008';
      c.beginPath(); c.ellipse(cx - 3, 16, 3, 3.5, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(cx + 3, 16, 3, 3.5, 0, 0, Math.PI * 2); c.fill();
      // Nose
      c.beginPath(); c.moveTo(cx, 20); c.lineTo(cx - 1.5, 23); c.lineTo(cx + 1.5, 23); c.closePath();
      c.fillStyle = '#2a1808'; c.fill();
      // Teeth
      c.fillStyle = '#ccc8bb';
      for (let t = -4; t <= 3; t += 2) c.fillRect(cx + t, 26, 1.5, 3);
      c.strokeStyle = I; c.lineWidth = 0.5;
      c.strokeRect(cx - 5, 26, 10, 3);
    };

    // ════════════════════════════════════════
    // NPC PORTRAITS — humanoid busts
    // ════════════════════════════════════════

    // Elder Thom — wise old man with gray beard and staff
    makeBase('portrait_npc_elder', 0xddcc44);
    let c = getCtx('portrait_npc_elder');
    if (c) {
      humanBust(c, '#886644');
      c.fillStyle = '#bbbbaa'; // beard
      c.beginPath(); c.moveTo(cx - 5, 23); c.quadraticCurveTo(cx, 36, cx + 5, 23); c.fill();
      c.strokeStyle = '#999988'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx - 6, 13); c.lineTo(cx - 1, 12); c.stroke();
      c.beginPath(); c.moveTo(cx + 1, 12); c.lineTo(cx + 6, 13); c.stroke();
      c.strokeStyle = IL; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx + 14, 6); c.lineTo(cx + 12, 44); c.stroke();
    }

    // Mother — gentle woman with flowing hair
    makeBase('portrait_npc_mother', 0xdd88bb);
    c = getCtx('portrait_npc_mother');
    if (c) {
      humanBust(c, '#cc88aa');
      c.fillStyle = '#8b6045';
      c.fillRect(cx - 10, 10, 4, 20); c.fillRect(cx + 6, 10, 4, 20);
      c.fillRect(cx - 8, 8, 16, 4);
      c.strokeStyle = I; c.lineWidth = 0.5;
      c.beginPath(); c.arc(cx, 22, 3, 0.2, Math.PI - 0.2); c.stroke(); // smile
    }

    // Brynn the Shopkeeper — round face, apron, jovial
    makeBase('portrait_npc_shopkeeper', 0xdd9944);
    c = getCtx('portrait_npc_shopkeeper');
    if (c) {
      humanBust(c, '#dd9944', 26);
      c.fillStyle = '#ddddcc'; c.fillRect(cx - 8, 32, 16, 14); // apron
      c.strokeStyle = I; c.lineWidth = 0.5; c.strokeRect(cx - 8, 32, 16, 14);
      c.fillStyle = '#7b5030'; c.fillRect(cx - 6, 9, 12, 3); // hair
      c.strokeStyle = I; c.lineWidth = 0.5;
      c.beginPath(); c.arc(cx, 22, 3, 0.1, Math.PI - 0.1); c.stroke(); // smile
    }

    // Kael — young adventurer, cloak collar
    makeBase('portrait_npc_friend', 0x55ccdd);
    c = getCtx('portrait_npc_friend');
    if (c) {
      humanBust(c, '#448899');
      c.fillStyle = '#6b4530'; c.fillRect(cx - 7, 9, 14, 4);
      c.strokeStyle = IL; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx - 12, 30); c.lineTo(cx, 26); c.stroke();
      c.beginPath(); c.moveTo(cx + 12, 30); c.lineTo(cx, 26); c.stroke();
    }

    // Martha the Innkeeper — kerchief, stout
    makeBase('portrait_npc_innkeeper', 0xdd8855);
    c = getCtx('portrait_npc_innkeeper');
    if (c) {
      humanBust(c, '#cc7744', 26);
      c.fillStyle = '#cc5533'; // kerchief
      c.beginPath(); c.moveTo(cx - 10, 12); c.lineTo(cx + 10, 12); c.lineTo(cx, 7); c.fill();
      c.fillStyle = '#6b4530'; c.fillRect(cx - 6, 12, 12, 3);
    }

    // Gareth the Blacksmith — broad shoulders, hammer
    makeBase('portrait_npc_blacksmith', 0xaa8866);
    c = getCtx('portrait_npc_blacksmith');
    if (c) {
      humanBust(c, '#666666', 30);
      c.fillStyle = '#5a3a20'; c.fillRect(cx - 6, 9, 12, 3);
      c.strokeStyle = '#8b7355'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx + 13, 20); c.lineTo(cx + 15, 42); c.stroke();
      c.fillStyle = '#888888'; c.fillRect(cx + 12, 38, 6, 6);
    }

    // Sister Elara — hooded, serene
    makeBase('portrait_npc_elara', 0xddbbee);
    c = getCtx('portrait_npc_elara');
    if (c) {
      c.fillStyle = '#9966aa'; // hood
      c.beginPath(); c.ellipse(cx, 16, 13, 14, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#9966aa'; c.fillRect(cx - 13, 28, 26, 18); // robes
      c.fillStyle = SK;
      c.beginPath(); c.ellipse(cx, 19, 7, 8, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = I; c.lineWidth = 1;
      c.beginPath(); c.ellipse(cx, 19, 7, 8, 0, 0, Math.PI * 2); c.stroke();
      // Closed serene eyes
      c.strokeStyle = I; c.lineWidth = 0.8;
      c.beginPath(); c.arc(cx - 3, 18, 2, 0.2, Math.PI - 0.2); c.stroke();
      c.beginPath(); c.arc(cx + 3, 18, 2, 0.2, Math.PI - 0.2); c.stroke();
    }

    // Farmer Hob — wide-brim hat, weathered
    makeBase('portrait_npc_farmer', 0x99bb66);
    c = getCtx('portrait_npc_farmer');
    if (c) {
      humanBust(c, '#668844');
      c.fillStyle = '#7b6040';
      c.fillRect(cx - 12, 9, 24, 3); // brim
      c.fillRect(cx - 6, 3, 12, 8);  // crown
      c.strokeStyle = I; c.lineWidth = 0.5;
      c.strokeRect(cx - 12, 9, 24, 3);
      // Wrinkle lines
      c.strokeStyle = IL; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(cx - 5, 14); c.lineTo(cx + 5, 14); c.stroke();
    }

    // Young Mira — child with pigtails
    makeBase('portrait_npc_mira', 0xee99bb);
    c = getCtx('portrait_npc_mira');
    if (c) {
      humanBust(c, '#ee88aa', 20);
      c.fillStyle = '#7b5535';
      c.beginPath(); c.arc(cx - 9, 14, 3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(cx + 9, 14, 3, 0, Math.PI * 2); c.fill();
      c.fillRect(cx - 7, 9, 14, 3);
      c.strokeStyle = I; c.lineWidth = 0.5;
      c.beginPath(); c.arc(cx, 22, 2, 0.2, Math.PI - 0.2); c.stroke();
    }

    // ════════════════════════════════════════
    // ENEMY: BEASTS
    // ════════════════════════════════════════

    // Forest Wolf — snarling wolf head
    makeBase('portrait_enemy_wolf', 0xaaaaaa);
    c = getCtx('portrait_enemy_wolf');
    if (c) {
      c.fillStyle = '#999999';
      c.beginPath(); c.ellipse(cx, 22, 10, 9, 0, 0, Math.PI * 2); c.fill(); // head
      c.beginPath(); c.moveTo(cx + 4, 26); c.lineTo(cx + 14, 32); c.lineTo(cx + 6, 28); c.fill(); // snout
      c.fillStyle = '#aaa';
      c.beginPath(); c.moveTo(cx - 5, 14); c.lineTo(cx - 10, 5); c.lineTo(cx - 2, 14); c.fill(); // left ear
      c.beginPath(); c.moveTo(cx + 5, 14); c.lineTo(cx + 10, 5); c.lineTo(cx + 2, 14); c.fill(); // right ear
      c.strokeStyle = I; c.lineWidth = 1;
      c.beginPath(); c.ellipse(cx, 22, 10, 9, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#ffcc00'; c.fillRect(cx - 4, 19, 2, 3); c.fillRect(cx + 2, 19, 2, 3); // eyes
      // Fangs
      c.fillStyle = '#eee';
      c.beginPath(); c.moveTo(cx + 6, 27); c.lineTo(cx + 8, 31); c.lineTo(cx + 10, 27); c.fill();
      c.strokeStyle = IL; c.lineWidth = 0.5; // fur lines
      for (let i = -6; i <= 6; i += 3) {
        c.beginPath(); c.moveTo(cx + i, 14); c.lineTo(cx + i + 1, 10); c.stroke();
      }
    }

    // Wild Boar — square snout, tusks
    makeBase('portrait_enemy_boar', 0xbb7733);
    c = getCtx('portrait_enemy_boar');
    if (c) {
      c.fillStyle = '#9b6030';
      c.beginPath(); c.ellipse(cx, 22, 11, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#b07040'; // snout
      c.beginPath(); c.ellipse(cx, 28, 6, 5, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = I; c.lineWidth = 1;
      c.beginPath(); c.ellipse(cx, 22, 11, 10, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#1a1008'; c.fillRect(cx - 4, 19, 2, 2); c.fillRect(cx + 2, 19, 2, 2); // eyes
      c.fillStyle = '#ccc'; // tusks
      c.beginPath(); c.moveTo(cx - 5, 26); c.lineTo(cx - 8, 18); c.lineTo(cx - 3, 24); c.fill();
      c.beginPath(); c.moveTo(cx + 5, 26); c.lineTo(cx + 8, 18); c.lineTo(cx + 3, 24); c.fill();
      c.fillStyle = '#1a1008'; c.fillRect(cx - 2, 27, 1.5, 1.5); c.fillRect(cx + 1, 27, 1.5, 1.5); // nostrils
    }

    // Cave Bat — spread wings, fangs
    makeBase('portrait_enemy_bat', 0x9977aa);
    c = getCtx('portrait_enemy_bat');
    if (c) {
      c.fillStyle = '#775588'; // wings
      c.beginPath();
      c.moveTo(cx, 18);
      c.quadraticCurveTo(cx - 8, 10, cx - 20, 14);
      c.quadraticCurveTo(cx - 14, 22, cx - 8, 20);
      c.quadraticCurveTo(cx - 12, 28, cx - 4, 24);
      c.lineTo(cx, 22);
      c.fill();
      c.beginPath(); // right wing mirror
      c.moveTo(cx, 18);
      c.quadraticCurveTo(cx + 8, 10, cx + 20, 14);
      c.quadraticCurveTo(cx + 14, 22, cx + 8, 20);
      c.quadraticCurveTo(cx + 12, 28, cx + 4, 24);
      c.lineTo(cx, 22);
      c.fill();
      c.fillStyle = '#665577'; // body
      c.beginPath(); c.ellipse(cx, 22, 4, 6, 0, 0, Math.PI * 2); c.fill();
      // Eyes
      c.fillStyle = '#ff6666'; c.fillRect(cx - 2, 19, 1.5, 1.5); c.fillRect(cx + 1, 19, 1.5, 1.5);
      // Ears
      c.fillStyle = '#775588';
      c.beginPath(); c.moveTo(cx - 3, 17); c.lineTo(cx - 5, 12); c.lineTo(cx - 1, 16); c.fill();
      c.beginPath(); c.moveTo(cx + 3, 17); c.lineTo(cx + 5, 12); c.lineTo(cx + 1, 16); c.fill();
      c.strokeStyle = I; c.lineWidth = 0.5;
      c.beginPath(); c.ellipse(cx, 22, 4, 6, 0, 0, Math.PI * 2); c.stroke();
      // Fangs
      c.fillStyle = '#eee';
      c.fillRect(cx - 1.5, 25, 1, 2); c.fillRect(cx + 0.5, 25, 1, 2);
    }

    // Slime — amorphous blob
    makeBase('portrait_enemy_slime', 0x66ddaa);
    c = getCtx('portrait_enemy_slime');
    if (c) {
      c.fillStyle = '#44bb88';
      c.beginPath();
      c.moveTo(cx - 14, 34);
      c.quadraticCurveTo(cx - 16, 16, cx, 12);
      c.quadraticCurveTo(cx + 16, 16, cx + 14, 34);
      c.quadraticCurveTo(cx, 38, cx - 14, 34);
      c.fill();
      c.strokeStyle = I; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx - 14, 34);
      c.quadraticCurveTo(cx - 16, 16, cx, 12);
      c.quadraticCurveTo(cx + 16, 16, cx + 14, 34);
      c.stroke();
      // Eyes
      c.fillStyle = '#224422';
      c.beginPath(); c.ellipse(cx - 4, 22, 2, 3, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(cx + 4, 22, 2, 3, 0, 0, Math.PI * 2); c.fill();
      // Shine
      c.fillStyle = 'rgba(255,255,255,0.3)';
      c.beginPath(); c.ellipse(cx - 4, 16, 3, 2, -0.3, 0, Math.PI * 2); c.fill();
      // Drip
      c.fillStyle = '#44bb88';
      c.beginPath(); c.moveTo(cx + 10, 34); c.quadraticCurveTo(cx + 12, 40, cx + 10, 42); c.quadraticCurveTo(cx + 8, 40, cx + 10, 36); c.fill();
    }

    // Cave Spider — round body, 8 legs, multiple eyes
    makeBase('portrait_enemy_spider', 0xaa6677);
    c = getCtx('portrait_enemy_spider');
    if (c) {
      c.fillStyle = '#884455';
      c.beginPath(); c.ellipse(cx, 24, 8, 7, 0, 0, Math.PI * 2); c.fill(); // abdomen
      c.beginPath(); c.ellipse(cx, 16, 5, 4, 0, 0, Math.PI * 2); c.fill(); // head
      c.strokeStyle = I; c.lineWidth = 1;
      c.beginPath(); c.ellipse(cx, 24, 8, 7, 0, 0, Math.PI * 2); c.stroke();
      // Legs (4 per side)
      c.strokeStyle = '#663344'; c.lineWidth = 1.2;
      const angles = [-0.8, -0.4, 0.1, 0.5];
      for (const a of angles) {
        const ly = 22 + a * 6;
        c.beginPath(); c.moveTo(cx - 7, ly); c.quadraticCurveTo(cx - 16, ly - 4, cx - 18, ly + 4); c.stroke();
        c.beginPath(); c.moveTo(cx + 7, ly); c.quadraticCurveTo(cx + 16, ly - 4, cx + 18, ly + 4); c.stroke();
      }
      // Multiple eyes
      c.fillStyle = '#ff4444';
      c.fillRect(cx - 4, 14, 1.5, 1.5); c.fillRect(cx + 2.5, 14, 1.5, 1.5);
      c.fillRect(cx - 2, 13, 1, 1); c.fillRect(cx + 1, 13, 1, 1);
      c.fillRect(cx - 3, 16, 1, 1); c.fillRect(cx + 2, 16, 1, 1);
      // Fangs
      c.fillStyle = '#eee';
      c.fillRect(cx - 2, 19, 1, 3); c.fillRect(cx + 1, 19, 1, 3);
    }

    // ════════════════════════════════════════
    // ENEMY: UNDEAD
    // ════════════════════════════════════════

    // Skeleton — skull and ribcage
    makeBase('portrait_enemy_skeleton', 0xddddbb);
    c = getCtx('portrait_enemy_skeleton');
    if (c) {
      skullHead(c);
      c.strokeStyle = '#bbb8aa'; c.lineWidth = 1; // ribcage
      for (let r = 0; r < 3; r++) {
        const ry = 32 + r * 4;
        c.beginPath(); c.arc(cx, ry + 2, 6 - r, 0.3, Math.PI - 0.3); c.stroke();
      }
      c.strokeStyle = '#ccc8bb'; c.lineWidth = 1.5; // spine
      c.beginPath(); c.moveTo(cx, 27); c.lineTo(cx, 44); c.stroke();
    }

    // Skeleton Mage — skull with wizard hood, glowing eyes
    makeBase('portrait_enemy_skeleton_mage', 0xccaaee);
    c = getCtx('portrait_enemy_skeleton_mage');
    if (c) {
      c.fillStyle = '#7755aa'; // hood
      c.beginPath(); c.moveTo(cx - 12, 22); c.lineTo(cx, 2); c.lineTo(cx + 12, 22); c.fill();
      c.fillStyle = '#7755aa'; c.fillRect(cx - 12, 30, 24, 16); // robes
      skullHead(c);
      // Glowing eyes override
      c.fillStyle = '#cc66ff';
      c.beginPath(); c.arc(cx - 3, 16, 2, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(cx + 3, 16, 2, 0, Math.PI * 2); c.fill();
      // Staff
      c.strokeStyle = IL; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx + 14, 4); c.lineTo(cx + 13, 44); c.stroke();
      c.fillStyle = '#aa66ff'; c.beginPath(); c.arc(cx + 14, 4, 3, 0, Math.PI * 2); c.fill();
    }

    // Bone Archer — skeleton with bow
    makeBase('portrait_enemy_bone_archer', 0xddcc99);
    c = getCtx('portrait_enemy_bone_archer');
    if (c) {
      skullHead(c);
      c.strokeStyle = '#bbb8aa'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx, 27); c.lineTo(cx, 40); c.stroke(); // spine
      // Bow
      c.strokeStyle = '#8b6540'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(cx - 14, 24, 14, -1.2, 1.2); c.stroke();
      c.strokeStyle = '#aaa'; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(cx - 14, 24 - 13); c.lineTo(cx - 14, 24 + 13); c.stroke(); // string
      // Arrow
      c.strokeStyle = '#8b6540'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx - 12, 24); c.lineTo(cx + 4, 24); c.stroke();
      c.fillStyle = '#888'; // arrowhead
      c.beginPath(); c.moveTo(cx + 4, 22); c.lineTo(cx + 8, 24); c.lineTo(cx + 4, 26); c.fill();
    }

    // ════════════════════════════════════════
    // ENEMY: GOBLINOIDS
    // ════════════════════════════════════════

    // Goblin — basic goblin
    makeBase('portrait_enemy_goblin', 0x66cc66);
    c = getCtx('portrait_enemy_goblin');
    if (c) {
      c.fillStyle = '#448844'; c.fillRect(cx - 10, 32, 20, 14); // body
      goblinHead(c, '#55aa55');
    }

    // Goblin Archer — goblin with bow
    makeBase('portrait_enemy_goblin_archer', 0x77dd88);
    c = getCtx('portrait_enemy_goblin_archer');
    if (c) {
      c.fillStyle = '#559955'; c.fillRect(cx - 10, 32, 20, 14);
      goblinHead(c, '#66bb66');
      c.strokeStyle = '#8b6540'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(cx + 14, 28, 10, -1, 1); c.stroke();
      c.strokeStyle = '#aaa'; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(cx + 14, 18); c.lineTo(cx + 14, 38); c.stroke();
    }

    // Goblin Shaman — feathered headdress, magic staff
    makeBase('portrait_enemy_shaman', 0xbb77bb);
    c = getCtx('portrait_enemy_shaman');
    if (c) {
      c.fillStyle = '#884488'; c.fillRect(cx - 10, 32, 20, 14); // robes
      goblinHead(c, '#88aa88');
      // Feathered headdress
      c.fillStyle = '#cc4444';
      c.beginPath(); c.moveTo(cx - 2, 12); c.lineTo(cx - 4, 2); c.lineTo(cx, 10); c.fill();
      c.fillStyle = '#4444cc';
      c.beginPath(); c.moveTo(cx + 2, 12); c.lineTo(cx + 4, 2); c.lineTo(cx, 10); c.fill();
      c.fillStyle = '#44cc44';
      c.beginPath(); c.moveTo(cx, 12); c.lineTo(cx, 1); c.lineTo(cx + 2, 10); c.fill();
      // Staff
      c.strokeStyle = IL; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx - 14, 10); c.lineTo(cx - 12, 44); c.stroke();
      c.fillStyle = '#aa44ff'; c.beginPath(); c.arc(cx - 14, 10, 3, 0, Math.PI * 2); c.fill();
    }

    // Goblin Chief — armored, crown
    makeBase('portrait_enemy_goblin_chief', 0x44aa44);
    c = getCtx('portrait_enemy_goblin_chief');
    if (c) {
      c.fillStyle = '#666666'; c.fillRect(cx - 12, 32, 24, 14); // armor
      c.strokeStyle = '#888'; c.lineWidth = 0.5; c.strokeRect(cx - 12, 32, 24, 14);
      goblinHead(c, '#338833');
      // Iron crown
      c.fillStyle = '#888888';
      c.fillRect(cx - 7, 10, 14, 3);
      c.beginPath(); c.moveTo(cx - 7, 10); c.lineTo(cx - 5, 5); c.lineTo(cx - 3, 10); c.fill();
      c.beginPath(); c.moveTo(cx + 3, 10); c.lineTo(cx + 5, 5); c.lineTo(cx + 7, 10); c.fill();
      c.beginPath(); c.moveTo(cx - 2, 10); c.lineTo(cx, 4); c.lineTo(cx + 2, 10); c.fill();
      c.fillStyle = '#cc3333'; c.fillRect(cx - 0.5, 5.5, 1, 1); // crown jewel
    }

    // Goblin Berserker — warpaint, big axe
    makeBase('portrait_enemy_goblin_berserker', 0xee6644);
    c = getCtx('portrait_enemy_goblin_berserker');
    if (c) {
      c.fillStyle = '#884433'; c.fillRect(cx - 10, 32, 20, 14);
      goblinHead(c, '#66aa55');
      // Warpaint streaks
      c.strokeStyle = '#cc2200'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx - 6, 15); c.lineTo(cx - 6, 25); c.stroke();
      c.beginPath(); c.moveTo(cx + 6, 15); c.lineTo(cx + 6, 25); c.stroke();
      // Axe
      c.strokeStyle = '#8b6540'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx + 12, 8); c.lineTo(cx + 14, 42); c.stroke();
      c.fillStyle = '#888';
      c.beginPath(); c.arc(cx + 12, 10, 5, -1.5, 1.5); c.fill();
    }

    // Goblin Healer — herbs, healing staff
    makeBase('portrait_enemy_goblin_healer', 0x88dd88);
    c = getCtx('portrait_enemy_goblin_healer');
    if (c) {
      c.fillStyle = '#558855'; c.fillRect(cx - 10, 32, 20, 14);
      goblinHead(c, '#66cc66');
      // Healing staff with cross
      c.strokeStyle = IL; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx - 14, 8); c.lineTo(cx - 12, 44); c.stroke();
      c.strokeStyle = '#88ff88'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx - 14, 6); c.lineTo(cx - 14, 14); c.stroke();
      c.beginPath(); c.moveTo(cx - 17, 10); c.lineTo(cx - 11, 10); c.stroke();
    }

    // ════════════════════════════════════════
    // ENEMY: OTHER
    // ════════════════════════════════════════

    // Forest Shaman — nature-themed humanoid
    makeBase('portrait_enemy_forest_shaman', 0x66aa77);
    c = getCtx('portrait_enemy_forest_shaman');
    if (c) {
      humanBust(c, '#446644');
      c.fillStyle = '#88aa66'; // leaf crown
      c.beginPath(); c.moveTo(cx - 6, 10); c.lineTo(cx - 3, 4); c.lineTo(cx, 10); c.fill();
      c.beginPath(); c.moveTo(cx, 10); c.lineTo(cx + 3, 4); c.lineTo(cx + 6, 10); c.fill();
      // Nature staff with leaf
      c.strokeStyle = '#6b5a42'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx + 14, 6); c.lineTo(cx + 12, 44); c.stroke();
      c.fillStyle = '#66cc44';
      c.beginPath(); c.ellipse(cx + 14, 6, 3, 5, 0.3, 0, Math.PI * 2); c.fill();
    }

    // Cave Lurker — shadowy form, glowing eyes
    makeBase('portrait_enemy_cave_lurker', 0x8888aa);
    c = getCtx('portrait_enemy_cave_lurker');
    if (c) {
      c.fillStyle = '#444455';
      c.beginPath();
      c.moveTo(cx - 12, 42);
      c.quadraticCurveTo(cx - 16, 20, cx - 6, 10);
      c.quadraticCurveTo(cx, 6, cx + 6, 10);
      c.quadraticCurveTo(cx + 16, 20, cx + 12, 42);
      c.fill();
      c.strokeStyle = '#333344'; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx - 12, 42);
      c.quadraticCurveTo(cx - 16, 20, cx - 6, 10);
      c.quadraticCurveTo(cx, 6, cx + 6, 10);
      c.quadraticCurveTo(cx + 16, 20, cx + 12, 42);
      c.stroke();
      // Glowing eyes
      c.fillStyle = '#88ffff';
      c.beginPath(); c.arc(cx - 4, 22, 2.5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(cx + 4, 22, 2.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(cx - 4, 22, 1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(cx + 4, 22, 1, 0, Math.PI * 2); c.fill();
      // Wispy tendrils
      c.strokeStyle = '#555566'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(cx - 8, 38); c.quadraticCurveTo(cx - 14, 42, cx - 10, 46); c.stroke();
      c.beginPath(); c.moveTo(cx + 8, 38); c.quadraticCurveTo(cx + 14, 42, cx + 10, 46); c.stroke();
    }

    // ════════════════════════════════════════
    // PLAYER PORTRAITS
    // ════════════════════════════════════════

    // Warrior — helmeted
    makeBase('portrait_player_warrior', 0x4477dd);
    c = getCtx('portrait_player_warrior');
    if (c) {
      humanBust(c, '#3366aa');
      c.fillStyle = '#888888'; // helm
      c.fillRect(cx - 8, 8, 16, 6);
      c.fillRect(cx - 1, 6, 2, 10); // nose guard
      c.strokeStyle = I; c.lineWidth = 0.5; c.strokeRect(cx - 8, 8, 16, 6);
      // Sword at shoulder
      c.strokeStyle = '#aaa'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx + 12, 22); c.lineTo(cx + 14, 42); c.stroke();
      c.fillStyle = '#8b7355'; c.fillRect(cx + 10, 26, 6, 2); // crossguard
    }

    // Mage — wizard hat
    makeBase('portrait_player_mage', 0xaa55dd);
    c = getCtx('portrait_player_mage');
    if (c) {
      humanBust(c, '#8844aa');
      c.fillStyle = '#7733bb'; // hat
      c.beginPath(); c.moveTo(cx - 10, 14); c.lineTo(cx, 0); c.lineTo(cx + 10, 14); c.fill();
      c.strokeStyle = I; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(cx - 10, 14); c.lineTo(cx, 0); c.lineTo(cx + 10, 14); c.stroke();
      // Star on hat
      c.fillStyle = '#ffcc44'; c.fillRect(cx - 1, 5, 2, 2);
    }

    // Rogue — hooded
    makeBase('portrait_player_rogue', 0x55bb55);
    c = getCtx('portrait_player_rogue');
    if (c) {
      humanBust(c, '#449944');
      c.fillStyle = '#336633'; // hood
      c.beginPath(); c.ellipse(cx, 14, 11, 10, 0, 0, Math.PI); c.fill();
      // Dagger
      c.strokeStyle = '#aaa'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx + 14, 24); c.lineTo(cx + 14, 38); c.stroke();
      c.fillStyle = '#aaa';
      c.beginPath(); c.moveTo(cx + 12, 24); c.lineTo(cx + 14, 20); c.lineTo(cx + 16, 24); c.fill();
    }

    // Flush canvas changes to GPU (required for WebGL renderer)
    for (const key of this.textures.getTextureKeys()) {
      if (key.startsWith('portrait_')) (this.textures.get(key) as Phaser.Textures.CanvasTexture).update();
    }
  }

  private generateUITextures(): void {
    // Parchment-style button
    const g1 = this.make.graphics({ x: 0, y: 0 }, false);
    this.fillPaperRect(g1, 0, 0, 80, 20, PARCHMENT_DARK);
    g1.lineStyle(1, INK, 0.5);
    g1.strokeRect(0, 0, 80, 20);
    g1.generateTexture('ui_button', 80, 20);
    g1.destroy();

    // Parchment panel tile
    const g2 = this.make.graphics({ x: 0, y: 0 }, false);
    g2.fillStyle(0x2a2418);
    g2.fillRect(0, 0, 1, 1);
    g2.generateTexture('ui_panel', 1, 1);
    g2.destroy();

    // Full parchment background texture for HUD panels
    const pw = 400, ph = 400;
    const g3 = this.make.graphics({ x: 0, y: 0 }, false);
    this.fillPaperRect(g3, 0, 0, pw, ph, PARCHMENT);
    // Add some coffee-stain-like aging spots
    g3.fillStyle(0xc4a880, 0.3);
    g3.fillCircle(80, 60, 25);
    g3.fillStyle(0xb8a070, 0.2);
    g3.fillCircle(300, 320, 35);
    g3.fillStyle(0xc8b088, 0.15);
    g3.fillCircle(200, 180, 20);
    g3.generateTexture('parchment_bg', pw, ph);
    g3.destroy();
  }
}
