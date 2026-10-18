import { describe, expect, it } from 'bun:test';
import { createSnapshotCache, type SnapshotCollection, type SnapshotDoc } from './snapshot-cache.server';

type Snap = { computedAt: number; value: number };

const KEY = 'test-v1';
const MAX_AGE = 60 * 60 * 1000;

/** An in-memory stand-in for the Mongo collection, supporting just the filters the cache sends. */
function fakeCollection(initial?: SnapshotDoc<Snap>) {
    const docs = new Map<string, SnapshotDoc<Snap>>();
    if (initial) docs.set(initial._id, structuredClone(initial));
    const calls = { findOne: 0, updateOne: 0 };

    const matches = (doc: SnapshotDoc<Snap> | undefined, filter: Record<string, unknown>) => {
        if (!doc) return false;
        const or = filter.$or as Record<string, { $exists?: boolean; $lt?: number }>[] | undefined;
        if (!or) return true;
        return or.some((clause) => {
            const rule = clause.rebuildingAt!;
            if (rule.$exists === false) return doc.rebuildingAt === undefined;
            return doc.rebuildingAt !== undefined && doc.rebuildingAt < rule.$lt!;
        });
    };

    const collection: SnapshotCollection<Snap> = {
        async findOne(filter) {
            calls.findOne += 1;
            const doc = docs.get(filter._id);
            return doc ? structuredClone(doc) : null;
        },
        async updateOne(filter, update, options) {
            calls.updateOne += 1;
            const id = filter._id as string;
            let doc = docs.get(id);
            if (!doc) {
                if (!options?.upsert) return { modifiedCount: 0 };
                doc = { _id: id };
                docs.set(id, doc);
            } else if (!matches(doc, filter)) {
                return { modifiedCount: 0 };
            }
            Object.assign(doc, structuredClone((update.$set as object) ?? {}));
            for (const field of Object.keys((update.$unset as object) ?? {}))
                delete (doc as Record<string, unknown>)[field];
            return { modifiedCount: 1 };
        },
    };
    return { collection, docs, calls };
}

function setup(initial?: SnapshotDoc<Snap>, compute?: () => Promise<Snap>) {
    const fake = fakeCollection(initial);
    let computes = 0;
    const cache = createSnapshotCache<Snap>({
        collection: () => fake.collection,
        key: KEY,
        maxAgeMs: MAX_AGE,
        compute:
            compute ??
            (async () => {
                computes += 1;
                return { computedAt: Date.now(), value: 42 };
            }),
    });
    return { cache, fake, computes: () => computes };
}

const fresh = (): SnapshotDoc<Snap> => ({ _id: KEY, snapshot: { computedAt: Date.now(), value: 1 } });
const stale = (extra: Partial<SnapshotDoc<Snap>> = {}): SnapshotDoc<Snap> => ({
    _id: KEY,
    snapshot: { computedAt: Date.now() - MAX_AGE - 1000, value: 0 },
    ...extra,
});

describe('createSnapshotCache', () => {
    it('builds and stores a snapshot when there is none', async () => {
        const { cache, fake, computes } = setup();
        expect((await cache.get()).value).toBe(42);
        expect(computes()).toBe(1);
        expect(fake.docs.get(KEY)?.snapshot?.value).toBe(42);
    });

    it('returns a stored fresh snapshot without building', async () => {
        const { cache, computes } = setup(fresh());
        expect((await cache.get()).value).toBe(1);
        expect(computes()).toBe(0);
    });

    it('get() returns a stale snapshot without building', async () => {
        const { cache, computes } = setup(stale());
        expect((await cache.get()).value).toBe(0);
        expect(computes()).toBe(0);
    });

    it('getFresh() claims and rebuilds a stale, unclaimed snapshot', async () => {
        const { cache, fake, computes } = setup(stale());
        expect((await cache.getFresh()).value).toBe(42);
        expect(computes()).toBe(1);
        expect(fake.docs.get(KEY)?.rebuildingAt).toBeUndefined();
    });

    it('getFresh() returns the stale copy while another request holds the claim', async () => {
        const { cache, computes } = setup(stale({ rebuildingAt: Date.now() - 1000 }));
        expect((await cache.getFresh()).value).toBe(0);
        expect(computes()).toBe(0);
    });

    it('getFresh() takes over a claim older than two minutes', async () => {
        const { cache, computes } = setup(stale({ rebuildingAt: Date.now() - 3 * 60 * 1000 }));
        expect((await cache.getFresh()).value).toBe(42);
        expect(computes()).toBe(1);
    });

    it('releases the claim and rethrows when the build fails', async () => {
        const { cache, fake } = setup(stale(), async () => {
            throw new Error('boom');
        });
        await expect(cache.getFresh()).rejects.toThrow('boom');
        expect(fake.docs.get(KEY)?.rebuildingAt).toBeUndefined();
    });

    it('builds once for concurrent requests in one instance', async () => {
        const { cache, computes } = setup();
        const [a, b] = await Promise.all([cache.getFresh(), cache.getFresh()]);
        expect(a).toEqual(b);
        expect(computes()).toBe(1);
    });

    it('reuses a snapshot it read in the last minute without asking Mongo', async () => {
        const { cache, fake } = setup(fresh());
        await cache.get();
        await cache.get();
        await cache.getFresh();
        expect(fake.calls.findOne).toBe(1);
    });

    it('reports when the stored snapshot was built', async () => {
        const doc = fresh();
        const { cache } = setup(doc);
        expect(await cache.status()).toEqual({ computedAt: doc.snapshot!.computedAt, rebuildingAt: null });
    });
});
