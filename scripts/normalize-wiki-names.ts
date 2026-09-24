// normalize-wiki-names.ts
//
// Repairs `wiki_page_title` / `wiki_version` across the whole items collection.
//
// OSRSBox has no field for the real wiki page title. For items that live on a
// "switch infobox" page it synthesises `wiki_name` as "<page title> (<version>)" and
// anchors `wiki_url` at the version — e.g. "Oak seedling (Watered)" pointing at
// ".../w/Oak_seedling#Watered". There is no page by that name, so any scrape keyed on
// `wiki_name` 404s. Around 8,300 of ~28,700 items are affected.
//
// This pass derives the real title from `wiki_url` and stores it alongside the
// original fields, which are left untouched. It is idempotent: running it twice is a
// no-op, and it only writes documents whose derived values actually differ.
//
// Run with:
//   bun run normalize-wiki-names
//   bun run normalize-wiki-names -- --dry-run

import mongoose from 'mongoose';
import consola from 'consola';
import { OsrsboxItemModel } from '../src/lib/models/mongo-schemas/osrsbox-db-item-schema';
import { deriveWikiPageIdentity } from '../src/lib/helpers/wiki-page-title';

const logger = consola.create({ defaults: { tag: 'normalize-wiki-names' } });

const user = process.env.VITE_MONGO_USERNAME;
const pw = process.env.VITE_MONGO_PASSWORD;
const cluster = process.env.VITE_MONGO_DB_CLUSTER_NAME;
const host = process.env.VITE_MONGO_DB_HOST;
const dbName = process.env.VITE_MONGO_DB_DB_NAME || 'osrsbox';
const connectionString = `mongodb+srv://${user}:${pw}@${cluster}.${host}/${dbName}?retryWrites=true&w=majority`;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = 1_000;

type WikiFields = {
    _id: mongoose.Types.ObjectId;
    id?: number;
    name?: string | null;
    wiki_name?: string | null;
    wiki_url?: string | null;
    wiki_page_title?: string | null;
    wiki_version?: string | null;
};

/** Outcome counters for a normalization run. */
type NormalizeReport = {
    scanned: number;
    /** Documents whose stored fields differ from the derived ones, so they get written. */
    changed: number;
    /** Documents actually modified (always 0 on a dry run). */
    written: number;
    /**
     * Of `changed`, the documents where the derived title differs from `wiki_name`.
     *
     * This is the number that matters: it is the count of items whose wiki lookups
     * actually behave differently afterwards. The rest are simply having two brand-new
     * fields populated for the first time with a value the old code already used, which
     * is why `changed` is ~the entire collection on the first run.
     */
    behaviourChanged: number;
    /** Documents carrying an infobox version label. */
    versioned: number;
};

/**
 * Rewrites `wiki_page_title` / `wiki_version` for every item that needs it.
 * @returns Counters describing what the run scanned, changed and wrote.
 */
async function normalizeWikiNames(): Promise<NormalizeReport> {
    const cursor = OsrsboxItemModel.find(
        {},
        { _id: 1, id: 1, name: 1, wiki_name: 1, wiki_url: 1, wiki_page_title: 1, wiki_version: 1 },
    )
        .lean<WikiFields[]>()
        .cursor();

    let scanned = 0;
    let changed = 0;
    let written = 0;
    let versioned = 0;
    let behaviourChanged = 0;
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

        const { wikiPageTitle, wikiVersion } = deriveWikiPageIdentity(doc);
        if (wikiVersion) versioned += 1;

        const alreadyCorrect =
            (doc.wiki_page_title ?? null) === wikiPageTitle && (doc.wiki_version ?? null) === wikiVersion;
        if (alreadyCorrect) continue;

        changed += 1;

        // Distinguish "field is being populated for the first time" from "this item will
        // now resolve to a different wiki page". Only the latter changes any behaviour.
        if (wikiPageTitle !== (doc.wiki_name ?? null)) behaviourChanged += 1;

        // Surface a few real corrections so a dry run is actually informative.
        if (samples.length < 15 && wikiVersion && wikiPageTitle !== doc.wiki_name) {
            samples.push(`  id=${doc.id} "${doc.wiki_name}" -> "${wikiPageTitle}" (version: ${wikiVersion})`);
        }

        operations.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { wiki_page_title: wikiPageTitle, wiki_version: wikiVersion } },
            },
        });

        if (operations.length >= BATCH_SIZE) await flush();
    }

    await flush();

    if (samples.length) {
        logger.info(`Example corrections:\n${samples.join('\n')}`);
    }

    return { scanned, changed, written, behaviourChanged, versioned };
}

(async function main() {
    if (DRY_RUN) logger.info('Dry run — no writes will be performed.');

    try {
        logger.info(`Connecting to MongoDB (db: ${dbName})...`);
        await mongoose.connect(connectionString, { dbName });
        logger.success('Connection established.');

        const report = await normalizeWikiNames();
        const { scanned, changed, written, behaviourChanged, versioned } = report;

        // Report both numbers explicitly. On a first run `changed` is essentially the whole
        // collection, because `wiki_page_title` / `wiki_version` do not exist yet and every
        // document gains them. That figure looks alarming on its own and says nothing about
        // impact, so the behavioural count is spelled out next to it.
        const unchangedTitles = changed - behaviourChanged;
        logger.info(
            [
                `Scanned ................................. ${scanned}`,
                `Documents ${DRY_RUN ? 'that would be written' : 'written'} ......... ${DRY_RUN ? changed : written}`,
                `  - new fields only, same title ......... ${unchangedTitles}  (no behaviour change)`,
                `  - resolve to a different wiki page .... ${behaviourChanged}  (the actual fix)`,
                `Items carrying an infobox version ....... ${versioned}`,
            ].join('\n'),
        );

        logger.success(
            DRY_RUN
                ? `Dry run complete | scanned=${scanned} would-write=${changed} behaviour-change=${behaviourChanged}`
                : `Normalization complete | scanned=${scanned} written=${written} behaviour-change=${behaviourChanged}`,
        );
    } catch (error) {
        logger.error(`Error in script: ${error}`);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        logger.info('MongoDB connection closed.');
    }
})();
