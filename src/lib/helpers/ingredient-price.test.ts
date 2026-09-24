import { describe, expect, it } from 'bun:test';
import { isCurrencyItem, resolveIngredientUnitPrice, resolveIronmanUnitValue } from './ingredient-price';

describe('resolveIngredientUnitPrice', () => {
    it('prefers the live high price', () => {
        expect(
            resolveIngredientUnitPrice({
                name: 'Acorn',
                tradeable_on_ge: true,
                cost: 47,
                highPrice: 139,
                lowPrice: 120,
            }),
        ).toBe(139);
    });

    it('falls back to the low price before touching cost', () => {
        expect(resolveIngredientUnitPrice({ name: 'Acorn', tradeable_on_ge: true, cost: 47, lowPrice: 120 })).toBe(120);
    });

    it('uses cost for a tradeable item with no live price', () => {
        expect(resolveIngredientUnitPrice({ name: 'Acorn', tradeable_on_ge: true, cost: 47 })).toBe(47);
    });

    it('reports no price for an untradeable ingredient', () => {
        // The bug this exists for: cost 1 made Oak sapling look like a 31,500% return.
        expect(resolveIngredientUnitPrice({ name: 'Oak seedling (w)', tradeable_on_ge: false, cost: 1 })).toBeNull();
    });

    it('prices coins from cost even though they are untradeable', () => {
        expect(resolveIngredientUnitPrice({ name: 'Coins', tradeable_on_ge: false, cost: 1 })).toBe(1);
    });

    it('prices platinum tokens from cost', () => {
        expect(resolveIngredientUnitPrice({ name: 'Platinum token', tradeable_on_ge: false, cost: 1000 })).toBe(1000);
    });

    it('reports no price for an unresolved ingredient', () => {
        expect(resolveIngredientUnitPrice(null)).toBeNull();
        expect(resolveIngredientUnitPrice(undefined)).toBeNull();
    });

    it('treats a missing tradeable flag as not tradeable rather than as true', () => {
        expect(resolveIngredientUnitPrice({ name: 'Lovakite ore', cost: 80 })).toBeNull();
    });

    it('reports no price when nothing is priced at all', () => {
        expect(resolveIngredientUnitPrice({ name: 'Bone in vinegar', tradeable_on_ge: true })).toBeNull();
    });
});

describe('isCurrencyItem', () => {
    it('matches the money items exactly', () => {
        expect(isCurrencyItem('Coins')).toBe(true);
        expect(isCurrencyItem('Platinum token')).toBe(true);
    });

    it('does not match a merely coin-shaped name', () => {
        expect(isCurrencyItem('Coins (Deadman)')).toBe(false);
        expect(isCurrencyItem('coins')).toBe(false);
        expect(isCurrencyItem(null)).toBe(false);
        expect(isCurrencyItem(undefined)).toBe(false);
    });
});

describe('resolveIronmanUnitValue', () => {
    // A Grand Exchange price is a number an Ironman can never realise, so it must not leak in.
    it('ignores the Grand Exchange price entirely', () => {
        expect(
            resolveIronmanUnitValue(
                { name: 'Adamant platebody', tradeable_on_ge: true, cost: 6400, highPrice: 9999, highalch: 3840 },
                100,
            ),
        ).toBe(3740);
    });

    it('nets the alchemy value against the nature rune', () => {
        expect(resolveIronmanUnitValue({ name: 'Rune scimitar', highalch: 900 }, 100)).toBe(800);
    });

    // Nobody is obliged to alch at a loss, so the value floors at zero rather than going negative.
    it('floors a losing cast at zero', () => {
        expect(resolveIronmanUnitValue({ name: 'Bronze dagger', highalch: 6 }, 100)).toBe(0);
    });

    // Unknown and worthless are different claims. Shop prices may yet value these, so nulling keeps
    // them out of the ROI sort instead of ranking them on a number the app invented.
    it('reports no value when the item cannot be alched', () => {
        expect(resolveIronmanUnitValue({ name: 'Oak seedling (w)', cost: 1 }, 100)).toBeNull();
        expect(resolveIronmanUnitValue({ name: 'Oak seedling (w)', cost: 1, highalch: 0 }, 100)).toBeNull();
    });

    // Coins are money whoever is holding them, the same exception the GE pricing path makes.
    it('prices currency at its cost', () => {
        expect(resolveIronmanUnitValue({ name: 'Coins', cost: 1, tradeable_on_ge: false }, 100)).toBe(1);
    });

    it('reports no value for a missing item', () => {
        expect(resolveIronmanUnitValue(null, 100)).toBeNull();
    });

    // The rune price moves with the market, so the same item is worth less when runes cost more.
    it('tracks the nature rune price it is given', () => {
        const item = { name: 'Rune scimitar', highalch: 900 };
        expect(resolveIronmanUnitValue(item, 100)).toBe(800);
        expect(resolveIronmanUnitValue(item, 250)).toBe(650);
    });
});
