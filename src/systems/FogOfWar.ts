export enum Visibility {
  UNSEEN = 0,
  EXPLORED = 1,
  VISIBLE = 2,
}

/**
 * Recursive shadow-casting fog of war.
 * Tracks three tile states: UNSEEN, EXPLORED (seen before), VISIBLE (in current LOS).
 */
export class FogOfWar {
  private width: number;
  private height: number;
  private tiles: Visibility[][];
  private blocksFn: (x: number, y: number) => boolean;

  // Octant transform multipliers (roguebasin standard)
  private static MULT = [
    [1, 0, 0, -1, -1, 0, 0, 1],
    [0, 1, -1, 0, 0, -1, 1, 0],
    [0, 1, 1, 0, 0, -1, -1, 0],
    [1, 0, 0, 1, -1, 0, 0, -1],
  ];

  constructor(w: number, h: number, blocksFn: (x: number, y: number) => boolean) {
    this.width = w;
    this.height = h;
    this.blocksFn = blocksFn;
    this.tiles = [];
    for (let y = 0; y < h; y++) {
      this.tiles[y] = new Array(w).fill(Visibility.UNSEEN);
    }
  }

  getVisibility(x: number, y: number): Visibility {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return Visibility.UNSEEN;
    return this.tiles[y][x];
  }

  /** Recalculate visibility from player position with given radius. */
  update(px: number, py: number, radius: number): void {
    // Demote all VISIBLE → EXPLORED
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.tiles[y][x] === Visibility.VISIBLE) {
          this.tiles[y][x] = Visibility.EXPLORED;
        }
      }
    }
    // Player tile always visible
    this.setVisible(px, py);
    // Cast light in all 8 octants
    for (let oct = 0; oct < 8; oct++) {
      this.castLight(
        px, py, radius, 1, 1.0, 0.0,
        FogOfWar.MULT[0][oct], FogOfWar.MULT[1][oct],
        FogOfWar.MULT[2][oct], FogOfWar.MULT[3][oct],
      );
    }
  }

  /** Serialize explored state for save/load. Returns flat array of booleans (true=explored). */
  serializeExplored(): boolean[] {
    const arr: boolean[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        arr.push(this.tiles[y][x] !== Visibility.UNSEEN);
      }
    }
    return arr;
  }

  /** Restore explored state from a flat boolean array. */
  deserializeExplored(arr: boolean[]): void {
    let i = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (arr[i] && this.tiles[y][x] === Visibility.UNSEEN) {
          this.tiles[y][x] = Visibility.EXPLORED;
        }
        i++;
      }
    }
  }

  private setVisible(x: number, y: number): void {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
      this.tiles[y][x] = Visibility.VISIBLE;
    }
  }

  private isOpaque(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
    return this.blocksFn(x, y);
  }

  private castLight(
    cx: number, cy: number, radius: number,
    row: number, start: number, end: number,
    xx: number, xy: number, yx: number, yy: number,
  ): void {
    if (start < end) return;
    const rSq = radius * radius;
    let newStart = 0;

    for (let j = row; j <= radius; j++) {
      let dx = -j - 1;
      const dy = -j;
      let blocked = false;

      while (dx <= 0) {
        dx++;
        const mapX = cx + dx * xx + dy * xy;
        const mapY = cy + dx * yx + dy * yy;
        const lSlope = (dx - 0.5) / (dy + 0.5);
        const rSlope = (dx + 0.5) / (dy - 0.5);

        if (start < rSlope) continue;
        if (end > lSlope) break;

        // Mark visible if within radius
        if (dx * dx + dy * dy <= rSq) {
          this.setVisible(mapX, mapY);
        }

        if (blocked) {
          if (this.isOpaque(mapX, mapY)) {
            newStart = rSlope;
            continue;
          } else {
            blocked = false;
            start = newStart;
          }
        } else if (this.isOpaque(mapX, mapY) && j < radius) {
          blocked = true;
          this.castLight(cx, cy, radius, j + 1, start, lSlope, xx, xy, yx, yy);
          newStart = rSlope;
        }
      }
      if (blocked) break;
    }
  }
}
