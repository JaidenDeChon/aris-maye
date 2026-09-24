import { Types } from 'mongoose';
import { skillTreeSlugs } from '$lib/constants/skill-tree-pages';
import { MAX_ITEM_TREE_DEPTH, MAX_ITEM_TREE_NODES } from '$lib/constants/item-tree';
import { OsrsboxItemModel, type OsrsboxItemDocument } from '$lib/models/mongo-schemas/osrsbox-db-item-schema';
import { NATURE_RUNE_FALLBACK_PRICE, NATURE_RUNE_ITEM_ID } from '$lib/constants/alchemy';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
import { currencyItemNames } from '$lib/helpers/ingredient-price';

type GameItemDoc = OsrsboxItemDocument & {
    _id: Types.ObjectId;
    creationCost?: number | null;
    creationProfit?: number | null;
    creationRoi?: number | null;
    /** What the item is realistically worth to an account that cannot trade. Ironman mode only. */
    ironmanExitValue?: number | null;
};
const MAX_INGREDIENT_DEPTH = MAX_ITEM_TREE_DEPTH;

export type GameItemFilter = 'all' | 'members' | 'f2p' | 'equipable' | 'stackable' | 'quest' | 'nonquest';
export type GameItemSortOrder = 'asc' | 'desc' | 'roi-desc' | 'roi-value-desc';

/** Sort orders that used to be exposed, kept working for bookmarked URLs and persisted preferences. */
const LEGACY_SORT_ORDERS: Record<string, GameItemSortOrder> = {
    'profit-asc': 'roi-value-desc',
    'profit-desc': 'roi-value-desc',
};
export type PlayerSkillLevels = Record<string, number>;
export type PlayerSupplies = Record<string, number>;

/**
 * The live nature rune price, cached briefly.
 *
 * Every Ironman valuation is net of the rune an alchemy cast burns, so this is read once and reused
 * across the documents in a request rather than hardcoded — a fixed gp figure goes stale as soon as
 * the market moves. A failed read falls back to the documented default rather than pricing the rune
 * at zero, which would overstate every value on the page.
 */
let natureRunePriceCache: { price: number; readAt: number } | null = null;
const NATURE_RUNE_CACHE_MS = 5 * 60 * 1000;

async function getNatureRunePrice(): Promise<number> {
    if (natureRunePriceCache && Date.now() - natureRunePriceCache.readAt < NATURE_RUNE_CACHE_MS) {
        return natureRunePriceCache.price;
    }

    try {
        const rune = await OsrsboxItemModel.findOne({ id: NATURE_RUNE_ITEM_ID })
            .select({ highPrice: 1, lowPrice: 1 })
            .lean<{ highPrice?: number; lowPrice?: number }>()
            .exec();

        const price = rune?.highPrice ?? rune?.lowPrice ?? null;
        const resolved = typeof price === 'number' && price > 0 ? price : NATURE_RUNE_FALLBACK_PRICE;
        natureRunePriceCache = { price: resolved, readAt: Date.now() };
        return resolved;
    } catch {
        return NATURE_RUNE_FALLBACK_PRICE;
    }
}

export type PaginatedGameItems = {
    items: GameItemDoc[];
    total: number;
    page: number;
    perPage: number;
};

/**
 * The fields the ingredient tree is actually read for.
 *
 * A tree node is a whole OSRSBox document by default, and most of that document — combat
 * bonuses, wiki links, release dates, linked ids — is never rendered. Sending it anyway
 * cost roughly 40% of a payload that already reaches 1.5MB on the worst items, multiplied
 * by every repeated node. `tradeable_on_ge` and `name` are here for
 * `resolveIngredientUnitPrice`, which the cost table applies per row.
 */
const TREE_NODE_PROJECTION = {
    _id: 1,
    id: 1,
    name: 1,
    icon: 1,
    examine: 1,
    highPrice: 1,
    lowPrice: 1,
    highalch: 1,
    lowalch: 1,
    cost: 1,
    tradeable_on_ge: 1,
    creationSpecs: 1,
} as const;

/**
 * Populates nested ingredient trees so the frontend can render a full org chart.
 */
export async function populateIngredientsTree(itemId: string): Promise<IOsrsboxItemWithMeta | null> {
    const trimmedId = itemId.trim();
    const numericId = Number(trimmedId);
    const query: Record<string, unknown> = {};

    if (Number.isFinite(numericId)) {
        query.id = numericId;
    } else if (Types.ObjectId.isValid(trimmedId)) {
        query._id = new Types.ObjectId(trimmedId);
    } else {
        query.id = trimmedId;
    }

    const root = await OsrsboxItemModel.findOne(query, TREE_NODE_PROJECTION)
        .lean<IOsrsboxItemWithMeta & { _id: Types.ObjectId }>()
        .exec();
    if (!root) return null;

    // Fetch each unique ingredient exactly once, batching one query per tree level
    // instead of issuing a round-trip per ingredient document.
    const cache = new Map<string, IOsrsboxItemWithMeta>();
    let frontier = collectIngredientIds(root);
    for (let depth = 0; depth < MAX_INGREDIENT_DEPTH && frontier.length; depth += 1) {
        const missing = Array.from(new Set(frontier)).filter((id) => !cache.has(id));
        if (!missing.length) break;

        const docs = await OsrsboxItemModel.find(
            { _id: { $in: missing.map((id) => new Types.ObjectId(id)) } },
            TREE_NODE_PROJECTION,
        )
            .lean<(IOsrsboxItemWithMeta & { _id: Types.ObjectId })[]>()
            .exec();

        frontier = [];
        for (const doc of docs) {
            cache.set(doc._id.toString(), doc);
            frontier.push(...collectIngredientIds(doc));
        }
    }

    attachIngredientsFromCache(root, root, cache, 0, new Set([root._id.toString()]), { attached: 0 });

    return root;
}

/**
 * Rewrites a cloned document's ingredient references as plain hex id strings.
 *
 * `structuredClone` strips the ObjectId prototype, so a reference left untouched
 * serializes as a byte map — `{"buffer":{"0":105,...}}` — which is both ~200 bytes and
 * unreadable by the chart's lazy loader. The ids are read from `source`, which still holds
 * real ObjectIds.
 * @param target - The cloned document to fix up.
 * @param source - The cached document the clone was made from.
 */
function writeIngredientIdsAsStrings(target: IOsrsboxItemWithMeta, source: IOsrsboxItemWithMeta): void {
    const targetSpecs = target.creationSpecs ?? [];
    const sourceSpecs = source.creationSpecs ?? [];

    for (let specIndex = 0; specIndex < sourceSpecs.length; specIndex += 1) {
        const sourceIngredients = sourceSpecs[specIndex]?.ingredients ?? [];
        const targetIngredients = targetSpecs[specIndex]?.ingredients ?? [];

        for (let i = 0; i < sourceIngredients.length; i += 1) {
            const raw = sourceIngredients[i]?.item as unknown;
            const targetIngredient = targetIngredients[i];
            if (!(raw instanceof Types.ObjectId) || !targetIngredient) continue;
            targetIngredient.item = raw.toString() as unknown as (typeof targetIngredient)['item'];
        }
    }
}

/**
 * Returns the ObjectId keys of all ingredient references on an unpopulated (raw) item document.
 */
function collectIngredientIds(item: IOsrsboxItemWithMeta): string[] {
    const ids: string[] = [];
    for (const spec of item.creationSpecs ?? []) {
        for (const ingredient of spec.ingredients ?? []) {
            const raw = ingredient.item as unknown;
            if (raw instanceof Types.ObjectId) ids.push(raw.toString());
        }
    }
    return ids;
}

/**
 * Replaces ingredient ObjectId references with materialized copies of the cached documents.
 * Walks the raw `source` doc for ingredient ids (structuredClone strips the ObjectId prototype
 * from `target`) and gives every occurrence its own clone so the tree has no shared object
 * graphs, which JSON.stringify would otherwise duplicate or treat as circular.
 *
 * The depth budget alone does not bound cyclic data. `Plank` lists a `Sawmill voucher` and
 * the voucher lists planks, so every level of that loop multiplies the node count instead
 * of adding to it: the twelve-level budget turned `Shaving stand` into hundreds of
 * thousands of nodes and the request never came back. `ancestors` carries the ids already
 * open on this path, and an ingredient found there is attached as a leaf rather than
 * expanded again — the row still renders, the loop just stops unrolling.
 *
 * That guard is per-path, so it cannot see a loop that runs through two OSRSBox documents
 * for the same item — `Black cape` is built from `Blue cape`, which is built from a second
 * `Black cape` id. `budget` is the backstop for those: once the tree has materialized
 * `MAX_ITEM_TREE_NODES`, later ingredients are attached with their data but not expanded.
 */
function attachIngredientsFromCache(
    target: IOsrsboxItemWithMeta,
    source: IOsrsboxItemWithMeta,
    cache: Map<string, IOsrsboxItemWithMeta>,
    depth: number,
    ancestors: Set<string>,
    budget: { attached: number },
): void {
    const targetSpecs = target.creationSpecs ?? [];
    const sourceSpecs = source.creationSpecs ?? [];

    for (let specIndex = 0; specIndex < sourceSpecs.length; specIndex += 1) {
        const sourceIngredients = sourceSpecs[specIndex]?.ingredients ?? [];
        const targetIngredients = targetSpecs[specIndex]?.ingredients ?? [];

        for (let i = 0; i < sourceIngredients.length; i += 1) {
            const raw = sourceIngredients[i]?.item as unknown;
            const targetIngredient = targetIngredients[i];
            if (!(raw instanceof Types.ObjectId) || !targetIngredient) continue;

            const key = raw.toString();

            // Write the plain id first, so an ingredient this walk decides not to expand
            // still leaves something the client can use. `structuredClone` strips the
            // ObjectId prototype, and the leftover serializes as a byte-map blob —
            // {"buffer":{"0":105,...}} — which is ~200 bytes and which the chart's lazy
            // loader cannot read. The hex string is 26 bytes and it already handles it.
            targetIngredient.item = key as unknown as (typeof targetIngredient)['item'];

            const cached = cache.get(key);
            if (!cached) continue;
            if (depth >= MAX_INGREDIENT_DEPTH) continue;
            if (budget.attached >= MAX_ITEM_TREE_NODES) continue;

            const copy = structuredClone(cached);
            // Do this before the copy is attached: a node reached as a leaf never has its
            // own ingredients walked, so this is the only chance to replace the prototype
            // structuredClone just stripped.
            writeIngredientIdsAsStrings(copy, cached);
            targetIngredient.item = copy as unknown as (typeof targetIngredient)['item'];
            budget.attached += 1;

            if (ancestors.has(key)) continue;

            ancestors.add(key);
            attachIngredientsFromCache(copy, cached, cache, depth + 1, ancestors, budget);
            ancestors.delete(key);
        }
    }
}

/**
 * Returns a lightweight item document for item details pages.
 */
export async function getGameItemById(itemId: string): Promise<IOsrsboxItemWithMeta | null> {
    const numericId = Number(itemId);
    const id = Number.isNaN(numericId) ? itemId : numericId;

    return OsrsboxItemModel.findOne({ id })
        .select({
            id: 1,
            name: 1,
            icon: 1,
            examine: 1,
            members: 1,
            highPrice: 1,
            highTime: 1,
            lowPrice: 1,
            lowTime: 1,
            highalch: 1,
            lowalch: 1,
            cost: 1,
            buy_limit: 1,
            wiki_name: 1,
            wiki_url: 1,
            wiki_page_title: 1,
        })
        .lean<IOsrsboxItemWithMeta>()
        .exec();
}

/**
 * Grabs every GameItem from database. Top-level only; no ingredients.
 * @returns A list of GameItemDoc objects
 */
export async function getGameItems(ids?: string[]): Promise<GameItemDoc[]> {
    if (!ids || !ids.length) {
        // Only grab first 32 items for performance reasons
        return OsrsboxItemModel.find({}).limit(32).lean<GameItemDoc[]>().exec();
    }

    const normalizedIds = ids.map((rawId) => {
        const numericId = Number(rawId);
        return Number.isNaN(numericId) ? rawId : numericId;
    });

    return OsrsboxItemModel.find({ id: { $in: normalizedIds } })
        .lean<GameItemDoc[]>()
        .exec();
}

/**
 * Returns a paginated list of game items with optional filtering and sort order (defaults high price desc).
 */
export async function getPaginatedGameItems(params?: {
    page?: number;
    perPage?: number;
    filter?: GameItemFilter;
    sortOrder?: GameItemSortOrder;
    skillLevels?: PlayerSkillLevels | null;
    skill?: string | null;
    supplies?: PlayerSupplies | null;
    suppliesActive?: boolean;
    profitMode?: boolean;
    ironman?: boolean;
}): Promise<PaginatedGameItems> {
    const page = Math.max(1, params?.page ?? 1);
    const perPage = Math.max(1, Math.min(200, params?.perPage ?? 12));
    const skip = (page - 1) * perPage;
    const filter = normalizeFilter(params?.filter);
    const sortOrder = parseSortOrder(params?.sortOrder);
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const roiValueSort = sortOrder === 'roi-value-desc';
    const roiSort = sortOrder === 'roi-desc';
    // Both ROI sorts are driven by the same creation-cost pipeline.
    const profitDrivenSort = roiValueSort || roiSort;
    const profitMode = Boolean(params?.profitMode);
    const baseFilterQuery = getFilterQuery(filter);
    const skillQuery = getSkillMatchQuery(params?.skill);
    const ironman = Boolean(params?.ironman);
    const filterQuery = mergeQueries(baseFilterQuery, skillQuery, {
        placeholder: false,
        noted: false,
        stacked: null,
        ...getVisibilityQuery(ironman),
    });
    const skillLevels = normalizeSkillLevels(params?.skillLevels);
    const suppliesActive = Boolean(params?.suppliesActive);
    const supplies = normalizeSupplies(params?.supplies);
    const supplyMap = supplies ?? (suppliesActive ? {} : null);

    // Under Ironman an item's value can come from alchemy rather than the market, so `highalch` joins
    // the sort keys. Every key here is a stored field, so this stays an index-eligible sort rather
    // than a computed one — the profit pipeline is already the expensive path and must not grow.
    // Annotated rather than inferred: a bare object literal widens its values to `number`, which
    // Mongoose's `sort()` rejects because it wants the `SortOrder` literals.
    const valueSortKeys: Record<string, 1 | -1> = ironman
        ? { highPrice: sortDirection, highalch: sortDirection, cost: sortDirection, name: 1 }
        : { highPrice: sortDirection, cost: sortDirection, name: 1 };

    if (!skillLevels && !profitDrivenSort && !profitMode && !suppliesActive && !supplies) {
        const [items, total] = await Promise.all([
            OsrsboxItemModel.find(filterQuery)
                .sort(valueSortKeys)
                .skip(skip)
                .limit(perPage)
                .lean<GameItemDoc[]>()
                .exec(),
            OsrsboxItemModel.countDocuments(filterQuery).exec(),
        ]);

        return { items, total, page, perPage };
    }

    const suppliesFilterActive = suppliesActive || Boolean(supplyMap);
    const shouldComputeProfit = profitDrivenSort || profitMode;
    const enforceSupplies = profitDrivenSort && suppliesFilterActive;
    // Enforcing supplies keeps only items the bank already covers in full, so their creation
    // cost — and with it their ROI — is zero for every survivor. Filtering on ROI as well would
    // leave nothing at all, so skip it there and let the sort fall through to profit instead.
    const filterMissingRoi = roiSort && !enforceSupplies;
    const natureRunePrice = ironman && shouldComputeProfit ? await getNatureRunePrice() : NATURE_RUNE_FALLBACK_PRICE;
    const profitStages = shouldComputeProfit
        ? buildProfitPipeline(supplyMap, profitDrivenSort, enforceSupplies, filterMissingRoi, ironman, natureRunePrice)
        : [];
    const supplyStages = !profitDrivenSort && suppliesFilterActive ? buildSuppliesFilterPipeline(supplyMap) : [];
    // Profit only needs to be computed for every candidate when it drives the sort order;
    // otherwise it can wait until after pagination and run for just the returned page.
    const profitStagesBeforeSort = profitDrivenSort ? profitStages : [];
    const profitStagesAfterPagination = profitDrivenSort ? [] : profitStages;
    const sortStage = roiSort
        ? { creationRoi: sortDirection, creationProfit: -1, highPrice: -1, cost: -1, name: 1 }
        : roiValueSort
          ? { creationProfit: sortDirection, creationRoi: -1, highPrice: -1, cost: -1, name: 1 }
          : valueSortKeys;

    const [{ items, total = 0 } = { items: [], total: 0 }] = await OsrsboxItemModel.aggregate<{
        items: GameItemDoc[];
        total: number;
    }>([
        { $match: filterQuery },
        ...(skillLevels ? [{ $match: { $expr: buildPlayerSkillMatchExpression(skillLevels) } }] : []),
        // Drop heavy fields the browse page never renders before docs hit the blocking $sort.
        { $unset: ['equipment', 'weapon'] },
        ...supplyStages,
        ...profitStagesBeforeSort,
        { $sort: sortStage },
        {
            $facet: {
                items: [{ $skip: skip }, { $limit: perPage }, ...profitStagesAfterPagination],
                totalDocs: [{ $count: 'count' }],
            },
        },
        {
            $project: {
                items: 1,
                total: { $ifNull: [{ $first: '$totalDocs.count' }, 0] },
            },
        },
    ]).allowDiskUse(true);

    return { items, total, page, perPage };
}

/**
 * Performs a simple text search across name and examine fields.
 */
export async function searchGameItems(
    query: string,
    limit: number = 10,
    ironman: boolean = false,
): Promise<GameItemDoc[]> {
    const sanitizedQuery = query.trim();
    if (!sanitizedQuery) return [];

    const safeQuery = escapeRegex(sanitizedQuery);
    const startsWithRegex = new RegExp(`^${safeQuery}`, 'i');
    const containsRegex = new RegExp(safeQuery, 'i');
    const limitCap = Math.min(Math.max(limit, 1), 150);
    const results: GameItemDoc[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const baseFilter = {
        placeholder: false,
        noted: false,
        stacked: null,
        ...getVisibilityQuery(ironman),
    };

    async function fetchAndAppend(filter: Record<string, unknown>) {
        if (results.length >= limitCap) return;
        const docs = await OsrsboxItemModel.find({ ...baseFilter, ...filter })
            .sort({ name: 1 })
            .limit(limitCap * 3)
            .lean<GameItemDoc[]>()
            .exec();

        const alphabetized = docs.sort((a, b) =>
            (a.name ?? '').localeCompare(b.name ?? '', 'en', { sensitivity: 'base' }),
        );

        for (const doc of alphabetized) {
            const key = doc.id?.toString() ?? (doc as unknown as { _id?: Types.ObjectId })._id?.toString();
            const nameKey = (doc.name ?? '').trim().toLowerCase();

            if (!key || seenIds.has(key) || (nameKey && seenNames.has(nameKey))) continue;

            seenIds.add(key);
            if (nameKey) seenNames.add(nameKey);
            results.push(doc);
            if (results.length >= limitCap) break;
        }
    }

    // Priority: name starts with query > name contains query > description contains query
    await fetchAndAppend({ name: startsWithRegex });
    await fetchAndAppend({ name: containsRegex });
    await fetchAndAppend({ examine: containsRegex });

    return results;
}

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves an arbitrary sort-order string (query param, persisted preference) to a supported
 * sort order, translating retired values and falling back to the default high-price sort.
 */
export function parseSortOrder(sortOrder?: string | null): GameItemSortOrder {
    if (!sortOrder) return 'desc';
    const resolved = LEGACY_SORT_ORDERS[sortOrder] ?? sortOrder;
    const allowed: GameItemSortOrder[] = ['asc', 'desc', 'roi-desc', 'roi-value-desc'];
    return allowed.includes(resolved as GameItemSortOrder) ? (resolved as GameItemSortOrder) : 'desc';
}

function normalizeFilter(filter?: GameItemFilter): GameItemFilter {
    const allowed: GameItemFilter[] = ['all', 'members', 'f2p', 'equipable', 'stackable', 'quest', 'nonquest'];
    if (!filter) return 'all';
    return allowed.includes(filter) ? filter : 'all';
}

/**
 * Restricts results to items the reader can actually put a number against.
 *
 * A Grand Exchange price is the only value a main has, so for them an item without one is a row of
 * dashes. An Ironman never had that price to begin with: alchemy values them instead, which is why
 * `highalch` counts here. Shop prices join this list once they are scraped.
 * @param ironman - Whether the reader is on an account that cannot use the Grand Exchange.
 * @returns A query fragment requiring at least one usable value.
 */
function getValidPriceQuery(ironman = false): Record<string, unknown> {
    const clauses: Record<string, unknown>[] = [{ highPrice: { $gt: 0 } }, { lowPrice: { $gt: 0 } }];
    if (ironman) clauses.push({ highalch: { $gt: 0 } });
    return { $or: clauses };
}

/**
 * The tradeability and price gate shared by browsing and search.
 *
 * Untradeable items are excluded for a main because nothing in the app can price them. For an
 * Ironman that exclusion hides a large share of what they actually make, so it is lifted and the
 * alchemy fallback above carries the value.
 * @param ironman - Whether the reader is on an account that cannot use the Grand Exchange.
 * @returns A query fragment gating which items are visible.
 */
export function getVisibilityQuery(ironman = false): Record<string, unknown> {
    return {
        ...(ironman ? {} : { tradeable_on_ge: true }),
        ...getValidPriceQuery(ironman),
    };
}

function getFilterQuery(filter: GameItemFilter): Record<string, unknown> {
    const base = { 'creationSpecs.0': { $exists: true } }; // Only items that have creation specs

    switch (filter) {
        case 'members':
            return { ...base, members: true };
        case 'f2p':
            return { ...base, members: false };
        case 'equipable':
            return { ...base, equipable_by_player: true };
        case 'stackable':
            return { ...base, stackable: true };
        case 'quest':
            return { ...base, quest_item: true };
        case 'nonquest':
            return { ...base, quest_item: false };
        default:
            return base;
    }
}

function normalizeSupplies(supplies?: PlayerSupplies | null): PlayerSupplies | null {
    if (!supplies || typeof supplies !== 'object') return null;

    const entries = Object.entries(supplies)
        .map(([id, quantity]) => [String(id), Math.floor(Number(quantity))] as const)
        .filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0);

    if (!entries.length) return null;
    return Object.fromEntries(entries);
}

export function buildProfitPipeline(
    supplies?: PlayerSupplies | null,
    filterMissingProfit: boolean = false,
    enforceSupplies: boolean = false,
    filterMissingRoi: boolean = false,
    ironman: boolean = false,
    natureRunePrice: number = NATURE_RUNE_FALLBACK_PRICE,
): Record<string, unknown>[] {
    const supplyMap = supplies ?? normalizeSupplies(supplies);
    const hasSupplies = enforceSupplies || Boolean(supplyMap);
    const primarySpecExpr = buildPrimarySpecExpression();
    const supplyQtyExpr = hasSupplies
        ? {
              $ifNull: [
                  {
                      $getField: {
                          field: { $toString: '$$matched.id' },
                          input: { $literal: supplyMap },
                      },
                  },
                  0,
              ],
          }
        : 0;
    const neededExpr = hasSupplies ? { $max: [0, { $subtract: ['$$amount', '$$supplyQty'] }] } : '$$amount';
    // `cost` is the item's base game value, not a market price. Using it for an
    // ingredient that has no GE market — an untradeable intermediate such as
    // "Oak seedling (w)", whose cost is 1 — invented a 1gp outlay and sent the
    // resulting ROI into five figures. Those ingredients are priced as *unknown*
    // instead, which nulls the whole creation's cost and keeps it out of the ROI sort
    // rather than letting it top the list on a fabricated number.
    //
    // Currency is the exception, and not a small one: coins are flagged untradeable, a
    // third of all recipes charge a coin fee, and 5 coins really does cost 5gp. Mirrors
    // `resolveIngredientUnitPrice`, which prices the same rows on the item page.
    const costIsPriceExpr = {
        $or: [{ $eq: ['$$matched.tradeable_on_ge', true] }, { $in: ['$$matched.name', currencyItemNames] }],
    };
    const geUnitPriceExpr = {
        $ifNull: [
            '$$matched.highPrice',
            {
                $ifNull: ['$$matched.lowPrice', { $cond: [costIsPriceExpr, '$$matched.cost', null] }],
            },
        ],
    };
    const geOutputPriceExpr = { $ifNull: ['$highPrice', { $ifNull: ['$lowPrice', '$cost'] }] };

    /**
     * What an item is worth to an account that cannot trade, as an aggregation expression.
     *
     * Mirrors `resolveIronmanUnitValue` so the browse list, the item page and the cost table all
     * agree. Alchemy net of the nature rune is the value; currency keeps its `cost` because coins
     * are money; anything the app cannot value stays null so it drops out of the ROI sort rather
     * than ranking on an invented number.
     */
    const ironmanValueExpr = (alchField: string, nameField: string, costField: string) => ({
        $cond: [
            { $in: [nameField, currencyItemNames] },
            { $ifNull: [costField, null] },
            {
                $cond: [
                    { $gt: [{ $ifNull: [alchField, 0] }, 0] },
                    { $max: [0, { $subtract: [alchField, natureRunePrice] }] },
                    null,
                ],
            },
        ],
    });

    // Ironman mode swaps what both sides of the recipe are priced at, not just what is displayed.
    // Leaving these on Grand Exchange prices is what made the browse ranking identical in both
    // modes: the numbers on the cards changed, the order they came back in did not.
    const unitPriceExpr = ironman
        ? ironmanValueExpr('$$matched.highalch', '$$matched.name', '$$matched.cost')
        : geUnitPriceExpr;
    const outputPriceExpr = ironman ? ironmanValueExpr('$highalch', '$name', '$cost') : geOutputPriceExpr;
    const ingredientCostRowsExpr = {
        $map: {
            input: '$consumedIngredients',
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
                        amount: { $ifNull: ['$$ing.amount', 1] },
                    },
                    in: {
                        $let: {
                            vars: {
                                unitPrice: unitPriceExpr,
                                supplyQty: supplyQtyExpr,
                            },
                            in: {
                                itemId: '$$matched.id',
                                amount: '$$amount',
                                unitPrice: '$$unitPrice',
                                supplyQty: '$$supplyQty',
                                needed: neededExpr,
                                total: {
                                    $let: {
                                        vars: { needed: neededExpr },
                                        in: {
                                            $cond: [
                                                { $lte: ['$$needed', 0] },
                                                0,
                                                {
                                                    $cond: [
                                                        { $gt: ['$$unitPrice', 0] },
                                                        { $multiply: ['$$unitPrice', '$$needed'] },
                                                        null,
                                                    ],
                                                },
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
    };

    // An item that lists itself is not a recipe, it is broken data — a wiki variant panel
    // read as the item's own, or two OSRSBox documents for one in-game item. Costing it
    // produces a number, so nothing downstream would notice; this keeps it out of the
    // profit and ROI sorts the way an unknown price does.
    const selfReferentialExpr = {
        $in: ['$_id', { $ifNull: ['$consumedIngredientIds', []] }],
    };
    const costKnownExpr = {
        $and: [
            { $not: '$selfReferential' },
            {
                $allElementsTrue: {
                    $map: {
                        input: '$ingredientCostRows',
                        as: 'row',
                        in: { $ne: ['$$row.total', null] },
                    },
                },
            },
        ],
    };
    const suppliesSatisfiedExpr = hasSupplies
        ? {
              $eq: [
                  {
                      $size: {
                          $filter: {
                              input: '$ingredientCostRows',
                              as: 'row',
                              cond: { $gt: ['$$row.needed', 0] },
                          },
                      },
                  },
                  0,
              ],
          }
        : true;

    const pipeline: Record<string, unknown>[] = [
        { $set: { primarySpec: primarySpecExpr } },
        {
            $set: {
                consumedIngredients: {
                    $filter: {
                        input: { $ifNull: ['$primarySpec.ingredients', []] },
                        as: 'ing',
                        cond: { $ne: ['$$ing.consumedDuringCreation', false] },
                    },
                },
            },
        },
        {
            $set: {
                consumedIngredientIds: {
                    $map: { input: '$consumedIngredients', as: 'ing', in: '$$ing.item' },
                },
            },
        },
        {
            // localField/foreignField joins use the _id index; an $expr $in match cannot,
            // which made this lookup a full collection scan per candidate document.
            $lookup: {
                from: 'items',
                localField: 'consumedIngredientIds',
                foreignField: '_id',
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            id: 1,
                            name: 1,
                            highPrice: 1,
                            lowPrice: 1,
                            cost: 1,
                            highalch: 1,
                            tradeable_on_ge: 1,
                        },
                    },
                ],
                as: 'ingredientItems',
            },
        },
        { $set: { ingredientCostRows: ingredientCostRowsExpr, selfReferential: selfReferentialExpr } },
        { $set: { costKnown: costKnownExpr, outputPrice: outputPriceExpr } },
        {
            $set: {
                creationCost: {
                    $cond: ['$costKnown', { $sum: '$ingredientCostRows.total' }, null],
                },
            },
        },
        {
            $set: {
                creationProfit: {
                    $cond: [
                        {
                            $and: [
                                { $ne: ['$outputPrice', null] },
                                { $gt: ['$outputPrice', 0] },
                                { $ne: ['$creationCost', null] },
                            ],
                        },
                        { $subtract: ['$outputPrice', '$creationCost'] },
                        null,
                    ],
                },
            },
        },
        {
            // Return on investment as a ratio of profit to the gp that has to be fronted.
            // Mirrors the percentage the item card renders, so a zero-cost creation (every
            // ingredient already in the bank) has no meaningful ROI and stays null.
            $set: {
                creationRoi: {
                    $cond: [
                        {
                            $and: [{ $ne: ['$creationProfit', null] }, { $gt: ['$creationCost', 0] }],
                        },
                        { $divide: ['$creationProfit', '$creationCost'] },
                        null,
                    ],
                },
            },
        },
    ];

    if (filterMissingProfit) {
        pipeline.push({ $match: { creationProfit: { $ne: null } } });
    }

    if (filterMissingRoi) {
        pipeline.push({ $match: { creationRoi: { $ne: null } } });
    }

    if (enforceSupplies && hasSupplies) {
        pipeline.push({ $match: { $expr: suppliesSatisfiedExpr } });
    }

    if (ironman) {
        // The card's headline number. Kept as its own field rather than reusing `outputPrice`,
        // which is scratch state the $unset below clears.
        pipeline.push({ $set: { ironmanExitValue: '$outputPrice' } });
    }

    pipeline.push({
        $unset: [
            'primarySpec',
            'consumedIngredients',
            'consumedIngredientIds',
            'ingredientItems',
            'ingredientCostRows',
            'costKnown',
            'outputPrice',
        ],
    });

    return pipeline;
}

function buildSuppliesFilterPipeline(supplies?: PlayerSupplies | null): Record<string, unknown>[] {
    const supplyMap = supplies ?? normalizeSupplies(supplies) ?? {};

    const primarySpecExpr = buildPrimarySpecExpression();
    const supplyQtyExpr = {
        $ifNull: [
            {
                $getField: {
                    field: { $toString: { $ifNull: ['$$matched.id', ''] } },
                    input: { $literal: supplyMap },
                },
            },
            0,
        ],
    };

    const requiredSuppliesExpr = {
        $map: {
            input: '$requiredIngredients',
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
                        amount: { $ifNull: ['$$ing.amount', 1] },
                    },
                    in: {
                        $let: {
                            vars: { supplyQty: supplyQtyExpr },
                            in: {
                                supplyQty: '$$supplyQty',
                                amount: '$$amount',
                                sufficient: { $gte: ['$$supplyQty', '$$amount'] },
                            },
                        },
                    },
                },
            },
        },
    };

    return [
        { $set: { primarySpec: primarySpecExpr } },
        { $set: { requiredIngredients: { $ifNull: ['$primarySpec.ingredients', []] } } },
        { $match: { $expr: { $gt: [{ $size: '$requiredIngredients' }, 0] } } },
        {
            $set: {
                requiredIngredientIds: {
                    $map: { input: '$requiredIngredients', as: 'ing', in: '$$ing.item' },
                },
            },
        },
        {
            // localField/foreignField joins use the _id index; an $expr $in match cannot,
            // which made this lookup a full collection scan per candidate document.
            $lookup: {
                from: 'items',
                localField: 'requiredIngredientIds',
                foreignField: '_id',
                pipeline: [{ $project: { _id: 1, id: 1 } }],
                as: 'ingredientItems',
            },
        },
        { $set: { supplyRows: requiredSuppliesExpr } },
        {
            $set: {
                suppliesSatisfied: {
                    $allElementsTrue: {
                        $map: {
                            input: '$supplyRows',
                            as: 'row',
                            in: '$$row.sufficient',
                        },
                    },
                },
            },
        },
        { $match: { suppliesSatisfied: true } },
        {
            $unset: [
                'primarySpec',
                'requiredIngredients',
                'requiredIngredientIds',
                'ingredientItems',
                'supplyRows',
                'suppliesSatisfied',
            ],
        },
    ];
}

function buildPrimarySpecExpression() {
    return {
        $let: {
            vars: { specs: { $ifNull: ['$creationSpecs', []] } },
            in: {
                $let: {
                    vars: {
                        withIngredients: {
                            $filter: {
                                input: '$$specs',
                                as: 'spec',
                                cond: {
                                    $gt: [{ $size: { $ifNull: ['$$spec.ingredients', []] } }, 0],
                                },
                            },
                        },
                    },
                    in: { $ifNull: [{ $first: '$$withIngredients' }, { $first: '$$specs' }] },
                },
            },
        },
    };
}

function getSkillMatchQuery(skill?: string | null): Record<string, unknown> | null {
    const normalized = normalizeSkillFilter(skill);
    if (!normalized) return null;

    const skillRegex = new RegExp(`^${escapeRegex(normalized)}$`, 'i');

    return {
        creationSpecs: {
            $elemMatch: {
                $or: [{ 'requiredSkills.skillName': skillRegex }, { 'experienceGranted.skillName': skillRegex }],
            },
        },
    };
}

function mergeQueries(...queries: (Record<string, unknown> | null)[]): Record<string, unknown> {
    const valid = queries.filter(Boolean) as Record<string, unknown>[];
    if (!valid.length) return {};
    if (valid.length === 1) return valid[0];
    return { $and: valid };
}

/**
 * Normalizes incoming skill level data to a lowercase map of finite numbers.
 */
function normalizeSkillLevels(skillLevels?: PlayerSkillLevels | null): PlayerSkillLevels | null {
    if (!skillLevels || typeof skillLevels !== 'object') return null;

    const normalizedEntries = Object.entries(skillLevels).reduce<[string, number][]>((acc, [skill, level]) => {
        const numericLevel = Math.max(0, Math.floor(Number(level)));
        if (!Number.isFinite(numericLevel)) return acc;
        acc.push([skill.toLowerCase(), numericLevel]);
        return acc;
    }, []);

    if (!normalizedEntries.length) return null;
    return Object.fromEntries(normalizedEntries);
}

function normalizeSkillFilter(skill?: string | null): string | null {
    if (!skill) return null;
    const normalized = skill.trim().toLowerCase();
    return skillTreeSlugs.includes(normalized) ? normalized : null;
}

/**
 * Builds an expression that matches items where at least one creation spec's required skills are satisfied by the
 * provided player skill levels.
 */
function buildPlayerSkillMatchExpression(skillLevels: PlayerSkillLevels) {
    return {
        $gt: [
            {
                $size: {
                    $filter: {
                        input: { $ifNull: ['$creationSpecs', []] },
                        as: 'spec',
                        cond: {
                            $and: [
                                {
                                    // Require that the spec has either skill requirements, XP information, or tree requirements.
                                    $gt: [
                                        {
                                            $add: [
                                                { $size: { $ifNull: ['$$spec.requiredSkills', []] } },
                                                { $size: { $ifNull: ['$$spec.experienceGranted', []] } },
                                                {
                                                    $size: {
                                                        $objectToArray: { $ifNull: ['$$spec.treeMinSkills', {}] },
                                                    },
                                                },
                                            ],
                                        },
                                        0,
                                    ],
                                },
                                {
                                    // Prefer treeMinSkills if available; otherwise fall back to direct requiredSkills.
                                    $let: {
                                        vars: {
                                            treeEntries: {
                                                $objectToArray: { $ifNull: ['$$spec.treeMinSkills', {}] },
                                            },
                                        },
                                        in: {
                                            $cond: [
                                                { $gt: [{ $size: '$$treeEntries' }, 0] },
                                                {
                                                    $eq: [
                                                        {
                                                            $size: {
                                                                $filter: {
                                                                    input: '$$treeEntries',
                                                                    as: 'req',
                                                                    cond: {
                                                                        $gt: [
                                                                            '$$req.v',
                                                                            {
                                                                                $ifNull: [
                                                                                    {
                                                                                        $getField: {
                                                                                            field: {
                                                                                                $toLower: '$$req.k',
                                                                                            },
                                                                                            input: {
                                                                                                $literal: skillLevels,
                                                                                            },
                                                                                        },
                                                                                    },
                                                                                    0,
                                                                                ],
                                                                            },
                                                                        ],
                                                                    },
                                                                },
                                                            },
                                                        },
                                                        0,
                                                    ],
                                                },
                                                {
                                                    $eq: [
                                                        {
                                                            $size: {
                                                                $filter: {
                                                                    input: { $ifNull: ['$$spec.requiredSkills', []] },
                                                                    as: 'req',
                                                                    cond: {
                                                                        $gt: [
                                                                            { $ifNull: ['$$req.skillLevel', 0] },
                                                                            {
                                                                                $ifNull: [
                                                                                    {
                                                                                        $getField: {
                                                                                            field: {
                                                                                                $toLower: {
                                                                                                    $ifNull: [
                                                                                                        '$$req.skillName',
                                                                                                        '',
                                                                                                    ],
                                                                                                },
                                                                                            },
                                                                                            input: {
                                                                                                $literal: skillLevels,
                                                                                            },
                                                                                        },
                                                                                    },
                                                                                    0,
                                                                                ],
                                                                            },
                                                                        ],
                                                                    },
                                                                },
                                                            },
                                                        },
                                                        0,
                                                    ],
                                                },
                                            ],
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            },
            0,
        ],
    };
}
