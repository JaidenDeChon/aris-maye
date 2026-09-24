// repair-ingredient-links.ts
//
// Repoints ingredient references at the canonical document for their item.
//
// The OSRSBox dataset stores one document per in-game item id, and a name can cover
// many ids. "Acorn" is ids 5111-5114 (all flagged `duplicate`, no GE market), the real
// tradeable item 5312, and a bank placeholder 13759. Ingredient resolution used to take
// whichever document the database returned first, so creationSpecs ended up pointing at
// unpriced duplicates and anything built from them looked free.
//
// `populate-ingredients` now ranks candidates via `pickPreferredItem`, so newly scraped
// data is correct. This pass fixes links already stored.
//
// It only moves a link when the replacement is strictly more canonical, so it is
// idempotent and never reshuffles links that are merely tied.
//
// Run with:
//   bun run repair-ingredient-links
//   bun run repair-ingredient-links -- --dry-run

import mongoose from 'mongoose';
import consola from 'consola';
import { OsrsboxItemModel } from '../src/lib/models/mongo-schemas/osrsbox-db-item-schema';
import { itemPreferenceRank, pickPreferredItem } from '../src/lib/helpers/item-preference';

const logger = consola.create({ defaults: { tag: 'repair-ingredient-links' } });

const user = process.env.VITE_MONGO_USERNAME;
const pw = process.env.VITE_MONGO_PASSWORD;
const cluster = process.env.VITE_MONGO_DB_CLUSTER_NAME;
const host = process.env.VITE_MONGO_DB_HOST;
const dbName = process.env.VITE_MONGO_DB_DB_NAME || 'osrsbox';
const connectionString = `mongodb+srv://${user}:${pw}@${cluster}.${host}/${dbName}?retryWrites=true&w=majority`;

const DRY_RUN = process.argv.slice(2).includes('--dry-run');
const BATCH_SIZE = 500;

/** One ingredient reference inside a creation spec. */
type IngredientLink = {
    item?: mongoose.Types.ObjectId | null;
    [key: string]: unknown;
};

/**
 * A creation spec as read back for repair. Only `ingredients` is touched; the index
 * signature carries the other fields (experience, skills, tree metadata) through the
 * rewrite untouched.
 */
type CreationSpecLike = {
    ingredients?: IngredientLink[];
    [key: string]: unknown;
};

type CatalogDoc = {
    _id: mongoose.Types.ObjectId;
    id?: number;
    name?: string;
    duplicate?: boolean;
    placeholder?: boolean;
    noted?: boolean;
    tradeable_on_ge?: boolean;
};

/**
 * Loads every item once, indexed for lookup by `_id` and grouped by name.
 * @returns The per-document index and the name groups used to pick a canonical item.
 */
async function loadCatalog() {
    const docs = await OsrsboxItemModel.find(
        {},
        { _id: 1, id: 1, name: 1, duplicate: 1, placeholder: 1, noted: 1, tradeable_on_ge: 1 },
    )
        .lean<CatalogDoc[]>()
        .exec();

    const byId = new Map<string, CatalogDoc>();
    const byName = new Map<string, CatalogDoc[]>();

    for (const doc of docs) {
        byId.set(doc._id.toString(), doc);
        if (!doc.name) continue;
        const key = doc.name.trim().toLowerCase();
        const group = byName.get(key);
        if (group) group.push(doc);
        else byName.set(key, [doc]);
    }

    return { byId, byName, total: docs.length };
}

/**
 * Rewrites ingredient references that point at a less canonical document than exists.
 * @returns Counts describing what was scanned, changed and written.
 */
async function repairIngredientLinks() {
    const { byId, byName, total } = await loadCatalog();
    logger.info(`Catalog loaded: ${total} documents, ${byName.size} distinct names.`);

    const cursor = OsrsboxItemModel.find(
        { 'creationSpecs.0': { $exists: true } },
        { _id: 1, name: 1, creationSpecs: 1 },
    )
        .lean<{ _id: mongoose.Types.ObjectId; name?: string; creationSpecs?: CreationSpecLike[] }[]>()
        .cursor();

    let scanned = 0;
    let linksSeen = 0;
    let linksMoved = 0;
    let itemsChanged = 0;
    let written = 0;
    let operations: mongoose.AnyBulkWriteOperation[] = [];
    const samples: string[] = [];

    const flush = async () => {
        if (!operations.length) return;
        if (!DRY_RUN) {
            const result = await OsrsboxItemModel.bulkWrite(operations, { ordered: false });
            written += result.modifiedCount;
        }
        operations = [];
    };

    for await (const doc of cursor) {
        scanned += 1;
        let changed = false;

        for (const spec of doc.creationSpecs ?? []) {
            for (const ingredient of spec.ingredients ?? []) {
                const currentId = ingredient?.item;
                if (!currentId) continue;
                linksSeen += 1;

                const current = byId.get(currentId.toString());
                if (!current?.name) continue;

                const group = byName.get(current.name.trim().toLowerCase());
                if (!group || group.length < 2) continue;

                const preferred = pickPreferredItem(group);
                if (!preferred) continue;

                // Only move the link when the replacement is genuinely better. Equal ranks
                // are left alone so repeated runs converge instead of trading places.
                if (itemPreferenceRank(preferred) >= itemPreferenceRank(current)) continue;

                if (samples.length < 15) {
                    samples.push(
                        `  "${doc.name}" ingredient "${current.name}": id=${current.id} (dup=${current.duplicate === true}, ge=${current.tradeable_on_ge === true}) -> id=${preferred.id} (ge=${preferred.tradeable_on_ge === true})`,
                    );
                }

                ingredient.item = preferred._id;
                linksMoved += 1;
                changed = true;
            }
        }

        if (!changed) continue;

        itemsChanged += 1;
        operations.push({
            updateOne: { filter: { _id: doc._id }, update: { $set: { creationSpecs: doc.creationSpecs } } },
        });

        if (operations.length >= BATCH_SIZE) await flush();
    }

    await flush();

    if (samples.length) logger.info(`Example repairs:\n${samples.join('\n')}`);

    return { scanned, linksSeen, linksMoved, itemsChanged, written };
}

(async function main() {
    if (DRY_RUN) logger.info('Dry run — no writes will be performed.');

    try {
        logger.info(`Connecting to MongoDB (db: ${dbName})...`);
        await mongoose.connect(connectionString, { dbName });
        logger.success('Connection established.');

        const { scanned, linksSeen, linksMoved, itemsChanged, written } = await repairIngredientLinks();

        logger.info(
            [
                `Items with creation specs .......... ${scanned}`,
                `Ingredient links inspected ......... ${linksSeen}`,
                `Links repointed to canonical ....... ${linksMoved}`,
                `Items ${DRY_RUN ? 'that would be written' : 'written'} ............. ${DRY_RUN ? itemsChanged : written}`,
            ].join('\n'),
        );

        logger.success(
            DRY_RUN
                ? `Dry run complete | links-to-move=${linksMoved} items-to-write=${itemsChanged}`
                : `Repair complete | links-moved=${linksMoved} items-written=${written}`,
        );
    } catch (error) {
        logger.error(`Error in script: ${error}`);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        logger.info('MongoDB connection closed.');
    }
})();
