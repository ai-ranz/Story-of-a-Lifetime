import Phaser from 'phaser';
import { TILE_SIZE } from '../config';
import { Player } from './Player';
import { NPC } from './NPC';
import npcsData from '../data/npcs.json';

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
}
