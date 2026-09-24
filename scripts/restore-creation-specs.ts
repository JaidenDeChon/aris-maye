// restore-creation-specs.ts
//
// Puts back the creationSpecs arrays dumped by `promote-db`'s backup phase.
//
// This is the undo for a rebuild that went wrong. `creationSpecs` is the only field the
// rebuild writes, so restoring it returns the collection to its pre-run state.
//
//   bun run restore-creation-specs -- --db=osrsbox --file=scripts/creationSpecs-osrsbox-<stamp>.jsonl
//   bun run restore-creation-specs -- --db=osrsbox --file=<dump> --apply
//
// Without `--apply` it reports what it would write and validates that every reference in
// the dump revives as a real ObjectId.

import fs from 'node:fs';
import readline from 'node:readline';
import mongoose from 'mongoose';
import { EJSON } from 'bson';

const args = process.argv.slice(2);

function value(name: string): string | undefined {
    const inline = args.find((arg) => arg.startsWith(`--${name}=`));
    if (inline) return inline.slice(name.length + 3);
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
}

const dbName = value('db') || process.env.VITE_MONGO_DB_DB_NAME || 'osrsbox';
const file = value('file');
const apply = args.includes('--apply');

const user = process.env.VITE_MONGO_USERNAME;
const pw = process.env.VITE_MONGO_PASSWORD;
const cluster = process.env.VITE_MONGO_DB_CLUSTER_NAME;
const host = process.env.VITE_MONGO_DB_HOST;

async function main() {
    if (!file || !fs.existsSync(file)) {
        console.error(`[restore] Pass --file=<dump.jsonl>. ${file ? `"${file}" does not exist.` : ''}`);
        process.exit(1);
    }
    if (!user || !pw || !cluster || !host) {
        console.error('[restore] Missing MongoDB env vars.');
        process.exit(1);
    }

    console.log(`[restore] ${apply ? 'Restoring into' : 'Dry run against'} ${dbName} from ${file}`);
    await mongoose.connect(`mongodb+srv://${user}:${pw}@${cluster}.${host}/${dbName}?retryWrites=true&w=majority`, {
        dbName,
    });

    const items = mongoose.connection.db!.collection('items');
    const reader = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });

    let operations: mongoose.mongo.AnyBulkWriteOperation[] = [];
    let queued = 0;
    let written = 0;
    let badLinks = 0;

    const flush = async () => {
        if (!operations.length) return;
        if (apply) written += (await items.bulkWrite(operations, { ordered: false })).modifiedCount;
        operations = [];
    };

    for await (const line of reader) {
        if (!line.trim()) continue;
        // Parsed relaxed so numbers come back as plain JS numbers; strict mode revives them
        // as BSON wrappers from EJSON's own bson copy, which is not the one mongoose holds.
        // ObjectIds are rebuilt through mongoose's constructor for the same reason.
        const doc = EJSON.parse(line, { relaxed: true }) as Record<string, unknown> & {
            _id: unknown;
            creationSpecs?: { ingredients?: { item?: unknown }[] }[];
        };

        for (const spec of doc.creationSpecs ?? []) {
            for (const ingredient of spec.ingredients ?? []) {
                if (!ingredient?.item) continue;
                const hex = String(ingredient.item);
                if (!/^[0-9a-f]{24}$/i.test(hex)) {
                    badLinks += 1;
                    continue;
                }
                ingredient.item = new mongoose.Types.ObjectId(hex);
            }
        }

        operations.push({
            updateOne: {
                filter: { _id: new mongoose.Types.ObjectId(String(doc._id)) },
                update: { $set: { creationSpecs: doc.creationSpecs } },
            },
        });
        queued += 1;
        if (operations.length >= 500) await flush();
        if (queued % 2000 === 0) console.log(`[restore] ${queued} documents processed...`);
    }

    await flush();
    await mongoose.disconnect();

    if (badLinks) console.error(`[restore] WARNING: ${badLinks} references were not valid ObjectId hex.`);
    console.log(
        apply
            ? `[restore] Restored ${written} of ${queued} documents.`
            : `[restore] Dry run: would restore ${queued} documents, ${badLinks} bad links. Pass --apply to write.`,
    );
}

main().catch((err) => {
    console.error(`[restore] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
});
