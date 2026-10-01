import { describe, expect, it } from 'bun:test';
import { formatGpPerXp, formatGpShort, formatRoi, pickSkillToTrain, skillIcon, skillLabel } from './homepage';
import type { HomepageAlmostUnlocked, HomepageItem } from '$lib/models/homepage';

function item(id: number, creationProfit: number): HomepageItem {
    return {
        id,
        name: `Item ${id}`,
        icon: '',
        highPrice: null,
        lowPrice: null,
        buyLimit: null,
        creationCost: null,
        creationProfit,
        creationRoi: null,
        ironmanExitValue: null,
        craftsPerLimit: null,
        gpPerLimit: null,
    };
}

function entry(id: number, profit: number, ...shortfalls: [string, number, number][]): HomepageAlmostUnlocked {
    return { item: item(id, profit), shortfalls: shortfalls.map(([skill, need, have]) => ({ skill, need, have })) };
}

describe('formatGpShort', () => {
    it('keeps small amounts whole', () => {
        expect(formatGpShort(950)).toBe('950');
    });

    it('shortens thousands, millions and billions', () => {
        expect(formatGpShort(12_400)).toBe('12.4k');
        expect(formatGpShort(124_000)).toBe('124k');
        expect(formatGpShort(3_200_000)).toBe('3.2M');
        expect(formatGpShort(1_000_000_000)).toBe('1B');
    });

    it('signs profits when asked', () => {
        expect(formatGpShort(4_100, true)).toBe('+4.1k');
        expect(formatGpShort(-4_100, true)).toBe('-4.1k');
        expect(formatGpShort(0, true)).toBe('0');
    });

    it('shows a dash for a missing number', () => {
        expect(formatGpShort(null)).toBe('—');
    });
});

describe('formatRoi', () => {
    it('rounds to a whole percent', () => {
        expect(formatRoi(0.384)).toBe('38%');
    });

    it('keeps a decimal on small returns', () => {
        expect(formatRoi(0.045)).toBe('4.5%');
    });
});

describe('formatGpPerXp', () => {
    it('keeps a decimal under 10', () => {
        expect(formatGpPerXp(2.35)).toBe('2.4 gp/xp');
        expect(formatGpPerXp(0)).toBe('0 gp/xp');
    });
});

describe('pickSkillToTrain', () => {
    it('picks the skill that unlocks the best item', () => {
        const pick = pickSkillToTrain([
            entry(1, 500, ['smithing', 70, 67]),
            entry(2, 900, ['fletching', 80, 76]),
            entry(3, 300, ['fletching', 78, 76]),
        ]);
        expect(pick?.skill).toBe('fletching');
        expect(pick?.best.id).toBe(2);
        expect(pick?.levelsAway).toBe(4);
        expect(pick?.targetLevel).toBe(80);
        expect(pick?.unlockCount).toBe(2);
    });

    it('ignores items held back by more than one skill', () => {
        const pick = pickSkillToTrain([
            entry(1, 5_000, ['smithing', 70, 67], ['mining', 70, 68]),
            entry(2, 100, ['cooking', 50, 48]),
        ]);
        expect(pick?.skill).toBe('cooking');
    });

    it('returns null when nothing qualifies', () => {
        expect(pickSkillToTrain([])).toBeNull();
    });
});

describe('skillIcon', () => {
    it("finds the Runecrafting icon for the wiki's Runecraft", () => {
        expect(skillIcon('Runecraft')).toBe('/skill-images/runecrafting.png');
        expect(skillLabel('runecraft')).toBe('Runecrafting');
    });
});
