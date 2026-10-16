import { describe, expect, it } from 'bun:test';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
import { EMPTY_USED_IN, type ItemUsedIn } from '$lib/models/item-used-in';
import { buildItemShareCard, type ShareCard } from './share-card';

function makeItem(overrides: Partial<IOsrsboxItemWithMeta> = {}): IOsrsboxItemWithMeta {
    return {
        id: 2,
        name: 'Steel cannonball',
        icon: '',
        examine: '',
        members: true,
        ...overrides,
    } as IOsrsboxItemWithMeta;
}

const smithingSpec = {
    requiredSkills: [{ skillName: 'Smithing', skillLevel: 35 }],
    experienceGranted: [{ skillName: 'Smithing', experienceAmount: 25.6 }],
    ingredients: [{ item: 'abc', amount: 1, consumedDuringCreation: true }],
};

function usedIn(total: number, recipes: [string, string][]): ItemUsedIn {
    return {
        total,
        items: recipes.map(([name, skill], i) => ({ id: 100 + i, name, icon: null, skill, level: 1 })),
    };
}

/** The sentence as it reads, with the gold runs in [brackets]. */
function read(card: ShareCard): string {
    return card.sentence.map((s) => (s.strong ? `[${s.text}]` : s.text)).join('');
}

describe('buildItemShareCard', () => {
    it('gives the level and XP for an item with a recipe', () => {
        const card = buildItemShareCard(makeItem({ creationSpecs: [smithingSpec as never] }), EMPTY_USED_IN);
        expect(card.name).toBe('Steel cannonball');
        expect(read(card)).toBe(
            'Make it with [Smithing 35] for [25.6 Smithing XP]. Ingredient costs and profit from hourly GE prices.',
        );
        expect(card.chips).toEqual(['Smithing 35', '25.6 Smithing XP', 'Members']);
    });

    it('still reads when a recipe has no skill data', () => {
        const card = buildItemShareCard(
            makeItem({ creationSpecs: [{ ingredients: [] } as never], members: false }),
            EMPTY_USED_IN,
        );
        expect(read(card)).toBe('See how to make it. Ingredient costs and profit from hourly GE prices.');
        expect(card.chips).toEqual(['Free-to-play']);
        expect(card.alt).toBe('Steel cannonball: an OSRS recipe. Costs and profit on Aris Maye.');
    });

    it('names what an ingredient goes into, with its most common skills first', () => {
        const card = buildItemShareCard(
            makeItem({ name: 'Logs', members: false }),
            usedIn(20, [
                ['Arrow shaft', 'fletching'],
                ['Bridge section', 'crafting'],
                ['Shortbow (u)', 'fletching'],
            ]),
        );
        expect(read(card)).toBe(
            'Used in [20 recipes], including [Arrow shaft] and [Bridge section]. See its GE price and what you can make with it.',
        );
        expect(card.chips).toEqual(['Fletching', 'Crafting', 'Free-to-play']);
        expect(card.alt).toBe('Logs: used in 20 recipes in OSRS. Price and uses on Aris Maye.');
    });

    it('names the one recipe when there is only one', () => {
        const card = buildItemShareCard(makeItem({ name: 'Bucket' }), usedIn(1, [['Bucket of sand', 'crafting']]));
        expect(read(card)).toBe('Used to make [Bucket of sand]. See its GE price and what you can make with it.');
        expect(card.alt).toBe('Bucket: used in 1 recipe in OSRS. Price and uses on Aris Maye.');
    });

    it('falls back to price and alch values for anything else', () => {
        const card = buildItemShareCard(makeItem({ name: 'Bones' }), EMPTY_USED_IN);
        expect(read(card)).toBe('Grand Exchange price, [high and low alch] values, updated hourly.');
        expect(card.chips).toEqual(['Members']);
    });

    it("gives a noted copy the real item's card", () => {
        const card = buildItemShareCard(
            makeItem({ noted: true, creationSpecs: [smithingSpec as never] }),
            EMPTY_USED_IN,
        );
        expect(card.chips[0]).toBe('Smithing 35');
    });
});
