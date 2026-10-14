import { describe, expect, it } from 'bun:test';
import { buildUsedIn, loadUsedInSafely, toUsedInRecipe, type RecipeDoc } from './item-used-in';

const ORE = 'ore0000000000000000000a';
const COAL = 'coal000000000000000000b';

function doc(id: number, name: string, specs: RecipeDoc['creationSpecs']): RecipeDoc {
    return { id, name, icon: null, creationSpecs: specs };
}

describe('toUsedInRecipe', () => {
    it('takes the level from the spec that actually uses the ingredient', () => {
        const recipe = toUsedInRecipe(
            doc(1, 'Steel bar', [
                { requiredSkills: [{ skillName: 'Smithing', skillLevel: 99 }], ingredients: [{ item: COAL }] },
                { requiredSkills: [{ skillName: 'Smithing', skillLevel: 30 }], ingredients: [{ item: ORE }] },
            ]),
            ORE,
        );
        expect(recipe).toEqual({ id: 1, name: 'Steel bar', icon: null, skill: 'Smithing', level: 30 });
    });

    it('leaves skill and level empty when the spec has none', () => {
        const recipe = toUsedInRecipe(doc(1, 'Thing', [{ requiredSkills: [], ingredients: [{ item: ORE }] }]), ORE);
        expect(recipe.skill).toBeNull();
        expect(recipe.level).toBeNull();
    });
});

describe('buildUsedIn', () => {
    const spec = (level: number | null) => [
        {
            requiredSkills: level === null ? [] : [{ skillName: 'Smithing', skillLevel: level }],
            ingredients: [{ item: ORE }],
        },
    ];

    it('sorts by level, then name, with unlevelled recipes last', () => {
        const result = buildUsedIn(
            [doc(1, 'Zeta', spec(10)), doc(2, 'Alpha', spec(10)), doc(3, 'None', spec(null)), doc(4, 'Low', spec(1))],
            ORE,
        );
        expect(result.items.map((r) => r.name)).toEqual(['Low', 'Alpha', 'Zeta', 'None']);
    });

    it('counts every recipe but caps the list, so tools report their real total', () => {
        const docs = Array.from({ length: 312 }, (_, i) => doc(i + 1, `Item ${i}`, spec(i % 99)));
        const result = buildUsedIn(docs, ORE, 50);
        expect(result.total).toBe(312);
        expect(result.items).toHaveLength(50);
    });

    it('lists an item once even if the query returns it twice', () => {
        const result = buildUsedIn([doc(1, 'Steel bar', spec(30)), doc(1, 'Steel bar', spec(30))], ORE);
        expect(result.total).toBe(1);
    });
});

describe('loadUsedInSafely', () => {
    it('falls back to empty when the lookup fails, so the item page still loads', async () => {
        const result = await loadUsedInSafely(async () => {
            throw new Error('mongo down');
        });
        expect(result).toEqual({ items: [], total: 0 });
    });
});
