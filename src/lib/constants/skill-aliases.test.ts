import { describe, expect, it } from 'bun:test';
import { canonicalSkill, skillSpellings } from './skill-aliases';

describe('canonicalSkill', () => {
    it("translates the wiki's Runecraft", () => {
        expect(canonicalSkill('Runecraft')).toBe('runecrafting');
    });

    it('lowercases everything else', () => {
        expect(canonicalSkill('Smithing')).toBe('smithing');
    });
});

describe('skillSpellings', () => {
    it('lists the wiki spelling alongside the app one', () => {
        expect(skillSpellings('runecrafting')).toEqual(['runecrafting', 'runecraft']);
        expect(skillSpellings('smithing')).toEqual(['smithing']);
    });
});
