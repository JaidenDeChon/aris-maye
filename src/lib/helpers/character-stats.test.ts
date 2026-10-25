import { describe, expect, it } from 'bun:test';
import { defaultSkillLevels } from '$lib/constants/default-skill-levels';
import type { ICharacterProfile } from '$lib/models/player-stats';
import { combatLevel, skillsAt99, totalLevel } from './character-stats';

const maxed = Object.fromEntries(
    Object.keys(defaultSkillLevels).map((skill) => [skill, 99]),
) as ICharacterProfile['skillLevels'];

describe('combatLevel', () => {
    it('is 3 for a new account', () => {
        expect(combatLevel(defaultSkillLevels)).toBe(3);
    });

    it('is 126 for a maxed account', () => {
        expect(combatLevel(maxed)).toBe(126);
    });

    it('counts the best of melee, ranged and magic', () => {
        // A pure ranger: 1 defence, 1 prayer, 99 ranged, 99 hitpoints.
        expect(combatLevel({ ...defaultSkillLevels, ranged: 99, hitpoints: 99 })).toBe(73);
    });
});

describe('a profile missing skills', () => {
    it('counts the missing ones at their starting level', () => {
        expect(combatLevel({})).toBe(3);
        expect(totalLevel({ cooking: 99 })).toBe(130);
    });
});

describe('totalLevel', () => {
    it('adds every skill', () => {
        expect(totalLevel(defaultSkillLevels)).toBe(32);
        expect(totalLevel(maxed)).toBe(2277);
    });
});

describe('skillsAt99', () => {
    it('counts the skills at 99', () => {
        expect(skillsAt99(defaultSkillLevels)).toBe(0);
        expect(skillsAt99({ ...defaultSkillLevels, cooking: 99, fishing: 99 })).toBe(2);
    });
});
