import mongoose from 'mongoose';
import { OsrsboxItemModel } from '../src/lib/models/mongo-schemas/osrsbox-db-item-schema';
import type { GameItemCreationSpecs, SkillLevelDesignation } from '../src/lib/models/osrsbox-db-item';

const user = process.env.VITE_MONGO_USERNAME;
const pw = process.env.VITE_MONGO_PASSWORD;
const cluster = process.env.VITE_MONGO_DB_CLUSTER_NAME;
const host = process.env.VITE_MONGO_DB_HOST;
const dbName = process.env.VITE_MONGO_DB_DB_NAME || 'osrsbox';
const prepend = 'mongodb+srv';
const append = '?retryWrites=true&w=majority';
const connectionString = `${prepend}://${user}:${pw}@${cluster}.${host}/${dbName}${append}`;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const startArg = args.find((arg) => arg.startsWith('--start='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1])) : null;
const startId = startArg ? startArg.split('=')[1] : null;

type ItemNode = {
    id: string;
    specs: GameItemCreationSpecs[];
};

type SkillMap = Record<string, number>;
type SkillRange = { min: SkillMap };

function normalizeSkillName(name: string): string | null {
    const trimmed = name.trim().toLowerCase();
    return trimmed.length ? trimmed : null;
}

function addSkill(target: SkillMap, skill: string | null, level: number | null | undefined) {
    if (!skill) return;
    const numeric = Math.max(0, Math.floor(Number(level)));
    if (!Number.isFinite(numeric)) return;
    const existing = target[skill] ?? 0;
    if (numeric > existing) target[skill] = numeric;
}

function mergeSkillMaps(target: SkillMap, source: SkillMap) {
    for (const [skill, level] of Object.entries(source)) {
        addSkill(target, skill, level);
    }
}

function normalizeObjectId(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value instanceof mongoose.Types.ObjectId) return value.toString();
    if (typeof value === 'object') {
        const maybeId = (value as { _id?: unknown })._id;
        if (maybeId) return normalizeObjectId(maybeId);
    }
    return null;
}

async function run() {
    if (!user || !pw || !cluster || !host) {
        console.error(
            'Missing Mongo env vars. Ensure VITE_MONGO_USERNAME, VITE_MONGO_PASSWORD, VITE_MONGO_DB_CLUSTER_NAME, and VITE_MONGO_DB_HOST are set.',
        );
        process.exit(1);
    }

    await mongoose.connect(connectionString);

    const docs = await OsrsboxItemModel.find({}, { _id: 1, creationSpecs: 1 })
        .lean<{ _id: mongoose.Types.ObjectId; creationSpecs?: GameItemCreationSpecs[] }[]>()
        .exec();

    const nodes = new Map<string, ItemNode>();
    for (const doc of docs) {
        const id = doc._id?.toString?.();
        if (!id) continue;
        const specsRaw = Array.isArray(doc.creationSpecs) ? doc.creationSpecs : [];
        const specs: GameItemCreationSpecs[] = specsRaw.map((spec) => ({
            requiredSkills: Array.isArray(spec.requiredSkills) ? spec.requiredSkills : [],
            experienceGranted: Array.isArray(spec.experienceGranted) ? spec.experienceGranted : [],
            ingredients: Array.isArray(spec.ingredients) ? spec.ingredients : [],
        }));
        nodes.set(id, { id, specs });
    }

    const memoSpec = new Map<string, SkillRange>();
    const memoItem = new Map<string, SkillMap>();
    const cycles: string[] = [];

    function computeSpecTree(id: string, specIndex: number, stack: Set<string>): SkillRange {
        const key = `${id}:${specIndex}`;
        const cached = memoSpec.get(key);
        if (cached) return cached;

        if (stack.has(key)) {
            cycles.push(key);
            return { min: {} };
        }

        stack.add(key);
        const node = nodes.get(id);
        const spec = node?.specs?.[specIndex];
        const min: SkillMap = {};

        if (spec) {
            if (!force && spec.treeMinSkills) {
                const direct = { min: spec.treeMinSkills ?? {} };
                memoSpec.set(key, direct);
                stack.delete(key);
                return direct;
            }

            for (const req of spec.requiredSkills ?? []) {
                const skill = normalizeSkillName((req as SkillLevelDesignation).skillName ?? '');
                addSkill(min, skill, (req as SkillLevelDesignation).skillLevel);
            }

            for (const ing of spec.ingredients ?? []) {
                const itemId = normalizeObjectId(ing?.item);
                if (!itemId) continue;
                if (!nodes.has(itemId)) continue;
                const child = computeItemMin(itemId, stack);
                mergeSkillMaps(min, child);
            }
        }

        stack.delete(key);
        const range = { min };
        memoSpec.set(key, range);
        return range;
    }

    function computeItemMin(id: string, stack: Set<string>): SkillMap {
        const cached = memoItem.get(id);
        if (cached) return cached;

        const node = nodes.get(id);
        if (!node || !node.specs.length) {
            const empty: SkillMap = {};
            memoItem.set(id, empty);
            return empty;
        }

        const min: SkillMap = {};
        const specRanges = node.specs.map((_, index) => computeSpecTree(id, index, stack));
        const allSkills = new Set<string>();
        for (const range of specRanges) {
            for (const skill of Object.keys(range.min)) allSkills.add(skill);
        }

        for (const skill of allSkills) {
            let minVal: number | null = null;
            for (const range of specRanges) {
                const candidate = range.min[skill] ?? 0;
                minVal = minVal === null ? candidate : Math.min(minVal, candidate);
            }
            if (minVal !== null) min[skill] = minVal;
        }

        memoItem.set(id, min);
        return min;
    }

    const ids = Array.from(nodes.keys()).sort();
    const total = limit ? Math.min(limit, ids.length) : ids.length;
    let processed = 0;
    let batch: Parameters<typeof OsrsboxItemModel.collection.bulkWrite>[0] = [];

    for (const id of ids) {
        if (startId && id <= startId) continue;
        if (limit && processed >= limit) break;
        processed += 1;

        const node = nodes.get(id);
        const updatedSpecs = node
            ? node.specs.map((spec, index) => {
                  const range = computeSpecTree(id, index, new Set());
                  const { treeMaxSkills: _treeMaxSkills, ...rest } = spec as GameItemCreationSpecs & {
                      treeMaxSkills?: Record<string, number> | null;
                  };
                  return {
                      ...rest,
                      treeMinSkills: Object.keys(range.min).length ? range.min : null,
                  };
              })
            : [];

        if (!dryRun) {
            batch.push({
                updateOne: {
                    filter: { _id: new mongoose.Types.ObjectId(id) },
                    update: {
                        $set: {
                            creationSpecs: updatedSpecs,
                        },
                        $unset: {
                            creationTreeMinSkills: '',
                            creationTreeMaxSkills: '',
                        },
                    },
                },
            });
        }

        if (batch.length >= 500) {
            await OsrsboxItemModel.collection.bulkWrite(batch, { ordered: false });
            batch = [];
        }

        if (processed % 500 === 0 || processed === total) {
            console.log(`[creation-tree-skills] Processed ${processed}/${total}`);
        }
    }

    if (!dryRun && batch.length) {
        await OsrsboxItemModel.collection.bulkWrite(batch, { ordered: false });
    }

    if (!dryRun) {
        await OsrsboxItemModel.collection.updateMany(
            {
                $or: [
                    { creationTreeMinSkills: { $exists: true } },
                    { creationTreeMaxSkills: { $exists: true } },
                ],
            },
            {
                $unset: {
                    creationTreeMinSkills: '',
                    creationTreeMaxSkills: '',
                },
            },
        );
    }

    if (cycles.length) {
        console.warn(`[creation-tree-skills] Detected ${cycles.length} cycle hits. Consider running find-ingredient-cycles.`);
    }

    await mongoose.disconnect();
    console.log(`[creation-tree-skills] Done. Dry run: ${dryRun ? 'true' : 'false'}.`);
}

run().catch(async (err) => {
    console.error('[creation-tree-skills] Failed:', err);
    await mongoose.disconnect();
    process.exit(1);
});
