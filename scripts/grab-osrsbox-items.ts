// To use this file, clone the OSRSBox repo to this directory:
// git clone https://github.com/0xNeffarion/osrsreboxed-db.git osrsbox-db
// Then run this script with `bun run scripts/grab-osrsbox-items.ts`.

import mongoose from 'mongoose';
import consola from 'consola';
import logUpdate from 'log-update';
import { OsrsboxItemModel } from '../src/lib/models/mongo-schemas/osrsbox-db-item-schema';
import type { IOsrsboxItem } from '../src/lib/models/osrsbox-db-item';
import { deriveWikiPageIdentity } from '../src/lib/helpers/wiki-page-title';

/**
 * ====================================================================================================================
 * Logging setup.
 * ====================================================================================================================
 */

/** Logger instance for the grab-osrsbox-items script. */
const logger = consola.create({ defaults: { tag: 'grab-osrsbox-items' } });

/** Creates a scoped logger with an optional source name. */
function scopedLogger(scope: string, sourceName?: string) {
    const tag = sourceName ? `${scope}:${sourceName}` : scope;
    return logger.withTag(tag);
}

/** Formats a range for display. */
function formatRange(from: number, to: number): string {
    return from === to ? `${from}` : `${from}-${to}`;
}

/** Renders the progress of a batch operation. */
function renderBatchProgress(params: {
    sourceName: string;
    batchRange: [number, number];
    consecutive404: number;
    fetchedTotal: number;
    insertedTotal: number;
    modifiedTotal: number;
    errorCount: number;
    skippedTotal: number;
}) {
    const {
        sourceName,
        batchRange,
        consecutive404,
        fetchedTotal,
        insertedTotal,
        modifiedTotal,
        errorCount,
        skippedTotal,
    } = params;

    logUpdate(
        `[${sourceName}] batch ${formatRange(batchRange[0], batchRange[1])} | fetched=${fetchedTotal} inserted=${insertedTotal} modified=${modifiedTotal} skipped=${skippedTotal} errors=${errorCount} | consecutive 404s=${consecutive404}`,
    );
}

/** Completes the batch progress logging. */
function finishBatchProgress() {
    logUpdate.done();
}

/**
 * ====================================================================================================================
 * Variable setup.
 * ====================================================================================================================
 */

const START_ID = 0;
const ABSOLUTE_END_ID = 40_000;
const MAX_CONSECUTIVE_404 = 500;
const BATCH_SIZE = 12;
const MONGODB_REQUEST_POLITENESS_DELAY_MS = 0;
const LOCAL_ITEMS_DIR = new URL('./osrsbox-db/docs/items-json/', import.meta.url);
const SKIP_UNTRADEABLE = process.env.OSRSBOX_SKIP_UNTRADEABLE === 'true';
const SKIP_NOTED = process.env.OSRSBOX_SKIP_NOTED === 'true';

const user = process.env.VITE_MONGO_USERNAME;
const pw = process.env.VITE_MONGO_PASSWORD;
const cluster = process.env.VITE_MONGO_DB_CLUSTER_NAME;
const host = process.env.VITE_MONGO_DB_HOST;
const dbName = process.env.VITE_MONGO_DB_DB_NAME || 'osrsbox';
const prepend = 'mongodb+srv';
const append = '?retryWrites=true&w=majority';
const connectionString = `${prepend}://${user}:${pw}@${cluster}.${host}/${dbName}${append}`;

/**
 * ====================================================================================================================
 * Utility functions and types.
 * ====================================================================================================================
 */

/** Result of fetching an item. */
interface FetchResult {
    id: number;
    item: IOsrsboxItem | null;
    status: number; // HTTP status
    url: string;
}

/** Simple sleep helper. */
function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ====================================================================================================================
 * Main script logic.
 * ====================================================================================================================
 */

/**
 * Fetch a single item JSON by ID from the local filesystem.
 * @param baseUrl - Base URL of the items directory.
 * @param id - Item ID to fetch.
 * @param sourceName - Name of the data source (for logging).
 * @returns FetchResult containing item data or error status.
 */
async function fetchItem(baseUrl: URL, id: number, sourceName: string): Promise<FetchResult> {
    const fileUrl = new URL(`${id}.json`, baseUrl);
    const fetchLog = scopedLogger('fetch', sourceName);

    try {
        const file = Bun.file(fileUrl);
        const json = await file.text();
        const item = JSON.parse(json) as IOsrsboxItem;
        return { id, item, status: 200, url: fileUrl.href };
    } catch (error) {
        fetchLog.error(`Failed to read ${fileUrl.href} | error=${error}`);
        return { id, item: null, status: 500, url: fileUrl.href };
    }
}

/**
 * Upsert items into MongoDB based on their `id` field.
 * @param items - Array of game items to upsert.
 * @param context - Context information for logging.
 * @returns Object with counts of inserted and modified items.
 */
async function upsertGameItems(
    items: IOsrsboxItem[],
    context: { sourceName: string; batchRange: [number, number] },
): Promise<{ inserted: number; modified: number }> {
    if (!items.length) return { inserted: 0, modified: 0 };

    const upsertLog = scopedLogger('upsert', context.sourceName);

    const ops = items.map((item) => {
        // Preserve any existing creationSpecs by never updating them from this source.
        const { creationSpecs, ...itemWithoutCreationSpecs } = item;

        // OSRSBox has no field for the real wiki page title, so derive it on the way in.
        // Doing it here (rather than only in a repair pass) keeps re-imports correct.
        const { wikiPageTitle, wikiVersion } = deriveWikiPageIdentity(item);

        const update: {
            $set: typeof itemWithoutCreationSpecs;
            $setOnInsert?: { creationSpecs: IOsrsboxItem['creationSpecs'] };
        } = {
            $set: {
                ...itemWithoutCreationSpecs,
                wiki_page_title: wikiPageTitle,
                wiki_version: wikiVersion,
            },
        };

        if (creationSpecs !== undefined) {
            update.$setOnInsert = { creationSpecs };
        }

        return {
            updateOne: {
                filter: { id: item.id },
                update,
                upsert: true,
            },
        };
    });

    const result = await OsrsboxItemModel.bulkWrite(ops, { ordered: false });

    upsertLog.success(
        `Batch ${formatRange(context.batchRange[0], context.batchRange[1])} | inserted=${result.upsertedCount} modified=${result.modifiedCount} size=${items.length}`,
    );

    return { inserted: result.upsertedCount, modified: result.modifiedCount };
}

/**
 * Import items starting from `startId`, stopping when we see MAX_CONSECUTIVE_404
 * missing IDs in a row, or we hit ABSOLUTE_END_ID.
 * @param baseUrl - Base URL of the items directory.
 * @param sourceName - Name of the data source (for logging).
 * @param startId - ID to start importing from.
 */
async function importItemsFrom(params: { baseUrl: URL; sourceName: string; startId: number }) {
    const { baseUrl, sourceName, startId } = params;
    const importLog = scopedLogger('import', sourceName);
    const fetchLog = scopedLogger('fetch', sourceName);

    importLog.start(
        `Start import at id=${startId} | stop after ${MAX_CONSECUTIVE_404} consecutive 404s or id>${ABSOLUTE_END_ID} | base=${baseUrl.href}`,
    );

    let currentId = startId;
    let consecutive404 = 0;
    let fetchedCount = 0;
    let total404 = 0;
    let insertedTotal = 0;
    let modifiedTotal = 0;
    let errorCount = 0;
    let skippedTotal = 0;

    while (currentId <= ABSOLUTE_END_ID && consecutive404 < MAX_CONSECUTIVE_404) {
        const remaining = ABSOLUTE_END_ID - currentId + 1;
        const batchSize = Math.min(BATCH_SIZE, remaining);

        const batchIds = Array.from({ length: batchSize }, (_, idx) => currentId + idx);
        const batchRange: [number, number] = [batchIds[0], batchIds[batchIds.length - 1]];

        renderBatchProgress({
            sourceName,
            batchRange,
            consecutive404,
            fetchedTotal: fetchedCount,
            insertedTotal,
            modifiedTotal,
            errorCount,
            skippedTotal,
        });

        const results = await Promise.all(batchIds.map((id) => fetchItem(baseUrl, id, sourceName)));

        const itemsToUpsert: IOsrsboxItem[] = [];

        for (const result of results) {
            const { id, item, status, url } = result;

            if (item) {
                fetchedCount += 1;
                consecutive404 = 0;

                // Optional filters (default is to import everything).
                if ((SKIP_UNTRADEABLE && !item.tradeable) || (SKIP_NOTED && item.noted)) {
                    skippedTotal += 1;
                    continue;
                }

                itemsToUpsert.push(item);
            } else if (status === 404) {
                consecutive404 += 1;
                total404 += 1;
            } else {
                // Some other error; log, but don't increment 404 streak
                errorCount += 1;
                fetchLog.warn(`Non-404 response for id=${id} | status=${status} | url=${url}`);
            }

            if (consecutive404 >= MAX_CONSECUTIVE_404) {
                importLog.info(
                    `Hit ${MAX_CONSECUTIVE_404} consecutive 404s at id=${id}. Assuming we're past the end for this source.`,
                );
                break;
            }
        }

        if (itemsToUpsert.length) {
            const upsertTotals = await upsertGameItems(itemsToUpsert, { sourceName, batchRange });
            insertedTotal += upsertTotals.inserted;
            modifiedTotal += upsertTotals.modified;
        } else importLog.info(`No valid items in batch ${formatRange(batchRange[0], batchRange[1])}`);

        renderBatchProgress({
            sourceName,
            batchRange,
            consecutive404,
            fetchedTotal: fetchedCount,
            insertedTotal,
            modifiedTotal,
            errorCount,
            skippedTotal,
        });

        currentId += batchSize;

        // Gentle pause between batches so we don't hammer their server
        if (currentId <= ABSOLUTE_END_ID && consecutive404 < MAX_CONSECUTIVE_404)
            await sleep(MONGODB_REQUEST_POLITENESS_DELAY_MS);
    }

    finishBatchProgress();

    importLog.success(
        `Import finished | last attempted id=${currentId - 1} | fetched=${fetchedCount} | inserted=${insertedTotal} | modified=${modifiedTotal} | skipped=${skippedTotal} | total404=${total404} | errors=${errorCount}`,
    );
}

/**
 * ====================================================================================================================
 * Main function.
 * ====================================================================================================================
 */

(async function main() {
    try {
        const mainLog = scopedLogger('main');

        mainLog.info('Connecting to MongoDB...');

        await mongoose.connect(connectionString, { dbName });

        mainLog.success('Connection established.');

        mainLog.box(`Starting import.`);

        await importItemsFrom({
            baseUrl: LOCAL_ITEMS_DIR,
            sourceName: LOCAL_ITEMS_DIR.pathname.split('/').pop() || 'local-items',
            startId: START_ID,
        });

        mainLog.success('Finished processing all data sources.');
    } catch (error) {
        scopedLogger('main').error(`Error in script: ${error}`);
    } finally {
        await mongoose.disconnect();
        scopedLogger('main').info('MongoDB connection closed.');
    }
})();
