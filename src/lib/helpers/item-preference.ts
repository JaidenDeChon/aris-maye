/**
 * Chooses which document represents an item when several share the same name.
 *
 * The OSRSBox dataset stores one document per in-game item id, and a single name can
 * cover many ids: "Acorn" exists as ids 5111-5114 (all flagged `duplicate`), the real
 * tradeable item 5312, and a bank placeholder 13759. Only 5312 has a Grand Exchange
 * market, so it is the only one that can be priced.
 *
 * Ingredient resolution used to take whichever document happened to come first — by
 * `_id` in the lookup map, by natural order in the `findOne` fallback — which handed
 * back the unpriced duplicate and made anything crafted from it look free. Selection is
 * ranked instead, so the canonical document wins regardless of storage order.
 */

/** The subset of an item document that determines how canonical it is. */
export interface PreferableItem {
    id?: number | null;
    /** OSRSBox marks redundant ids for the same in-game item with this. */
    duplicate?: boolean | null;
    /** Bank placeholders are never a real item. */
    placeholder?: boolean | null;
    /** A bank note is not the item it stands for. */
    noted?: boolean | null;
    /** Only GE-tradeable documents carry a market price. */
    tradeable_on_ge?: boolean | null;
}

/**
 * Penalty weights, worst first. The values are powers of two so the comparison is
 * lexicographic: no combination of lesser faults can outweigh a greater one. A
 * duplicate is therefore never chosen over a canonical document, however untradeable
 * that canonical document happens to be.
 */
const PENALTY_DUPLICATE = 8;
const PENALTY_PLACEHOLDER = 4;
const PENALTY_NOTED = 2;
const PENALTY_NOT_TRADEABLE = 1;

/**
 * Scores how poorly a document represents its name. Lower is better; 0 is a canonical,
 * unnoted, non-placeholder item with a GE market.
 *
 * Absent flags count as "not set" rather than true, so a sparse document is treated as
 * canonical instead of being penalised for fields it never had.
 * @param item - The item document to score.
 * @returns The penalty score, where lower is more canonical.
 */
export function itemPreferenceRank(item: PreferableItem): number {
    let rank = 0;

    if (item.duplicate === true) rank += PENALTY_DUPLICATE;
    if (item.placeholder === true) rank += PENALTY_PLACEHOLDER;
    if (item.noted === true) rank += PENALTY_NOTED;
    if (item.tradeable_on_ge !== true) rank += PENALTY_NOT_TRADEABLE;

    return rank;
}

/**
 * Picks the document that best represents the item shared by all the candidates.
 *
 * Ties break on the lowest in-game id, so the result does not depend on the order the
 * documents came out of the database. Every name in the dataset has at least one
 * non-duplicate document, but the ranking still degrades gracefully if that stops being
 * true: it returns the least-bad candidate rather than nothing.
 * @param items - Candidate documents that share a name.
 * @returns The preferred document, or null when given no candidates.
 */
export function pickPreferredItem<T extends PreferableItem>(items: readonly T[]): T | null {
    let best: T | null = null;
    let bestRank = Number.POSITIVE_INFINITY;

    for (const item of items) {
        const rank = itemPreferenceRank(item);

        if (rank < bestRank) {
            best = item;
            bestRank = rank;
            continue;
        }

        if (rank === bestRank && best) {
            const bestId = best.id ?? Number.POSITIVE_INFINITY;
            const candidateId = item.id ?? Number.POSITIVE_INFINITY;
            if (candidateId < bestId) best = item;
        }
    }

    return best;
}
