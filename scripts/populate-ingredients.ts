import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { OsrsboxItemModel, type OsrsboxItemDocument } from '../src/lib/models/mongo-schemas/osrsbox-db-item-schema';
import {
    getCreationMethodsForItem,
    type CreationMethod as WikiCreationMethod,
    type CreationRequirement as WikiRequirement,
} from './osrs-wiki-creation';
import logUpdate from 'log-update';
import type {
    GameItemCreationSpecs,
    GameItemCreationExperienceGranted,
    GameItemCreationIngredient,
    SkillLevelDesignation,
} from '../src/lib/models/osrsbox-db-item';
import { deriveWikiPageIdentity, wikiTitleCandidates } from '../src/lib/helpers/wiki-page-title';
import { selectMethodsForVersion } from '../src/lib/helpers/wiki-creation-variants';
import { pickPreferredItem } from '../src/lib/helpers/item-preference';

/**
 * ====================================================================================================================
 * Variable setup.
 * ====================================================================================================================
 */

const user = process.env.VITE_MONGO_USERNAME;
const pw = process.env.VITE_MONGO_PASSWORD;
const cluster = process.env.VITE_MONGO_DB_CLUSTER_NAME;
const host = process.env.VITE_MONGO_DB_HOST;
const dbName = process.env.VITE_MONGO_DB_DB_NAME || 'osrsbox';
const prepend = 'mongodb+srv';
const append = '?retryWrites=true&w=majority';
const connectionString = `${prepend}://${user}:${pw}@${cluster}.${host}/${dbName}${append}`;
const BATCH_FETCH_LIMIT = 250;
let lastProcessedIdForResume: string | null = null;
const progressState = {
    processed: 0,
    total: 0,
    active: false,
    startedAt: null as number | null,
    processedOffset: 0,
    recentRequests: [] as number[],
};
let itemIdLookupMap: Map<string, mongoose.Types.ObjectId> | null = null;
const wikiPageVersionCache = new Map<string, string[]>();
let isShuttingDown = false;
const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

function recordAtlasRequest(timestamp: number = Date.now()) {
    progressState.recentRequests.push(timestamp);
    const cutoff = timestamp - 60_000;
    progressState.recentRequests = progressState.recentRequests.filter((ts) => ts >= cutoff);
}

function logWithProgress(method: 'log' | 'warn' | 'error', message?: unknown, ...args: unknown[]) {
    if (progressState.active) logUpdate.clear();
    originalConsole[method](message, ...args);
    if (progressState.active) renderProgressLine(progressState.processed, progressState.total);
}

console.log = (...args: unknown[]) => logWithProgress('log', ...args);
console.warn = (...args: unknown[]) => logWithProgress('warn', ...args);
console.error = (...args: unknown[]) => logWithProgress('error', ...args);

async function performCleanup(params?: { reason?: string; exitCode?: number; exitAfter?: boolean }) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    const { reason, exitCode = 0, exitAfter = true } = params ?? {};

    if (reason) logWithProgress('log', `[creation-importer] Shutting down (${reason})...`);

    try {
        writeErrorReport();
    } catch (reportErr) {
        logWithProgress('error', '🚨 [creation-importer] Failed to write error report:', reportErr);
    }

    try {
        await mongoose.disconnect();
    } catch (disconnectErr) {
        logWithProgress('error', '🚨 [creation-importer] Error disconnecting from MongoDB:', disconnectErr);
    }

    logUpdate.done();
    progressState.active = false;

    if (exitAfter) process.exit(exitCode);
}

process.once('SIGINT', () => {
    void performCleanup({ reason: 'SIGINT', exitCode: 0 });
});

function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function renderProgressLine(processed: number, total: number) {
    progressState.processed = processed;
    progressState.total = total;
    progressState.active = total > 0;
    if (!progressState.startedAt && total > 0) {
        progressState.startedAt = Date.now();
    }

    if (!total) {
        logUpdate('ℹ️ [creation-importer] Progress: no items to process.');
        return;
    }

    const percentage = Math.min(100, (processed / total) * 100);
    const barLength = 30;
    const filledLength = Math.min(barLength, Math.round((processed / total) * barLength));
    const bar = `${'█'.repeat(filledLength)}${'░'.repeat(barLength - filledLength)}`;
    const percentText = percentage.toFixed(2).padStart(6, ' ');
    const lastHint = lastProcessedIdForResume ? ` | last _id=${lastProcessedIdForResume}` : '';

    const elapsedMs = progressState.startedAt ? Date.now() - progressState.startedAt : 0;
    const processedSinceStart = Math.max(0, processed - progressState.processedOffset);
    const avgMsPerItem = processedSinceStart > 0 ? elapsedMs / processedSinceStart : 0;
    const remaining = Math.max(0, total - processed);
    const etaMs = processed > 0 ? avgMsPerItem * remaining : 0;
    const etaText = processed > 0 ? ` | ETA ~${formatDuration(etaMs)}` : '';
    const now = Date.now();
    progressState.recentRequests = progressState.recentRequests.filter((ts) => now - ts <= 60_000);
    const rpm = progressState.recentRequests.length;
    const rpmText = ` | ~${rpm} req/min (limited to 500 by Atlas free tier)`;

    logUpdate(
        `⏳ [creation-importer] Progress ${processed}/${total} ${bar} ${percentText}%${etaText}${rpmText}${lastHint}`,
    );
}

/**
 * ====================================================================================================================
 * Error tracking
 * ====================================================================================================================
 */

const ownerNotFoundErrors: string[] = [];
const noWikiMethodsErrors: string[] = [];
const creationSpecsEmptyErrors: string[] = [];
const unresolvedIngredientErrors: string[] = [];

function logOwnerNotFound(identifier: string) {
    ownerNotFoundErrors.push(`identifier="${identifier}"`);
}

function logNoWikiMethods(owner: OsrsboxItemDocument, identifier: string, normalizedTitle: string) {
    noWikiMethodsErrors.push(
        `_id=${owner._id.toString()} | name="${owner.name}" | wiki_name="${owner.wiki_name}" | identifier="${identifier}" | normalizedTitle="${normalizedTitle}"`,
    );
}

function logCreationSpecsEmpty(owner: OsrsboxItemDocument, identifier: string) {
    creationSpecsEmptyErrors.push(
        `_id=${owner._id.toString()} | name="${owner.name}" | wiki_name="${owner.wiki_name}" | identifier="${identifier}"`,
    );
}

function logUnresolvedIngredient(owner: OsrsboxItemDocument, ingredientName: string) {
    unresolvedIngredientErrors.push(
        `_id=${owner._id.toString()} | name="${owner.name}" | ingredient="${ingredientName}"`,
    );
}

/**
 * Write all collected errors to a log file in the same directory as this script.
 */
function writeErrorReport() {
    const errorLogPath = path.join(__dirname, 'creation-import-errors-2.log');
    const lines: string[] = [];
    const timestamp = new Date().toISOString();

    lines.push('# Creation import unresolved ingredient report');
    lines.push(`# Generated at ${timestamp}`);
    lines.push('');

    if (!unresolvedIngredientErrors.length) {
        lines.push('No unresolved ingredient names recorded.');
    } else {
        lines.push('## Unresolved ingredient names (could not map to OsrsboxItem):');
        for (const e of unresolvedIngredientErrors) lines.push(`- ${e}`);
        lines.push('');
    }

    fs.writeFileSync(errorLogPath, lines.join('\n'), 'utf8');
    logWithProgress('log', `[creation-importer] Error report written to ${errorLogPath}`);
}

/**
 * ====================================================================================================================
 * Utility functions and types.
 * ====================================================================================================================
 */

function normalizeTitleForLookup(title: string): string {
    let normalized = title.trim();

    // Strip dose-style suffixes: "Prayer potion(4)" -> "Prayer potion"
    const doseMatch = normalized.match(/^(.*?)(\(\d+\))$/);
    if (doseMatch) {
        normalized = doseMatch[1].trim();
    }

    // Strip "(Unpoisoned)" suffixes that don't exist as real wiki pages.
    const unpoisonedMatch = normalized.match(/^(.*)\s+\(unpoisoned\)$/i);
    if (unpoisonedMatch) {
        normalized = unpoisonedMatch[1].trim();
    }

    return normalized;
}

/**
 * Ordered wiki page titles to try for an item, most reliable first.
 *
 * `wikiTitleCandidates` supplies the derived page title, the in-game name and the raw
 * `wiki_name`; each is also offered in its dose-stripped form, and the CLI identifier
 * is kept as a last resort when it isn't just an ObjectId.
 * @param owner - The item whose creation page is being scraped.
 * @param identifier - The identifier the importer was invoked with.
 * @returns Deduplicated candidate page titles.
 */
function buildWikiLookupTitles(owner: OsrsboxItemDocument, identifier: string): string[] {
    const raw = wikiTitleCandidates(owner);
    if (identifier && !looksLikeObjectId(identifier)) raw.push(identifier);

    const seen = new Set<string>();
    const titles: string[] = [];

    for (const candidate of raw) {
        for (const title of [candidate, normalizeTitleForLookup(candidate)]) {
            const trimmed = title.trim();
            if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
            seen.add(trimmed.toLowerCase());
            titles.push(trimmed);
        }
    }

    return titles;
}

/**
 * The infobox versions of every item that shares a wiki page, cached per page title.
 *
 * `selectMethodsForVersion` needs these to tell "this panel belongs to another variant"
 * apart from "this panel is labelled by something that isn't a variant at all". There
 * are only ~540 versioned pages behind ~8,400 items, so the cache keeps this to one
 * `distinct` per page for a whole batch run.
 * @param pageTitle - The derived wiki page title shared by the variants.
 * @returns Every non-null `wiki_version` recorded against that page.
 */
async function getVersionsForWikiPage(pageTitle: string | null | undefined): Promise<string[]> {
    if (!pageTitle) return [];

    const cached = wikiPageVersionCache.get(pageTitle);
    if (cached) return cached;

    recordAtlasRequest();
    const versions = (await OsrsboxItemModel.distinct('wiki_version', {
        wiki_page_title: pageTitle,
        wiki_version: { $ne: null },
    })) as string[];

    wikiPageVersionCache.set(pageTitle, versions);
    return versions;
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shouldIgnoreIngredientName(name: string): boolean {
    return name.trim().toLowerCase() === 'string jewellery';
}

function buildIngredientLookupCandidates(rawName: string): { candidates: string[]; ignore: boolean } {
    const trimmed = rawName.trim();
    const lower = trimmed.toLowerCase();
    const candidates: string[] = [];

    // Default ambiguous "Axe" to a bronze axe but keep the raw name as a fallback.
    if (lower === 'axe') {
        candidates.push('Bronze axe');
    }

    // Pendant of Ates (inert) should map to Pendant of ates
    if (lower.startsWith('pendant of ates')) {
        candidates.push('Pendant of ates');
    }

    // "___ tribal mask" -> "Tribal mask (___)"
    const tribalMatch = trimmed.match(/^(.*)\s+tribal mask$/i);
    if (tribalMatch) {
        const descriptor = tribalMatch[1]?.trim();
        if (descriptor) {
            const displayDescriptor = descriptor.charAt(0).toUpperCase() + descriptor.slice(1);
            candidates.push(`Tribal mask (${descriptor})`);
            candidates.push(`Tribal mask (${displayDescriptor})`);
        }
    }

    candidates.push(trimmed);

    // Some wiki ingredient strings include explanatory parentheses that aren't part of the in-game name.
    if (lower.startsWith('herb tea mix')) {
        candidates.push('Herb tea mix');
    }

    const parentheticalMatch = trimmed.match(/^(.*)\s+\([^)]+\)$/);
    if (parentheticalMatch) {
        const base = parentheticalMatch[1]?.trim();
        if (base) candidates.push(base);
    }

    const deduped: string[] = [];
    for (const c of candidates) {
        if (!deduped.includes(c)) deduped.push(c);
    }

    return {
        candidates: deduped,
        ignore: shouldIgnoreIngredientName(trimmed),
    };
}

function isCursorNotFoundError(err: unknown): boolean {
    return Boolean(
        err &&
        typeof err === 'object' &&
        'code' in err &&
        // Mongo cursor-not-found error code
        (err as { code?: unknown }).code === 43,
    );
}

function normalizeLookupKey(value: string): string {
    return value.trim().toLowerCase();
}

async function buildItemIdLookupMap(): Promise<Map<string, mongoose.Types.ObjectId>> {
    type LookupDoc = {
        _id: mongoose.Types.ObjectId;
        id?: number;
        name?: string;
        wiki_name?: string;
        duplicate?: boolean;
        placeholder?: boolean;
        noted?: boolean;
        tradeable_on_ge?: boolean;
    };

    const docs = await OsrsboxItemModel.find(
        {},
        { _id: 1, id: 1, name: 1, wiki_name: 1, duplicate: 1, placeholder: 1, noted: 1, tradeable_on_ge: 1 },
    )
        .sort({ _id: 1 })
        .lean<LookupDoc[]>()
        .exec();
    recordAtlasRequest();

    // Thousands of names are shared by several documents — "Acorn" covers four duplicate
    // ids, the real tradeable item and a bank placeholder. Keeping whichever arrived
    // first handed ingredients an unpriced duplicate, so rank the candidates instead.
    const best = new Map<string, LookupDoc>();

    const consider = (key: string, doc: LookupDoc) => {
        const current = best.get(key);
        const winner = current ? pickPreferredItem([current, doc]) : doc;
        if (winner) best.set(key, winner);
    };

    for (const doc of docs) {
        if (doc.name) consider(normalizeLookupKey(doc.name), doc);
        if (doc.wiki_name) consider(normalizeLookupKey(doc.wiki_name), doc);
    }

    const map = new Map<string, mongoose.Types.ObjectId>();
    for (const [key, doc] of best) map.set(key, doc._id);

    return map;
}

type ImportOptions = {
    /**
     * When true, items that already have creationSpecs will be skipped.
     * Default is false so existing records get refreshed with the latest data.
     */
    skipExisting?: boolean;
    /**
     * Resume after the given Mongo ObjectId (string). Any items before or matching this id will be skipped.
     */
    resumeFromId?: string;
    /**
     * Only process items whose name or wiki_name contains this string (case-insensitive).
     */
    nameContains?: string;
    /**
     * Only process items that carry an infobox version label (`wiki_version`).
     *
     * These are the items whose wiki lookups used to fail, because OSRSBox's `wiki_name`
     * is synthetic for them. Everything else was already reachable under its own name, so
     * a re-scrape of those items re-fetches pages that were read successfully before and
     * found to have no creation method. Narrowing to versioned items turns a full pass
     * over ~22,000 items into ~7,700.
     */
    versionedOnly?: boolean;
    /**
     * Scrape and map exactly as usual, but report what would be written instead of writing.
     *
     * This step overwrites `creationSpecs` wholesale, so a run against a populated database
     * is worth previewing: the log then shows the before/after spec count per item without
     * touching a document.
     */
    dryRun?: boolean;
};

/**
 * Find an OsrsboxItem by wiki_name or name, with some lenient matching.
 */
async function findItemByDisplayName(name: string): Promise<OsrsboxItemDocument | null> {
    const trimmed = name.trim();

    // Each tier may match several documents sharing the name, so gather them all and let
    // the ranking decide. `findOne` used to return whichever the database stored first,
    // which for a name like "Acorn" is an unpriced duplicate rather than the real item.
    const tiers: mongoose.FilterQuery<OsrsboxItemDocument>[] = [
        { wiki_name: trimmed },
        { name: trimmed },
        { wiki_name: { $regex: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') } },
        { name: { $regex: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') } },
    ];

    for (const filter of tiers) {
        const docs = await OsrsboxItemModel.find(filter).exec();
        if (docs.length) return pickPreferredItem(docs);
    }

    return null;
}

/**
 * Resolve an item name from the wiki parser to an OsrsboxItemDocument._id,
 * with a small cache to avoid repeated lookups.
 */
async function resolveItemIdForName(
    name: string,
    owner: OsrsboxItemDocument,
    cache: Map<string, mongoose.Types.ObjectId>,
): Promise<{ itemId: mongoose.Types.ObjectId | null; ignored: boolean }> {
    const { candidates, ignore } = buildIngredientLookupCandidates(name);
    const rawKey = name.trim();

    if (ignore) {
        return { itemId: null, ignored: true };
    }

    const ownerNames = [owner.name?.toLowerCase(), owner.wiki_name?.toLowerCase()].filter(Boolean) as string[];

    for (const candidate of candidates) {
        const candidateKey = candidate.trim();
        const cached = cache.get(candidateKey);
        if (cached) return { itemId: cached, ignored: false };

        if (ownerNames.includes(candidateKey.toLowerCase())) {
            cache.set(candidateKey, owner._id);
            cache.set(rawKey, owner._id);
            return { itemId: owner._id, ignored: false };
        }

        if (itemIdLookupMap) {
            const found = itemIdLookupMap.get(normalizeLookupKey(candidateKey));
            if (found) {
                cache.set(candidateKey, found);
                cache.set(rawKey, found);
                return { itemId: found, ignored: false };
            }
        } else {
            const doc = await findItemByDisplayName(candidateKey);
            if (doc) {
                cache.set(candidateKey, doc._id);
                cache.set(rawKey, doc._id);
                return { itemId: doc._id, ignored: false };
            }
        }
    }

    logWithProgress(
        'warn',
        `🚨 [creation-importer] Could not resolve item name -> document: "${name}" (tried: ${candidates.join(' | ')})`,
    );
    logUnresolvedIngredient(owner, name);
    return { itemId: null, ignored: false };
}

// ----- mapping wiki -> DB shapes -----

/**
 * Extract required skills / experience from wiki requirements, ignoring
 * non-skill rows such as Members/Ticks/Tools/Facilities.
 */
function extractSkillRequirements(wikiReqs: WikiRequirement[]): {
    requiredSkills: SkillLevelDesignation[];
    experienceGranted: GameItemCreationExperienceGranted[];
} {
    const requiredSkills: SkillLevelDesignation[] = [];
    const experienceGranted: GameItemCreationExperienceGranted[] = [];

    for (const r of wikiReqs) {
        // Only care about rows that actually have a skill name
        if (!r.skill) continue;

        if (typeof r.level === 'number') {
            requiredSkills.push({
                skillName: r.skill,
                skillLevel: r.level,
            });
        }

        // xp property isn’t in the WikiRequirement type, but we added it to our parser
        const xp = (r as { xp?: number }).xp;
        if (typeof xp === 'number') {
            experienceGranted.push({
                skillName: r.skill,
                experienceAmount: xp,
            });
        }
    }

    return { requiredSkills, experienceGranted };
}

/** A mapped method, plus why it should be discarded. */
type MappedCreationMethod = {
    specs: GameItemCreationSpecs;
    /**
     * The method consumes the owner, so it makes something else.
     *
     * A page with one unlabelled recipe hands that recipe to every variant on it.
     * `Torva full helm` documents only the restoration — damaged helm + Bandosian
     * components — so the *damaged* helm was given a recipe that in fact destroys it, and
     * with the self-reference dropped that read as "9M of components produce a 223M item".
     * Nothing in OSRS is built from itself, so a method that takes the owner as input
     * belongs to a sibling variant and is discarded whole rather than trimmed.
     */
    consumesOwner: boolean;
};

async function mapWikiMethodToCreationSpecs(
    wikiMethod: WikiCreationMethod,
    owner: OsrsboxItemDocument,
    cache: Map<string, mongoose.Types.ObjectId>,
): Promise<MappedCreationMethod> {
    const { requiredSkills, experienceGranted } = extractSkillRequirements(wikiMethod.requirements);

    const ingredients: GameItemCreationIngredient[] = [];
    let consumesOwner = false;

    // 1) Normal materials (consumed = true/false based on wiki data)
    for (const m of wikiMethod.materials) {
        const { itemId, ignored } = await resolveItemIdForName(m.item.name, owner, cache);
        if (ignored || !itemId) continue;

        if (itemId.equals(owner._id)) {
            consumesOwner = true;
            continue;
        }

        ingredients.push({
            consumedDuringCreation: m.consumed,
            amount: m.quantity,
            item: itemId,
        });
    }

    // 2) Tools from requirements (consumed = false)
    for (const r of wikiMethod.requirements) {
        const desc = (r.description ?? '').trim();
        if (!desc) continue;

        // Look for rows like "Tools: Hammer" or "Tools: Saw, Hammer"
        if (!desc.toLowerCase().startsWith('tools')) continue;

        const afterColon = desc.split(':', 2)[1] ?? '';
        const toolNames = afterColon
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean);

        for (const toolName of toolNames) {
            const { itemId, ignored } = await resolveItemIdForName(toolName, owner, cache);
            if (ignored || !itemId) continue;
            if (itemId.equals(owner._id)) continue;

            ingredients.push({
                consumedDuringCreation: false,
                amount: 1,
                item: itemId,
            });
        }
    }

    return {
        specs: { requiredSkills, experienceGranted, ingredients },
        consumesOwner,
    };
}

// ----- public API -----

function looksLikeObjectId(value: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(value);
}

/**
 * Import creation methods for a single item, given a CLI identifier.
 * The identifier can be:
 *   - a MongoDB ObjectId string, or
 *   - the exact in-game / wiki item name.
 *
 * Flow:
 *   - resolve the owning OsrsboxItem from Mongo
 *   - call the wiki scraper (with normalized title + fallbacks)
 *   - map results into creationSpecs
 *   - save them on the item doc
 */
export async function importCreationForItemTitle(identifier: string, options: ImportOptions = {}): Promise<void> {
    let owner: OsrsboxItemDocument | null = null;

    // 1) If it looks like an ObjectId, try that first
    if (looksLikeObjectId(identifier)) {
        owner = await OsrsboxItemModel.findById(identifier).exec();
    }

    // 2) If not found by id (or not an id), try exact matches on name/wiki_name
    if (!owner) {
        owner =
            (await OsrsboxItemModel.findOne({ name: identifier }).exec()) ||
            (await OsrsboxItemModel.findOne({ wiki_name: identifier }).exec());
    }

    // 3) As a last resort, use the lenient finder (case-insensitive, etc.)
    if (!owner) {
        owner = await findItemByDisplayName(identifier);
    }

    if (!owner) {
        logWithProgress('warn', `[creation-importer] No OsrsboxItem found for identifier "${identifier}"`);
        logOwnerNotFound(identifier);
        return;
    }

    if (options.skipExisting && owner.creationSpecs?.length) {
        logWithProgress(
            'log',
            `[creation-importer] Skipping "${identifier}" because creation specs already exist (use without --skip-existing to refresh).`,
        );
        return;
    }

    // Decide what titles to try on the wiki. The derived page title comes first:
    // OSRSBox's wiki_name is synthetic for versioned items ("Oak seedling (Watered)")
    // and 404s, so trusting it here used to leave ~8,300 items without creationSpecs.
    const lookupTitles = buildWikiLookupTitles(owner, identifier);
    const baseTitle = lookupTitles[0] ?? owner.name;

    let wikiMethods: WikiCreationMethod[] = [];
    let resolvedTitle = baseTitle;

    for (const title of lookupTitles) {
        wikiMethods = await getCreationMethodsForItem(title);
        if (wikiMethods.length) {
            resolvedTitle = title;
            break;
        }
    }

    if (!wikiMethods.length) {
        logWithProgress(
            'warn',
            `⚠️ [creation-importer] No creation methods from wiki for "${baseTitle}" (tried: ${lookupTitles.join(' | ')}, identifier="${identifier}")`,
        );
        logNoWikiMethods(owner, identifier, baseTitle);
        return;
    }

    if (resolvedTitle !== baseTitle) {
        logWithProgress('log', `[creation-importer] Resolved "${baseTitle}" via fallback title "${resolvedTitle}"`);
    }

    // A versioned item's URL anchors it at one panel of a shared page, but the wiki API
    // only serves whole sections, so `wikiMethods` holds every variant's recipe. Storing
    // all of them hands the item a primary spec belonging to whichever variant the wiki
    // lists first. Only narrow when the page actually came from this item's own
    // `wiki_url` — a fallback title is a different page, and its panel labels say
    // nothing about this item's version.
    const derivedPageTitle = deriveWikiPageIdentity(owner).wikiPageTitle;
    const scrapedOwnPage = !!derivedPageTitle && resolvedTitle.toLowerCase() === derivedPageTitle.toLowerCase();
    // Sibling lookup is a collection scan, so it is only worth paying for an item that has
    // a version to compare them against.
    const variantMethods =
        scrapedOwnPage && owner.wiki_version
            ? selectMethodsForVersion(wikiMethods, owner.wiki_version, await getVersionsForWikiPage(derivedPageTitle))
            : wikiMethods;

    if (variantMethods.length !== wikiMethods.length) {
        logWithProgress(
            'log',
            `[creation-importer] Narrowed "${resolvedTitle}" from ${wikiMethods.length} to ${variantMethods.length} method(s) for version "${owner.wiki_version}".`,
        );
    }

    // Every method on the page belongs to a named sibling, so this variant is not made
    // here at all — the plain "Abyssal dagger" is a drop, and the page only documents
    // poisoning. Any specs it is carrying came from a sibling and have to go, otherwise
    // the item keeps costing itself at a poison vial.
    if (!variantMethods.length) {
        await clearCreationSpecsForOtherVariant(owner, resolvedTitle, options);
        return;
    }

    const cache = new Map<string, mongoose.Types.ObjectId>();
    const creationSpecs: GameItemCreationSpecs[] = [];
    let discardedConsumingOwner = 0;

    for (const m of variantMethods) {
        const { specs, consumesOwner } = await mapWikiMethodToCreationSpecs(m, owner, cache);

        if (consumesOwner) {
            discardedConsumingOwner += 1;
            logWithProgress(
                'log',
                `[creation-importer] Dropping a method for "${owner.name}" that consumes it (methodName="${m.methodName}"); it belongs to another variant of "${resolvedTitle}".`,
            );
            continue;
        }

        // If a method has no skills and no ingredients, it's probably junk – skip it.
        const hasSkills = specs.requiredSkills.length > 0 || specs.experienceGranted.length > 0;
        const hasIngredients = specs.ingredients.length > 0;

        if (!hasSkills && !hasIngredients) {
            logWithProgress(
                'warn',
                `[creation-importer] Skipping method for "${identifier}" with no skills or ingredients (methodName="${m.methodName}")`,
            );
            continue;
        }

        creationSpecs.push(specs);
    }

    if (!creationSpecs.length) {
        // Nothing survived, and what was dropped was dropped because it makes a sibling
        // rather than this item. That is the same finding as the version filter reaching
        // zero, so it clears inherited specs for the same reason.
        if (discardedConsumingOwner) {
            await clearCreationSpecsForOtherVariant(owner, resolvedTitle, options);
            return;
        }

        logWithProgress(
            'warn',
            `[creation-importer] No valid creationSpecs built for "${identifier}" after filtering.`,
        );
        logCreationSpecsEmpty(owner, identifier);
        return;
    }

    const hadExistingSpecs = owner.creationSpecs?.length ?? 0;

    if (options.dryRun) {
        logWithProgress(
            'log',
            `🔍 [creation-importer] Would write ${creationSpecs.length} creation spec(s) over ${hadExistingSpecs} for "${
                owner.wiki_name ?? owner.name
            }" (dry run).`,
        );
        return;
    }

    owner.creationSpecs = creationSpecs;
    await owner.save();

    const action = hadExistingSpecs ? 'Updated' : 'Saved';

    logWithProgress(
        'log',
        `✅ [creation-importer] ${action} ${creationSpecs.length} creation spec(s) for "${
            owner.wiki_name ?? owner.name
        }".`,
    );
}

/**
 * Drops creation specs from an item whose wiki page documents no recipe for its variant.
 *
 * Returning early instead would leave the sibling's recipe in place forever, because this
 * importer only ever overwrites `creationSpecs` and never clears them.
 * @param owner - The item being imported.
 * @param pageTitle - The page that was scraped, for the log line.
 * @param options - Import options; `dryRun` reports instead of writing.
 */
async function clearCreationSpecsForOtherVariant(
    owner: OsrsboxItemDocument,
    pageTitle: string,
    options: ImportOptions,
): Promise<void> {
    const existing = owner.creationSpecs?.length ?? 0;

    if (!existing) return;

    if (options.dryRun) {
        logWithProgress(
            'log',
            `🔍 [creation-importer] Would clear ${existing} creation spec(s) from "${owner.name}": "${pageTitle}" documents no recipe for version "${owner.wiki_version}" (dry run).`,
        );
        return;
    }

    owner.creationSpecs = [];
    await owner.save();

    logWithProgress(
        'log',
        `🧹 [creation-importer] Cleared ${existing} creation spec(s) from "${owner.name}": "${pageTitle}" documents no recipe for version "${owner.wiki_version}".`,
    );
}

/**
 * Batch importer:
 *   - Iterate over every item in the DB
 *   - Fetch & store creation specs for each.
 */
export async function importCreationForAllItems(options: ImportOptions = {}): Promise<void> {
    let resumeObjectId: mongoose.Types.ObjectId | null = null;

    if (options.resumeFromId) {
        try {
            resumeObjectId = new mongoose.Types.ObjectId(options.resumeFromId);
        } catch {
            logWithProgress(
                'warn',
                `⚠️ [creation-importer] --resume-from "${options.resumeFromId}" is not a valid ObjectId; ignoring.`,
            );
            resumeObjectId = null;
        }
    }

    const resumeIdFound = resumeObjectId ? Boolean(await OsrsboxItemModel.exists({ _id: resumeObjectId })) : false;

    const baseFilter: Record<string, unknown> = {};

    if (!itemIdLookupMap) {
        logWithProgress('log', '[creation-importer] Building item name lookup map...');
        itemIdLookupMap = await buildItemIdLookupMap();
        logWithProgress(
            'log',
            `[creation-importer] Item lookup map ready (${itemIdLookupMap.size} keys).`,
        );
    }

    if (options.skipExisting) {
        baseFilter.$or = [{ creationSpecs: { $exists: false } }, { creationSpecs: { $size: 0 } }];
    }

    if (options.versionedOnly) {
        baseFilter.wiki_version = { $ne: null };
    }

    if (options.nameContains) {
        const needle = options.nameContains.trim();
        if (needle) {
            const regex = new RegExp(escapeRegex(needle), 'i');
            baseFilter.$and = [
                ...(Array.isArray(baseFilter.$and) ? baseFilter.$and : []),
                { $or: [{ name: { $regex: regex } }, { wiki_name: { $regex: regex } }] },
            ];
        }
    }

    const totalToProcess = await OsrsboxItemModel.countDocuments(baseFilter).exec();
    recordAtlasRequest();

    const processedStart = resumeObjectId
        ? await OsrsboxItemModel.countDocuments({
              ...baseFilter,
              _id: { $lte: resumeObjectId },
          }).exec()
        : 0;
    recordAtlasRequest();

    let processed = processedStart;
    let skippedExisting = 0;
    let lastId: mongoose.Types.ObjectId | null = resumeObjectId;
    if (resumeObjectId) lastProcessedIdForResume = resumeObjectId.toString();
    progressState.startedAt = null;
    progressState.processedOffset = processedStart;
    renderProgressLine(processed, totalToProcess);

    try {
        while (true) {
            const query = {
                ...baseFilter,
                ...(lastId ? { _id: { $gt: lastId } } : {}),
            };

            const docs = await OsrsboxItemModel.find(query, { _id: 1, creationSpecs: 1 })
                .sort({ _id: 1 })
                .limit(BATCH_FETCH_LIMIT)
                .lean<{ _id: mongoose.Types.ObjectId; creationSpecs?: unknown[] }[]>()
                .exec();
            recordAtlasRequest();
            progressState.recentRequests.push(Date.now());

            if (!docs.length) break;

            for (const doc of docs) {
                const idStr = doc._id.toString();

                const hasCreationSpecs =
                    Array.isArray((doc as OsrsboxItemDocument).creationSpecs) &&
                    !!(doc as OsrsboxItemDocument).creationSpecs?.length;

                if (options.skipExisting && hasCreationSpecs) {
                    skippedExisting++;
                    continue;
                }

                try {
                    await importCreationForItemTitle(idStr, options);
                } catch (err) {
                    logWithProgress(
                        'error',
                        `🚨 [creation-importer] Error importing creation methods for _id=${idStr}:`,
                        err,
                    );
                    logOwnerNotFound(`${idStr} (exception during import)`);
                } finally {
                    recordAtlasRequest();
                    processed++;
                    lastProcessedIdForResume = idStr;
                    renderProgressLine(processed, totalToProcess);
                    if (processed % 100 === 0) {
                        logWithProgress('log', `ℹ️ [creation-importer] Processed ${processed} items...`);
                    }
                }
            }

            lastId = docs[docs.length - 1]._id;
        }
    } catch (err) {
        if (isCursorNotFoundError(err)) {
            logWithProgress(
                'error',
                '🚨 [creation-importer] Mongo cursor was lost (code 43 CursorNotFound). This can happen if the connection idles or is interrupted. Rerun to continue.',
            );
        } else {
            logWithProgress('error', '🚨 [creation-importer] Unexpected error while iterating cursor:', err);
        }
        throw err;
    } finally {
        logUpdate.done();
        progressState.active = false;
    }

    if (options.resumeFromId && !resumeIdFound) {
        logWithProgress(
            'warn',
            `⚠️ [creation-importer] --resume-from id "${options.resumeFromId}" was not found; processed items from the start of the collection.`,
        );
    }

    const skippedText = options.skipExisting
        ? ` Skipped ${skippedExisting} item(s) that already had creation specs.`
        : '';

    logWithProgress('log', `[creation-importer] Finished processing ${processed} items.${skippedText}`);
}

/**
 * ====================================================================================================================
 * CLI entrypoint.
 * ====================================================================================================================
 */

async function main() {
    const args = process.argv.slice(2);
    let skipExisting = false;
    let versionedOnly = false;
    let dryRun = false;
    let resumeFromId: string | undefined;
    let nameContains: string | undefined;
    const positionalArgs: string[] = [];
    lastProcessedIdForResume = null;
    progressState.startedAt = null;
    progressState.processedOffset = 0;
    progressState.recentRequests = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--skip-existing') {
            skipExisting = true;
            continue;
        }

        if (arg === '--versioned-only') {
            versionedOnly = true;
            continue;
        }

        if (arg === '--dry-run') {
            dryRun = true;
            continue;
        }

        if (arg === '--resume-from') {
            resumeFromId = args[i + 1];
            i++; // skip value
            continue;
        }

        if (arg.startsWith('--resume-from=')) {
            resumeFromId = arg.split('=')[1];
            continue;
        }

        if (arg === '--name-contains' || arg === '--filter') {
            nameContains = args[i + 1];
            i++; // skip value
            continue;
        }

        if (arg.startsWith('--name-contains=')) {
            nameContains = arg.split('=')[1];
            continue;
        }

        if (arg.startsWith('--filter=')) {
            nameContains = arg.split('=')[1];
            continue;
        }

        positionalArgs.push(arg);
    }

    const arg = positionalArgs[0];

    if (!user || !pw || !cluster || !host) {
        logWithProgress('error', '[creation-importer] Missing MongoDB env vars.');
        process.exit(1);
    }

    logWithProgress('log', `[creation-importer] Connecting to MongoDB...`);
    await mongoose.connect(connectionString);

    try {
        if (skipExisting) {
            logWithProgress(
                'log',
                '[creation-importer] Will skip items that already have creation specs (--skip-existing).',
            );
        } else {
            logWithProgress(
                'log',
                '[creation-importer] Existing creation specs will be refreshed if wiki data is available.',
            );
        }

        if (resumeFromId) {
            logWithProgress(
                'log',
                `[creation-importer] Will resume after _id=${resumeFromId} (skipping it and anything before it).`,
            );
        }

        if (!arg || arg === '--all') {
            if (nameContains?.trim()) {
                logWithProgress(
                    'log',
                    `[creation-importer] Limiting batch to items whose name/wiki_name contains "${nameContains.trim()}".`,
                );
            }
            if (versionedOnly) {
                logWithProgress(
                    'log',
                    '[creation-importer] Limiting batch to items with an infobox version (--versioned-only).',
                );
            }
            if (dryRun) {
                logWithProgress('log', '[creation-importer] Dry run: nothing will be written.');
            }
            logWithProgress('log', '[creation-importer] Running in batch mode over all items...');
            await importCreationForAllItems({ skipExisting, resumeFromId, nameContains, versionedOnly, dryRun });
        } else {
            logWithProgress('log', `[creation-importer] Importing creation specs for "${arg}"...`);
            await importCreationForItemTitle(arg, { skipExisting, dryRun });
        }
    } catch (err) {
        logWithProgress('error', '🚨 [creation-importer] Unhandled error:', err);
        if (lastProcessedIdForResume) {
            logWithProgress(
                'log',
                `ℹ️ [creation-importer] To resume after the last successful item, run with --resume-from ${lastProcessedIdForResume}`,
            );
        }
    } finally {
        await performCleanup({ reason: 'normal completion', exitAfter: false });
        process.exit(0);
    }
}

// Only run main when executed directly, not when imported as a module
if (require.main === module) {
    void main();
}
