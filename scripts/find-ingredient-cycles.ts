import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose, { Types } from 'mongoose';
import { OsrsboxItemModel } from '../src/lib/models/mongo-schemas/osrsbox-db-item-schema';

type Node = {
    id: string;
    name: string;
    ingredientIds: string[];
};

const user = process.env.VITE_MONGO_USERNAME ?? '';
const pw = process.env.VITE_MONGO_PASSWORD ?? '';
const cluster = process.env.VITE_MONGO_DB_CLUSTER_NAME ?? '';
const host = process.env.VITE_MONGO_DB_HOST ?? '';
const dbName = process.env.VITE_MONGO_DB_DB_NAME || 'osrsbox';
const prepend = 'mongodb+srv';
const append = '?retryWrites=true&w=majority';
const connectionString = `${prepend}://${user}:${pw}@${cluster}.${host}/${dbName}${append}`;

const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const startArg = args.find((arg) => arg.startsWith('--start='));
const dryRun = args.includes('--dry-run');
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1])) : 50;
const startId = startArg ? startArg.split('=')[1] : null;
const logFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cyclical-creation-trees.log');

function getName(value: { name?: string | null; wiki_name?: string | null } | null | undefined): string {
    const name = value?.name ?? value?.wiki_name ?? '';
    const trimmed = name.trim();
    return trimmed.length ? trimmed : '(unnamed)';
}

function normalizeCycle(ids: string[]): string {
    const unique = ids.slice(0, -1);
    if (!unique.length) return '';
    let best = '';
    for (let i = 0; i < unique.length; i += 1) {
        const rotated = unique.slice(i).concat(unique.slice(0, i));
        const key = rotated.join('>');
        if (!best || key < best) best = key;
    }
    return best;
}

function formatPath(ids: string[], nodes: Map<string, Node>): string {
    return ids
        .map((id) => {
            const node = nodes.get(id);
            const label = node ? node.name : '(missing)';
            return `${label} (${id})`;
        })
        .join(' -> ');
}

function formatNode(id: string, nodes: Map<string, Node>): string {
    const node = nodes.get(id);
    const label = node ? node.name : '(missing)';
    return `${label} (${id})`;
}

async function run() {
    if (!user || !pw || !cluster || !host) {
        console.error(
            'Missing Mongo env vars. Ensure VITE_MONGO_USERNAME, VITE_MONGO_PASSWORD, VITE_MONGO_DB_CLUSTER_NAME, and VITE_MONGO_DB_HOST are set.',
        );
        process.exit(1);
    }

    await mongoose.connect(connectionString);

    const rawItems = await OsrsboxItemModel.find({}, '_id name wiki_name creationSpecs.ingredients.item')
        .lean()
        .exec();

    const nodes = new Map<string, Node>();

    for (const item of rawItems) {
        const id = item._id?.toString?.();
        if (!id) continue;

        const ingredientIds = new Set<string>();
        const specs = Array.isArray(item.creationSpecs) ? item.creationSpecs : [];
        for (const spec of specs) {
            const ingredients = Array.isArray(spec.ingredients) ? spec.ingredients : [];
            for (const ingredient of ingredients) {
                if (!ingredient?.item) continue;
                ingredientIds.add(String(ingredient.item));
            }
        }

        nodes.set(id, {
            id,
            name: getName(item),
            ingredientIds: Array.from(ingredientIds),
        });
    }

    const state = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    const seen = new Set<string>();
    const cycles: { path: string[]; fromId: string; toId: string }[] = [];
    const specsToRemove = new Map<string, Set<string>>();

    function dfs(id: string) {
        state.set(id, 1);
        stack.push(id);

        const node = nodes.get(id);
        if (node) {
            for (const nextId of node.ingredientIds) {
                if (!nodes.has(nextId)) continue;
                const nextState = state.get(nextId) ?? 0;
                if (nextState === 0) {
                    dfs(nextId);
                    if (cycles.length >= limit) break;
                } else if (nextState === 1) {
                    const idx = stack.indexOf(nextId);
                    if (idx >= 0) {
                        const cycle = stack.slice(idx).concat(nextId);
                        const key = normalizeCycle(cycle);
                        if (key && !seen.has(key)) {
                            seen.add(key);
                            cycles.push({ path: cycle, fromId: id, toId: nextId });
                            if (!specsToRemove.has(id)) specsToRemove.set(id, new Set());
                            specsToRemove.get(id)?.add(nextId);
                        }
                    }
                    if (cycles.length >= limit) break;
                }
            }
        }

        stack.pop();
        state.set(id, 2);
    }

    const roots = startId ? [startId] : Array.from(nodes.keys());
    if (startId && !nodes.has(startId)) {
        console.error(`Start id not found in collection: ${startId}`);
    }

    for (const id of roots) {
        if (cycles.length >= limit) break;
        if ((state.get(id) ?? 0) === 0) dfs(id);
    }

    const logLines: string[] = [];
    logLines.push('# Creation tree cycle removal log');
    logLines.push(`# Generated at ${new Date().toISOString()}`);
    logLines.push(`# Dry run: ${dryRun ? 'true' : 'false'}`);
    logLines.push('');

    if (!cycles.length) {
        console.log('No ingredient cycles found.');
        logLines.push('No ingredient cycles found.');
    } else {
        cycles.forEach((cycle, index) => {
            logLines.push(`Cycle ${index + 1}:`);
            logLines.push(`Path: ${formatPath(cycle.path, nodes)}`);
            logLines.push(
                `Closing edge: ${formatNode(cycle.fromId, nodes)} -> ${formatNode(cycle.toId, nodes)}`,
            );
            logLines.push('');
        });
        if (cycles.length >= limit) {
            const notice = `Stopped after ${limit} cycles. Increase with --limit=<n>.`;
            console.log(notice);
            logLines.push(notice);
            logLines.push('');
        }
    }

    if (specsToRemove.size > 0) {
        logLines.push('Creation spec removals:');
    }

    for (const [fromId, toIds] of specsToRemove.entries()) {
        for (const toId of toIds) {
            if (!Types.ObjectId.isValid(fromId) || !Types.ObjectId.isValid(toId)) {
                const warn = `Skipping invalid ObjectId removal: ${fromId} -> ${toId}`;
                console.warn(warn);
                logLines.push(warn);
                continue;
            }

            if (dryRun) {
                logLines.push(`Dry run: would remove creationSpecs in ${fromId} that reference ${toId}`);
                continue;
            }

            const result = await OsrsboxItemModel.updateOne(
                { _id: new Types.ObjectId(fromId) },
                {
                    $pull: {
                        creationSpecs: {
                            ingredients: { $elemMatch: { item: new Types.ObjectId(toId) } },
                        },
                    },
                },
            ).exec();
            logLines.push(
                `Removed creationSpecs from ${fromId} referencing ${toId} (matched=${result.matchedCount}, modified=${result.modifiedCount})`,
            );
        }
    }

    if (specsToRemove.size > 0) {
        logLines.push('');
    }

    fs.writeFileSync(logFilePath, logLines.join('\n'), 'utf8');
    console.log(`Cycle log written to ${logFilePath}`);

    await mongoose.disconnect();
}

run().catch(async (err) => {
    console.error('Failed to scan for cycles:', err);
    try {
        await mongoose.disconnect();
    } finally {
        process.exit(1);
    }
});
