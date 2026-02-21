import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { CombatSystem, Combatant, CombatAction, CombatResult } from '../systems/CombatSystem';
import { InventorySystem } from '../systems/InventorySystem';
import { RunState, CharacterState } from '../systems/SaveSystem';
import skillsData from '../data/skills.json';
import itemsData from '../data/items.json';

export class CombatScene extends Phaser.Scene {
  private combatSystem!: CombatSystem;
  private worldScene: any;
  private run!: RunState;
  private character!: CharacterState;
  private inventory!: InventorySystem;
  private isBoss = false;

  // UI elements
  private enemySprites: Phaser.GameObjects.Sprite[] = [];
  private enemyHpTexts: Phaser.GameObjects.Text[] = [];
  private playerHpText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private menuItems: Phaser.GameObjects.Text[] = [];
  private selectedIndex = 0;
  private menuMode: 'main' | 'skills' | 'items' | 'target' = 'main';
  private pendingSkillId: string | null = null;
  private pendingItemId: string | null = null;
  private menuOptions: Array<{ label: string; action: () => void }> = [];

  constructor() {
    super({ key: 'CombatScene' });
  }

  init(data: any): void {
    this.worldScene = data.worldScene;
    this.run = data.run;
    this.character = data.character;
    this.inventory = data.inventory;
    this.isBoss = data.isBoss ?? false;
    this.combatSystem = new CombatSystem();
  }

  create(): void {
    // Dim background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);

    // Build combatants
    const playerCombatant: Combatant = {
      id: 'player',
      name: this.character.name,
      isPlayer: true,
      hp: this.run.hp,
      maxHp: this.run.maxHp,
      mp: this.run.mp,
      maxMp: this.run.maxMp,
      stats: { ...this.run.stats },
      skills: [...this.character.learnedSkills],
      buffs: [],
    };

    // Apply equipment stat mods
    const mods = this.inventory.getEquipmentStatModifiers();
    for (const [stat, val] of Object.entries(mods)) {
      if (stat in playerCombatant.stats) {
        (playerCombatant.stats as any)[stat] += val;
      }
    }

    const enemies: Combatant[] = (this.data as any).enemies ?? [];
    // Use init(data) enemies instead
    const initEnemies = (this as any).__initData?.enemies;

    const enemyCombatants: Combatant[] = (this.scene.settings.data as any).enemies.map((e: any, i: number) => ({
      id: `${e.id ?? 'enemy'}_${i}`,
      name: e.name ?? 'Enemy',
      isPlayer: false,
      hp: e.stats.hp,
      maxHp: e.stats.hp,
      mp: e.stats.mp,
      maxMp: e.stats.mp,
      stats: { ...e.stats },
      skills: e.skills ?? [],
      ai: e.ai ?? 'aggressive',
      buffs: [],
      loot: e.loot,
      xpReward: e.xpReward ?? 0,
      goldReward: e.goldReward ?? 0,
    }));

    // Draw enemies
    enemyCombatants.forEach((ec, i) => {
      const x = GAME_WIDTH / 2 - ((enemyCombatants.length - 1) * 40) / 2 + i * 40;
      const spriteKey = (this.scene.settings.data as any).enemies[i]?.spriteKey ?? 'enemy_goblin';
      const sprite = this.add.sprite(x, 60, spriteKey).setScale(2);
      this.enemySprites.push(sprite);

      const hpTxt = this.add.text(x, 85, `${ec.hp}/${ec.maxHp}`, {
        fontSize: '7px', color: '#ff6666', fontFamily: 'monospace',
      }).setOrigin(0.5);
      this.enemyHpTexts.push(hpTxt);
    });

    // Player HP/MP display
    this.playerHpText = this.add.text(10, GAME_HEIGHT - 80, '', {
      fontSize: '9px', color: '#ffffff', fontFamily: 'monospace',
    });
    this.updatePlayerHpDisplay(playerCombatant);

    // Message area
    this.messageText = this.add.text(GAME_WIDTH / 2, 120, '', {
      fontSize: '9px', color: '#ffffff', fontFamily: 'monospace',
      wordWrap: { width: GAME_WIDTH - 20 },
    }).setOrigin(0.5);

    // Combat system event handling
    this.combatSystem.setEventCallback((event, data) => {
      switch (event) {
        case 'combat_start':
          this.showMessage(this.isBoss ? 'A powerful foe appears!' : 'Enemies appear!');
          break;
        case 'player_choose':
          this.showMainMenu();
          break;
        case 'animate':
          this.animateResult(data.result);
          break;
        case 'victory':
          this.onVictory(data);
          break;
        case 'defeat':
          this.onDefeat();
          break;
        case 'fled':
          this.onFled();
          break;
      }
    });

    // Start combat
    this.combatSystem.startCombat([playerCombatant], enemyCombatants);

    // Input
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-UP', () => this.moveMenu(-1));
      this.input.keyboard.on('keydown-DOWN', () => this.moveMenu(1));
      this.input.keyboard.on('keydown-ENTER', () => this.confirmMenu());
      this.input.keyboard.on('keydown-SPACE', () => this.confirmMenu());
      this.input.keyboard.on('keydown-ESC', () => this.cancelMenu());
    }
  }

  // --- UI ---

  private showMessage(msg: string): void {
    this.messageText.setText(msg);
  }

  private updatePlayerHpDisplay(combatant?: Combatant): void {
    const p = combatant ?? this.combatSystem.party[0];
    if (!p) return;
    this.playerHpText.setText(`${p.name}\nHP: ${p.hp}/${p.maxHp}  MP: ${p.mp}/${p.maxMp}`);
  }

  private showMainMenu(): void {
    this.clearMenu();
    this.menuMode = 'main';
    this.selectedIndex = 0;

    this.menuOptions = [
      { label: 'Attack', action: () => this.showTargetSelect('attack') },
      { label: 'Skills', action: () => this.showSkillsMenu() },
      { label: 'Items', action: () => this.showItemsMenu() },
      { label: 'Defend', action: () => this.combatSystem.submitAction({ type: 'defend' }) },
      { label: 'Flee', action: () => this.combatSystem.submitAction({ type: 'flee' }) },
    ];

    this.renderMenu(GAME_WIDTH - 90, GAME_HEIGHT - 80);
  }

  private showSkillsMenu(): void {
    this.clearMenu();
    this.menuMode = 'skills';
    this.selectedIndex = 0;

    const player = this.combatSystem.party[0];
    this.menuOptions = player.skills.map(sid => {
      const skill = (skillsData as any)[sid];
      return {
        label: `${skill?.name ?? sid} (${skill?.mpCost ?? '?'}MP)`,
        action: () => {
          this.pendingSkillId = sid;
          this.showTargetSelect('skill');
        },
      };
    });

    if (this.menuOptions.length === 0) {
      this.menuOptions = [{ label: 'No skills', action: () => this.showMainMenu() }];
    }
    this.renderMenu(GAME_WIDTH - 120, GAME_HEIGHT - 80);
  }

  private showItemsMenu(): void {
    this.clearMenu();
    this.menuMode = 'items';
    this.selectedIndex = 0;

    const consumables = this.inventory.items.filter(slot => {
      const item = (itemsData as any)[slot.itemId];
      return item?.type === 'consumable';
    });

    this.menuOptions = consumables.map(slot => {
      const item = (itemsData as any)[slot.itemId];
      return {
        label: `${item?.name ?? slot.itemId} x${slot.quantity}`,
        action: () => {
          this.pendingItemId = slot.itemId;
          this.inventory.removeItem(slot.itemId);
          this.combatSystem.submitAction({ type: 'item', itemId: slot.itemId });
        },
      };
    });

    if (this.menuOptions.length === 0) {
      this.menuOptions = [{ label: 'No items', action: () => this.showMainMenu() }];
    }
    this.renderMenu(GAME_WIDTH - 120, GAME_HEIGHT - 80);
  }

  private showTargetSelect(actionType: 'attack' | 'skill'): void {
    this.clearMenu();
    this.menuMode = 'target';
    this.selectedIndex = 0;

    const alive = this.combatSystem.enemies.filter(e => e.hp > 0);
    this.menuOptions = alive.map((e, i) => ({
      label: `${e.name} (${e.hp}HP)`,
      action: () => {
        if (actionType === 'attack') {
          this.combatSystem.submitAction({ type: 'attack', targetIndex: i });
        } else if (actionType === 'skill' && this.pendingSkillId) {
          this.combatSystem.submitAction({ type: 'skill', skillId: this.pendingSkillId, targetIndex: i });
          this.pendingSkillId = null;
        }
      },
    }));

    this.renderMenu(10, GAME_HEIGHT - 80);
  }

  private renderMenu(x: number, y: number): void {
    this.menuItems = this.menuOptions.map((opt, i) => {
      const txt = this.add.text(x, y + i * 14, opt.label, {
        fontSize: '9px',
        color: i === 0 ? '#ffff00' : '#ffffff',
        fontFamily: 'monospace',
        backgroundColor: '#222244',
        padding: { x: 3, y: 1 },
      }).setInteractive();

      txt.on('pointerdown', () => {
        this.selectedIndex = i;
        this.confirmMenu();
      });

      return txt;
    });
    this.updateMenuHighlight();
  }

  private updateMenuHighlight(): void {
    this.menuItems.forEach((txt, i) => {
      txt.setColor(i === this.selectedIndex ? '#ffff00' : '#ffffff');
    });
  }

  private moveMenu(dir: number): void {
    if (this.menuItems.length === 0) return;
    this.selectedIndex = (this.selectedIndex + dir + this.menuOptions.length) % this.menuOptions.length;
    this.updateMenuHighlight();
  }

  private confirmMenu(): void {
    if (this.menuOptions.length === 0) return;
    this.menuOptions[this.selectedIndex]?.action();
  }

  private cancelMenu(): void {
    if (this.menuMode === 'skills' || this.menuMode === 'items' || this.menuMode === 'target') {
      this.showMainMenu();
    }
  }

  private clearMenu(): void {
    this.menuItems.forEach(t => t.destroy());
    this.menuItems = [];
    this.menuOptions = [];
  }

  // --- Animation ---

  private animateResult(result: CombatResult): void {
    let msg = '';

    switch (result.type) {
      case 'damage':
        msg = `${result.actor} hits ${result.target} for ${result.value} damage${result.critical ? ' (CRIT!)' : ''}`;
        if (result.skillName) msg = `${result.actor} uses ${result.skillName}! ${result.value} damage to ${result.target}${result.critical ? ' (CRIT!)' : ''}`;
        break;
      case 'heal':
        msg = `${result.actor} ${result.skillName ? 'uses ' + result.skillName + '! ' : ''}heals ${result.target} for ${result.value}`;
        break;
      case 'buff':
        msg = `${result.actor} uses ${result.skillName}!`;
        break;
      case 'miss':
        msg = `${result.actor} misses!`;
        break;
      case 'flee_success':
        msg = 'Got away safely!';
        break;
      case 'flee_fail':
        msg = `${result.actor} couldn't escape!`;
        break;
    }

    this.showMessage(msg);
    this.updateEnemyDisplays();
    this.updatePlayerHpDisplay();

    // Brief pause then advance
    this.time.delayedCall(1200, () => {
      this.combatSystem.advanceFromAnimate();
    });
  }

  private updateEnemyDisplays(): void {
    this.combatSystem.enemies.forEach((e, i) => {
      if (this.enemyHpTexts[i]) {
        this.enemyHpTexts[i].setText(`${Math.max(0, e.hp)}/${e.maxHp}`);
      }
      if (e.hp <= 0 && this.enemySprites[i]) {
        this.enemySprites[i].setAlpha(0.3);
      }
    });
  }

  // --- End states ---

  private onVictory(rewards: { xp: number; gold: number; loot: string[] }): void {
    this.clearMenu();
    let msg = `Victory! +${rewards.xp} XP, +${rewards.gold} Gold`;
    if (rewards.loot.length > 0) {
      msg += `\nLoot: ${rewards.loot.map(id => {
        const item = (itemsData as any)[id];
        return item?.name ?? id;
      }).join(', ')}`;
    }
    this.showMessage(msg);

    // Sync HP/MP back to run
    const p = this.combatSystem.party[0];
    this.run.hp = p.hp;
    this.run.mp = p.mp;

    this.time.delayedCall(2500, () => {
      this.scene.stop('CombatScene');
      if (this.isBoss) {
        this.worldScene?.onBossDefeated?.();
      } else {
        this.worldScene?.onCombatVictory?.(rewards);
      }
    });
  }

  private onDefeat(): void {
    this.clearMenu();
    this.showMessage('You have fallen...');

    this.time.delayedCall(2000, () => {
      this.scene.stop('CombatScene');
      this.worldScene?.onCombatDefeat?.();
    });
  }

  private onFled(): void {
    this.clearMenu();
    this.showMessage('Got away safely!');

    // Sync HP/MP back
    const p = this.combatSystem.party[0];
    this.run.hp = p.hp;
    this.run.mp = p.mp;

    this.time.delayedCall(1000, () => {
      this.scene.stop('CombatScene');
      this.worldScene?.onCombatFled?.();
    });
  }
}
