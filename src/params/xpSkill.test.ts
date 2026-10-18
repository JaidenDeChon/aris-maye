import { describe, expect, it } from 'bun:test';
import { XP_GUIDE_SKILLS } from '$lib/constants/guides';
import { match } from './xpSkill';

describe('xpSkill matcher', () => {
    it.each(XP_GUIDE_SKILLS.map((skill) => skill.slug))('accepts %s', (slug) => {
        expect(match(slug)).toBe(true);
    });

    it('accepts any casing', () => {
        expect(match('Herblore')).toBe(true);
        expect(match('SMITHING')).toBe(true);
    });

    it.each(['woodcutting', 'farming', 'runecraft', '', '../items', 'herblore2'])('rejects %p', (param) => {
        expect(match(param)).toBe(false);
    });
});
