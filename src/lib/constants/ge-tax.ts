/**
 * The Grand Exchange tax, taken from the seller when an offer completes.
 *
 * It is 2% of the sale price, rounded down, and capped per item. Rounding down is what makes
 * anything sold for under 50 gp tax-free: 2% of 49 is 0.98, which rounds to 0.
 * @see https://oldschool.runescape.wiki/w/Grand_Exchange
 */
export const GE_TAX_RATE = 0.02;

/** The most tax one item can be charged, however much it sells for. */
export const GE_TAX_CAP = 5_000_000;

/**
 * Items the Grand Exchange sells tax-free.
 *
 * The wiki also exempts a handful of starter tools (hammer, chisel, needle and so on), but those
 * sell for well under 50 gp, so rounding already makes them free. Only the bond needs listing.
 */
export const GE_TAX_EXEMPT_ITEM_IDS: readonly number[] = [
    13190, // Old school bond
];

/**
 * The tax the Grand Exchange takes from one sale.
 * @param price - What one item sells for.
 * @param itemId - The item sold, to check against the exemption list.
 * @returns The gp taken, or 0 for an exempt item or an unusable price.
 */
export function geTax(price: number | null | undefined, itemId?: number | null): number {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return 0;
    if (typeof itemId === 'number' && GE_TAX_EXEMPT_ITEM_IDS.includes(itemId)) return 0;
    return Math.min(Math.floor(price * GE_TAX_RATE), GE_TAX_CAP);
}

/**
 * What the seller keeps from one Grand Exchange sale.
 * @returns The price less the tax, or null when there is no price.
 */
export function geSaleAfterTax(price: number | null | undefined, itemId?: number | null): number | null {
    if (typeof price !== 'number' || !Number.isFinite(price)) return null;
    return price - geTax(price, itemId);
}

/**
 * `geSaleAfterTax` as an aggregation expression, so the browse list's profit pipeline and the
 * item page take the same amount off.
 * @param priceExpr - An expression resolving to the sale price.
 * @param idExpr - An expression resolving to the item id.
 */
export function geSaleAfterTaxExpr(priceExpr: unknown, idExpr: unknown): Record<string, unknown> {
    return {
        $let: {
            vars: { price: priceExpr },
            in: {
                $cond: [
                    { $in: [idExpr, [...GE_TAX_EXEMPT_ITEM_IDS]] },
                    '$$price',
                    {
                        $subtract: [
                            '$$price',
                            { $min: [{ $floor: { $multiply: ['$$price', GE_TAX_RATE] } }, GE_TAX_CAP] },
                        ],
                    },
                ],
            },
        },
    };
}
