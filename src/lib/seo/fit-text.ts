export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 160;

/**
 * Shortens text to `max` characters at a word boundary, ending in an ellipsis. Search engines cut
 * long titles themselves, mid-word; cutting them here first means we choose what goes.
 */
export function truncateAtWord(text: string, max: number): string {
    if (text.length <= max) return text;
    const room = text.slice(0, max - 1);
    const lastSpace = room.lastIndexOf(' ');
    const kept = lastSpace > 0 ? room.slice(0, lastSpace) : room;
    return `${kept.replace(/[\s,:;&-]+$/, '')}…`;
}

/**
 * Picks the first candidate that fits. Callers list their phrasings from fullest to barest, so a
 * long item name drops whole clauses rather than being cut off.
 */
export function firstThatFits(candidates: string[], max: number): string {
    for (const candidate of candidates) {
        if (candidate.length <= max) return candidate;
    }
    return truncateAtWord(candidates[candidates.length - 1] ?? '', max);
}
