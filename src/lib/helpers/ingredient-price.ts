/**
 * What a crafter actually pays for one unit of an ingredient.
 *
 * The Grand Exchange price comes first. `cost` — OSRSBox's base game value — is only a
 * price for something you can actually buy at it, so it is used for GE-tradeable items
 * and for currency, and withheld otherwise: an untradeable intermediate like
 * "Oak seedling (w)" carries `cost: 1`, and spending that made saplings look like a
 * 31,500% return.
 */
import { NATURE_RUNE_FALLBACK_PRICE, alchemyValueAfterRune } from '$lib/constants/alchemy';
import type { IOsrsboxItem } from '$lib/models/osrsbox-db-item';

/**
 * Items that *are* money, so their `cost` is a literal gp price rather than a valuation.
 *
 * Both are flagged untradeable — you cannot list coins on the GE — but a recipe that asks
 * for 5 coins costs 5gp, and roughly a third of every recipe in the dataset charges a coin
 * fee. Withholding a price for them would take those items out of the profit and ROI sorts
 * entirely.
 */
const CURRENCY_ITEM_NAMES = ['Coins', 'Platinum token'];

/**
 * The subset of an item this module reads.
 *
 * Every field is optional: ingredients reach here from projections and from the
 * loosened `IOsrsboxItemWithMeta`, and a missing flag means "not set", never "true".
 */
export type PricedItem = Partial<Pick<IOsrsboxItem, 'name' | 'cost' | 'tradeable_on_ge'>> & {
    highPrice?: number | null;
    lowPrice?: number | null;
};

/**
 * Whether an item's `cost` is denominated in the coins it is made of.
 * @param name - The item's in-game name.
 * @returns True for coins and platinum tokens.
 */
export function isCurrencyItem(name?: string | null): boolean {
    return !!name && CURRENCY_ITEM_NAMES.includes(name);
}

/** The item names whose `cost` counts as a price, for the aggregation's `$in`. */
export const currencyItemNames: readonly string[] = CURRENCY_ITEM_NAMES;

/**
 * Prices one unit of an ingredient, or reports the price as unknown.
 * @param item - The ingredient document, or null when it could not be resolved.
 * @returns Price in gp, or null when the item has no price anyone actually pays.
 */
export function resolveIngredientUnitPrice(item?: PricedItem | null): number | null {
    if (!item) return null;

    const usableCost = item.tradeable_on_ge || isCurrencyItem(item.name) ? (item.cost ?? null) : null;
    const price = item.highPrice ?? item.lowPrice ?? usableCost;

    return typeof price === 'number' ? price : null;
}

/**
 * What one unit of an item is worth to an account that cannot trade.
 *
 * An Ironman's only reliable exit is alchemy, so the alchemy value net of the nature rune the cast
 * burns is what the item is really worth to them — the Grand Exchange price is a number they can
 * never realise. Currency is the exception for the same reason it is in
 * {@link resolveIngredientUnitPrice}: coins are money, and 5 coins is 5gp whoever is holding them.
 *
 * Returns null rather than 0 when nothing values the item. Unknown and worthless are different
 * claims, and shop prices — which will join this function once scraped — may yet value it. Nulling
 * keeps the item out of the ROI sort instead of ranking it on a number the app invented.
 *
 * A cast that costs more than it returns nets 0, not a negative: nobody is obliged to alch.
 * @param item - The item document, or null when it could not be resolved.
 * @param natureRunePrice - What a nature rune costs.
 * @returns Value in gp, or null when nothing the app knows about values the item.
 */
export function resolveIronmanUnitValue(
    item?: (PricedItem & { highalch?: number | null }) | null,
    natureRunePrice: number = NATURE_RUNE_FALLBACK_PRICE,
): number | null {
    if (!item) return null;

    if (isCurrencyItem(item.name)) return item.cost ?? null;

    const alchemyNet = alchemyValueAfterRune(item.highalch, natureRunePrice);
    if (alchemyNet === null) return null;

    return Math.max(0, alchemyNet);
}
