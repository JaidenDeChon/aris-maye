import { loadUsedInSafely } from '$lib/helpers/item-used-in';
import type { ItemUsedIn } from '$lib/models/item-used-in';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
import { hasRecipe, isItemCopy } from '$lib/seo/item-seo';

type StoredItem = IOsrsboxItemWithMeta & { _id?: unknown };

/** The database calls behind `/api/game-item`, passed in so the choices here can be tested. */
export type GameItemPayloadDeps = {
    getItem(id: string): Promise<StoredItem | null>;
    getUsedIn(itemObjectId: unknown): Promise<ItemUsedIn>;
    getSameNamePrimaryId(item: { id: number; name: string }): Promise<number | null>;
};

/**
 * The item endpoint's response. `priceOnly` is for callers that only want a price (the item page
 * reads the nature rune's on every view), so they don't pay for the "Used in" and namesake
 * lookups.
 */
export async function loadGameItemPayload(
    id: string,
    { priceOnly }: { priceOnly: boolean },
    deps: GameItemPayloadDeps,
): Promise<StoredItem | null> {
    const item = await deps.getItem(id);
    if (!item || priceOnly) return item;

    // Carried on the same response so the item page's title, robots tag and "Used in" card are all
    // in its server render, with no second request.
    const usedIn = await loadUsedInSafely(() => deps.getUsedIn(item._id));

    // Only an item that could be indexed needs to know whether a namesake is indexed instead. If the
    // lookup fails the page stays indexable, which at worst repeats a title for a while.
    let sameNamePrimaryId: number | null = null;
    if (!isItemCopy(item) && (hasRecipe(item) || usedIn.total > 0)) {
        try {
            sameNamePrimaryId = await deps.getSameNamePrimaryId(item);
        } catch (error) {
            console.error('Failed to look up items with the same name', error);
        }
    }

    return { ...item, usedIn, sameNamePrimaryId };
}

/**
 * The namesakes whose own page is indexable: the item itself, those with a recipe, and those
 * used as an ingredient. The sitemap groups names over the same set.
 */
export function pickIndexableNamesakes<T extends { _id: unknown; id: number; creationSpecs?: unknown[] }>(
    namesakes: T[],
    itemId: number,
    usedAsIngredient: Set<string>,
): T[] {
    return namesakes.filter(
        (n) => n.id === itemId || (n.creationSpecs?.length ?? 0) > 0 || usedAsIngredient.has(String(n._id)),
    );
}
