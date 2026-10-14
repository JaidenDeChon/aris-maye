import { describe, expect, it } from 'bun:test';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
import type { ItemUsedIn } from '$lib/models/item-used-in';
import { EMPTY_USED_IN } from '$lib/models/item-used-in';
import { buildItemSeo, isIndexableItem, itemPageSeo } from './item-seo';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from './fit-text';

function makeItem(overrides: Partial<IOsrsboxItemWithMeta> = {}): IOsrsboxItemWithMeta {
    return { id: 2, name: 'Cannonball', icon: '', examine: '', ...overrides } as IOsrsboxItemWithMeta;
}

const smithingSpec = {
    requiredSkills: [{ skillName: 'Smithing', skillLevel: 35 }],
    experienceGranted: [{ skillName: 'Smithing', experienceAmount: 25.6 }],
    ingredients: [{ item: 'abc', amount: 1, consumedDuringCreation: true }],
};

function usedIn(total: number, names: string[]): ItemUsedIn {
    return {
        total,
        items: names.map((name, i) => ({ id: 100 + i, name, icon: null, skill: 'Smithing', level: 1 + i })),
    };
}

function expectWithinLimits(seo: { title: string; description: string }) {
    expect(seo.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(seo.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
    expect(seo.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
}

describe('isIndexableItem', () => {
    it.each([
        [true, 0, true],
        [true, 3, true],
        [false, 3, true],
        [false, 0, false],
    ])('recipe=%p usedIn=%p -> %p', (recipe, total, expected) => {
        const item = makeItem({ creationSpecs: recipe ? [smithingSpec as never] : [] });
        expect(isIndexableItem(item, total)).toBe(expected);
    });
});

describe('item copies', () => {
    // Noted, placeholder and duplicate copies carry the real item's recipes, so without this the
    // index would hold several identical pages per item.
    it.each([{ noted: true }, { placeholder: true }, { duplicate: true }])('never indexes a copy (%p)', (flags) => {
        const item = makeItem({ creationSpecs: [smithingSpec as never], ...flags });
        expect(isIndexableItem(item, 3)).toBe(false);
        expect(buildItemSeo(item, usedIn(3, ['Iron bar'])).robots).toBe('noindex');
    });

    it('still indexes the real item', () => {
        const item = makeItem({
            creationSpecs: [smithingSpec as never],
            noted: false,
            placeholder: false,
            duplicate: false,
        });
        expect(isIndexableItem(item, 0)).toBe(true);
    });
});

describe('buildItemSeo', () => {
    it('names the skill and level for an item with a recipe', () => {
        const seo = buildItemSeo(makeItem({ creationSpecs: [smithingSpec as never] }), EMPTY_USED_IN);
        expect(seo.title).toBe('Cannonball Profit & Recipe: OSRS Smithing 35');
        expect(seo.description).toBe(
            'How to make Cannonball in OSRS: needs Smithing 35, gives 25.6 Smithing XP. See ingredient costs and profit from live GE prices, updated hourly.',
        );
        expect(seo.robots).toBe('index');
        expect(seo.canonicalPath).toBe('/items/2');
        expectWithinLimits(seo);
    });

    it('drops the skill tail before the recipe wording when the name is long', () => {
        const name = 'Dragonfire ward (uncharged) ornament kit';
        const seo = buildItemSeo(makeItem({ name, creationSpecs: [smithingSpec as never] }), EMPTY_USED_IN);
        expect(seo.title).toBe(`${name} Profit & Recipe`);
        expectWithinLimits(seo);
    });

    it('leaves the skill out when the recipe has no skill data', () => {
        const spec = { ...smithingSpec, requiredSkills: [], experienceGranted: [] };
        const seo = buildItemSeo(makeItem({ creationSpecs: [spec as never] }), EMPTY_USED_IN);
        expect(seo.title).toBe('Cannonball Profit & Recipe');
        expect(seo.description.startsWith('How to make Cannonball in OSRS. ')).toBe(true);
        expectWithinLimits(seo);
    });

    it('describes an ingredient-only item by what it goes into', () => {
        const seo = buildItemSeo(makeItem({ name: 'Iron ore' }), usedIn(12, ['Iron bar', 'Steel bar']));
        expect(seo.title).toBe('Iron ore: OSRS Price & What You Can Make With It');
        expect(seo.description).toBe(
            'Iron ore is used in 12 OSRS recipes, including Iron bar and Steel bar. See its live GE price and what you can make with it.',
        );
        expect(seo.robots).toBe('index');
        expectWithinLimits(seo);
    });

    it('reads naturally when an ingredient has a single use', () => {
        const seo = buildItemSeo(makeItem({ name: 'Ball of wool' }), usedIn(1, ['Amulet of strength']));
        expect(seo.description.startsWith('Ball of wool is used to make Amulet of strength in OSRS.')).toBe(true);
        expectWithinLimits(seo);
    });

    it('quotes the real count for a tool used in hundreds of recipes', () => {
        const seo = buildItemSeo(makeItem({ name: 'Hammer' }), usedIn(312, ['Bronze dagger', 'Bronze axe']));
        expect(seo.description).toContain('312 OSRS recipes');
    });

    it('marks an item with neither a recipe nor a use as noindex', () => {
        const seo = buildItemSeo(makeItem({ name: 'Bucket' }), EMPTY_USED_IN);
        expect(seo.title).toBe('Bucket: OSRS GE Price');
        expect(seo.robots).toBe('noindex');
    });

    it.each(["Zamorak's unholy book & quill", 'Saradomin brew(4)', 'Ring of "luck"'])(
        'keeps %p within limits',
        (name) => {
            const seo = buildItemSeo(makeItem({ name, creationSpecs: [smithingSpec as never] }), EMPTY_USED_IN);
            expectWithinLimits(seo);
            expect(seo.title.startsWith(name)).toBe(true);
        },
    );
});

describe('itemPageSeo', () => {
    const cannonball = makeItem({ creationSpecs: [smithingSpec as never] });

    it('shows a loading title rather than the previous item while the next one loads', () => {
        const seo = itemPageSeo({ itemId: '99', gameItem: cannonball, loadProblem: null });
        expect(seo.title).toBe('Loading item · Aris Maye');
        expect(seo.canonicalPath).toBe('/items/99');
    });

    it('uses the item once it matches the route', () => {
        const seo = itemPageSeo({ itemId: '2', gameItem: cannonball, loadProblem: null });
        expect(seo.title).toBe('Cannonball Profit & Recipe: OSRS Smithing 35');
    });

    it('marks a missing or failed item as noindex', () => {
        for (const loadProblem of ['missing', 'failed'] as const) {
            const seo = itemPageSeo({ itemId: '2', gameItem: null, loadProblem });
            expect(seo.title).toBe('Item not found · Aris Maye');
            expect(seo.robots).toBe('noindex');
        }
    });
});
