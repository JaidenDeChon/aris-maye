import { defaultSkillLevels } from '$lib/constants/default-skill-levels';
import type { ICharacterProfile } from '$lib/models/player-stats';

type SkillLevels = ICharacterProfile['skillLevels'];

/** Fills in any skill a saved profile is missing with its starting level. */
const complete = (levels: Partial<SkillLevels>): SkillLevels => ({ ...defaultSkillLevels, ...levels });

/** Combat level, by the game's formula: defence, hitpoints and half of prayer, plus the best of melee, ranged or magic. */
export function combatLevel(partial: Partial<SkillLevels>): number {
    const levels = complete(partial);
    const base = 0.25 * (levels.defence + levels.hitpoints + Math.floor(levels.prayer / 2));
    const melee = 0.325 * (levels.attack + levels.strength);
    const ranged = 0.325 * Math.floor(levels.ranged * 1.5);
    const magic = 0.325 * Math.floor(levels.magic * 1.5);
    return Math.floor(base + Math.max(melee, ranged, magic));
}

export function totalLevel(levels: Partial<SkillLevels>): number {
    return Object.values(complete(levels)).reduce((sum, level) => sum + level, 0);
}

export function skillsAt99(levels: Partial<SkillLevels>): number {
    return Object.values(complete(levels)).filter((level) => level >= 99).length;
}
