/** What's needed to choose between items that share a name. */
export type PrimaryCandidate = {
    id: number;
    tradeable_on_ge?: boolean | null;
    highPrice?: number | null;
    lowPrice?: number | null;
};

function hasLivePrice(item: PrimaryCandidate): boolean {
    return (item.highPrice ?? 0) > 0 || (item.lowPrice ?? 0) > 0;
}

/**
 * Several items can share a name (lit and unlit lanterns, minigame copies of potions). Their
 * pages would all carry the same title and compete in search results, so only one is indexed:
 * the one on the Grand Exchange, then the one with a live price, then the lowest id.
 */
export function pickPrimaryItemId(candidates: PrimaryCandidate[]): number {
    const ranked = [...candidates].sort(
        (a, b) =>
            Number(b.tradeable_on_ge === true) - Number(a.tradeable_on_ge === true) ||
            Number(hasLivePrice(b)) - Number(hasLivePrice(a)) ||
            a.id - b.id,
    );
    return ranked[0].id;
}

/** The ids left after keeping one item per name, sorted ascending. */
export function keepOnePerName(items: Array<PrimaryCandidate & { name: string }>): number[] {
    const byName = new Map<string, PrimaryCandidate[]>();
    for (const item of items) byName.set(item.name, [...(byName.get(item.name) ?? []), item]);
    return [...byName.values()].map(pickPrimaryItemId).sort((a, b) => a - b);
}
