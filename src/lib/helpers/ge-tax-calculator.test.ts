import { describe, expect, it } from 'bun:test';
import { DEFAULT_GE_TAX_INPUT, MAX_CASH, geTaxParams, geTaxResult, parseGeTaxInput } from './ge-tax-calculator';

const input = (price: number, quantity = 1, buy: number | null = null, bond = false) => ({
    price,
    quantity,
    buy,
    bond,
});

describe('geTaxResult', () => {
    it('charges nothing under 50 gp', () => expect(geTaxResult(input(49)).taxEach).toBe(0));
    it('charges 1 gp at 50 gp', () => expect(geTaxResult(input(50)).taxEach).toBe(1));

    it('caps the tax at 5M an item', () => {
        expect(geTaxResult(input(250_000_000)).taxEach).toBe(5_000_000);
        expect(geTaxResult(input(1_000_000_000)).taxEach).toBe(5_000_000);
    });

    it('charges nothing on a bond', () => expect(geTaxResult(input(10_000_000, 1, null, true)).taxEach).toBe(0));

    it('rounds per item, not on the total', () => {
        // 2% of 99 is 1.98, so 1 each: 100 of them pay 100, not 198.
        expect(geTaxResult(input(99, 100)).totalTax).toBe(100);
    });

    it('works out what you receive and the profit', () => {
        expect(geTaxResult(input(1_000, 100, 900))).toEqual({
            taxEach: 20,
            totalTax: 2_000,
            received: 98_000,
            profit: 8_000,
        });
        expect(geTaxResult(input(1_000, 100)).profit).toBeNull();
        expect(geTaxResult(input(1_000, 1, 990)).profit).toBe(-10);
    });
});

describe('parseGeTaxInput', () => {
    const parse = (query: string) => parseGeTaxInput(new URLSearchParams(query));

    it('defaults to an example', () => expect(parse('')).toEqual(DEFAULT_GE_TAX_INPUT));

    it('reads every field', () => {
        expect(parse('price=1000&qty=100&buy=900&bond=1')).toEqual(input(1_000, 100, 900, true));
    });

    it('accepts commas and clamps', () => {
        expect(parse('price=1,500&qty=0&buy=-3')).toEqual(input(1_500, 1, 0));
        expect(parse('price=99999999999').price).toBe(MAX_CASH);
    });

    it('ignores junk', () => expect(parse('price=abc&qty=&buy=x')).toEqual(DEFAULT_GE_TAX_INPUT));

    it('round-trips through geTaxParams', () => {
        expect(geTaxParams(DEFAULT_GE_TAX_INPUT).toString()).toBe('');
        const original = input(1_234, 5, 1_000, true);
        expect(parseGeTaxInput(geTaxParams(original))).toEqual(original);
    });
});
