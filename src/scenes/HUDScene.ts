import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TYPEWRITER_SPEED, LOG_FADE_MS } from '../config';
import { CombatSystem, Combatant, CombatAction } from '../systems/CombatSystem';
import { DialogSystem, DialogTree } from '../systems/DialogSystem';
import { Visibility } from '../systems/FogOfWar';
import { WorldScene } from './WorldScene';
import { VirtualPad } from '../ui/VirtualPad';
import { AudioManager } from '../systems/AudioManager';
import skillsData from '../data/skills.json';
import itemsData from '../data/items.json';
import dialogData from '../data/dialogs/village.json';
import shopsData from '../data/shops.json';
import questsData from '../data/quests.json';

type PanelMode = 'idle' | 'dialog' | 'combat' | 'inventory' | 'shop' | 'travel';

const PAD = 8;
const TOP_H = 26;      // top stats bar height
const BTN_H = 28;      // bottom toolbar height
const LOG_MAX = 3;      // max visible log messages
const LOG_LINE_H = 18;  // log line height
const ACTION_H = 180;   // expanded action area (combat/dialog)

const COL = {
  text: 0xdddddd, dim: 0x999999, hp: 0x44cc44, mp: 0x4488ff,
  gold: 0xddaa00, dmg: 0xff4444, heal: 0x44dd44, title: 0xffcc44,
  bar_bg: 0x222222, overlay: 0x000000,
};

const BUFF_ICONS: Record<string, { char: string; col: number; label: string }> = {
  poison:  { char: 'P', col: 0x66cc66, label: 'Poison' },
  burn:    { char: 'B', col: 0xff8800, label: 'Burn' },
  freeze:  { char: 'F', col: 0x88ccff, label: 'Freeze' },
  stun:    { char: 'S', col: 0xffcc00, label: 'Stun' },
  defense: { char: 'D', col: 0x88aaff, label: 'Defense' },
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
  private minimapGfx?: Phaser.GameObjects.Graphics;
  private minimapVisible = true;
  private shopTab: 'buy' | 'sell' = 'buy';
  private scrollOffset = 0;
  private combatSubmenu: null | 'skills' | 'items' = null;
  private buffZones: Phaser.GameObjects.Zone[] = [];
  private quickSlots: (string | null)[] = [null, null, null];
  private invTab: 'equip' | 'items' | 'stats' | 'quest' = 'equip';
  private currentShopId = 'brynn_shop';

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

  private isTouch = false;

  constructor() { super({ key: 'HUDScene' }); }
  init(data: { worldScene: WorldScene }) { this.worldScene = data.worldScene; }

  create(): void {
    this.isTouch = this.worldScene.inputManager?.isTouchDevice ?? false;
    // HUD camera covers full screen, no scroll
    this.cameras.main.setViewport(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.combat.setEventCallback((e, d) => this.onCombatEvent(e, d));
    this.dialog.setActionCallback((a) => this.worldScene.onDialogAction(a));
    this.renderStats();
    this.renderBottomBar();

    // Create virtual pad for touch devices
    if (this.isTouch) {
      this.virtualPad = new VirtualPad(this, this.worldScene.inputManager);
      this.virtualPad.onInventory = () => {
        if (this.mode === 'idle') this.showInventory();
      };
    }
  }

  /** Responsive font size — bigger on touch devices */
  private fs(base: number): number { return this.isTouch ? base + 3 : base; }

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

  showLevelUpBanner(level: number): void {
    const banner = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, `LEVEL UP! Lv${level}`, {
      fontSize: '24px', color: '#ffcc44', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setDepth(99).setOrigin(0.5).setAlpha(0);
    this.tweens.add({
      targets: banner, alpha: 1, y: GAME_HEIGHT / 2 - 60, duration: 400, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: banner, alpha: 0, y: GAME_HEIGHT / 2 - 90, duration: 800, delay: 1200, ease: 'Power2',
          onComplete: () => banner.destroy(),
        });
      },
    });
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
    this.autoFillQuickSlots();
    const run = this.worldScene.run, char = this.worldScene.character;
    // Apply equipment stat modifiers to combat stats
    const eqMods = this.worldScene.inventory.getEquipmentStatModifiers();
    const combatStats = {
      attack: run.stats.attack + (eqMods.attack ?? 0),
      defense: run.stats.defense + (eqMods.defense ?? 0),
      speed: run.stats.speed + (eqMods.speed ?? 0),
      magic: run.stats.magic + (eqMods.magic ?? 0),
    };
    const player: Combatant = {
      id: char.name, name: char.name, isPlayer: true,
      hp: run.hp, maxHp: run.maxHp, mp: run.mp, maxMp: run.maxMp,
      stats: combatStats, skills: [...char.learnedSkills], buffs: [], statusEffects: [],
    };
    const foes: Combatant[] = enemies.map((e: any, i: number) => ({
      id: e.id + '_' + i, name: e.name, isPlayer: false,
      hp: e.stats.hp, maxHp: e.stats.hp, mp: e.stats.mp ?? 0, maxMp: e.stats.mp ?? 0,
      stats: { attack: e.stats.attack, defense: e.stats.defense, speed: e.stats.speed, magic: e.stats.magic ?? 0 },
      skills: e.skills ?? [], ai: e.ai, buffs: [], statusEffects: [],
      loot: e.loot, xpReward: e.xpReward, goldReward: e.goldReward,
      spriteKey: e.spriteKey,
      weakness: e.weakness, resistance: e.resistance,
    }));
    this.mode = 'combat';
    this.combatSubmenu = null;
    this.addMessage(`--- ${foes.map(f => f.name).join(', ')} appeared! ---`, '#ff8844');
    this.combat.startCombat([player], foes);
  }

  showInventory(): void { this.mode = 'inventory'; this.scrollOffset = 0; this.invTab = 'equip'; this.renderInventory(); }
  showShop(shopId?: string): void { this.endDialog(); this.currentShopId = shopId || 'brynn_shop'; this.mode = 'shop'; this.scrollOffset = 0; this.shopTab = 'buy'; this.renderShop(); }

  showFastTravel(): void {
    this.mode = 'travel';
    this.clearActions();
    const waypoints = this.worldScene.getDiscoveredWaypoints();

    this.overlayBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COL.overlay, 0.7).setDepth(30);
    this.actionObjs.push(this.overlayBg);

    const panelW = 260, panelH = 40 + waypoints.length * 28 + 36;
    const px = (GAME_WIDTH - panelW) / 2;
    const py = (GAME_HEIGHT - panelH) / 2;
    this.actionObjs.push(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH, 0x1a1a2e, 0.95).setDepth(31));
    this.actionObjs.push(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH).setStrokeStyle(1, 0x444466).setDepth(31));

    const push = (o: Phaser.GameObjects.GameObject) => { this.actionObjs.push(o); };
    const szBody = this.fs(10);
    const rowH = 28;
    let y = py + PAD;

    push(this.invText(px + PAD, y, 'FAST TRAVEL', COL.title, this.fs(11)));
    y += this.fs(11) + 10;

    for (const wp of waypoints) {
      push(this.invText(px + PAD + 4, y, `> ${wp.name}`, COL.text, szBody));
      const id = wp.id;
      const z = this.add.zone(px + panelW / 2, y + rowH / 2, panelW - PAD * 2, rowH)
        .setDepth(35).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        this.mode = 'idle';
        this.clearActions();
        this.renderBottomBar();
        this.worldScene.fastTravelTo(id);
      });
      this.clickZones.push(z);
      y += rowH;
    }

    y += 4;
    const tc = this.invText(px + panelW / 2, y, '[ Cancel ]', COL.title, this.fs(10));
    tc.setOrigin(0.5, 0); push(tc);
    const cz = this.add.zone(px + panelW / 2, y + 10, panelW - PAD * 2, 24)
      .setDepth(35).setInteractive({ useHandCursor: true });
    cz.on('pointerdown', () => { this.mode = 'idle'; this.clearActions(); this.renderBottomBar(); });
    this.clickZones.push(cz);
  }

  // ══════════════════════════════════════
  //  QUICK SLOTS
  // ══════════════════════════════════════

  private autoFillQuickSlots(): void {
    const inv = this.worldScene.inventory;
    const consumables = inv.items
      .filter(s => (itemsData as any)[s.itemId]?.type === 'consumable')
      .map(s => s.itemId);
    for (let i = 0; i < 3; i++) {
      // Keep current slot if item still exists in inventory
      if (this.quickSlots[i] && consumables.includes(this.quickSlots[i]!)) continue;
      // Fill with next unslotted consumable
      const used = this.quickSlots.filter(Boolean) as string[];
      const next = consumables.find(id => !used.includes(id));
      this.quickSlots[i] = next ?? null;
    }
  }

  private renderQuickSlots(y: number, inCombat: boolean): number {
    const inv = this.worldScene.inventory;
    this.autoFillQuickSlots();
    const slotW = 80;
    const slotH = 22;
    const gap = 4;
    const totalW = slotW * 3 + gap * 2;
    let sx = (GAME_WIDTH - totalW) / 2;

    for (let i = 0; i < 3; i++) {
      const itemId = this.quickSlots[i];
      const item = itemId ? (itemsData as any)[itemId] : null;
      const qty = itemId ? inv.getItemCount(itemId) : 0;
      const hasItem = item && qty > 0;

      // Slot background
      const bg = this.add.rectangle(sx + slotW / 2, y + slotH / 2, slotW, slotH, 0x1a1a2e, 0.8)
        .setStrokeStyle(1, hasItem ? 0x444466 : 0x333344).setDepth(16);
      this.actionObjs.push(bg);

      if (hasItem) {
        // Abbreviated name + quantity
        const abbr = item.name.length > 7 ? item.name.slice(0, 7) : item.name;
        const t = this.mkText(sx + 4, y + slotH / 2, `${abbr} x${qty}`, COL.text, 8);
        this.actionObjs.push(t);

        const id = itemId!;
        const z = this.add.zone(sx + slotW / 2, y + slotH / 2, slotW, slotH)
          .setDepth(35).setInteractive({ useHandCursor: true });
        z.on('pointerdown', () => {
          if (inCombat) {
            this.submitCombatAction({ type: 'item', itemId: id });
          } else {
            this.useConsumable(id);
            this.autoFillQuickSlots();
            this.renderBottomBar();
          }
        });
        this.clickZones.push(z);
      } else {
        const t = this.mkText(sx + 4, y + slotH / 2, '(empty)', COL.dim, 8);
        this.actionObjs.push(t);
      }

      sx += slotW + gap;
    }

    return y + slotH + 2;
  }

  // ══════════════════════════════════════
  //  STATS BAR (top overlay)
  // ══════════════════════════════════════

  private renderStats(): void {
    this.clearGroup(this.statsObjs);
    for (const z of this.buffZones) z.destroy();
    this.buffZones.length = 0;
    if (this.minimapGfx) { this.minimapGfx.destroy(); this.minimapGfx = undefined; }
    const run = this.worldScene?.run;
    const char = this.worldScene?.character;
    if (!run || !char) return;

    const bg = this.add.rectangle(GAME_WIDTH / 2, TOP_H / 2, GAME_WIDTH, TOP_H, COL.overlay, 0.7).setDepth(10);
    this.statsObjs.push(bg);

    let x = PAD;
    const cy = TOP_H / 2;

    const name = this.mkText(x, cy, `${char.name} Lv${char.level}`, COL.title, this.fs(9));
    this.statsObjs.push(name); x += name.width + 8;

    x = this.drawBar(x, cy, 'HP', run.hp, run.maxHp, COL.hp, 70);
    x += 6;
    x = this.drawBar(x, cy, 'MP', run.mp, run.maxMp, COL.mp, 50);
    x += 4;
    x = this.renderBuffIcons(x, cy);

    // Right side: Floor, XP, Gold (right-aligned)
    let rx = GAME_WIDTH - PAD;
    const goldTxt = this.mkText(0, cy, `${run.gold ?? 0}g`, COL.gold, this.fs(9));
    rx -= goldTxt.width; goldTxt.setX(rx); this.statsObjs.push(goldTxt); rx -= 6;

    const nextLvlXp = WorldScene.xpForLevel(char.level + 1);
    const xpTxt = this.mkText(0, cy, `XP:${char.xp}/${nextLvlXp}`, COL.dim, this.fs(8));
    rx -= xpTxt.width; xpTxt.setX(rx); this.statsObjs.push(xpTxt); rx -= 6;

    if (run.dungeonFloor > 0) {
      const floorTxt = this.mkText(0, cy, `F${run.dungeonFloor}`, COL.dim, this.fs(8));
      rx -= floorTxt.width; floorTxt.setX(rx); this.statsObjs.push(floorTxt); rx -= 6;
    }

    const LOC_NAMES: Record<string, string> = {
      village: 'Village', forest: 'Woods',
      cave_floor1: 'Cave', cave_floor2: 'Cave', cave_floor3: 'Cave', cave_boss: 'Boss Lair',
    };
    const locName = LOC_NAMES[run.currentMap] || '';
    if (locName) {
      const locTxt = this.mkText(0, cy, locName, 0x88aacc, this.fs(8));
      rx -= locTxt.width; locTxt.setX(rx); this.statsObjs.push(locTxt);
    }

    if (this.minimapVisible && this.mode === 'idle') this.renderMinimap();
  }

  private renderMinimap(): void {
    if (this.minimapGfx) this.minimapGfx.destroy();
    const data = this.worldScene.getMinimapData();
    if (!data) return;

    const MAX_SIZE = 90;
    const scale = Math.min(MAX_SIZE / data.w, MAX_SIZE / data.h, 2);
    const mmW = Math.ceil(data.w * scale);
    const mmH = Math.ceil(data.h * scale);
    const ox = GAME_WIDTH - mmW - PAD;
    const oy = TOP_H + PAD;

    const g = this.add.graphics().setDepth(40);
    // Background
    g.fillStyle(0x000000, 0.6);
    g.fillRect(ox - 2, oy - 2, mmW + 4, mmH + 4);

    const MINI_COLORS: Record<number, number> = {
      0: 0x4a8c3f, 1: 0xc8a96e, 2: 0x555555, 3: 0x8b7355, 4: 0x3366aa,
      5: 0x2d6e1e, 6: 0x8b4513, 7: 0xcccc00, 8: 0x00cccc, 9: 0xdd8800,
      10: 0x886644, 11: 0xaa3333, 12: 0x553311,
    };

    for (let y = 0; y < data.h; y++) {
      for (let x = 0; x < data.w; x++) {
        const vis = data.fog.getVisibility(x, y);
        if (vis === Visibility.UNSEEN) continue;
        const tile = data.tiles[y]?.[x] ?? 0;
        const c = MINI_COLORS[tile] ?? 0x333333;
        const alpha = vis === Visibility.VISIBLE ? 0.9 : 0.4;
        g.fillStyle(c, alpha);
        g.fillRect(ox + x * scale, oy + y * scale, Math.max(scale, 1), Math.max(scale, 1));
      }
    }

    // Player dot
    g.fillStyle(0xffffff, 1);
    const ps = Math.max(scale + 1, 2);
    g.fillRect(ox + data.px * scale - ps / 4, oy + data.py * scale - ps / 4, ps, ps);

    this.minimapGfx = g;
  }

  private renderBuffIcons(x: number, cy: number): number {
    if (this.mode !== 'combat') return x;
    const player = this.combat.party[0];
    if (!player) return x;

    // Show status effects
    for (const se of player.statusEffects ?? []) {
      const icon = BUFF_ICONS[se.id];
      if (!icon) continue;
      const t = this.mkText(x, cy, icon.char, icon.col, 9);
      t.setFontStyle('bold');
      this.statsObjs.push(t);
      // Tap zone for tooltip
      const zx = x + t.width / 2;
      const z = this.add.zone(zx, cy, t.width + 6, TOP_H)
        .setDepth(25).setInteractive({ useHandCursor: true });
      const turns = se.turnsLeft;
      const label = icon.label;
      z.on('pointerdown', () => this.showBuffTooltip(zx, TOP_H + 2, `${label} (${turns}t)`));
      this.buffZones.push(z);
      x += t.width + 3;
    }

    // Show active buffs (non-status, e.g. Defend)
    for (const buff of player.buffs ?? []) {
      const key = buff.stat === 'defense' ? 'defense' : buff.stat;
      const icon = BUFF_ICONS[key];
      if (!icon) {
        // Generic buff icon for unknown stat buffs
        const t = this.mkText(x, cy, '+', 0x88aaff, 9);
        t.setFontStyle('bold');
        this.statsObjs.push(t);
        x += t.width + 3;
        continue;
      }
      const t = this.mkText(x, cy, icon.char, icon.col, 9);
      t.setFontStyle('bold');
      this.statsObjs.push(t);
      const zx = x + t.width / 2;
      const z = this.add.zone(zx, cy, t.width + 6, TOP_H)
        .setDepth(25).setInteractive({ useHandCursor: true });
      const turns = buff.turnsLeft;
      const label = icon.label;
      z.on('pointerdown', () => this.showBuffTooltip(zx, TOP_H + 2, `${label} x${buff.multiplier} (${turns}t)`));
      this.buffZones.push(z);
      x += t.width + 3;
    }

    return x;
  }

  private showBuffTooltip(x: number, y: number, text: string): void {
    const bg = this.add.rectangle(x, y + 8, 0, 16, COL.overlay, 0.85).setDepth(50).setOrigin(0.5, 0.5);
    const t = this.add.text(x, y + 8, text, {
      fontSize: '9px', color: '#dddddd', fontFamily: 'monospace',
    }).setDepth(51).setOrigin(0.5, 0.5);
    bg.width = t.width + 8;
    this.tweens.add({
      targets: [bg, t], alpha: 0, delay: 1500, duration: 400,
      onComplete: () => { bg.destroy(); t.destroy(); },
    });
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
      fontSize: `${this.fs(10)}px`, color: Phaser.Display.Color.ValueToColor(hexStr(color)).rgba,
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
    return GAME_HEIGHT - BTN_H - 26; // account for quick slots row
  }

  // ══════════════════════════════════════
  //  BOTTOM TOOLBAR (idle state)
  // ══════════════════════════════════════

  private renderBottomBar(): void {
    this.clearActions();
    if (this.mode !== 'idle') return;

    // Quick slots row above bottom bar
    const qsY = GAME_HEIGHT - BTN_H - 26;
    this.renderQuickSlots(qsY, false);

    const y = GAME_HEIGHT - BTN_H;
    const bg = this.add.rectangle(GAME_WIDTH / 2, y + BTN_H / 2, GAME_WIDTH, BTN_H, COL.overlay, 0.7).setDepth(10);
    this.actionObjs.push(bg);

    // Buttons
    let bx = PAD;
    bx = this.addButton(bx, y + 4, 'Inventory', COL.title, () => this.showInventory());
    bx = this.addButton(bx + 12, y + 4, 'Interact', COL.dim, () => {
      // Trigger interact from touch
      if (this.worldScene.inputManager) this.worldScene.inputManager.setPadAction(true);
      this.time.delayedCall(50, () => { if (this.worldScene.inputManager) this.worldScene.inputManager.setPadAction(false); });
    });
    bx = this.addButton(bx + 12, y + 4, 'Map', this.minimapVisible ? COL.title : COL.dim, () => {
      this.minimapVisible = !this.minimapVisible;
      if (!this.minimapVisible && this.minimapGfx) { this.minimapGfx.destroy(); this.minimapGfx = undefined; }
      else this.renderStats();
      this.renderBottomBar();
    });
    const waypoints = this.worldScene.getDiscoveredWaypoints();
    if (waypoints.length > 0) {
      bx = this.addButton(bx + 12, y + 4, 'Travel', COL.dim, () => this.showFastTravel());
    }

    // Mute toggle (right-aligned)
    const audio = AudioManager.getInstance();
    const muteLabel = audio.isMuted ? '\u266A off' : '\u266A on';
    const muteColor = audio.isMuted ? COL.dim : COL.title;
    const sz = this.fs(10);
    const mt = this.mkText(0, y + 12, muteLabel, muteColor, sz);
    mt.setX(GAME_WIDTH - mt.width - PAD);
    this.actionObjs.push(mt);
    const mz = this.add.zone(mt.x + mt.width / 2, y + 8, mt.width + 12, BTN_H)
      .setDepth(25).setInteractive({ useHandCursor: true });
    mz.on('pointerdown', () => { audio.toggleMute(); this.renderBottomBar(); });
    this.clickZones.push(mz);
  }

  private addButton(x: number, y: number, label: string, color: number, cb: () => void): number {
    const sz = this.fs(10);
    const t = this.mkText(x, y + 8, label, color, sz);
    this.actionObjs.push(t);
    const z = this.add.zone(x + t.width / 2, y + 8, t.width + 8, BTN_H)
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
    const speaker = this.mkText(PAD, y, `[${node.speaker}]`, COL.title, this.fs(10));
    this.actionObjs.push(speaker);
    y += speaker.height + 4;

    this.fullDialogText = node.text;
    this.displayedChars = 0;
    this.dialogChoicesRendered = false;
    this.dialogTextObj = this.add.text(PAD, y, '', {
      fontSize: `${this.fs(10)}px`, color: '#dddddd', fontFamily: 'monospace',
      wordWrap: { width: GAME_WIDTH - PAD * 2, useAdvancedWrap: true },
      maxLines: 4,
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
    for (const z of this.clickZones) z.destroy();
    this.clickZones.length = 0;
    const node = this.dialog.currentNode;
    if (!node) return;
    const textH = this.dialogTextObj ? this.dialogTextObj.height : 14;
    const areaTop = GAME_HEIGHT - ACTION_H;
    const choiceRowH = Math.max(this.fs(10) + 6, 24);
    const rawY = areaTop + PAD + 16 + textH + 6;

    if (node.choices?.length) {
      const maxY = GAME_HEIGHT - node.choices.length * choiceRowH - PAD;
      let y = Math.min(rawY, maxY);
      for (let i = 0; i < node.choices.length; i++) {
        const t = this.mkText(PAD + 4, y, `> ${node.choices[i].text}`, COL.title, this.fs(10));
        this.actionObjs.push(t);
        const idx = i;
        this.addZone(y - 2, choiceRowH, () => this.dialogChoose(idx));
        y += choiceRowH;
      }
    } else {
      const y = Math.min(rawY, GAME_HEIGHT - choiceRowH - PAD);
      const t = this.mkText(PAD + 4, y, '[Tap to continue]', COL.dim, this.fs(10));
      this.actionObjs.push(t);
      this.addZone(areaTop, ACTION_H, () => this.dialogAdvance());
    }
  }

  /** Public entry point: skip typewriter, then advance or pick first choice. */
  advanceDialog(): void {
    if (this.mode !== 'dialog') return;
    // If typewriter still running, finish it first
    if (this.displayedChars < this.fullDialogText.length) {
      this.displayedChars = this.fullDialogText.length;
      if (this.dialogTextObj) this.dialogTextObj.setText(this.fullDialogText);
      if (this.typewriterTimer) { this.typewriterTimer.destroy(); this.typewriterTimer = undefined; }
      if (!this.dialogChoicesRendered) { this.dialogChoicesRendered = true; this.renderDialogChoices(); }
      return;
    }
    // Choices visible → pick first; otherwise advance
    const node = this.dialog.currentNode;
    if (node?.choices?.length) this.dialogChoose(0);
    else this.dialogAdvance();
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

  /** Public: close dialog from outside (e.g. clicking away). */
  endDialogPublic(): void { if (this.mode === 'dialog') this.endDialog(); }

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
    y = this.renderEnemyStatus(y);
    y += 2;
    y = this.renderQuickSlots(y, true);
    y += 2;

    if (this.combatSubmenu === null) {
      const p = this.combat.party[0];
      const hasSkills = p && p.skills.length > 0;
      const hasItems = this.worldScene.inventory.items.some(s => (itemsData as any)[s.itemId]?.type === 'consumable');
      const actions: { label: string; cb: () => void; dim?: boolean }[] = [
        { label: 'Attack', cb: () => this.submitCombatAction({ type: 'attack', targetIndex: 0 }) },
      ];
      if (hasSkills) actions.push({ label: 'Skills \u25B6', cb: () => { this.combatSubmenu = 'skills'; this.renderCombatActions(); } });
      if (hasItems) actions.push({ label: 'Items \u25B6', cb: () => { this.combatSubmenu = 'items'; this.renderCombatActions(); } });
      actions.push({ label: 'Defend', cb: () => this.submitCombatAction({ type: 'defend' }) });
      if (!this.isBoss) actions.push({ label: 'Flee', cb: () => this.submitCombatAction({ type: 'flee' }) });
      this.renderCombatButtonGrid(y, actions);
    } else if (this.combatSubmenu === 'skills') {
      const p = this.combat.party[0];
      const actions: { label: string; cb: () => void; dim?: boolean }[] = [];
      if (p) {
        for (const sid of p.skills) {
          const sk = (skillsData as any)[sid];
          if (sk) {
            const canUse = p.mp >= sk.mpCost;
            actions.push({
              label: `${sk.name} ${sk.mpCost}MP`,
              cb: canUse ? () => this.submitCombatAction({ type: 'skill', skillId: sid, targetIndex: 0 }) : () => {},
              dim: !canUse,
            });
          }
        }
      }
      actions.push({ label: '\u25C0 Back', cb: () => { this.combatSubmenu = null; this.renderCombatActions(); } });
      this.renderCombatButtonGrid(y, actions);
    } else {
      const actions: { label: string; cb: () => void; dim?: boolean }[] = [];
      for (const slot of this.worldScene.inventory.items) {
        const item = (itemsData as any)[slot.itemId];
        if (item?.type === 'consumable') {
          const id = slot.itemId;
          actions.push({ label: `${item.name} x${slot.quantity}`, cb: () => this.submitCombatAction({ type: 'item', itemId: id }) });
        }
      }
      actions.push({ label: '\u25C0 Back', cb: () => { this.combatSubmenu = null; this.renderCombatActions(); } });
      this.renderCombatButtonGrid(y, actions);
    }
  }

  private renderEnemyStatus(y: number): number {
    const fontSize = this.fs(8);
    for (const e of this.combat.enemies) {
      const col = e.hp > 0 ? COL.hp : COL.dim;
      if (e.spriteKey && this.textures.exists(e.spriteKey)) {
        const icon = this.add.image(PAD + 8, y + 5, e.spriteKey).setDepth(16).setScale(1);
        if (e.hp <= 0) icon.setAlpha(0.4);
        this.actionObjs.push(icon);
      }
      const statusStr = (e.statusEffects ?? []).map((s: any) => s.id[0].toUpperCase()).join('');
      const statusSuffix = statusStr ? ` [${statusStr}]` : '';
      const t = this.mkText(PAD + 18, y + 5, `${e.name} ${Math.max(0, e.hp)}/${e.maxHp}${statusSuffix}`, col, fontSize);
      this.actionObjs.push(t);

      // Enemy intent indicator
      const intentInfo = this.combat.enemyIntents.get(e.id);
      if (intentInfo && e.hp > 0) {
        const display = this.isBoss ? this.categorizeIntent(intentInfo.description) : intentInfo.description;
        const it = this.mkText(PAD + 18 + t.width + 8, y + 5, `\u2192 ${display}`, 0xff9966, fontSize - 1);
        this.actionObjs.push(it);
      }

      y += fontSize + 6;
    }
    return y;
  }

  private categorizeIntent(intent: string): string {
    if (intent === 'Attack') return 'Physical';
    if (intent === 'Defend') return 'Defending';
    for (const [, data] of Object.entries(skillsData as any)) {
      if ((data as any).name === intent) {
        if ((data as any).type === 'magic') return 'Magic';
        if ((data as any).type === 'buff') return 'Defensive';
        return 'Physical';
      }
    }
    return intent;
  }

  private renderCombatButtonGrid(y: number, actions: { label: string; cb: () => void; dim?: boolean }[]): void {
    const colW = (GAME_WIDTH - PAD * 2) / 2;
    const btnFontSize = this.fs(9);
    const btnRowH = Math.max(btnFontSize + 8, 22);
    let col = 0;
    for (const a of actions) {
      const ax = PAD + (col * colW) + 4;
      const t = this.mkText(ax, y + btnRowH / 2, `> ${a.label}`, a.dim ? COL.dim : COL.title, btnFontSize);
      this.actionObjs.push(t);
      if (!a.dim) {
        const zx = PAD + col * colW + colW / 2;
        const z = this.add.zone(zx, y + btnRowH / 2, colW, btnRowH)
          .setDepth(35).setInteractive({ useHandCursor: true });
        z.on('pointerdown', a.cb);
        this.clickZones.push(z);
      }
      col++;
      if (col >= 2) { col = 0; y += btnRowH; }
    }
  }

  private submitCombatAction(action: CombatAction): void {
    this.combatSubmenu = null;
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
      if (result.weaknessHit) msg += ' (Weakness!)';
      if (result.resistanceHit) msg += ' (Resisted)';
      color = result.weaknessHit ? '#ff9900' : '#ff6666';
      // Play element/skill-specific SFX, else generic hit
      if (result.element === 'fire') audio.playFire();
      else if (result.element === 'ice') audio.playIce();
      else if (result.element === 'lightning') audio.playThunder();
      else if (result.skillName === 'Shield Bash') audio.playShieldBash();
      else if (result.skillName === 'Backstab') audio.playBackstab();
      else if (result.skillName === 'Bomb') audio.playExplosion();
      else if (result.critical) audio.playCriticalHit();
      else audio.playAttackHit();
      this.cameras.main.shake(result.critical ? 150 : 60, result.critical ? 0.012 : 0.005);
      this.showFloatingNumber(result.value, result.critical ? '#ffff00' : '#ff4444', result.critical);
      if (result.appliedStatus) {
        this.addMessage(`${result.target} is ${result.appliedStatus}!`, '#cc66ff');
        if (result.appliedStatus === 'poison') audio.playPoisonTick();
        else if (result.appliedStatus === 'burn') audio.playBurnTick();
        else if (result.appliedStatus === 'freeze') audio.playFreeze();
        else if (result.appliedStatus === 'stun') audio.playStun();
      }
    } else if (result.type === 'heal') {
      msg = result.skillName ? `${result.skillName}: +${result.value} HP to ${result.target}` : `${result.target} heals ${result.value} HP`;
      color = '#66dd66';
      if (result.skillName === 'Antidote') audio.playStatusCure();
      else audio.playHeal();
      if (result.value > 0) this.showFloatingNumber(result.value, '#44ff44', false);
    } else if (result.type === 'buff') { msg = `${result.actor} uses ${result.skillName}!`; color = '#88aaff'; audio.playSelect(); }
    else if (result.type === 'miss') { msg = `${result.actor}'s attack missed!`; color = '#888888'; audio.playMiss(); }
    else if (result.type === 'flee_fail') { msg = 'Failed to escape!'; color = '#cc8844'; audio.playMiss(); }
    else if (result.type === 'status_tick') {
      msg = `${result.actor} takes ${result.value} ${result.skillName} damage!`;
      color = '#cc66ff';
      if (result.skillName === 'Poisoned') audio.playPoisonTick();
      else if (result.skillName === 'Burning') audio.playBurnTick();
      this.cameras.main.flash(100, 80, 30, 80, true);
      if (result.value > 0) this.showFloatingNumber(result.value, '#cc66ff', false);
    } else if (result.type === 'status_skip') {
      msg = `${result.actor} is ${result.skillName}! Can't move!`;
      color = '#8888cc';
      if (result.skillName === 'Frozen') audio.playFreeze();
      else if (result.skillName === 'Stunned') audio.playStun();
    }
    this.addMessage(msg, color);
    this.renderStats();

    this.clearActions();
    const areaTop = GAME_HEIGHT - ACTION_H;
    const bg = this.add.rectangle(GAME_WIDTH / 2, areaTop + ACTION_H / 2, GAME_WIDTH, ACTION_H, COL.overlay, 0.85).setDepth(15);
    this.actionObjs.push(bg);

    let y = areaTop + PAD;
    y = this.renderEnemyStatus(y);
    y += 4;
    const tc = this.mkText(PAD + 4, y, '[Tap to continue]', COL.dim, this.fs(10));
    this.actionObjs.push(tc);
    this.addZone(areaTop, ACTION_H, () => this.combat.advanceFromAnimate());
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
    this.autoFillQuickSlots();
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
    const t1 = this.mkText(GAME_WIDTH / 2, y, 'You have fallen...', COL.dmg, this.fs(13));
    t1.setOrigin(0.5, 0); this.actionObjs.push(t1); y += t1.height + 8;
    const t2 = this.mkText(GAME_WIDTH / 2, y, '[Tap to continue]', COL.dim, this.fs(10));
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
    const run = this.worldScene.run;
    const char = this.worldScene.character;

    this.overlayBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COL.overlay, 0.7).setDepth(30);
    this.actionObjs.push(this.overlayBg);

    const panelW = 360, panelH = 380;
    const px = (GAME_WIDTH - panelW) / 2;
    const py = (GAME_HEIGHT - panelH) / 2;
    this.actionObjs.push(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH, 0x1a1a2e, 0.95).setDepth(31));
    this.actionObjs.push(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH).setStrokeStyle(1, 0x444466).setDepth(31));

    const push = (o: Phaser.GameObjects.GameObject) => { this.actionObjs.push(o); };
    const szBody = this.fs(9);
    const rowH = Math.max(szBody + 6, 18);
    let y = py + PAD;

    // Title + gold
    push(this.invText(px + PAD, y, 'INVENTORY', COL.title, this.fs(11)));
    const gt = this.invText(px + panelW - PAD, y, `${inv.gold}g`, COL.gold, this.fs(11));
    gt.setOrigin(1, 0); push(gt);
    y += this.fs(11) + 6;

    // Tab buttons
    const tabs: { key: 'equip' | 'items' | 'stats' | 'quest'; label: string }[] = [
      { key: 'equip', label: 'Equip' },
      { key: 'items', label: 'Items' },
      { key: 'stats', label: 'Stats' },
      { key: 'quest', label: 'Quest' },
    ];
    let tabX = px + PAD;
    for (const tab of tabs) {
      const active = this.invTab === tab.key;
      const tl = this.invText(tabX, y, active ? `[${tab.label}]` : ` ${tab.label} `, active ? COL.title : COL.dim, szBody);
      push(tl);
      const tz = this.add.zone(tabX + tl.width / 2, y + tl.height / 2, tl.width + 12, rowH)
        .setDepth(35).setInteractive({ useHandCursor: true });
      const k = tab.key;
      tz.on('pointerdown', () => { if (this.invTab !== k) { this.invTab = k; this.scrollOffset = 0; this.renderInventory(); } });
      this.clickZones.push(tz);
      tabX += tl.width + 12;
    }
    y += rowH + 2;

    // Divider
    const dg = this.add.graphics().setDepth(32);
    dg.lineStyle(1, 0x444466, 0.5);
    dg.lineBetween(px + PAD, y, px + panelW - PAD, y);
    push(dg); y += 4;

    const closeH = 26;
    const listBottom = py + panelH - PAD - closeH;
    const maxRows = Math.floor((listBottom - y) / rowH);

    if (this.invTab === 'equip') {
      this.renderEquipTab(px, y, panelW, rowH, szBody, maxRows, push);
    } else if (this.invTab === 'items') {
      this.renderItemsTab(px, y, panelW, rowH, szBody, maxRows, push);
    } else if (this.invTab === 'quest') {
      this.renderQuestsTab(px, y, panelW, rowH, szBody, push);
    } else {
      this.renderStatsTab(px, y, panelW, szBody, push);
    }

    // Close button at fixed bottom
    const closeY = py + panelH - PAD - 12;
    const tc = this.invText(px + panelW / 2, closeY, '[ Close ]', COL.title, this.fs(10));
    tc.setOrigin(0.5, 0); push(tc);
    const cz = this.add.zone(px + panelW / 2, closeY + 10, panelW - PAD * 2, 24)
      .setDepth(35).setInteractive({ useHandCursor: true });
    cz.on('pointerdown', () => { this.mode = 'idle'; this.scrollOffset = 0; this.clearActions(); this.autoFillQuickSlots(); this.renderBottomBar(); });
    this.clickZones.push(cz);
  }

  private renderEquipTab(px: number, y: number, panelW: number, rowH: number, szBody: number, maxRows: number, push: (o: Phaser.GameObjects.GameObject) => void): void {
    const inv = this.worldScene.inventory;
    const run = this.worldScene.run;
    const eqMods = inv.getEquipmentStatModifiers();

    // Current equipment slots
    for (const slot of ['weapon', 'armor', 'accessory'] as const) {
      const id = inv.equipment[slot];
      const name = id ? ((itemsData as any)[id]?.name ?? id) : '\u2014';
      push(this.invText(px + PAD + 2, y, `${slot[0].toUpperCase() + slot.slice(1)}: ${name}`, id ? COL.text : COL.dim, szBody));
      if (id) {
        const s = slot;
        const z = this.add.zone(px + panelW / 2, y + rowH / 2, panelW - PAD * 2, rowH)
          .setDepth(35).setInteractive({ useHandCursor: true });
        z.on('pointerdown', () => { inv.unequip(s); this.renderInventory(); });
        this.clickZones.push(z);
      }
      y += rowH;
    }
    y += 2;

    // Equippable items from inventory with stat diff preview
    push(this.invText(px + PAD, y, 'Equippable:', COL.dim, szBody));
    y += szBody + 2;

    const equipItems = inv.items.filter(s => (itemsData as any)[s.itemId]?.type === 'equipment');
    const total = equipItems.length;

    if (total === 0) {
      push(this.invText(px + PAD + 4, y, '(none)', COL.dim, szBody));
    } else {
      const availRows = maxRows - 5; // 3 equipment slots + label + header
      const needsScroll = total > availRows;
      const displayRows = needsScroll ? availRows - 1 : availRows;
      const off = needsScroll ? Math.min(this.scrollOffset, Math.max(0, total - displayRows)) : 0;
      const visible = equipItems.slice(off, off + displayRows);

      for (const s of visible) {
        const item = (itemsData as any)[s.itemId];
        // Stat diff: compute what would change if equipped
        const currentSlot = item.slot as 'weapon' | 'armor' | 'accessory';
        const currentEqId = inv.equipment[currentSlot];
        const currentMods = currentEqId ? ((itemsData as any)[currentEqId]?.statModifiers ?? {}) : {};
        const newMods = item.statModifiers ?? {};
        const diffParts: string[] = [];
        for (const stat of ['attack', 'defense', 'speed', 'magic']) {
          const diff = (newMods[stat] ?? 0) - (currentMods[stat] ?? 0);
          if (diff > 0) diffParts.push(`+${diff} ${stat.slice(0, 3).toUpperCase()}`);
          else if (diff < 0) diffParts.push(`${diff} ${stat.slice(0, 3).toUpperCase()}`);
        }
        const diffStr = diffParts.length > 0 ? ` (${diffParts.join(', ')})` : '';
        const diffCol = diffParts.some(p => p.startsWith('+')) ? COL.heal : diffParts.length > 0 ? COL.dmg : COL.dim;

        push(this.invText(px + PAD + 4, y, `${item.name}`, COL.text, szBody));
        if (diffStr) {
          const dt = this.invText(px + PAD + 4 + (item.name.length + 1) * 5.5, y, diffStr, diffCol, szBody - 1);
          push(dt);
        }

        const id = s.itemId;
        const z = this.add.zone(px + panelW / 2, y + rowH / 2, panelW - PAD * 2, rowH)
          .setDepth(35).setInteractive({ useHandCursor: true });
        z.on('pointerdown', () => { inv.equip(id); this.scrollOffset = 0; this.renderInventory(); });
        this.clickZones.push(z);
        y += rowH;
      }
      if (needsScroll) this.renderScrollIndicator(px, y, panelW, off, visible.length, total, displayRows, szBody, push);
    }
  }

  private renderItemsTab(px: number, y: number, panelW: number, rowH: number, szBody: number, maxRows: number, push: (o: Phaser.GameObjects.GameObject) => void): void {
    const inv = this.worldScene.inventory;
    const nonEquip = inv.items.filter(s => {
      const item = (itemsData as any)[s.itemId];
      return item && item.type !== 'equipment';
    });
    const total = nonEquip.length;

    if (total === 0) {
      push(this.invText(px + PAD + 4, y, '(empty)', COL.dim, szBody));
    } else {
      const needsScroll = total > maxRows;
      const displayRows = needsScroll ? maxRows - 1 : maxRows;
      const off = needsScroll ? Math.min(this.scrollOffset, Math.max(0, total - displayRows)) : 0;
      const visible = nonEquip.slice(off, off + displayRows);

      for (const s of visible) {
        const item = (itemsData as any)[s.itemId];
        const nm = item?.name ?? s.itemId;
        const isSlotted = this.quickSlots.includes(s.itemId);
        const prefix = isSlotted ? '\u2605 ' : '';
        push(this.invText(px + PAD + 4, y, `${prefix}${nm} x${s.quantity}`, COL.text, szBody));
        if (item?.type === 'consumable') {
          const id = s.itemId;
          const z = this.add.zone(px + panelW / 2, y + rowH / 2, panelW - PAD * 2, rowH)
            .setDepth(35).setInteractive({ useHandCursor: true });
          z.on('pointerdown', () => this.useConsumable(id));
          this.clickZones.push(z);
        }
        y += rowH;
      }
      if (needsScroll) this.renderScrollIndicator(px, y, panelW, off, visible.length, total, displayRows, szBody, push);
    }
  }

  private renderQuestsTab(px: number, y: number, panelW: number, rowH: number, szBody: number, push: (o: Phaser.GameObjects.GameObject) => void): void {
    const quests = this.worldScene.quests;
    const lineH = szBody + 4;
    for (const [, quest] of Object.entries(questsData as Record<string, { title: string; objectives: { text: string; flag: string; type: string }[] }>)) {
      push(this.invText(px + PAD, y, quest.title, COL.title, szBody));
      y += lineH;
      for (const obj of quest.objectives) {
        const done = obj.type === 'quest' ? !!quests.getQuestFlag(obj.flag) : !!quests.getStoryFlag(obj.flag);
        const prefix = done ? '\u2713' : '\u25CB';
        const color = done ? 0x66dd66 : COL.dim;
        push(this.invText(px + PAD + 8, y, `${prefix} ${obj.text}`, color, szBody));
        y += lineH;
        if (!done) break;
      }
      y += 4;
    }
  }

  private renderStatsTab(px: number, y: number, panelW: number, szBody: number, push: (o: Phaser.GameObjects.GameObject) => void): void {
    const inv = this.worldScene.inventory;
    const run = this.worldScene.run;
    const char = this.worldScene.character;
    const eqMods = inv.getEquipmentStatModifiers();
    const lineH = szBody + 4;

    // Class + Level
    push(this.invText(px + PAD, y, `${char.class.charAt(0).toUpperCase() + char.class.slice(1)}  Lv${char.level}`, COL.title, szBody + 1));
    y += lineH + 2;

    // XP bar
    const nextXp = WorldScene.xpForLevel(char.level + 1);
    push(this.invText(px + PAD, y, `XP: ${char.xp} / ${nextXp}`, COL.dim, szBody));
    y += lineH;

    // HP / MP
    push(this.invText(px + PAD, y, `HP: ${run.hp}/${run.maxHp}   MP: ${run.mp}/${run.maxMp}`, COL.text, szBody));
    y += lineH + 2;

    // Stats breakdown: Base + Equipment = Total
    push(this.invText(px + PAD, y, 'Stat       Base  Equip  Total', COL.dim, szBody - 1));
    y += lineH;
    for (const stat of ['attack', 'defense', 'speed', 'magic'] as const) {
      const base = run.stats[stat];
      const eq = eqMods[stat] ?? 0;
      const total = base + eq;
      const label = stat.slice(0, 3).toUpperCase().padEnd(10);
      const eqStr = eq > 0 ? `+${eq}` : eq < 0 ? `${eq}` : ' 0';
      push(this.invText(px + PAD, y, `${label} ${String(base).padStart(4)}  ${eqStr.padStart(5)}  ${String(total).padStart(5)}`, COL.text, szBody));
      y += lineH;
    }
    y += 4;

    // Learned skills
    push(this.invText(px + PAD, y, 'Skills:', COL.dim, szBody));
    y += lineH;
    if (char.learnedSkills.length === 0) {
      push(this.invText(px + PAD + 4, y, '(none)', COL.dim, szBody));
    } else {
      for (const sid of char.learnedSkills) {
        const sk = (skillsData as any)[sid];
        if (sk) {
          push(this.invText(px + PAD + 4, y, `${sk.name} (${sk.mpCost}MP)`, COL.text, szBody));
          y += lineH;
        }
      }
    }
  }

  private renderScrollIndicator(px: number, y: number, panelW: number, off: number, visibleCount: number, total: number, displayRows: number, szBody: number, push: (o: Phaser.GameObjects.GameObject) => void): void {
    const st = this.invText(px + panelW / 2, y, `\u25B2 ${off + 1}\u2013${off + visibleCount} of ${total} \u25BC`, COL.dim, szBody);
    st.setOrigin(0.5, 0); push(st);
    const rowH = Math.max(szBody + 6, 18);
    if (off > 0) {
      const uz = this.add.zone(px + panelW / 4, y + rowH / 2, panelW / 2, rowH)
        .setDepth(35).setInteractive({ useHandCursor: true });
      uz.on('pointerdown', () => { this.scrollOffset = Math.max(0, off - displayRows); this.renderInventory(); });
      this.clickZones.push(uz);
    }
    if (off + displayRows < total) {
      const dz = this.add.zone(px + 3 * panelW / 4, y + rowH / 2, panelW / 2, rowH)
        .setDepth(35).setInteractive({ useHandCursor: true });
      dz.on('pointerdown', () => { this.scrollOffset = off + displayRows; this.renderInventory(); });
      this.clickZones.push(dz);
    }
  }

  private useConsumable(itemId: string): void {
    const item = (itemsData as any)[itemId];
    if (!item?.effects) return;
    const run = this.worldScene.run;
    for (const eff of item.effects) {
      if (eff.type === 'heal') run.hp = Math.min(run.maxHp, run.hp + eff.value);
      else if (eff.type === 'restore_mp') run.mp = Math.min(run.maxMp, run.mp + eff.value);
      else if (eff.type === 'damage') {
        this.addMessage('Cannot use bombs outside combat!', '#ff6666');
        return;
      }
    }
    this.worldScene.inventory.removeItem(itemId);
    this.worldScene.saveRun();
    this.addMessage(`Used ${item.name}.`, '#66dd66');
    this.autoFillQuickSlots();
    this.renderInventory();
    this.renderStats();
  }

  // ══════════════════════════════════════
  //  SHOP
  // ══════════════════════════════════════

  private getShopStock(): string[] {
    const shop = (shopsData as any)[this.currentShopId];
    return shop?.stock ?? [];
  }

  private getShopName(): string {
    const shop = (shopsData as any)[this.currentShopId];
    return shop?.name ?? 'SHOP';
  }

  private renderShop(): void {
    this.clearActions();
    const inv = this.worldScene.inventory;

    this.overlayBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COL.overlay, 0.7).setDepth(30);
    this.actionObjs.push(this.overlayBg);

    const panelW = 380, panelH = 380;
    const px = (GAME_WIDTH - panelW) / 2;
    const py = (GAME_HEIGHT - panelH) / 2;
    this.actionObjs.push(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH, 0x1a1a2e, 0.95).setDepth(31));
    this.actionObjs.push(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH).setStrokeStyle(1, 0x444466).setDepth(31));

    const push = (o: Phaser.GameObjects.GameObject) => { this.actionObjs.push(o); };
    const szBody = this.fs(9);
    const rowH = Math.max(szBody + 6, 18);
    let y = py + PAD;

    // Title + gold
    push(this.invText(px + PAD, y, this.getShopName(), COL.title, this.fs(11)));
    const gt = this.invText(px + panelW - PAD, y, `${inv.gold}g`, COL.gold, this.fs(11));
    gt.setOrigin(1, 0); push(gt);
    y += this.fs(11) + 6;

    // Tab buttons
    const buyActive = this.shopTab === 'buy';
    const buyT = this.invText(px + PAD, y, buyActive ? '[ Buy ]' : '  Buy  ', buyActive ? COL.title : COL.dim, szBody);
    push(buyT);
    const buyZ = this.add.zone(px + PAD + buyT.width / 2, y + buyT.height / 2, buyT.width + 12, rowH)
      .setDepth(35).setInteractive({ useHandCursor: true });
    buyZ.on('pointerdown', () => { if (this.shopTab !== 'buy') { this.shopTab = 'buy'; this.scrollOffset = 0; this.renderShop(); } });
    this.clickZones.push(buyZ);

    const sellT = this.invText(px + PAD + buyT.width + 16, y, !buyActive ? '[ Sell ]' : '  Sell  ', !buyActive ? COL.title : COL.dim, szBody);
    push(sellT);
    const sellZ = this.add.zone(px + PAD + buyT.width + 16 + sellT.width / 2, y + sellT.height / 2, sellT.width + 12, rowH)
      .setDepth(35).setInteractive({ useHandCursor: true });
    sellZ.on('pointerdown', () => { if (this.shopTab !== 'sell') { this.shopTab = 'sell'; this.scrollOffset = 0; this.renderShop(); } });
    this.clickZones.push(sellZ);
    y += rowH + 4;

    // Item list area
    const closeH = 26;
    const listBottom = py + panelH - PAD - closeH;
    const maxRows = Math.floor((listBottom - y) / rowH);

    if (this.shopTab === 'buy') {
      const buyItems: { id: string; item: any }[] = [];
      for (const itemId of this.getShopStock()) {
        const item = (itemsData as any)[itemId];
        if (item) buyItems.push({ id: itemId, item });
      }
      const total = buyItems.length;
      const needsScroll = total > maxRows;
      const displayRows = needsScroll ? maxRows - 1 : maxRows;
      const off = needsScroll ? Math.min(this.scrollOffset, Math.max(0, total - displayRows)) : 0;
      const visible = buyItems.slice(off, off + displayRows);

      for (const { id, item } of visible) {
        const price = item.value ?? 0;
        const canAfford = inv.gold >= price;
        push(this.invText(px + PAD + 4, y, `${item.name} - ${price}g`, canAfford ? COL.text : COL.dim, szBody));
        if (canAfford && price > 0) {
          const zone = this.add.zone(px + panelW / 2, y + rowH / 2, panelW - PAD * 2, rowH)
            .setDepth(35).setInteractive({ useHandCursor: true });
          zone.on('pointerdown', () => this.buyItem(id, price));
          this.clickZones.push(zone);
        }
        y += rowH;
      }
      if (needsScroll) {
        const st = this.invText(px + panelW / 2, y, `\u25B2 ${off + 1}\u2013${off + visible.length} of ${total} \u25BC`, COL.dim, szBody);
        st.setOrigin(0.5, 0); push(st);
        if (off > 0) {
          const uz = this.add.zone(px + panelW / 4, y + rowH / 2, panelW / 2, rowH)
            .setDepth(35).setInteractive({ useHandCursor: true });
          uz.on('pointerdown', () => { this.scrollOffset = Math.max(0, off - displayRows); this.renderShop(); });
          this.clickZones.push(uz);
        }
        if (off + displayRows < total) {
          const dz = this.add.zone(px + 3 * panelW / 4, y + rowH / 2, panelW / 2, rowH)
            .setDepth(35).setInteractive({ useHandCursor: true });
          dz.on('pointerdown', () => { this.scrollOffset = off + displayRows; this.renderShop(); });
          this.clickZones.push(dz);
        }
      }
    } else {
      // Sell tab
      const sellItems = inv.items.filter(s => {
        const item = (itemsData as any)[s.itemId];
        return item && item.type !== 'key_item';
      });
      const total = sellItems.length;
      if (total === 0) {
        push(this.invText(px + PAD + 4, y, '(nothing to sell)', COL.dim, szBody));
      } else {
        const needsScroll = total > maxRows;
        const displayRows = needsScroll ? maxRows - 1 : maxRows;
        const off = needsScroll ? Math.min(this.scrollOffset, Math.max(0, total - displayRows)) : 0;
        const visible = sellItems.slice(off, off + displayRows);

        for (const slot of visible) {
          const item = (itemsData as any)[slot.itemId];
          const sellPrice = Math.max(1, Math.floor((item.value ?? 0) / 2));
          push(this.invText(px + PAD + 4, y, `${item.name} x${slot.quantity} \u2192 ${sellPrice}g`, COL.text, szBody));
          const id = slot.itemId;
          const zone = this.add.zone(px + panelW / 2, y + rowH / 2, panelW - PAD * 2, rowH)
            .setDepth(35).setInteractive({ useHandCursor: true });
          zone.on('pointerdown', () => this.sellItem(id, sellPrice));
          this.clickZones.push(zone);
          y += rowH;
        }
        if (needsScroll) {
          const st = this.invText(px + panelW / 2, y, `\u25B2 ${off + 1}\u2013${off + visible.length} of ${total} \u25BC`, COL.dim, szBody);
          st.setOrigin(0.5, 0); push(st);
          if (off > 0) {
            const uz = this.add.zone(px + panelW / 4, y + rowH / 2, panelW / 2, rowH)
              .setDepth(35).setInteractive({ useHandCursor: true });
            uz.on('pointerdown', () => { this.scrollOffset = Math.max(0, off - displayRows); this.renderShop(); });
            this.clickZones.push(uz);
          }
          if (off + displayRows < total) {
            const dz = this.add.zone(px + 3 * panelW / 4, y + rowH / 2, panelW / 2, rowH)
              .setDepth(35).setInteractive({ useHandCursor: true });
            dz.on('pointerdown', () => { this.scrollOffset = off + displayRows; this.renderShop(); });
            this.clickZones.push(dz);
          }
        }
      }
    }

    // Close button at fixed bottom
    const closeY = py + panelH - PAD - 12;
    const tc = this.invText(px + panelW / 2, closeY, '[ Close ]', COL.title, this.fs(10));
    tc.setOrigin(0.5, 0); push(tc);
    const cz = this.add.zone(px + panelW / 2, closeY + 10, panelW - PAD * 2, 24)
      .setDepth(35).setInteractive({ useHandCursor: true });
    cz.on('pointerdown', () => { this.mode = 'idle'; this.scrollOffset = 0; this.clearActions(); this.renderBottomBar(); });
    this.clickZones.push(cz);
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
    this.autoFillQuickSlots();
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
    this.autoFillQuickSlots();
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

  private showFloatingNumber(value: number, color: string, isCrit: boolean): void {
    const size = isCrit ? 18 : 14;
    const text = isCrit ? `${value}!` : `${value}`;
    const cx = GAME_WIDTH / 2 + (Math.random() - 0.5) * 60;
    const cy = GAME_HEIGHT - ACTION_H - 20;
    const numText = this.add.text(cx, cy, text, {
      fontSize: `${size}px`, color, fontFamily: 'monospace', fontStyle: isCrit ? 'bold' : 'normal',
      stroke: '#000000', strokeThickness: 2,
    }).setDepth(50).setOrigin(0.5);
    this.tweens.add({
      targets: numText, y: cy - 40, alpha: 0, duration: 900, ease: 'Power2',
      onComplete: () => numText.destroy(),
    });
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
