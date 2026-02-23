import Phaser from 'phaser';
import { TILE_SIZE, GAME_WIDTH, GAME_HEIGHT, MOVE_DURATION, VIEW_RADIUS } from '../config';
import { Player } from '../entities/Player';
import { NPC } from '../entities/NPC';
import { Enemy } from '../entities/Enemy';
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
import npcsData from '../data/npcs.json';
import dialogData from '../data/dialogs/village.json';

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
      if (x === w - 1) { m[y][x] = (y >= 24 && y <= 26) ? T.PATH : T.TREE; continue; }

      // Main east-west road
      if ((y >= 24 && y <= 26) && x >= 1) { m[y][x] = T.PATH; continue; }
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
  // Distance from (x,y) to the nearest point on the main path centreline
  function pathDist(x: number, y: number): number {
    let best = Infinity;
    // West segment centreline: y=25, x 0-20
    if (x <= 20) best = Math.min(best, Math.abs(y - 25));
    // Diagonal centreline: x 20-40, cy = 25 + (x-20)/4
    if (x >= 20 && x <= 40) {
      const cy = 25 + (x - 20) / 4;
      best = Math.min(best, Math.abs(y - cy));
    }
    // East segment centreline: y=30, x >= 38
    if (x >= 38) best = Math.min(best, Math.abs(y - 30));
    // Closest horizontal distance to segments
    if (y >= 24 && y <= 26) best = Math.min(best, Math.max(0, x - 20));
    if (y >= 29 && y <= 31) best = Math.min(best, Math.max(0, 38 - x));
    return best;
  }
  for (let y = 0; y < h; y++) {
    m[y] = [];
    for (let x = 0; x < w; x++) {
      // Border trees (leave exits open)
      if (y === 0 || y === h - 1) { m[y][x] = T.TREE; continue; }
      if (x === 0) { m[y][x] = (y >= 24 && y <= 26) ? T.PATH : T.TREE; continue; }
      if (x === w - 1) { m[y][x] = (y >= 29 && y <= 31) ? T.PATH : T.TREE; continue; }

      const pd = pathDist(x, y);

      // Main path core (3 tiles wide around centreline)
      if (pd <= 1.5) { m[y][x] = T.PATH; continue; }

      // Clear grass zone around path (no trees allowed within 4 tiles)
      const nearPath = pd <= 4;

      // A stream running north-south (but not if it blocks near-path area)
      if (!nearPath) {
        if (x >= 50 && x <= 51 && y >= 5 && y <= 20) { m[y][x] = T.WATER; continue; }
        if (x === 50 && y >= 20 && y <= 28) { m[y][x] = T.WATER; continue; }
      }

      // Small clearing (open grass area)
      const distFromClearing = Math.sqrt((x - 30) ** 2 + (y - 15) ** 2);
      if (distFromClearing < 5) { m[y][x] = T.GRASS; continue; }

      // Second clearing near east exit
      const distFromClearing2 = Math.sqrt((x - 65) ** 2 + (y - 30) ** 2);
      if (distFromClearing2 < 4) { m[y][x] = T.GRASS; continue; }

      // No trees in the clear zone around path
      if (nearPath) { m[y][x] = T.GRASS; continue; }

      // Forest trees with pseudo-random placement (lower density = more navigable)
      const treeNoise = Math.abs(Math.sin(x * 3.7 + y * 2.1) + Math.cos(x * 1.3 - y * 4.2));
      if (treeNoise > 1.0) { m[y][x] = T.TREE; continue; }

      m[y][x] = T.GRASS;
    }
  }

  // Post-process: flood-fill from path entrance, convert any unreachable
  // grass tiles to trees so the player can't wander into dead-end pockets.
  const reachable = new Set<number>();
  const q: number[] = [25 * 10000 + 1]; // start at (1,25) — entrance
  reachable.add(q[0]);
  const solid = new Set([T.WALL, T.TREE, T.WATER, T.HOUSE_WALL, T.HOUSE_ROOF]);
  while (q.length) {
    const k = q.pop()!;
    const cx = k % 10000, cy = (k - cx) / 10000;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]] as [number,number][]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = ny * 10000 + nx;
      if (reachable.has(nk)) continue;
      if (solid.has(m[ny][nx])) continue;
      reachable.add(nk);
      q.push(nk);
    }
  }
  // Any grass tile NOT reachable → tree (removes dead-end pockets)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (m[y][x] === T.GRASS && !reachable.has(y * 10000 + x)) m[y][x] = T.TREE;
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
  village: { width: 70, height: 50, tiles: generateVillageMap(), exits: [
    { x: 69, y: 24, target: 'forest', tx: 1, ty: 24 },
    { x: 69, y: 25, target: 'forest', tx: 1, ty: 25 },
    { x: 69, y: 26, target: 'forest', tx: 1, ty: 26 },
  ] },
  forest: { width: 80, height: 55, tiles: generateForestMap(), exits: [
    { x: 0, y: 24, target: 'village', tx: 68, ty: 24 },
    { x: 0, y: 25, target: 'village', tx: 68, ty: 25 },
    { x: 0, y: 26, target: 'village', tx: 68, ty: 26 },
    { x: 79, y: 29, target: 'cave_floor1', tx: -1, ty: -1 },
    { x: 79, y: 30, target: 'cave_floor1', tx: -1, ty: -1 },
    { x: 79, y: 31, target: 'cave_floor1', tx: -1, ty: -1 },
  ] },
  cave_boss: { width: 55, height: 40, tiles: generateBossRoom(), exits: [{ x: 27, y: 39, target: 'cave_floor3', tx: -1, ty: -1 }] },
};

const FAST_TRAVEL: Record<string, { name: string; map: string; x: number; y: number }> = {
  village: { name: 'Village', map: 'village', x: 35, y: 25 },
  forest: { name: 'Whispering Woods', map: 'forest', x: 1, y: 25 },
  cave: { name: 'Cave Entrance', map: 'cave_floor1', x: -1, y: -1 },
};

const MAP_TO_WAYPOINT: Record<string, string> = {
  village: 'village',
  forest: 'forest',
  cave_floor1: 'cave',
  cave_floor2: 'cave',
  cave_floor3: 'cave',
  cave_boss: 'cave',
};

export class WorldScene extends Phaser.Scene {
  player!: Player;
  npcs: NPC[] = [];
  mapEnemies: Enemy[] = [];
  private contactEnemy: Enemy | null = null;
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
  private questChests = new Map<string, { itemId: string; flag: string; message: string }>();
  inputManager!: InputManager;
  busy = false;

  constructor() { super({ key: 'WorldScene' }); }

  init(): void {
    this.character = SaveSystem.loadCharacter()!;
    this.run = SaveSystem.loadRun()!;
    if (!this.run.waypoints) this.run.waypoints = [];
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

      // During dialog, clicking NPC advances; clicking elsewhere ends dialog
      if (p && p.mode === 'dialog') {
        const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const gx = Math.floor(wp.x / TILE_SIZE);
        const gy = Math.floor(wp.y / TILE_SIZE);
        if (this.npcs.some(n => n.gridX === gx && n.gridY === gy)) {
          p.advanceDialog();
        } else {
          p.endDialogPublic();
        }
        return;
      }

      // During combat, clicking the world area advances the fight
      if (p && p.mode === 'combat') {
        const fsm = p.combat?.fsm?.current;
        if (fsm === 'ANIMATE' || fsm === 'TURN_START') {
          p.combat.advanceFromAnimate();
        } else if (fsm === 'PLAYER_CHOOSE') {
          p.submitCombatAction({ type: 'attack', targetIndex: 0 });
        }
        return;
      }

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

      // Clicked a map enemy? Engage like NPCs — adjacent = immediate, far = pathfind
      const enemy = this.mapEnemies.find(e => e.gridX === gx && e.gridY === gy && e.visible);
      if (enemy) {
        const dist = Math.abs(this.player.gridX - gx) + Math.abs(this.player.gridY - gy);
        if (dist <= 1) {
          // Adjacent or same tile — engage immediately
          this.player.facing = { x: gx - this.player.gridX, y: gy - this.player.gridY };
          this.engageEnemy(enemy);
          return;
        }
        // Far away — pathfind to adjacent tile, enemy pos as sentinel
        const adj = this.findAdjacentWalkable(gx, gy);
        if (adj) {
          const path = this.findPath(this.player.gridX, this.player.gridY, adj.x, adj.y);
          if (path.length > 0) {
            this.movePath = [...path, { x: gx, y: gy }]; // enemy pos = sentinel
          }
        }
        return;
      }

      // Clicked walkable tile — allow if explored or visible (not hidden fog)
      const fogState = this.fog?.getVisibility(gx, gy) ?? Visibility.UNSEEN;
      if (fogState !== Visibility.UNSEEN && this.isTileWalkable(gx, gy)) {
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
      const enemy = this.mapEnemies.find(e => e.gridX === next.x && e.gridY === next.y && e.visible);
      if (enemy) {
        this.movePath = [];
        this.player.facing = { x: next.x - this.player.gridX, y: next.y - this.player.gridY };
        this.engageEnemy(enemy);
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
    this.mapEnemies.forEach(e => e.destroy());
    this.mapEnemies = [];
    this.contactEnemy = null;
    if (this.player) this.player.destroy();
    if (this.fogGfx) this.fogGfx.destroy();
    this.dungeonMap = null;
    this.currentMapId = mapId;
    this.stepsSinceEncounter = 0;
    this.movePath = [];
    this.questChests.clear();
    if (!this.run.defeatedEnemies) this.run.defeatedEnemies = {};

    // Discover fast-travel waypoint for this map
    const wpKey = MAP_TO_WAYPOINT[mapId];
    if (wpKey && !this.run.waypoints.includes(wpKey)) {
      this.run.waypoints.push(wpKey);
    }

    // Set story flags for quest-reactive dialogs
    if (mapId === 'forest') this.quests.setStoryFlag('entered_forest');
    if (mapId.startsWith('cave_')) this.quests.setStoryFlag('entered_cave');

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
    this.updateEnemyVisibility();

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

    // Floor transition events (atmospheric text on first entry)
    if (mapId === 'cave_floor1' && !this.quests.getStoryFlag('first_cave_entry')) {
      this.quests.setStoryFlag('first_cave_entry');
      this.time.delayedCall(500, () => this.panel()?.addMessage('The air turns cold. Scratching echoes from deep below...', '#8888cc'));
    }
    if (mapId === 'cave_floor2' && !this.quests.getStoryFlag('entered_cave_f2')) {
      this.quests.setStoryFlag('entered_cave_f2');
      this.time.delayedCall(500, () => this.panel()?.addMessage('The tunnels narrow. Goblin war drums echo ahead...', '#8888cc'));
    }
    if (mapId === 'cave_floor3' && !this.quests.getStoryFlag('entered_cave_f3')) {
      this.quests.setStoryFlag('entered_cave_f3');
      this.time.delayedCall(500, () => this.panel()?.addMessage('The stench of rot grows stronger. Something powerful lurks below...', '#8888cc'));
    }

    // Boss room auto-trigger
    if (mapId === 'cave_boss' && !this.quests.getQuestFlag('boss_defeated')) {
      this.busy = true;
      this.time.delayedCall(600, () => this.panel()?.addMessage('The barrier dissolves as you descend...', '#cc88ff'));
      this.time.delayedCall(2200, () => this.panel()?.addMessage('"You dare enter MY domain?!"', '#ff6644'));
      this.time.delayedCall(4000, () => this.panel()?.addMessage('"No one leaves these halls alive!"', '#ff6644'));
      this.time.delayedCall(6000, () => {
        this.busy = false;
        this.startBossCombat('goblin_chief');
      });
    }
  }

  private loadStatic(mapId: string, sx: number, sy: number): void {
    const def = STATIC_MAPS[mapId];
    if (!def) return;
    this.mapW = def.width; this.mapH = def.height; this.currentTiles = def.tiles;
    this.buildTilemap(def.tiles, def.width, def.height);
    // Handle -1,-1 spawn (coming from dungeon stairs): place near the cave exit
    if (sx < 0 || sy < 0) {
      const caveExit = def.exits.find(e => e.target.startsWith('cave'));
      if (caveExit) {
        sx = caveExit.x > 0 ? caveExit.x - 1 : caveExit.x + 1;
        sy = caveExit.y;
      } else {
        // Fallback: first walkable tile
        outer: for (let y = 0; y < def.height; y++) {
          for (let x = 0; x < def.width; x++) {
            if (!SOLID.has(def.tiles[y][x])) { sx = x; sy = y; break outer; }
          }
        }
      }
    }
    const cd = (classesData as any)[this.character.class];
    this.player = EntityFactory.createPlayer(this, sx, sy, cd.spriteKey);
    this.npcs = EntityFactory.createNPCsForMap(this, mapId);
    for (const n of this.npcs) n.setInteractive({ useHandCursor: true });
    // Spawn visible enemies
    const defeated = this.run.defeatedEnemies?.[mapId] ?? [];
    this.mapEnemies = EntityFactory.createEnemiesForMap(this, mapId, this.run.dungeonSeed, null, def.tiles, defeated);
    for (const e of this.mapEnemies) e.setInteractive({ useHandCursor: true });
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
    // Spawn visible enemies in dungeon rooms
    const defeated = this.run.defeatedEnemies?.[mapId] ?? [];
    this.mapEnemies = EntityFactory.createEnemiesForMap(this, mapId, this.run.dungeonSeed, this.dungeonMap, tiles, defeated);
    for (const e of this.mapEnemies) e.setInteractive({ useHandCursor: true });

    // Place quest items in specific dungeon chests
    const midRooms = this.dungeonMap.rooms.slice(1, this.dungeonMap.rooms.length - 1);
    const roomCenter = (r: { x: number; y: number; w: number; h: number }) =>
      `${Math.floor(r.x + r.w / 2)},${Math.floor(r.y + r.h / 2)}`;
    if (mapId === 'cave_floor1' && !this.quests.getStoryFlag('found_journal') && midRooms.length > 0) {
      this.questChests.set(roomCenter(midRooms[0]), {
        itemId: 'tattered_journal', flag: 'found_journal',
        message: 'Found a Tattered Journal! The faded pages describe organized goblin patrols and mention a powerful leader deeper in the caves.',
      });
    }
    if (mapId === 'cave_floor2' && !this.quests.getStoryFlag('read_cave_warning') && midRooms.length > 0) {
      this.questChests.set(roomCenter(midRooms[midRooms.length - 1]), {
        itemId: '', flag: 'read_cave_warning',
        message: 'Scrawled on the wall: "The chief commands from below. His banner holds dark power. Do not face him unprepared..."',
      });
    }
    if (mapId === 'cave_floor3' && !this.quests.getStoryFlag('found_banner') && midRooms.length > 0) {
      this.questChests.set(roomCenter(midRooms[midRooms.length - 1]), {
        itemId: 'goblin_war_banner', flag: 'found_banner',
        message: 'Found a Goblin War Banner! Strange glowing symbols cover the tattered fabric. It pulses with dark energy.',
      });
    }
  }

  private buildTilemap(tiles: number[][], w: number, h: number): void {
    this.tilemap = this.make.tilemap({ data: tiles, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, width: w, height: h });
    const ts = this.tilemap.addTilesetImage('tiles', 'tileset', TILE_SIZE, TILE_SIZE)!;
    this.tileLayer = this.tilemap.createLayer(0, ts, 0, 0)!;
  }

  /** Returns minimap data for HUDScene rendering */
  getMinimapData(): { w: number; h: number; tiles: number[][]; fog: FogOfWar; px: number; py: number } | null {
    if (!this.currentTiles.length || !this.fog || !this.player) return null;
    return {
      w: this.mapW, h: this.mapH, tiles: this.currentTiles,
      fog: this.fog, px: this.player.gridX, py: this.player.gridY,
    };
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
    // Enemies are walkable — stepping on them triggers combat
    return true;
  }

  private onStep(): void {
    // Update fog of war
    this.fog.update(this.player.gridX, this.player.gridY, VIEW_RADIUS);
    this.renderFog();
    this.updateNpcVisibility();
    this.updateEnemyVisibility();

    // Track current map — if any check triggers loadMap, stop processing
    const mapBefore = this.currentMapId;

    // Check exits before enemy contact — if on transition tile, leave the map
    this.checkExits();
    if (this.currentMapId !== mapBefore) return;

    // Check for enemy contact (bumping into enemy = combat)
    if (this.checkEnemyContact()) return;
    this.checkStairs();
    if (this.currentMapId !== mapBefore) return;
    this.checkChest();
    this.checkEncounter();

    // Enemy turns: visible/alert enemies move toward the player
    if (this.processEnemyTurns()) return;

    // HP/MP regen: restore 1 HP and 1 MP every 8 steps
    if (this.run.stepCount % 8 === 0) {
      let healed = false;
      if (this.run.hp < this.run.maxHp) { this.run.hp = Math.min(this.run.maxHp, this.run.hp + 1); healed = true; }
      if (this.run.mp < this.run.maxMp) { this.run.mp = Math.min(this.run.maxMp, this.run.mp + 1); healed = true; }
      if (healed) this.panel()?.refreshStats();
    }

    if (this.run.stepCount % 10 === 0) this.saveRun();
    this.panel()?.refreshStats();
  }

  // ====== Pathfinding (BFS, scales to full map) ======

  findPath(sx: number, sy: number, ex: number, ey: number): { x: number; y: number }[] {
    if (sx === ex && sy === ey) return [];
    const maxNodes = this.mapW * this.mapH;
    const key = (x: number, y: number) => y * 10000 + x;
    const visited = new Set<number>([key(sx, sy)]);
    const parent = new Map<number, number>();
    const queue = [key(sx, sy)];
    const dirs = [
      { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];
    let found = false;
    let head = 0;
    while (head < queue.length && !found && visited.size < maxNodes) {
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

  interactWith(npc: NPC): void {
    const dialogId = this.getReactiveDialogId(npc);
    const npcData = (npcsData as any)[npc.npcId];
    this.panel()?.startDialog(dialogId, npcData?.spriteKey, npcData?.name);
  }

  private getReactiveDialogId(npc: NPC): string {
    const base = npc.dialogId;
    const checks: [boolean, string][] = [
      [!!this.quests.getQuestFlag('boss_defeated'), '_hero'],
      [!!this.quests.getStoryFlag('banner_deciphered'), '_banner_deciphered'],
      [!!this.quests.getStoryFlag('found_banner'), '_found_banner'],
      [!!this.quests.getStoryFlag('journal_deciphered'), '_journal_deciphered'],
      [!!this.quests.getStoryFlag('found_journal'), '_found_journal'],
      [!!this.quests.getStoryFlag('entered_cave'), '_cave'],
      [!!this.quests.getStoryFlag('entered_forest'), '_forest'],
    ];
    for (const [condition, suffix] of checks) {
      if (condition) {
        const id = base + suffix;
        if ((dialogData as any)[id]) return id;
      }
    }
    return base;
  }

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
    const px = this.player.gridX, py = this.player.gridY;
    for (const e of def.exits) {
      if (px === e.x && py === e.y) {
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
      // Boss room gating: need banner_deciphered to enter
      if (maps[idx + 1].id === 'cave_boss' && !this.quests.getStoryFlag('banner_deciphered')) {
        this.panel()?.addMessage('A strange barrier blocks the way... The symbols pulse with eerie light.', '#cc88ff');
        return;
      }
      this.run.dungeonFloor++;
      this.loadMap(maps[idx + 1].id, -1, -1);
    } else if (t === T.STAIRS_UP && this.currentMapId !== chapter1Data.startMap && idx > 0) {
      this.run.dungeonFloor = Math.max(0, this.run.dungeonFloor - 1);
      this.loadMap(maps[idx - 1].id, -1, -1);
    }
  }

  private checkChest(): void {
    const px = this.player.gridX, py = this.player.gridY;
    const t = this.currentTiles[py]?.[px];
    if (t !== T.CHEST) return;

    const questKey = `${px},${py}`;
    const qi = this.questChests.get(questKey);
    if (qi) {
      if (qi.itemId) this.inventory.addItem(qi.itemId);
      this.quests.setStoryFlag(qi.flag);
      this.questChests.delete(questKey);
      this.panel()?.addMessage(qi.message, '#ffcc44');
      this.saveRun();
    } else {
      const floor = this.run.dungeonFloor || 0;
      const LOOT: Record<number, string[]> = {
        1: ['health_potion', 'herb', 'herb', 'mana_potion', 'leather_armor'],
        2: ['health_potion', 'mana_potion', 'antidote', 'bomb', 'short_sword'],
        3: ['health_potion', 'mana_potion', 'bomb', 'bomb', 'chain_mail'],
      };
      const pool = LOOT[floor] || ['health_potion', 'mana_potion', 'herb'];
      const item = pool[rollInt(0, pool.length - 1)];
      this.inventory.addItem(item);
      this.panel()?.addMessage(`Found chest! Got ${item.replace(/_/g, ' ')}!`, '#ddaa00');
    }

    this.currentTiles[py][px] = T.FLOOR;
    this.tilemap.putTileAt(T.FLOOR, px, py);
    AudioManager.getInstance().playChestOpen();
  }

  private checkEncounter(): void {
    // No random encounters on maps with visible enemies
    if (this.mapEnemies.length > 0) return;
    const cm = chapter1Data.maps.find(m => m.id === this.currentMapId);
    if (!cm || (cm as any).safeZone) return;
    const tid = (cm as any).encounterTable;
    if (!tid) return;
    const table = (encountersData as any)[tid];
    if (!table) return;
    this.stepsSinceEncounter++;
    if (this.stepsSinceEncounter < 5) return;
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

    // Remove the map enemy that was contacted (if any)
    if (this.contactEnemy) {
      if (!this.run.defeatedEnemies) this.run.defeatedEnemies = {};
      if (!this.run.defeatedEnemies[this.currentMapId]) this.run.defeatedEnemies[this.currentMapId] = [];
      this.run.defeatedEnemies[this.currentMapId].push(this.contactEnemy.spawnIndex);
      const idx = this.mapEnemies.indexOf(this.contactEnemy);
      if (idx >= 0) this.mapEnemies.splice(idx, 1);
      this.contactEnemy.destroy();
      this.contactEnemy = null;
    }

    // Process equipment mastery → skill learning
    const learned = SkillSystem.processVictory(this.inventory.equipment, this.character);
    for (const sk of learned) {
      this.panel()?.addMessage(`Mastered ${sk.itemName}! Learned ${sk.skillName}!`, '#ffcc44');
      AudioManager.getInstance().playLevelUp();
    }

    // Check for level-up
    this.checkLevelUp();

    SaveSystem.saveCharacter(this.character);
    this.saveRun();
  }

  /** XP required to reach a given level. Formula: 40 * level * (level + 1) / 2 */
  static xpForLevel(level: number): number {
    return 40 * level * (level + 1) / 2;
  }

  private checkLevelUp(): void {
    const cd = (classesData as any)[this.character.class];
    if (!cd) return;
    let leveled = false;
    while (this.character.xp >= WorldScene.xpForLevel(this.character.level + 1)) {
      this.character.level++;
      leveled = true;

      // Apply growth stats
      const g = cd.growth;
      this.run.maxHp += g.hp;
      this.run.maxMp += g.mp;
      this.run.stats.attack += g.attack;
      this.run.stats.defense += g.defense;
      this.run.stats.speed += g.speed;
      this.run.stats.magic += g.magic;

      // Full heal on level up
      this.run.hp = this.run.maxHp;
      this.run.mp = this.run.maxMp;

      this.panel()?.addMessage(`Level Up! Now level ${this.character.level}!`, '#ffcc44');
      this.panel()?.showLevelUpBanner(this.character.level);
      AudioManager.getInstance().playLevelUp();
    }
    if (leveled) this.panel()?.refreshStats();
  }

  onCombatDefeat(): void {
    SaveSystem.deleteRun();
    this.scene.stop('HUDScene');
    this.scene.start('GameOverScene', { character: this.character });
  }

  onBossDefeated(): void {
    this.quests.setQuestFlag('boss_defeated', true);
    this.saveRun();
    this.busy = true;
    this.time.delayedCall(2000, () => {
      this.panel()?.addMessage('Beyond the throne, a sealed passage glows with ancient runes...', '#cc88ff');
      this.time.delayedCall(3000, () => {
        this.panel()?.addMessage('A shimmering portal appears, pulling you back to the village...', '#aaddff');
        this.time.delayedCall(2500, () => {
          this.loadMap('village', 10, 25);
          this.busy = false;
          this.time.delayedCall(800, () => {
            this.panel()?.startDialog('elder_greetings_hero');
          });
        });
      });
    });
  }

  onDialogAction(action: string): void {
    const [cmd, ...args] = action.split(':');
    const arg = args.join(':');
    if (cmd === 'giveItem') { this.inventory.addItem(arg); this.saveRun(); }
    else if (cmd === 'startQuest') { this.quests.setQuestFlag(arg, false); this.saveRun(); }
    else if (cmd === 'openShop') { this.panel()?.showShop(arg || undefined); }
    else if (cmd === 'setFlag') { this.quests.setStoryFlag(arg); this.saveRun(); }
    else if (cmd === 'setQuestFlag') { this.quests.setQuestFlag(arg, true); this.saveRun(); }
    else if (cmd === 'addGold') {
      const amount = parseInt(arg, 10);
      if (!isNaN(amount)) {
        this.run.gold = (this.run.gold ?? 0) + amount;
        this.inventory.gold += amount;
        this.panel()?.addMessage(`Received ${amount} gold!`, '#ddaa00');
        this.panel()?.refreshStats();
        this.saveRun();
      }
    }
    else if (cmd === 'heal') {
      this.run.hp = this.run.maxHp;
      this.run.mp = this.run.maxMp;
      this.panel()?.addMessage('Fully restored!', '#66dd66');
      this.panel()?.refreshStats();
      this.saveRun();
    }
    else if (cmd === 'removeItem') { this.inventory.removeItem(arg); this.saveRun(); }
    else if (cmd === 'chapterComplete') {
      this.character.completedChapters.push(chapter1Data.id);
      SaveSystem.saveCharacter(this.character);
      SaveSystem.deleteRun();
      this.scene.stop('HUDScene');
      this.scene.start('ChapterCompleteScene', { character: this.character, chapterTitle: chapter1Data.title, outro: chapter1Data.story.outro });
    }
  }

  panel(): any { return this.scene.get('HUDScene'); }

  getDiscoveredWaypoints(): { id: string; name: string; map: string; x: number; y: number }[] {
    const currentWp = MAP_TO_WAYPOINT[this.currentMapId];
    return (this.run.waypoints ?? [])
      .filter(id => id !== currentWp && FAST_TRAVEL[id])
      .map(id => ({ id, ...FAST_TRAVEL[id] }));
  }

  fastTravelTo(waypointId: string): void {
    const wp = FAST_TRAVEL[waypointId];
    if (!wp) return;
    this.movePath = [];
    this.loadMap(wp.map, wp.x, wp.y);
  }

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
          this.fogGfx.fillStyle(0x2a1e10, 1.0);
          this.fogGfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else if (vis === Visibility.EXPLORED) {
          this.fogGfx.fillStyle(0x2a1e10, 0.50);
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

  private updateEnemyVisibility(): void {
    for (const enemy of this.mapEnemies) {
      const vis = this.fog.getVisibility(enemy.gridX, enemy.gridY);
      // Alert enemies stay visible even in explored (dimmed) fog so the player
      // can see them coming — only fully hidden in UNSEEN tiles.
      enemy.setVisible(vis === Visibility.VISIBLE || (enemy.alert && vis === Visibility.EXPLORED));
    }
  }

  // ====== Enemy AI turns (map movement) ======

  /**
   * After each player step, every visible/alert enemy takes one step toward the player.
   * If an enemy reaches adjacent tile it initiates combat.
   * Returns true if combat was triggered.
   */
  private processEnemyTurns(): boolean {
    const px = this.player.gridX;
    const py = this.player.gridY;
    // Collect enemies that should act this turn
    const acting: Enemy[] = [];
    for (const e of this.mapEnemies) {
      const vis = this.fog.getVisibility(e.gridX, e.gridY);
      if (vis === Visibility.VISIBLE) {
        e.alert = true;
        e.alertTurns = 5; // remember player for 5 turns after losing sight
      } else if (e.alert) {
        e.alertTurns--;
        if (e.alertTurns <= 0) { e.alert = false; continue; }
      }
      if (e.alert) acting.push(e);
    }
    // Sort by distance (closest first) so closer enemies move first
    acting.sort((a, b) => {
      const da = Math.abs(a.gridX - px) + Math.abs(a.gridY - py);
      const db = Math.abs(b.gridX - px) + Math.abs(b.gridY - py);
      return da - db;
    });

    // Set of occupied tiles this turn (player + NPCs + all enemies current pos)
    const occupied = new Set<number>();
    occupied.add(py * 10000 + px); // player tile
    for (const n of this.npcs) occupied.add(n.gridY * 10000 + n.gridX);
    for (const e of this.mapEnemies) occupied.add(e.gridY * 10000 + e.gridX);

    let combatTriggered = false;
    for (const enemy of acting) {
      const dist = Math.abs(enemy.gridX - px) + Math.abs(enemy.gridY - py);
      // Already adjacent or on player — engage only if on a visible tile
      if (dist <= 1) {
        if (this.fog.getVisibility(enemy.gridX, enemy.gridY) !== Visibility.VISIBLE) continue;
        this.engageEnemy(enemy);
        combatTriggered = true;
        break;
      }
      // Find best step toward player (4-directional)
      const step = this.enemyBestStep(enemy, px, py, occupied);
      if (step) {
        // Update occupied set
        occupied.delete(enemy.gridY * 10000 + enemy.gridX);
        enemy.moveTo(step.x, step.y);
        occupied.add(step.y * 10000 + step.x);
        // After moving, check if now adjacent and visible
        const newDist = Math.abs(step.x - px) + Math.abs(step.y - py);
        if (newDist <= 1 && this.fog.getVisibility(step.x, step.y) === Visibility.VISIBLE) {
          this.engageEnemy(enemy);
          combatTriggered = true;
          break;
        }
      }
    }
    // Update visibility after enemies move
    this.updateEnemyVisibility();
    return combatTriggered;
  }

  /**
   * Simple greedy step: pick the cardinal neighbor that's closest to the player,
   * walkable, and not occupied by another entity.
   */
  private enemyBestStep(
    enemy: Enemy, px: number, py: number, occupied: Set<number>,
  ): { x: number; y: number } | null {
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    let best: { x: number; y: number } | null = null;
    let bestDist = Math.abs(enemy.gridX - px) + Math.abs(enemy.gridY - py);
    for (const d of dirs) {
      const nx = enemy.gridX + d.x;
      const ny = enemy.gridY + d.y;
      if (!this.isBaseTileWalkable(nx, ny)) continue;
      const nk = ny * 10000 + nx;
      if (occupied.has(nk)) continue;
      const dist = Math.abs(nx - px) + Math.abs(ny - py);
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: nx, y: ny };
      }
    }
    return best;
  }

  /** Tile walkability check without entity blocking (for enemy pathfinding). */
  private isBaseTileWalkable(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gy >= this.mapH || gx >= this.mapW) return false;
    const t = this.currentTiles[gy]?.[gx];
    return t !== undefined && !SOLID.has(t);
  }

  private engageEnemy(enemy: Enemy): void {
    this.contactEnemy = enemy;
    this.movePath = [];
    const d = (enemiesData as any)[enemy.enemyId];
    if (!d) return;
    const foes = [{ ...d, id: enemy.enemyId }];
    if (rollFloat() < 0.3) {
      foes.push({ ...d, id: enemy.enemyId });
    }
    this.panel()?.startCombat(foes, false);
  }

  private checkEnemyContact(): boolean {
    const enemy = this.mapEnemies.find(e => e.gridX === this.player.gridX && e.gridY === this.player.gridY);
    if (!enemy) return false;
    this.engageEnemy(enemy);
    return true;
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
