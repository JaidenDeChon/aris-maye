// backfill-missing-items.ts
//
// CLI to backfill missing OSRS items into a Mongo collection that uses
// the OSRSBox item schema, using:
//   - osrsreboxed-db (primary source, OSRSBox shape)
//   - prices.runescape.wiki (mapping + latest prices)
//   - oldschool.runescape.wiki (wikitext + HTML infobox enrichment)
//
// Run with:
//   bun run backfill-missing-items.ts
// or Node 18+ with ts-node / compiled JS.

import mongoose from 'mongoose';
import * as cheerio from 'cheerio';
import { OsrsboxItemModel } from '../src/lib/models/mongo-schemas/osrsbox-db-item-schema';
import { deriveWikiPageIdentity } from '../src/lib/helpers/wiki-page-title';

/**
 * ======================================================================
 * Mongo connection (matches your existing style)
 * ======================================================================
 */

const user = process.env.VITE_MONGO_USERNAME;
const pw = process.env.VITE_MONGO_PASSWORD;
const cluster = process.env.VITE_MONGO_DB_CLUSTER_NAME;
const host = process.env.VITE_MONGO_DB_HOST;
const dbName = process.env.VITE_MONGO_DB_DB_NAME || 'osrsbox';
const prepend = 'mongodb+srv';
const append = '?retryWrites=true&w=majority';
const connectionString = `${prepend}://${user}:${pw}@${cluster}.${host}/${dbName}${append}`;

/**
 * ======================================================================
 * External endpoints
 * ======================================================================
 */

// osrsreboxed static JSON: OSRSBox-compatible data
const OSRSREBOXED_BASE = 'https://raw.githubusercontent.com/0xNeffarion/osrsreboxed-db/master/docs';
const ITEMS_SUMMARY_URL = `${OSRSREBOXED_BASE}/items-summary.json`;

// Price API (mapping + latest)
const PRICES_BASE = 'https://prices.runescape.wiki/api/v1/osrs';
const MAPPING_URL = `${PRICES_BASE}/mapping`;
const LATEST_PRICES_URL = `${PRICES_BASE}/latest`;

// OSRS Wiki MediaWiki API (for wikitext + HTML)
const OSRS_WIKI_API = 'https://oldschool.runescape.wiki/api.php';

// Be nice to the wiki; use a custom UA
const USER_AGENT = 'aris-maye-import/1.0 (contact: your-contact-or-repo-url-here)';

/**
 * ======================================================================
 * Types
 * ======================================================================
 */

type ItemsSummaryEntry = { id: number; name: string };
type ItemsSummary = Record<string, ItemsSummaryEntry>;

type MappingItem = {
    id: number;
    name: string;
    examine: string;
    members: boolean;
    lowalch: number | null;
    highalch: number | null;
    limit: number | null;
    value: number | null;
    icon: number | null;
};

type WikiLatestPriceEntry = {
    high: number | null;
    highTime: number | null;
    low: number | null;
    lowTime: number | null;
};

type WikiLatestResponse = {
    data: Record<string, WikiLatestPriceEntry>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OsrsboxItemInput = Record<string, any>;

/**
 * Missing item names (your target list)
 */
const TARGET_ITEM_NAMES: string[] = [
    'Apple seedling (w)',
    'Axe',
    'Banana seedling (w)',
    'Battered book',
    'Beaten book',
    'Black dye',
    'Bludgeon axon',
    'Bludgeon claw',
    'Bludgeon spine',
    'Book of balance',
    'Bottom of sceptre',
    'Bucket of saltwater',
    'Bucket of sandworms',
    'Buttons',
    'Calquat seedling (w)',
    'Cave nightshade',
    'Celastrus seedling (w)',
    'Costume needle',
    'Curry seedling (w)',
    'Dark essence block',
    'Desiccated page',
    'Dragonfruit seedling (w)',
    'Dynamite pot',
    'Elemental metal',
    'Empty fish food box',
    'Empty light orb',
    'Guthixian icon',
    'Half made batta (toad)',
    'Half made batta (worm)',
    "Half made bowl (tangled toad's legs)",
    'Herb tea mix (2 guams and harralander)',
    'Herb tea mix (2 guams and marrentill)',
    'Herb tea mix (harralander, marrentill and guam)',
    'Holy book',
    "Hydra's eye",
    "Hydra's fang",
    "Hydra's heart",
    'Incomplete stew#Meat',
    'Incomplete stew#Potato',
    'Jar generator',
    'Karamjan rum',
    'Karamjan rum (sliced banana)',
    'Left skull half',
    'Magic seedling (w)',
    'Mahogany seedling (w)',
    'Maple seedling (w)',
    'Mixed blast',
    'Mixed blizzard',
    'Mixed dragon (garnished)',
    'Mixed punch',
    'Mixed saturday (heated)',
    'Mixed sgg',
    'Mixed special',
    'Nightshade',
    'Oak seedling (w)',
    'Orange seedling (w)',
    "Overseer's book",
    'Palm leaf',
    'Palm seedling (w)',
    'Papaya seedling (w)',
    'Part admiral pie (tuna)',
    'Part fish pie (cod)',
    'Part garden pie (onion)',
    'Part mud pie (water)',
    'Part summer pie (watermelon)',
    'Part wild pie (raw chompy)',
    'Pat of not garlic butter',
    'Pet rock',
    'Pineapple seedling (w)',
    'Pink dye',
    'Primed mind bar',
    'Rake handle',
    'Rake head',
    'Raw giant krill',
    'Raw haddock',
    'Raw swordtip squid',
    'Red herring',
    'Red hot sauce',
    'Redwood seedling (w)',
    'Right skull half',
    'Runed sceptre',
    'Sacred eel',
    'Sawmill coupon (oak plank)',
    'Sawmill coupon (wood plank)',
    'Sawmill voucher',
    'Scaly blue dragonhide',
    'Sieve',
    'Skewered bird meat',
    'Skull sceptre',
    'Slashed book',
    'Smithing catalyst',
    'Snake hide (swamp)',
    'Strange skull',
    'String Jewellery',
    'Sweetcorn (bowl)',
    'Teak seedling (w)',
    'Tenti pineapple',
    'Top of sceptre',
    'Unfinished batta (cheese+tom)',
    'Unfinished batta (fruit)',
    'Unfinished batta (vegetable)',
    'Unfinished bowl (chocolate bomb)',
    'Unfinished bowl (veg ball)',
    'Unfinished bowl (worm hole)',
    'Unfinished crunchy (chocchip)',
    'Unfinished crunchy (spicy)',
    'Unfinished crunchy (toad)',
    'Unfinished crunchy (worm)',
    'Unfired cup',
    'Unholy book',
    'Unholy mould',
    'Weapon poison+ (unf)',
    'Willow seedling (w)',
    "Xeric's talisman (inert)",
    'Yew seedling (w)',
    "Zamorak's unfermented wine",
    'Zombie monkey greegree (small)',
];

/**
 * Internal name overrides where your local name ≠ wiki/osrsreboxed name.
 */
const MANUAL_NAME_OVERRIDES: Record<string, string> = {
    Axe: 'Bronze axe',
    'Herb tea mix (2 guams and harralander)': 'Herb tea mix',
    'Herb tea mix (2 guams and marrentill)': 'Herb tea mix',
    'Herb tea mix (harralander, marrentill and guam)': 'Herb tea mix',
    'Incomplete stew#Meat': 'Incomplete stew',
    'Incomplete stew#Potato': 'Incomplete stew',
};

const IGNORED_TARGET_NAMES = new Set(['string jewellery']);

/**
 * ======================================================================
 * Generic HTTP helpers
 * ======================================================================
 */

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as T;
}

/**
 * ======================================================================
 * Name normalisation & lookup helpers
 * ======================================================================
 */

function normalizeName(name: string): string {
    return name.replace(/[’]/g, "'").trim().toLowerCase();
}

function canonicalLookupKey(rawName: string): string {
    const override = MANUAL_NAME_OVERRIDES[rawName] ?? rawName;
    const dehashed = override.replace(/#/g, ' ');
    return normalizeName(dehashed);
}

function shouldSkipTarget(rawName: string): boolean {
    return IGNORED_TARGET_NAMES.has(rawName.trim().toLowerCase());
}

/**
 * Build an index from osrsreboxed items-summary.json
 *  - key: normalized item name
 *  - value: lowest item id for that name (usually the base/unnoted item)
 */
async function loadReboxedSummaryIndex(): Promise<Map<string, number>> {
    const summary = await fetchJson<ItemsSummary>(ITEMS_SUMMARY_URL);
    const index = new Map<string, number>();

    for (const key of Object.keys(summary)) {
        const entry = summary[key];
        const norm = normalizeName(entry.name);
        const cur = index.get(norm);
        if (cur == null || entry.id < cur) {
            index.set(norm, entry.id);
        }
    }

    return index;
}

/**
 * Load wiki mapping data (for fallback when osrsreboxed doesn't know the item).
 *
 */
async function loadMapping(): Promise<MappingItem[]> {
    return fetchJson<MappingItem[]>(MAPPING_URL);
}

/**
 * Load latest GE prices.
 *
 */
async function loadLatestPrices(): Promise<Record<string, WikiLatestPriceEntry>> {
    const json = await fetchJson<WikiLatestResponse>(LATEST_PRICES_URL);
    return json.data;
}

/**
 * osrsreboxed full item JSON.
 */
async function fetchReboxedItem(id: number): Promise<OsrsboxItemInput> {
    const url = `${OSRSREBOXED_BASE}/items-json/${id}.json`;
    return fetchJson<OsrsboxItemInput>(url);
}

/**
 * ======================================================================
 * OSRS Wiki MediaWiki API helpers (wikitext + HTML)
 * ======================================================================
 *
 * We use action=parse with prop=wikitext|text. PH01L’s blog goes into this
 * pattern in detail.
 */

async function fetchWikiPageContent(pageTitle: string): Promise<{ wikitext?: string; html?: string }> {
    const url = `${OSRS_WIKI_API}?action=parse&format=json&formatversion=2&prop=wikitext|text&page=${encodeURIComponent(
        pageTitle,
    )}`;

    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
        },
    });

    if (!res.ok) {
        throw new Error(`Wiki parse error for "${pageTitle}": ${res.status} ${res.statusText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    const parse = json.parse;

    const wikitext: string | undefined =
        typeof parse?.wikitext === 'string' ? parse.wikitext : (parse?.wikitext?.['*'] ?? undefined);

    const html: string | undefined = typeof parse?.text === 'string' ? parse.text : (parse?.text?.['*'] ?? undefined);

    return { wikitext, html };
}

/**
 * Extract key/value pairs from the Infobox Item template in raw wikitext.
 *
 * Very simple brace counter + line parser:
 *   {{Infobox Item
 *   | key = value
 *   | key2 = value2
 *   }}
 */
function parseInfoboxFromWikitext(wikitext: string): Record<string, string> {
    const result: Record<string, string> = {};

    const startRegex = /\{\{[Ii]nfobox[ _]item/;
    const start = wikitext.search(startRegex);
    if (start === -1) return result;

    let depth = 0;
    let end = -1;
    for (let i = start; i < wikitext.length - 1; i++) {
        const two = wikitext.slice(i, i + 2);
        if (two === '{{') {
            depth++;
            i++;
            continue;
        }
        if (two === '}}') {
            depth--;
            i++;
            if (depth === 0) {
                end = i + 1;
                break;
            }
            continue;
        }
    }
    if (end === -1) return result;

    const infoboxText = wikitext.slice(start, end);
    const lines = infoboxText.split('\n');

    for (const line of lines) {
        const m = line.match(/^\s*\|\s*([^=\s]+)\s*=\s*(.+)\s*$/);
        if (!m) continue;
        const key = m[1].trim().toLowerCase();
        const value = m[2].trim();
        if (!key || !value) continue;
        result[key] = value;
    }

    return result;
}

/**
 * Extract key/value pairs from the rendered HTML infobox table.
 *
 * We look for the first <table class="infobox">, then use <th> text as key,
 * <td> text as value.
 */
function parseInfoboxFromHtml(html: string): Record<string, string> {
    const result: Record<string, string> = {};
    const $ = cheerio.load(html);

    // Prefer the item infobox if present
    let infobox = $('table.infobox-item').first();
    if (!infobox.length) {
        infobox = $('table.infobox').first();
    }
    if (!infobox.length) return result;

    infobox.find('tr').each((_i, el) => {
        const th = $(el).find('th').first();
        const td = $(el).find('td').first();
        if (!th.length || !td.length) return;

        const key = th.text().trim().toLowerCase();
        const value = td.text().trim();
        if (!key || !value) return;

        result[key] = value;
    });

    return result;
}

/**
 * Small utilities for mapping infobox strings → typed fields
 */

function toBool(value?: string): boolean | undefined {
    if (!value) return undefined;
    const s = value.trim().toLowerCase();
    if (/^(yes|y|true)$/i.test(s)) return true;
    if (/^(no|n|false)$/i.test(s)) return false;
    return undefined;
}

function toNumber(value?: string): number | undefined {
    if (!value) return undefined;
    const cleaned = value.replace(/,/g, '');
    const m = cleaned.match(/-?\d+(\.\d+)?/);
    if (!m) return undefined;
    const n = Number(m[0]);
    return isNaN(n) ? undefined : n;
}

function mapInfoboxToOsrsboxFields(
    base: OsrsboxItemInput,
    wtBox: Record<string, string>,
    htmlBox: Record<string, string>,
): Partial<OsrsboxItemInput> {
    const out: Partial<OsrsboxItemInput> = {};

    const get = (...keys: string[]): string | undefined => {
        for (const k of keys) {
            const kl = k.toLowerCase();
            if (wtBox[kl] != null) return wtBox[kl];
            if (htmlBox[kl] != null) return htmlBox[kl];
        }
        return undefined;
    };

    // Members
    const membersVal = get('members', 'members item', 'members?');
    const members = toBool(membersVal);
    if (members !== undefined && base.members == null) {
        out.members = members;
    }

    // Tradeable
    const tradeVal = get('tradeable', 'tradable', 'trade', 'tradeable?');
    const trade = toBool(tradeVal);
    if (trade !== undefined && base.tradeable == null) {
        out.tradeable = trade;
    }
    if (trade !== undefined && base.tradeable_on_ge == null && trade === false) {
        out.tradeable_on_ge = false;
    }

    // Stackable
    const stackVal = get('stackable', 'stackable?');
    const stack = toBool(stackVal);
    if (stack !== undefined && base.stackable == null) {
        out.stackable = stack;
    }

    // Noteable
    const noteVal = get('noteable', 'notable');
    const noteable = toBool(noteVal);
    if (noteable !== undefined && base.noteable == null) {
        out.noteable = noteable;
    }

    // Quest item
    const questVal = get('quest item', 'quest', 'quest items');
    const questItem = toBool(questVal);
    if (questItem !== undefined && base.quest_item == null) {
        out.quest_item = questItem;
    }

    // Equipable
    const equipVal = get('equipable', 'equipable?');
    const equip = toBool(equipVal);
    if (equip !== undefined) {
        if (base.equipable == null) out.equipable = equip;
        if (base.equipable_by_player == null) out.equipable_by_player = equip;
    }

    // Weight
    const weightVal = get('weight', 'weight (kg)', 'weight (kg.)');
    const weight = toNumber(weightVal);
    if (weight !== undefined && base.weight == null) {
        out.weight = weight;
    }

    // Value → cost
    const valueVal = get('value');
    const value = toNumber(valueVal);
    if (value !== undefined && base.cost == null) {
        out.cost = value;
    }

    // High/low alch (but only if missing; your price pipeline also sets alchs)
    const highAlchVal = get('high alch', 'high alch value');
    const highAlch = toNumber(highAlchVal);
    if (highAlch !== undefined && (base.highalch == null || base.highalch === 0)) {
        out.highalch = highAlch;
    }

    const lowAlchVal = get('low alch', 'low alch value');
    const lowAlch = toNumber(lowAlchVal);
    if (lowAlch !== undefined && (base.lowalch == null || base.lowalch === 0)) {
        out.lowalch = lowAlch;
    }

    // Release date (keep as string)
    const releaseVal = get('release', 'released', 'release date') || get('release1', 'introduced');
    if (releaseVal && base.release_date == null) {
        out.release_date = releaseVal.trim();
    }

    // Examine
    const examineVal = get('examine');
    if (examineVal && !base.examine) {
        out.examine = examineVal.trim();
    }

    // Item ID (can fix id if the skeleton came from mapping with wrong id,
    // but usually they match; we only set if id is missing)
    const itemIdVal = get('item id', 'id');
    const itemId = toNumber(itemIdVal);
    if (itemId !== undefined && base.id == null) {
        out.id = itemId;
    }

    return out;
}

/**
 * Merge base item with price data (high/low + times).
 */
function mergeItemWithPrices(
    baseItem: OsrsboxItemInput,
    wikiPrices: Record<string, WikiLatestPriceEntry>,
): OsrsboxItemInput {
    const id = baseItem['id'];
    let highPrice: number | null = null;
    let highTime: number | null = null;
    let lowPrice: number | null = null;
    let lowTime: number | null = null;

    if (typeof id === 'number') {
        const entry = wikiPrices[id.toString()];
        if (entry) {
            highPrice = entry.high;
            highTime = entry.highTime;
            lowPrice = entry.low;
            lowTime = entry.lowTime;
        }
    }

    return {
        ...baseItem,
        highPrice,
        highTime,
        lowPrice,
        lowTime,
    };
}

/**
 * Helper: only apply fields if the target currently has null/undefined.
 */
function applyIfMissing(base: OsrsboxItemInput, extra: Partial<OsrsboxItemInput>): OsrsboxItemInput {
    const out = { ...base };
    for (const [key, value] of Object.entries(extra)) {
        if (value === undefined) continue;
        if (out[key] === undefined || out[key] === null) {
            out[key] = value;
        }
    }
    return out;
}

/**
 * Build an OSRSBox-style base item either from osrsreboxed or, if not present,
 * from the /mapping data (sparse but usable skeleton).
 */
function buildSkeletonFromMapping(m: MappingItem): OsrsboxItemInput {
    const today = new Date().toISOString().slice(0, 10);

    return {
        id: m.id,
        name: m.name,
        wiki_name: m.name,
        wiki_url: `https://oldschool.runescape.wiki/w/${encodeURIComponent(m.name.replace(/ /g, '_'))}`,

        examine: m.examine ?? '',
        members: m.members ?? false,

        // Conservative defaults for skeleton items – can be enriched via infobox
        tradeable: true,
        tradeable_on_ge: true,
        stackable: false,
        stacked: null,
        noted: false,
        noteable: true,
        linked_id_item: null,
        linked_id_noted: null,
        linked_id_placeholder: null,
        placeholder: false,
        equipable: false,
        equipable_by_player: false,
        equipable_weapon: false,
        equipment: null,
        weapon: null,

        buy_limit: m.limit ?? null,
        cost: m.value ?? 0,
        lowalch: m.lowalch ?? 0,
        highalch: m.highalch ?? 0,
        weight: null,
        quest_item: null,
        release_date: null,
        duplicate: false,
        incomplete: false,
        last_updated: today,

        icon: null,
    };
}

async function fetchWikiFullHtml(pageTitle: string): Promise<string> {
    const url = `https://oldschool.runescape.wiki/w/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`;

    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html',
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch full HTML for "${pageTitle}": ${res.status} ${res.statusText}`);
    }

    return await res.text();
}

/**
 * ======================================================================
 * Main backfill routine
 * ======================================================================
 */

async function main() {
    console.log('Connecting to Mongo...');
    await mongoose.connect(connectionString);
    console.log('Connected.');

    console.log('Loading osrsreboxed items-summary index...');
    const reboxedIndex = await loadReboxedSummaryIndex();
    console.log(`Reboxed index size: ${reboxedIndex.size}`);

    console.log('Loading price mapping + latest prices...');
    const [mapping, latestPrices] = await Promise.all([loadMapping(), loadLatestPrices()]);

    const mappingByName = new Map<string, MappingItem[]>();
    for (const m of mapping) {
        const norm = normalizeName(m.name);
        const arr = mappingByName.get(norm) ?? [];
        arr.push(m);
        mappingByName.set(norm, arr);
    }

    const imported: string[] = [];
    const existing: string[] = [];
    const unresolved: string[] = [];
    const failed: { name: string; reason: string }[] = [];

    for (const rawName of TARGET_ITEM_NAMES) {
        if (shouldSkipTarget(rawName)) {
            console.log(`[SKIP] Ignoring "${rawName}" because it is not an item to fetch.`);
            continue;
        }

        const lookupKey = canonicalLookupKey(rawName);

        // 1. Skip if already exists in DB (case-insensitive name match)
        const found = await OsrsboxItemModel.findOne({
            name: new RegExp(`^${lookupKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        }).lean();

        if (found) {
            existing.push(rawName);
            continue;
        }

        // 2. Find id from osrsreboxed summary first
        let baseItem: OsrsboxItemInput | null = null;
        const reboxedId = reboxedIndex.get(lookupKey);

        try {
            if (reboxedId != null) {
                // Primary path: full OSRSBox JSON from osrsreboxed
                const reboxedItem = await fetchReboxedItem(reboxedId);
                baseItem = reboxedItem;
            } else {
                // Fallback path: use /mapping to build a skeleton
                const mappingCandidates = mappingByName.get(lookupKey);
                if (!mappingCandidates || mappingCandidates.length === 0) {
                    unresolved.push(rawName);
                    console.warn(`[WARN] No osrsreboxed or mapping entry found for "${rawName}" (key: "${lookupKey}")`);
                    continue;
                }

                if (mappingCandidates.length > 1) {
                    console.warn(
                        `[WARN] Multiple mapping entries for "${rawName}", using first id=${mappingCandidates[0].id}`,
                    );
                }

                baseItem = buildSkeletonFromMapping(mappingCandidates[0]);
            }

            // 3. Enrich with OSRS Wiki infobox (wikitext + HTML)
            const wikiName = baseItem.wiki_name || baseItem.name || rawName;
            const pageTitle = wikiName;

            let wtBox: Record<string, string> = {};
            let htmlBox: Record<string, string> = {};

            try {
                const { wikitext, html } = await fetchWikiPageContent(pageTitle);
                if (wikitext) wtBox = parseInfoboxFromWikitext(wikitext);
                if (html) htmlBox = parseInfoboxFromHtml(html);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (apiErr: any) {
                console.warn(`[WARN] Wiki API parse failed for "${pageTitle}": ${apiErr?.message || apiErr}`);
            }

            // 🔁 Backup: if API produced nothing useful, fall back to full HTML crawl
            if (Object.keys(wtBox).length === 0 && Object.keys(htmlBox).length === 0) {
                try {
                    const fullHtml = await fetchWikiFullHtml(pageTitle);
                    htmlBox = parseInfoboxFromHtml(fullHtml);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (htmlErr: any) {
                    console.warn(`[WARN] Full HTML crawl failed for "${pageTitle}": ${htmlErr?.message || htmlErr}`);
                }
            }

            const wikiFields = mapInfoboxToOsrsboxFields(baseItem, wtBox, htmlBox);
            baseItem = applyIfMissing(baseItem, wikiFields);

            // 4. Merge latest GE prices
            const finalItem = mergeItemWithPrices(baseItem, latestPrices);

            // 5. Record the real wiki page title, so later wiki scrapes don't have to
            // guess at OSRSBox's synthetic "<page> (<version>)" wiki_name.
            const { wikiPageTitle, wikiVersion } = deriveWikiPageIdentity(finalItem);
            finalItem.wiki_page_title = wikiPageTitle;
            finalItem.wiki_version = wikiVersion;

            // 6. Upsert via your osrsboxItemSchema
            await OsrsboxItemModel.updateOne({ id: finalItem.id }, { $set: finalItem }, { upsert: true });

            imported.push(rawName);
            console.log(`[OK] Imported "${rawName}" as id=${finalItem.id}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            console.error(`[ERROR] Failed to backfill "${rawName}":`, err?.message ?? err);
            failed.push({ name: rawName, reason: err?.message ?? String(err) });
        }
    }

    console.log('============================================================');
    console.log('Backfill complete.');
    console.log(`Imported : ${imported.length}`);
    console.log(`Existing : ${existing.length}`);
    console.log(`Unresolved (no data): ${unresolved.length}`);
    console.log(`Failed (errors)      : ${failed.length}`);

    if (unresolved.length) {
        console.log('\nUnresolved items (need manual id/name help):');
        for (const n of unresolved) console.log(`  - ${n}`);
    }

    if (failed.length) {
        console.log('\nFailed items:');
        for (const f of failed) {
            console.log(`  - ${f.name}: ${f.reason}`);
        }
    }

    await mongoose.disconnect();
    console.log('Disconnected from Mongo.');
}

main().catch((err) => {
    console.error('Fatal error in backfill script:', err);
    process.exit(1);
});
