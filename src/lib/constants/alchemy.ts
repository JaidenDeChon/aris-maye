/**
 * The rune consumed by one cast of High or Low Level Alchemy.
 *
 * Alchemy is an Ironman's most common exit from an item: no shop has to want it and no trade has to
 * happen. What they actually clear is the alchemy value minus the rune the cast burns, so the rune's
 * price is an input to every alchemy figure the app shows them.
 */
export const NATURE_RUNE_ITEM_ID = 561;

/**
 * Fallback price for a nature rune when its live price cannot be read.
 *
 * Prefer the live Grand Exchange price wherever it can be fetched — a hardcoded gp figure goes stale
 * the moment the market moves. This exists only so a failed lookup degrades to a slightly wrong
 * number instead of silently pricing the rune at zero, which would overstate every alchemy value.
 */
export const NATURE_RUNE_FALLBACK_PRICE = 100;

/**
 * What one alchemy cast nets after paying for the rune it burns.
 *
 * Note this deliberately differs from the "alch profit" a main cares about, which is the alchemy
 * value minus what they paid on the Grand Exchange. An Ironman never bought the item at a market
 * price, so subtracting one would be meaningless to them.
 * @param alchValue - The item's high or low alchemy value.
 * @param natureRunePrice - What a nature rune costs, defaulting to the fallback above.
 * @returns The gp cleared by the cast, or null when the item has no alchemy value.
 */
export function alchemyValueAfterRune(
    alchValue?: number | null,
    natureRunePrice: number = NATURE_RUNE_FALLBACK_PRICE,
): number | null {
    if (typeof alchValue !== 'number' || !Number.isFinite(alchValue) || alchValue <= 0) return null;

    const runeCost = Number.isFinite(natureRunePrice) && natureRunePrice > 0 ? natureRunePrice : 0;
    return alchValue - runeCost;
}
