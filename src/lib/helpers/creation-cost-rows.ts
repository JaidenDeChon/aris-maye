/**
 * The shopping list behind the item page's ingredient table.
 *
 * An ingredient that has its own recipe can either be bought or made. Pricing it both ways at
 * once, its own price plus the price of everything it is made from, counts the same outlay
 * twice. So each such ingredient is in exactly one of two states:
 *
 * - bought: its own price counts and its recipe is not walked, which is how the browse list's
 *   profit pipeline prices a creation;
 * - made: its own price is dropped and its ingredients are listed and priced in its place.
 *
 * An ingredient with no usable price (an untradeable intermediate such as "Oak seedling (w)")
 * can only be made, so it is always walked when it has a recipe.
 */
import { getPrimaryCreationSpec } from '$lib/helpers/creation-specs';
import { resolveIngredientUnitPrice } from '$lib/helpers/ingredient-price';
import type { GameItemCreationSpecs, IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';

export type CostRowKey = string | number;

export type CostRow = {
    key: CostRowKey;
    item: IOsrsboxItemWithMeta;
    amount: number;
    unitPrice: number | null;
    totalPrice: number | null;
    /** How deep in the recipe the row was first reached; 0 for the recipe's own ingredients. */
    depth: number;
    /** The ingredient has a recipe of its own that uses something up. */
    makeable: boolean;
    /** The ingredient is being made, so its ingredients stand in for its price. */
    made: boolean;
    /** Made because nothing prices it, rather than because the reader chose to make it. */
    mustMake: boolean;
    /** The recipe leads back to this item, which is broken data rather than something to price. */
    cyclic: boolean;
};

export type CostRowOptions = {
    /** Whether the reader already has an ingredient. An owned ingredient is neither bought nor made. */
    isOwned?: (key: CostRowKey) => boolean;
    /**
     * Whether a priced ingredient should be made rather than bought. Defaults to buying, the way
     * the browse list prices a creation.
     */
    shouldMake?: (key: CostRowKey) => boolean;
};

function rowKeyFor(item: IOsrsboxItemWithMeta): CostRowKey {
    return item.id ?? item.name ?? 'unknown';
}

function consumingRecipe(item: IOsrsboxItemWithMeta): GameItemCreationSpecs | null {
    const spec = getPrimaryCreationSpec(item);
    const consumes = (spec?.ingredients ?? []).some((child) => child?.item && child.consumedDuringCreation !== false);
    return spec && consumes ? spec : null;
}

/**
 * Lists every ingredient the recipe needs, in recipe order with each made ingredient followed by
 * what it is made from. The same item reached along two branches becomes one row.
 */
export function buildCostRows(spec: GameItemCreationSpecs | null | undefined, options: CostRowOptions = {}): CostRow[] {
    if (!spec) return [];
    const isOwned = options.isOwned ?? (() => false);
    const shouldMake = options.shouldMake ?? (() => false);
    const rows = new Map<CostRowKey, CostRow>();

    function walk(current: GameItemCreationSpecs, multiplier: number, depth: number, path: Set<CostRowKey>) {
        for (const ing of current.ingredients ?? []) {
            if (!ing?.item) continue;
            if (ing.consumedDuringCreation === false) continue;

            const item = ing.item as IOsrsboxItemWithMeta;
            const key = rowKeyFor(item);
            const amount = (ing.amount ?? 1) * multiplier;
            const unitPrice = resolveIngredientUnitPrice(item);
            const totalPrice = unitPrice !== null ? unitPrice * amount : null;
            // A recipe that leads back to an item already on this branch is a cycle, and walking it
            // would never end. The row stays as bought, with whatever price it has.
            const cyclic = path.has(key);
            const recipe = cyclic ? null : consumingRecipe(item);
            const mustMake = recipe !== null && unitPrice === null;
            const made = recipe !== null && !isOwned(key) && (mustMake || shouldMake(key));

            const existing = rows.get(key);
            if (existing) {
                existing.amount += amount;
                existing.totalPrice =
                    existing.totalPrice !== null && totalPrice !== null ? existing.totalPrice + totalPrice : null;
                existing.makeable ||= recipe !== null;
                existing.mustMake ||= mustMake;
                existing.made ||= made;
                existing.cyclic ||= cyclic;
            } else {
                rows.set(key, {
                    key,
                    item,
                    amount,
                    unitPrice,
                    totalPrice,
                    depth,
                    makeable: recipe !== null,
                    made,
                    mustMake,
                    cyclic,
                });
            }

            if (!made || !recipe) continue;
            path.add(key);
            walk(recipe, amount, depth + 1, path);
            path.delete(key);
        }
    }

    walk(spec, 1, 0, new Set());
    return Array.from(rows.values());
}

/**
 * What the reader still has to buy, or null when one of those purchases has no price.
 *
 * Owned rows cost nothing and made rows are paid for by the rows under them. Any other row
 * without a price means the cost is not known; counting it as free would report a total, and a
 * profit, that is too good. A recipe that leads back to itself is unknown for the same reason the
 * browse list's profit pipeline treats it so.
 */
export function totalCost(rows: CostRow[], isOwned: (key: CostRowKey) => boolean = () => false): number | null {
    let sum = 0;
    for (const row of rows) {
        if (isOwned(row.key)) continue;
        if (row.cyclic) return null;
        if (row.made) continue;
        if (row.totalPrice === null) return null;
        sum += row.totalPrice;
    }
    return sum;
}
