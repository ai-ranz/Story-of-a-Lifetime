import { StateMachine } from '../utils/StateMachine';
import { rollFloat, rollInt } from '../utils/MathUtils';
import skillsData from '../data/skills.json';
import itemsData from '../data/items.json';

// ── Status effect definitions ──

export type StatusId = 'poison' | 'burn' | 'freeze' | 'stun';

export interface StatusEffect {
  id: StatusId;
  turnsLeft: number;
}

/** Elemental affinities on enemies: multiplier for incoming damage of that element. */
export type Element = 'fire' | 'ice' | 'lightning' | 'dark';

const STATUS_CONFIG: Record<StatusId, { damagePerTurn: number; label: string }> = {
  poison:  { damagePerTurn: 0.08, label: 'Poisoned' },   // % of maxHp
  burn:    { damagePerTurn: 0.06, label: 'Burning' },
  freeze:  { damagePerTurn: 0,    label: 'Frozen' },       // skips turn
  stun:    { damagePerTurn: 0,    label: 'Stunned' },      // skips turn
};

export interface Combatant {
  id: string;
  name: string;
  isPlayer: boolean;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stats: { attack: number; defense: number; speed: number; magic: number };
  skills: string[];
  ai?: string;
  buffs: Buff[];
  statusEffects: StatusEffect[];
  loot?: Array<{ itemId: string; chance: number }>;
  xpReward?: number;
  goldReward?: number;
  spriteKey?: string;
  weakness?: Element;
  resistance?: Element;
}

export interface Buff {
  stat: string;
  multiplier: number;
  turnsLeft: number;
}

export interface CombatAction {
  type: 'attack' | 'skill' | 'item' | 'defend' | 'flee';
  skillId?: string;
  itemId?: string;
  targetIndex?: number;
}

export interface CombatResult {
  type: 'damage' | 'heal' | 'buff' | 'miss' | 'flee_success' | 'flee_fail' | 'status_tick' | 'status_skip';
  actor: string;
  target?: string;
  value?: number;
  skillName?: string;
  critical?: boolean;
  appliedStatus?: StatusId;
  element?: string;
  weaknessHit?: boolean;
  resistanceHit?: boolean;
}

export type CombatEventCallback = (event: string, data?: any) => void;

export class CombatSystem {
  readonly fsm: StateMachine;
  party: Combatant[] = [];
  enemies: Combatant[] = [];
  turnOrder: Combatant[] = [];
  turnIndex = 0;
  pendingAction: CombatAction | null = null;
  lastResult: CombatResult | null = null;
  private eventCallback: CombatEventCallback = () => {};
  private victoryRewards: { xp: number; gold: number; loot: string[] } = { xp: 0, gold: 0, loot: [] };
  enemyIntents: Map<string, { action: CombatAction; description: string }> = new Map();

  constructor() {
    this.fsm = new StateMachine();

    this.fsm
      .addState('IDLE', {})
      .addState('COMBAT_START', {
        enter: () => this.onCombatStart(),
      })
      .addState('TURN_START', {
        enter: () => this.onTurnStart(),
      })
      .addState('PLAYER_CHOOSE', {
        enter: () => {
          this.computeAllIntents();
          this.emit('player_choose', { combatant: this.currentCombatant });
        },
      })
      .addState('EXECUTE_ACTION', {
        enter: () => this.onExecuteAction(),
      })
      .addState('ANIMATE', {
        // Scene will call advanceFromAnimate() when animation finishes
        enter: () => this.emit('animate', { result: this.lastResult }),
      })
      .addState('CHECK_RESULT', {
        enter: () => this.onCheckResult(),
      })
      .addState('VICTORY', {
        enter: () => this.onVictory(),
      })
      .addState('DEFEAT', {
        enter: () => this.emit('defeat'),
      })
      .addState('FLED', {
        enter: () => this.emit('fled'),
      });
  }

  setEventCallback(cb: CombatEventCallback): void {
    this.eventCallback = cb;
  }

  private emit(event: string, data?: any): void {
    this.eventCallback(event, data);
  }

  startCombat(party: Combatant[], enemies: Combatant[]): void {
    this.party = party;
    this.enemies = enemies;
    this.victoryRewards = { xp: 0, gold: 0, loot: [] };
    this.fsm.transition('COMBAT_START');
  }

  submitAction(action: CombatAction): void {
    if (this.fsm.current !== 'PLAYER_CHOOSE') return;
    this.pendingAction = action;
    this.fsm.transition('EXECUTE_ACTION');
  }

  advanceFromAnimate(): void {
    if (this.fsm.current === 'ANIMATE') {
      this.fsm.transition('CHECK_RESULT');
      return;
    }
    // Also handle status tick/skip animations while still in TURN_START
    if (this.fsm.current === 'TURN_START') {
      const c = this.currentCombatant;
      if (!c || c.hp <= 0) {
        if (this.enemies.every(e => e.hp <= 0)) { this.fsm.transition('VICTORY'); return; }
        if (this.party.every(p => p.hp <= 0)) { this.fsm.transition('DEFEAT'); return; }
        this.advanceTurn();
        return;
      }
      // If skipping due to stun/freeze, advance turn
      if (this.lastResult?.type === 'status_skip') {
        this.advanceTurn();
        return;
      }
      // If it was a status_tick, continue with the turn
      if (c.isPlayer) {
        this.fsm.transition('PLAYER_CHOOSE');
      } else {
        this.applyFury(c);
        const cached = this.enemyIntents.get(c.id);
        if (cached && this.isActionValid(c, cached.action)) {
          this.pendingAction = cached.action;
        } else {
          this.pendingAction = this.decideEnemyAction(c);
        }
        this.fsm.transition('EXECUTE_ACTION');
      }
    }
  }

  get currentCombatant(): Combatant {
    return this.turnOrder[this.turnIndex];
  }

  get rewards(): typeof this.victoryRewards {
    return this.victoryRewards;
  }

  private onCombatStart(): void {
    // Clean buffs & status effects
    [...this.party, ...this.enemies].forEach(c => {
      c.buffs = [];
      if (!c.statusEffects) c.statusEffects = [];
      c.statusEffects = [];
    });
    this.buildTurnOrder();
    this.turnIndex = 0;
    this.emit('combat_start', { turnOrder: this.turnOrder });
    this.fsm.transition('TURN_START');
  }

  private buildTurnOrder(): void {
    const all = [...this.party.filter(c => c.hp > 0), ...this.enemies.filter(c => c.hp > 0)];
    all.sort((a, b) => this.getEffectiveStat(b, 'speed') - this.getEffectiveStat(a, 'speed'));
    this.turnOrder = all;
  }

  private onTurnStart(): void {
    const c = this.currentCombatant;
    if (!c || c.hp <= 0) {
      this.advanceTurn();
      return;
    }

    // Tick down buffs
    c.buffs = c.buffs.filter(b => {
      b.turnsLeft--;
      return b.turnsLeft > 0;
    });

    // Process status effects
    if (!c.statusEffects) c.statusEffects = [];
    const expiredStatuses: StatusId[] = [];
    let skipTurn = false;
    for (const se of c.statusEffects) {
      const cfg = STATUS_CONFIG[se.id];
      // Damage-over-time status effects
      if (cfg.damagePerTurn > 0) {
        const dot = Math.max(1, Math.floor(c.maxHp * cfg.damagePerTurn));
        c.hp = Math.max(0, c.hp - dot);
        this.lastResult = {
          type: 'status_tick', actor: c.name, value: dot,
          skillName: cfg.label,
        };
        this.emit('animate', { result: this.lastResult });
      }
      // Turn-skipping statuses
      if (se.id === 'stun' || se.id === 'freeze') {
        skipTurn = true;
      }
      se.turnsLeft--;
      if (se.turnsLeft <= 0) expiredStatuses.push(se.id);
    }
    c.statusEffects = c.statusEffects.filter(se => se.turnsLeft > 0);

    // Check if combatant died from DoT
    if (c.hp <= 0) {
      if (this.enemies.every(e => e.hp <= 0)) { this.fsm.transition('VICTORY'); return; }
      if (this.party.every(p => p.hp <= 0)) { this.fsm.transition('DEFEAT'); return; }
      this.advanceTurn();
      return;
    }

    if (skipTurn) {
      this.lastResult = { type: 'status_skip', actor: c.name, skillName: c.statusEffects.find(s => s.id === 'stun')?.id === 'stun' ? 'Stunned' : 'Frozen' };
      this.emit('animate', { result: this.lastResult });
      // After animation, advance turn
      return;
    }

    if (c.isPlayer) {
      this.fsm.transition('PLAYER_CHOOSE');
    } else {
      this.applyFury(c);
      const cached = this.enemyIntents.get(c.id);
      if (cached && this.isActionValid(c, cached.action)) {
        this.pendingAction = cached.action;
      } else {
        this.pendingAction = this.decideEnemyAction(c);
      }
      this.fsm.transition('EXECUTE_ACTION');
    }
  }

  private onExecuteAction(): void {
    const actor = this.currentCombatant;
    const action = this.pendingAction!;
    this.pendingAction = null;

    switch (action.type) {
      case 'attack':
        this.lastResult = this.executeAttack(actor, this.resolveTarget(actor, action));
        break;
      case 'skill':
        this.lastResult = this.executeSkill(actor, action.skillId!, this.resolveTarget(actor, action));
        break;
      case 'item':
        this.lastResult = this.executeItem(actor, action.itemId!);
        break;
      case 'defend':
        this.lastResult = this.executeDefend(actor);
        break;
      case 'flee':
        this.lastResult = this.executeFlee(actor);
        break;
    }

    this.fsm.transition('ANIMATE');
  }

  private onCheckResult(): void {
    // Check for wipe conditions
    if (this.enemies.every(e => e.hp <= 0)) {
      this.fsm.transition('VICTORY');
      return;
    }
    if (this.party.every(p => p.hp <= 0)) {
      this.fsm.transition('DEFEAT');
      return;
    }
    if (this.lastResult?.type === 'flee_success') {
      this.fsm.transition('FLED');
      return;
    }

    this.advanceTurn();
  }

  private advanceTurn(): void {
    this.turnIndex++;
    if (this.turnIndex >= this.turnOrder.length) {
      // New round
      this.buildTurnOrder();
      this.turnIndex = 0;
    }
    this.fsm.transition('TURN_START');
  }

  private onVictory(): void {
    let xp = 0;
    let gold = 0;
    const loot: string[] = [];

    for (const enemy of this.enemies) {
      xp += enemy.xpReward ?? 0;
      gold += enemy.goldReward ?? 0;
      if (enemy.loot) {
        for (const drop of enemy.loot) {
          if (rollFloat() < drop.chance) {
            loot.push(drop.itemId);
          }
        }
      }
    }

    this.victoryRewards = { xp, gold, loot };
    this.emit('victory', this.victoryRewards);
  }

  // --- Execution helpers ---

  private executeAttack(actor: Combatant, target: Combatant): CombatResult {
    const atk = this.getEffectiveStat(actor, 'attack');
    const def = this.getEffectiveStat(target, 'defense');
    const crit = rollFloat() < 0.05;
    let damage = Math.max(1, atk - def / 2);
    if (crit) damage = Math.floor(damage * 1.5);
    damage = Math.floor(damage * (0.9 + rollFloat() * 0.2)); // ±10% variance

    target.hp = Math.max(0, target.hp - damage);
    return { type: 'damage', actor: actor.name, target: target.name, value: damage, critical: crit };
  }

  private executeSkill(actor: Combatant, skillId: string, target: Combatant): CombatResult {
    const skill = (skillsData as any)[skillId];
    if (!skill) return this.executeAttack(actor, target);

    if (actor.mp < skill.mpCost) {
      // Not enough MP — fallback to basic attack
      return this.executeAttack(actor, target);
    }
    actor.mp -= skill.mpCost;

    if (skill.type === 'buff') {
      const effect = skill.effect;
      actor.buffs.push({ stat: effect.stat, multiplier: effect.multiplier, turnsLeft: effect.duration + 1 });
      return { type: 'buff', actor: actor.name, skillName: skill.name };
    }

    if (skill.target === 'single_ally') {
      // Heal
      const power = skill.power * this.getEffectiveStat(actor, 'magic');
      const healing = Math.floor(power * (0.9 + rollFloat() * 0.2));
      target.hp = Math.min(target.maxHp, target.hp + healing);
      return { type: 'heal', actor: actor.name, target: target.name, value: healing, skillName: skill.name };
    }

    // Damage skill
    const statKey = skill.type === 'magic' ? 'magic' : 'attack';
    const raw = skill.power * this.getEffectiveStat(actor, statKey);
    const def = this.getEffectiveStat(target, 'defense');
    const crit = rollFloat() < (0.05 + (skill.bonusCritChance ?? 0));
    let damage = Math.max(1, raw - def / 2);
    if (crit) damage = Math.floor(damage * 1.5);
    damage = Math.floor(damage * (0.9 + rollFloat() * 0.2));

    // Elemental damage modifiers
    const element = skill.element as Element | undefined;
    let weaknessHit = false;
    let resistanceHit = false;
    if (element && target.weakness === element) {
      damage = Math.floor(damage * 1.5);
      weaknessHit = true;
    } else if (element && target.resistance === element) {
      damage = Math.floor(damage * 0.5);
      resistanceHit = true;
    }

    target.hp = Math.max(0, target.hp - damage);

    // Status effect application from skill
    let appliedStatus: StatusId | undefined;
    if (skill.appliesStatus && target.hp > 0) {
      const chance: number = skill.statusChance ?? 0.3;
      if (rollFloat() < chance) {
        const sid = skill.appliesStatus as StatusId;
        if (!target.statusEffects) target.statusEffects = [];
        // Don't stack the same status, just refresh
        const existing = target.statusEffects.find(s => s.id === sid);
        if (existing) {
          existing.turnsLeft = skill.statusDuration ?? 3;
        } else {
          target.statusEffects.push({ id: sid, turnsLeft: skill.statusDuration ?? 3 });
        }
        appliedStatus = sid;
      }
    }

    return {
      type: 'damage', actor: actor.name, target: target.name,
      value: damage, critical: crit, skillName: skill.name,
      appliedStatus, element, weaknessHit, resistanceHit,
    };
  }

  private executeItem(actor: Combatant, itemId: string): CombatResult {
    const item = (itemsData as any)[itemId];
    if (!item || !item.effects) return { type: 'miss', actor: actor.name };

    let resultValue = 0;
    let resultType: CombatResult['type'] = 'heal';

    for (const effect of item.effects) {
      if (effect.type === 'heal') {
        actor.hp = Math.min(actor.maxHp, actor.hp + effect.value);
        resultValue = effect.value;
      } else if (effect.type === 'restore_mp') {
        actor.mp = Math.min(actor.maxMp, actor.mp + effect.value);
        resultValue = effect.value;
      } else if (effect.type === 'cure_status') {
        actor.statusEffects = actor.statusEffects.filter(s => s.id !== effect.status);
        resultValue = 0;
      } else if (effect.type === 'damage') {
        resultType = 'damage';
        const target = this.enemies.filter(e => e.hp > 0)[0];
        if (target) {
          target.hp = Math.max(0, target.hp - effect.value);
          resultValue = effect.value;
          return { type: 'damage', actor: actor.name, target: target.name, value: effect.value, skillName: item.name };
        }
      }
    }

    return { type: resultType, actor: actor.name, target: actor.name, value: resultValue, skillName: item.name };
  }

  private executeDefend(actor: Combatant): CombatResult {
    actor.buffs.push({ stat: 'defense', multiplier: 2.0, turnsLeft: 2 });
    return { type: 'buff', actor: actor.name, skillName: 'Defend' };
  }

  private executeFlee(actor: Combatant): CombatResult {
    const avgPartySpd = this.party.reduce((s, c) => s + c.stats.speed, 0) / this.party.length;
    const avgEnemySpd = this.enemies.reduce((s, c) => s + c.stats.speed, 0) / this.enemies.length;
    const chance = 0.5 + (avgPartySpd - avgEnemySpd) * 0.05;
    if (rollFloat() < Math.max(0.1, Math.min(0.9, chance))) {
      return { type: 'flee_success', actor: actor.name };
    }
    return { type: 'flee_fail', actor: actor.name };
  }

  private resolveTarget(actor: Combatant, action: CombatAction): Combatant {
    if (action.type === 'skill') {
      const skill = (skillsData as any)[action.skillId!];
      if (skill?.target === 'self') return actor;
      if (skill?.target === 'single_ally') {
        if (actor.isPlayer) {
          return this.party[action.targetIndex ?? 0] ?? actor;
        } else {
          const aliveAllies = this.enemies.filter(e => e.hp > 0);
          return aliveAllies[action.targetIndex ?? 0] ?? actor;
        }
      }
    }

    if (actor.isPlayer) {
      const alive = this.enemies.filter(e => e.hp > 0);
      return alive[action.targetIndex ?? 0] ?? alive[0];
    }
    const alive = this.party.filter(p => p.hp > 0);
    return alive[action.targetIndex ?? 0] ?? alive[0];
  }

  getEffectiveStat(c: Combatant, stat: string): number {
    const base = (c.stats as any)[stat] ?? 0;
    let multiplier = 1;
    for (const buff of c.buffs) {
      if (buff.stat === stat) multiplier *= buff.multiplier;
    }
    return Math.floor(base * multiplier);
  }

  // --- Enemy AI ---

  computeAllIntents(): void {
    this.enemyIntents.clear();
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      const action = this.decideEnemyAction(enemy);
      const description = this.describeAction(action, enemy);
      this.enemyIntents.set(enemy.id, { action, description });
    }
  }

  private describeAction(action: CombatAction, enemy: Combatant): string {
    const fury = this.wouldFury(enemy);
    const suffix = fury ? ' (Fury!)' : '';
    switch (action.type) {
      case 'attack': return 'Attack' + suffix;
      case 'defend': return 'Defend';
      case 'skill': {
        const sk = (skillsData as any)[action.skillId!];
        const name = sk?.name ?? action.skillId;
        if (sk?.target === 'single_ally') return name;
        return name + suffix;
      }
      default: return 'Attack';
    }
  }

  private isActionValid(enemy: Combatant, action: CombatAction): boolean {
    if (action.type === 'skill' && action.skillId) {
      const skill = (skillsData as any)[action.skillId];
      if (skill && enemy.mp < skill.mpCost) return false;
    }
    return true;
  }

  private wouldFury(enemy: Combatant): boolean {
    return (enemy.ai === 'aggressive' || enemy.ai === 'berserker')
      && enemy.hp < enemy.maxHp * (enemy.ai === 'aggressive' ? 0.2 : 0.3);
  }

  applyFury(enemy: Combatant): void {
    if (this.wouldFury(enemy) && !enemy.buffs.some(b => b.stat === 'attack' && b.multiplier >= 1.5)) {
      enemy.buffs.push({ stat: 'attack', multiplier: 1.5, turnsLeft: 99 });
    }
  }

  // ── AI helpers ──

  private getAliveParty(): Combatant[] { return this.party.filter(p => p.hp > 0); }
  private getAliveEnemies(): Combatant[] { return this.enemies.filter(e => e.hp > 0); }

  private getStrongestSkill(enemy: Combatant): string | null {
    let best: string | null = null;
    let bestPower = 0;
    for (const sid of enemy.skills) {
      const sk = (skillsData as any)[sid];
      if (sk && enemy.mp >= sk.mpCost && (sk.power ?? 0) > bestPower
          && sk.target !== 'single_ally' && sk.target !== 'self') {
        best = sid;
        bestPower = sk.power ?? 0;
      }
    }
    return best;
  }

  private getMatchingElementSkill(enemy: Combatant, weakness: Element): string | null {
    for (const sid of enemy.skills) {
      const sk = (skillsData as any)[sid];
      if (sk && enemy.mp >= sk.mpCost && sk.element === weakness) return sid;
    }
    return null;
  }

  private getStatusSkill(enemy: Combatant): string | null {
    for (const sid of enemy.skills) {
      const sk = (skillsData as any)[sid];
      if (sk && enemy.mp >= sk.mpCost && sk.appliesStatus) return sid;
    }
    return null;
  }

  private getHealSkill(enemy: Combatant): string | null {
    for (const sid of enemy.skills) {
      const sk = (skillsData as any)[sid];
      if (sk && enemy.mp >= sk.mpCost && sk.target === 'single_ally') return sid;
    }
    return null;
  }

  // ── Action decision (with randomness) ──

  private decideEnemyAction(enemy: Combatant): CombatAction {
    switch (enemy.ai) {
      case 'aggressive': return this.aiAggressive(enemy);
      case 'defensive':  return this.aiDefensive(enemy);
      case 'healer':     return this.aiHealer(enemy);
      case 'ranged':     return this.aiRanged(enemy);
      case 'berserker':  return this.aiBerserker(enemy);
      case 'tactician':  return this.aiTactician(enemy);
      default:           return this.aiAggressive(enemy);
    }
  }

  /** Target lowest HP; use strongest skill 60%; fury at <20% HP */
  private aiAggressive(enemy: Combatant): CombatAction {
    const alive = this.getAliveParty();
    const targetIdx = alive.reduce((bi, p, i) =>
      p.hp / p.maxHp < alive[bi].hp / alive[bi].maxHp ? i : bi, 0);

    const sk = this.getStrongestSkill(enemy);
    if (sk && rollFloat() < 0.6) {
      return { type: 'skill', skillId: sk, targetIndex: targetIdx };
    }
    return { type: 'attack', targetIndex: targetIdx };
  }

  /** Defend at <50% HP; stun threats; attack highest damage dealer */
  private aiDefensive(enemy: Combatant): CombatAction {
    const alive = this.getAliveParty();
    if (enemy.hp < enemy.maxHp * 0.5) return { type: 'defend' };

    const bashSkill = enemy.skills.find(sid => {
      const s = (skillsData as any)[sid];
      return s && s.appliesStatus === 'stun' && enemy.mp >= s.mpCost;
    });
    const threatIdx = alive.reduce((bi, p, i) =>
      this.getEffectiveStat(p, 'attack') > this.getEffectiveStat(alive[bi], 'attack') ? i : bi, 0);

    if (bashSkill && rollFloat() < 0.5) {
      return { type: 'skill', skillId: bashSkill, targetIndex: threatIdx };
    }
    return { type: 'attack', targetIndex: threatIdx };
  }

  /** Heal lowest-HP ally if <60%; self-heal at <30%; else attack */
  private aiHealer(enemy: Combatant): CombatAction {
    const healSkill = this.getHealSkill(enemy);
    if (healSkill) {
      const aliveEnemies = this.getAliveEnemies();
      // Self-heal at <30%
      if (enemy.hp < enemy.maxHp * 0.3) {
        const selfIdx = aliveEnemies.findIndex(e => e.id === enemy.id);
        return { type: 'skill', skillId: healSkill, targetIndex: selfIdx >= 0 ? selfIdx : 0 };
      }
      // Heal lowest HP ally if below 60%
      let lowestIdx = -1, lowestRatio = 0.6;
      for (let i = 0; i < aliveEnemies.length; i++) {
        const ratio = aliveEnemies[i].hp / aliveEnemies[i].maxHp;
        if (ratio < lowestRatio) { lowestRatio = ratio; lowestIdx = i; }
      }
      if (lowestIdx >= 0) {
        return { type: 'skill', skillId: healSkill, targetIndex: lowestIdx };
      }
    }
    const alive = this.getAliveParty();
    return { type: 'attack', targetIndex: rollInt(0, alive.length - 1) };
  }

  /** Prefer skills (70%); defend at <25% HP */
  private aiRanged(enemy: Combatant): CombatAction {
    const alive = this.getAliveParty();
    if (enemy.hp < enemy.maxHp * 0.25) return { type: 'defend' };

    for (const sid of enemy.skills) {
      const sk = (skillsData as any)[sid];
      if (sk && enemy.mp >= sk.mpCost && sk.target !== 'single_ally' && rollFloat() < 0.7) {
        return { type: 'skill', skillId: sid, targetIndex: rollInt(0, alive.length - 1) };
      }
    }
    return { type: 'attack', targetIndex: rollInt(0, alive.length - 1) };
  }

  /** Always strongest attack; never defend; fury at <30% HP */
  private aiBerserker(enemy: Combatant): CombatAction {
    const alive = this.getAliveParty();
    const sk = this.getStrongestSkill(enemy);
    if (sk) return { type: 'skill', skillId: sk, targetIndex: rollInt(0, alive.length - 1) };
    return { type: 'attack', targetIndex: rollInt(0, alive.length - 1) };
  }

  /** Exploit weakness; apply status to threats; defend at <40% HP */
  private aiTactician(enemy: Combatant): CombatAction {
    const alive = this.getAliveParty();
    if (enemy.hp < enemy.maxHp * 0.4) return { type: 'defend' };

    // Target weakness with matching element
    for (let i = 0; i < alive.length; i++) {
      if (alive[i].weakness) {
        const sk = this.getMatchingElementSkill(enemy, alive[i].weakness!);
        if (sk) return { type: 'skill', skillId: sk, targetIndex: i };
      }
    }

    // Apply status to strongest target if not already afflicted
    const stSk = this.getStatusSkill(enemy);
    if (stSk) {
      const threatIdx = alive.reduce((bi, p, i) =>
        this.getEffectiveStat(p, 'attack') > this.getEffectiveStat(alive[bi], 'attack') ? i : bi, 0);
      const target = alive[threatIdx];
      const skill = (skillsData as any)[stSk];
      if (!target.statusEffects?.some(s => s.id === skill.appliesStatus)) {
        return { type: 'skill', skillId: stSk, targetIndex: threatIdx };
      }
    }

    const strongSk = this.getStrongestSkill(enemy);
    if (strongSk && rollFloat() < 0.5) {
      return { type: 'skill', skillId: strongSk, targetIndex: rollInt(0, alive.length - 1) };
    }
    return { type: 'attack', targetIndex: rollInt(0, alive.length - 1) };
  }
}
