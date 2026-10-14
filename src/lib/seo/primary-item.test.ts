import { describe, expect, it } from 'bun:test';
import { keepOnePerName, pickPrimaryItemId } from './primary-item';

describe('pickPrimaryItemId', () => {
    it('prefers the GE-tradeable item, since that is the one players search for', () => {
        expect(
            pickPrimaryItemId([
                { id: 23553, tradeable_on_ge: false, highPrice: null },
                { id: 169, tradeable_on_ge: true, highPrice: 400 },
            ]),
        ).toBe(169);
    });

    it('then prefers an item with a live price', () => {
        expect(
            pickPrimaryItemId([
                { id: 10, tradeable_on_ge: true, highPrice: null, lowPrice: null },
                { id: 20, tradeable_on_ge: true, highPrice: null, lowPrice: 5 },
            ]),
        ).toBe(20);
    });

    it('falls back to the lowest id', () => {
        expect(pickPrimaryItemId([{ id: 369 }, { id: 323 }, { id: 343 }])).toBe(323);
    });
});

describe('keepOnePerName', () => {
    it('keeps one id per name and leaves unique names alone', () => {
        const ids = keepOnePerName([
            { id: 23553, name: 'Ranging potion(3)', tradeable_on_ge: false },
            { id: 169, name: 'Ranging potion(3)', tradeable_on_ge: true },
            { id: 2351, name: 'Iron bar', tradeable_on_ge: true },
        ]);
        expect(ids).toEqual([169, 2351]);
    });
});
