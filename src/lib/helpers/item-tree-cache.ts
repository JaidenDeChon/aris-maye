import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';

const CACHE_KEY_PREFIX = 'aris-maye:item-tree:';
const CACHE_TTL_MS = 5 * 60 * 1000;

type TreeCacheEntry = { cachedAt: number; payload: IOsrsboxItemWithMeta | null };

/**
 * One in-flight request per item id.
 *
 * Clicking a node in the ingredient chart starts the fetch for the item it points at, and
 * the destination page asks for the same tree a moment later once the route load resolves.
 * Sharing the promise means the page joins the request already running instead of firing a
 * duplicate one, so the chart can swap its data in a single step rather than tearing itself
 * down while a second copy of the same response is in flight.
 */
const inFlight = new Map<string, Promise<IOsrsboxItemWithMeta | null>>();

function cacheKeyFor(itemId: string | number): string {
    return `${CACHE_KEY_PREFIX}${String(itemId)}`;
}

/**
 * The stored tree for an item, or `undefined` when nothing usable is cached. `null` is a
 * real answer — the item has no ingredient tree — so callers must keep it distinct from a
 * miss, and must not treat it as "still loading".
 */
export function readItemTreeCache(itemId: string | number): IOsrsboxItemWithMeta | null | undefined {
    if (typeof window === 'undefined') return undefined;
    try {
        const raw = sessionStorage.getItem(cacheKeyFor(itemId));
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as TreeCacheEntry;
        if (!parsed || typeof parsed !== 'object') return undefined;
        if (!parsed.cachedAt || Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
            sessionStorage.removeItem(cacheKeyFor(itemId));
            return undefined;
        }
        return parsed.payload ?? null;
    } catch {
        return undefined;
    }
}

export function writeItemTreeCache(itemId: string | number, payload: IOsrsboxItemWithMeta | null): void {
    if (typeof window === 'undefined') return;
    try {
        const entry: TreeCacheEntry = { cachedAt: Date.now(), payload };
        sessionStorage.setItem(cacheKeyFor(itemId), JSON.stringify(entry));
    } catch {
        // ignore storage failures
    }
}

/**
 * Fetch an item's full ingredient tree, reusing the session cache and any request already
 * running for the same id. Pass `force` to bypass both after the item itself was edited.
 */
export async function fetchItemTree(
    itemId: string | number,
    options: { force?: boolean } = {},
): Promise<IOsrsboxItemWithMeta | null> {
    const key = String(itemId);

    if (!options.force) {
        const cached = readItemTreeCache(key);
        if (cached !== undefined) return cached;

        const pending = inFlight.get(key);
        if (pending) return pending;
    }

    const request = (async () => {
        const response = await fetch(`/api/game-item-full-tree/?id=${encodeURIComponent(key)}`);
        if (!response.ok) {
            throw new Error(`Failed to load item tree (status ${response.status})`);
        }
        const tree = (await response.json()) as IOsrsboxItemWithMeta | null;
        writeItemTreeCache(key, tree);
        return tree;
    })();

    inFlight.set(key, request);
    try {
        return await request;
    } finally {
        if (inFlight.get(key) === request) inFlight.delete(key);
    }
}

/**
 * Warm the cache for an item without waiting on it. Used at the moment a chart node is
 * clicked so the tree is usually in hand by the time the route load resolves; failures are
 * swallowed here because the destination page requests the same tree and reports the error.
 */
export function prefetchItemTree(itemId: string | number): void {
    if (typeof window === 'undefined') return;
    void fetchItemTree(itemId).catch(() => {});
}
