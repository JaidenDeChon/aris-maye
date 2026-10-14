import { describe, expect, it } from 'bun:test';
import { firstThatFits, truncateAtWord } from './fit-text';

describe('firstThatFits', () => {
    it('returns the first candidate within the limit', () => {
        expect(firstThatFits(['a long candidate', 'short'], 10)).toBe('short');
        expect(firstThatFits(['fits', 'also fits'], 10)).toBe('fits');
    });

    it('truncates the last candidate at a word when none fit', () => {
        const result = firstThatFits(['one two three four five', 'one two three four'], 12);
        expect(result).toBe('one two…');
        expect(result.length).toBeLessThanOrEqual(12);
    });
});

describe('truncateAtWord', () => {
    it('leaves short text alone', () => {
        expect(truncateAtWord('Cannonball', 60)).toBe('Cannonball');
    });

    it('never ends on a dangling separator', () => {
        expect(truncateAtWord('Rune platebody & Recipe: OSRS', 20)).toBe('Rune platebody…');
    });

    it('hard-cuts only a single word longer than the limit', () => {
        expect(truncateAtWord('Supercalifragilistic', 10)).toBe('Supercali…');
    });
});
