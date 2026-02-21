import Phaser from 'phaser';
import { TILE_SIZE } from '../config';
import { Player } from './Player';
import { NPC } from './NPC';
import { Enemy } from './Enemy';
import { DungeonMap, DungeonRoom, DUNGEON_TILE } from '../systems/DungeonGenerator';
import npcsData from '../data/npcs.json';
import encountersData from '../data/encounters.json';
import enemiesData from '../data/enemies.json';

/** Simple seeded PRNG (mulberry32) for deterministic enemy placement. */
function seededRng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Forest enemy spawn positions — hand-picked grass tiles away from paths/exits. */
const FOREST_SPAWNS: { x: number; y: number }[] = [
  { x: 15, y: 15 }, { x: 25, y: 10 }, { x: 40, y: 18 },
  { x: 55, y: 12 }, { x: 65, y: 22 }, { x: 10, y: 35 },
  { x: 35, y: 40 }, { x: 60, y: 40 }, { x: 45, y: 8 },
  { x: 70, y: 35 },
];

export class EntityFactory {
  static createPlayer(scene: Phaser.Scene, gridX: number, gridY: number, spriteKey: string): Player {
    return new Player(scene, gridX, gridY, spriteKey);
  }

  static createNPC(scene: Phaser.Scene, npcId: string): NPC | null {
    const data = (npcsData as any)[npcId];
    if (!data) return null;

    return new NPC(
      scene,
      data.position.x,
      data.position.y,
      data.spriteKey,
      npcId,
      data.dialogId,
    );
  }

  static createNPCsForMap(scene: Phaser.Scene, mapId: string): NPC[] {
    const npcs: NPC[] = [];
    for (const [id, data] of Object.entries(npcsData)) {
      const d = data as any;
      if (d.map === mapId || !d.map) {
        const npc = EntityFactory.createNPC(scene, id);
        if (npc) npcs.push(npc);
      }
    }
    return npcs;
  }

  /**
   * Create visible enemy sprites for a map.
   * For forest: uses predefined spawn positions with seeded enemy selection.
   * For caves: uses dungeon room data to place enemies in non-start/exit rooms.
   */
  static createEnemiesForMap(
    scene: Phaser.Scene,
    mapId: string,
    dungeonSeed: number,
    dungeonMap: DungeonMap | null,
    tiles: number[][],
    defeated: number[],
  ): Enemy[] {
    const table = (encountersData as any)[mapId];
    if (!table) return [];

    const rng = seededRng(dungeonSeed + mapId.length * 7919);
    const enemies: Enemy[] = [];

    if (mapId === 'forest') {
      // Static forest: place enemies at predefined grass positions
      for (let i = 0; i < FOREST_SPAWNS.length; i++) {
        if (defeated.includes(i)) continue;
        const sp = FOREST_SPAWNS[i];
        const enemyId = pickEnemy(table.enemies, rng);
        const data = (enemiesData as any)[enemyId];
        if (!data) continue;
        enemies.push(new Enemy(scene, sp.x, sp.y, data.spriteKey, enemyId, i));
      }
    } else if (dungeonMap) {
      // Procedural caves: place enemies in rooms (skip start room 0 and exit room last)
      let spawnIdx = 0;
      const rooms = dungeonMap.rooms;
      for (let r = 1; r < rooms.length - 1; r++) {
        const room = rooms[r];
        const count = 1 + Math.floor(rng() * 2); // 1-2 enemies per room
        for (let c = 0; c < count; c++) {
          if (defeated.includes(spawnIdx)) { spawnIdx++; continue; }
          // Pick a random floor tile inside the room (not center where chest might be)
          const fx = room.x + 1 + Math.floor(rng() * (room.w - 2));
          const fy = room.y + 1 + Math.floor(rng() * (room.h - 2));
          const enemyId = pickEnemy(table.enemies, rng);
          const data = (enemiesData as any)[enemyId];
          if (!data) { spawnIdx++; continue; }
          enemies.push(new Enemy(scene, fx, fy, data.spriteKey, enemyId, spawnIdx));
          spawnIdx++;
        }
      }
    }

    return enemies;
  }
}

/** Pick an enemy id based on weighted table using given rng. */
function pickEnemy(list: { id: string; weight: number }[], rng: () => number): string {
  const tw = list.reduce((s, e) => s + e.weight, 0);
  let r = rng() * tw;
  for (const entry of list) {
    r -= entry.weight;
    if (r <= 0) return entry.id;
  }
  return list[list.length - 1].id;
}
