import Phaser from 'phaser';
import { PANEL_X, PANEL_WIDTH, PANEL_HEIGHT, GAME_HEIGHT, TYPEWRITER_SPEED } from '../config';
import { CombatSystem, Combatant, CombatAction } from '../systems/CombatSystem';
import { DialogSystem, DialogTree } from '../systems/DialogSystem';
import { WorldScene } from './WorldScene';
import classesData from '../data/classes.json';
import skillsData from '../data/skills.json';
import itemsData from '../data/items.json';
import dialogData from '../data/dialogs/village.json';

type PanelMode = 'idle' | 'dialog' | 'combat' | 'inventory';

const PAD = 8;
const LINE_H = 14;
const COL = { text: 0xdddddd, dim: 0x999999, hp: 0x44cc44, mp: 0x4488ff, gold: 0xddaa00, dmg: 0xff4444, heal: 0x44dd44, title: 0xffcc44 };

export class SidePanelScene extends Phaser.Scene {
  mode: PanelMode = 'idle';

  private bg!: Phaser.GameObjects.Rectangle;
  private border!: Phaser.GameObjects.Rectangle;
  private texts: Phaser.GameObjects.Text[] = [];
  private clickZones: Phaser.GameObjects.Zone[] = [];
  private messageLog: { text: string; color: string }[] = [];

  // Combat
  private combat = new CombatSystem();
  private isBoss = false;
  private combatEnemies: any[] = [];

  // Dialog
  private dialog = new DialogSystem();
  private typewriterTimer?: Phaser.Time.TimerEvent;
  private fullDialogText = '';
  private displayedChars = 0;
  private dialogTextObj?: Phaser.GameObjects.Text;

  private worldScene!: WorldScene;

  constructor() { super({ key: 'SidePanelScene' }); }

  init(data: { worldScene: WorldScene }): void {
    this.worldScene = data.worldScene;
  }

  create(): void {
    // Panel background
    this.bg = this.add.rectangle(PANEL_X + PANEL_WIDTH / 2, GAME_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, 0x1a1a2e).setDepth(0);
    this.border = this.add.rectangle(PANEL_X, GAME_HEIGHT / 2, 2, PANEL_HEIGHT, 0x444466).setDepth(1);

    this.combat.setEventCallback((event, data) => this.onCombatEvent(event, data));
    this.dialog.setActionCallback((action) => this.worldScene.onDialogAction(action));

    this.renderIdle();
  }

  // ====== Public API (called by WorldScene) ======

  addMessage(text: string, color = '#dddddd'): void {
    this.messageLog.push({ text, color });
    if (this.messageLog.length > 50) this.messageLog.shift();
    if (this.mode === 'idle') this.renderIdle();
  }

  refreshStats(): void {
    if (this.mode === 'idle') this.renderIdle();
  }

  startDialog(dialogId: string): void {
    const tree = (dialogData as any)[dialogId] as DialogTree | undefined;
    if (!tree) { this.addMessage('(No dialog data)', '#ff6666'); return; }
    this.dialog.start(tree);
    this.mode = 'dialog';
    this.renderDialog();
  }

  startCombat(enemies: any[], isBoss: boolean): void {
    this.isBoss = isBoss;
    this.combatEnemies = enemies;

    const run = this.worldScene.run;
    const char = this.worldScene.character;
    const player: Combatant = {
      id: char.name, name: char.name, isPlayer: true,
      hp: run.hp, maxHp: run.maxHp, mp: run.mp, maxMp: run.maxMp,
      stats: { ...run.stats }, skills: [...char.learnedSkills],
      buffs: [],
    };

    const foes: Combatant[] = enemies.map((e: any, i: number) => ({
      id: e.id + '_' + i, name: e.name, isPlayer: false,
      hp: e.stats.hp, maxHp: e.stats.hp, mp: e.stats.mp ?? 0, maxMp: e.stats.mp ?? 0,
      stats: { attack: e.stats.attack, defense: e.stats.defense, speed: e.stats.speed, magic: e.stats.magic ?? 0 },
      skills: e.skills ?? [], ai: e.ai, buffs: [],
      loot: e.loot, xpReward: e.xpReward, goldReward: e.goldReward,
    }));

    this.mode = 'combat';
    this.combat.startCombat([player], foes);
  }

  showInventory(): void {
    this.mode = 'inventory';
    this.renderInventory();
  }

  // ====== Rendering helpers ======

  private clear(): void {
    this.texts.forEach(t => t.destroy());
    this.texts = [];
    this.clickZones.forEach(z => z.destroy());
    this.clickZones = [];
    if (this.typewriterTimer) { this.typewriterTimer.destroy(); this.typewriterTimer = undefined; }
  }

  private txt(x: number, y: number, str: string, color = COL.text, size = 10, maxW = PANEL_WIDTH - PAD * 2): Phaser.GameObjects.Text {
    const t = this.add.text(PANEL_X + PAD + x, y, str, {
      fontSize: `${size}px`, color: Phaser.Display.Color.ValueToColor(color).rgba,
      fontFamily: 'monospace', wordWrap: { width: maxW, useAdvancedWrap: true },
    }).setDepth(2);
    this.texts.push(t);
    return t;
  }

  private makeClickable(y: number, h: number, cb: () => void): void {
    const z = this.add.zone(PANEL_X + PANEL_WIDTH / 2, y + h / 2, PANEL_WIDTH, h).setDepth(3).setInteractive({ useHandCursor: true });
    z.on('pointerdown', cb);
    this.clickZones.push(z);
  }

  // ====== IDLE mode (stats + log) ======

  private renderIdle(): void {
    this.clear();
    const run = this.worldScene?.run;
    const char = this.worldScene?.character;
    if (!run || !char) return;

    let y = PAD;
    const cd = (classesData as any)[char.class];
    this.txt(0, y, `${char.name}`, COL.title, 11); y += LINE_H;
    this.txt(0, y, `Lv.${char.level} ${cd?.name ?? char.class}`, COL.dim, 9); y += LINE_H;

    y += 4;
    this.txt(0, y, `HP ${run.hp}/${run.maxHp}`, COL.hp, 9); y += LINE_H;
    this.txt(0, y, `MP ${run.mp}/${run.maxMp}`, COL.mp, 9); y += LINE_H;
    this.txt(0, y, `Gold: ${run.gold ?? 0}`, COL.gold, 9); y += LINE_H;

    y += 4;
    this.txt(0, y, `ATK ${run.stats.attack}  DEF ${run.stats.defense}`, COL.dim, 9); y += LINE_H;
    this.txt(0, y, `SPD ${run.stats.speed}  MAG ${run.stats.magic}`, COL.dim, 9); y += LINE_H;

    y += 6;
    this.txt(0, y, `--- [I] Inventory ---`, COL.dim, 9);
    this.makeClickable(y, LINE_H, () => this.showInventory());
    y += LINE_H + 4;

    // Message log (newest at bottom, scroll into view)
    const maxLines = Math.floor((GAME_HEIGHT - y - PAD) / LINE_H);
    const visible = this.messageLog.slice(-maxLines);
    for (const msg of visible) {
      this.txt(0, y, msg.text, parseInt(msg.color.replace('#', '0x')), 9);
      y += LINE_H;
    }
  }

  // ====== DIALOG mode ======

  private renderDialog(): void {
    this.clear();
    const node = this.dialog.currentNode;
    if (!node) { this.endDialog(); return; }

    let y = PAD;
    this.txt(0, y, node.speaker, COL.title, 11); y += LINE_H + 4;

    // Typewriter effect
    this.fullDialogText = node.text;
    this.displayedChars = 0;
    this.dialogTextObj = this.txt(0, y, '', COL.text, 10);
    this.typewriterTimer = this.time.addEvent({
      delay: TYPEWRITER_SPEED,
      repeat: this.fullDialogText.length - 1,
      callback: () => {
        this.displayedChars++;
        if (this.dialogTextObj) this.dialogTextObj.setText(this.fullDialogText.substring(0, this.displayedChars));
        if (this.displayedChars >= this.fullDialogText.length) this.renderDialogChoices();
      },
    });

    // Click anywhere to speed up typewriter
    this.makeClickable(0, GAME_HEIGHT, () => {
      if (this.displayedChars < this.fullDialogText.length) {
        this.displayedChars = this.fullDialogText.length;
        if (this.dialogTextObj) this.dialogTextObj.setText(this.fullDialogText);
        if (this.typewriterTimer) { this.typewriterTimer.destroy(); this.typewriterTimer = undefined; }
        this.renderDialogChoices();
      }
    });
  }

  private renderDialogChoices(): void {
    // Remove the full-screen click zone (speed-up)
    this.clickZones.forEach(z => z.destroy());
    this.clickZones = [];

    const node = this.dialog.currentNode;
    if (!node) return;

    const textH = this.dialogTextObj ? this.dialogTextObj.getBounds().height : 40;
    let y = PAD + LINE_H + 8 + textH + 8;

    if (node.choices && node.choices.length > 0) {
      for (let i = 0; i < node.choices.length; i++) {
        const c = node.choices[i];
        this.txt(4, y, `> ${c.text}`, COL.title, 10);
        const idx = i;
        this.makeClickable(y, LINE_H + 2, () => this.dialogChoose(idx));
        y += LINE_H + 4;
      }
    } else {
      this.txt(4, y, `[Click to continue]`, COL.dim, 9);
      this.makeClickable(y, LINE_H + 2, () => this.dialogAdvance());
    }
  }

  private dialogAdvance(): void {
    const continues = this.dialog.advance();
    if (continues) this.renderDialog();
    else this.endDialog();
  }

  private dialogChoose(idx: number): void {
    const continues = this.dialog.choose(idx);
    if (continues) this.renderDialog();
    else this.endDialog();
  }

  private endDialog(): void {
    this.dialog.end();
    this.mode = 'idle';
    this.renderIdle();
  }

  // ====== COMBAT mode ======

  private onCombatEvent(event: string, data?: any): void {
    switch (event) {
      case 'combat_start':
        this.addMessage('Battle start!', '#ff8844');
        this.renderCombat();
        break;
      case 'player_choose':
        this.renderCombatActions();
        break;
      case 'animate':
        this.renderCombatResult(data?.result);
        break;
      case 'victory':
        this.onCombatVictory(data);
        break;
      case 'defeat':
        this.onCombatDefeat();
        break;
      case 'fled':
        this.addMessage('Escaped from battle!', '#88ccff');
        this.mode = 'idle';
        this.renderIdle();
        break;
    }
  }

  private renderCombat(): void {
    this.clear();
    let y = PAD;
    this.txt(0, y, '--- BATTLE ---', COL.dmg, 11); y += LINE_H + 4;

    // Show enemies
    for (const e of this.combat.enemies) {
      const hpColor = e.hp > 0 ? COL.hp : COL.dim;
      this.txt(0, y, `${e.name} HP:${Math.max(0, e.hp)}/${e.maxHp}`, hpColor, 9);
      y += LINE_H;
    }

    y += 6;
    // Show player
    const p = this.combat.party[0];
    if (p) {
      this.txt(0, y, `${p.name}`, COL.title, 10); y += LINE_H;
      this.txt(0, y, `HP:${p.hp}/${p.maxHp}  MP:${p.mp}/${p.maxMp}`, COL.hp, 9); y += LINE_H;
    }

    return;
  }

  private renderCombatActions(): void {
    this.renderCombat();
    let y = PAD + LINE_H + 4 + this.combat.enemies.length * LINE_H + 6 + LINE_H * 2 + 10;

    const actions: { label: string; action: CombatAction }[] = [
      { label: 'Attack', action: { type: 'attack', targetIndex: 0 } },
    ];
    // Skills
    const p = this.combat.party[0];
    if (p) {
      for (const sid of p.skills) {
        const sk = (skillsData as any)[sid];
        if (sk) actions.push({ label: `${sk.name} (${sk.mpCost}MP)`, action: { type: 'skill', skillId: sid, targetIndex: 0 } });
      }
    }
    // Items (consumables in inventory)
    const inv = this.worldScene.inventory;
    for (const slot of inv.items) {
      const item = (itemsData as any)[slot.itemId];
      if (item?.type === 'consumable') {
        actions.push({ label: `${item.name} x${slot.quantity}`, action: { type: 'item', itemId: slot.itemId } });
      }
    }
    actions.push({ label: 'Defend', action: { type: 'defend' } });
    if (!this.isBoss) actions.push({ label: 'Flee', action: { type: 'flee' } });

    for (const a of actions) {
      this.txt(4, y, `> ${a.label}`, COL.title, 10);
      const act = a.action;
      this.makeClickable(y, LINE_H + 2, () => this.submitCombatAction(act));
      y += LINE_H + 4;
    }
  }

  private submitCombatAction(action: CombatAction): void {
    // Remove item from inventory if it's an item action
    if (action.type === 'item' && action.itemId) {
      this.worldScene.inventory.removeItem(action.itemId);
    }
    this.combat.submitAction(action);
  }

  private renderCombatResult(result: any): void {
    if (!result) { this.combat.advanceFromAnimate(); return; }

    this.renderCombat();
    let y = PAD + LINE_H + 4 + this.combat.enemies.length * LINE_H + 6 + LINE_H * 2 + 10;

    let msg = '';
    if (result.type === 'damage') {
      msg = `${result.actor} → ${result.target}: ${result.value} dmg${result.critical ? ' CRIT!' : ''}`;
      if (result.skillName) msg = `${result.actor} uses ${result.skillName}! ${result.value} dmg`;
    } else if (result.type === 'heal') {
      msg = `${result.actor} heals ${result.target} for ${result.value}`;
      if (result.skillName) msg = `${result.skillName}: +${result.value} HP`;
    } else if (result.type === 'buff') {
      msg = `${result.actor} uses ${result.skillName}!`;
    } else if (result.type === 'miss') {
      msg = `${result.actor}'s attack missed!`;
    } else if (result.type === 'flee_fail') {
      msg = `Failed to escape!`;
    }

    this.txt(0, y, msg, result.type === 'damage' ? COL.dmg : COL.heal, 9);
    y += LINE_H + 8;
    this.txt(4, y, '[Click to continue]', COL.dim, 9);
    this.makeClickable(y, LINE_H + 4, () => {
      this.combat.advanceFromAnimate();
    });
  }

  private onCombatVictory(rewards: any): void {
    this.syncCombatHpMp();
    this.worldScene.onCombatVictory(rewards);

    if (this.isBoss) {
      this.worldScene.onBossDefeated();
      return;
    }

    this.clear();
    let y = PAD;
    this.txt(0, y, '--- VICTORY ---', COL.gold, 12); y += LINE_H + 6;
    this.txt(0, y, `XP: +${rewards.xp}`, COL.text, 10); y += LINE_H;
    this.txt(0, y, `Gold: +${rewards.gold}`, COL.gold, 10); y += LINE_H;
    for (const item of rewards.loot) {
      const d = (itemsData as any)[item];
      this.txt(0, y, `Loot: ${d?.name ?? item}`, COL.heal, 10); y += LINE_H;
    }
    y += 8;
    this.txt(4, y, '[Click to continue]', COL.dim, 9);
    this.makeClickable(y, LINE_H + 4, () => {
      this.mode = 'idle';
      this.renderIdle();
    });
  }

  private onCombatDefeat(): void {
    this.clear();
    let y = PAD;
    this.txt(0, y, '--- DEFEAT ---', COL.dmg, 12); y += LINE_H + 6;
    this.txt(0, y, 'You have fallen...', COL.dim, 10); y += LINE_H + 8;
    this.txt(4, y, '[Click to continue]', COL.dim, 9);
    this.makeClickable(y, LINE_H + 4, () => {
      this.mode = 'idle';
      this.worldScene.onCombatDefeat();
    });
  }

  private syncCombatHpMp(): void {
    const p = this.combat.party[0];
    if (p) {
      this.worldScene.run.hp = p.hp;
      this.worldScene.run.mp = p.mp;
    }
  }

  // ====== INVENTORY mode ======

  private renderInventory(): void {
    this.clear();
    const inv = this.worldScene.inventory;
    let y = PAD;

    this.txt(0, y, '--- INVENTORY ---', COL.title, 11); y += LINE_H + 4;

    // Equipment
    this.txt(0, y, 'Equipment:', COL.dim, 9); y += LINE_H;
    for (const slot of ['weapon', 'armor', 'accessory'] as const) {
      const id = inv.equipment[slot];
      const name = id ? ((itemsData as any)[id]?.name ?? id) : '(empty)';
      this.txt(4, y, `${slot}: ${name}`, id ? COL.text : COL.dim, 9);
      if (id) {
        const s = slot;
        this.makeClickable(y, LINE_H, () => { inv.unequip(s); this.renderInventory(); });
      }
      y += LINE_H;
    }

    y += 6;
    this.txt(0, y, `Gold: ${inv.gold}`, COL.gold, 9); y += LINE_H + 4;
    this.txt(0, y, 'Items:', COL.dim, 9); y += LINE_H;

    if (inv.items.length === 0) {
      this.txt(4, y, '(empty)', COL.dim, 9); y += LINE_H;
    } else {
      for (const slot of inv.items) {
        const item = (itemsData as any)[slot.itemId];
        const name = item?.name ?? slot.itemId;
        this.txt(4, y, `${name} x${slot.quantity}`, COL.text, 9);
        if (item?.type === 'equipment') {
          const itemId = slot.itemId;
          this.makeClickable(y, LINE_H, () => { inv.equip(itemId); this.renderInventory(); });
        }
        y += LINE_H;
      }
    }

    y += 8;
    this.txt(4, y, '> Close', COL.title, 10);
    this.makeClickable(y, LINE_H + 2, () => { this.mode = 'idle'; this.renderIdle(); });
  }
}
