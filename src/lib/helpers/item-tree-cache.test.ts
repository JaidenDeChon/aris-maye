import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { fetchItemTree, readItemTreeCache, writeItemTreeCache } from './item-tree-cache';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';

// The helper is browser-only by design — it reads `window` and `sessionStorage` — so the
// test provides just enough of both to exercise it outside a browser.
class MemoryStorage {
    private store = new Map<string, string>();

    getItem(key: string): string | null {
        return this.store.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }
}

const storage = new MemoryStorage();
const globals = globalThis as unknown as {
    window?: unknown;
    sessionStorage?: MemoryStorage;
    fetch: typeof fetch;
};
const realFetch = globals.fetch;

function itemTreeResponse(item: IOsrsboxItemWithMeta | null): Response {
    return new Response(JSON.stringify(item), { status: 200, headers: { 'content-type': 'application/json' } });
}

let requestedUrls: string[] = [];

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
    globals.fetch = ((input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        return Promise.resolve(handler(url));
    }) as typeof fetch;
}

beforeEach(() => {
    globals.window = {};
    globals.sessionStorage = storage;
    storage.clear();
    requestedUrls = [];
});

afterEach(() => {
    globals.fetch = realFetch;
    delete globals.window;
    delete globals.sessionStorage;
});

const bucket = { id: 1925, name: 'Bucket' } as unknown as IOsrsboxItemWithMeta;

describe('readItemTreeCache', () => {
    it('reports a miss as undefined and a cached empty tree as null', () => {
        expect(readItemTreeCache(1925)).toBeUndefined();

        writeItemTreeCache(1925, null);
        expect(readItemTreeCache(1925)).toBeNull();
    });

    it('treats an entry past its TTL as a miss', () => {
        const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
        storage.setItem('aris-maye:item-tree:1925', JSON.stringify({ cachedAt: sixMinutesAgo, payload: bucket }));

        expect(readItemTreeCache(1925)).toBeUndefined();
    });
});

describe('fetchItemTree', () => {
    it('caches a response so the next caller never hits the network', async () => {
        stubFetch(() => itemTreeResponse(bucket));

        expect(await fetchItemTree(1925)).toEqual(bucket);
        expect(await fetchItemTree(1925)).toEqual(bucket);
        expect(requestedUrls).toHaveLength(1);
    });

    // This is what lets a chart node click and the page it navigates to share one request,
    // so the destination can swap the tree in a single step instead of rebuilding the chart.
    it('shares one in-flight request between concurrent callers', async () => {
        let resolveResponse: ((response: Response) => void) | undefined;
        stubFetch(() => new Promise<Response>((resolve) => (resolveResponse = resolve)));

        const first = fetchItemTree(1925);
        const second = fetchItemTree(1925);
        resolveResponse?.(itemTreeResponse(bucket));

        expect(await first).toEqual(bucket);
        expect(await second).toEqual(bucket);
        expect(requestedUrls).toHaveLength(1);
    });

    it('refetches when forced, so an edited item does not read back its stale tree', async () => {
        stubFetch(() => itemTreeResponse(bucket));

        await fetchItemTree(1925);
        await fetchItemTree(1925, { force: true });

        expect(requestedUrls).toHaveLength(2);
    });

    it('rejects on a failed response without caching it', async () => {
        stubFetch(() => new Response('nope', { status: 500 }));

        await expect(fetchItemTree(1925)).rejects.toThrow('status 500');
        expect(readItemTreeCache(1925)).toBeUndefined();
    });
});
