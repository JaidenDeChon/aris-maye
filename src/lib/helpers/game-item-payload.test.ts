import { describe, expect, it } from 'bun:test';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
import { loadGameItemPayload, pickIndexableNamesakes, type GameItemPayloadDeps } from './game-item-payload';

const recipe = [{ requiredSkills: [], experienceGranted: [], ingredients: [] }];

function deps(item: Partial<IOsrsboxItemWithMeta> | null, usedInTotal = 0) {
    const calls = { usedIn: 0, namesake: 0 };
    const value: GameItemPayloadDeps = {
        getItem: async () =>
            item ? ({ id: 2351, name: 'Iron bar', icon: '', examine: '', _id: 'x', ...item } as never) : null,
        getUsedIn: async () => {
            calls.usedIn++;
            return { items: [], total: usedInTotal };
        },
        getSameNamePrimaryId: async () => {
            calls.namesake++;
            return 2351;
        },
    };
    return { value, calls };
}

describe('loadGameItemPayload', () => {
    // The item page reads only the nature rune's price, on every view.
    it('skips the Used in and namesake lookups for a price-only request', async () => {
        const { value, calls } = deps({ creationSpecs: recipe as never });
        const payload = await loadGameItemPayload('561', { priceOnly: true }, value);
        expect(payload?.id).toBe(2351);
        expect(calls).toEqual({ usedIn: 0, namesake: 0 });
    });

    it('adds Used in and the indexed namesake for a full request', async () => {
        const { value, calls } = deps({ creationSpecs: recipe as never });
        const payload = await loadGameItemPayload('2351', { priceOnly: false }, value);
        expect(payload?.usedIn).toEqual({ items: [], total: 0 });
        expect(payload?.sameNamePrimaryId).toBe(2351);
        expect(calls).toEqual({ usedIn: 1, namesake: 1 });
    });

    it('does not look for namesakes of a copy or of an item nothing indexes', async () => {
        for (const item of [{ noted: true, creationSpecs: recipe as never }, { creationSpecs: [] }]) {
            const { value, calls } = deps(item);
            const payload = await loadGameItemPayload('2352', { priceOnly: false }, value);
            expect(payload?.sameNamePrimaryId).toBeNull();
            expect(calls.namesake).toBe(0);
        }
    });

    it('keeps the page indexable if the namesake lookup fails', async () => {
        const { value } = deps({ creationSpecs: recipe as never });
        value.getSameNamePrimaryId = async () => {
            throw new Error('mongo down');
        };
        const payload = await loadGameItemPayload('2351', { priceOnly: false }, value);
        expect(payload?.sameNamePrimaryId).toBeNull();
    });

    it('returns null for an unknown item', async () => {
        expect(await loadGameItemPayload('1', { priceOnly: false }, deps(null).value)).toBeNull();
    });
});

describe('pickIndexableNamesakes', () => {
    const namesakes = [
        { _id: 'a', id: 1, name: 'Vial', creationSpecs: [] },
        { _id: 'b', id: 2, name: 'Vial', creationSpecs: recipe },
        { _id: 'c', id: 3, name: 'Vial', creationSpecs: [] },
    ];

    it('keeps the item itself, namesakes with a recipe, and namesakes used as ingredients', () => {
        const kept = pickIndexableNamesakes(namesakes, 1, new Set(['c']));
        expect(kept.map((n) => n.id)).toEqual([1, 2, 3]);
    });

    it('drops namesakes with neither', () => {
        expect(pickIndexableNamesakes(namesakes, 2, new Set()).map((n) => n.id)).toEqual([2]);
    });
});
