import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TYPEWRITER_SPEED, LOG_FADE_MS } from '../config';
import { CombatSystem, Combatant, CombatAction } from '../systems/CombatSystem';
import { DialogSystem, DialogTree } from '../systems/DialogSystem';
import { WorldScene } from './WorldScene';
import { VirtualPad } from '../ui/VirtualPad';
import { AudioManager } from '../systems/AudioManager';
import classesData from '../data/classes.json';
import skillsData from '../data/skills.json';
import itemsData from '../data/items.json';
import dialogData from '../data/dialogs/village.json';

type PanelMode = 'idle' | 'dialog' | 'combat' | 'inventory' | 'shop';

const PAD = 6;
const TOP_H = 22;      // top stats bar height
const BTN_H = 24;      // bottom toolbar height
const LOG_MAX = 5;      // max visible log messages
const LOG_LINE_H = 14;  // log line height
const ACTION_H = 140;   // expanded action area (combat/dialog)

const COL = {
  text: 0xdddddd, dim: 0x999999, hp: 0x44cc44, mp: 0x4488ff,
  gold: 0xddaa00, dmg: 0xff4444, heal: 0x44dd44, title: 0xffcc44,
  bar_bg: 0x222222, overlay: 0x000000,
};

function hexStr(s: string): number { return parseInt(s.replace('#', ''), 16); }

interface FloatingMsg {
  bg: Phaser.GameObjects.Rectangle;
  txt: Phaser.GameObjects.Text;
  timer: Phaser.Time.TimerEvent;
}

export class HUDScene extends Phaser.Scene {
  mode: PanelMode = 'idle';

  // Subsystems
  private combat = new CombatSystem();
  private dialog = new DialogSystem();
  private isBoss = false;

  // All managed display objects
  private statsObjs: Phaser.GameObjects.GameObject[] = [];
  private logFloats: FloatingMsg[] = [];
  private actionObjs: Phaser.GameObjects.GameObject[] = [];
  private clickZones: Phaser.GameObjects.Zone[] = [];
  private overlayBg?: Phaser.GameObjects.Rectangle;

  // Persistent log for review
  private messageLog: { text: string; color: string }[] = [];

  // Dialog typewriter
  private typewriterTimer?: Phaser.Time.TimerEvent;
  private fullDialogText = '';
  private displayedChars = 0;
  private dialogTextObj?: Phaser.GameObjects.Text;
  private dialogChoicesRendered = false;

  private worldScene!: WorldScene;
  private virtualPad?: VirtualPad;

  constructor() { super({ key: 'HUDScene' }); }
  init(data: { worldScene: WorldScene }) { this.worldScene = data.worldScene; }

  create(): void {
    // HUD camera covers full screen, no scroll
    this.cameras.main.setViewport(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.combat.setEventCallback((e, d) => this.onCombatEvent(e, d));
    this.dialog.setActionCallback((a) => this.worldScene.onDialogAction(a));
    this.renderStats();
    this.renderBottomBar();

    // Create virtual pad for touch devices
    if (this.worldScene.inputManager?.isTouchDevice) {
      this.virtualPad = new VirtualPad(this, this.worldScene.inputManager);
    }
  }

  // ══════════════════════════════════════
  //  PUBLIC API (same contract as old SidePanelScene)
  // ══════════════════════════════════════

  addMessage(text: string, color = '#dddddd'): void {
    this.messageLog.push({ text, color });
    if (this.messageLog.length > 100) this.messageLog.shift();
    this.showFloatingMessage(text, color);
  }

  refreshStats(): void {
    this.renderStats();
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
      spriteKey: e.spriteKey,
    }));
    this.mode = 'combat';
    this.addMessage(`--- ${foes.map(f => f.name).join(', ')} appeared! ---`, '#ff8844');
    this.combat.startCombat([player], foes);
  }

  showInventory(): void { this.mode = 'inventory'; this.renderInventory(); }
  showShop(): void { this.endDialog(); this.mode = 'shop'; this.renderShop(); }

  // ══════════════════════════════════════
  //  STATS BAR (top overlay)
  // ══════════════════════════════════════

  private renderStats(): void {
    this.clearGroup(this.statsObjs);
    const run = this.worldScene?.run;
    const char = this.worldScene?.character;
    if (!run || !char) return;

    // Semi-transparent background bar
    const bg = this.add.rectangle(GAME_WIDTH / 2, TOP_H / 2, GAME_WIDTH, TOP_H, COL.overlay, 0.7).setDepth(10);
    this.statsObjs.push(bg);

    const cd = (classesData as any)[char.class];
    let x = PAD;
    const cy = TOP_H / 2;

    // Name + Level
    const name = this.mkText(x, cy, `${char.name} Lv${char.level}`, COL.title, 9);
    this.statsObjs.push(name); x += name.width + 8;

    // HP bar
    x = this.drawBar(x, cy, 'HP', run.hp, run.maxHp, COL.hp, 80);
    x += 8;
    // MP bar
    x = this.drawBar(x, cy, 'MP', run.mp, run.maxMp, COL.mp, 60);
    x += 8;

    // Stats
    const stats = this.mkText(x, cy,
      `ATK${run.stats.attack} DEF${run.stats.defense} SPD${run.stats.speed} MAG${run.stats.magic}`,
      COL.dim, 8);
    this.statsObjs.push(stats);

    // Gold (right-aligned)
    const goldTxt = this.mkText(0, cy, `${run.gold ?? 0}g`, COL.gold, 9);
    goldTxt.setX(GAME_WIDTH - PAD - goldTxt.width);
    this.statsObjs.push(goldTxt);

    // Floor indicator
    if (run.dungeonFloor > 0) {
      const floorTxt = this.mkText(0, cy, `F${run.dungeonFloor}`, COL.dim, 8);
      floorTxt.setX(GAME_WIDTH - PAD - goldTxt.width - 8 - floorTxt.width);
      this.statsObjs.push(floorTxt);
    }
  }

  private drawBar(x: number, cy: number, label: string, cur: number, max: number, color: number, barW: number): number {
    const lbl = this.mkText(x, cy, label, color, 8);
    this.statsObjs.push(lbl); x += lbl.width + 2;

    const barH = 8;
    const bgRect = this.add.rectangle(x + barW / 2, cy, barW, barH, COL.bar_bg).setDepth(11);
    this.statsObjs.push(bgRect);
    const fillW = max > 0 ? Math.max(1, (cur / max) * barW) : 0;
    const fillRect = this.add.rectangle(x + fillW / 2, cy, fillW, barH, color).setDepth(12);
    this.statsObjs.push(fillRect);
    x += barW + 2;

    const val = this.mkText(x, cy, `${cur}/${max}`, COL.text, 7);
    this.statsObjs.push(val); x += val.width;
    return x;
  }

  // ══════════════════════════════════════
  //  FLOATING LOG MESSAGES
  // ══════════════════════════════════════

  private showFloatingMessage(text: string, color: string): void {
    // Position: stack above bottom bar, newest at bottom
    const baseY = this.getBottomTop() - 4;
    const y = baseY - this.logFloats.length * LOG_LINE_H;

    const txt = this.add.text(GAME_WIDTH / 2, y, text, {
      fontSize: '9px', color: Phaser.Display.Color.ValueToColor(hexStr(color)).rgba,
      fontFamily: 'monospace', align: 'center',
    }).setDepth(20).setOrigin(0.5, 1);

    const bgW = txt.width + 8;
    const bg = this.add.rectangle(GAME_WIDTH / 2, y - txt.height / 2, bgW, txt.height + 2, COL.overlay, 0.6)
      .setDepth(19);

    const timer = this.time.delayedCall(LOG_FADE_MS, () => this.removeFloat(msg));

    const msg: FloatingMsg = { bg, txt, timer };
    this.logFloats.push(msg);

    // Trim oldest if too many
    while (this.logFloats.length > LOG_MAX) {
      this.removeFloat(this.logFloats[0]);
    }

    // Slide up existing messages
    this.repositionFloats();

    // Fade out
    this.tweens.add({ targets: [txt, bg], alpha: 0, delay: LOG_FADE_MS * 0.7, duration: LOG_FADE_MS * 0.3 });
  }

  private repositionFloats(): void {
    const baseY = this.getBottomTop() - 4;
    for (let i = 0; i < this.logFloats.length; i++) {
      const idx = this.logFloats.length - 1 - i; // newest = highest index = lowest on screen
      const f = this.logFloats[idx];
      const y = baseY - i * LOG_LINE_H;
      this.tweens.add({ targets: f.txt, y, duration: 120, ease: 'Power1' });
      this.tweens.add({ targets: f.bg, y: y - f.txt.height / 2, duration: 120, ease: 'Power1' });
    }
  }

  private removeFloat(msg: FloatingMsg): void {
    const idx = this.logFloats.indexOf(msg);
    if (idx < 0) return;
    this.logFloats.splice(idx, 1);
    msg.txt.destroy();
    msg.bg.destroy();
    if (msg.timer) msg.timer.destroy();
    this.repositionFloats();
  }

  private getBottomTop(): number {
    if (this.mode === 'combat' || this.mode === 'dialog') return GAME_HEIGHT - ACTION_H;
    return GAME_HEIGHT - BTN_H;
  }

  // ══════════════════════════════════════
  //  BOTTOM TOOLBAR (idle state)
  // ══════════════════════════════════════

  private renderBottomBar(): void {
    this.clearActions();
    if (this.mode !== 'idle') return;

    const y = GAME_HEIGHT - BTN_H;
    const bg = this.add.rectangle(GAME_WIDTH / 2, y + BTN_H / 2, GAME_WIDTH, BTN_H, COL.overlay, 0.7).setDepth(10);
    this.actionObjs.push(bg);

    // Buttons
    let bx = PAD;
    bx = this.addButton(bx, y + 4, '[I] Inventory', COL.title, () => this.showInventory());
    bx = this.addButton(bx + 10, y + 4, '[Space] Interact', COL.dim, () => {});
  }

  private addButton(x: number, y: number, label: string, color: number, cb: () => void): number {
    const t = this.mkText(x, y + 8, label, color, 9);
    this.actionObjs.push(t);
    const z = this.add.zone(x + t.width / 2, y + 8, t.width + 4, BTN_H - 4)
      .setDepth(25).setInteractive({ useHandCursor: true });
    z.on('pointerdown', cb);
    this.clickZones.push(z);
    return x + t.width;
  }

  // ══════════════════════════════════════
  //  DIALOG
  // ══════════════════════════════════════

  private showDialogNode(): void {
    this.clearActions();
    const node = this.dialog.currentNode;
    if (!node) { this.endDialog(); return; }

    const areaTop = GAME_HEIGHT - ACTION_H;
    // Dark background for dialog area
    const bg = this.add.rectangle(GAME_WIDTH / 2, areaTop + ACTION_H / 2, GAME_WIDTH, ACTION_H, COL.overlay, 0.85).setDepth(15);
    this.actionObjs.push(bg);

    let y = areaTop + PAD;
    const speaker = this.mkText(PAD, y, `[${node.speaker}]`, COL.title, 10);
    this.actionObjs.push(speaker);
    y += speaker.height + 4;

    this.fullDialogText = node.text;
    this.displayedChars = 0;
    this.dialogChoicesRendered = false;
    this.dialogTextObj = this.add.text(PAD, y, '', {
      fontSize: '10px', color: '#dddddd', fontFamily: 'monospace',
      wordWrap: { width: GAME_WIDTH - PAD * 2, useAdvancedWrap: true },
    }).setDepth(16);
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
    this.addZone(areaTop, ACTION_H, () => {
      if (this.displayedChars < this.fullDialogText.length) {
        this.displayedChars = this.fullDialogText.length;
        if (this.dialogTextObj) this.dialogTextObj.setText(this.fullDialogText);
        if (this.typewriterTimer) { this.typewriterTimer.destroy(); this.typewriterTimer = undefined; }
        if (!this.dialogChoicesRendered) { this.dialogChoicesRendered = true; this.renderDialogChoices(); }
      }
    });
  }

  private renderDialogChoices(): void {
    // Remove the skip zone
    for (const z of this.clickZones) z.destroy();
    this.clickZones.length = 0;
    const node = this.dialog.currentNode;
    if (!node) return;
    const textH = this.dialogTextObj ? this.dialogTextObj.height : 14;
    const areaTop = GAME_HEIGHT - ACTION_H;
    let y = areaTop + PAD + 16 + textH + 6; // speaker + text + gap

    if (node.choices?.length) {
      for (let i = 0; i < node.choices.length; i++) {
        const t = this.mkText(PAD + 4, y, `> ${node.choices[i].text}`, COL.title, 9);
        this.actionObjs.push(t);
        const idx = i;
        this.addZone(y - 1, t.height + 2, () => this.dialogChoose(idx));
        y += t.height + 3;
      }
    } else {
      const t = this.mkText(PAD + 4, y, '[Click to continue]', COL.dim, 9);
      this.actionObjs.push(t);
      this.addZone(y - 1, t.height + 2, () => this.dialogAdvance());
    }
  }

  private dialogAdvance(): void {
    AudioManager.getInstance().playSelect();
    this.addMessage(this.fullDialogText, '#cccccc');
    if (this.dialog.advance()) {
      if (this.mode === 'dialog') this.showDialogNode();
    }
    else this.endDialog();
  }

  private dialogChoose(idx: number): void {
    AudioManager.getInstance().playSelect();
    const choiceText = this.dialog.currentNode?.choices?.[idx]?.text ?? '';
    this.addMessage(this.fullDialogText, '#cccccc');
    if (choiceText) this.addMessage(`  > ${choiceText}`, '#aaaacc');
    if (this.dialog.choose(idx)) {
      // If the action callback changed the mode (e.g. openShop), don't overwrite it
      if (this.mode === 'dialog') this.showDialogNode();
    }
    else this.endDialog();
  }

  private endDialog(): void {
    this.dialog.end();
    this.mode = 'idle';
    this.clearActions();
    this.renderBottomBar();
  }

  // ══════════════════════════════════════
  //  COMBAT
  // ══════════════════════════════════════

  private onCombatEvent(event: string, data?: any): void {
    const audio = AudioManager.getInstance();
    switch (event) {
      case 'combat_start':
        audio.playCombatStart();
        this.renderCombatActions(); break;
      case 'player_choose':
        this.renderCombatActions(); break;
      case 'animate':
        this.onCombatAnimate(data?.result); break;
      case 'victory':
        audio.playVictory();
        this.onCombatVictory(data); break;
      case 'defeat':
        audio.playDefeat();
        this.onCombatDefeat(); break;
      case 'fled':
        audio.playFlee();
        this.addMessage('Escaped from battle!', '#88ccff');
        this.mode = 'idle';
        this.clearActions();
        this.renderBottomBar();
        break;
    }
  }

  private renderCombatActions(): void {
    this.clearActions();
    const areaTop = GAME_HEIGHT - ACTION_H;
    const bg = this.add.rectangle(GAME_WIDTH / 2, areaTop + ACTION_H / 2, GAME_WIDTH, ACTION_H, COL.overlay, 0.85).setDepth(15);
    this.actionObjs.push(bg);

    let y = areaTop + PAD;

    // Enemy display with sprites
    const enemyRowX = PAD;
    for (const e of this.combat.enemies) {
      const col = e.hp > 0 ? COL.hp : COL.dim;
      // Render sprite icon
      if (e.spriteKey && this.textures.exists(e.spriteKey)) {
        const icon = this.add.image(enemyRowX + 8, y + 6, e.spriteKey).setDepth(16).setScale(1.5);
        if (e.hp <= 0) icon.setAlpha(0.4);
        this.actionObjs.push(icon);
      }
      const t = this.mkText(enemyRowX + 20, y + 6, `${e.name} HP:${Math.max(0, e.hp)}/${e.maxHp}`, col, 9);
      this.actionObjs.push(t); y += 16;
    }
    y += 4;

    // Action buttons in a grid layout
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

    // Render as two-column layout
    const colW = (GAME_WIDTH - PAD * 2) / 2;
    let col = 0;
    const startY = y;
    for (const a of actions) {
      const ax = PAD + (col * colW) + 4;
      const t = this.mkText(ax, y, `> ${a.label}`, COL.title, 9);
      this.actionObjs.push(t);
      const act = a.action;
      this.addZone(y - 1, t.height + 2, () => this.submitCombatAction(act));
      col++;
      if (col >= 2) { col = 0; y += t.height + 3; }
    }
  }

  private submitCombatAction(action: CombatAction): void {
    if (action.type === 'item' && action.itemId) this.worldScene.inventory.removeItem(action.itemId);
    this.combat.submitAction(action);
  }

  private onCombatAnimate(result: any): void {
    if (!result) { this.combat.advanceFromAnimate(); return; }
    const audio = AudioManager.getInstance();
    let msg = '', color = '#dddddd';
    if (result.type === 'damage') {
      msg = result.skillName
        ? `${result.actor} uses ${result.skillName}! ${result.value} dmg to ${result.target}${result.critical ? ' CRIT!' : ''}`
        : `${result.actor} hits ${result.target} for ${result.value}${result.critical ? ' CRIT!' : ''}`;
      color = '#ff6666';
      if (result.critical) audio.playCriticalHit(); else audio.playAttackHit();
    } else if (result.type === 'heal') {
      msg = result.skillName ? `${result.skillName}: +${result.value} HP to ${result.target}` : `${result.target} heals ${result.value} HP`;
      color = '#66dd66';
      audio.playHeal();
    } else if (result.type === 'buff') { msg = `${result.actor} uses ${result.skillName}!`; color = '#88aaff'; audio.playSelect(); }
    else if (result.type === 'miss') { msg = `${result.actor}'s attack missed!`; color = '#888888'; audio.playMiss(); }
    else if (result.type === 'flee_fail') { msg = 'Failed to escape!'; color = '#cc8844'; audio.playMiss(); }
    this.addMessage(msg, color);
    this.renderStats();

    this.clearActions();
    const areaTop = GAME_HEIGHT - ACTION_H;
    const bg = this.add.rectangle(GAME_WIDTH / 2, areaTop + ACTION_H / 2, GAME_WIDTH, ACTION_H, COL.overlay, 0.85).setDepth(15);
    this.actionObjs.push(bg);

    let y = areaTop + PAD;
    for (const e of this.combat.enemies) {
      const col = e.hp > 0 ? COL.hp : COL.dim;
      if (e.spriteKey && this.textures.exists(e.spriteKey)) {
        const icon = this.add.image(PAD + 8, y + 6, e.spriteKey).setDepth(16).setScale(1.5);
        if (e.hp <= 0) icon.setAlpha(0.4);
        this.actionObjs.push(icon);
      }
      const t = this.mkText(PAD + 20, y + 6, `${e.name} HP:${Math.max(0, e.hp)}/${e.maxHp}`, col, 9);
      this.actionObjs.push(t); y += 16;
    }
    y += 6;
    const tc = this.mkText(PAD + 4, y, '[Click to continue]', COL.dim, 9);
    this.actionObjs.push(tc);
    this.addZone(y - 1, tc.height + 4, () => this.combat.advanceFromAnimate());
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
      AudioManager.getInstance().playItemPickup();
    }
    this.mode = 'idle';
    this.clearActions();
    this.renderStats();
    this.renderBottomBar();
  }

  private onCombatDefeat(): void {
    this.addMessage('--- Defeat... ---', '#ff4444');
    this.clearActions();
    const areaTop = GAME_HEIGHT - ACTION_H;
    const bg = this.add.rectangle(GAME_WIDTH / 2, areaTop + ACTION_H / 2, GAME_WIDTH, ACTION_H, COL.overlay, 0.85).setDepth(15);
    this.actionObjs.push(bg);

    let y = areaTop + PAD;
    const t1 = this.mkText(GAME_WIDTH / 2, y, 'You have fallen...', COL.dmg, 12);
    t1.setOrigin(0.5, 0); this.actionObjs.push(t1); y += t1.height + 8;
    const t2 = this.mkText(GAME_WIDTH / 2, y, '[Click to continue]', COL.dim, 9);
    t2.setOrigin(0.5, 0); this.actionObjs.push(t2);
    this.addZone(areaTop, ACTION_H, () => { this.mode = 'idle'; this.worldScene.onCombatDefeat(); });
  }

  private syncCombatHpMp(): void {
    const p = this.combat.party[0];
    if (p) { this.worldScene.run.hp = p.hp; this.worldScene.run.mp = p.mp; }
  }

  // ══════════════════════════════════════
  //  INVENTORY (center overlay)
  // ══════════════════════════════════════

  private renderInventory(): void {
    this.clearActions();
    const inv = this.worldScene.inventory;

    // Full screen dim overlay
    this.overlayBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COL.overlay, 0.7).setDepth(30);
    this.actionObjs.push(this.overlayBg);

    // Inventory panel
    const panelW = 360, panelH = 380;
    const px = (GAME_WIDTH - panelW) / 2;
    const py = (GAME_HEIGHT - panelH) / 2;
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH, 0x1a1a2e, 0.95).setDepth(31);
    this.actionObjs.push(panel);
    const border = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH)
      .setStrokeStyle(1, 0x444466).setDepth(31);
    this.actionObjs.push(border);

    let y = py + PAD;
    const push = (t: Phaser.GameObjects.GameObject) => { this.actionObjs.push(t); };

    const t0 = this.invText(px + PAD, y, '--- INVENTORY ---', COL.title, 11);
    push(t0); y += t0.height + 6;

    const te = this.invText(px + PAD, y, 'Equipment:', COL.dim, 9);
    push(te); y += te.height + 2;
    for (const slot of ['weapon', 'armor', 'accessory'] as const) {
      const id = inv.equipment[slot];
      const name = id ? ((itemsData as any)[id]?.name ?? id) : '(empty)';
      const t = this.invText(px + PAD + 4, y, `${slot}: ${name}`, id ? COL.text : COL.dim, 9);
      push(t);
      if (id) {
        const s = slot;
        this.addZone(y, t.height, () => { inv.unequip(s); this.renderInventory(); });
      }
      y += t.height + 2;
    }
    y += 6;
    const tg = this.invText(px + PAD, y, `Gold: ${inv.gold}`, COL.gold, 9);
    push(tg); y += tg.height + 6;
    const ti = this.invText(px + PAD, y, 'Items:', COL.dim, 9);
    push(ti); y += ti.height + 2;

    if (inv.items.length === 0) {
      const t = this.invText(px + PAD + 4, y, '(empty)', COL.dim, 9);
      push(t); y += t.height + 2;
    } else {
      for (const slot of inv.items) {
        const item = (itemsData as any)[slot.itemId];
        const name = item?.name ?? slot.itemId;
        const t = this.invText(px + PAD + 4, y, `${name} x${slot.quantity}`, COL.text, 9);
        push(t);
        if (item?.type === 'equipment') {
          const id = slot.itemId;
          this.addZone(y, t.height, () => { inv.equip(id); this.renderInventory(); });
        } else if (item?.type === 'consumable') {
          const id = slot.itemId;
          this.addZone(y, t.height, () => this.useConsumable(id));
        }
        y += t.height + 2;
      }
    }
    y += 8;
    const tc = this.invText(px + panelW / 2, y, '[ Close ]', COL.title, 10);
    tc.setOrigin(0.5, 0); push(tc);
    this.addZone(y, tc.height + 4, () => { this.mode = 'idle'; this.clearActions(); this.renderBottomBar(); });
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
    this.renderStats();
  }

  // ══════════════════════════════════════
  //  SHOP
  // ══════════════════════════════════════

  private static readonly SHOP_STOCK = [
    'health_potion', 'mana_potion', 'wooden_sword', 'short_sword',
    'apprentice_staff', 'leather_armor', 'herb',
  ];

  private renderShop(): void {
    this.clearActions();
    const inv = this.worldScene.inventory;

    // Full screen dim overlay
    this.overlayBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COL.overlay, 0.7).setDepth(30);
    this.actionObjs.push(this.overlayBg);

    // Shop panel
    const panelW = 380, panelH = 400;
    const px = (GAME_WIDTH - panelW) / 2;
    const py = (GAME_HEIGHT - panelH) / 2;
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH, 0x1a1a2e, 0.95).setDepth(31);
    this.actionObjs.push(panel);
    const border = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH)
      .setStrokeStyle(1, 0x444466).setDepth(31);
    this.actionObjs.push(border);

    let y = py + PAD;
    const push = (t: Phaser.GameObjects.GameObject) => { this.actionObjs.push(t); };

    const t0 = this.invText(px + PAD, y, "--- BRYNN'S SHOP ---", COL.title, 11);
    push(t0); y += t0.height + 4;

    const tg = this.invText(px + PAD, y, `Your Gold: ${inv.gold}`, COL.gold, 9);
    push(tg); y += tg.height + 6;

    // Buy section
    const tb = this.invText(px + PAD, y, 'Buy:', COL.dim, 9);
    push(tb); y += tb.height + 2;

    for (const itemId of HUDScene.SHOP_STOCK) {
      const item = (itemsData as any)[itemId];
      if (!item) continue;
      const price = item.value ?? 0;
      const canAfford = inv.gold >= price;
      const label = `${item.name} - ${price}g`;
      const t = this.invText(px + PAD + 4, y, label, canAfford ? COL.text : COL.dim, 9);
      push(t);

      if (canAfford && price > 0) {
        const id = itemId;
        const zone = this.add.zone(px + panelW / 2, y + t.height / 2, panelW - PAD * 2, t.height + 2)
          .setDepth(35).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.buyItem(id, price));
        this.clickZones.push(zone);
      }
      y += t.height + 2;
    }
    y += 6;

    // Sell section
    const ts = this.invText(px + PAD, y, 'Sell:', COL.dim, 9);
    push(ts); y += ts.height + 2;

    if (inv.items.length === 0) {
      const t = this.invText(px + PAD + 4, y, '(nothing to sell)', COL.dim, 9);
      push(t); y += t.height + 2;
    } else {
      for (const slot of inv.items) {
        const item = (itemsData as any)[slot.itemId];
        if (!item || item.type === 'key_item') continue;
        const sellPrice = Math.max(1, Math.floor((item.value ?? 0) / 2));
        const label = `${item.name} x${slot.quantity} → ${sellPrice}g`;
        const t = this.invText(px + PAD + 4, y, label, COL.text, 9);
        push(t);
        const id = slot.itemId;
        const zone = this.add.zone(px + panelW / 2, y + t.height / 2, panelW - PAD * 2, t.height + 2)
          .setDepth(35).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.sellItem(id, sellPrice));
        this.clickZones.push(zone);
        y += t.height + 2;
      }
    }
    y += 8;

    const tc = this.invText(px + panelW / 2, y, '[ Close ]', COL.title, 10);
    tc.setOrigin(0.5, 0); push(tc);
    this.addZone(y, tc.height + 4, () => { this.mode = 'idle'; this.clearActions(); this.renderBottomBar(); });
  }

  private buyItem(itemId: string, price: number): void {
    const inv = this.worldScene.inventory;
    if (inv.gold < price) return;
    inv.gold -= price;
    this.worldScene.run.gold = inv.gold;
    inv.addItem(itemId);
    AudioManager.getInstance().playItemPickup();
    const item = (itemsData as any)[itemId];
    this.addMessage(`Bought ${item?.name ?? itemId}.`, '#66dd66');
    this.worldScene.saveRun();
    this.renderShop();
    this.renderStats();
  }

  private sellItem(itemId: string, sellPrice: number): void {
    const inv = this.worldScene.inventory;
    inv.removeItem(itemId);
    inv.gold += sellPrice;
    this.worldScene.run.gold = inv.gold;
    AudioManager.getInstance().playSelect();
    const item = (itemsData as any)[itemId];
    this.addMessage(`Sold ${item?.name ?? itemId} for ${sellPrice}g.`, '#ddaa00');
    this.worldScene.saveRun();
    this.renderShop();
    this.renderStats();
  }

  // ══════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════

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
    this.overlayBg = undefined;
  }

  private mkText(x: number, y: number, str: string, color: number, size = 9): Phaser.GameObjects.Text {
    return this.add.text(x, y, str, {
      fontSize: `${size}px`,
      color: Phaser.Display.Color.ValueToColor(color).rgba,
      fontFamily: 'monospace',
    }).setDepth(16).setOrigin(0, 0.5);
  }

  private invText(x: number, y: number, str: string, color: number, size = 9): Phaser.GameObjects.Text {
    return this.add.text(x, y, str, {
      fontSize: `${size}px`,
      color: Phaser.Display.Color.ValueToColor(color).rgba,
      fontFamily: 'monospace',
      wordWrap: { width: 340, useAdvancedWrap: true },
    }).setDepth(32);
  }

  private addZone(y: number, h: number, cb: () => void): void {
    const z = this.add.zone(GAME_WIDTH / 2, y + h / 2, GAME_WIDTH, h)
      .setDepth(35).setInteractive({ useHandCursor: true });
    z.on('pointerdown', cb);
    this.clickZones.push(z);
  }
}
