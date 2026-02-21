import itemsData from '../data/items.json';

export interface InventorySlot {
  itemId: string;
  quantity: number;
}

export interface Equipment {
  weapon: string | null;
  armor: string | null;
  accessory: string | null;
}

export class InventorySystem {
  items: InventorySlot[] = [];
  equipment: Equipment = { weapon: null, armor: null, accessory: null };
  gold: number = 0;

  addItem(itemId: string, quantity: number = 1): boolean {
    const itemDef = (itemsData as any)[itemId];
    if (!itemDef) return false;

    if (itemDef.stackable) {
      const existing = this.items.find(s => s.itemId === itemId);
      if (existing) {
        existing.quantity = Math.min(existing.quantity + quantity, itemDef.maxStack ?? 99);
        return true;
      }
    }

    this.items.push({ itemId, quantity });
    return true;
  }

  removeItem(itemId: string, quantity: number = 1): boolean {
    const idx = this.items.findIndex(s => s.itemId === itemId);
    if (idx === -1) return false;

    this.items[idx].quantity -= quantity;
    if (this.items[idx].quantity <= 0) {
      this.items.splice(idx, 1);
    }
    return true;
  }

  hasItem(itemId: string): boolean {
    return this.items.some(s => s.itemId === itemId);
  }

  getItemCount(itemId: string): number {
    return this.items.find(s => s.itemId === itemId)?.quantity ?? 0;
  }

  equip(itemId: string): string | null {
    const itemDef = (itemsData as any)[itemId];
    if (!itemDef || itemDef.type !== 'equipment') return null;

    const slot = itemDef.slot as keyof Equipment;
    const previous = this.equipment[slot];

    // Unequip previous
    if (previous) {
      this.addItem(previous);
    }

    // Remove from inventory and equip
    this.removeItem(itemId);
    this.equipment[slot] = itemId;

    return previous;
  }

  unequip(slot: keyof Equipment): string | null {
    const itemId = this.equipment[slot];
    if (!itemId) return null;

    this.equipment[slot] = null;
    this.addItem(itemId);
    return itemId;
  }

  getEquipmentStatModifiers(): Record<string, number> {
    const mods: Record<string, number> = {};
    for (const slot of Object.values(this.equipment)) {
      if (!slot) continue;
      const itemDef = (itemsData as any)[slot];
      if (itemDef?.statModifiers) {
        for (const [stat, value] of Object.entries(itemDef.statModifiers)) {
          mods[stat] = (mods[stat] ?? 0) + (value as number);
        }
      }
    }
    return mods;
  }

  serialize(): { items: InventorySlot[]; equipment: Equipment; gold: number } {
    return {
      items: [...this.items.map(s => ({ ...s }))],
      equipment: { ...this.equipment },
      gold: this.gold,
    };
  }

  deserialize(data: { items: InventorySlot[]; equipment: Equipment; gold: number }): void {
    this.items = data.items.map(s => ({ ...s }));
    this.equipment = { ...data.equipment };
    this.gold = data.gold;
  }
}
