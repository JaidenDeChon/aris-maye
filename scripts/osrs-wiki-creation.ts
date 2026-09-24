import * as cheerio from 'cheerio';

/**
 * Base URL for the OSRS wiki API.
 */
const OSRS_WIKI_API = 'https://oldschool.runescape.wiki/api.php';

/**
 * Minimum gap between wiki requests, in milliseconds.
 *
 * A full rescrape previously ran unthrottled at roughly 349 req/min (~3.2 wiki calls per
 * item at 1.8 items/sec), which earned a burst of 403s about four hours in — 427 items
 * were skipped before the run was stopped. 400ms holds the pass to ~150 req/min, well
 * under the rate that drew the block.
 *
 * Override with WIKI_MIN_REQUEST_MS to go slower still; 0 disables the throttle.
 */
const MIN_REQUEST_INTERVAL_MS = Number(process.env.WIKI_MIN_REQUEST_MS ?? 400);

/**
 * Identifies the scraper, per the wiki's API etiquette. An unidentified client is the
 * first thing a rate limiter drops. Set WIKI_USER_AGENT to add contact details.
 */
const USER_AGENT = process.env.WIKI_USER_AGENT ?? 'aris-maye/0.0.1 (OSRS crafting-profit tool)';

/**
 * Backoff waits after a rate-limited response, in milliseconds. One entry per retry, so
 * a request gets RATE_LIMIT_BACKOFF_MS.length + 1 attempts before the item is skipped.
 */
const RATE_LIMIT_BACKOFF_MS = [2_000, 8_000, 32_000];

/** Next timestamp at which a request may go out; each caller reserves its own slot. */
let nextRequestAllowedAt = 0;

/**
 * Waits until this caller's reserved slot in the request schedule comes up.
 *
 * The slot is reserved before awaiting, so concurrent callers queue behind each other
 * rather than all reading the same "last request" time and firing together.
 */
async function throttleWikiRequest(): Promise<void> {
    if (MIN_REQUEST_INTERVAL_MS <= 0) return;

    const now = Date.now();
    const waitMs = Math.max(0, nextRequestAllowedAt - now);
    nextRequestAllowedAt = Math.max(now, nextRequestAllowedAt) + MIN_REQUEST_INTERVAL_MS;

    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

export type WikiItemRef = {
    name: string;
    href?: string; // /w/Item_name
};

export type CreationRequirement = {
    skill?: string; // "Fletching", "Magic", etc
    level?: number; // 4, etc
    xp?: number; // 12.5, etc
    description: string; // full text for safety/debug
};

export type CreationMaterial = {
    item: WikiItemRef;
    quantity: number;
    consumed: boolean; // tools will be false later when we classify them
};

export type CreationProduct = {
    item: WikiItemRef;
    quantity: number;
    notes?: string;
};

export type CreationMethod = {
    pageTitle: string; // "Bronze sword"
    methodName?: string; // e.g. "Smithing" / "Imbuing" (we'll fill this in later)
    requirements: CreationRequirement[];
    materials: CreationMaterial[];
    products: CreationProduct[];
    rawHtml: string; // useful for debugging when parsing goes wrong
};

type WikiParseText = string | { [key: string]: unknown };
type WikiParseResponse = { parse?: { text?: WikiParseText; sections?: { index: string; line: string }[] } };

/**
 * Generic helper to call the MediaWiki API with JSON output.
 */
async function wikiApi(params: Record<string, string>): Promise<WikiParseResponse> {
    const url = new URL(OSRS_WIKI_API);

    Object.entries({
        format: 'json',
        formatversion: '2', // in v2, parse.text is a string
        origin: '*', // CORS if you ever call this from the browser later
        ...params,
    }).forEach(([k, v]) => url.searchParams.set(k, v));

    // A throttled block is transient, but the caller treats any throw as "this item has no
    // recipe" and moves on — so an unretried 403 silently leaves stale data behind. Back
    // off and let the limiter's window pass before giving up on the item.
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < RATE_LIMIT_BACKOFF_MS.length + 1; attempt++) {
        await throttleWikiRequest();

        const res = await fetch(url.toString(), { headers: { 'User-Agent': USER_AGENT } });
        if (res.ok) return (await res.json()) as WikiParseResponse;

        lastError = new Error(`OSRS wiki API error: ${res.status} ${res.statusText}`);

        const retryable = res.status === 403 || res.status === 429 || res.status >= 500;
        const backoffMs = RATE_LIMIT_BACKOFF_MS[attempt];
        if (!retryable || backoffMs === undefined) break;

        console.warn(
            `⏸️  [osrs-wiki] ${res.status} ${res.statusText} — backing off ${backoffMs / 1000}s (attempt ${attempt + 1}/${RATE_LIMIT_BACKOFF_MS.length})`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    throw lastError ?? new Error('OSRS wiki API error: request failed');
}

function buildMethodFromCaptionTables(
    $: cheerio.CheerioAPI,
    pageTitle: string,
    captionTables: CaptionTable[],
    methodName?: string,
): CreationMethod {
    const requirements: CreationRequirement[] = [];
    const materials: CreationMaterial[] = [];
    const products: CreationProduct[] = [];

    for (const { captionText, $table } of captionTables) {
        const captionLower = captionText.toLowerCase();

        if (/requirement/.test(captionLower)) {
            requirements.push(...parseRequirementsTable($, $table));
        } else if (/material/.test(captionLower)) {
            const { materials: mats, products: inlineProducts } = parseMaterialsAndInlineProducts($, $table, pageTitle);
            materials.push(...mats);
            products.push(...inlineProducts);
        } else if (/product/.test(captionLower)) {
            products.push(...parseProductsTable($, $table));
        }
    }

    return {
        pageTitle,
        methodName,
        requirements,
        materials,
        products,
        rawHtml: $.html(), // or narrower if you want
    };
}

/**
 * Step 1: fetch the list of sections for a page and find the "Creation" (or "Recipe") section index.
 */
async function getCreationSectionIndex(title: string): Promise<number | null> {
    const data = await wikiApi({
        action: 'parse',
        page: title,
        prop: 'sections',
    });

    const sections: { index: string; line: string }[] = data?.parse?.sections ?? [];

    const creationSection = sections.find((s) => {
        const line = s.line.toLowerCase().trim();
        return line === 'creation' || line === 'recipe';
    });

    if (!creationSection) return null;

    return Number(creationSection.index);
}

/**
 * Step 2: fetch just the HTML for the Creation section.
 * With formatversion=2, parse.text is already a string.
 */
async function getCreationSectionHtml(title: string, sectionIndex: number): Promise<string | null> {
    const data = await wikiApi({
        action: 'parse',
        page: title,
        prop: 'text',
        section: String(sectionIndex),
    });

    const parseText = data?.parse?.text;
    let html: string | undefined;

    if (typeof parseText === 'string') {
        html = parseText;
    } else if (parseText && typeof parseText === 'object' && typeof (parseText as { '*': unknown })['*'] === 'string') {
        // fallback for formatversion=1-style responses
        html = (parseText as { '*': string })['*'];
    }

    if (!html) {
        console.log('Unexpected parse.text shape:', data?.parse?.text);
    }

    return html ?? null;
}

/**
 * Given the Creation section HTML, find tables by their <caption> text.
 * This matches the real structure on pages like Bronze sword:
 * - <table> <caption>Requirements</caption> ...
 * - <table> <caption>Materials</caption> ...
 */
type CaptionTable = {
    captionText: string;
    $table: cheerio.Cheerio;
};

function normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function extractCaptionTables($: cheerio.CheerioAPI, root?: cheerio.Cheerio): CaptionTable[] {
    const result: CaptionTable[] = [];
    const scope = root ?? $.root();

    scope.find('table').each((_, el) => {
        const $table = $(el);
        const captionText = $table.find('caption').first().text().trim();
        if (!captionText) return;

        result.push({ captionText, $table });
    });

    return result;
}

function buildMethodsFromSwitchInfoboxes(
    $: cheerio.CheerioAPI,
    pageTitle: string,
    scope: cheerio.Cheerio,
    methodNamePrefix?: string,
    options?: { ignoreWithinSelectors?: string[] },
): CreationMethod[] {
    const methods: CreationMethod[] = [];

    const $switches = scope.find('.switch-infobox');
    if ($switches.length === 0) return methods;

    $switches.each((_, el) => {
        const $switch = $(el);
        if (
            options?.ignoreWithinSelectors?.some((selector) => $switch.closest(selector).length > 0)
        ) {
            return;
        }
        const triggerLabels = new Map<string, string>();

        $switch.find('.switch-infobox-triggers .trigger').each((_, triggerEl) => {
            const $trigger = $(triggerEl);
            const id = $trigger.attr('data-id')?.trim();
            if (!id) return;

            const label = normalizeWhitespace($trigger.text());
            triggerLabels.set(id, label || id);
        });

        $switch.find('div.item').each((_, itemEl) => {
            const $item = $(itemEl);
            const dataId = $item.attr('data-id')?.trim();
            const label = dataId ? triggerLabels.get(dataId) : undefined;
            const methodName = label && methodNamePrefix ? `${methodNamePrefix}: ${label}` : label ?? methodNamePrefix;

            const captionTables = extractCaptionTables($, $item);
            if (captionTables.length === 0) return;

            const method = buildMethodFromCaptionTables($, pageTitle, captionTables, methodName);
            methods.push(method);
        });
    });

    return methods;
}

function buildMethodsFromRecipeTables(
    $: cheerio.CheerioAPI,
    pageTitle: string,
    scope: cheerio.Cheerio,
    options?: { ignoreWithinSelectors?: string[] },
): CreationMethod[] {
    const methods: CreationMethod[] = [];

    const $recipes = scope.find('.recipe-table');
    if ($recipes.length === 0) return methods;

    $recipes.each((_, el) => {
        const $recipe = $(el);
        if (
            options?.ignoreWithinSelectors?.some((selector) => $recipe.closest(selector).length > 0)
        ) {
            return;
        }

        const captionTables = extractCaptionTables($, $recipe);
        if (captionTables.length === 0) return;

        const method = buildMethodFromCaptionTables($, pageTitle, captionTables);
        methods.push(method);
    });

    return methods;
}

function buildMethodsFromTabbers(
    $: cheerio.CheerioAPI,
    pageTitle: string,
    scope: cheerio.Cheerio,
): CreationMethod[] {
    const methods: CreationMethod[] = [];

    const pushTabMethods = ($tab: cheerio.Cheerio, rawMethodName?: string) => {
        const methodName = rawMethodName ? normalizeWhitespace(rawMethodName) : undefined;

        const switchMethods = buildMethodsFromSwitchInfoboxes($, pageTitle, $tab, methodName);
        if (switchMethods.length > 0) {
            methods.push(...switchMethods);
            return;
        }

        const captionTables = extractCaptionTables($, $tab);
        if (captionTables.length === 0) return;

        const method = buildMethodFromCaptionTables($, pageTitle, captionTables, methodName);
        methods.push(method);
    };

    const $tabbers = scope.find('.tabber');
    if ($tabbers.length > 0) {
        $tabbers.each((_, tabberEl) => {
            const $tabber = $(tabberEl);
            let $tabs = $tabber.find('> .tabbertab');

            if ($tabs.length === 0) {
                $tabs = $tabber.children(
                    'div[data-title], div[title], div[data-hash], section[data-title], section[title], section[data-hash]',
                );
            }

            $tabs.each((_, tabEl) => {
                const $tab = $(tabEl);
                const methodName = $tab.attr('data-title') || $tab.attr('title') || $tab.attr('data-hash') || undefined;
                pushTabMethods($tab, methodName);
            });
        });

        return methods;
    }

    const $tabs = scope.find('.tabbertab');
    if ($tabs.length === 0) return methods;

    $tabs.each((_, tabEl) => {
        const $tab = $(tabEl);
        const methodName = $tab.attr('data-title') || $tab.attr('title') || $tab.attr('data-hash') || undefined;
        pushTabMethods($tab, methodName);
    });

    return methods;
}

/**
 * Parse the Requirements table as shown in the Bronze sword snippet.
 * We specifically support the Skill/Level/XP row, and fall back to a
 * generic description for any other rows (Members, Ticks, etc.).
 */
function parseRequirementsTable($: cheerio.CheerioAPI, $table: cheerio.Cheerio): CreationRequirement[] {
    const reqs: CreationRequirement[] = [];
    const $rows = $table.find('tr');
    if ($rows.length === 0) return reqs;

    $rows.slice(1).each((_, row) => {
        const $row = $(row);
        const $cells = $row.find('td');
        if ($cells.length === 0) return;

        const rowText = $row.text().replace(/\s+/g, ' ').trim();
        if (!rowText) return;

        // 1) Skill / level / XP row (Bronze sword, Rune platebody, etc.)
        const skillSpan = $row.find('span[data-skill]').first();
        if (skillSpan.length) {
            const skill = skillSpan.attr('data-skill') || skillSpan.text().trim();

            const levelCell = $cells.eq(1).text();
            const xpCell = $cells.eq(2).text();

            const levelMatch = levelCell.match(/(\d+)/);
            const xpMatch = xpCell.match(/([\d.]+)/);

            const level = levelMatch ? Number(levelMatch[1]) : undefined;
            const xp = xpMatch ? Number(xpMatch[1]) : undefined;

            reqs.push({
                skill,
                level,
                xp,
                description: rowText,
            });
            return;
        }

        // 2) Tools / Facilities row
        const firstTh = $row.find('th').first();
        const heading = firstTh.text().toLowerCase().trim();

        if (heading === 'tools') {
            // Structure is: <th>Tools</th><td>[hammer img]</td><th>Facilities</th><td>[anvil]</td>
            const toolsCell = $cells.eq(0);
            const facilitiesCell = $cells.eq(1);

            const collectNames = ($cell: cheerio.Cheerio): string[] => {
                const names = new Set<string>();

                $cell.find('a').each((_, a) => {
                    const $a = $(a);
                    const raw = $a.attr('title') || $a.text().replace(/\s+/g, ' ').trim();
                    const name = raw.trim();
                    if (name) names.add(name);
                });

                return Array.from(names);
            };

            const toolNames = collectNames(toolsCell);
            const facilityNames = collectNames(facilitiesCell);

            if (toolNames.length) {
                reqs.push({
                    description: `Tools: ${toolNames.join(', ')}`,
                });
            }

            if (facilityNames.length) {
                reqs.push({
                    description: `Facilities: ${facilityNames.join(', ')}`,
                });
            }

            return;
        }

        // 3) Everything else (Members, Ticks, etc.) → generic requirement
        reqs.push({
            description: rowText,
        });
    });

    return reqs;
}

/**
 * Parse a Materials table which uses the pattern:
 *   - first column: image
 *   - second column: item link
 *   - third column: quantity
 *   - fourth column: cost
 * And which may also contain the *product* row plus Total cost / Profit rows.
 *
 * The wiki's recipe template lays the rows out as inputs, then a `Total cost` header row,
 * then the output, then Profit rows — so that header is what separates the two, and it is
 * the only signal that survives a variant panel. Name-based detection cannot: on the
 * "Poison" panel of `Adamant dagger` the *input* is the selflink `Adamant dagger` and the
 * *output* is `Adamant dagger(p)`, which links away to its own redirect page. Reading
 * those by name got the recipe exactly backwards, leaving the poisoned dagger listed as
 * an ingredient of itself.
 *
 * Tables with no `Total cost` row fall back to the original name-based rule.
 */
function parseMaterialsAndInlineProducts(
    $: cheerio.CheerioAPI,
    $table: cheerio.Cheerio,
    pageTitle: string,
): { materials: CreationMaterial[]; products: CreationProduct[] } {
    const materials: CreationMaterial[] = [];
    const products: CreationProduct[] = [];

    const $rows = $table.find('tr');
    if ($rows.length === 0) return { materials, products };

    const isTotalCostRow = ($row: cheerio.Cheerio): boolean => {
        const firstCell = $row.find('td, th').first();
        return firstCell.is('th') && /total cost/.test(firstCell.text().toLowerCase().trim());
    };

    let hasTotalCostRow = false;
    $rows.slice(1).each((_, row) => {
        if (isTotalCostRow($(row))) hasTotalCostRow = true;
    });

    let pastTotalCost = false;

    $rows.slice(1).each((_, row) => {
        const $row = $(row);
        const $cells = $row.find('td, th');
        if ($cells.length === 0) return;

        const firstCell = $cells.first();

        // Skip summary / footer rows like Total cost, Profit, Profit after GE Tax.
        if (firstCell.is('th')) {
            const headerText = firstCell.text().toLowerCase().trim();
            if (/total cost|profit after ge tax|profit/.test(headerText) && headerText.length > 0) {
                if (/total cost/.test(headerText)) pastTotalCost = true;
                return;
            }
        }

        // Find the *real* item cell: first cell whose <a> has visible text.
        let itemCellIndex = -1;
        $cells.each((i) => {
            const $cell = $cells.eq(i);
            const link = $cell.find('a').first();
            const linkText = link.text().replace(/\s+/g, ' ').trim();
            if (linkText) {
                itemCellIndex = i;
                return false; // break
            }
        });

        if (itemCellIndex === -1) {
            // Fallback: assume second column is the item text
            itemCellIndex = 1;
        }

        // On OSRS recipe tables, quantity is almost always immediately
        // after the item text cell: [image][item][quantity][cost]
        let qtyCellIndex = itemCellIndex + 1;
        if (qtyCellIndex >= $cells.length) {
            // Fallback: try the last cell
            qtyCellIndex = $cells.length - 1;
        }

        const $itemCell = $cells.eq(itemCellIndex);
        const $qtyCell = $cells.eq(qtyCellIndex);

        const link = $itemCell.find('a').first();
        const name = (link.text() || $itemCell.text()).replace(/\s+/g, ' ').trim();
        if (!name) return;

        const href = link.attr('href') || undefined;

        const qtyText = $qtyCell
            .text()
            .replace(/[^0-9]/g, '')
            .trim();
        const quantity = qtyText ? Number(qtyText) : 1;

        // Detect if this row represents the product (selflink or same name as page title)
        const selfLink = $itemCell.find('a.mw-selflink').first();

        const normalizedName = name.replace(/\u00a0/g, ' ').trim();
        const normalizedTitle = pageTitle.replace(/\u00a0/g, ' ').trim();

        const nameLower = normalizedName.toLowerCase();
        const titleLower = normalizedTitle.toLowerCase();

        let isNumericParenVariant = false;
        let isUnstrungVariant = false;
        if (nameLower.startsWith(titleLower)) {
            const remainder = nameLower.slice(titleLower.length).trim();
            isUnstrungVariant = remainder === '(u)' || remainder === '(unstrung)';
            isNumericParenVariant = /^\(\d+(?:\s*\/\s*\d+)?\)$/.test(remainder);
        }

        // Position wins where the template provides it: everything above `Total cost` is an
        // input and everything below it is an output, whatever the rows are named.
        // Otherwise treat as product if:
        // - it's the selflink (same page), OR
        // - exact match, OR
        // - it's a numeric dose/charge variant like "prayer potion(3)" or "ring of recoil (8)"
        const isProductRow = hasTotalCostRow
            ? pastTotalCost
            : selfLink.length > 0 || nameLower === titleLower || (isNumericParenVariant && !isUnstrungVariant);

        if (isProductRow) {
            products.push({
                item: { name, href },
                quantity: quantity || 1,
            });
        } else {
            materials.push({
                item: { name, href },
                quantity: quantity || 1,
                consumed: true,
            });
        }
    });

    return { materials, products };
}

/**
 * Parse a Products table (if a page has a separate one under Creation).
 * For now we use a similar strategy: find the item and quantity columns.
 */
function parseProductsTable($: cheerio.CheerioAPI, $table: cheerio.Cheerio): CreationProduct[] {
    const products: CreationProduct[] = [];

    const $rows = $table.find('tr');
    if ($rows.length === 0) return products;

    const $headerCells = $rows.first().find('th, td');
    let itemColIndex = -1;
    let quantityColIndex = -1;

    $headerCells.each((index, cell) => {
        const headerText = $(cell).text().toLowerCase().trim();
        if (/product|item|result|output/.test(headerText) && itemColIndex === -1) {
            itemColIndex = index;
        }
        if (/quantity|qty/.test(headerText) && quantityColIndex === -1) {
            quantityColIndex = index;
        }
    });

    if (itemColIndex === -1) itemColIndex = 1;
    if (quantityColIndex === -1) quantityColIndex = 2;

    $rows.slice(1).each((_, row) => {
        const $row = $(row);
        const $cells = $row.find('td, th');
        if ($cells.length === 0) return;

        const $itemCell = $cells.eq(itemColIndex);
        const $qtyCell = $cells.eq(quantityColIndex);

        const link = $itemCell.find('a').first();
        const name = (link.text() || $itemCell.text()).replace(/\s+/g, ' ').trim();
        if (!name) return;

        const href = link.attr('href');

        const qtyText = $qtyCell
            .text()
            .replace(/[^0-9]/g, '')
            .trim();
        const quantity = qtyText ? Number(qtyText) : 1;

        products.push({
            item: { name, href },
            quantity,
        });
    });

    return products;
}

/**
 * Main parser: from Creation section HTML -> CreationMethod[].
 *
 * We now:
 * - look for tables by <caption> text (Requirements / Materials / Products)
 * - parse skill/level/xp from Requirements
 * - parse materials and inline product rows from Materials
 * - parse standalone Products tables if present
 */
export function parseCreationSectionToMethods(pageTitle: string, creationHtml: string): CreationMethod[] {
    const $ = cheerio.load(creationHtml);

    const methods: CreationMethod[] = [];

    methods.push(...buildMethodsFromTabbers($, pageTitle, $.root()));

    methods.push(
        ...buildMethodsFromSwitchInfoboxes($, pageTitle, $.root(), undefined, {
            ignoreWithinSelectors: ['.tabber'],
        }),
    );

    methods.push(
        ...buildMethodsFromRecipeTables($, pageTitle, $.root(), {
            ignoreWithinSelectors: ['.tabber', '.switch-infobox'],
        }),
    );

    if (methods.length > 0) {
        return methods;
    }

    // Single-method fallback (no structured containers; e.g. rune platebody, prayer potion...)
    const captionTables = extractCaptionTables($);
    if (captionTables.length === 0) {
        return [];
    }

    const single = buildMethodFromCaptionTables($, pageTitle, captionTables);
    return [single];
}

export async function getCreationMethodsForItem(
    pageTitle: string,
    options: { silent?: boolean } = { silent: true },
): Promise<CreationMethod[]> {
    const silent = options.silent ?? true;
    const sectionIndex = await getCreationSectionIndex(pageTitle);
    if (sectionIndex == null) {
        if (!silent) {
            console.log(`⚠️ [creation-importer] No creation section found for page "${pageTitle}".`);
        }
        return [];
    }

    const html = await getCreationSectionHtml(pageTitle, sectionIndex);
    if (!html) {
        if (!silent) {
            console.log(`⚠️ [creation-importer] No creation HTML found for page "${pageTitle}".`);
        }
        return [];
    }

    return parseCreationSectionToMethods(pageTitle, html);
}

// Small runner to exercise the script and log human-readable results.

async function main() {
    const pageTitle = process.argv[2] || 'Bronze sword';

    console.log(`Fetching Creation methods for: ${pageTitle}\n`);

    try {
        const methods = await getCreationMethodsForItem(pageTitle);

        if (methods.length === 0) {
            console.log('No creation methods found.');
            return;
        }

        methods.forEach((method, idx) => {
            console.log(`=== Method #${idx + 1} for ${method.pageTitle} ===`);

            if (method.methodName) {
                console.log(`Method name: ${method.methodName}`);
            }

            console.log('\nRequirements:');
            if (method.requirements.length === 0) {
                console.log('  (none parsed)');
            } else {
                method.requirements.forEach((r) => {
                    const lvl = r.level != null ? `Lvl ${r.level} ` : '';
                    const skill = r.skill ? `${r.skill} ` : '';
                    const xp = r.xp != null ? `(XP: ${r.xp}) ` : '';
                    console.log(`  - ${lvl}${skill}${xp}- ${r.description}`);
                });
            }

            console.log('\nMaterials:');
            if (method.materials.length === 0) {
                console.log('  (none parsed)');
            } else {
                method.materials.forEach((m) => {
                    const toolFlag = m.consumed ? '' : ' (tool)';
                    console.log(`  - ${m.quantity} x ${m.item.name}${toolFlag}`);
                });
            }

            console.log('\nProducts:');
            if (method.products.length === 0) {
                console.log('  (none parsed)');
            } else {
                method.products.forEach((p) => {
                    console.log(`  - ${p.quantity} x ${p.item.name}`);
                });
            }

            console.log('\n---------------------------------------------\n');
        });
    } catch (err) {
        console.error('Error while fetching or parsing Creation data:', err);
    }
}

if (require.main === module) {
    // Run only when executed directly: `ts-node osrs-wiki-creation-scraper.ts "Bronze sword"`
    // or after compilation: `node osrs-wiki-creation-scraper.js "Bronze sword"`
    void main();
}
