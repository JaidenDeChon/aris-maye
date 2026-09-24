import { OsrsboxItemModel } from '../models/mongo-schemas/osrsbox-db-item-schema';
import { CollectionMetadataModel } from '../models/mongo-schemas/collection-metadata-schema';
import { geDataCombined } from './grand-exchange-api-service';
import consola from 'consola';
import type { AnyBulkWriteOperation } from 'mongoose';

const logger = consola.create({ defaults: { tag: 'price-sync' } });
const SENTINEL_PRICE = 2147483647;

function isValidPrice(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < SENTINEL_PRICE;
}

function isValidTime(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Updates the prices of all GameItems in the database.
 */
export async function updateAllGameItemPricesInMongo(): Promise<void> {
    const updatedGameItems = await geDataCombined();
    const gameItemsInMongo = await OsrsboxItemModel.find(
        {},
        {
            _id: 1,
            id: 1,
            tradeable_on_ge: 1,
            highPrice: 1,
            lowPrice: 1,
        },
    )
        .lean()
        .exec();

    const bulkOperations: AnyBulkWriteOperation[] = [];
    const missingData: number[] = [];
    let geEligibleCount = 0;
    let skippedNonGe = 0;
    let clearedSentinelCount = 0;

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

        const setUpdate: Record<string, number> = {};
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

    logger.info(
        `Prepared ${bulkOperations.length} price updates out of ${geEligibleCount} GE-eligible items (${missingData.length} missing GE data).`,
    );
    if (skippedNonGe) {
        logger.info(`Skipped ${skippedNonGe} items not tradeable on GE.`);
    }
    if (clearedSentinelCount) {
        logger.info(`Cleared sentinel price values on ${clearedSentinelCount} fields.`);
    }

    // Update the data to the database.
    if (!bulkOperations.length) {
        logger.warn('No price updates to write.');
    } else {
        const bulkResult = await OsrsboxItemModel.bulkWrite(bulkOperations);

        logger.success(
            `Bulk write complete | matched=${bulkResult.matchedCount} modified=${bulkResult.modifiedCount} upserted=${bulkResult.upsertedCount}`,
        );
    }
    if (missingData.length) {
        const sample = missingData.slice(0, 10).join(', ');
        logger.warn(
            `Missing GE data for ${missingData.length} items; first few ids: ${sample}${missingData.length > 10 ? '…' : ''}`,
        );
    }

    const collectionName = 'items';
    const lastUpdated = Date.now();

    // Update the collection metadata.
    await CollectionMetadataModel.findOneAndUpdate(
        { collectionName },
        { lastUpdated, collectionName },
        { upsert: true },
    ).exec();

    logger.info(`Collection metadata updated for "${collectionName}" at ${new Date(lastUpdated).toISOString()}`);

    return;
}
