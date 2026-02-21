import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { InventorySystem } from '../systems/InventorySystem';
import { RunState, CharacterState } from '../systems/SaveSystem';
import itemsData from '../data/items.json';

export class InventoryScene extends Phaser.Scene {
  private inventory!: InventorySystem;
  private run!: RunState;
  private character!: CharacterState;
  private selectedIndex = 0;
  private itemTexts: Phaser.GameObjects.Text[] = [];
  private detailText!: Phaser.GameObjects.Text;
  private equipText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'InventoryScene' });
  }

  init(data: any): void {
    this.inventory = data.inventory;
    this.run = data.run;
    this.character = data.character;
  }

  create(): void {
    // Background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 16, GAME_HEIGHT - 16, 0x111122, 0.95)
      .setStrokeStyle(1, 0x6666aa);

    this.add.text(GAME_WIDTH / 2, 16, 'Inventory', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Equipment section
    this.equipText = this.add.text(GAME_WIDTH - 140, 36, '', {
      fontSize: '8px', color: '#aaddff', fontFamily: 'monospace',
    });
    this.updateEquipDisplay();

    // Detail text
    this.detailText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 40, '', {
      fontSize: '8px', color: '#cccccc', fontFamily: 'monospace',
      wordWrap: { width: GAME_WIDTH - 40 },
    }).setOrigin(0.5);

    this.renderItemList();

    // Controls
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 16, 'Up/Down: select  Enter: use/equip  Esc: close', {
      fontSize: '7px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5);

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-UP', () => this.move(-1));
      this.input.keyboard.on('keydown-DOWN', () => this.move(1));
      this.input.keyboard.on('keydown-ENTER', () => this.useItem());
      this.input.keyboard.on('keydown-SPACE', () => this.useItem());
      this.input.keyboard.on('keydown-ESC', () => this.close());
      this.input.keyboard.on('keydown-I', () => this.close());
    }
  }

  private renderItemList(): void {
    this.itemTexts.forEach(t => t.destroy());
    this.itemTexts = [];

    if (this.inventory.items.length === 0) {
      this.itemTexts.push(
        this.add.text(20, 40, '(empty)', {
          fontSize: '9px', color: '#666666', fontFamily: 'monospace',
        })
      );
      return;
    }

    this.inventory.items.forEach((slot, i) => {
      const item = (itemsData as any)[slot.itemId];
      const name = item?.name ?? slot.itemId;
      const qty = slot.quantity > 1 ? ` x${slot.quantity}` : '';
      const txt = this.add.text(20, 36 + i * 14, `${name}${qty}`, {
        fontSize: '9px',
        color: i === this.selectedIndex ? '#ffff00' : '#ffffff',
        fontFamily: 'monospace',
      }).setInteractive();

      txt.on('pointerdown', () => {
        this.selectedIndex = i;
        this.updateSelection();
        this.useItem();
      });

      this.itemTexts.push(txt);
    });

    this.updateSelection();
  }

  private move(dir: number): void {
    if (this.inventory.items.length === 0) return;
    this.selectedIndex = (this.selectedIndex + dir + this.inventory.items.length) % this.inventory.items.length;
    this.updateSelection();
  }

  private updateSelection(): void {
    this.itemTexts.forEach((t, i) => {
      t.setColor(i === this.selectedIndex ? '#ffff00' : '#ffffff');
    });

    const slot = this.inventory.items[this.selectedIndex];
    if (slot) {
      const item = (itemsData as any)[slot.itemId];
      this.detailText.setText(item?.description ?? '');
    }
  }

  private useItem(): void {
    const slot = this.inventory.items[this.selectedIndex];
    if (!slot) return;

    const item = (itemsData as any)[slot.itemId];
    if (!item) return;

    if (item.type === 'consumable') {
      // Apply effects
      for (const effect of item.effects ?? []) {
        if (effect.type === 'heal') {
          this.run.hp = Math.min(this.run.maxHp, this.run.hp + effect.value);
        } else if (effect.type === 'restore_mp') {
          this.run.mp = Math.min(this.run.maxMp, this.run.mp + effect.value);
        }
      }
      this.inventory.removeItem(slot.itemId);
      this.renderItemList();
    } else if (item.type === 'equipment') {
      this.inventory.equip(slot.itemId);
      this.updateEquipDisplay();
      this.renderItemList();
    }
  }

  private updateEquipDisplay(): void {
    const weapon = this.inventory.equipment.weapon;
    const armor = this.inventory.equipment.armor;
    const acc = this.inventory.equipment.accessory;

    const wName = weapon ? ((itemsData as any)[weapon]?.name ?? weapon) : '(none)';
    const aName = armor ? ((itemsData as any)[armor]?.name ?? armor) : '(none)';
    const acName = acc ? ((itemsData as any)[acc]?.name ?? acc) : '(none)';

    this.equipText.setText(`--- Equipment ---\nWeapon: ${wName}\nArmor:  ${aName}\nAccess: ${acName}`);
  }

  private close(): void {
    this.scene.stop('InventoryScene');
  }
}
