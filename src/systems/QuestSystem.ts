export class QuestSystem {
  private questFlags: Record<string, boolean> = {};
  private storyFlags: Record<string, boolean> = {};

  setQuestFlag(flag: string, value: boolean = true): void {
    this.questFlags[flag] = value;
  }

  getQuestFlag(flag: string): boolean {
    return this.questFlags[flag] ?? false;
  }

  setStoryFlag(flag: string, value: boolean = true): void {
    this.storyFlags[flag] = value;
  }

  getStoryFlag(flag: string): boolean {
    return this.storyFlags[flag] ?? false;
  }

  serialize(): { questFlags: Record<string, boolean>; storyFlags: Record<string, boolean> } {
    return {
      questFlags: { ...this.questFlags },
      storyFlags: { ...this.storyFlags },
    };
  }

  deserialize(data: { questFlags: Record<string, boolean>; storyFlags: Record<string, boolean> }): void {
    this.questFlags = { ...data.questFlags };
    this.storyFlags = { ...data.storyFlags };
  }
}
