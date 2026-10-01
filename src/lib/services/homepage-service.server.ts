import mongoose, { type PipelineStage } from 'mongoose';
import { OsrsboxItemModel } from '$lib/models/mongo-schemas/osrsbox-db-item-schema';
import {
    buildPlayerSkillMatchExpression,
    buildPrimarySpecExpression,
    buildProfitPipeline,
    getNatureRunePrice,
    getVisibilityQuery,
    normalizeSkillLevels,
    type PlayerSkillLevels,
} from '$lib/services/game-item-mongo-service.server';
import {
    HOMEPAGE_ALCH_MAX_PRICE_AGE_S,
    HOMEPAGE_ALMOST_UNLOCKED_LEVELS,
    HOMEPAGE_LIST_SIZE,
    HOMEPAGE_MIN_ROI_PROFIT,
    HOMEPAGE_SNAPSHOT_MAX_AGE_MS,
} from '$lib/constants/homepage';
import { canonicalSkill } from '$lib/constants/skill-aliases';
import type {
    HomepageAlchPick,
    HomepageAlmostUnlocked,
    HomepageCheapXp,
    HomepageItem,
    HomepageShortfall,
    HomepageSkillEarner,
    HomepageSnapshot,
} from '$lib/models/homepage';

const SNAPSHOT_COLLECTION = 'homepage-snapshots';

/** How long this server instance reuses a snapshot it already read, before asking Mongo again. */
const MEMORY_CACHE_MS = 60 * 1000;

const memoryCache = new Map<string, { snapshot: HomepageSnapshot; readAt: number }>();
const rebuildsInFlight = new Map<string, Promise<HomepageSnapshot>>();

/** The fields a homepage tile reads, kept small because a snapshot holds a few dozen of them. */
const ITEM_PROJECTION = {
    _id: 0,
    id: 1,
    name: 1,
    icon: 1,
    highPrice: 1,
    lowPrice: 1,
    buy_limit: 1,
    creationCost: 1,
    creationProfit: 1,
    creationRoi: 1,
    ironmanExitValue: 1,
    craftsPerLimit: 1,
    gpPerLimit: 1,
} as const;

type RawItem = {
    id: number;
    name: string;
    icon: string;
    highPrice?: number | null;
    lowPrice?: number | null;
    buy_limit?: number | null;
    creationCost?: number | null;
    creationProfit?: number | null;
    creationRoi?: number | null;
    ironmanExitValue?: number | null;
    craftsPerLimit?: number | null;
    gpPerLimit?: number | null;
};

function toHomepageItem(raw: RawItem): HomepageItem {
    const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
    return {
        id: raw.id,
        name: raw.name,
        icon: raw.icon,
        highPrice: num(raw.highPrice),
        lowPrice: num(raw.lowPrice),
        buyLimit: num(raw.buy_limit),
        creationCost: num(raw.creationCost),
        creationProfit: num(raw.creationProfit),
        creationRoi: num(raw.creationRoi),
        ironmanExitValue: num(raw.ironmanExitValue),
        craftsPerLimit: num(raw.craftsPerLimit),
        gpPerLimit: num(raw.gpPerLimit),
    };
}

/** The match every homepage query starts from: craftable items the reader can put a value on. */
function baseCreationMatch(ironman: boolean): Record<string, unknown> {
    return {
        'creationSpecs.0': { $exists: true },
        placeholder: false,
        noted: false,
        stacked: null,
        ...getVisibilityQuery(ironman),
    };
}

/**
 * Every profit-based section, from one pass of the profit pipeline.
 *
 * The pipeline is the expensive part, so it runs once and `$facet` cuts the result into lists.
 */
async function computeCreationSections(ironman: boolean, natureRunePrice: number) {
    const itemProjection = { $project: ITEM_PROJECTION };
    const rawItem = (path: string) =>
        Object.fromEntries(
            Object.keys(ITEM_PROJECTION)
                .filter((key) => key !== '_id')
                .map((key) => [key, `${path}.${key}`]),
        );

    const [facets] = await OsrsboxItemModel.aggregate<{
        topProfit: RawItem[];
        topRoi: RawItem[];
        topGpPerLimit: RawItem[];
        skillEarners: { _id: string; item: RawItem }[];
        cheapXp: { _id: string; item: RawItem; xp: number; gpPerXp: number }[];
    }>([
        { $match: baseCreationMatch(ironman) },
        { $unset: ['equipment', 'weapon'] },
        ...buildProfitPipeline(null, true, false, false, ironman, natureRunePrice),
        {
            $set: {
                primarySpec: buildPrimarySpecExpression(),
                // The most a main can clear every 4 hours: profit per item times how many they can
                // make before an ingredient's buy limit runs out. Ironmen don't buy on the GE.
                gpPerLimit: ironman
                    ? null
                    : {
                          $cond: [
                              { $and: [{ $gt: ['$creationProfit', 0] }, { $gt: ['$craftsPerLimit', 0] }] },
                              { $multiply: ['$creationProfit', '$craftsPerLimit'] },
                              null,
                          ],
                      },
            },
        },
        {
            $facet: {
                topProfit: [{ $sort: { creationProfit: -1, name: 1 } }, { $limit: HOMEPAGE_LIST_SIZE }, itemProjection],
                topRoi: [
                    { $match: { creationProfit: { $gte: HOMEPAGE_MIN_ROI_PROFIT }, creationRoi: { $ne: null } } },
                    { $sort: { creationRoi: -1, name: 1 } },
                    { $limit: HOMEPAGE_LIST_SIZE },
                    itemProjection,
                ],
                topGpPerLimit: [
                    { $match: { gpPerLimit: { $gt: 0 } } },
                    { $sort: { gpPerLimit: -1, name: 1 } },
                    { $limit: HOMEPAGE_LIST_SIZE },
                    itemProjection,
                ],
                skillEarners: [
                    { $match: { creationProfit: { $gt: 0 } } },
                    { $unwind: '$primarySpec.requiredSkills' },
                    { $sort: { creationProfit: -1, name: 1 } },
                    {
                        $group: {
                            _id: { $toLower: '$primarySpec.requiredSkills.skillName' },
                            item: { $first: rawItem('$$ROOT') },
                        },
                    },
                ],
                cheapXp: [
                    { $unwind: '$primarySpec.experienceGranted' },
                    { $match: { 'primarySpec.experienceGranted.experienceAmount': { $gt: 0 } } },
                    {
                        $set: {
                            xp: '$primarySpec.experienceGranted.experienceAmount',
                            // A creation that makes money costs nothing per XP; it pays you instead.
                            gpPerXp: {
                                $divide: [
                                    { $max: [0, { $multiply: ['$creationProfit', -1] }] },
                                    '$primarySpec.experienceGranted.experienceAmount',
                                ],
                            },
                        },
                    },
                    // Among the free ones, the most XP per action wins.
                    { $sort: { gpPerXp: 1, xp: -1, name: 1 } },
                    {
                        $group: {
                            _id: { $toLower: '$primarySpec.experienceGranted.skillName' },
                            item: { $first: rawItem('$$ROOT') },
                            xp: { $first: '$xp' },
                            gpPerXp: { $first: '$gpPerXp' },
                        },
                    },
                ],
            },
        },
    ] as unknown as PipelineStage[]).allowDiskUse(true);

    // Groups come back keyed by however the recipe spelled the skill, so two spellings of one skill
    // ("runecraft", "runecrafting") are merged, keeping whichever row `better` prefers.
    const bySkill = <T extends { _id: string }>(rows: T[], better: (a: T, b: T) => boolean) => {
        const merged = new Map<string, T>();
        for (const row of rows) {
            const skill = canonicalSkill(row._id);
            if (!skill) continue;
            const existing = merged.get(skill);
            if (!existing || better(row, existing)) merged.set(skill, { ...row, _id: skill });
        }
        return Array.from(merged.values()).sort((a, b) => a._id.localeCompare(b._id));
    };

    return {
        topProfit: (facets?.topProfit ?? []).map(toHomepageItem),
        topRoi: (facets?.topRoi ?? []).map(toHomepageItem),
        topGpPerLimit: (facets?.topGpPerLimit ?? []).map(toHomepageItem),
        skillEarners: bySkill(
            facets?.skillEarners ?? [],
            (a, b) => (a.item.creationProfit ?? 0) > (b.item.creationProfit ?? 0),
        ).map((row): HomepageSkillEarner => ({ skill: row._id, item: toHomepageItem(row.item) })),
        cheapXp: bySkill(facets?.cheapXp ?? [], (a, b) => a.gpPerXp < b.gpPerXp).map(
            (row): HomepageCheapXp => ({
                skill: row._id,
                item: toHomepageItem(row.item),
                xp: row.xp,
                gpPerXp: row.gpPerXp,
            }),
        ),
    };
}

/**
 * Items worth buying on the GE to cast High Level Alchemy on.
 *
 * The buy price is the instant-buy price (`highPrice`), since that's what it costs to get one now.
 */
async function computeAlchPicks(natureRunePrice: number): Promise<HomepageAlchPick[]> {
    const oldestPrice = Math.floor(Date.now() / 1000) - HOMEPAGE_ALCH_MAX_PRICE_AGE_S;
    const rows = await OsrsboxItemModel.aggregate<RawItem & { highalch: number; alchProfit: number }>([
        {
            $match: {
                tradeable_on_ge: true,
                placeholder: false,
                noted: false,
                stacked: null,
                highalch: { $gt: 0 },
                highPrice: { $gt: 0 },
                highTime: { $gte: oldestPrice },
                buy_limit: { $gt: 0 },
            },
        },
        { $set: { alchProfit: { $subtract: [{ $subtract: ['$highalch', '$highPrice'] }, natureRunePrice] } } },
        { $match: { alchProfit: { $gt: 0 } } },
        { $sort: { alchProfit: -1, name: 1 } },
        { $limit: HOMEPAGE_LIST_SIZE },
        { $project: { ...ITEM_PROJECTION, highalch: 1, alchProfit: 1 } },
    ]);

    return rows.map((row) => ({
        item: toHomepageItem(row),
        profit: row.alchProfit,
        buyPrice: row.highPrice ?? 0,
        highalch: row.highalch,
    }));
}

/** Builds every global homepage section from scratch. */
export async function computeHomepageSnapshot(ironman: boolean): Promise<HomepageSnapshot> {
    const natureRunePrice = await getNatureRunePrice();
    const [creation, alchPicks] = await Promise.all([
        computeCreationSections(ironman, natureRunePrice),
        // An Ironman can't buy on the GE, so buying something to alch isn't open to them.
        ironman ? Promise.resolve([]) : computeAlchPicks(natureRunePrice),
    ]);

    return { ironman, computedAt: Date.now(), natureRunePrice, ...creation, alchPicks };
}

type SnapshotDoc = { _id: string; snapshot: HomepageSnapshot };

function snapshotCollection() {
    return mongoose.connection.collection<SnapshotDoc>(SNAPSHOT_COLLECTION);
}

/** Rebuilds a snapshot and stores it. The hourly price job calls this so visitors rarely wait. */
export async function refreshHomepageSnapshot(ironman: boolean): Promise<HomepageSnapshot> {
    const snapshot = await computeHomepageSnapshot(ironman);
    await snapshotCollection().updateOne({ _id: snapshotKey(ironman) }, { $set: { snapshot } }, { upsert: true });
    memoryCache.set(snapshotKey(ironman), { snapshot, readAt: Date.now() });
    return snapshot;
}

/** Rebuilds a snapshot once, however many requests ask for it at the same time. */
function rebuildOnce(ironman: boolean): Promise<HomepageSnapshot> {
    const key = snapshotKey(ironman);
    const inFlight = rebuildsInFlight.get(key);
    if (inFlight) return inFlight;

    const rebuild = refreshHomepageSnapshot(ironman).finally(() => rebuildsInFlight.delete(key));
    rebuildsInFlight.set(key, rebuild);
    return rebuild;
}

function snapshotKey(ironman: boolean): string {
    return ironman ? 'ironman' : 'ge';
}

/**
 * The global homepage sections, as fast as they can be had.
 *
 * - A snapshot this instance read in the last minute comes straight from memory.
 * - Otherwise it's read from Mongo. A stale one is still returned straight away, and a rebuild
 *   starts in the background, so a visitor never waits on the expensive aggregation just because
 *   the hourly job hasn't run.
 * - Only when there's no snapshot at all does the caller wait for one to be built.
 */
export async function getHomepageSnapshot(ironman: boolean): Promise<HomepageSnapshot> {
    const key = snapshotKey(ironman);
    const remembered = memoryCache.get(key);
    if (remembered && Date.now() - remembered.readAt < MEMORY_CACHE_MS) return remembered.snapshot;

    const cached = await snapshotCollection().findOne({ _id: key });
    if (!cached) return rebuildOnce(ironman);

    memoryCache.set(key, { snapshot: cached.snapshot, readAt: Date.now() });
    if (Date.now() - cached.snapshot.computedAt >= HOMEPAGE_SNAPSHOT_MAX_AGE_MS) {
        rebuildOnce(ironman).catch((error) => console.error('Background homepage rebuild failed:', error));
    }
    return cached.snapshot;
}

/**
 * Where a creation's requirements come from: the whole tree's minimums when known, otherwise the
 * recipe's own requirements. Matches `buildPlayerSkillMatchExpression`.
 */
type RequirementSpec = {
    requiredSkills?: { skillName?: string; skillLevel?: number }[];
    treeMinSkills?: Record<string, number> | null;
};

export function findShortfalls(
    spec: RequirementSpec | null | undefined,
    levels: PlayerSkillLevels,
): HomepageShortfall[] {
    if (!spec) return [];
    const tree = spec.treeMinSkills && Object.keys(spec.treeMinSkills).length ? spec.treeMinSkills : null;
    const requirements = tree
        ? Object.entries(tree).map(([skill, level]) => ({ skill, level }))
        : (spec.requiredSkills ?? []).map((req) => ({ skill: req.skillName ?? '', level: req.skillLevel ?? 0 }));

    const shortfalls = new Map<string, HomepageShortfall>();
    for (const { skill, level } of requirements) {
        const key = canonicalSkill(skill);
        if (!key) continue;
        const have = levels[key] ?? 0;
        if (level <= have) continue;
        const existing = shortfalls.get(key);
        if (!existing || existing.need < level) shortfalls.set(key, { skill: key, need: level, have });
    }
    return Array.from(shortfalls.values());
}

/**
 * Profitable items the player can't make yet but could within a few levels.
 * @param skillLevels - The player's levels, keyed by lowercase skill name.
 * @param ironman - Whether to value items the Ironman way.
 * @param limit - How many to return, best profit first.
 */
export async function getAlmostUnlocked(
    skillLevels: PlayerSkillLevels,
    ironman: boolean,
    limit = 40,
): Promise<HomepageAlmostUnlocked[]> {
    const levels = normalizeSkillLevels(skillLevels);
    if (!levels) return [];
    const ahead = Object.fromEntries(
        Object.entries(levels).map(([skill, level]) => [skill, level + HOMEPAGE_ALMOST_UNLOCKED_LEVELS]),
    );
    const natureRunePrice = ironman ? await getNatureRunePrice() : undefined;

    const rows = await OsrsboxItemModel.aggregate<RawItem & { primarySpec?: RequirementSpec }>([
        { $match: baseCreationMatch(ironman) },
        {
            $match: {
                $expr: {
                    $and: [buildPlayerSkillMatchExpression(ahead), { $not: [buildPlayerSkillMatchExpression(levels)] }],
                },
            },
        },
        { $unset: ['equipment', 'weapon'] },
        ...buildProfitPipeline(null, true, false, false, ironman, natureRunePrice),
        { $match: { creationProfit: { $gt: 0 } } },
        { $sort: { creationProfit: -1, name: 1 } },
        { $limit: limit },
        { $set: { primarySpec: buildPrimarySpecExpression() } },
        {
            $project: {
                ...ITEM_PROJECTION,
                'primarySpec.requiredSkills': 1,
                'primarySpec.treeMinSkills': 1,
            },
        },
    ] as unknown as PipelineStage[]).allowDiskUse(true);

    return rows
        .map((row) => ({ item: toHomepageItem(row), shortfalls: findShortfalls(row.primarySpec, levels) }))
        .filter((row) => row.shortfalls.length > 0);
}
