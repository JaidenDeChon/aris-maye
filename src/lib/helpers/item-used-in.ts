import { EMPTY_USED_IN, USED_IN_LIMIT, type ItemUsedIn, type UsedInRecipe } from '$lib/models/item-used-in';

/** The slice of an item document the "Used in" query reads. */
export type RecipeDoc = {
    id: number;
    name: string;
    icon?: string | null;
    creationSpecs?: Array<{
        requiredSkills?: Array<{ skillName?: string; skillLevel?: number }>;
        ingredients?: Array<{ item: unknown }>;
    }>;
};

export function toUsedInRecipe(doc: RecipeDoc, ingredientId: string): UsedInRecipe {
    const specs = doc.creationSpecs ?? [];
    // An item can have several recipes; the level that matters is the one for the recipe that
    // takes this ingredient.
    const spec = specs.find((s) => s.ingredients?.some((i) => String(i.item) === ingredientId)) ?? specs[0];
    const requirement = spec?.requiredSkills?.find((r) => r.skillName && typeof r.skillLevel === 'number');
    return {
        id: doc.id,
        name: doc.name,
        icon: doc.icon ?? null,
        skill: requirement?.skillName ?? null,
        level: requirement?.skillLevel ?? null,
    };
}

function compareUsedIn(a: UsedInRecipe, b: UsedInRecipe): number {
    if (a.level === null && b.level !== null) return 1;
    if (b.level === null && a.level !== null) return -1;
    if (a.level !== b.level) return (a.level ?? 0) - (b.level ?? 0);
    return a.name.localeCompare(b.name);
}

export function buildUsedIn(docs: RecipeDoc[], ingredientId: string, limit = USED_IN_LIMIT): ItemUsedIn {
    const seen = new Set<number>();
    const rows: UsedInRecipe[] = [];
    for (const doc of docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        rows.push(toUsedInRecipe(doc, ingredientId));
    }
    rows.sort(compareUsedIn);
    return { items: rows.slice(0, limit), total: rows.length };
}

/**
 * "Used in" is extra. If it fails, the item page should still load with it left out, rather than
 * the whole item failing with it.
 */
export async function loadUsedInSafely(load: () => Promise<ItemUsedIn>): Promise<ItemUsedIn> {
    try {
        return await load();
    } catch (error) {
        console.error('Failed to load "Used in" recipes', error);
        return { ...EMPTY_USED_IN, items: [] };
    }
}
