import { describe, expect, it } from 'bun:test';
import { GE_TAX_CAP, geSaleAfterTax, geTax } from './ge-tax';

describe('geTax', () => {
    it('takes 2%, rounded down', () => {
        expect(geTax(1_000)).toBe(20);
        expect(geTax(1_234)).toBe(24);
    });

    it('takes nothing under 50 gp', () => {
        expect(geTax(49)).toBe(0);
        expect(geTax(50)).toBe(1);
    });

    it('caps the tax per item', () => {
        expect(geTax(2_000_000_000)).toBe(GE_TAX_CAP);
    });

    it('exempts the bond', () => {
        expect(geTax(10_000_000, 13190)).toBe(0);
    });

    it('ignores a missing or unusable price', () => {
        expect(geTax(null)).toBe(0);
        expect(geTax(Number.NaN)).toBe(0);
        expect(geTax(-5)).toBe(0);
    });
});

describe('geSaleAfterTax', () => {
    it('is the price less the tax', () => {
        expect(geSaleAfterTax(1_000)).toBe(980);
    });

    it('stays null without a price', () => {
        expect(geSaleAfterTax(undefined)).toBeNull();
    });
});
