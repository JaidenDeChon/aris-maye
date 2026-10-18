import { describe, expect, it } from 'bun:test';
import type { HomepageAlchPick, HomepageItem } from '$lib/models/homepage';
import type { CheapestXpGuide, XpMethod } from '$lib/models/guides';
import { alchPerLimit, cheapestPerSkill, levelBand, median, sortAlchPicks, summarizeChanges } from './guides';

function item(id: number, name: string, extra: Partial<HomepageItem> = {}): HomepageItem {
    return {
        id,
        name,
        icon: '',
        highPrice: null,
        lowPrice: null,
        buyLimit: null,
        creationCost: null,
        creationProfit: null,
        creationRoi: null,
        ironmanExitValue: null,
        craftsPerLimit: null,
        gpPerLimit: null,
        volume1h: null,
        volume24h: null,
        priceChange24h: null,
        typicalPrice24h: null,
        ...extra,
    };
}

function pick(id: number, name: string, profit: number, buyLimit: number | null): HomepageAlchPick {
    return { item: item(id, name, { buyLimit }), profit, buyPrice: 100, highalch: 100 + profit };
}

describe('levelBand', () => {
    it.each([
        [null, 1],
        [undefined, 1],
        [0, 1],
        [1, 1],
        [19, 1],
        [20, 20],
        [39, 20],
        [40, 40],
        [79, 60],
        [80, 80],
        [99, 80],
        [120, 80],
    ])('puts level %p in the band starting at %p', (level, min) => {
        expect(levelBand(level).min).toBe(min);
    });
});

describe('median', () => {
    it('takes the middle of an odd count', () => expect(median([3, 1, 2])).toBe(2));
    it('averages the middle two of an even count', () => expect(median([4, 1, 3, 2])).toBe(2.5));
    it('is null for nothing', () => expect(median([])).toBeNull());
});

describe('summarizeChanges', () => {
    it('counts rises and falls and finds the median', () => {
        expect(summarizeChanges([0.1, -0.05, 0, 0.2, -0.3])).toEqual({ rising: 2, falling: 2, medianChange: 0 });
    });
    it('handles an empty day', () => {
        expect(summarizeChanges([])).toEqual({ rising: 0, falling: 0, medianChange: null });
    });
});

describe('sortAlchPicks', () => {
    const picks = [pick(1, 'Big cast', 500, 10), pick(2, 'Big limit', 100, 1000), pick(3, 'No limit', 900, null)];

    it('ranks by profit per cast', () => {
        expect(sortAlchPicks(picks, 'cast').map((p) => p.item.id)).toEqual([3, 1, 2]);
    });

    it('ranks by profit per buy limit, with no limit last', () => {
        expect(sortAlchPicks(picks, 'limit').map((p) => p.item.id)).toEqual([2, 1, 3]);
    });

    it('breaks ties by name and leaves the input alone', () => {
        const tied = [pick(5, 'Zircon', 100, 10), pick(6, 'Amber', 100, 10)];
        expect(sortAlchPicks(tied, 'cast').map((p) => p.item.name)).toEqual(['Amber', 'Zircon']);
        expect(sortAlchPicks(tied, 'limit').map((p) => p.item.name)).toEqual(['Amber', 'Zircon']);
        expect(tied[0].item.name).toBe('Zircon');
    });
});

describe('alchPerLimit', () => {
    it('multiplies profit by the buy limit', () => expect(alchPerLimit(pick(1, 'A', 50, 70))).toBe(3500));
    it('is null without a buy limit', () => expect(alchPerLimit(pick(1, 'A', 50, null))).toBeNull());
});

describe('cheapestPerSkill', () => {
    const method = (id: number, gpPerXp: number, xp: number, level = 1): XpMethod => ({
        item: item(id, `Item ${id}`),
        level,
        xp,
        gpPerXp,
    });

    it('takes the lowest GP per XP across bands, preferring more XP on a tie', () => {
        const guide: CheapestXpGuide = {
            computedAt: 0,
            skills: [
                {
                    skill: 'herblore',
                    bands: [
                        { min: 1, max: 19, rows: [method(1, 4, 10)] },
                        { min: 20, max: 39, rows: [method(2, 2, 25, 30), method(3, 2, 50, 38)] },
                    ],
                },
                { skill: 'magic', bands: [{ min: 1, max: 19, rows: [] }] },
            ],
        };
        const result = cheapestPerSkill(guide);
        expect(result).toHaveLength(1);
        expect(result[0].skill).toBe('herblore');
        expect(result[0].method.item.id).toBe(3);
    });
});
