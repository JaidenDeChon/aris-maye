import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';

/**
 * The dependency the item page invalidates to retry a failed load. Named so that a retry re-runs
 * that page's `load` alone, rather than every load on the page.
 *
 * It lives here rather than beside the `load` itself because SvelteKit only allows a route module
 * to export the handful of names it knows about.
 */
export const ITEM_LOAD_DEPENDENCY = 'app:game-item';

/**
 * The outcome of asking for one item.
 *
 * `missing` and `failed` are kept apart because they call for different words and different
 * offers: an item that does not exist will still not exist on a second attempt, whereas a request
 * that did not go through may well succeed on one.
 */
export type GameItemLoadResult =
    | { status: 'found'; item: IOsrsboxItemWithMeta }
    | { status: 'missing' }
    | { status: 'failed' };
