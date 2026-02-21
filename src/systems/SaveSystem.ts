import { SAVE_KEYS } from '../config';

export interface CharacterState {
  version: number;
  class: string;
  name: string;
  level: number;
  xp: number;
  learnedSkills: string[];
  classMastery: Record<string, number>; // skillId -> mastery points
  completedChapters: string[];
}

export interface RunState {
  version: number;
  chapterId: string;
  currentMap: string;
  position: { x: number; y: number };
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  stats: { attack: number; defense: number; speed: number; magic: number };
  inventory: Array<{ itemId: string; quantity: number }>;
  equipment: { weapon: string | null; armor: string | null; accessory: string | null };
  gold: number;
  questFlags: Record<string, boolean>;
  storyFlags: Record<string, boolean>;
  dungeonSeed: number;
  dungeonFloor: number;
  stepCount: number;
}

const SAVE_VERSION = 1;

export class SaveSystem {
  static saveCharacter(state: CharacterState): void {
    state.version = SAVE_VERSION;
    localStorage.setItem(SAVE_KEYS.CHARACTER, JSON.stringify(state));
  }

  static loadCharacter(): CharacterState | null {
    const raw = localStorage.getItem(SAVE_KEYS.CHARACTER);
    if (!raw) return null;
    return JSON.parse(raw) as CharacterState;
  }

  static saveRun(state: RunState): void {
    state.version = SAVE_VERSION;
    localStorage.setItem(SAVE_KEYS.RUN, JSON.stringify(state));
  }

  static loadRun(): RunState | null {
    const raw = localStorage.getItem(SAVE_KEYS.RUN);
    if (!raw) return null;
    return JSON.parse(raw) as RunState;
  }

  static deleteRun(): void {
    localStorage.removeItem(SAVE_KEYS.RUN);
  }

  static hasCharacter(): boolean {
    return localStorage.getItem(SAVE_KEYS.CHARACTER) !== null;
  }

  static hasRun(): boolean {
    return localStorage.getItem(SAVE_KEYS.RUN) !== null;
  }

  static deleteAll(): void {
    localStorage.removeItem(SAVE_KEYS.CHARACTER);
    localStorage.removeItem(SAVE_KEYS.RUN);
  }

  static createNewCharacter(className: string, name: string, classData: any): CharacterState {
    return {
      version: SAVE_VERSION,
      class: className,
      name,
      level: 1,
      xp: 0,
      learnedSkills: [...classData.startingSkills],
      classMastery: {},
      completedChapters: [],
    };
  }

  static createNewRun(chapterId: string, character: CharacterState, classData: any, chapterData: any): RunState {
    const baseStats = classData.baseStats;
    const level = character.level;
    const growth = classData.growth;

    return {
      version: SAVE_VERSION,
      chapterId,
      currentMap: chapterData.startMap,
      position: { ...chapterData.startPosition },
      hp: baseStats.hp + growth.hp * (level - 1),
      mp: baseStats.mp + growth.mp * (level - 1),
      maxHp: baseStats.hp + growth.hp * (level - 1),
      maxMp: baseStats.mp + growth.mp * (level - 1),
      stats: {
        attack: baseStats.attack + growth.attack * (level - 1),
        defense: baseStats.defense + growth.defense * (level - 1),
        speed: baseStats.speed + growth.speed * (level - 1),
        magic: baseStats.magic + growth.magic * (level - 1),
      },
      inventory: chapterData.startingItems?.map((id: string) => ({ itemId: id, quantity: 1 })) ?? [],
      equipment: { weapon: null, armor: null, accessory: null },
      gold: 0,
      questFlags: {},
      storyFlags: {},
      dungeonSeed: Date.now(),
      dungeonFloor: 0,
      stepCount: 0,
    };
  }
}
