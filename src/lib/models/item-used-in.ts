/** One recipe an item goes into, as listed in the item page's "Used in" card. */
export type UsedInRecipe = {
    id: number;
    name: string;
    icon: string | null;
    /** From the spec that uses the ingredient, so a multi-recipe item shows the relevant level. */
    skill: string | null;
    level: number | null;
};

/**
 * `total` counts every recipe, while `items` is capped at `USED_IN_LIMIT`, so tools like a
 * hammer can say how many recipes they're in without sending hundreds of rows.
 */
export type ItemUsedIn = {
    items: UsedInRecipe[];
    total: number;
};

export const USED_IN_LIMIT = 50;

export const EMPTY_USED_IN: ItemUsedIn = { items: [], total: 0 };
