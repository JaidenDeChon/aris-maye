/**
 * Reads shop stock and pricing terms from the OSRS Wiki.
 *
 * This works from wikitext rather than rendered HTML, because the numbers that matter are
 * template parameters that the page never renders. A shop's stock section looks like:
 *
 *   {{StoreTableHead|sellmultiplier=1000|buymultiplier=600|delta=20}}
 *   {{StoreLine|name=Steel axe|stock=3|restock=400}}
 *
 * The multipliers are per-mille of the item's base value — 600 is 60%, 20 is 2% — and the
 * item page's "Change Per" column is the same `delta`. Going shop-first also makes the
 * scrape affordable: there are ~508 shop pages against ~28,700 items, so this is one pass
 * of a few hundred requests rather than tens of thousands.
 */

/** The wiki API. Shared with the creation scraper, but kept separate so either can move. */
const OSRS_WIKI_API = 'https://oldschool.runescape.wiki/api.php';

/** One item a shop keeps in stock. */
export type StoreStockLine = {
    /** Item name as the shop lists it. */
    name: string;
    /** How many the shop holds by default; the price is quoted at this stock level. */
    stock: number | null;
    /** Ticks until one restocks. */
    restock: number | null;
    /** An explicit gp price the shop charges, overriding the sell multiplier. */
    sellOverride: number | null;
    /** An explicit gp price the shop pays, overriding the buy multiplier. */
    buyOverride: number | null;
};

/** A shop's terms and what it stocks. */
export type StorePage = {
    /** Wiki page title, used as the shop's identity. */
    title: string;
    /** Per-mille of value the shop charges, e.g. 1300 for 130%. Null when not stated. */
    sellMultiplier: number | null;
    /** Per-mille of value the shop pays for the first sale, e.g. 600 for 60%. */
    buyMultiplier: number | null;
    /** Per-mille of value the price moves per item traded, e.g. 20 for 2%. */
    delta: number | null;
    /** What the shop trades in. Null means coins; anything else is not gp. */
    currency: string | null;
    /** False when the shop refuses to buy from players (`hidebuy`). */
    buysFromPlayers: boolean;
    items: StoreStockLine[];
};

type WikiResponse = { parse?: { wikitext?: string }; query?: unknown; continue?: Record<string, string> };

/**
 * Calls the MediaWiki API with JSON output.
 * @param params - Query parameters, merged over the JSON defaults.
 * @returns The parsed response.
 */
async function wikiApi(params: Record<string, string>): Promise<WikiResponse> {
    const url = new URL(OSRS_WIKI_API);
    Object.entries({ format: 'json', formatversion: '2', origin: '*', ...params }).forEach(([k, v]) =>
        url.searchParams.set(k, v),
    );

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`OSRS wiki API error: ${res.status} ${res.statusText}`);
    return (await res.json()) as WikiResponse;
}

/**
 * Every article-namespace page in Category:Shops.
 *
 * The category also holds shop *type* overview pages ("Axe shops"), which simply carry no
 * stock template and fall out when parsed.
 * @returns Shop page titles.
 */
export async function listShopPages(): Promise<string[]> {
    const titles: string[] = [];
    let cmcontinue: string | undefined;

    do {
        const response = (await wikiApi({
            action: 'query',
            list: 'categorymembers',
            cmtitle: 'Category:Shops',
            cmlimit: '500',
            cmnamespace: '0',
            ...(cmcontinue ? { cmcontinue } : {}),
        })) as WikiResponse & { query?: { categorymembers?: { title: string }[] } };

        titles.push(...(response.query?.categorymembers ?? []).map((member) => member.title));
        cmcontinue = response.continue?.cmcontinue;
    } while (cmcontinue);

    return titles;
}

/**
 * Reads one `|key=value` parameter out of a template's parameter blob.
 * @param body - The text between the template name and its closing braces.
 * @param key - Parameter name.
 * @returns The trimmed value, or null when absent.
 */
function templateParam(body: string, key: string): string | null {
    const match = body.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^|}\\n]*)`, 'i'));
    const value = match?.[1]?.trim();
    return value ? value : null;
}

/**
 * Parses a template parameter that should be a number.
 * @param body - The template parameter blob.
 * @param key - Parameter name.
 * @returns The number, or null when absent or not numeric.
 */
function numericParam(body: string, key: string): number | null {
    const raw = templateParam(body, key);
    if (raw === null) return null;
    const parsed = Number(raw.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Turns a shop page's wikitext into its terms and stock list.
 *
 * Exported separately from the fetch so it can be tested without the network.
 * @param title - The shop's page title.
 * @param wikitext - The page source.
 * @returns The parsed shop, or null when the page has no stock table.
 */
export function parseStorePage(title: string, wikitext: string): StorePage | null {
    const head = wikitext.match(/\{\{\s*StoreTableHead\s*([^}]*)\}\}/i);
    if (!head) return null;

    const headBody = head[1] ?? '';
    const items: StoreStockLine[] = [];

    for (const line of wikitext.matchAll(/\{\{\s*StoreLine\s*([^}]*)\}\}/gi)) {
        const body = line[1] ?? '';
        const name = templateParam(body, 'name');
        if (!name) continue;

        items.push({
            name,
            stock: numericParam(body, 'stock'),
            restock: numericParam(body, 'restock'),
            sellOverride: numericParam(body, 'sell'),
            buyOverride: numericParam(body, 'buy'),
        });
    }

    if (!items.length) return null;

    // `hidebuy` marks a shop that will not buy from players at all, so there is no
    // sale price to record however generous its multipliers look.
    const hideBuy = templateParam(headBody, 'hidebuy');

    return {
        title,
        sellMultiplier: numericParam(headBody, 'sellmultiplier'),
        buyMultiplier: numericParam(headBody, 'buymultiplier'),
        delta: numericParam(headBody, 'delta'),
        currency: templateParam(headBody, 'currency'),
        buysFromPlayers: !(hideBuy && !/^(no|false|0)$/i.test(hideBuy)),
        items,
    };
}

/**
 * Fetches and parses one shop page.
 * @param title - The shop's page title.
 * @returns The parsed shop, or null when the page has no stock table.
 */
export async function getStorePage(title: string): Promise<StorePage | null> {
    const response = await wikiApi({ action: 'parse', page: title, prop: 'wikitext' });
    const wikitext = response.parse?.wikitext;
    if (!wikitext) return null;
    return parseStorePage(title, wikitext);
}
