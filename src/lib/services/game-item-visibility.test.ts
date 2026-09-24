import { describe, expect, it } from 'bun:test';
import { getVisibilityQuery } from './game-item-mongo-service.server';

describe('getVisibilityQuery', () => {
    // A main has no way to value an item the Grand Exchange won't take, so excluding those keeps
    // the list free of rows that could only ever render a dash.
    it('restricts a main to GE-tradeable items with a live price', () => {
        expect(getVisibilityQuery(false)).toEqual({
            tradeable_on_ge: true,
            $or: [{ highPrice: { $gt: 0 } }, { lowPrice: { $gt: 0 } }],
        });
    });

    // The same exclusion hides a large share of what an Ironman actually makes, and they never had
    // the GE price to begin with — alchemy is what values those items for them.
    it('lifts the tradeable gate for an Ironman and accepts an alchemy value', () => {
        expect(getVisibilityQuery(true)).toEqual({
            $or: [{ highPrice: { $gt: 0 } }, { lowPrice: { $gt: 0 } }, { highalch: { $gt: 0 } }],
        });
    });

    it('does not constrain tradeability for an Ironman', () => {
        expect(getVisibilityQuery(true)).not.toHaveProperty('tradeable_on_ge');
    });

    // Defaulting to the Ironman-relaxed filter would quietly widen every existing caller.
    it('defaults to the main behaviour', () => {
        expect(getVisibilityQuery()).toEqual(getVisibilityQuery(false));
    });

    // An item with neither a price nor an alchemy value still has nothing to show, in either mode.
    it('always requires at least one usable value', () => {
        for (const ironman of [false, true]) {
            const clauses = getVisibilityQuery(ironman).$or as Record<string, unknown>[];
            expect(clauses.length).toBeGreaterThan(0);
        }
    });
});
