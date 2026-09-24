import mongoose from 'mongoose';

const user = process.env.VITE_MONGO_USERNAME;
const pw = process.env.VITE_MONGO_PASSWORD;
const cluster = process.env.VITE_MONGO_DB_CLUSTER_NAME;
const host = process.env.VITE_MONGO_DB_HOST;
const sourceDbName = process.env.OSRSBOX_SOURCE_DB;
const targetDbName = process.env.OSRSBOX_TARGET_DB;
const prepend = 'mongodb+srv';
const append = '?retryWrites=true&w=majority';

const MAX_ATTEMPTS = Number(process.env.OSRSBOX_COPY_RETRIES || 3);
const RETRY_DELAY_MS = Number(process.env.OSRSBOX_COPY_RETRY_DELAY_MS || 2000);

function shouldSkipCollection(name: string): boolean {
    return name.startsWith('system.');
}

function buildIndexSpecs(indexes: Awaited<ReturnType<typeof mongoose.Collection.prototype.indexes>>) {
    return indexes
        .filter((idx) => idx.name !== '_id_')
        .map((idx) => {
            const spec: Record<string, unknown> = {
                key: idx.key,
                name: idx.name,
            };

            if (idx.unique) spec.unique = true;
            if (idx.sparse) spec.sparse = true;
            if (idx.expireAfterSeconds != null) spec.expireAfterSeconds = idx.expireAfterSeconds;
            if (idx.partialFilterExpression) spec.partialFilterExpression = idx.partialFilterExpression;
            if (idx.collation) spec.collation = idx.collation;

            return spec;
        });
}

async function delay(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
        attempt += 1;
        try {
            return await fn();
        } catch (err) {
            const isLast = attempt >= MAX_ATTEMPTS;
            console.warn(`[db-copy] ${label} failed (attempt ${attempt}/${MAX_ATTEMPTS}).`);
            if (isLast) throw err;
            await delay(RETRY_DELAY_MS);
        }
    }
}

async function main() {
    if (!user || !pw || !cluster || !host) {
        console.error('[db-copy] Missing MongoDB env vars.');
        process.exit(1);
    }

    if (!sourceDbName || !targetDbName) {
        console.error('[db-copy] Missing OSRSBOX_SOURCE_DB or OSRSBOX_TARGET_DB.');
        process.exit(1);
    }

    if (sourceDbName === targetDbName) {
        console.error('[db-copy] Source and target DB names are the same; aborting.');
        process.exit(1);
    }

    const connectionString = `${prepend}://${user}:${pw}@${cluster}.${host}/${sourceDbName}${append}`;

    console.log(`[db-copy] Connecting to MongoDB (source db: ${sourceDbName})...`);
    await mongoose.connect(connectionString);

    try {
        const db = mongoose.connection.db;
        if (!db) throw new Error('MongoDB connection is not available.');

        const collections = await db.listCollections({}, { nameOnly: true }).toArray();
        const sourceCollections = collections
            .map((c) => c.name)
            .filter((name): name is string => Boolean(name))
            .filter((name) => !shouldSkipCollection(name));

        if (sourceCollections.length === 0) {
            throw new Error(`No collections found in source db "${sourceDbName}".`);
        }

        console.log(`[db-copy] Found ${sourceCollections.length} collection(s): ${sourceCollections.join(', ')}`);
        console.log(`[db-copy] Copying into target db "${targetDbName}"...`);

        const targetConn = mongoose.connection.useDb(targetDbName, { useCache: true });
        const targetDb = targetConn.db;
        if (!targetDb) throw new Error(`Target db "${targetDbName}" is not available.`);

        for (const collectionName of sourceCollections) {
            console.log(`[db-copy]  - ${collectionName}`);

            await withRetry(`${targetDbName}.${collectionName} $out`, async () => {
                await db
                    .collection(collectionName)
                    .aggregate([{ $match: {} }, { $out: { db: targetDbName, coll: collectionName } }], {
                        allowDiskUse: true,
                    })
                    .toArray();
            });

            const indexes = await withRetry(`${collectionName} indexes`, async () => db.collection(collectionName).indexes());
            const indexSpecs = buildIndexSpecs(indexes);

            if (indexSpecs.length > 0) {
                await withRetry(`${targetDbName}.${collectionName} createIndexes`, async () =>
                    targetDb.collection(collectionName).createIndexes(indexSpecs),
                );
            }
        }

        console.log('[db-copy] Done.');
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    void main();
}
