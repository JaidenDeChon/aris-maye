/**
 * What a shop pays for an item, and how that falls as you sell it more of them.
 *
 * Shops price from the item's base value rather than its Grand Exchange price. A shop pays
 * `buyMultiplier` of the value for the first one, and every further sale drops what it will
 * pay by `delta` — both held as per-mille, the way the wiki's `StoreTableHead` template
 * writes them, so 600 is 60% and 20 is 2%. Selling a 200gp steel axe to Bob's Brilliant
 * Axes (600/20) yields 120, then 116, then 112, and so on.
 *
 * The fall stops: "regardless of how overstocked they are, all shops will buy the player's
 * items for a minimum of 10% of the item's value" — oldschool.runescape.wiki/w/Shop.
 */

/** The scale the wiki writes shop multipliers on: 1000 is 100% of the item's value. */
export const STORE_MULTIPLIER_SCALE = 1000;

/** No shop pays less than a tenth of an item's value, however overstocked it is. */
export const STORE_MINIMUM_MULTIPLIER = 100;

/** A shop's side of the deal, as scraped from its `StoreTableHead`. */
export interface StoreTerms {
    /** Per-mille of value paid for the first sale at default stock, e.g. 600 for 60%. */
    buyMultiplier: number;
    /** Per-mille of value the price drops by per further sale, e.g. 20 for 2%. */
    delta: number;
}

/**
 * The multiplier in force after a number of sales, floored at the 10% minimum.
 * @param terms - The shop's buy multiplier and per-sale drop.
 * @param soldSoFar - How many have already been sold to this shop.
 * @returns The per-mille multiplier for the next sale.
 */
function multiplierAfter(terms: StoreTerms, soldSoFar: number): number {
    const dropped = terms.buyMultiplier - Math.max(0, soldSoFar) * Math.max(0, terms.delta);
    return Math.max(dropped, STORE_MINIMUM_MULTIPLIER);
}

/**
 * What a shop pays for the next one, given how many it has already taken.
 * @param value - The item's base value in gp.
 * @param terms - The shop's terms.
 * @param soldSoFar - How many have already been sold to this shop.
 * @returns Price in gp, rounded down as the game does.
 */
export function storeSalePrice(value: number, terms: StoreTerms, soldSoFar = 0): number {
    return Math.floor((value * multiplierAfter(terms, soldSoFar)) / STORE_MULTIPLIER_SCALE);
}

/**
 * The gp received for each of the next `count` sales, in order.
 * @param value - The item's base value in gp.
 * @param terms - The shop's terms.
 * @param count - How many sales to project.
 * @returns One price per sale.
 */
export function storeSalePrices(value: number, terms: StoreTerms, count: number): number[] {
    return Array.from({ length: Math.max(0, count) }, (_, index) => storeSalePrice(value, terms, index));
}

/** The shape stored per item, per shop. */
export interface StoreSaleSummary {
    /** gp for the first sale at default stock. */
    firstPrice: number;
    /** gp once the shop is overstocked to the 10% floor. */
    floorPrice: number;
    /** gp lost per further sale, before the floor. */
    dropPerSale: number;
    /** Sales needed to reach the floor; 0 when the first sale is already there. */
    salesToFloor: number;
}

/**
 * Flattens a shop's terms into the numbers worth showing next to an item's other prices.
 * @param value - The item's base value in gp.
 * @param terms - The shop's terms.
 * @returns The first price, the floor, the per-sale drop and how far apart they are.
 */
export function summarizeStoreSale(value: number, terms: StoreTerms): StoreSaleSummary {
    const firstPrice = storeSalePrice(value, terms, 0);
    const floorPrice = Math.floor((value * STORE_MINIMUM_MULTIPLIER) / STORE_MULTIPLIER_SCALE);
    const dropPerSale = Math.floor((value * Math.max(0, terms.delta)) / STORE_MULTIPLIER_SCALE);

    const spread = terms.buyMultiplier - STORE_MINIMUM_MULTIPLIER;
    const salesToFloor = spread <= 0 ? 0 : terms.delta > 0 ? Math.ceil(spread / terms.delta) : Number.POSITIVE_INFINITY;

    return { firstPrice, floorPrice, dropPerSale, salesToFloor };
}
