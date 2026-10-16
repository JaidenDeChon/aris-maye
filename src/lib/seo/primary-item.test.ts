import { describe, expect, it } from 'bun:test';
import { keepOnePerName, pickPrimaryItemId } from './primary-item';

describe('pickPrimaryItemId', () => {
    it('prefers the GE-tradeable item, since that is the one players search for', () => {
        expect(
            pickPrimaryItemId([
                { id: 23553, tradeable_on_ge: false },
                { id: 169, tradeable_on_ge: true },
            ]),
        ).toBe(169);
    });

    // Live prices change hourly; a choice that followed them could flip a URL Google just read
    // from the sitemap to noindex.
    it('ignores live prices, so the choice stays put from hour to hour', () => {
        const quiet = { id: 10, tradeable_on_ge: true, highPrice: null, lowPrice: null };
        const traded = { id: 20, tradeable_on_ge: true, highPrice: 900, lowPrice: 850 };
        const nextHourQuiet = { ...quiet, highPrice: 5 };
        const nextHourTraded = { ...traded, highPrice: null, lowPrice: null };
        expect(pickPrimaryItemId([quiet, traded])).toBe(10);
        expect(pickPrimaryItemId([nextHourQuiet, nextHourTraded])).toBe(10);
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
