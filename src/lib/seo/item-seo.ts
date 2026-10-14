import { getPrimaryCreationSpec } from '$lib/helpers/creation-specs';
import { skillLabel } from '$lib/helpers/homepage';
import { EMPTY_USED_IN, type ItemUsedIn } from '$lib/models/item-used-in';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
import { DESCRIPTION_MAX, TITLE_MAX, firstThatFits } from './fit-text';
import type { PageSeo } from './page-seo';

type ItemPageState = {
    itemId: string;
    gameItem: IOsrsboxItemWithMeta | null;
    loadProblem: 'missing' | 'failed' | null;
};

export function hasRecipe(item: Pick<IOsrsboxItemWithMeta, 'creationSpecs'>): boolean {
    return (item.creationSpecs?.length ?? 0) > 0;
}

type IndexableFields = Pick<
    IOsrsboxItemWithMeta,
    'id' | 'creationSpecs' | 'noted' | 'placeholder' | 'duplicate' | 'sameNamePrimaryId'
>;

/** True when another item with the same name is the one indexed (see `pickPrimaryItemId`). */
function isSecondaryForName(item: Pick<IOsrsboxItemWithMeta, 'id' | 'sameNamePrimaryId'>): boolean {
    return item.sameNamePrimaryId != null && item.sameNamePrimaryId !== item.id;
}

/**
 * Noted, placeholder and duplicate copies of an item carry the real item's recipes. Indexing them
 * would put several identical pages per item in search results.
 */
export function isItemCopy(item: Pick<IOsrsboxItemWithMeta, 'noted' | 'placeholder' | 'duplicate'>): boolean {
    return item.noted === true || item.placeholder === true || item.duplicate === true;
}

/**
 * The only rule for whether an item page belongs in search results. The sitemap query selects
 * the same set (`INDEXABLE_ITEM_FILTER` in the item service), so the two must change together.
 */
export function isIndexableItem(item: IndexableFields, usedInTotal: number): boolean {
    if (isItemCopy(item) || isSecondaryForName(item)) return false;
    return hasRecipe(item) || usedInTotal > 0;
}

function formatXp(amount: number): string {
    return amount.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function recipeFacts(item: IOsrsboxItemWithMeta) {
    const spec = getPrimaryCreationSpec(item);
    const requirement = spec?.requiredSkills?.find(
        (req) => req.skillName && typeof req.skillLevel === 'number' && Number.isFinite(req.skillLevel),
    );
    const xp = spec?.experienceGranted?.find(
        (grant) => grant.skillName && typeof grant.experienceAmount === 'number' && grant.experienceAmount > 0,
    );
    return {
        skill: requirement ? skillLabel(requirement.skillName) : null,
        level: requirement?.skillLevel ?? null,
        xp: xp ? `${formatXp(xp.experienceAmount)} ${skillLabel(xp.skillName)} XP` : null,
    };
}

function recipeSeo(item: IOsrsboxItemWithMeta, path: string): PageSeo {
    const { name } = item;
    const { skill, level, xp } = recipeFacts(item);
    const skillTail = skill && level !== null ? `: OSRS ${skill} ${level}` : '';
    const needs = skill && level !== null ? `: needs ${skill} ${level}` : '';
    const gives = xp ? `, gives ${xp}` : '';
    const lead = `How to make ${name} in OSRS${needs}${gives}.`;

    return {
        title: firstThatFits(
            [`${name} Profit & Recipe${skillTail}`, `${name} Profit & Recipe`, `${name} Profit`],
            TITLE_MAX,
        ),
        description: firstThatFits(
            [
                `${lead} See ingredient costs and profit from live GE prices, updated hourly.`,
                `${lead} See costs and profit from live GE prices.`,
                lead,
            ],
            DESCRIPTION_MAX,
        ),
        canonicalPath: path,
        robots: 'index',
    };
}

function ingredientSeo(item: IOsrsboxItemWithMeta, usedIn: ItemUsedIn, path: string): PageSeo {
    const { name } = item;
    const [first, second] = usedIn.items.map((recipe) => recipe.name);
    const tail = ' See its live GE price and what you can make with it.';

    // A single use reads better named outright than as "1 recipes, including ...".
    const candidates =
        usedIn.total === 1 && first
            ? [`${name} is used to make ${first} in OSRS.${tail}`, `${name} is used to make ${first} in OSRS.`]
            : [
                  `${name} is used in ${usedIn.total} OSRS recipes, including ${second ? `${first} and ${second}` : first}.${tail}`,
                  `${name} is used in ${usedIn.total} OSRS recipes.${tail}`,
                  `${name} is used in ${usedIn.total} OSRS recipes.`,
              ];

    return {
        title: firstThatFits([`${name}: OSRS Price & What You Can Make With It`, `${name}: OSRS Price`], TITLE_MAX),
        description: firstThatFits(candidates, DESCRIPTION_MAX),
        canonicalPath: path,
        robots: 'index',
    };
}

function priceOnlySeo(item: IOsrsboxItemWithMeta, path: string): PageSeo {
    const { name } = item;
    return {
        title: firstThatFits([`${name}: OSRS GE Price`], TITLE_MAX),
        description: firstThatFits(
            [
                `${name} in OSRS: live Grand Exchange price, high and low alch values and base value, updated hourly.`,
                `${name}: live OSRS Grand Exchange price and alch values.`,
            ],
            DESCRIPTION_MAX,
        ),
        canonicalPath: path,
        robots: 'noindex',
    };
}

export function buildItemSeo(item: IOsrsboxItemWithMeta, usedIn: ItemUsedIn): PageSeo {
    const path = `/items/${item.id}`;
    if (isItemCopy(item) || isSecondaryForName(item)) return priceOnlySeo(item, path);
    if (hasRecipe(item)) return recipeSeo(item, path);
    if (usedIn.total > 0) return ingredientSeo(item, usedIn, path);
    return priceOnlySeo(item, path);
}

export function buildItemNotFoundSeo(path: string): PageSeo {
    return {
        title: 'Item not found · Aris Maye',
        description:
            "We couldn't find that item. Browse OSRS items to see live GE prices, recipes and profit for everything you can make.",
        canonicalPath: path,
        robots: 'noindex',
    };
}

export function buildItemLoadingSeo(path: string): PageSeo {
    return {
        title: 'Loading item · Aris Maye',
        description: 'Live OSRS Grand Exchange prices, recipes and profit for this item, updated hourly.',
        canonicalPath: path,
        robots: 'noindex',
    };
}

/**
 * What the item page says about itself at any moment. The item kept in state can still be the
 * previous one while a client-side navigation loads the next, so it only counts once its id
 * matches the route.
 */
export function itemPageSeo({ itemId, gameItem, loadProblem }: ItemPageState): PageSeo {
    const path = `/items/${itemId}`;
    if (loadProblem) return buildItemNotFoundSeo(path);
    if (!gameItem || String(gameItem.id) !== String(itemId)) return buildItemLoadingSeo(path);
    return buildItemSeo(gameItem, gameItem.usedIn ?? EMPTY_USED_IN);
}
