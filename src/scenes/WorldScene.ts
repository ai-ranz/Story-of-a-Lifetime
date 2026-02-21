import Phaser from 'phaser';
import { TILE_SIZE, GAME_WIDTH, GAME_HEIGHT, MOVE_DURATION, VIEW_RADIUS } from '../config';
import { Player } from '../entities/Player';
import { NPC } from '../entities/NPC';
import { EntityFactory } from '../entities/EntityFactory';
import { SaveSystem, RunState, CharacterState } from '../systems/SaveSystem';
import { InventorySystem } from '../systems/InventorySystem';
import { QuestSystem } from '../systems/QuestSystem';
import { DungeonGenerator, DUNGEON_TILE, DungeonMap } from '../systems/DungeonGenerator';
import { FogOfWar, Visibility } from '../systems/FogOfWar';
import { InputManager } from '../systems/InputManager';
import { SkillSystem } from '../systems/SkillSystem';
import { AudioManager } from '../systems/AudioManager';
import { rollFloat, rollInt } from '../utils/MathUtils';
import encountersData from '../data/encounters.json';
import chapter1Data from '../data/chapters/chapter1.json';
import classesData from '../data/classes.json';
import enemiesData from '../data/enemies.json';

// Tile indices matching the tileset spritesheet order from BootScene
const T = {
  GRASS: 0, PATH: 1, WALL: 2, FLOOR: 3, WATER: 4, TREE: 5,
  DOOR: 6, STAIRS_DOWN: 7, STAIRS_UP: 8, CHEST: 9,
  HOUSE_WALL: 10, HOUSE_ROOF: 11, HOUSE_DOOR: 12,
};

const SOLID = new Set([T.WALL, T.TREE, T.WATER, T.HOUSE_WALL, T.HOUSE_ROOF]);

// ---- Static map generators ----
interface MapExit { x: number; y: number; target: string; tx: number; ty: number }
interface StaticMapDef { width: number; height: number; tiles: number[][]; exits: MapExit[] }

function generateVillageMap(): number[][] {
  const w = 70, h = 50, m: number[][] = [];
  for (let y = 0; y < h; y++) {
    m[y] = [];
    for (let x = 0; x < w; x++) {
      // Border trees
      if (y === 0 || y === h - 1 || x === 0) { m[y][x] = T.TREE; continue; }
      if (x === w - 1) { m[y][x] = y === 25 ? T.PATH : T.TREE; continue; }

      // Main east-west road
      if (y === 25 && x >= 1) { m[y][x] = T.PATH; continue; }
      // North-south cross road
      if (x === 35 && y >= 10 && y <= 40) { m[y][x] = T.PATH; continue; }

      // -- Houses row 1 (north of road) --
      // Elder's house
      if (x >= 8 && x <= 12 && y >= 18 && y <= 22) { m[y][x] = (x === 10 && y === 22) ? T.DOOR : T.HOUSE_WALL; continue; }
      // Blacksmith
      if (x >= 18 && x <= 22 && y >= 18 && y <= 22) { m[y][x] = (x === 20 && y === 22) ? T.DOOR : T.HOUSE_WALL; continue; }
      // Inn
      if (x >= 42 && x <= 48 && y >= 18 && y <= 23) { m[y][x] = (x === 45 && y === 23) ? T.DOOR : T.HOUSE_WALL; continue; }

      // -- Houses row 2 (south of road) --
      // General store
      if (x >= 8 && x <= 12 && y >= 28 && y <= 32) { m[y][x] = (x === 10 && y === 28) ? T.DOOR : T.HOUSE_WALL; continue; }
      // Chapel
      if (x >= 20 && x <= 26 && y >= 28 && y <= 33) { m[y][x] = (x === 23 && y === 28) ? T.DOOR : T.HOUSE_WALL; continue; }
      // Farm houses
      if (x >= 50 && x <= 54 && y >= 30 && y <= 34) { m[y][x] = (x === 52 && y === 30) ? T.DOOR : T.HOUSE_WALL; continue; }
      if (x >= 58 && x <= 62 && y >= 30 && y <= 34) { m[y][x] = (x === 60 && y === 30) ? T.DOOR : T.HOUSE_WALL; continue; }

      // Village pond (south-east)
      if (x >= 52 && x <= 58 && y >= 38 && y <= 42) { m[y][x] = T.WATER; continue; }

      // Scattered trees for atmosphere
      if ((x < 5 || x > w - 5) && Math.abs(Math.sin(x * 2.3 + y * 1.7)) > 0.75) { m[y][x] = T.TREE; continue; }
      if (y < 8 && Math.abs(Math.sin(x * 3.1 + y * 2.7)) > 0.7) { m[y][x] = T.TREE; continue; }
      if (y > 42 && Math.abs(Math.sin(x * 1.9 + y * 3.3)) > 0.7) { m[y][x] = T.TREE; continue; }

      // Garden patches near farm houses
      if (x >= 50 && x <= 62 && y >= 36 && y <= 37 && x % 2 === 0) { m[y][x] = T.GRASS; continue; }

      m[y][x] = T.GRASS;
    }
  }
  return m;
}

function generateForestMap(): number[][] {
  const w = 80, h = 55, m: number[][] = [];
  for (let y = 0; y < h; y++) {
    m[y] = [];
    for (let x = 0; x < w; x++) {
      // Border trees
      if (y === 0 || y === h - 1) { m[y][x] = T.TREE; continue; }
      if (x === 0) { m[y][x] = y === 25 ? T.PATH : T.TREE; continue; }
      if (x === w - 1) { m[y][x] = y === 30 ? T.PATH : T.TREE; continue; }

      // Main winding path through forest: west entrance → east exit
      // West segment (horizontal)
      if (y === 25 && x <= 20) { m[y][x] = T.PATH; continue; }
      // Diagonal south-east
      if (x >= 20 && x <= 40 && y === 25 + Math.floor((x - 20) / 4)) { m[y][x] = T.PATH; continue; }
      // Mid segment (horizontal)
      if (y === 30 && x >= 38 && x <= 60) { m[y][x] = T.PATH; continue; }
      // East segment to exit
      if (y === 30 && x >= 60) { m[y][x] = T.PATH; continue; }

      // A stream running north-south
      if (x >= 50 && x <= 51 && y >= 5 && y <= 20) { m[y][x] = T.WATER; continue; }
      if (x === 50 && y >= 20 && y <= 28) { m[y][x] = T.WATER; continue; }

      // Small clearing (open grass area)
      const distFromClearing = Math.sqrt((x - 30) ** 2 + (y - 15) ** 2);
      if (distFromClearing < 5) { m[y][x] = T.GRASS; continue; }

      // Dense forest with pseudo-random trees
      const treeNoise = Math.abs(Math.sin(x * 3.7 + y * 2.1) + Math.cos(x * 1.3 - y * 4.2));
      if (treeNoise > 1.1) { m[y][x] = T.TREE; continue; }

      m[y][x] = T.GRASS;
    }
  }
  return m;
}

function generateBossRoom(): number[][] {
  const w = 55, h = 40, m: number[][] = [];
  for (let y = 0; y < h; y++) {
    m[y] = [];
    for (let x = 0; x < w; x++) {
      if (y === 0 || x === 0 || x === w - 1) m[y][x] = T.WALL;
      else if (y === h - 1) m[y][x] = x === Math.floor(w / 2) ? T.STAIRS_UP : T.WALL;
      // Pillars around the arena edges
      else if ((x === 5 || x === w - 6) && y % 6 === 3 && y > 3 && y < h - 4) m[y][x] = T.WALL;
      else m[y][x] = T.FLOOR;
    }
  }
  return m;
}

const STATIC_MAPS: Record<string, StaticMapDef> = {
  village: { width: 70, height: 50, tiles: generateVillageMap(), exits: [{ x: 69, y: 25, target: 'forest', tx: 1, ty: 25 }] },
  forest: { width: 80, height: 55, tiles: generateForestMap(), exits: [{ x: 0, y: 25, target: 'village', tx: 68, ty: 25 }, { x: 79, y: 30, target: 'cave_floor1', tx: -1, ty: -1 }] },
  cave_boss: { width: 55, height: 40, tiles: generateBossRoom(), exits: [{ x: 27, y: 39, target: 'cave_floor3', tx: -1, ty: -1 }] },
};

export class WorldScene extends Phaser.Scene {
  player!: Player;
  npcs: NPC[] = [];
  run!: RunState;
  character!: CharacterState;
  inventory!: InventorySystem;
  quests!: QuestSystem;

  private tilemap!: Phaser.Tilemaps.Tilemap;
  private tileLayer!: Phaser.Tilemaps.TilemapLayer;
  private currentMapId = '';
  private currentTiles: number[][] = [];
  private mapW = 0;
  private mapH = 0;
  private dungeonMap: DungeonMap | null = null;
  private fog!: FogOfWar;
  private fogGfx!: Phaser.GameObjects.Graphics;
  private moveTimer = 0;
  private stepsSinceEncounter = 0;
  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private iKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private movePath: { x: number; y: number }[] = [];
  inputManager!: InputManager;
  busy = false;

  constructor() { super({ key: 'WorldScene' }); }

  init(): void {
    this.character = SaveSystem.loadCharacter()!;
    this.run = SaveSystem.loadRun()!;
    this.inventory = new InventorySystem();
    this.inventory.deserialize({ items: this.run.inventory, equipment: this.run.equipment, gold: this.run.gold });
    this.quests = new QuestSystem();
    this.quests.deserialize({ questFlags: this.run.questFlags, storyFlags: this.run.storyFlags });
  }

  create(): void {
    // Full-screen map viewport — HUD overlays on top
    this.cameras.main.setViewport(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.inputManager = new InputManager(this);

    if (this.input.keyboard) {
      this.cursorKeys = this.input.keyboard.createCursorKeys();
      this.wasd = {
        w: this.input.keyboard.addKey('W'),
        a: this.input.keyboard.addKey('A'),
        s: this.input.keyboard.addKey('S'),
        d: this.input.keyboard.addKey('D'),
      };
      this.iKey = this.input.keyboard.addKey('I');
      this.enterKey = this.input.keyboard.addKey('ENTER');
      this.spaceKey = this.input.keyboard.addKey('SPACE');
    }

    this.loadMap(this.run.currentMap, this.run.position.x, this.run.position.y);
    this.scene.launch('HUDScene', { worldScene: this });

    if (!this.quests.getStoryFlag('chapter_intro_shown')) {
      this.quests.setStoryFlag('chapter_intro_shown', true);
      this.time.delayedCall(100, () => {
        this.panel()?.addMessage(chapter1Data.story.intro, '#aaddff');
      });
    }

    // Click-to-move / click-to-interact on map
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.busy) return;
      const p = this.panel();
      if (p && p.mode !== 'idle') return;
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const gx = Math.floor(wp.x / TILE_SIZE);
      const gy = Math.floor(wp.y / TILE_SIZE);

      // Clicked an NPC?
      const npc = this.npcs.find(n => n.gridX === gx && n.gridY === gy);
      if (npc) {
        // If adjacent, interact immediately
        if (Math.abs(this.player.gridX - gx) + Math.abs(this.player.gridY - gy) === 1) {
          this.player.facing = { x: gx - this.player.gridX, y: gy - this.player.gridY };
          this.interactWith(npc);
          return;
        }
        // Otherwise walk to adjacent tile, then interact
        const adj = this.findAdjacentWalkable(gx, gy);
        if (adj) {
          const path = this.findPath(this.player.gridX, this.player.gridY, adj.x, adj.y);
          if (path.length > 0) {
            this.movePath = [...path, { x: gx, y: gy }]; // npc pos = sentinel
          }
        }
        return;
      }

      // Clicked walkable tile
      if (this.isTileWalkable(gx, gy)) {
        const path = this.findPath(this.player.gridX, this.player.gridY, gx, gy);
        if (path.length > 0) this.movePath = path;
      }
    });
  }

  update(_time: number, delta: number): void {
    if (this.player?.isMoving) return;
    if (this.busy) return;
    const p = this.panel();
    if (p && p.mode !== 'idle') return;

    // Continue click-to-move path
    if (this.movePath.length > 0) {
      const next = this.movePath[0];
      const npc = this.npcs.find(n => n.gridX === next.x && n.gridY === next.y);
      if (npc) {
        this.movePath = [];
        this.player.facing = { x: next.x - this.player.gridX, y: next.y - this.player.gridY };
        this.interactWith(npc);
        return;
      }
      this.movePath.shift();
      this.doMove(next.x - this.player.gridX, next.y - this.player.gridY);
      return;
    }

    // 'I' key → inventory
    if (this.iKey?.isDown) { this.iKey.reset(); p?.showInventory(); return; }

    // Enter/Space → interact with facing NPC
    if (this.enterKey?.isDown || this.spaceKey?.isDown || this.inputManager.consumePadAction()) {
      this.enterKey?.reset();
      this.spaceKey?.reset();
      this.tryInteract();
      return;
    }

    // Keyboard movement
    this.moveTimer -= delta;
    const dir = this.keyDir();
    if (!dir) { this.moveTimer = 0; return; }

    if (this.moveTimer <= 0) {
      this.movePath = [];
      this.doMove(dir.x, dir.y);
      this.moveTimer = MOVE_DURATION + 30;
    }
  }

  // ====== Map management ======

  loadMap(mapId: string, startX: number, startY: number): void {
    if (this.tilemap) this.tilemap.destroy();
    this.npcs.forEach(n => n.destroy());
    this.npcs = [];
    if (this.player) this.player.destroy();
    if (this.fogGfx) this.fogGfx.destroy();
    this.dungeonMap = null;
    this.currentMapId = mapId;
    this.stepsSinceEncounter = 0;
    this.movePath = [];

    const chapterMap = chapter1Data.maps.find(m => m.id === mapId);
    if (chapterMap?.type === 'procedural') this.loadProcedural(mapId, chapterMap, startX, startY);
    else this.loadStatic(mapId, startX, startY);

    // Initialize fog of war
    this.fog = new FogOfWar(this.mapW, this.mapH, (x, y) => this.tileBlocksVision(x, y));
    this.fogGfx = this.add.graphics().setDepth(100);
    // Restore previously explored tiles for this map
    const savedFog = this.run.fogExplored?.[mapId];
    if (savedFog) this.fog.deserializeExplored(savedFog);
    this.fog.update(this.player.gridX, this.player.gridY, VIEW_RADIUS);
    this.renderFog();
    this.updateNpcVisibility();

    this.run.currentMap = mapId;
    this.run.position = { x: this.player.gridX, y: this.player.gridY };
    this.saveRun();
    this.cameras.main.setBounds(0, 0, this.mapW * TILE_SIZE, this.mapH * TILE_SIZE);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    // Start area-appropriate ambient audio
    const audio = AudioManager.getInstance();
    if (mapId.startsWith('cave_boss')) audio.startAmbient('boss');
    else if (mapId.startsWith('cave')) audio.startAmbient('cave');
    else if (mapId === 'forest') audio.startAmbient('forest');
    else audio.startAmbient('village');
  }

  private loadStatic(mapId: string, sx: number, sy: number): void {
    const def = STATIC_MAPS[mapId];
    if (!def) return;
    this.mapW = def.width; this.mapH = def.height; this.currentTiles = def.tiles;
    this.buildTilemap(def.tiles, def.width, def.height);
    const cd = (classesData as any)[this.character.class];
    this.player = EntityFactory.createPlayer(this, sx, sy, cd.spriteKey);
    this.npcs = EntityFactory.createNPCsForMap(this, mapId);
    for (const n of this.npcs) n.setInteractive();
  }

  private loadProcedural(mapId: string, cm: any, sx: number, sy: number): void {
    const floor = parseInt(mapId.replace(/\D/g, '') || '1');
    this.dungeonMap = DungeonGenerator.generate(this.run.dungeonSeed, floor, cm.width, cm.height);
    this.mapW = this.dungeonMap.width; this.mapH = this.dungeonMap.height;
    const tiles: number[][] = [];
    for (let y = 0; y < this.mapH; y++) {
      tiles[y] = [];
      for (let x = 0; x < this.mapW; x++) {
        const dt = this.dungeonMap.tiles[y][x];
        if (dt === DUNGEON_TILE.FLOOR) tiles[y][x] = T.FLOOR;
        else if (dt === DUNGEON_TILE.STAIRS_DOWN) tiles[y][x] = T.STAIRS_DOWN;
        else if (dt === DUNGEON_TILE.STAIRS_UP) tiles[y][x] = T.STAIRS_UP;
        else if (dt === DUNGEON_TILE.CHEST) tiles[y][x] = T.CHEST;
        else tiles[y][x] = T.WALL;
      }
    }
    this.currentTiles = tiles;
    this.buildTilemap(tiles, this.mapW, this.mapH);
    const px = sx >= 0 ? sx : this.dungeonMap.startX;
    const py = sy >= 0 ? sy : this.dungeonMap.startY;
    const cd = (classesData as any)[this.character.class];
    this.player = EntityFactory.createPlayer(this, px, py, cd.spriteKey);
  }

  private buildTilemap(tiles: number[][], w: number, h: number): void {
    this.tilemap = this.make.tilemap({ data: tiles, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, width: w, height: h });
    const ts = this.tilemap.addTilesetImage('tiles', 'tileset', TILE_SIZE, TILE_SIZE)!;
    this.tileLayer = this.tilemap.createLayer(0, ts, 0, 0)!;
  }

  // ====== Movement ======

  private keyDir(): { x: number; y: number } | null {
    let dx = 0, dy = 0;
    if (this.cursorKeys?.left.isDown || this.wasd?.a.isDown) dx = -1;
    else if (this.cursorKeys?.right.isDown || this.wasd?.d.isDown) dx = 1;
    if (this.cursorKeys?.up.isDown || this.wasd?.w.isDown) dy = -1;
    else if (this.cursorKeys?.down.isDown || this.wasd?.s.isDown) dy = 1;
    // Fallback to virtual pad
    if (dx === 0 && dy === 0) {
      const pad = this.inputManager.getPadDirection();
      dx = pad.x; dy = pad.y;
    }
    if (dx !== 0 && dy !== 0) dy = 0;
    return (dx || dy) ? { x: dx, y: dy } : null;
  }

  private doMove(dx: number, dy: number): void {
    if (!dx && !dy) return;
    const moved = this.player.tryMove(dx, dy, (gx, gy) => this.isTileWalkable(gx, gy));
    if (moved) {
      AudioManager.getInstance().playFootstep();
      this.run.stepCount++;
      this.run.position = { x: this.player.gridX, y: this.player.gridY };
      this.onStep();
    } else {
      this.movePath = [];
    }
  }

  isTileWalkable(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gy >= this.mapH || gx >= this.mapW) return false;
    const t = this.currentTiles[gy]?.[gx];
    if (t === undefined || SOLID.has(t)) return false;
    if (this.npcs.some(n => n.gridX === gx && n.gridY === gy)) return false;
    return true;
  }

  private onStep(): void {
    // Update fog of war
    this.fog.update(this.player.gridX, this.player.gridY, VIEW_RADIUS);
    this.renderFog();
    this.updateNpcVisibility();

    this.checkExits();
    this.checkStairs();
    this.checkChest();
    this.checkEncounter();
    if (this.run.stepCount % 10 === 0) this.saveRun();
    this.panel()?.refreshStats();
  }

  // ====== Pathfinding (BFS, max 300 nodes) ======

  findPath(sx: number, sy: number, ex: number, ey: number): { x: number; y: number }[] {
    if (sx === ex && sy === ey) return [];
    const key = (x: number, y: number) => y * 10000 + x;
    const visited = new Set<number>([key(sx, sy)]);
    const parent = new Map<number, number>();
    const queue = [key(sx, sy)];
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    let found = false;
    let head = 0;
    while (head < queue.length && !found && visited.size < 300) {
      const cur = queue[head++];
      const cx = cur % 10000, cy = Math.floor(cur / 10000);
      for (const d of dirs) {
        const nx = cx + d.x, ny = cy + d.y, nk = key(nx, ny);
        if (visited.has(nk) || !this.isTileWalkable(nx, ny)) continue;
        visited.add(nk);
        parent.set(nk, cur);
        if (nx === ex && ny === ey) { found = true; break; }
        queue.push(nk);
      }
    }
    if (!found) return [];
    const path: { x: number; y: number }[] = [];
    let ck = key(ex, ey);
    while (ck !== key(sx, sy)) {
      path.unshift({ x: ck % 10000, y: Math.floor(ck / 10000) });
      ck = parent.get(ck)!;
    }
    return path;
  }

  private findAdjacentWalkable(gx: number, gy: number): { x: number; y: number } | null {
    return [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }]
      .map(d => ({ x: gx + d.x, y: gy + d.y }))
      .filter(p => this.isTileWalkable(p.x, p.y))
      .sort((a, b) =>
        (Math.abs(a.x - this.player.gridX) + Math.abs(a.y - this.player.gridY)) -
        (Math.abs(b.x - this.player.gridX) + Math.abs(b.y - this.player.gridY))
      )[0] ?? null;
  }

  // ====== Interaction ======

  interactWith(npc: NPC): void { this.panel()?.startDialog(npc.dialogId); }

  private tryInteract(): void {
    const fx = this.player.gridX + this.player.facing.x;
    const fy = this.player.gridY + this.player.facing.y;
    const npc = this.npcs.find(n => n.gridX === fx && n.gridY === fy);
    if (npc) { this.interactWith(npc); return; }
    const cm = chapter1Data.maps.find(m => m.id === this.currentMapId);
    if (cm && (cm as any).boss && !this.quests.getQuestFlag('boss_defeated')) {
      this.startBossCombat((cm as any).boss);
    }
  }

  // ====== Exits / Stairs / Chests / Encounters ======

  private checkExits(): void {
    const def = STATIC_MAPS[this.currentMapId];
    if (!def) return;
    for (const e of def.exits) {
      if (this.player.gridX === e.x && this.player.gridY === e.y) {
        this.loadMap(e.target, e.tx, e.ty);
        return;
      }
    }
  }

  private checkStairs(): void {
    if (!this.dungeonMap) return;
    const t = this.currentTiles[this.player.gridY]?.[this.player.gridX];
    const maps = chapter1Data.maps;
    const idx = maps.findIndex(m => m.id === this.currentMapId);
    if (t === T.STAIRS_DOWN && idx >= 0 && idx < maps.length - 1) {
      this.run.dungeonFloor++;
      this.loadMap(maps[idx + 1].id, -1, -1);
    } else if (t === T.STAIRS_UP && this.currentMapId !== chapter1Data.startMap && idx > 0) {
      this.run.dungeonFloor = Math.max(0, this.run.dungeonFloor - 1);
      this.loadMap(maps[idx - 1].id, -1, -1);
    }
  }

  private checkChest(): void {
    const t = this.currentTiles[this.player.gridY]?.[this.player.gridX];
    if (t !== T.CHEST) return;
    const items = ['health_potion', 'mana_potion', 'herb'];
    const item = items[rollInt(0, items.length - 1)];
    this.inventory.addItem(item);
    this.currentTiles[this.player.gridY][this.player.gridX] = T.FLOOR;
    this.tilemap.putTileAt(T.FLOOR, this.player.gridX, this.player.gridY);
    AudioManager.getInstance().playChestOpen();
    this.panel()?.addMessage(`Found chest! Got ${item.replace(/_/g, ' ')}!`, '#ddaa00');
  }

  private checkEncounter(): void {
    const cm = chapter1Data.maps.find(m => m.id === this.currentMapId);
    if (!cm || (cm as any).safeZone) return;
    const tid = (cm as any).encounterTable;
    if (!tid) return;
    const table = (encountersData as any)[tid];
    if (!table) return;
    this.stepsSinceEncounter++;
    if (this.stepsSinceEncounter < 3) return;
    if (rollFloat() < table.encounterRate) {
      this.stepsSinceEncounter = 0;
      this.startRandomCombat(table);
    }
  }

  // ====== Combat ======

  startRandomCombat(table: any): void {
    const cnt = rollInt(table.minEnemies, table.maxEnemies);
    const enemies = this.rollEnemies(table.enemies, cnt);
    this.panel()?.startCombat(enemies, false);
  }

  startBossCombat(bossId: string): void {
    const d = (enemiesData as any)[bossId];
    if (!d) return;
    this.panel()?.startCombat([{ ...d, id: bossId }], true);
  }

  private rollEnemies(list: any[], count: number): any[] {
    const tw = list.reduce((s: number, e: any) => s + e.weight, 0);
    const res: any[] = [];
    for (let i = 0; i < count; i++) {
      let r = rollFloat() * tw;
      for (const entry of list) {
        r -= entry.weight;
        if (r <= 0) {
          const d = (enemiesData as any)[entry.id];
          if (d) res.push({ ...d, id: entry.id });
          break;
        }
      }
    }
    return res;
  }

  // ====== Public callbacks ======

  onCombatVictory(rewards: { xp: number; gold: number; loot: string[] }): void {
    this.run.gold = (this.run.gold ?? 0) + rewards.gold;
    this.inventory.gold += rewards.gold;
    for (const item of rewards.loot) this.inventory.addItem(item);
    this.character.xp += rewards.xp;

    // Process equipment mastery → skill learning
    const learned = SkillSystem.processVictory(this.inventory.equipment, this.character);
    for (const sk of learned) {
      this.panel()?.addMessage(`Mastered ${sk.itemName}! Learned ${sk.skillName}!`, '#ffcc44');
      AudioManager.getInstance().playLevelUp();
    }

    SaveSystem.saveCharacter(this.character);
    this.saveRun();
  }

  onCombatDefeat(): void {
    SaveSystem.deleteRun();
    this.scene.stop('HUDScene');
    this.scene.start('GameOverScene', { character: this.character });
  }

  onBossDefeated(): void {
    this.quests.setQuestFlag('boss_defeated', true);
    this.saveRun();
    this.character.completedChapters.push(chapter1Data.id);
    SaveSystem.saveCharacter(this.character);
    SaveSystem.deleteRun();
    this.scene.stop('HUDScene');
    this.scene.start('ChapterCompleteScene', { character: this.character, chapterTitle: chapter1Data.title, outro: chapter1Data.story.outro });
  }

  onDialogAction(action: string): void {
    const [cmd, ...args] = action.split(':');
    const arg = args.join(':');
    if (cmd === 'giveItem') { this.inventory.addItem(arg); this.saveRun(); }
    else if (cmd === 'startQuest') { this.quests.setQuestFlag(arg, false); this.saveRun(); }
    else if (cmd === 'openShop') { this.panel()?.showShop(); }
  }

  panel(): any { return this.scene.get('HUDScene'); }

  // ====== Fog of War rendering ======

  /** Returns true if the tile blocks line of sight */
  private tileBlocksVision(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gy >= this.mapH || gx >= this.mapW) return true;
    const t = this.currentTiles[gy]?.[gx];
    return t !== undefined && SOLID.has(t);
  }

  private renderFog(): void {
    this.fogGfx.clear();
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const vis = this.fog.getVisibility(x, y);
        if (vis === Visibility.UNSEEN) {
          this.fogGfx.fillStyle(0x000000, 1.0);
          this.fogGfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else if (vis === Visibility.EXPLORED) {
          this.fogGfx.fillStyle(0x000000, 0.55);
          this.fogGfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
        // VISIBLE tiles have no overlay
      }
    }
  }

  private updateNpcVisibility(): void {
    for (const npc of this.npcs) {
      npc.setVisible(this.fog.getVisibility(npc.gridX, npc.gridY) === Visibility.VISIBLE);
    }
  }

  saveRun(): void {
    const inv = this.inventory.serialize();
    this.run.inventory = inv.items;
    this.run.equipment = inv.equipment;
    this.run.gold = inv.gold;
    const q = this.quests.serialize();
    this.run.questFlags = q.questFlags;
    this.run.storyFlags = q.storyFlags;
    this.run.hp = Math.max(0, this.run.hp);
    this.run.mp = Math.max(0, this.run.mp);
    // Save fog of war explored state for current map
    if (this.fog && this.currentMapId) {
      if (!this.run.fogExplored) this.run.fogExplored = {};
      this.run.fogExplored[this.currentMapId] = this.fog.serializeExplored();
    }
    SaveSystem.saveRun(this.run);
  }
}
