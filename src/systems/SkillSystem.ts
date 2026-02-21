import { CharacterState } from './SaveSystem';
import { Equipment } from './InventorySystem';
import itemsData from '../data/items.json';
import skillsData from '../data/skills.json';

export interface SkillLearnResult {
  skillId: string;
  skillName: string;
  itemName: string;
}

/**
 * Tracks equipment mastery and unlocks skills when mastery thresholds are met.
 * After each combat victory, equipped items with `teachesSkill` gain +1 mastery.
 * When mastery reaches `masteryRequired`, the skill is added to learnedSkills.
 */
export class SkillSystem {
  /**
   * Process a combat victory: increment mastery for equipped items that teach skills.
   * Returns a list of newly learned skills (if any).
   */
  static processVictory(equipment: Equipment, character: CharacterState): SkillLearnResult[] {
    const learned: SkillLearnResult[] = [];

    for (const slot of Object.values(equipment)) {
      if (!slot) continue;
      const item = (itemsData as any)[slot];
      if (!item?.teachesSkill || !item.masteryRequired) continue;
      const skillId: string = item.teachesSkill;

      // Already learned this skill — skip
      if (character.learnedSkills.includes(skillId)) continue;

      // Increment mastery
      const prev = character.classMastery[skillId] ?? 0;
      character.classMastery[skillId] = prev + 1;

      // Check threshold
      if (character.classMastery[skillId] >= item.masteryRequired) {
        character.learnedSkills.push(skillId);
        const sk = (skillsData as any)[skillId];
        learned.push({
          skillId,
          skillName: sk?.name ?? skillId,
          itemName: item.name,
        });
      }
    }

    return learned;
  }
}
