import Phaser from 'phaser';
import { PANEL_X, PANEL_WIDTH, PANEL_HEIGHT, GAME_HEIGHT, TYPEWRITER_SPEED } from '../config';
import { CombatSystem, Combatant, CombatAction } from '../systems/CombatSystem';
import { DialogSystem, DialogTree } from '../systems/DialogSystem';
import { WorldScene } from './WorldScene';
import classesData from '../data/classes.json';
import skillsData from '../data/skills.json';
import itemsData from '../data/items.json';
import dialogData from '../data/dialogs/village.json';

// 'idle' = exploring, 'dialog'/'combat' = inline in log, 'inventory' = full takeover
type PanelMode = 'idle' | 'dialog' | 'combat' | 'inventory';

const PAD = 8;
const LINE_H = 14;
const STATS_H = 130;   // fixed stats header height
const ACTION_MAX_H = 200; // max height reserved for action area at bottom
const COL = { text: 0xdddddd, dim: 0x999999, hp: 0x44cc44, mp: 0x4488ff, gold: 0xddaa00, dmg: 0xff4444, heal: 0x44dd44, title: 0xffcc44 };

export class SidePanelScene extends Phaser.Scene {
  mode: PanelMode = 'idle';

  private bg!: Phaser.GameObjects.Rectangle;
  private border!: Phaser.GameObjects.Rectangle;

  // Persistent display objects for stats header
  private statsTexts: Phaser.GameObjects.Text[] = [];

  // Dynamic display objects for log + actions
  private logTexts: Phaser.GameObjects.Text[] = [];
  private actionTexts: Phaser.GameObjects.Text[] = [];
  private clickZones: Phaser.GameObjects.Zone[] = [];

  private messageLog: { text: string; color: string }[] = [];

  // Combat
  private combat = new CombatSystem();
  private isBoss = false;
  private awaitingCombatContinue = false;

  // Dialog
  private dialog = new DialogSystem();
  private typewriterTimer?: Phaser.Time.TimerEvent;
  private fullDialogText = '';
  private displayedChars = 0;
  private dialogTextObj?: Phaser.GameObjects.Text;
  private dialogChoicesRendered = false;

  private worldScene!: WorldScene;

  constructor() { super({ key: 'SidePanelScene' }); }

  init(data: { worldScene: WorldScene }): void {
    this.worldScene = data.worldScene;
  }

  create(): void {
    this.bg = this.add.rectangle(PANEL_X + PANEL_WIDTH / 2, GAME_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, 0x1a1a2e).setDepth(0);
    this.border = this.add.rectangle(PANEL_X, GAME_HEIGHT / 2, 2, PANEL_HEIGHT, 0x444466).setDepth(1);

    this.combat.setEventCallback((event, data) => this.onCombatEvent(event, data));
    this.dialog.setActionCallback((action) => this.worldScene.onDialogAction(action));

    this.renderStats();
    this.renderLog();
    this.renderActions();
  }

  // ====== Public API (called by WorldScene) ======

  addMessage(text: string, color = '#dddddd'): void {
    this.messageLog.push({ text, color });
    if (this.messageLog.length > 80) this.messageLog.shift();
    if (this.mode !== 'inventory') this.renderLog();
  }

  refreshStats(): void {
    if (this.mode !== 'inventory') this.renderStats();
  }

  startDialog(dialogId: string): void {
    const tree = (dialogData as any)[dialogId] as DialogTree | undefined;
    if (!tree) { this.addMessage('(No dialog data)', '#ff6666'); return; }
    this.dialog.start(tree);
    this.mode = 'dialog';
    this.showDialogNode();
  }

  startCombat(enemies: any[], isBoss: boolean): void {
    this.isBoss = isBoss;
    this.awaitingCombatContinue = false;

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
    const names = foes.map(f => f.name).join(', ');
    this.addMessage(`--- Battle! ${names} appeared! ---`, '#ff8844');
    this.combat.startCombat([player], foes);
  }

  showInventory(): void {
    this.mode = 'inventory';
    this.renderInventory();
  }

  // ====== Rendering helpers ======

  private clearActions(): void {
    this.actionTexts.forEach(t => t.destroy());
    this.actionTexts = [];
    this.clickZones.forEach(z => z.destroy());
    this.clickZones = [];
    if (this.typewriterTimer) { this.typewriterTimer.destroy(); this.typewriterTimer = undefined; }
    this.dialogTextObj = undefined;
    this.dialogChoicesRendered = false;
  }

  private clearLog(): void {
    this.logTexts.forEach(t => t.destroy());
    this.logTexts = [];
  }

  private clearStats(): void {
    this.statsTexts.forEach(t => t.destroy());
    this.statsTexts = [];
  }

  private clearAll(): void {
    this.clearStats();
    this.clearLog();
    this.clearActions();
  }

  private txt(x: number, y: number, str: string, color = COL.text, size = 10, maxW = PANEL_WIDTH - PAD * 2): Phaser.GameObjects.Text {
    return this.add.text(PANEL_X + PAD + x, y, str, {
      fontSize: `${size}px`, color: Phaser.Display.Color.ValueToColor(color).rgba,
      fontFamily: 'monospace', wordWrap: { width: maxW, useAdvancedWrap: true },
    }).setDepth(2);
  }

  private addStatText(x: number, y: number, str: string, color = COL.text, size = 10): Phaser.GameObjects.Text {
    const t = this.txt(x, y, str, color, size);
    this.statsTexts.push(t);
    return t;
  }

  private addLogText(x: number, y: number, str: string, color = COL.text, size = 9): Phaser.GameObjects.Text {
    const t = this.txt(x, y, str, color, size);
    this.logTexts.push(t);
    return t;
  }

  private addActionText(x: number, y: number, str: string, color = COL.text, size = 10): Phaser.GameObjects.Text {
    const t = this.txt(x, y, str, color, size);
    this.actionTexts.push(t);
    return t;
  }

  private makeClickable(y: number, h: number, cb: () => void): void {
    const z = this.add.zone(PANEL_X + PANEL_WIDTH / 2, y + h / 2, PANEL_WIDTH, h).setDepth(3).setInteractive({ useHandCursor: true });
    z.on('pointerdown', cb);
    this.clickZones.push(z);
  }

  // ====== Stats header (always visible except inventory) ======

  private renderStats(): void {
    this.clearStats();
    const run = this.worldScene?.run;
    const char = this.worldScene?.character;
    if (!run || !char) return;

    let y = PAD;
    const cd = (classesData as any)[char.class];
    this.addStatText(0, y, `${char.name}`, COL.title, 11); y += LINE_H;
    this.addStatText(0, y, `Lv.${char.level} ${cd?.name ?? char.class}`, COL.dim, 9); y += LINE_H;
    y += 2;
    this.addStatText(0, y, `HP ${run.hp}/${run.maxHp}`, COL.hp, 9); y += LINE_H;
    this.addStatText(0, y, `MP ${run.mp}/${run.maxMp}`, COL.mp, 9); y += LINE_H;
    this.addStatText(0, y, `Gold: ${run.gold ?? 0}`, COL.gold, 9); y += LINE_H;
    y += 2;
    this.addStatText(0, y, `ATK ${run.stats.attack}  DEF ${run.stats.defense}`, COL.dim, 9); y += LINE_H;
    this.addStatText(0, y, `SPD ${run.stats.speed}  MAG ${run.stats.magic}`, COL.dim, 9);
  }

  // ====== Activity log (middle area, always visible except inventory) ======

  private renderLog(): void {
    this.clearLog();
    // Calculate available log space: between stats header and action area
    const logTop = STATS_H;
    const actionH = this.getActionHeight();
    const logBottom = GAME_HEIGHT - actionH;
    const logH = logBottom - logTop;
    const maxLines = Math.floor(logH / LINE_H);

    const visible = this.messageLog.slice(-maxLines);
    let y = logTop;
    for (const msg of visible) {
      this.addLogText(0, y, msg.text, parseInt(msg.color.replace('#', '0x')));
      y += LINE_H;
    }
  }

  private getActionHeight(): number {
    if (this.mode === 'dialog' || this.mode === 'combat') return ACTION_MAX_H;
    // Idle: just the inventory link
    return LINE_H + PAD * 2;
  }

  // ====== Action area (bottom of right pane) ======

  private renderActions(): void {
    this.clearActions();
    const actionTop = GAME_HEIGHT - this.getActionHeight();

    if (this.mode === 'idle') {
      // Just the inventory shortcut
      const y = actionTop + PAD;
      this.addActionText(0, y, `[I] Inventory`, COL.dim, 9);
      this.makeClickable(y, LINE_H, () => this.showInventory());
    }
    // Dialog and combat actions are rendered by their own methods
  }

  // ====== Unified redraw (stats + log + actions) ======

  private redraw(): void {
    this.renderStats();
    this.renderLog();
    this.renderActions();
  }

  // ====== DIALOG — inline in log, choices in action area ======

  private showDialogNode(): void {
    this.clearActions();
    this.renderLog();
    const node = this.dialog.currentNode;
    if (!node) { this.endDialog(); return; }

    // Add speaker line to log
    this.addMessage(`[${node.speaker}]`, '#ffcc44');

    // Typewriter the dialog text into the action area
    const actionTop = GAME_HEIGHT - ACTION_MAX_H;
    let y = actionTop + PAD;

    this.fullDialogText = node.text;
    this.displayedChars = 0;
    this.dialogChoicesRendered = false;
    this.dialogTextObj = this.addActionText(0, y, '', COL.text, 10);

    this.typewriterTimer = this.time.addEvent({
      delay: TYPEWRITER_SPEED,
      repeat: this.fullDialogText.length - 1,
      callback: () => {
        this.displayedChars++;
        if (this.dialogTextObj) this.dialogTextObj.setText(this.fullDialogText.substring(0, this.displayedChars));
        if (this.displayedChars >= this.fullDialogText.length && !this.dialogChoicesRendered) {
          this.dialogChoicesRendered = true;
          this.renderDialogChoices();
        }
      },
    });

    // Click panel to skip typewriter
    this.makeClickable(actionTop, ACTION_MAX_H, () => {
      if (this.displayedChars < this.fullDialogText.length) {
        this.displayedChars = this.fullDialogText.length;
        if (this.dialogTextObj) this.dialogTextObj.setText(this.fullDialogText);
        if (this.typewriterTimer) { this.typewriterTimer.destroy(); this.typewriterTimer = undefined; }
        if (!this.dialogChoicesRendered) {
          this.dialogChoicesRendered = true;
          this.renderDialogChoices();
        }
      }
    });
  }

  private renderDialogChoices(): void {
    // Remove skip click zone
    this.clickZones.forEach(z => z.destroy());
    this.clickZones = [];

    const node = this.dialog.currentNode;
    if (!node) return;

    const textH = this.dialogTextObj ? this.dialogTextObj.getBounds().height : 20;
    const actionTop = GAME_HEIGHT - ACTION_MAX_H;
    let y = actionTop + PAD + textH + 8;

    if (node.choices && node.choices.length > 0) {
      for (let i = 0; i < node.choices.length; i++) {
        const c = node.choices[i];
        this.addActionText(4, y, `> ${c.text}`, COL.title, 10);
        const idx = i;
        this.makeClickable(y, LINE_H + 2, () => this.dialogChoose(idx));
        y += LINE_H + 4;
      }
    } else {
      this.addActionText(4, y, `[Click to continue]`, COL.dim, 9);
      this.makeClickable(y, LINE_H + 2, () => this.dialogAdvance());
    }
  }

  private dialogAdvance(): void {
    // Log the text that was shown
    this.addMessage(this.fullDialogText, '#cccccc');
    const continues = this.dialog.advance();
    if (continues) this.showDialogNode();
    else this.endDialog();
  }

  private dialogChoose(idx: number): void {
    const node = this.dialog.currentNode;
    const choiceText = node?.choices?.[idx]?.text ?? '';
    // Log the dialog text and the player's choice
    this.addMessage(this.fullDialogText, '#cccccc');
    if (choiceText) this.addMessage(`  > ${choiceText}`, '#aaaacc');
    const continues = this.dialog.choose(idx);
    if (continues) this.showDialogNode();
    else this.endDialog();
  }

  private endDialog(): void {
    this.dialog.end();
    this.mode = 'idle';
    this.clearActions();
    this.renderLog();
    this.renderActions();
  }

  // ====== COMBAT — results logged, actions in action area ======

  private onCombatEvent(event: string, data?: any): void {
    switch (event) {
      case 'combat_start':
        this.renderCombatActions();
        break;
      case 'player_choose':
        this.renderCombatActions();
        break;
      case 'animate':
        this.onCombatAnimate(data?.result);
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
        this.clearActions();
        this.renderLog();
        this.renderActions();
        this.renderStats();
        break;
    }
  }

  private renderCombatActions(): void {
    this.clearActions();
    this.renderLog();

    const actionTop = GAME_HEIGHT - ACTION_MAX_H;
    let y = actionTop + PAD;

    // Show enemy HP summary in action area
    for (const e of this.combat.enemies) {
      const hpCol = e.hp > 0 ? COL.hp : COL.dim;
      this.addActionText(0, y, `${e.name} HP:${Math.max(0, e.hp)}/${e.maxHp}`, hpCol, 9);
      y += LINE_H;
    }
    y += 4;

    // Build action list
    const actions: { label: string; action: CombatAction }[] = [
      { label: 'Attack', action: { type: 'attack', targetIndex: 0 } },
    ];
    const p = this.combat.party[0];
    if (p) {
      for (const sid of p.skills) {
        const sk = (skillsData as any)[sid];
        if (sk) actions.push({ label: `${sk.name} (${sk.mpCost}MP)`, action: { type: 'skill', skillId: sid, targetIndex: 0 } });
      }
    }
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
      this.addActionText(4, y, `> ${a.label}`, COL.title, 10);
      const act = a.action;
      this.makeClickable(y, LINE_H + 2, () => this.submitCombatAction(act));
      y += LINE_H + 4;
    }
  }

  private submitCombatAction(action: CombatAction): void {
    if (action.type === 'item' && action.itemId) {
      this.worldScene.inventory.removeItem(action.itemId);
    }
    this.combat.submitAction(action);
  }

  private onCombatAnimate(result: any): void {
    if (!result) { this.combat.advanceFromAnimate(); return; }

    // Log the combat result
    let msg = '';
    let color = '#dddddd';
    if (result.type === 'damage') {
      msg = result.skillName
        ? `${result.actor} uses ${result.skillName}! ${result.value} dmg to ${result.target}${result.critical ? ' CRIT!' : ''}`
        : `${result.actor} hits ${result.target} for ${result.value}${result.critical ? ' CRIT!' : ''}`;
      color = '#ff6666';
    } else if (result.type === 'heal') {
      msg = result.skillName ? `${result.skillName}: ${result.target} +${result.value} HP` : `${result.target} heals ${result.value} HP`;
      color = '#66dd66';
    } else if (result.type === 'buff') {
      msg = `${result.actor} uses ${result.skillName}!`;
      color = '#88aaff';
    } else if (result.type === 'miss') {
      msg = `${result.actor}'s attack missed!`;
      color = '#888888';
    } else if (result.type === 'flee_fail') {
      msg = `Failed to escape!`;
      color = '#cc8844';
    }
    this.addMessage(msg, color);
    this.renderStats();

    // Show "click to continue" in action area
    this.clearActions();
    const actionTop = GAME_HEIGHT - this.getActionHeight();
    let y = actionTop + PAD;
    // Show updated enemy HP
    for (const e of this.combat.enemies) {
      const hpCol = e.hp > 0 ? COL.hp : COL.dim;
      this.addActionText(0, y, `${e.name} HP:${Math.max(0, e.hp)}/${e.maxHp}`, hpCol, 9);
      y += LINE_H;
    }
    y += 6;
    this.addActionText(4, y, '[Click to continue]', COL.dim, 9);
    this.makeClickable(y, LINE_H + 4, () => {
      this.awaitingCombatContinue = false;
      this.combat.advanceFromAnimate();
    });
    this.awaitingCombatContinue = true;
  }

  private onCombatVictory(rewards: any): void {
    this.syncCombatHpMp();
    this.worldScene.onCombatVictory(rewards);

    if (this.isBoss) {
      this.worldScene.onBossDefeated();
      return;
    }

    this.addMessage(`--- Victory! ---`, '#ffcc44');
    if (rewards.xp) this.addMessage(`  XP +${rewards.xp}`, '#dddddd');
    if (rewards.gold) this.addMessage(`  Gold +${rewards.gold}`, '#ddaa00');
    for (const item of rewards.loot) {
      const d = (itemsData as any)[item];
      this.addMessage(`  Loot: ${d?.name ?? item}`, '#66dd66');
    }

    this.mode = 'idle';
    this.clearActions();
    this.renderStats();
    this.renderLog();
    this.renderActions();
  }

  private onCombatDefeat(): void {
    this.addMessage(`--- Defeat... ---`, '#ff4444');
    this.clearActions();
    const actionTop = GAME_HEIGHT - this.getActionHeight();
    const y = actionTop + PAD;
    this.addActionText(0, y, 'You have fallen...', COL.dmg, 10);
    this.addActionText(4, y + LINE_H + 8, '[Click to continue]', COL.dim, 9);
    this.makeClickable(y + LINE_H + 8, LINE_H + 4, () => {
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

  // ====== INVENTORY — full panel takeover (non-default activity) ======

  private renderInventory(): void {
    this.clearAll();
    const inv = this.worldScene.inventory;
    let y = PAD;

    const t0 = this.txt(0, y, '--- INVENTORY ---', COL.title, 11);
    this.actionTexts.push(t0); y += LINE_H + 4;

    const addInvText = (x: number, yy: number, s: string, c = COL.text, sz = 9) => {
      const t = this.txt(x, yy, s, c, sz);
      this.actionTexts.push(t);
      return t;
    };

    addInvText(0, y, 'Equipment:', COL.dim); y += LINE_H;
    for (const slot of ['weapon', 'armor', 'accessory'] as const) {
      const id = inv.equipment[slot];
      const name = id ? ((itemsData as any)[id]?.name ?? id) : '(empty)';
      addInvText(4, y, `${slot}: ${name}`, id ? COL.text : COL.dim);
      if (id) {
        const s = slot;
        this.makeClickable(y, LINE_H, () => { inv.unequip(s); this.renderInventory(); });
      }
      y += LINE_H;
    }

    y += 6;
    addInvText(0, y, `Gold: ${inv.gold}`, COL.gold); y += LINE_H + 4;
    addInvText(0, y, 'Items:', COL.dim); y += LINE_H;

    if (inv.items.length === 0) {
      addInvText(4, y, '(empty)', COL.dim); y += LINE_H;
    } else {
      for (const slot of inv.items) {
        const item = (itemsData as any)[slot.itemId];
        const name = item?.name ?? slot.itemId;
        addInvText(4, y, `${name} x${slot.quantity}`);
        if (item?.type === 'equipment') {
          const itemId = slot.itemId;
          this.makeClickable(y, LINE_H, () => { inv.equip(itemId); this.renderInventory(); });
        } else if (item?.type === 'consumable') {
          const itemId = slot.itemId;
          this.makeClickable(y, LINE_H, () => { this.useConsumable(itemId); });
        }
        y += LINE_H;
      }
    }

    y += 8;
    addInvText(4, y, '> Close', COL.title, 10);
    this.makeClickable(y, LINE_H + 2, () => {
      this.mode = 'idle';
      this.clearAll();
      this.renderStats();
      this.renderLog();
      this.renderActions();
    });
  }

  private useConsumable(itemId: string): void {
    const item = (itemsData as any)[itemId];
    if (!item?.effects) return;
    const run = this.worldScene.run;
    for (const effect of item.effects) {
      if (effect.type === 'heal') run.hp = Math.min(run.maxHp, run.hp + effect.value);
      else if (effect.type === 'restore_mp') run.mp = Math.min(run.maxMp, run.mp + effect.value);
    }
    this.worldScene.inventory.removeItem(itemId);
    this.worldScene.saveRun();
    this.addMessage(`Used ${item.name}.`, '#66dd66');
    this.renderInventory();
  }
}
