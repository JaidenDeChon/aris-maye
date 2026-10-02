import mongoose, { type PipelineStage } from 'mongoose';
import { OsrsboxItemModel } from '$lib/models/mongo-schemas/osrsbox-db-item-schema';
import { CollectionMetadataModel } from '$lib/models/mongo-schemas/collection-metadata-schema';
import {
    buildPlayerSkillMatchExpression,
    buildPrimarySpecExpression,
    buildProfitPipeline,
    getIronmanNatureRunePrice,
    getNatureRunePrice,
    getVisibilityQuery,
    normalizeSkillLevels,
    type PlayerSkillLevels,
} from '$lib/services/game-item-mongo-service.server';
import {
    MOVERS_MIN_GP_PER_DAY,
    MOVERS_MIN_TRADES_PER_DAY,
    PRICE_CHANGE_MIN_HOURS,
    VOLUME_HISTORY_HOURS,
} from '$lib/constants/market';
import {
    HOMEPAGE_ALCH_MAX_PRICE_AGE_S,
    HOMEPAGE_ALMOST_UNLOCKED_LEVELS,
    HOMEPAGE_LIST_SIZE,
    HOMEPAGE_MIN_ROI_PROFIT,
    HOMEPAGE_SNAPSHOT_MAX_AGE_MS,
} from '$lib/constants/homepage';
import { canonicalSkill } from '$lib/constants/skill-aliases';
import { currencyItemNames } from '$lib/helpers/ingredient-price';
import type {
    HomepageAlchPick,
    HomepageAlmostUnlocked,
    HomepageBestXp,
    HomepageCheapXp,
    HomepageIronmanCorner,
    HomepageItem,
    HomepageMarketPulse,
    HomepageShopSale,
    HomepageShortfall,
    HomepageSkillEarner,
    HomepageSnapshot,
} from '$lib/models/homepage';

const SNAPSHOT_COLLECTION = 'homepage-snapshots';

/**
 * Bump whenever the snapshot's shape changes.
 *
 * Every deploy preview reads the same `osrsbox-dev` database, so without this a preview would read
 * the snapshot another preview's older code wrote, and the sections it adds would never appear. Each
 * version reads and writes its own document.
 */
const SNAPSHOT_VERSION = 5;

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
    volume1h: 1,
    volume24h: 1,
    priceChange24h: 1,
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
    volume1h?: number | null;
    volume24h?: number | null;
    priceChange24h?: number | null;
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
        volume1h: num(raw.volume1h),
        volume24h: num(raw.volume24h),
        priceChange24h: num(raw.priceChange24h),
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

/**
 * What's trading on the GE: the most traded items this hour, and the biggest risers and fallers
 * over the last day among items that trade enough for their price to mean something.
 */
async function computeMarketPulse(): Promise<HomepageMarketPulse> {
    const tradeable = { tradeable_on_ge: true, placeholder: false, noted: false, stacked: null };
    // The movers floor: enough gold and enough trades a day. See "Movers floor" in the plan doc.
    const liquid = {
        priceChange24h: { $ne: null },
        volume24h: { $gte: MOVERS_MIN_TRADES_PER_DAY },
        $expr: {
            $gte: [
                { $multiply: ['$volume24h', { $ifNull: [{ $avg: ['$highPrice', '$lowPrice'] }, 0] }] },
                MOVERS_MIN_GP_PER_DAY,
            ],
        },
    };

    const [facets] = await OsrsboxItemModel.aggregate<{
        historyHours: { hours: number }[];
        mostTraded: RawItem[];
        risers: RawItem[];
        fallers: RawItem[];
    }>([
        { $match: tradeable },
        {
            $facet: {
                historyHours: [
                    { $match: { 'volumeHistory.0': { $exists: true } } },
                    { $group: { _id: null, hours: { $max: { $size: '$volumeHistory' } } } },
                ],
                mostTraded: [
                    { $match: { volume1h: { $gt: 0 } } },
                    { $sort: { volume1h: -1, name: 1 } },
                    { $limit: HOMEPAGE_LIST_SIZE },
                    { $project: ITEM_PROJECTION },
                ],
                risers: [
                    { $match: { ...liquid, priceChange24h: { $gt: 0 } } },
                    { $sort: { priceChange24h: -1, name: 1 } },
                    { $limit: HOMEPAGE_LIST_SIZE },
                    { $project: ITEM_PROJECTION },
                ],
                fallers: [
                    { $match: { ...liquid, priceChange24h: { $lt: 0 } } },
                    { $sort: { priceChange24h: 1, name: 1 } },
                    { $limit: HOMEPAGE_LIST_SIZE },
                    { $project: ITEM_PROJECTION },
                ],
            },
        },
    ] as unknown as PipelineStage[]);

    return {
        historyHours: Math.min(VOLUME_HISTORY_HOURS, facets?.historyHours?.[0]?.hours ?? 0),
        hoursNeeded: PRICE_CHANGE_MIN_HOURS,
        mostTraded: (facets?.mostTraded ?? []).map(toHomepageItem),
        risers: (facets?.risers ?? []).map(toHomepageItem),
        fallers: (facets?.fallers ?? []).map(toHomepageItem),
    };
}

/** An item's alch value after the nature rune, as an aggregation expression. 0 when it can't be alched. */
function alchAfterRuneExpr(natureRunePrice: number) {
    return { $max: [0, { $subtract: [{ $ifNull: ['$highalch', 0] }, natureRunePrice] }] };
}

/**
 * Items an NPC shop pays more for than they alch for, best gain first, one shop per item.
 *
 * Only shops that pay in coins count; a Tokkul price isn't gp.
 */
async function computeShopSales(natureRunePrice: number): Promise<HomepageShopSale[]> {
    const rows = await OsrsboxItemModel.aggregate<
        RawItem & {
            shop: string;
            firstPrice: number;
            floorPrice: number;
            salesToFloor: number | null;
            alchValue: number;
        }
    >([
        { $match: { 'storePrices.0': { $exists: true }, placeholder: false, noted: false, stacked: null } },
        { $unwind: '$storePrices' },
        { $match: { 'storePrices.currency': null, 'storePrices.firstPrice': { $gt: 0 } } },
        { $set: { alchValue: alchAfterRuneExpr(natureRunePrice) } },
        { $set: { gain: { $subtract: ['$storePrices.firstPrice', '$alchValue'] } } },
        { $match: { gain: { $gt: 0 } } },
        // The best-paying shop for each item, then the items with the biggest gain over alching.
        { $sort: { id: 1, 'storePrices.firstPrice': -1 } },
        { $group: { _id: '$id', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
        { $sort: { gain: -1, name: 1 } },
        { $limit: HOMEPAGE_LIST_SIZE },
        {
            $project: {
                ...ITEM_PROJECTION,
                shop: '$storePrices.shop',
                firstPrice: '$storePrices.firstPrice',
                floorPrice: '$storePrices.floorPrice',
                salesToFloor: '$storePrices.salesToFloor',
                alchValue: 1,
            },
        },
    ] as unknown as PipelineStage[]);

    return rows.map((row) => ({
        item: toHomepageItem(row),
        shop: row.shop,
        firstPrice: row.firstPrice,
        floorPrice: row.floorPrice,
        salesToFloor: row.salesToFloor ?? null,
        alchValue: row.alchValue,
    }));
}

/**
 * Creations an Ironman can make entirely from shop stock and alch at a profit.
 *
 * Each ingredient is priced at the cheapest coin shop that stocks it, and coins at face value.
 * Any ingredient no shop sells rules the creation out. Only shops that also buy from players are in
 * the scraped data, so this can miss a few sell-only shops.
 */
async function computeShopSupplied(natureRunePrice: number): Promise<HomepageItem[]> {
    const rows = await OsrsboxItemModel.aggregate<RawItem>([
        { $match: { 'creationSpecs.0': { $exists: true }, placeholder: false, noted: false, stacked: null } },
        { $set: { primarySpec: buildPrimarySpecExpression() } },
        {
            $set: {
                consumed: {
                    $filter: {
                        input: { $ifNull: ['$primarySpec.ingredients', []] },
                        as: 'ing',
                        cond: { $ne: ['$$ing.consumedDuringCreation', false] },
                    },
                },
            },
        },
        { $match: { 'consumed.0': { $exists: true } } },
        {
            $lookup: {
                from: 'items',
                localField: 'consumed.item',
                foreignField: '_id',
                pipeline: [{ $project: { _id: 1, name: 1, storePrices: 1 } }],
                as: 'ingredientItems',
            },
        },
        {
            $set: {
                shopCostRows: {
                    $map: {
                        input: '$consumed',
                        as: 'ing',
                        in: {
                            $let: {
                                vars: {
                                    matched: {
                                        $first: {
                                            $filter: {
                                                input: '$ingredientItems',
                                                as: 'item',
                                                cond: { $eq: ['$$item._id', '$$ing.item'] },
                                            },
                                        },
                                    },
                                },
                                in: {
                                    $let: {
                                        vars: {
                                            unit: {
                                                $cond: [
                                                    { $in: ['$$matched.name', [...currencyItemNames]] },
                                                    1,
                                                    {
                                                        $min: {
                                                            $map: {
                                                                input: {
                                                                    $filter: {
                                                                        input: {
                                                                            $ifNull: ['$$matched.storePrices', []],
                                                                        },
                                                                        as: 'sp',
                                                                        cond: {
                                                                            $and: [
                                                                                {
                                                                                    $eq: [
                                                                                        {
                                                                                            $ifNull: [
                                                                                                '$$sp.currency',
                                                                                                null,
                                                                                            ],
                                                                                        },
                                                                                        null,
                                                                                    ],
                                                                                },
                                                                                {
                                                                                    $gt: [
                                                                                        {
                                                                                            $ifNull: [
                                                                                                '$$sp.buyPrice',
                                                                                                0,
                                                                                            ],
                                                                                        },
                                                                                        0,
                                                                                    ],
                                                                                },
                                                                                { $ne: ['$$sp.stock', 0] },
                                                                            ],
                                                                        },
                                                                    },
                                                                },
                                                                as: 'sp',
                                                                in: '$$sp.buyPrice',
                                                            },
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                        in: {
                                            $cond: [
                                                { $gt: ['$$unit', 0] },
                                                { $multiply: ['$$unit', { $ifNull: ['$$ing.amount', 1] }] },
                                                null,
                                            ],
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        // Every ingredient has to come from a shop.
        {
            $match: {
                $expr: { $allElementsTrue: { $map: { input: '$shopCostRows', as: 'c', in: { $ne: ['$$c', null] } } } },
            },
        },
        { $set: { creationCost: { $sum: '$shopCostRows' } } },
        { $set: { creationProfit: { $subtract: [alchAfterRuneExpr(natureRunePrice), '$creationCost'] } } },
        { $match: { creationProfit: { $gt: 0 } } },
        {
            $set: {
                creationRoi: {
                    $cond: [{ $gt: ['$creationCost', 0] }, { $divide: ['$creationProfit', '$creationCost'] }, null],
                },
            },
        },
        { $sort: { creationProfit: -1, name: 1 } },
        { $limit: HOMEPAGE_LIST_SIZE },
        { $project: ITEM_PROJECTION },
    ] as unknown as PipelineStage[]).allowDiskUse(true);

    return rows.map(toHomepageItem);
}

/** Builds every global homepage section from scratch. */
export async function computeHomepageSnapshot(ironman: boolean): Promise<HomepageSnapshot> {
    // Two rune prices: buying one to alch on the GE is a main's cost, and a shop's price is an
    // Ironman's. Every Ironman figure, the corner included, uses the shop price so nothing an
    // Ironman sees depends on the GE.
    const [geRunePrice, ironmanRunePrice] = await Promise.all([getNatureRunePrice(), getIronmanNatureRunePrice()]);
    // The Ironman corner shows for everyone, so the Ironman view of creations is always needed. For
    // an Ironman snapshot it's also the main view, so it's only computed once.
    const ironmanCreationPromise = computeCreationSections(true, ironmanRunePrice);
    const [creation, ironmanCreation, alchPicks, marketPulse, shopSales, shopSupplied] = await Promise.all([
        ironman ? ironmanCreationPromise : computeCreationSections(false, geRunePrice),
        ironmanCreationPromise,
        // An Ironman can't buy or sell on the GE, so these aren't open to them.
        ironman ? Promise.resolve([]) : computeAlchPicks(geRunePrice),
        ironman ? Promise.resolve(null) : computeMarketPulse(),
        computeShopSales(ironmanRunePrice),
        computeShopSupplied(ironmanRunePrice),
    ]);

    const ironmanCorner: HomepageIronmanCorner = {
        shopSales,
        shopSupplied,
        craftToAlch: ironmanCreation.topProfit,
        cheapXp: ironmanCreation.cheapXp,
    };

    return {
        ironman,
        computedAt: Date.now(),
        natureRunePrice: ironman ? ironmanRunePrice : geRunePrice,
        ...creation,
        alchPicks,
        marketPulse,
        ironmanCorner,
    };
}

type SnapshotDoc = {
    _id: string;
    snapshot?: HomepageSnapshot;
    /** When a request last claimed this snapshot's rebuild. See `getFreshHomepageSnapshot`. */
    rebuildingAt?: number;
};

/** How long a claimed rebuild holds off other requests before they assume it died and try again. */
const REBUILD_CLAIM_MS = 2 * 60 * 1000;

function snapshotCollection() {
    return mongoose.connection.collection<SnapshotDoc>(SNAPSHOT_COLLECTION);
}

/** Rebuilds a snapshot and stores it. The hourly price job calls this so visitors rarely wait. */
export async function refreshHomepageSnapshot(ironman: boolean): Promise<HomepageSnapshot> {
    const snapshot = await computeHomepageSnapshot(ironman);
    await snapshotCollection().updateOne(
        { _id: snapshotKey(ironman) },
        { $set: { snapshot }, $unset: { rebuildingAt: '' } },
        { upsert: true },
    );
    memoryCache.set(snapshotKey(ironman), { snapshot, readAt: Date.now() });
    return snapshot;
}

/** Rebuilds a snapshot once, however many requests in this instance ask for it at the same time. */
function rebuildOnce(ironman: boolean): Promise<HomepageSnapshot> {
    const key = snapshotKey(ironman);
    const inFlight = rebuildsInFlight.get(key);
    if (inFlight) return inFlight;

    const rebuild = refreshHomepageSnapshot(ironman).finally(() => rebuildsInFlight.delete(key));
    rebuildsInFlight.set(key, rebuild);
    return rebuild;
}

function snapshotKey(ironman: boolean): string {
    return `${ironman ? 'ironman' : 'ge'}-v${SNAPSHOT_VERSION}`;
}

function isStale(snapshot: HomepageSnapshot): boolean {
    return Date.now() - snapshot.computedAt >= HOMEPAGE_SNAPSHOT_MAX_AGE_MS;
}

/**
 * The global homepage sections, as fast as they can be had.
 *
 * - A snapshot this instance read in the last minute comes straight from memory.
 * - Otherwise it's read from Mongo, and returned even when it's stale. The browser sees the old
 *   `computedAt` and asks `getFreshHomepageSnapshot` for a new one.
 * - Only when there's no snapshot at all does the caller wait for one to be built.
 *
 * This never starts a rebuild it doesn't wait for: on Netlify a function is frozen once it has
 * answered, so a rebuild left running in the background never finishes.
 */
export async function getHomepageSnapshot(ironman: boolean): Promise<HomepageSnapshot> {
    const key = snapshotKey(ironman);
    const remembered = memoryCache.get(key);
    if (remembered && Date.now() - remembered.readAt < MEMORY_CACHE_MS) return remembered.snapshot;

    const cached = await snapshotCollection().findOne({ _id: key });
    if (!cached?.snapshot) return rebuildOnce(ironman);

    memoryCache.set(key, { snapshot: cached.snapshot, readAt: Date.now() });
    return cached.snapshot;
}

/**
 * A snapshot no older than `HOMEPAGE_SNAPSHOT_MAX_AGE_MS`, rebuilt now if need be.
 *
 * Only one request across every server instance rebuilds a stale snapshot at a time: it claims the
 * rebuild in Mongo first, and any other request that finds it claimed gets the stale one back.
 */
export async function getFreshHomepageSnapshot(ironman: boolean): Promise<HomepageSnapshot> {
    const key = snapshotKey(ironman);
    const cached = await snapshotCollection().findOne({ _id: key });
    if (!cached?.snapshot) return rebuildOnce(ironman);
    if (!isStale(cached.snapshot)) {
        memoryCache.set(key, { snapshot: cached.snapshot, readAt: Date.now() });
        return cached.snapshot;
    }

    const now = Date.now();
    const claim = await snapshotCollection().updateOne(
        {
            _id: key,
            $or: [{ rebuildingAt: { $exists: false } }, { rebuildingAt: { $lt: now - REBUILD_CLAIM_MS } }],
        },
        { $set: { rebuildingAt: now } },
    );
    if (!claim.modifiedCount) return cached.snapshot;

    try {
        return await rebuildOnce(ironman);
    } catch (error) {
        await snapshotCollection()
            .updateOne({ _id: key }, { $unset: { rebuildingAt: '' } })
            .catch(() => {});
        throw error;
    }
}

let pulseCache: { pulse: HomepageMarketPulse; readAt: number } | null = null;

/**
 * Market pulse straight from the items, cached for a minute.
 *
 * The homepage reads this on its own instead of from the snapshot: it's cheap to work out, and it
 * shouldn't sit at an old hour count just because the expensive snapshot hasn't been rebuilt.
 */
export async function getMarketPulse(): Promise<HomepageMarketPulse> {
    if (pulseCache && Date.now() - pulseCache.readAt < MEMORY_CACHE_MS) return pulseCache.pulse;
    const pulse = await computeMarketPulse();
    pulseCache = { pulse, readAt: Date.now() };
    return pulse;
}

/** Where the homepage's data stands, for checking a deploy from the browser. */
export type HomepageStatus = {
    /** When the hourly job last wrote prices, in milliseconds since the epoch. */
    pricesUpdatedAt: number | null;
    /** How many GE items have any trade history stored. */
    itemsWithVolumeHistory: number;
    /** The longest trade history any item has, in hours. */
    historyHours: number;
    /** When each snapshot this code reads was built, and whether a rebuild is claimed. */
    snapshots: Record<string, { computedAt: number | null; rebuildingAt: number | null }>;
};

export async function getHomepageStatus(): Promise<HomepageStatus> {
    const keys = [snapshotKey(false), snapshotKey(true)];
    const [metadata, itemsWithVolumeHistory, pulse, docs] = await Promise.all([
        CollectionMetadataModel.findOne({ collectionName: 'items' }).lean().exec(),
        OsrsboxItemModel.countDocuments({ 'volumeHistory.0': { $exists: true } }).exec(),
        computeMarketPulse(),
        snapshotCollection()
            .find({ _id: { $in: keys } }, { projection: { 'snapshot.computedAt': 1, rebuildingAt: 1 } })
            .toArray(),
    ]);
    const snapshots: HomepageStatus['snapshots'] = {};
    for (const key of keys) {
        const doc = docs.find((d) => d._id === key);
        snapshots[key] = { computedAt: doc?.snapshot?.computedAt ?? null, rebuildingAt: doc?.rebuildingAt ?? null };
    }
    return {
        pricesUpdatedAt: metadata?.lastUpdated ?? null,
        itemsWithVolumeHistory,
        historyHours: pulse.historyHours,
        snapshots,
    };
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
    const natureRunePrice = ironman ? await getIronmanNatureRunePrice() : undefined;

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

/**
 * For each skill, the creation that gives the most XP per action at the player's levels.
 *
 * This doesn't depend on anything turning a profit, so a player always gets something to work
 * toward. Values follow the account type: an Ironman's costs come from alch values, never the GE.
 * @param skillLevels - The player's levels, keyed by lowercase skill name.
 * @param ironman - Whether to value items the Ironman way.
 * @param limit - How many skills to return, most XP first.
 */
export async function getBestXp(
    skillLevels: PlayerSkillLevels,
    ironman: boolean,
    limit = HOMEPAGE_LIST_SIZE,
): Promise<HomepageBestXp[]> {
    const levels = normalizeSkillLevels(skillLevels);
    if (!levels) return [];
    const natureRunePrice = ironman ? await getIronmanNatureRunePrice() : undefined;

    const rows = await OsrsboxItemModel.aggregate<{ _id: string; item: RawItem; xp: number; gpPerXp: number | null }>([
        { $match: baseCreationMatch(ironman) },
        { $match: { $expr: buildPlayerSkillMatchExpression(levels) } },
        { $unset: ['equipment', 'weapon'] },
        ...buildProfitPipeline(null, false, false, false, ironman, natureRunePrice),
        { $set: { primarySpec: buildPrimarySpecExpression() } },
        { $unwind: '$primarySpec.experienceGranted' },
        { $match: { 'primarySpec.experienceGranted.experienceAmount': { $gt: 0 } } },
        {
            $set: {
                xp: '$primarySpec.experienceGranted.experienceAmount',
                gpPerXp: {
                    $cond: [
                        { $eq: [{ $ifNull: ['$creationProfit', null] }, null] },
                        null,
                        {
                            $divide: [
                                { $max: [0, { $multiply: ['$creationProfit', -1] }] },
                                '$primarySpec.experienceGranted.experienceAmount',
                            ],
                        },
                    ],
                },
            },
        },
        // Most XP first; among equals, the one with a known cost, then the cheaper.
        { $set: { costKnown: { $ne: ['$gpPerXp', null] } } },
        { $sort: { xp: -1, costKnown: -1, gpPerXp: 1, name: 1 } },
        {
            $group: {
                _id: { $toLower: '$primarySpec.experienceGranted.skillName' },
                item: {
                    $first: Object.fromEntries(
                        Object.keys(ITEM_PROJECTION)
                            .filter((k) => k !== '_id')
                            .map((k) => [k, `$$ROOT.${k}`]),
                    ),
                },
                xp: { $first: '$xp' },
                gpPerXp: { $first: '$gpPerXp' },
            },
        },
    ] as unknown as PipelineStage[]).allowDiskUse(true);

    // Two spellings of one skill ("runecraft", "runecrafting") are merged, keeping the bigger XP.
    const bySkill = new Map<string, HomepageBestXp>();
    for (const row of rows) {
        const skill = canonicalSkill(row._id);
        if (!skill) continue;
        const existing = bySkill.get(skill);
        if (existing && existing.xp >= row.xp) continue;
        bySkill.set(skill, { skill, item: toHomepageItem(row.item), xp: row.xp, gpPerXp: row.gpPerXp });
    }
    return Array.from(bySkill.values())
        .sort((a, b) => b.xp - a.xp)
        .slice(0, limit);
}
