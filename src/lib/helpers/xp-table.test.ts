import { describe, expect, it } from 'bun:test';
import { MAX_XP, levelForXp, xpForLevel } from './xp-table';

describe('xpForLevel', () => {
    it.each([
        [1, 0],
        [2, 83],
        [50, 101_333],
        [70, 737_627],
        [92, 6_517_253],
        [99, 13_034_431],
    ])('level %p starts at %p XP', (level, xp) => {
        expect(xpForLevel(level)).toBe(xp);
    });

    it('clamps levels outside 1–99', () => {
        expect(xpForLevel(0)).toBe(0);
        expect(xpForLevel(120)).toBe(13_034_431);
    });
});

describe('levelForXp', () => {
    it('round-trips every level', () => {
        for (let level = 1; level <= 99; level++) expect(levelForXp(xpForLevel(level))).toBe(level);
    });

    it('stays on a level until its last XP', () => {
        expect(levelForXp(82)).toBe(1);
        expect(levelForXp(13_034_430)).toBe(98);
    });

    it('stops at 99', () => expect(levelForXp(MAX_XP)).toBe(99));
});
