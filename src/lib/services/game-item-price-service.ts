import mongoose from 'mongoose';
import { geDataCombined, prices } from './grand-exchange-api-service';
import { VOLUME_HISTORY_VERSION } from '../constants/market';
import {
    mergeVolumeHours,
    missingVolumeHours,
    toVolumeEntry,
    type HourlyPrice,
    type VolumeHistoryEntry,
} from '../helpers/volume-history';
import consola from 'consola';

const logger = consola.create({ defaults: { tag: 'price-sync' } });
const SENTINEL_PRICE = 2147483647;

function isValidPrice(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < SENTINEL_PRICE;
}

function isValidTime(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

type FetchedHour = { hour: number; data: Record<string, HourlyPrice> };

/** How many past hours to ask the wiki for at once when backfilling. */
const BACKFILL_CONCURRENCY = 6;

/**
 * The last full hour of trading, from the wiki's `/1h` endpoint, with the hour it covers.
 *
 * Volume is a bonus on top of prices, so a failed fetch is logged and the run carries on with
 * prices alone. That hour is simply missing from every item's history until a later run backfills it.
 */
async function fetchLastHour(): Promise<FetchedHour | null> {
    try {
        const data = await prices({ timestep: '1h', timestamp: '' });
        const hour = Object.values(data)[0]?.timestamp;
        if (typeof hour !== 'number' || !Number.isFinite(hour)) {
            logger.warn('Hourly volume data had no timestamp; skipping volume this run.');
            return null;
        }
        return { hour, data };
    } catch (error) {
        logger.error('Failed to fetch hourly volume data; skipping volume this run.', error);
        return null;
    }
}

/**
 * Past hours from the wiki's `/1h` endpoint, a few at a time. An hour that fails to load is left out
 * and tried again on the next run. Hours already in `cache` aren't fetched again, so a run that
 * updates several databases asks for each hour once.
 */
async function fetchPastHours(hours: number[], cache: Map<number, FetchedHour>): Promise<FetchedHour[]> {
    const queue = hours.filter((hour) => !cache.has(hour));
    const workers = Array.from({ length: Math.min(BACKFILL_CONCURRENCY, queue.length) }, async () => {
        for (let hour = queue.shift(); hour !== undefined; hour = queue.shift()) {
            try {
                const data = await prices({ timestep: '1h', timestamp: String(hour) });
                cache.set(hour, { hour, data });
            } catch (error) {
                logger.warn(`Failed to fetch trade volume for ${new Date(hour * 1000).toISOString()}.`, error);
            }
        }
    });
    await Promise.all(workers);
    return hours.flatMap((hour) => cache.get(hour) ?? []);
}

type PriceSources = {
    updatedGameItems: Awaited<ReturnType<typeof geDataCombined>>;
    lastHour: FetchedHour | null;
    /** Past hours fetched so far this run, shared between databases. */
    pastHours: Map<number, FetchedHour>;
};

type ItemPriceFields = {
    _id: mongoose.Types.ObjectId;
    id: number;
    tradeable_on_ge?: boolean;
    highPrice?: number;
    lowPrice?: number;
    volumeHistory?: VolumeHistoryEntry[];
};

/**
 * Updates the prices of all GameItems, and their rolling trade volume, in the site's database and
 * in each of `extraDbNames`.
 *
 * The wiki is asked once and every database gets the same numbers. The extra databases are for
 * deploy previews: Netlify only runs scheduled functions for production, so a database only
 * previews read would otherwise never get prices. A failure on one of them is logged and doesn't
 * stop the run.
 * @param extraDbNames - Other databases on the same cluster to update too.
 */
export async function updateAllGameItemPricesInMongo(extraDbNames: string[] = []): Promise<void> {
    const [updatedGameItems, lastHour] = await Promise.all([geDataCombined(), fetchLastHour()]);
    const sources: PriceSources = { updatedGameItems, lastHour, pastHours: new Map() };

    const mainDb = mongoose.connection.db;
    if (!mainDb) throw new Error('Not connected to MongoDB.');
    await updatePricesInDb(mainDb, sources);

    for (const name of new Set(extraDbNames)) {
        if (!name || name === mainDb.databaseName) continue;
        try {
            const db = mongoose.connection.useDb(name, { useCache: true }).db;
            if (!db) throw new Error(`No handle for database "${name}".`);
            await updatePricesInDb(db, sources);
        } catch (error) {
            logger.error(`Failed to update prices in "${name}"; carrying on.`, error);
        }
    }
}

/** Writes one fetch's prices and trade volume to one database. */
async function updatePricesInDb(
    db: mongoose.mongo.Db,
    { updatedGameItems, lastHour, pastHours }: PriceSources,
): Promise<void> {
    const startedAt = Date.now();
    const log = consola.create({ defaults: { tag: `price-sync:${db.databaseName}` } });
    const items = db.collection('items');
    const gameItemsInMongo = (await items
        .find(
            {},
            {
                projection: {
                    _id: 1,
                    id: 1,
                    tradeable_on_ge: 1,
                    highPrice: 1,
                    lowPrice: 1,
                    volumeHistory: 1,
                },
            },
        )
        .toArray()) as unknown as ItemPriceFields[];

    // History recorded under an older VOLUME_HISTORY_VERSION is fetched again in full, not mixed in.
    const metadata = await db.collection('metadata').findOne({ collectionName: 'items' });
    if (metadata?.volumeHistoryVersion !== VOLUME_HISTORY_VERSION) {
        log.info('Trade history is from an older version; fetching the whole day again.');
        for (const item of gameItemsInMongo) item.volumeHistory = [];
    }

    // Fill in any of the last day's hours this database is missing, then record them with the latest.
    let hoursToRecord: FetchedHour[] = [];
    if (lastHour) {
        const present = new Set(gameItemsInMongo.flatMap((item) => (item.volumeHistory ?? []).map((entry) => entry.t)));
        const backfill = await fetchPastHours(missingVolumeHours(present, lastHour.hour), pastHours);
        hoursToRecord = [lastHour, ...backfill];
    }

    const bulkOperations: mongoose.mongo.AnyBulkWriteOperation[] = [];
    const missingData: number[] = [];
    let geEligibleCount = 0;
    let skippedNonGe = 0;
    let clearedSentinelCount = 0;
    let volumeUpdates = 0;

    // Update the price of every game item in MongoDB.
    for (const item of gameItemsInMongo) {
        if (!item.tradeable_on_ge) {
            skippedNonGe += 1;
            continue;
        }

        geEligibleCount += 1;
        const fullItemData = updatedGameItems[item.id];
        if (!fullItemData) {
            missingData.push(item.id);
            continue;
        }

        const setUpdate: Record<string, unknown> = {};
        const unsetUpdate: Record<string, ''> = {};

        if (isValidPrice(fullItemData.highPrice)) {
            setUpdate.highPrice = fullItemData.highPrice;
            if (isValidTime(fullItemData.highTime)) {
                setUpdate.highTime = fullItemData.highTime;
            }
        } else if (item.highPrice === SENTINEL_PRICE) {
            unsetUpdate.highPrice = '';
            unsetUpdate.highTime = '';
            clearedSentinelCount += 1;
        }

        if (isValidPrice(fullItemData.lowPrice)) {
            setUpdate.lowPrice = fullItemData.lowPrice;
            if (isValidTime(fullItemData.lowTime)) {
                setUpdate.lowTime = fullItemData.lowTime;
            }
        } else if (item.lowPrice === SENTINEL_PRICE) {
            unsetUpdate.lowPrice = '';
            unsetUpdate.lowTime = '';
            clearedSentinelCount += 1;
        }

        if (hoursToRecord.length) {
            const entries = hoursToRecord.map((fetched) => toVolumeEntry(fetched.data[item.id], fetched.hour));
            const summary = mergeVolumeHours(item.volumeHistory, entries);
            setUpdate.volumeHistory = summary.volumeHistory;
            setUpdate.volume1h = summary.volume1h;
            setUpdate.volume24h = summary.volume24h;
            setUpdate.priceChange24h = summary.priceChange24h;
            setUpdate.typicalPrice24h = summary.typicalPrice24h;
            setUpdate.tradedHours24h = summary.tradedHours;
            volumeUpdates += 1;
        }

        if (!Object.keys(setUpdate).length && !Object.keys(unsetUpdate).length) {
            missingData.push(item.id);
            continue;
        }

        const updateOps: Record<string, Record<string, unknown>> = {};
        if (Object.keys(setUpdate).length) updateOps.$set = setUpdate;
        if (Object.keys(unsetUpdate).length) updateOps.$unset = unsetUpdate;

        bulkOperations.push({
            updateOne: {
                filter: { _id: item._id },
                update: updateOps,
                upsert: true,
            },
        });
    }

    log.info(
        `Prepared ${bulkOperations.length} price updates out of ${geEligibleCount} GE-eligible items (${missingData.length} missing GE data).`,
    );
    if (skippedNonGe) {
        log.info(`Skipped ${skippedNonGe} items not tradeable on GE.`);
    }
    if (lastHour) {
        const backfilled = hoursToRecord.length - 1;
        log.info(
            `Recorded trade volume for ${volumeUpdates} items for the hour starting ${new Date(lastHour.hour * 1000).toISOString()}${backfilled ? `, and backfilled ${backfilled} earlier hour${backfilled === 1 ? '' : 's'}` : ''}.`,
        );
    }
    if (clearedSentinelCount) {
        log.info(`Cleared sentinel price values on ${clearedSentinelCount} fields.`);
    }

    // Update the data to the database.
    if (!bulkOperations.length) {
        log.warn('No price updates to write.');
    } else {
        const bulkResult = await items.bulkWrite(bulkOperations, { ordered: false });

        log.success(
            `Bulk write complete | matched=${bulkResult.matchedCount} modified=${bulkResult.modifiedCount} upserted=${bulkResult.upsertedCount}`,
        );
    }
    if (missingData.length) {
        const sample = missingData.slice(0, 10).join(', ');
        log.warn(
            `Missing GE data for ${missingData.length} items; first few ids: ${sample}${missingData.length > 10 ? '…' : ''}`,
        );
    }

    const collectionName = 'items';
    const lastUpdated = Date.now();

    // Update the collection metadata. Only a run that recorded volume brings the history up to this version.
    const metadataUpdate: Record<string, unknown> = { lastUpdated, collectionName };
    if (lastHour) metadataUpdate.volumeHistoryVersion = VOLUME_HISTORY_VERSION;
    await db.collection('metadata').updateOne({ collectionName }, { $set: metadataUpdate }, { upsert: true });

    log.info(
        `Collection metadata updated for "${collectionName}" at ${new Date(lastUpdated).toISOString()} (took ${((lastUpdated - startedAt) / 1000).toFixed(1)}s)`,
    );
}
