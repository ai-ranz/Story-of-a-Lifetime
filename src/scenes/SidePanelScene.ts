import Phaser from 'phaser';
import { PANEL_X, PANEL_WIDTH, GAME_HEIGHT, TYPEWRITER_SPEED } from '../config';
import { CombatSystem, Combatant, CombatAction } from '../systems/CombatSystem';
import { DialogSystem, DialogTree } from '../systems/DialogSystem';
import { WorldScene } from './WorldScene';
import classesData from '../data/classes.json';
import skillsData from '../data/skills.json';
import itemsData from '../data/items.json';
import dialogData from '../data/dialogs/village.json';

type PanelMode = 'idle' | 'dialog' | 'combat' | 'inventory';

const PAD = 6;
const GAP = 2;
const SEP = 5;        // vertical space around separator lines
const ACTION_H = 160; // reserved action area for dialog/combat
const IDLE_BAR = 22;  // small idle bar (inventory shortcut)

const COL = {
  text: 0xdddddd, dim: 0x999999, hp: 0x44cc44, mp: 0x4488ff,
  gold: 0xddaa00, dmg: 0xff4444, heal: 0x44dd44, title: 0xffcc44,
  sep: 0x333355,
};

function hexStr(s: string): number { return parseInt(s.replace('#', ''), 16); }

export class SidePanelScene extends Phaser.Scene {
  mode: PanelMode = 'idle';

  private bg!: Phaser.GameObjects.Rectangle;
  private border!: Phaser.GameObjects.Rectangle;

  private statsObjs: Phaser.GameObjects.GameObject[] = [];
  private logObjs: Phaser.GameObjects.GameObject[] = [];
  private actionObjs: Phaser.GameObjects.GameObject[] = [];
  private clickZones: Phaser.GameObjects.Zone[] = [];

  private messageLog: { text: string; color: string }[] = [];

  // Layout bounds
  private statsBottom = 0;
  private actionTop = GAME_HEIGHT;

  // Combat
  private combat = new CombatSystem();
  private isBoss = false;

  // Dialog
  private dialog = new DialogSystem();
  private typewriterTimer?: Phaser.Time.TimerEvent;
  private fullDialogText = '';
  private displayedChars = 0;
  private dialogTextObj?: Phaser.GameObjects.Text;
  private dialogChoicesRendered = false;

  private worldScene!: WorldScene;

  constructor() { super({ key: 'SidePanelScene' }); }
  init(data: { worldScene: WorldScene }) { this.worldScene = data.worldScene; }

  create(): void {
    this.bg = this.add.rectangle(PANEL_X + PANEL_WIDTH / 2, GAME_HEIGHT / 2, PANEL_WIDTH, GAME_HEIGHT, 0x1a1a2e).setDepth(0);
    this.border = this.add.rectangle(PANEL_X, GAME_HEIGHT / 2, 2, GAME_HEIGHT, 0x444466).setDepth(1);
    this.combat.setEventCallback((e, d) => this.onCombatEvent(e, d));
    this.dialog.setActionCallback((a) => this.worldScene.onDialogAction(a));
    this.refresh();
  }

  // ── Public API ──

  addMessage(text: string, color = '#dddddd'): void {
    this.messageLog.push({ text, color });
    if (this.messageLog.length > 100) this.messageLog.shift();
    if (this.mode !== 'inventory') this.renderLog();
  }

  refreshStats(): void {
    if (this.mode !== 'inventory') { this.renderStats(); this.renderLog(); }
  }

  startDialog(dialogId: string): void {
    const tree = (dialogData as any)[dialogId] as DialogTree | undefined;
    if (!tree) { this.addMessage('(No dialog data)', '#ff6666'); return; }
    this.dialog.start(tree);
    this.mode = 'dialog';
    this.calcLayout();
    this.renderLog();
    this.showDialogNode();
  }

  startCombat(enemies: any[], isBoss: boolean): void {
    this.isBoss = isBoss;
    const run = this.worldScene.run, char = this.worldScene.character;
    const player: Combatant = {
      id: char.name, name: char.name, isPlayer: true,
      hp: run.hp, maxHp: run.maxHp, mp: run.mp, maxMp: run.maxMp,
      stats: { ...run.stats }, skills: [...char.learnedSkills], buffs: [],
    };
    const foes: Combatant[] = enemies.map((e: any, i: number) => ({
      id: e.id + '_' + i, name: e.name, isPlayer: false,
      hp: e.stats.hp, maxHp: e.stats.hp, mp: e.stats.mp ?? 0, maxMp: e.stats.mp ?? 0,
      stats: { attack: e.stats.attack, defense: e.stats.defense, speed: e.stats.speed, magic: e.stats.magic ?? 0 },
      skills: e.skills ?? [], ai: e.ai, buffs: [],
      loot: e.loot, xpReward: e.xpReward, goldReward: e.goldReward,
    }));
    this.mode = 'combat';
    this.calcLayout();
    this.addMessage(`--- ${foes.map(f => f.name).join(', ')} appeared! ---`, '#ff8844');
    this.combat.startCombat([player], foes);
  }

  showInventory(): void { this.mode = 'inventory'; this.renderInventory(); }

  // ── Layout ──

  private calcLayout(): void {
    this.actionTop = (this.mode === 'dialog' || this.mode === 'combat')
      ? GAME_HEIGHT - ACTION_H
      : GAME_HEIGHT - IDLE_BAR;
  }

  private refresh(): void {
    this.calcLayout();
    this.renderStats();
    this.renderLog();
    this.renderActions();
  }

  // ── Helpers ──

  private clearGroup(arr: Phaser.GameObjects.GameObject[]): void {
    for (const o of arr) o.destroy();
    arr.length = 0;
  }

  private clearActions(): void {
    this.clearGroup(this.actionObjs);
    for (const z of this.clickZones) z.destroy();
    this.clickZones.length = 0;
    if (this.typewriterTimer) { this.typewriterTimer.destroy(); this.typewriterTimer = undefined; }
    this.dialogTextObj = undefined;
    this.dialogChoicesRendered = false;
  }

  private clearAll(): void {
    this.clearGroup(this.statsObjs);
    this.clearGroup(this.logObjs);
    this.clearActions();
  }

  private txt(x: number, y: number, str: string, color = COL.text, size = 9): Phaser.GameObjects.Text {
    return this.add.text(PANEL_X + PAD + x, y, str, {
      fontSize: `${size}px`,
      color: Phaser.Display.Color.ValueToColor(color).rgba,
      fontFamily: 'monospace',
      wordWrap: { width: PANEL_WIDTH - PAD * 2 - x, useAdvancedWrap: true },
    }).setDepth(2);
  }

  private sepLine(y: number, group: Phaser.GameObjects.GameObject[]): void {
    const line = this.add.rectangle(PANEL_X + PAD, y, PANEL_WIDTH - PAD * 2, 1, COL.sep)
      .setDepth(2).setOrigin(0, 0.5);
    group.push(line);
  }

  private zone(y: number, h: number, cb: () => void): void {
    const z = this.add.zone(PANEL_X + PANEL_WIDTH / 2, y + h / 2, PANEL_WIDTH, h)
      .setDepth(3).setInteractive({ useHandCursor: true });
    z.on('pointerdown', cb);
    this.clickZones.push(z);
  }

  // ── Stats (compact 3 lines) ──

  private renderStats(): void {
    this.clearGroup(this.statsObjs);
    const run = this.worldScene?.run;
    const char = this.worldScene?.character;
    if (!run || !char) return;
    let y = PAD;
    const cd = (classesData as any)[char.class];
    const t1 = this.txt(0, y, `${char.name}  Lv.${char.level} ${cd?.name ?? char.class}`, COL.title, 10);
    this.statsObjs.push(t1); y += t1.height + GAP;
    const t2 = this.txt(0, y, `HP ${run.hp}/${run.maxHp}  MP ${run.mp}/${run.maxMp}  Gold ${run.gold ?? 0}`, COL.hp, 9);
    this.statsObjs.push(t2); y += t2.height + GAP;
    const t3 = this.txt(0, y, `ATK ${run.stats.attack}  DEF ${run.stats.defense}  SPD ${run.stats.speed}  MAG ${run.stats.magic}`, COL.dim, 9);
    this.statsObjs.push(t3); y += t3.height + SEP / 2;
    this.sepLine(y, this.statsObjs);
    this.statsBottom = y + SEP / 2;
  }

  // ── Log (bottom-up, measured heights — no overlaps) ──

  private renderLog(): void {
    this.clearGroup(this.logObjs);
    const top = this.statsBottom;
    const bottom = this.actionTop - SEP / 2;
    // Separator above action area
    this.sepLine(bottom + SEP / 4, this.logObjs);

    let y = bottom;
    for (let i = this.messageLog.length - 1; i >= 0 && y > top; i--) {
      const msg = this.messageLog[i];
      const t = this.txt(0, 0, msg.text, hexStr(msg.color), 9);
      const h = t.height + GAP;
      y -= h;
      if (y < top) { t.destroy(); break; }
      t.setY(y);
      this.logObjs.push(t);
    }
  }

  // ── Actions (bottom bar) ──

  private renderActions(): void {
    this.clearActions();
    if (this.mode === 'idle') {
      const y = this.actionTop + (IDLE_BAR - 13) / 2;
      const t = this.txt(0, y, '[I] Inventory', COL.dim, 9);
      this.actionObjs.push(t);
      this.zone(y, 13, () => this.showInventory());
    }
  }

  // ── DIALOG ──

  private showDialogNode(): void {
    this.clearActions();
    const node = this.dialog.currentNode;
    if (!node) { this.endDialog(); return; }
    this.addMessage(`[${node.speaker}]`, '#ffcc44');

    let y = this.actionTop + PAD;
    this.fullDialogText = node.text;
    this.displayedChars = 0;
    this.dialogChoicesRendered = false;
    this.dialogTextObj = this.txt(0, y, '', COL.text, 10);
    this.actionObjs.push(this.dialogTextObj);

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

    // Click to skip typewriter
    this.zone(this.actionTop, ACTION_H, () => {
      if (this.displayedChars < this.fullDialogText.length) {
        this.displayedChars = this.fullDialogText.length;
        if (this.dialogTextObj) this.dialogTextObj.setText(this.fullDialogText);
        if (this.typewriterTimer) { this.typewriterTimer.destroy(); this.typewriterTimer = undefined; }
        if (!this.dialogChoicesRendered) { this.dialogChoicesRendered = true; this.renderDialogChoices(); }
      }
    });
  }

  private renderDialogChoices(): void {
    for (const z of this.clickZones) z.destroy();
    this.clickZones.length = 0;
    const node = this.dialog.currentNode;
    if (!node) return;
    const textH = this.dialogTextObj ? this.dialogTextObj.height : 14;
    let y = this.actionTop + PAD + textH + 6;
    if (node.choices?.length) {
      for (let i = 0; i < node.choices.length; i++) {
        const t = this.txt(4, y, `> ${node.choices[i].text}`, COL.title, 9);
        this.actionObjs.push(t);
        const idx = i;
        this.zone(y, t.height + 2, () => this.dialogChoose(idx));
        y += t.height + 3;
      }
    } else {
      const t = this.txt(4, y, '[Click to continue]', COL.dim, 9);
      this.actionObjs.push(t);
      this.zone(y, t.height + 2, () => this.dialogAdvance());
    }
  }

  private dialogAdvance(): void {
    this.addMessage(this.fullDialogText, '#cccccc');
    if (this.dialog.advance()) this.showDialogNode();
    else this.endDialog();
  }

  private dialogChoose(idx: number): void {
    const choiceText = this.dialog.currentNode?.choices?.[idx]?.text ?? '';
    this.addMessage(this.fullDialogText, '#cccccc');
    if (choiceText) this.addMessage(`  > ${choiceText}`, '#aaaacc');
    if (this.dialog.choose(idx)) this.showDialogNode();
    else this.endDialog();
  }

  private endDialog(): void {
    this.dialog.end();
    this.mode = 'idle';
    this.refresh();
  }

  // ── COMBAT ──

  private onCombatEvent(event: string, data?: any): void {
    switch (event) {
      case 'combat_start': case 'player_choose':
        this.renderCombatActions(); break;
      case 'animate':
        this.onCombatAnimate(data?.result); break;
      case 'victory':
        this.onCombatVictory(data); break;
      case 'defeat':
        this.onCombatDefeat(); break;
      case 'fled':
        this.addMessage('Escaped from battle!', '#88ccff');
        this.mode = 'idle';
        this.refresh();
        break;
    }
  }

  private renderCombatActions(): void {
    this.clearActions();
    this.renderLog();
    let y = this.actionTop + PAD;

    for (const e of this.combat.enemies) {
      const col = e.hp > 0 ? COL.hp : COL.dim;
      const t = this.txt(0, y, `${e.name} HP:${Math.max(0, e.hp)}/${e.maxHp}`, col, 9);
      this.actionObjs.push(t); y += t.height + 2;
    }
    y += 2;

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
    for (const slot of this.worldScene.inventory.items) {
      const item = (itemsData as any)[slot.itemId];
      if (item?.type === 'consumable') actions.push({ label: `${item.name} x${slot.quantity}`, action: { type: 'item', itemId: slot.itemId } });
    }
    actions.push({ label: 'Defend', action: { type: 'defend' } });
    if (!this.isBoss) actions.push({ label: 'Flee', action: { type: 'flee' } });

    for (const a of actions) {
      const t = this.txt(4, y, `> ${a.label}`, COL.title, 9);
      this.actionObjs.push(t);
      const act = a.action;
      this.zone(y, t.height + 2, () => this.submitCombatAction(act));
      y += t.height + 3;
    }
  }

  private submitCombatAction(action: CombatAction): void {
    if (action.type === 'item' && action.itemId) this.worldScene.inventory.removeItem(action.itemId);
    this.combat.submitAction(action);
  }

  private onCombatAnimate(result: any): void {
    if (!result) { this.combat.advanceFromAnimate(); return; }
    let msg = '', color = '#dddddd';
    if (result.type === 'damage') {
      msg = result.skillName
        ? `${result.actor} uses ${result.skillName}! ${result.value} dmg to ${result.target}${result.critical ? ' CRIT!' : ''}`
        : `${result.actor} hits ${result.target} for ${result.value}${result.critical ? ' CRIT!' : ''}`;
      color = '#ff6666';
    } else if (result.type === 'heal') {
      msg = result.skillName ? `${result.skillName}: +${result.value} HP to ${result.target}` : `${result.target} heals ${result.value} HP`;
      color = '#66dd66';
    } else if (result.type === 'buff') { msg = `${result.actor} uses ${result.skillName}!`; color = '#88aaff'; }
    else if (result.type === 'miss') { msg = `${result.actor}'s attack missed!`; color = '#888888'; }
    else if (result.type === 'flee_fail') { msg = 'Failed to escape!'; color = '#cc8844'; }
    this.addMessage(msg, color);
    this.renderStats();

    this.clearActions();
    let y = this.actionTop + PAD;
    for (const e of this.combat.enemies) {
      const col = e.hp > 0 ? COL.hp : COL.dim;
      const t = this.txt(0, y, `${e.name} HP:${Math.max(0, e.hp)}/${e.maxHp}`, col, 9);
      this.actionObjs.push(t); y += t.height + 2;
    }
    y += 4;
    const tc = this.txt(4, y, '[Click to continue]', COL.dim, 9);
    this.actionObjs.push(tc);
    this.zone(y, tc.height + 4, () => this.combat.advanceFromAnimate());
  }

  private onCombatVictory(rewards: any): void {
    this.syncCombatHpMp();
    this.worldScene.onCombatVictory(rewards);
    if (this.isBoss) { this.worldScene.onBossDefeated(); return; }
    this.addMessage('--- Victory! ---', '#ffcc44');
    if (rewards.xp) this.addMessage(`  XP +${rewards.xp}`, '#dddddd');
    if (rewards.gold) this.addMessage(`  Gold +${rewards.gold}`, '#ddaa00');
    for (const item of rewards.loot) {
      const d = (itemsData as any)[item];
      this.addMessage(`  Loot: ${d?.name ?? item}`, '#66dd66');
    }
    this.mode = 'idle';
    this.refresh();
  }

  private onCombatDefeat(): void {
    this.addMessage('--- Defeat... ---', '#ff4444');
    this.clearActions();
    let y = this.actionTop + PAD;
    const t1 = this.txt(0, y, 'You have fallen...', COL.dmg, 10);
    this.actionObjs.push(t1); y += t1.height + 6;
    const t2 = this.txt(4, y, '[Click to continue]', COL.dim, 9);
    this.actionObjs.push(t2);
    this.zone(y, t2.height + 4, () => { this.mode = 'idle'; this.worldScene.onCombatDefeat(); });
  }

  private syncCombatHpMp(): void {
    const p = this.combat.party[0];
    if (p) { this.worldScene.run.hp = p.hp; this.worldScene.run.mp = p.mp; }
  }

  // ── INVENTORY (full takeover) ──

  private renderInventory(): void {
    this.clearAll();
    const inv = this.worldScene.inventory;
    let y = PAD;
    const push = (t: Phaser.GameObjects.GameObject) => this.actionObjs.push(t);

    const t0 = this.txt(0, y, '--- INVENTORY ---', COL.title, 10);
    push(t0); y += t0.height + 4;
    const te = this.txt(0, y, 'Equipment:', COL.dim, 9);
    push(te); y += te.height + GAP;
    for (const slot of ['weapon', 'armor', 'accessory'] as const) {
      const id = inv.equipment[slot];
      const name = id ? ((itemsData as any)[id]?.name ?? id) : '(empty)';
      const t = this.txt(4, y, `${slot}: ${name}`, id ? COL.text : COL.dim, 9);
      push(t);
      if (id) { const s = slot; this.zone(y, t.height, () => { inv.unequip(s); this.renderInventory(); }); }
      y += t.height + GAP;
    }
    y += 4;
    const tg = this.txt(0, y, `Gold: ${inv.gold}`, COL.gold, 9);
    push(tg); y += tg.height + 4;
    const ti = this.txt(0, y, 'Items:', COL.dim, 9);
    push(ti); y += ti.height + GAP;
    if (inv.items.length === 0) {
      const t = this.txt(4, y, '(empty)', COL.dim, 9); push(t); y += t.height + GAP;
    } else {
      for (const slot of inv.items) {
        const item = (itemsData as any)[slot.itemId];
        const name = item?.name ?? slot.itemId;
        const t = this.txt(4, y, `${name} x${slot.quantity}`, COL.text, 9);
        push(t);
        if (item?.type === 'equipment') { const id = slot.itemId; this.zone(y, t.height, () => { inv.equip(id); this.renderInventory(); }); }
        else if (item?.type === 'consumable') { const id = slot.itemId; this.zone(y, t.height, () => this.useConsumable(id)); }
        y += t.height + GAP;
      }
    }
    y += 6;
    const tc = this.txt(4, y, '> Close', COL.title, 10);
    push(tc);
    this.zone(y, tc.height + 2, () => { this.mode = 'idle'; this.refresh(); });
  }

  private useConsumable(itemId: string): void {
    const item = (itemsData as any)[itemId];
    if (!item?.effects) return;
    const run = this.worldScene.run;
    for (const eff of item.effects) {
      if (eff.type === 'heal') run.hp = Math.min(run.maxHp, run.hp + eff.value);
      else if (eff.type === 'restore_mp') run.mp = Math.min(run.maxMp, run.mp + eff.value);
    }
    this.worldScene.inventory.removeItem(itemId);
    this.worldScene.saveRun();
    this.addMessage(`Used ${item.name}.`, '#66dd66');
    this.renderInventory();
  }
}
