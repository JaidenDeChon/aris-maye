import { describe, expect, it } from 'bun:test';
import { storeSalePrice, storeSalePrices, summarizeStoreSale } from './store-price';

// Bob's Brilliant Axes: sellmultiplier=1000, buymultiplier=600, delta=20.
const bobs = { buyMultiplier: 600, delta: 20 };
// Varrock General Store.
const generalStore = { buyMultiplier: 400, delta: 30 };

describe('storeSalePrice', () => {
    it("matches the wiki's own worked example", () => {
        // "a steel axe has a value of 200 coins ... sold to an axe shop such as Bob's
        // Brilliant Axes ... would sell for 120 coins (60% of its value) ... selling a
        // steel axe to him with 4 already in stock would yield 116 coins (58%)."
        expect(storeSalePrice(200, bobs, 0)).toBe(120);
        expect(storeSalePrice(200, bobs, 1)).toBe(116);
    });

    it('rounds down, as the shop table does', () => {
        // Bronze sword, value 26, at a 60% shop: 15.6 shows on the wiki as 15.
        expect(storeSalePrice(26, bobs, 0)).toBe(15);
    });

    it('never pays less than a tenth of the value', () => {
        // 600 - 25*20 would be negative; the floor is 10% of 200.
        expect(storeSalePrice(200, bobs, 25)).toBe(20);
        expect(storeSalePrice(200, bobs, 10_000)).toBe(20);
    });

    it('treats a shop that does not drop its price as flat', () => {
        expect(storeSalePrices(200, { buyMultiplier: 600, delta: 0 }, 3)).toEqual([120, 120, 120]);
    });
});

describe('storeSalePrices', () => {
    it('walks the price down one sale at a time', () => {
        expect(storeSalePrices(200, bobs, 5)).toEqual([120, 116, 112, 108, 104]);
    });

    it('returns nothing for a non-positive count', () => {
        expect(storeSalePrices(200, bobs, 0)).toEqual([]);
        expect(storeSalePrices(200, bobs, -3)).toEqual([]);
    });
});

describe('summarizeStoreSale', () => {
    it('describes the whole curve in four numbers', () => {
        expect(summarizeStoreSale(200, bobs)).toEqual({
            firstPrice: 120,
            floorPrice: 20,
            dropPerSale: 4,
            salesToFloor: 25,
        });
    });

    it('handles a general store paying 40% and dropping 3%', () => {
        expect(summarizeStoreSale(1000, generalStore)).toEqual({
            firstPrice: 400,
            floorPrice: 100,
            dropPerSale: 30,
            salesToFloor: 10,
        });
    });

    it('reports no room to fall when the shop already pays the minimum', () => {
        expect(summarizeStoreSale(500, { buyMultiplier: 100, delta: 30 })).toEqual({
            firstPrice: 50,
            floorPrice: 50,
            dropPerSale: 15,
            salesToFloor: 0,
        });
    });

    it('never reaches the floor when the price does not drop', () => {
        expect(summarizeStoreSale(200, { buyMultiplier: 600, delta: 0 }).salesToFloor).toBe(Number.POSITIVE_INFINITY);
    });
});
