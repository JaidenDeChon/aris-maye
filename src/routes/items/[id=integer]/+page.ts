import { NATURE_RUNE_ITEM_ID } from '$lib/constants/alchemy';
import { canDeferPageData } from '$lib/helpers/deferred-page-data';
import { ITEM_LOAD_DEPENDENCY, type GameItemLoadResult } from '$lib/models/game-item-load';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
import type { PageLoad } from './$types';

type LoadFetch = typeof globalThis.fetch;

async function loadGameItem(fetch: LoadFetch, id: string): Promise<GameItemLoadResult> {
    // This never rejects. The page is handed this promise across a navigation it has already
    // committed to, so a rejection would have nowhere to land; the outcome travels as a value.
    try {
        const response = await fetch(`/api/game-item?id=${id}`);
        if (response.status === 404) return { status: 'missing' };
        if (!response.ok) return { status: 'failed' };
        return { status: 'found', item: (await response.json()) as IOsrsboxItemWithMeta };
    } catch {
        return { status: 'failed' };
    }
}

async function loadNatureRunePrice(fetch: LoadFetch): Promise<number | null> {
    // A failed nature rune lookup is not worth failing the page over; the alchemy helper falls back
    // to a documented default so the number is slightly stale rather than absent.
    try {
        const response = await fetch(`/api/game-item?id=${NATURE_RUNE_ITEM_ID}`);
        if (!response.ok) return null;
        return ((await response.json())?.highPrice ?? null) as number | null;
    } catch {
        return null;
    }
}

export const load: PageLoad = async ({ fetch, params, depends }) => {
    depends(ITEM_LOAD_DEPENDENCY);

    // The nature rune's price is fetched alongside the item because every alchemy figure shown to an
    // Ironman is net of the rune the cast burns. Reading it live beats a hardcoded gp figure, which
    // would go stale the moment the market moves.
    const gameItem = loadGameItem(fetch, params.id);
    const natureRunePrice = loadNatureRunePrice(fetch);

    // Both requests are in flight either way. On a client-side navigation the page takes them as
    // promises, so the route swaps the instant the reader clicks and shows its skeletons while they
    // land; on the server and during hydration it needs the finished values. See `canDeferPageData`.
    if (!canDeferPageData()) {
        return {
            itemId: params.id,
            gameItem: await gameItem,
            natureRunePrice: await natureRunePrice,
        };
    }

    return { itemId: params.id, gameItem, natureRunePrice };
};
