import { GE_TAX_EXEMPT_ITEM_IDS, geTax } from '$lib/constants/ge-tax';

/** The most coins one stack can hold, which bounds every price and quantity on the GE. */
export const MAX_CASH = 2_147_483_647;

export type GeTaxInput = {
    /** What one item sells for. */
    price: number;
    quantity: number;
    /** What one item cost, for the profit line. Null when not entered. */
    buy: number | null;
    /** Whether it's an Old School bond, which the GE sells tax-free. */
    bond: boolean;
};

export const DEFAULT_GE_TAX_INPUT: GeTaxInput = { price: 1_000, quantity: 1, buy: null, bond: false };

function readWhole(raw: string | null, min: number): number | null {
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw.replaceAll(',', ''));
    if (!Number.isFinite(value)) return null;
    return Math.min(MAX_CASH, Math.max(min, Math.floor(value)));
}

/** The calculator's inputs from its URL. Junk falls back to the default. */
export function parseGeTaxInput(params: URLSearchParams): GeTaxInput {
    return {
        price: readWhole(params.get('price'), 0) ?? DEFAULT_GE_TAX_INPUT.price,
        quantity: readWhole(params.get('qty'), 1) ?? DEFAULT_GE_TAX_INPUT.quantity,
        buy: readWhole(params.get('buy'), 0),
        bond: params.get('bond') === '1',
    };
}

/** The query for the inputs, leaving out the defaults. */
export function geTaxParams(input: GeTaxInput): URLSearchParams {
    const params = new URLSearchParams();
    if (input.price !== DEFAULT_GE_TAX_INPUT.price) params.set('price', String(input.price));
    if (input.quantity !== DEFAULT_GE_TAX_INPUT.quantity) params.set('qty', String(input.quantity));
    if (input.buy !== null) params.set('buy', String(input.buy));
    if (input.bond) params.set('bond', '1');
    return params;
}

export type GeTaxResult = {
    taxEach: number;
    totalTax: number;
    /** What the seller gets for the whole sale. */
    received: number;
    /** What the seller makes after the buy price and tax, or null without a buy price. */
    profit: number | null;
};

/**
 * The tax on a sale. The GE taxes each item on its own, rounding down, so the tax is worked out
 * per item and then multiplied, rather than taken as 2% of the total.
 */
export function geTaxResult(input: GeTaxInput): GeTaxResult {
    const taxEach = geTax(input.price, input.bond ? GE_TAX_EXEMPT_ITEM_IDS[0] : null);
    const keptEach = input.price - taxEach;
    return {
        taxEach,
        totalTax: taxEach * input.quantity,
        received: keptEach * input.quantity,
        profit: input.buy === null ? null : (keptEach - input.buy) * input.quantity,
    };
}
