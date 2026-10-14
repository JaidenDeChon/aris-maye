/** What's needed to choose between items that share a name. */
export type PrimaryCandidate = {
    id: number;
    tradeable_on_ge?: boolean | null;
};

/**
 * Several items can share a name (lit and unlit lanterns, minigame copies of potions). Their
 * pages would all carry the same title and compete in search results, so only one is indexed:
 * the one on the Grand Exchange, then the lowest id. Live prices are left out on purpose: they
 * change hourly, and a choice that followed them could flip a page Google just read from the
 * sitemap to noindex.
 */
export function pickPrimaryItemId(candidates: PrimaryCandidate[]): number {
    const ranked = [...candidates].sort(
        (a, b) => Number(b.tradeable_on_ge === true) - Number(a.tradeable_on_ge === true) || a.id - b.id,
    );
    return ranked[0].id;
}

/** The ids left after keeping one item per name, sorted ascending. */
export function keepOnePerName(items: Array<PrimaryCandidate & { name: string }>): number[] {
    const byName = new Map<string, PrimaryCandidate[]>();
    for (const item of items) byName.set(item.name, [...(byName.get(item.name) ?? []), item]);
    return [...byName.values()].map(pickPrimaryItemId).sort((a, b) => a - b);
}
