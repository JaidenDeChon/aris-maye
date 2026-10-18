import mongoose from 'mongoose';

/**
 * A cached, expensive-to-build document such as the homepage sections or a guide's tables, stored
 * in Mongo so every server instance shares it.
 *
 * On Netlify a function is frozen once it has answered, so a rebuild left running in the
 * background never finishes. Nothing here starts a rebuild it doesn't wait for.
 */

export type SnapshotDoc<T> = {
    _id: string;
    snapshot?: T;
    /** When a request last claimed this snapshot's rebuild. See `getFresh`. */
    rebuildingAt?: number;
};

/** The parts of a Mongo collection the cache uses, so tests can pass a fake. */
export type SnapshotCollection<T> = {
    findOne(filter: { _id: string }, options?: { projection?: Record<string, number> }): Promise<SnapshotDoc<T> | null>;
    updateOne(
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options?: { upsert?: boolean },
    ): Promise<{ modifiedCount: number }>;
};

export type SnapshotCacheOptions<T extends { computedAt: number }> = {
    collection: () => SnapshotCollection<T>;
    key: string;
    compute: () => Promise<T>;
    /** How old a snapshot can be before `getFresh` rebuilds it. */
    maxAgeMs: number;
    /** How long this server instance reuses a snapshot it already read, before asking Mongo again. */
    memoryMs?: number;
    /** How long a claimed rebuild holds off other requests before they assume it died and try again. */
    claimMs?: number;
};

export type SnapshotCache<T> = {
    get(): Promise<T>;
    getFresh(): Promise<T>;
    refresh(): Promise<T>;
    status(): Promise<{ computedAt: number | null; rebuildingAt: number | null }>;
};

export function mongoSnapshotCollection<T>(name: string): () => SnapshotCollection<T> {
    return () => mongoose.connection.collection<SnapshotDoc<T>>(name) as unknown as SnapshotCollection<T>;
}

export function createSnapshotCache<T extends { computedAt: number }>(
    options: SnapshotCacheOptions<T>,
): SnapshotCache<T> {
    const { collection, key, compute, maxAgeMs, memoryMs = 60 * 1000, claimMs = 2 * 60 * 1000 } = options;
    let remembered: { snapshot: T; readAt: number } | null = null;
    let inFlight: Promise<T> | null = null;

    const isStale = (snapshot: T) => Date.now() - snapshot.computedAt >= maxAgeMs;
    const remember = (snapshot: T) => {
        remembered = { snapshot, readAt: Date.now() };
        return snapshot;
    };
    const recentlyRead = () => (remembered && Date.now() - remembered.readAt < memoryMs ? remembered.snapshot : null);

    /** Rebuilds the snapshot and stores it. The hourly price job calls this so visitors rarely wait. */
    async function refresh(): Promise<T> {
        const snapshot = await compute();
        await collection().updateOne(
            { _id: key },
            { $set: { snapshot }, $unset: { rebuildingAt: '' } },
            { upsert: true },
        );
        return remember(snapshot);
    }

    /** Rebuilds once, however many requests in this instance ask for it at the same time. */
    function rebuildOnce(): Promise<T> {
        if (inFlight) return inFlight;
        inFlight = refresh().finally(() => {
            inFlight = null;
        });
        return inFlight;
    }

    /**
     * The snapshot, as fast as it can be had.
     *
     * - A snapshot this instance read in the last `memoryMs` comes straight from memory.
     * - Otherwise it's read from Mongo, and returned even when it's stale. A caller that cares
     *   checks `computedAt` and asks `getFresh` for a new one.
     * - Only when there's no snapshot at all does the caller wait for one to be built.
     */
    async function get(): Promise<T> {
        const memory = recentlyRead();
        if (memory) return memory;

        const cached = await collection().findOne({ _id: key });
        if (!cached?.snapshot) return rebuildOnce();
        return remember(cached.snapshot);
    }

    /**
     * A snapshot no older than `maxAgeMs`, rebuilt now if need be.
     *
     * Only one request across every server instance rebuilds a stale snapshot at a time: it claims
     * the rebuild in Mongo first, and any other request that finds it claimed gets the stale one
     * back.
     */
    async function getFresh(): Promise<T> {
        const memory = recentlyRead();
        if (memory && !isStale(memory)) return memory;

        const cached = await collection().findOne({ _id: key });
        if (!cached?.snapshot) return rebuildOnce();
        if (!isStale(cached.snapshot)) return remember(cached.snapshot);

        const now = Date.now();
        const claim = await collection().updateOne(
            { _id: key, $or: [{ rebuildingAt: { $exists: false } }, { rebuildingAt: { $lt: now - claimMs } }] },
            { $set: { rebuildingAt: now } },
        );
        if (!claim.modifiedCount) return cached.snapshot;

        try {
            return await rebuildOnce();
        } catch (error) {
            await collection()
                .updateOne({ _id: key }, { $unset: { rebuildingAt: '' } })
                .catch(() => {});
            throw error;
        }
    }

    /** When the stored snapshot was built, and whether a rebuild is claimed. */
    async function status() {
        const doc = await collection().findOne(
            { _id: key },
            { projection: { 'snapshot.computedAt': 1, rebuildingAt: 1 } },
        );
        return { computedAt: doc?.snapshot?.computedAt ?? null, rebuildingAt: doc?.rebuildingAt ?? null };
    }

    return { get, getFresh, refresh, status };
}
