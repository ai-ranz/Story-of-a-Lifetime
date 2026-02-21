import { rollInt, shuffle } from '../utils/MathUtils';
import { TILE_SIZE } from '../config';

/** Simple seeded PRNG (mulberry32). */
function seededRng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DUNGEON_TILE = {
  WALL: 0,
  FLOOR: 1,
  STAIRS_DOWN: 2,
  STAIRS_UP: 3,
  CHEST: 4,
} as const;

export interface DungeonRoom {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DungeonMap {
  width: number;
  height: number;
  tiles: number[][];
  rooms: DungeonRoom[];
  startX: number;
  startY: number;
  exitX: number;
  exitY: number;
}

export class DungeonGenerator {
  /**
   * Generate a dungeon floor using BSP-inspired room placement.
   * @param seed  Deterministic seed (same seed = same layout).
   * @param floor Floor number (higher = more rooms, harder).
   */
  static generate(seed: number, floor: number, width = 40, height = 30): DungeonMap {
    const rng = seededRng(seed + floor * 9973);

    // Initialize map filled with walls
    const tiles: number[][] = [];
    for (let y = 0; y < height; y++) {
      tiles[y] = new Array(width).fill(DUNGEON_TILE.WALL);
    }

    const roomCount = 4 + floor * 2;
    const rooms: DungeonRoom[] = [];

    // Place rooms
    for (let attempt = 0; attempt < roomCount * 20; attempt++) {
      if (rooms.length >= roomCount) break;

      const w = Math.floor(rng() * 4) + 4; // 4-7
      const h = Math.floor(rng() * 4) + 4;
      const x = Math.floor(rng() * (width - w - 2)) + 1;
      const y = Math.floor(rng() * (height - h - 2)) + 1;

      // Check overlap (with 1-tile buffer)
      let overlaps = false;
      for (const existing of rooms) {
        if (
          x - 1 < existing.x + existing.w &&
          x + w + 1 > existing.x &&
          y - 1 < existing.y + existing.h &&
          y + h + 1 > existing.y
        ) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      rooms.push({ x, y, w, h });

      // Carve room
      for (let ry = y; ry < y + h; ry++) {
        for (let rx = x; rx < x + w; rx++) {
          tiles[ry][rx] = DUNGEON_TILE.FLOOR;
        }
      }
    }

    // Connect rooms with corridors
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i - 1];
      const b = rooms[i];
      const ax = Math.floor(a.x + a.w / 2);
      const ay = Math.floor(a.y + a.h / 2);
      const bx = Math.floor(b.x + b.w / 2);
      const by = Math.floor(b.y + b.h / 2);

      // L-shaped corridor
      if (rng() < 0.5) {
        DungeonGenerator.carveCorridor(tiles, ax, ay, bx, ay, width, height);
        DungeonGenerator.carveCorridor(tiles, bx, ay, bx, by, width, height);
      } else {
        DungeonGenerator.carveCorridor(tiles, ax, ay, ax, by, width, height);
        DungeonGenerator.carveCorridor(tiles, ax, by, bx, by, width, height);
      }
    }

    // Place start (stairs up) in first room, exit (stairs down) in last room
    const startRoom = rooms[0];
    const exitRoom = rooms[rooms.length - 1];
    const startX = Math.floor(startRoom.x + startRoom.w / 2);
    const startY = Math.floor(startRoom.y + startRoom.h / 2);
    const exitX = Math.floor(exitRoom.x + exitRoom.w / 2);
    const exitY = Math.floor(exitRoom.y + exitRoom.h / 2);

    tiles[startY][startX] = DUNGEON_TILE.STAIRS_UP;
    tiles[exitY][exitX] = DUNGEON_TILE.STAIRS_DOWN;

    // Place a few chests in random rooms (not start/exit)
    const midRooms = rooms.slice(1, -1);
    const chestCount = Math.min(midRooms.length, 1 + floor);
    for (let i = 0; i < chestCount && i < midRooms.length; i++) {
      const room = midRooms[i];
      const cx = Math.floor(room.x + room.w / 2);
      const cy = Math.floor(room.y + room.h / 2);
      if (tiles[cy][cx] === DUNGEON_TILE.FLOOR) {
        tiles[cy][cx] = DUNGEON_TILE.CHEST;
      }
    }

    return { width, height, tiles, rooms, startX, startY, exitX, exitY };
  }

  private static carveCorridor(
    tiles: number[][],
    x1: number, y1: number,
    x2: number, y2: number,
    mapW: number, mapH: number,
  ): void {
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);

    let x = x1;
    let y = y1;

    while (x !== x2) {
      if (x >= 0 && x < mapW && y >= 0 && y < mapH && tiles[y][x] === DUNGEON_TILE.WALL) {
        tiles[y][x] = DUNGEON_TILE.FLOOR;
      }
      x += dx;
    }

    while (y !== y2) {
      if (x >= 0 && x < mapW && y >= 0 && y < mapH && tiles[y][x] === DUNGEON_TILE.WALL) {
        tiles[y][x] = DUNGEON_TILE.FLOOR;
      }
      y += dy;
    }

    // Carve final tile
    if (x >= 0 && x < mapW && y >= 0 && y < mapH && tiles[y][x] === DUNGEON_TILE.WALL) {
      tiles[y][x] = DUNGEON_TILE.FLOOR;
    }
  }
}
