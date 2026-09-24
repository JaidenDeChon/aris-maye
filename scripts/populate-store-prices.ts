// populate-store-prices.ts
//
// Records what shops pay for each item, and how that falls as you sell them more.
//
// Scrapes shop pages rather than item pages. The numbers live in `StoreTableHead` /
// `StoreLine` template parameters that an item page never renders, and there are ~508
// shops against ~28,700 items, so this is one pass of a few hundred requests instead of
// tens of thousands.
//
// Prices are derived from the item's own `cost` and the shop's per-mille multipliers, so
// they stay consistent with the rest of the dataset rather than depending on whatever the
// wiki happened to render.
//
// Run with:
//   bun run populate-store-prices -- --dry-run
//   bun run populate-store-prices

import mongoose from 'mongoose';
import { OsrsboxItemModel } from '../src/lib/models/mongo-schemas/osrsbox-db-item-schema';
import type { GameItemStorePrice } from '../src/lib/models/osrsbox-db-item';
import { pickPreferredItem } from '../src/lib/helpers/item-preference';
import { summarizeStoreSale } from '../src/lib/helpers/store-price';
import { getStorePage, listShopPages, type StorePage } from './osrs-wiki-stores';

const user = process.env.VITE_MONGO_USERNAME;
const pw = process.env.VITE_MONGO_PASSWORD;
const cluster = process.env.VITE_MONGO_DB_CLUSTER_NAME;
const host = process.env.VITE_MONGO_DB_HOST;
const dbName = process.env.VITE_MONGO_DB_DB_NAME || 'osrsbox';
const connectionString = `mongodb+srv://${user}:${pw}@${cluster}.${host}/${dbName}?retryWrites=true&w=majority`;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limit = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0) || Infinity;

type CandidateDoc = {
    _id: mongoose.Types.ObjectId;
    id?: number;
    name?: string;
    cost?: number;
    duplicate?: boolean;
    placeholder?: boolean;
    noted?: boolean;
    tradeable_on_ge?: boolean;
};

function normalizeName(value: string): string {
    return value.trim().toLowerCase();
}

/**
 * Indexes every item by name, keeping the most canonical document for each.
 *
 * A shop lists an item by name, and a name can cover many OSRSBox ids — the duplicates,
 * the bank placeholder and the real item. `pickPreferredItem` is the same ranking the
 * ingredient resolver uses, so store prices land on the same document ingredients do.
 * @returns Name (lowercased) to the preferred document.
 */
async function buildNameIndex(): Promise<Map<string, CandidateDoc>> {
    const docs = await OsrsboxItemModel.find(
        {},
        { _id: 1, id: 1, name: 1, cost: 1, duplicate: 1, placeholder: 1, noted: 1, tradeable_on_ge: 1 },
    )
        .lean<CandidateDoc[]>()
        .exec();

    const groups = new Map<string, CandidateDoc[]>();
    for (const doc of docs) {
        if (!doc.name) continue;
        const key = normalizeName(doc.name);
        const group = groups.get(key);
        if (group) group.push(doc);
        else groups.set(key, [doc]);
    }

    const index = new Map<string, CandidateDoc>();
    for (const [key, group] of groups) {
        const preferred = pickPreferredItem(group);
        if (preferred) index.set(key, preferred);
    }

    return index;
}

/**
 * Builds the stored record for one item at one shop.
 * @param shop - The shop's scraped terms.
 * @param stock - The shop's default stock of this item.
 * @param buyOverride - An explicit gp price the shop pays, when the page states one.
 * @param sellOverride - An explicit gp price the shop charges, when the page states one.
 * @param value - The item's base value.
 * @returns The record, or null when this shop offers nothing to a seller.
 */
function buildStorePrice(
    shop: StorePage,
    stock: number | null,
    buyOverride: number | null,
    sellOverride: number | null,
    value: number,
): GameItemStorePrice | null {
    if (!shop.buysFromPlayers) return null;

    // An explicit `buy=` is a fixed price the shop always pays, so there is no curve.
    if (buyOverride !== null) {
        return {
            shop: shop.title,
            firstPrice: buyOverride,
            floorPrice: buyOverride,
            dropPerSale: 0,
            salesToFloor: 0,
            buyPrice: sellOverride,
            stock,
            currency: shop.currency,
        };
    }

    if (shop.buyMultiplier === null) return null;

    const summary = summarizeStoreSale(value, { buyMultiplier: shop.buyMultiplier, delta: shop.delta ?? 0 });

    return {
        shop: shop.title,
        firstPrice: summary.firstPrice,
        floorPrice: summary.floorPrice,
        dropPerSale: summary.dropPerSale,
        salesToFloor: Number.isFinite(summary.salesToFloor) ? summary.salesToFloor : null,
        buyPrice:
            sellOverride ?? (shop.sellMultiplier !== null ? Math.floor((value * shop.sellMultiplier) / 1000) : null),
        stock,
        currency: shop.currency,
    };
}

async function main() {
    if (!user || !pw || !cluster || !host) {
        console.error('[store-prices] Missing MongoDB env vars.');
        process.exit(1);
    }

    console.log(`[store-prices] Connecting to MongoDB (db: ${dbName})...`);
    await mongoose.connect(connectionString, { dbName });

    try {
        console.log('[store-prices] Building item name index...');
        const index = await buildNameIndex();
        console.log(`[store-prices] Indexed ${index.size} distinct item names.`);

        const shopTitles = (await listShopPages()).slice(0, limit);
        console.log(`[store-prices] ${shopTitles.length} shop pages to read.`);

        const byItem = new Map<string, GameItemStorePrice[]>();
        let shopsParsed = 0;
        let noStockTable = 0;
        let unresolved = 0;
        let stockLines = 0;
        const unresolvedNames = new Set<string>();

        for (const [position, title] of shopTitles.entries()) {
            let shop: StorePage | null = null;
            try {
                shop = await getStorePage(title);
            } catch (err) {
                console.warn(`[store-prices] Failed to read "${title}": ${err}`);
                continue;
            }

            if (!shop) {
                noStockTable += 1;
            } else {
                shopsParsed += 1;
                for (const line of shop.items) {
                    stockLines += 1;
                    const doc = index.get(normalizeName(line.name));
                    if (!doc) {
                        unresolved += 1;
                        unresolvedNames.add(line.name);
                        continue;
                    }

                    const value = typeof doc.cost === 'number' ? doc.cost : 0;
                    const record = buildStorePrice(shop, line.stock, line.buyOverride, line.sellOverride, value);
                    if (!record) continue;

                    const key = doc._id.toString();
                    const existing = byItem.get(key);
                    if (existing) existing.push(record);
                    else byItem.set(key, [record]);
                }
            }

            if ((position + 1) % 25 === 0) {
                console.log(
                    `[store-prices] ${position + 1}/${shopTitles.length} shops read, ${byItem.size} items priced so far.`,
                );
            }
        }

        // Best first price first: the shop worth walking to is the one at the top.
        for (const records of byItem.values()) records.sort((a, b) => b.firstPrice - a.firstPrice);

        console.log(
            [
                `Shops with a stock table ........... ${shopsParsed}`,
                `Shops without one .................. ${noStockTable}`,
                `Stock lines read ................... ${stockLines}`,
                `Unresolved item names .............. ${unresolved} (${unresolvedNames.size} distinct)`,
                `Items with store prices ............ ${byItem.size}`,
            ].join('\n'),
        );

        if (unresolvedNames.size) {
            console.log(`[store-prices] Examples not matched: ${[...unresolvedNames].slice(0, 10).join(', ')}`);
        }

        if (dryRun) {
            console.log('[store-prices] Dry run — nothing written.');
            return;
        }

        // Clear first, so a shop that stops stocking an item does not leave a stale price
        // behind. This field is owned entirely by this script.
        const cleared = await OsrsboxItemModel.updateMany(
            { storePrices: { $exists: true } },
            { $unset: { storePrices: '' } },
        );

        let written = 0;
        let batch: mongoose.AnyBulkWriteOperation[] = [];
        const flush = async () => {
            if (!batch.length) return;
            written += (await OsrsboxItemModel.bulkWrite(batch, { ordered: false })).modifiedCount;
            batch = [];
        };

        for (const [id, records] of byItem) {
            batch.push({
                updateOne: {
                    filter: { _id: new mongoose.Types.ObjectId(id) },
                    update: { $set: { storePrices: records } },
                },
            });
            if (batch.length >= 500) await flush();
        }
        await flush();

        console.log(`[store-prices] Cleared ${cleared.modifiedCount} stale, wrote ${written} items.`);
    } catch (error) {
        console.error(`[store-prices] Error: ${error}`);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log('[store-prices] MongoDB connection closed.');
    }
}

void main();
