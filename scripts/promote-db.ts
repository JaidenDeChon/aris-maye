// promote-db.ts
//
// One command for the whole creation-data rebuild and promotion.
//
// The rebuild runs on **osrsbox-dev**, never on the master DB. `osrsbox` is left exactly
// as it is so it stays a rollback for the whole operation, and so a run that goes wrong
// costs nothing but the time. Sync master from dev afterwards, once you are happy:
//
//   OSRSBOX_SOURCE_DB=osrsbox-dev OSRSBOX_TARGET_DB=osrsbox \
//     bun run --env-file .env scripts/copy-osrsbox-db.ts
//
// Phases, in order:
//
//   backup      dump every creationSpecs array on the rebuild DB, so the run is reversible
//   rescrape    populate-ingredients over the rebuild DB, then repair-ingredient-links
//   stores      populate-store-prices: what shops pay, and how it falls as you sell more
//   cycles      find-ingredient-cycles (reports always, writes only with --with-cycles)
//   tree-skills compute-creation-tree-skills
//   prod        copy osrsbox-dev -> osrsbox-prod   (needs --promote)
//   prices      update-item-prices against prod    (needs --promote)
//
// Nothing is written without `--apply`, and nothing touches prod without `--promote`.
// A plain `bun run promote-db` reports what every phase would do and writes nothing.
//
//   bun run promote-db                          # plan only
//   bun run promote-db -- --apply               # rebuild osrsbox-dev, stop before prod
//   bun run promote-db -- --apply --promote     # ...and push dev through to prod
//   bun run promote-db -- --apply --versioned-only
//   bun run promote-db -- --only=prod,prices --apply --promote
//   bun run promote-db -- --verify-only
//
// The scrape is hours of wiki requests, so every phase streams its output through a
// heartbeat: a line at least every `--heartbeat` seconds saying which phase is running,
// how long it has been going and where the scrape has got to. Everything is also appended
// to a log file, so a run can be followed from another shell with `tail -f`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { EJSON } from 'bson';

const PHASES = ['backup', 'rescrape', 'stores', 'cycles', 'tree-skills', 'prod', 'prices'] as const;
type Phase = (typeof PHASES)[number];

const args = process.argv.slice(2);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function flag(name: string): boolean {
    return args.includes(`--${name}`);
}

function value(name: string): string | undefined {
    const inline = args.find((arg) => arg.startsWith(`--${name}=`));
    if (inline) return inline.slice(name.length + 3);
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
}

function phaseList(name: string): Set<Phase> | null {
    const raw = value(name);
    if (!raw) return null;
    const parsed = raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    const unknown = parsed.filter((entry) => !PHASES.includes(entry as Phase));
    if (unknown.length) {
        console.error(`[promote-db] Unknown phase(s) in --${name}: ${unknown.join(', ')}`);
        console.error(`[promote-db] Known phases: ${PHASES.join(', ')}`);
        process.exit(1);
    }
    return new Set(parsed as Phase[]);
}

const apply = flag('apply');
const promote = flag('promote');
const withCycles = flag('with-cycles');
const verifyOnly = flag('verify-only');
const versionedOnly = flag('versioned-only');
const allowMaster = flag('allow-master');
const resumeFrom = value('resume-from');
const only = phaseList('only');
const skip = phaseList('skip') ?? new Set<Phase>();
const heartbeatSeconds = Math.max(5, Number(value('heartbeat') ?? 30));

const masterDb = process.env.OSRSBOX_MASTER_DB || 'osrsbox';
const rebuildDb = value('rebuild-db') || 'osrsbox-dev';
const prodDb = value('prod-db') || 'osrsbox-prod';

const user = process.env.VITE_MONGO_USERNAME;
const pw = process.env.VITE_MONGO_PASSWORD;
const cluster = process.env.VITE_MONGO_DB_CLUSTER_NAME;
const host = process.env.VITE_MONGO_DB_HOST;

const startedAt = Date.now();
const logPath =
    value('log') ?? path.join(repoRoot, 'scripts', `promote-db-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

let currentPhase = 'startup';
let lastChildLine = '';

/** Elapsed wall time, so a long silent stretch is still obviously progressing. */
function elapsed(): string {
    const total = Math.floor((Date.now() - startedAt) / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
}

/**
 * Writes one line to the console and the log file.
 * @param message - The line to record.
 */
function say(message: string): void {
    const line = `[${elapsed()}] [${currentPhase}] ${message}`;
    console.log(line);
    logStream.write(`${line}\n`);
}

/** Strips the escape codes `log-update` emits when its output is not a terminal. */
function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * Runs one of the repo's scripts, streaming its output under the heartbeat.
 *
 * Output is piped rather than inherited so the scrape's progress bar — which redraws one
 * line thousands of times — collapses into the heartbeat instead of filling the log.
 * @param script - Path to the script, relative to the repo root.
 * @param scriptArgs - Arguments to forward.
 * @param env - Extra environment for the child, typically the target database.
 */
async function run(script: string, scriptArgs: string[], env: Record<string, string> = {}): Promise<void> {
    say(`running ${path.basename(script)} ${scriptArgs.join(' ')}`.trim());

    const proc = Bun.spawn({
        cmd: ['bun', 'run', script, ...scriptArgs],
        cwd: repoRoot,
        env: { ...process.env, ...env },
        stdout: 'pipe',
        stderr: 'pipe',
    });

    const consume = async (stream: ReadableStream<Uint8Array> | null) => {
        if (!stream) return;
        const decoder = new TextDecoder();
        let buffer = '';

        for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
            buffer += decoder.decode(chunk, { stream: true });
            const parts = buffer.split(/[\r\n]+/);
            buffer = parts.pop() ?? '';

            for (const part of parts) {
                const line = stripAnsi(part).trim();
                if (!line) continue;
                // Progress redraws are held for the heartbeat; everything else is news.
                if (/Progress \d+\/\d+/.test(line)) lastChildLine = line;
                else say(line);
            }
        }
    };

    await Promise.all([consume(proc.stdout), consume(proc.stderr)]);
    const code = await proc.exited;
    if (code !== 0) throw new Error(`${path.basename(script)} exited with code ${code}`);
}

/** Opens a connection to one database, for the read-only verification queries. */
async function withDb<T>(dbName: string, fn: (db: mongoose.mongo.Db) => Promise<T>): Promise<T> {
    const connection = await mongoose
        .createConnection(`mongodb+srv://${user}:${pw}@${cluster}.${host}/${dbName}?retryWrites=true&w=majority`, {
            dbName,
        })
        .asPromise();
    try {
        return await fn(connection.db!);
    } finally {
        await connection.close();
    }
}

type Counts = { total: number; withSpecs: number; versionedMultiSpec: number; selfReferential: number };

/**
 * Counts the defects this rebuild exists to remove, plus the totals used as a sanity floor.
 * @param dbName - The database to measure.
 * @returns The measured counts.
 */
async function verify(dbName: string): Promise<Counts> {
    return withDb(dbName, async (db) => {
        const items = db.collection('items');
        const [total, withSpecs, versionedMultiSpec, selfReferential] = await Promise.all([
            items.countDocuments({}),
            items.countDocuments({ 'creationSpecs.0': { $exists: true } }),
            items.countDocuments({ wiki_version: { $ne: null }, 'creationSpecs.1': { $exists: true } }),
            items
                .aggregate([
                    { $match: { 'creationSpecs.0': { $exists: true } } },
                    {
                        $project: {
                            self: {
                                $filter: {
                                    input: {
                                        $reduce: {
                                            input: '$creationSpecs.ingredients',
                                            initialValue: [],
                                            in: { $concatArrays: ['$$value', { $ifNull: ['$$this', []] }] },
                                        },
                                    },
                                    as: 'ingredient',
                                    cond: { $eq: ['$$ingredient.item', '$_id'] },
                                },
                            },
                        },
                    },
                    { $match: { 'self.0': { $exists: true } } },
                    { $count: 'n' },
                ])
                .toArray()
                .then((rows) => (rows[0]?.n as number) ?? 0),
        ]);
        return { total, withSpecs, versionedMultiSpec, selfReferential };
    });
}

/**
 * Prints a counts block.
 * @param label - Heading for the block.
 * @param counts - The counts to print.
 */
function report(label: string, counts: Counts): void {
    say(label);
    say(`  Items ............................... ${counts.total}`);
    say(`  With creation specs ................. ${counts.withSpecs}`);
    say(`  Versioned items with >1 spec ........ ${counts.versionedMultiSpec}`);
    say(`  Items listing themselves ............ ${counts.selfReferential}`);
}

/**
 * Dumps every stored creationSpecs array so the run can be undone.
 *
 * EJSON keeps ingredient references as ObjectIds; plain JSON flattens them to strings and
 * a restore would silently repoint every link. `restore-creation-specs.ts` reads this back.
 * @param dbName - The database to dump.
 * @returns Path to the dump, and how many documents it holds.
 */
async function backup(dbName: string): Promise<{ file: string; documents: number }> {
    const file = path.join(repoRoot, 'scripts', `creationSpecs-${dbName}-${startedAt}.jsonl`);

    const documents = await withDb(dbName, async (db) => {
        const stream = fs.createWriteStream(file, { encoding: 'utf8' });
        let written = 0;
        const cursor = db
            .collection('items')
            .find(
                { 'creationSpecs.0': { $exists: true } },
                { projection: { _id: 1, id: 1, name: 1, wiki_version: 1, creationSpecs: 1 } },
            );

        for await (const doc of cursor) {
            stream.write(`${EJSON.stringify(doc, { relaxed: false })}\n`);
            written += 1;
            if (written % 2000 === 0) say(`  backed up ${written} documents...`);
        }

        await new Promise<void>((resolve) => stream.end(resolve));
        return written;
    });

    return { file, documents };
}

function wanted(phase: Phase): boolean {
    if (skip.has(phase)) return false;
    if (only) return only.has(phase);
    return true;
}

async function main() {
    if (!user || !pw || !cluster || !host) {
        console.error('[promote-db] Missing MongoDB env vars.');
        process.exit(1);
    }

    // The master DB is the rollback for this whole operation. Rebuilding on top of it
    // would spend that, so it takes a deliberate flag rather than a typo in --rebuild-db.
    if (rebuildDb === masterDb && !allowMaster) {
        console.error(
            `[promote-db] Refusing to rebuild on the master DB "${masterDb}" — it is the rollback for this run.\n` +
                `[promote-db] Rebuild on osrsbox-dev (the default), or pass --allow-master if you really mean it.`,
        );
        process.exit(1);
    }

    const heartbeat = setInterval(() => {
        say(lastChildLine ? `still working — ${lastChildLine}` : 'still working...');
    }, heartbeatSeconds * 1000);

    try {
        currentPhase = 'plan';
        say(`log: ${logPath}`);
        say(`rebuild on ${rebuildDb} -> promote to ${prodDb}; master ${masterDb} is not touched`);
        say(apply ? 'apply: writes are ENABLED' : 'apply: off — this is a plan, nothing will be written');
        if (apply && !promote) say('promote: off — stopping after the rebuild, prod is untouched');
        if (apply && promote) say(`promote: ON — ${prodDb} will be REPLACED`);
        say(`cycles: ${withCycles ? 'will write' : 'report only (pass --with-cycles to let it delete specs)'}`);

        const before = await verify(rebuildDb);
        report(`before (${rebuildDb})`, before);

        if (verifyOnly) {
            say('verify-only: stopping here.');
            return;
        }

        if (wanted('backup')) {
            currentPhase = 'backup';
            if (!apply) {
                say(`would dump ${before.withSpecs} creationSpecs documents from ${rebuildDb}`);
            } else {
                const { file, documents } = await backup(rebuildDb);
                say(`dumped ${documents} documents to ${file}`);
                say(`restore with: bun run restore-creation-specs -- --db=${rebuildDb} --file=${file} --apply`);
            }
        }

        if (wanted('rescrape')) {
            currentPhase = 'rescrape';
            const scrapeArgs = ['--all'];
            if (!apply) scrapeArgs.push('--dry-run');
            if (versionedOnly) scrapeArgs.push('--versioned-only');
            if (resumeFrom) scrapeArgs.push(`--resume-from=${resumeFrom}`);
            say('this is the long one — the wiki is the bottleneck, expect hours for a full pass');
            await run('scripts/populate-ingredients.ts', scrapeArgs, { VITE_MONGO_DB_DB_NAME: rebuildDb });

            // The scrape writes fresh ingredient links, so canonical repair follows it.
            await run('scripts/repair-ingredient-links.ts', apply ? [] : ['--dry-run'], {
                VITE_MONGO_DB_DB_NAME: rebuildDb,
            });
        }

        if (wanted('stores')) {
            currentPhase = 'stores';
            // Shop pages, not item pages: the terms are template parameters an item page
            // never renders, and ~508 shops cover the lot in a few hundred requests.
            await run('scripts/populate-store-prices.ts', apply ? [] : ['--dry-run'], {
                VITE_MONGO_DB_DB_NAME: rebuildDb,
            });
        }

        if (wanted('cycles')) {
            currentPhase = 'cycles';
            // Always reported, only written on an explicit opt-in: this step deletes whole
            // creationSpecs entries to break a cycle, and has been measured stripping 181
            // items of every recipe they had.
            const writeCycles = apply && withCycles;
            // The default report stops at 50 cycles, which is not enough to judge whether
            // letting this step write is safe.
            const cycleArgs = writeCycles ? [] : ['--dry-run', `--limit=${value('cycle-limit') ?? 2000}`];
            await run('scripts/find-ingredient-cycles.ts', cycleArgs, {
                VITE_MONGO_DB_DB_NAME: rebuildDb,
            });
            if (!writeCycles) say('reported only — read the report above before passing --with-cycles');
        }

        if (wanted('tree-skills')) {
            currentPhase = 'tree-skills';
            await run('scripts/compute-creation-tree-skills.ts', apply ? [] : ['--dry-run'], {
                VITE_MONGO_DB_DB_NAME: rebuildDb,
            });
        }

        currentPhase = 'verify';
        const after = await verify(rebuildDb);
        report(`after (${rebuildDb})`, after);

        // A rebuild that emptied the collection is a failure, not a result. Refuse to
        // promote it rather than copying the damage onto prod.
        const floor = Math.floor(before.withSpecs * 0.75);
        if (apply && after.withSpecs < floor) {
            throw new Error(
                `items with creation specs fell from ${before.withSpecs} to ${after.withSpecs}, below the ${floor} floor — refusing to promote. Restore from the backup above.`,
            );
        }

        if (wanted('prod')) {
            currentPhase = 'prod';
            if (!promote) say(`skipped — check the ${rebuildDb} deploy, then re-run with --promote`);
            else if (!apply) say(`would copy ${rebuildDb} -> ${prodDb} (replaces every collection)`);
            else
                await run('scripts/copy-osrsbox-db.ts', [], {
                    OSRSBOX_SOURCE_DB: rebuildDb,
                    OSRSBOX_TARGET_DB: prodDb,
                });
        }

        if (wanted('prices')) {
            currentPhase = 'prices';
            // The copy replaces the collection wholesale, and prod's prices are refreshed
            // hourly while the rebuild DB's are not — so prod would otherwise go backwards
            // until the next scheduled run.
            if (!promote) say('skipped — runs with --promote, straight after the prod copy');
            else if (!apply) say(`would refresh prices against ${prodDb}`);
            else await run('scripts/run-update-item-prices.ts', [], { VITE_MONGO_DB_DB_NAME: prodDb });
        }

        currentPhase = 'done';
        if (promote && apply) report(`final (${prodDb})`, await verify(prodDb));
        say(apply ? 'complete.' : 'plan complete — nothing was written. Re-run with --apply.');
        if (apply && !promote) say(`next: check the ${rebuildDb} deploy, then re-run with --apply --promote`);
        if (apply && promote) {
            say(`${masterDb} is still on the old data. Sync it once you are happy with prod:`);
            say(
                `  OSRSBOX_SOURCE_DB=${rebuildDb} OSRSBOX_TARGET_DB=${masterDb} bun run --env-file .env scripts/copy-osrsbox-db.ts`,
            );
        }
    } finally {
        clearInterval(heartbeat);
        currentPhase = 'done';
        say(`log written to ${logPath}`);
        await new Promise<void>((resolve) => logStream.end(resolve));
    }
}

main().catch((err) => {
    console.error(`[promote-db] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
});
