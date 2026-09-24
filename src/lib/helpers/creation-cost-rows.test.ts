import { describe, expect, it } from 'bun:test';
import { buildCostRows, totalCost, type CostRowKey } from './creation-cost-rows';
import type { GameItemCreationSpecs, IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';

type Ingredient = { item: Partial<IOsrsboxItemWithMeta>; amount?: number; consumedDuringCreation?: boolean };

function recipe(...ingredients: Ingredient[]): GameItemCreationSpecs {
    return {
        experienceGranted: [],
        requiredSkills: [],
        ingredients: ingredients.map((ing) => ({
            consumedDuringCreation: ing.consumedDuringCreation ?? true,
            amount: ing.amount ?? 1,
            item: ing.item as IOsrsboxItemWithMeta,
        })),
    };
}

function item(fields: Partial<IOsrsboxItemWithMeta>): Partial<IOsrsboxItemWithMeta> {
    return { tradeable_on_ge: true, ...fields };
}

// Maple longbow: an unstrung bow made from logs (with a knife that is not used up) and a bow
// string made from flax. Both intermediates also trade on the GE.
const logs = item({ id: 1517, name: 'Maple logs', highPrice: 28 });
const knife = item({ id: 946, name: 'Knife', highPrice: 110 });
const flax = item({ id: 1779, name: 'Flax', highPrice: 12 });
const unstrung = item({
    id: 62,
    name: 'Maple longbow (u)',
    highPrice: 180,
    creationSpecs: [recipe({ item: logs }, { item: knife, consumedDuringCreation: false })],
});
const bowString = item({ id: 1777, name: 'Bow string', highPrice: 105, creationSpecs: [recipe({ item: flax })] });
const longbow = recipe({ item: unstrung }, { item: bowString });

const owned =
    (...keys: CostRowKey[]) =>
    (key: CostRowKey) =>
        keys.includes(key);
const makes = owned;

describe('buildCostRows', () => {
    it('buys priced intermediates by default and does not list what they are made from', () => {
        const rows = buildCostRows(longbow);
        expect(rows.map((row) => row.item.name)).toEqual(['Maple longbow (u)', 'Bow string']);
        expect(rows.every((row) => row.makeable && !row.made)).toBe(true);
    });

    it('counts each purchase once', () => {
        expect(totalCost(buildCostRows(longbow))).toBe(285);
    });

    it('swaps a made intermediate for its ingredients', () => {
        const rows = buildCostRows(longbow, { shouldMake: makes(62) });
        expect(rows.map((row) => [row.item.name, row.depth])).toEqual([
            ['Maple longbow (u)', 0],
            ['Maple logs', 1],
            ['Bow string', 0],
        ]);
        expect(totalCost(rows)).toBe(28 + 105);
    });

    it('does not walk an owned intermediate, even one marked to be made', () => {
        const isOwned = owned(62);
        const rows = buildCostRows(longbow, { isOwned, shouldMake: makes(62) });
        expect(rows.map((row) => row.item.name)).toEqual(['Maple longbow (u)', 'Bow string']);
        expect(totalCost(rows, isOwned)).toBe(105);
    });

    it('always makes an intermediate that has no price', () => {
        const seedling = item({
            id: 5370,
            name: 'Oak seedling (w)',
            tradeable_on_ge: false,
            cost: 1,
            creationSpecs: [recipe({ item: item({ id: 5312, name: 'Acorn', highPrice: 40 }) })],
        });
        const rows = buildCostRows(recipe({ item: seedling }));
        expect(rows[0]).toMatchObject({ made: true, mustMake: true });
        expect(totalCost(rows)).toBe(40);
    });

    it('reports the cost as unknown when something to buy has no price', () => {
        const mystery = item({ id: 1, name: 'Mystery', tradeable_on_ge: false });
        expect(totalCost(buildCostRows(recipe({ item: mystery }, { item: flax })))).toBeNull();
    });

    it('merges an item reached along two branches into one row', () => {
        const rows = buildCostRows(recipe({ item: flax, amount: 2 }, { item: bowString }), {
            shouldMake: makes(1777),
        });
        const flaxRow = rows.find((row) => row.key === 1779);
        expect(flaxRow).toMatchObject({ amount: 3, totalPrice: 36 });
        expect(totalCost(rows)).toBe(36);
    });

    it('makes every priced intermediate when asked to, as it is for an Ironman', () => {
        const rows = buildCostRows(longbow, { shouldMake: () => true });
        expect(rows.map((row) => row.item.name)).toEqual(['Maple longbow (u)', 'Maple logs', 'Bow string', 'Flax']);
        expect(totalCost(rows)).toBe(28 + 12);
    });

    it('stops at a recipe that leads back to itself', () => {
        const loop = item({ id: 9, name: 'Loop', highPrice: 5 });
        loop.creationSpecs = [recipe({ item: loop })];
        const rows = buildCostRows(recipe({ item: loop }), { shouldMake: makes(9) });
        expect(rows).toHaveLength(1);
        expect(rows[0].cyclic).toBe(true);
        expect(totalCost(rows)).toBeNull();
    });
});
