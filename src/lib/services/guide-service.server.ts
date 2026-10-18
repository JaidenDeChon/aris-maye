import { type PipelineStage } from 'mongoose';
import { OsrsboxItemModel } from '$lib/models/mongo-schemas/osrsbox-db-item-schema';
import {
    buildPrimarySpecExpression,
    buildProfitPipeline,
    getIronmanNatureRunePrice,
    getNatureRunePrice,
} from '$lib/services/game-item-mongo-service.server';
import {
    ITEM_PROJECTION,
    LIQUID_MATCH,
    TRADEABLE_MATCH,
    baseCreationMatch,
    computeAlchPicks,
    computeCreationSections,
    computeShopSales,
    computeShopSupplied,
    toHomepageItem,
    type RawItem,
} from '$lib/services/homepage-service.server';
import { createSnapshotCache, mongoSnapshotCollection, type SnapshotCache } from '$lib/services/snapshot-cache.server';
import {
    GUIDE_ROWS,
    GUIDE_SNAPSHOT_COLLECTION,
    GUIDE_SNAPSHOT_VERSION,
    XP_GUIDE_SKILLS,
    XP_LEVEL_BANDS,
    type GuideKey,
} from '$lib/constants/guides';
import { HOMEPAGE_SNAPSHOT_MAX_AGE_MS } from '$lib/constants/homepage';
import { VOLUME_HISTORY_HOURS } from '$lib/constants/market';
import { canonicalSkill } from '$lib/constants/skill-aliases';
import { levelBand, summarizeChanges } from '$lib/helpers/guides';
import type {
    CheapestXpGuide,
    HighAlchGuide,
    IronmanGuide,
    MarketItem,
    MarketReport,
    XpMethod,
} from '$lib/models/guides';

/** GP traded in the last day, as an aggregation expression. */
const GP_TRADED_EXPR = { $multiply: [{ $ifNull: ['$volume24h', 0] }, { $ifNull: ['$typicalPrice24h', 0] }] };

const MARKET_PROJECTION = { ...ITEM_PROJECTION, gpTraded24h: GP_TRADED_EXPR };

function toMarketItem(raw: RawItem & { gpTraded24h?: number | null }): MarketItem {
    const gp = raw.gpTraded24h;
    return { ...toHomepageItem(raw), gpTraded24h: typeof gp === 'number' && Number.isFinite(gp) ? gp : null };
}

/**
 * The GE market report: the day's risers and fallers above the movers floor, the most traded
 * items, and a summary of the whole day.
 */
export async function computeMarketReport(): Promise<MarketReport> {
    const rows = GUIDE_ROWS.market;
    type Raw = RawItem & { gpTraded24h?: number | null };
    const [facets] = await OsrsboxItemModel.aggregate<{
        historyHours: { hours: number }[];
        gpTraded: { total: number }[];
        liquidChanges: { changes: number[] }[];
        risers: Raw[];
        fallers: Raw[];
        mostTradedByGp: Raw[];
        mostTradedByCount: Raw[];
    }>([
        { $match: TRADEABLE_MATCH },
        {
            $facet: {
                historyHours: [
                    { $match: { 'volumeHistory.0': { $exists: true } } },
                    { $group: { _id: null, hours: { $max: { $size: '$volumeHistory' } } } },
                ],
                gpTraded: [{ $group: { _id: null, total: { $sum: GP_TRADED_EXPR } } }],
                liquidChanges: [
                    { $match: LIQUID_MATCH },
                    { $group: { _id: null, changes: { $push: '$priceChange24h' } } },
                ],
                risers: [
                    { $match: { ...LIQUID_MATCH, priceChange24h: { $gt: 0 } } },
                    { $sort: { priceChange24h: -1, name: 1 } },
                    { $limit: rows },
                    { $project: MARKET_PROJECTION },
                ],
                fallers: [
                    { $match: { ...LIQUID_MATCH, priceChange24h: { $lt: 0 } } },
                    { $sort: { priceChange24h: 1, name: 1 } },
                    { $limit: rows },
                    { $project: MARKET_PROJECTION },
                ],
                mostTradedByGp: [
                    { $set: { gpTraded24h: GP_TRADED_EXPR } },
                    { $match: { gpTraded24h: { $gt: 0 } } },
                    { $sort: { gpTraded24h: -1, name: 1 } },
                    { $limit: rows },
                    { $project: MARKET_PROJECTION },
                ],
                mostTradedByCount: [
                    { $match: { volume24h: { $gt: 0 } } },
                    { $sort: { volume24h: -1, name: 1 } },
                    { $limit: rows },
                    { $project: MARKET_PROJECTION },
                ],
            },
        },
    ] as unknown as PipelineStage[]);

    const changes = (facets?.liquidChanges?.[0]?.changes ?? []).filter((c) => typeof c === 'number');
    return {
        computedAt: Date.now(),
        historyHours: Math.min(VOLUME_HISTORY_HOURS, facets?.historyHours?.[0]?.hours ?? 0),
        summary: { gpTraded24h: facets?.gpTraded?.[0]?.total ?? 0, ...summarizeChanges(changes) },
        risers: (facets?.risers ?? []).map(toMarketItem),
        fallers: (facets?.fallers ?? []).map(toMarketItem),
        mostTradedByGp: (facets?.mostTradedByGp ?? []).map(toMarketItem),
        mostTradedByCount: (facets?.mostTradedByCount ?? []).map(toMarketItem),
    };
}

/** Items worth buying on the GE to high alch, at full length. */
export async function computeHighAlch(): Promise<HighAlchGuide> {
    const natureRunePrice = await getNatureRunePrice();
    const picks = await computeAlchPicks(natureRunePrice, GUIDE_ROWS.highAlch);
    return { computedAt: Date.now(), natureRunePrice, picks };
}

type RawXpRow = RawItem & {
    xpSkill: string;
    xp: number;
    gpPerXp: number;
    requiredSkills?: { skillName?: string; skillLevel?: number }[];
};

/** The cheapest XP rows for each guide skill, bucketed by level band. Pure, for the data check. */
export function bucketXpRows(rows: RawXpRow[]): CheapestXpGuide['skills'] {
    const guideSkills = new Set<string>(XP_GUIDE_SKILLS.map((skill) => skill.slug));
    const buckets = new Map<string, XpMethod[]>();

    for (const row of rows) {
        const skill = canonicalSkill(row.xpSkill);
        if (!guideSkills.has(skill)) continue;
        // The level comes from the requirement in the same skill, whichever way the recipe spells it.
        const requirement = (row.requiredSkills ?? []).find((req) => canonicalSkill(req.skillName) === skill);
        const level =
            typeof requirement?.skillLevel === 'number' && requirement.skillLevel > 0 ? requirement.skillLevel : 1;
        const key = `${skill}:${levelBand(level).min}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push({ item: toHomepageItem(row), level, xp: row.xp, gpPerXp: row.gpPerXp });
        buckets.set(key, bucket);
    }

    return XP_GUIDE_SKILLS.map(({ slug }) => ({
        skill: slug,
        bands: XP_LEVEL_BANDS.map(({ min, max }) => ({
            min,
            max,
            rows: (buckets.get(`${slug}:${min}`) ?? [])
                .sort((a, b) => a.gpPerXp - b.gpPerXp || b.xp - a.xp || a.item.name.localeCompare(b.item.name))
                .slice(0, GUIDE_ROWS.xpPerBand),
        })),
    }));
}

/**
 * The cheapest way to get XP by making things, for each guide skill and level band, valued for a
 * main from GE prices. One pass of the profit pipeline; the bucketing happens here rather than in
 * Mongo so it doesn't depend on the server's version.
 */
export async function computeCheapestXp(): Promise<CheapestXpGuide> {
    const natureRunePrice = await getNatureRunePrice();
    const rows = await OsrsboxItemModel.aggregate<RawXpRow>([
        { $match: baseCreationMatch(false) },
        { $unset: ['equipment', 'weapon'] },
        ...buildProfitPipeline(null, true, false, false, false, natureRunePrice),
        { $set: { primarySpec: buildPrimarySpecExpression() } },
        { $unwind: '$primarySpec.experienceGranted' },
        { $match: { 'primarySpec.experienceGranted.experienceAmount': { $gt: 0 } } },
        {
            $set: {
                xpSkill: { $toLower: '$primarySpec.experienceGranted.skillName' },
                xp: '$primarySpec.experienceGranted.experienceAmount',
                // A creation that makes money costs nothing per XP; it pays you instead.
                gpPerXp: {
                    $divide: [
                        { $max: [0, { $multiply: ['$creationProfit', -1] }] },
                        '$primarySpec.experienceGranted.experienceAmount',
                    ],
                },
                requiredSkills: { $ifNull: ['$primarySpec.requiredSkills', []] },
            },
        },
        {
            $project: {
                ...ITEM_PROJECTION,
                xpSkill: 1,
                xp: 1,
                gpPerXp: 1,
                'requiredSkills.skillName': 1,
                'requiredSkills.skillLevel': 1,
            },
        },
    ] as unknown as PipelineStage[]).allowDiskUse(true);

    return { computedAt: Date.now(), skills: bucketXpRows(rows) };
}

/** The homepage's Ironman corner, at full length. Nothing here depends on the GE. */
export async function computeIronmanGuide(): Promise<IronmanGuide> {
    const natureRunePrice = await getIronmanNatureRunePrice();
    const [shopSales, shopSupplied, creation] = await Promise.all([
        computeShopSales(natureRunePrice, GUIDE_ROWS.ironman),
        computeShopSupplied(natureRunePrice, GUIDE_ROWS.ironman),
        computeCreationSections(true, natureRunePrice, GUIDE_ROWS.ironman),
    ]);
    return {
        computedAt: Date.now(),
        natureRunePrice,
        shopSales,
        shopSupplied,
        craftToAlch: creation.topProfit,
        cheapXp: creation.cheapXp,
    };
}

type GuideSnapshots = {
    market: MarketReport;
    'high-alch': HighAlchGuide;
    'cheapest-xp': CheapestXpGuide;
    ironman: IronmanGuide;
};

const builders: { [K in GuideKey]: () => Promise<GuideSnapshots[K]> } = {
    market: computeMarketReport,
    'high-alch': computeHighAlch,
    'cheapest-xp': computeCheapestXp,
    ironman: computeIronmanGuide,
};

const caches = new Map<GuideKey, SnapshotCache<GuideSnapshots[GuideKey]>>();

function guideCache<K extends GuideKey>(key: K): SnapshotCache<GuideSnapshots[K]> {
    let cache = caches.get(key);
    if (!cache) {
        cache = createSnapshotCache<GuideSnapshots[GuideKey]>({
            collection: mongoSnapshotCollection(GUIDE_SNAPSHOT_COLLECTION),
            key: `${key}-v${GUIDE_SNAPSHOT_VERSION}`,
            compute: builders[key],
            maxAgeMs: HOMEPAGE_SNAPSHOT_MAX_AGE_MS,
        });
        caches.set(key, cache);
    }
    return cache as SnapshotCache<GuideSnapshots[K]>;
}

/**
 * A guide's tables, for its page. Always awaited, because a crawler has to get the tables in the
 * HTML: a stored copy comes back straight away, a missing one is built during the request, and a
 * stale one is rebuilt by whichever request claims it while the others get the stale copy.
 */
export function getGuideSnapshot<K extends GuideKey>(key: K): Promise<GuideSnapshots[K]> {
    return guideCache(key).getFresh();
}

/** Rebuilds a guide's tables now. The hourly price job calls this through the refresh endpoint. */
export function refreshGuideSnapshot<K extends GuideKey>(key: K): Promise<GuideSnapshots[K]> {
    return guideCache(key).refresh();
}

/** When each guide's stored snapshot was built, for the status endpoint. */
export async function getGuideStatus(): Promise<
    Record<string, { computedAt: number | null; rebuildingAt: number | null }>
> {
    const keys = Object.keys(builders) as GuideKey[];
    const statuses = await Promise.all(keys.map((key) => guideCache(key).status()));
    return Object.fromEntries(keys.map((key, i) => [`${key}-v${GUIDE_SNAPSHOT_VERSION}`, statuses[i]]));
}
