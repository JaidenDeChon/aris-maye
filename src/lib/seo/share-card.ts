import { skillLabel } from '$lib/helpers/homepage';
import type { ItemUsedIn } from '$lib/models/item-used-in';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
import { hasRecipe, recipeFacts } from './item-facts';

/** A run of text in the card's sentence. `strong` runs are drawn in gold, like "craft, smith" on the homepage card. */
export type ShareCardSegment = { text: string; strong?: boolean };

/** What an item's share image says. The layout lives in `src/lib/server/og`. */
export type ShareCard = {
    name: string;
    sentence: ShareCardSegment[];
    chips: string[];
    alt: string;
};

function membershipChip(item: Pick<IOsrsboxItemWithMeta, 'members'>): string {
    return item.members ? 'Members' : 'Free-to-play';
}

function recipeCount(total: number): string {
    return total === 1 ? '1 recipe' : `${total.toLocaleString('en-US')} recipes`;
}

/** Skills of the recipes an item goes into, most common first, so an ore reads "Smithing" before "Crafting". */
function usedInSkills(usedIn: ItemUsedIn): string[] {
    const counts = new Map<string, number>();
    for (const recipe of usedIn.items) {
        if (!recipe.skill) continue;
        const label = skillLabel(recipe.skill);
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([skill]) => skill);
}

function recipeCard(item: IOsrsboxItemWithMeta): ShareCard {
    const { skill, level, xp } = recipeFacts(item);
    const requirement = skill && level !== null ? `${skill} ${level}` : null;

    const sentence: ShareCardSegment[] = requirement
        ? [{ text: 'Make it with ' }, { text: requirement, strong: true }]
        : [{ text: 'See how to make it' }];
    if (xp) sentence.push({ text: ' for ' }, { text: xp, strong: true });
    sentence.push({ text: '. Ingredient costs and profit from hourly GE prices.' });

    return {
        name: item.name,
        sentence,
        chips: [requirement, xp, membershipChip(item)].filter((chip): chip is string => chip !== null),
        alt: requirement
            ? `${item.name}: an OSRS ${requirement} recipe. Costs and profit on Aris Maye.`
            : `${item.name}: an OSRS recipe. Costs and profit on Aris Maye.`,
    };
}

function ingredientCard(item: IOsrsboxItemWithMeta, usedIn: ItemUsedIn): ShareCard {
    const [first, second] = usedIn.items.map((recipe) => recipe.name);
    const sentence: ShareCardSegment[] = [{ text: 'Used in ' }, { text: recipeCount(usedIn.total), strong: true }];
    if (first && usedIn.total === 1) {
        sentence.splice(0, 2, { text: 'Used to make ' }, { text: first, strong: true });
    } else if (first) {
        sentence.push({ text: ', including ' }, { text: first, strong: true });
        if (second) sentence.push({ text: ' and ' }, { text: second, strong: true });
    }
    sentence.push({ text: '. See its GE price and what you can make with it.' });

    return {
        name: item.name,
        sentence,
        chips: [...usedInSkills(usedIn).slice(0, 3), membershipChip(item)],
        alt: `${item.name}: used in ${recipeCount(usedIn.total)} in OSRS. Price and uses on Aris Maye.`,
    };
}

function priceCard(item: IOsrsboxItemWithMeta): ShareCard {
    return {
        name: item.name,
        sentence: [
            { text: 'Grand Exchange price, ' },
            { text: 'high and low alch', strong: true },
            { text: ' values, updated hourly.' },
        ],
        chips: [membershipChip(item)],
        alt: `${item.name}: OSRS Grand Exchange price and alch values on Aris Maye.`,
    };
}

/**
 * The card for an item page's share image. It follows the same three cases as the page's title
 * (`buildItemSeo`), but noted and placeholder copies get the real item's card too: a share image
 * isn't a search result, so there's nothing to deduplicate.
 */
export function buildItemShareCard(item: IOsrsboxItemWithMeta, usedIn: ItemUsedIn): ShareCard {
    if (hasRecipe(item)) return recipeCard(item);
    if (usedIn.total > 0) return ingredientCard(item, usedIn);
    return priceCard(item);
}
