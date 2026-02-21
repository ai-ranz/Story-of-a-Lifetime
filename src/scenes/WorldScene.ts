import Phaser from 'phaser';
import { TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { Player } from '../entities/Player';
import { NPC } from '../entities/NPC';
import { EntityFactory } from '../entities/EntityFactory';
import { InputManager } from '../systems/InputManager';
import { SaveSystem, RunState, CharacterState } from '../systems/SaveSystem';
import { InventorySystem } from '../systems/InventorySystem';
import { QuestSystem } from '../systems/QuestSystem';
import { DungeonGenerator, DUNGEON_TILE, DungeonMap } from '../systems/DungeonGenerator';
import { rollFloat, rollInt } from '../utils/MathUtils';
import encountersData from '../data/encounters.json';
import chapter1Data from '../data/chapters/chapter1.json';
import classesData from '../data/classes.json';
import enemiesData from '../data/enemies.json';

// Static map definitions (hand-crafted tile arrays since we have no Tiled files)
// Each map: 2D array of tile type strings
const STATIC_MAPS: Record<string, { width: number; height: number; tiles: string[][]; exits: Array<{ x: number; y: number; target: string; tx: number; ty: number }> }> = {
  village: {
    width: 20, height: 15, tiles: generateVillageMap(), exits: [
      { x: 19, y: 7, target: 'forest', tx: 0, ty: 7 },
    ],
  },
  forest: {
    width: 30, height: 20, tiles: generateForestMap(), exits: [
      { x: 0, y: 7, target: 'village', tx: 18, ty: 7 },
      { x: 29, y: 10, target: 'cave_floor1', tx: -1, ty: -1 }, // -1 = use dungeon start
    ],
  },
  cave_boss: {
    width: 15, height: 12, tiles: generateBossRoom(), exits: [
      { x: 7, y: 11, target: 'cave_floor3', tx: -1, ty: -1 },
    ],
  },
};

function generateVillageMap(): string[][] {
  const w = 20, h = 15;
  const m: string[][] = [];
  for (let y = 0; y < h; y++) {
    m[y] = [];
    for (let x = 0; x < w; x++) {
      // Border trees
      if (y === 0 || y === h - 1 || x === 0) {
        m[y][x] = 'tree';
      } else if (x === w - 1) {
        m[y][x] = y === 7 ? 'path' : 'tree'; // exit east at y=7
      }
      // Path through village
      else if (y === 7) {
        m[y][x] = 'path';
      }
      // Houses
      else if ((x >= 3 && x <= 5 && y >= 3 && y <= 5)) {
        m[y][x] = (x === 4 && y === 5) ? 'door' : 'house_wall';
      } else if ((x >= 11 && x <= 13 && y >= 3 && y <= 5)) {
        m[y][x] = (x === 12 && y === 5) ? 'door' : 'house_wall';
      } else if ((x >= 3 && x <= 5 && y >= 9 && y <= 11)) {
        m[y][x] = (x === 4 && y === 9) ? 'door' : 'house_wall';
      }
      // Water pond
      else if (x >= 15 && x <= 17 && y >= 10 && y <= 12) {
        m[y][x] = 'water';
      }
      // Everything else grass
      else {
        m[y][x] = 'grass';
      }
    }
  }
  return m;
}

function generateForestMap(): string[][] {
  const w = 30, h = 20;
  const m: string[][] = [];
  for (let y = 0; y < h; y++) {
    m[y] = [];
    for (let x = 0; x < w; x++) {
      if (y === 0 || y === h - 1) {
        m[y][x] = 'tree';
      } else if (x === 0) {
        m[y][x] = y === 7 ? 'path' : 'tree'; // entrance from village
      } else if (x === w - 1) {
        m[y][x] = y === 10 ? 'path' : 'tree'; // exit to cave
      }
      // Winding path
      else if ((y === 7 && x <= 10) || (x === 10 && y >= 7 && y <= 10) || (y === 10 && x >= 10)) {
        m[y][x] = 'path';
      }
      // Scattered trees
      else if (Math.abs(Math.sin(x * 3.7 + y * 2.1)) > 0.65) {
        m[y][x] = 'tree';
      } else {
        m[y][x] = 'grass';
      }
    }
  }
  return m;
}

function generateBossRoom(): string[][] {
  const w = 15, h = 12;
  const m: string[][] = [];
  for (let y = 0; y < h; y++) {
    m[y] = [];
    for (let x = 0; x < w; x++) {
      if (y === 0 || x === 0 || x === w - 1) {
        m[y][x] = 'wall';
      } else if (y === h - 1) {
        m[y][x] = x === 7 ? 'stairs_up' : 'wall';
      } else {
        m[y][x] = 'floor';
      }
    }
  }
  return m;
}

const TILE_KEY_MAP: Record<string, string> = {
  grass: 'tile_grass',
  path: 'tile_path',
  wall: 'tile_wall',
  floor: 'tile_floor',
  water: 'tile_water',
  tree: 'tile_tree',
  door: 'tile_door',
  house_wall: 'tile_house_wall',
  house_roof: 'tile_house_roof',
  house_door: 'tile_house_door',
  stairs_down: 'tile_stairs_down',
  stairs_up: 'tile_stairs_up',
  chest: 'tile_chest',
};

const SOLID_TILES = new Set(['wall', 'tree', 'water', 'house_wall', 'house_roof']);

export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private npcs: NPC[] = [];
  private input2!: InputManager;
  private inventory!: InventorySystem;
  private quests!: QuestSystem;
  private run!: RunState;
  private character!: CharacterState;
  private mapContainer!: Phaser.GameObjects.Container;
  private currentMapId = '';
  private currentMapTiles: string[][] = [];
  private currentMapWidth = 0;
  private currentMapHeight = 0;
  private dungeonMap: DungeonMap | null = null;
  private moveTimer = 0;
  private stepsSinceEncounter = 0;

  constructor() {
    super({ key: 'WorldScene' });
  }

  init(): void {
    // Load save state
    this.character = SaveSystem.loadCharacter()!;
    this.run = SaveSystem.loadRun()!;

    this.inventory = new InventorySystem();
    this.inventory.deserialize({
      items: this.run.inventory,
      equipment: this.run.equipment,
      gold: this.run.gold,
    });

    this.quests = new QuestSystem();
    this.quests.deserialize({
      questFlags: this.run.questFlags,
      storyFlags: this.run.storyFlags,
    });
  }

  create(): void {
    this.mapContainer = this.add.container(0, 0);
    this.input2 = new InputManager(this);

    // Load the current map
    this.loadMap(this.run.currentMap, this.run.position.x, this.run.position.y);

    // Launch HUD overlay
    this.scene.launch('HUDScene', { worldScene: this });

    // Show chapter intro if this is the first time
    if (!this.quests.getStoryFlag('chapter_intro_shown')) {
      this.quests.setStoryFlag('chapter_intro_shown', true);
      this.showStoryText(chapter1Data.story.intro);
    }
  }

  update(_time: number, delta: number): void {
    if (this.player?.isMoving) return;
    if (this.scene.isActive('DialogScene') || this.scene.isActive('CombatScene') || this.scene.isActive('InventoryScene')) return;

    const state = this.input2.getState();

    // Inventory
    if (state.inventory) {
      this.scene.launch('InventoryScene', { inventory: this.inventory, run: this.run, character: this.character });
      return;
    }

    // Interact
    if (state.action) {
      this.tryInteract();
      return;
    }

    // Movement with repeat delay
    this.moveTimer -= delta;
    const dir = this.input2.getDirectionJustPressed();
    if (dir) {
      this.tryPlayerMove(dir.x, dir.y);
      this.moveTimer = 200; // initial delay before repeat
    } else if (this.input2.isDirectionHeld() && this.moveTimer <= 0) {
      const s = this.input2.getState();
      this.tryPlayerMove(s.direction.x, s.direction.y);
      this.moveTimer = 150;
    }
  }

  // --- Map loading ---

  private loadMap(mapId: string, startX: number, startY: number): void {
    // Clear
    this.mapContainer.removeAll(true);
    this.npcs.forEach(n => n.destroy());
    this.npcs = [];
    this.dungeonMap = null;
    this.currentMapId = mapId;
    this.stepsSinceEncounter = 0;

    const chapterMap = chapter1Data.maps.find(m => m.id === mapId);

    if (chapterMap?.type === 'procedural') {
      this.loadProceduralMap(mapId, chapterMap, startX, startY);
    } else {
      this.loadStaticMap(mapId, startX, startY);
    }

    // Update run state
    this.run.currentMap = mapId;
    this.run.position = { x: this.player.gridX, y: this.player.gridY };
    this.saveRun();

    // Camera follow
    this.cameras.main.setBounds(0, 0, this.currentMapWidth * TILE_SIZE, this.currentMapHeight * TILE_SIZE);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
  }

  private loadStaticMap(mapId: string, startX: number, startY: number): void {
    const mapDef = STATIC_MAPS[mapId];
    if (!mapDef) {
      console.warn(`Unknown static map: ${mapId}`);
      return;
    }

    this.currentMapWidth = mapDef.width;
    this.currentMapHeight = mapDef.height;
    this.currentMapTiles = mapDef.tiles;

    // Render tiles
    for (let y = 0; y < mapDef.height; y++) {
      for (let x = 0; x < mapDef.width; x++) {
        const tileType = mapDef.tiles[y][x];
        const key = TILE_KEY_MAP[tileType] ?? 'tile_grass';
        const sprite = this.add.sprite(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, key);
        this.mapContainer.add(sprite);
      }
    }

    // Create player
    const classData = (classesData as any)[this.character.class];
    this.player = EntityFactory.createPlayer(this, startX, startY, classData.spriteKey);

    // Create NPCs for this map
    this.npcs = EntityFactory.createNPCsForMap(this, mapId);
  }

  private loadProceduralMap(mapId: string, chapterMap: any, startX: number, startY: number): void {
    const floorNum = parseInt(mapId.replace(/\D/g, '') || '1');
    this.dungeonMap = DungeonGenerator.generate(this.run.dungeonSeed, floorNum, chapterMap.width, chapterMap.height);

    this.currentMapWidth = this.dungeonMap.width;
    this.currentMapHeight = this.dungeonMap.height;

    // Convert dungeon tiles to string tile array
    this.currentMapTiles = [];
    for (let y = 0; y < this.dungeonMap.height; y++) {
      this.currentMapTiles[y] = [];
      for (let x = 0; x < this.dungeonMap.width; x++) {
        const t = this.dungeonMap.tiles[y][x];
        let type = 'wall';
        if (t === DUNGEON_TILE.FLOOR) type = 'floor';
        else if (t === DUNGEON_TILE.STAIRS_DOWN) type = 'stairs_down';
        else if (t === DUNGEON_TILE.STAIRS_UP) type = 'stairs_up';
        else if (t === DUNGEON_TILE.CHEST) type = 'chest';
        this.currentMapTiles[y][x] = type;

        const key = TILE_KEY_MAP[type] ?? 'tile_wall';
        const sprite = this.add.sprite(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, key);
        this.mapContainer.add(sprite);
      }
    }

    // Use dungeon start unless explicit
    const sx = startX >= 0 ? startX : this.dungeonMap.startX;
    const sy = startY >= 0 ? startY : this.dungeonMap.startY;

    const classData = (classesData as any)[this.character.class];
    this.player = EntityFactory.createPlayer(this, sx, sy, classData.spriteKey);
  }

  // --- Movement & collision ---

  private tryPlayerMove(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;

    const moved = this.player.tryMove(dx, dy, (gx, gy) => this.isTileWalkable(gx, gy));
    if (moved) {
      this.run.stepCount++;
      this.run.position = { x: this.player.gridX, y: this.player.gridY };
      this.onPlayerStep();
    }
  }

  private isTileWalkable(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gy >= this.currentMapHeight || gx >= this.currentMapWidth) return false;
    const tileType = this.currentMapTiles[gy]?.[gx];
    if (!tileType || SOLID_TILES.has(tileType)) return false;
    // Check NPC collision
    if (this.npcs.some(n => n.gridX === gx && n.gridY === gy)) return false;
    return true;
  }

  private onPlayerStep(): void {
    // Check exits
    this.checkExits();
    // Check dungeon stairs
    this.checkDungeonStairs();
    // Check encounters
    this.checkRandomEncounter();
    // Check chests
    this.checkChest();
    // Save periodically
    if (this.run.stepCount % 10 === 0) this.saveRun();
  }

  private checkExits(): void {
    const mapDef = STATIC_MAPS[this.currentMapId];
    if (!mapDef) return;

    for (const exit of mapDef.exits) {
      if (this.player.gridX === exit.x && this.player.gridY === exit.y) {
        const tx = exit.tx;
        const ty = exit.ty;
        this.loadMap(exit.target, tx, ty);
        return;
      }
    }
  }

  private checkDungeonStairs(): void {
    if (!this.dungeonMap) return;

    const tile = this.currentMapTiles[this.player.gridY]?.[this.player.gridX];
    if (tile === 'stairs_down') {
      // Go deeper or to boss
      const chapterMaps = chapter1Data.maps;
      const currentIdx = chapterMaps.findIndex(m => m.id === this.currentMapId);
      if (currentIdx >= 0 && currentIdx < chapterMaps.length - 1) {
        const nextMap = chapterMaps[currentIdx + 1];
        this.run.dungeonFloor++;
        this.loadMap(nextMap.id, -1, -1);
      }
    } else if (tile === 'stairs_up' && this.currentMapId !== chapter1Data.startMap) {
      // Go back up
      const chapterMaps = chapter1Data.maps;
      const currentIdx = chapterMaps.findIndex(m => m.id === this.currentMapId);
      if (currentIdx > 0) {
        const prevMap = chapterMaps[currentIdx - 1];
        this.run.dungeonFloor = Math.max(0, this.run.dungeonFloor - 1);
        this.loadMap(prevMap.id, -1, -1);
      }
    }
  }

  private checkRandomEncounter(): void {
    const chapterMap = chapter1Data.maps.find(m => m.id === this.currentMapId);
    if (!chapterMap || (chapterMap as any).safeZone) return;

    const encounterTableId = (chapterMap as any).encounterTable;
    if (!encounterTableId) return;
    const table = (encountersData as any)[encounterTableId];
    if (!table) return;

    this.stepsSinceEncounter++;
    // Minimum 3 steps between encounters
    if (this.stepsSinceEncounter < 3) return;

    if (rollFloat() < table.encounterRate) {
      this.stepsSinceEncounter = 0;
      this.startCombat(table);
    }
  }

  private checkChest(): void {
    const tile = this.currentMapTiles[this.player.gridY]?.[this.player.gridX];
    if (tile !== 'chest') return;

    // Open chest: random potion
    const items = ['health_potion', 'mana_potion', 'herb'];
    const item = items[rollInt(0, items.length - 1)];
    this.inventory.addItem(item);
    this.currentMapTiles[this.player.gridY][this.player.gridX] = 'floor';

    // Redraw tile
    // Simple approach: reload map visuals would be expensive. Just find and replace the sprite
    this.showStoryText(`Found a chest! Got ${item.replace(/_/g, ' ')}!`);
  }

  // --- Interaction ---

  private tryInteract(): void {
    const fx = this.player.gridX + this.player.facing.x;
    const fy = this.player.gridY + this.player.facing.y;

    const npc = this.npcs.find(n => n.gridX === fx && n.gridY === fy);
    if (npc) {
      this.scene.launch('DialogScene', {
        dialogId: npc.dialogId,
        worldScene: this,
      });
      return;
    }

    // Check boss room trigger
    const chapterMap = chapter1Data.maps.find(m => m.id === this.currentMapId);
    if (chapterMap && (chapterMap as any).boss) {
      if (!this.quests.getQuestFlag('boss_defeated')) {
        this.startBossCombat((chapterMap as any).boss);
      }
    }
  }

  // --- Combat ---

  private startCombat(encounterTable: any): void {
    const enemyCount = rollInt(encounterTable.minEnemies, encounterTable.maxEnemies);
    const enemies = this.rollEnemies(encounterTable.enemies, enemyCount);

    this.scene.launch('CombatScene', {
      enemies,
      run: this.run,
      character: this.character,
      inventory: this.inventory,
      worldScene: this,
    });
  }

  private startBossCombat(bossId: string): void {
    const bossData = (enemiesData as any)[bossId];
    if (!bossData) return;

    this.scene.launch('CombatScene', {
      enemies: [{ ...bossData, id: bossId }],
      run: this.run,
      character: this.character,
      inventory: this.inventory,
      worldScene: this,
      isBoss: true,
    });
  }

  private rollEnemies(enemyList: any[], count: number): any[] {
    const totalWeight = enemyList.reduce((s: number, e: any) => s + e.weight, 0);
    const result: any[] = [];

    for (let i = 0; i < count; i++) {
      let roll = rollFloat() * totalWeight;
      for (const entry of enemyList) {
        roll -= entry.weight;
        if (roll <= 0) {
          const data = (enemiesData as any)[entry.id];
          if (data) result.push({ ...data, id: entry.id });
          break;
        }
      }
    }
    return result;
  }

  // --- Public API for other scenes ---

  onCombatVictory(rewards: { xp: number; gold: number; loot: string[] }): void {
    this.run.gold = (this.run.gold ?? 0) + rewards.gold;
    this.inventory.gold += rewards.gold;
    for (const item of rewards.loot) {
      this.inventory.addItem(item);
    }
    this.character.xp += rewards.xp;
    // TODO: level up check
    SaveSystem.saveCharacter(this.character);
    this.saveRun();
    this.scene.resume('WorldScene');
  }

  onCombatDefeat(): void {
    SaveSystem.deleteRun();
    this.scene.stop('HUDScene');
    this.scene.start('GameOverScene', { character: this.character });
  }

  onCombatFled(): void {
    this.scene.resume('WorldScene');
  }

  onBossDefeated(): void {
    this.quests.setQuestFlag('boss_defeated', true);
    this.saveRun();
    // Chapter complete
    this.character.completedChapters.push(chapter1Data.id);
    SaveSystem.saveCharacter(this.character);
    SaveSystem.deleteRun();
    this.scene.stop('HUDScene');
    this.scene.start('ChapterCompleteScene', {
      character: this.character,
      chapterTitle: chapter1Data.title,
      outro: chapter1Data.story.outro,
    });
  }

  onDialogAction(action: string): void {
    const [cmd, ...args] = action.split(':');
    const arg = args.join(':');

    switch (cmd) {
      case 'giveItem':
        this.inventory.addItem(arg);
        this.saveRun();
        break;
      case 'startQuest':
        this.quests.setQuestFlag(arg, false); // quest started but not complete
        this.saveRun();
        break;
      case 'openShop':
        // TODO: implement shop
        break;
    }
  }

  getRunState(): RunState { return this.run; }
  getCharacter(): CharacterState { return this.character; }
  getInventory(): InventorySystem { return this.inventory; }

  private saveRun(): void {
    const inv = this.inventory.serialize();
    this.run.inventory = inv.items;
    this.run.equipment = inv.equipment;
    this.run.gold = inv.gold;
    const q = this.quests.serialize();
    this.run.questFlags = q.questFlags;
    this.run.storyFlags = q.storyFlags;
    this.run.hp = Math.max(0, this.run.hp);
    this.run.mp = Math.max(0, this.run.mp);
    SaveSystem.saveRun(this.run);
  }

  private showStoryText(text: string): void {
    this.scene.launch('DialogScene', {
      immediateText: text,
      worldScene: this,
    });
  }
}
