import { XP_LEVEL_BANDS } from '$lib/constants/guides';
import type { HomepageAlchPick } from '$lib/models/homepage';
import type { CheapestXpGuide, MarketSummary, XpMethod } from '$lib/models/guides';

/** The level range a method belongs to. A missing level counts as 1, and anything past 99 as 99. */
export function levelBand(level: number | null | undefined): (typeof XP_LEVEL_BANDS)[number] {
    const value = typeof level === 'number' && Number.isFinite(level) ? level : 1;
    return XP_LEVEL_BANDS.find((band) => value <= band.max) ?? XP_LEVEL_BANDS[XP_LEVEL_BANDS.length - 1];
}

/** The middle value, or the mean of the middle two. Null for an empty list. */
export function median(values: number[]): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** How many of the day's price changes went up and down, and the middle one. */
export function summarizeChanges(changes: number[]): Omit<MarketSummary, 'gpTraded24h'> {
    return {
        rising: changes.filter((change) => change > 0).length,
        falling: changes.filter((change) => change < 0).length,
        medianChange: median(changes),
    };
}

export type AlchSort = 'cast' | 'limit';

/** Profit from alching a full buy limit's worth every 4 hours. Null when the item has no limit. */
export function alchPerLimit(pick: HomepageAlchPick): number | null {
    return pick.item.buyLimit ? pick.profit * pick.item.buyLimit : null;
}

/** High alch picks ranked by profit per cast, or per 4-hour buy limit. Returns a new array. */
export function sortAlchPicks(picks: HomepageAlchPick[], sort: AlchSort): HomepageAlchPick[] {
    const score = (pick: HomepageAlchPick) => (sort === 'cast' ? pick.profit : (alchPerLimit(pick) ?? -Infinity));
    return [...picks].sort((a, b) => score(b) - score(a) || a.item.name.localeCompare(b.item.name));
}

/**
 * What each XP really costs: positive when making the item loses money, negative when it pays.
 * `gpPerXp` stops at zero, so it can't tell a method that pays 1 gp apart from one that pays 300.
 */
export function netCostPerXp(method: Pick<XpMethod, 'item' | 'xp'>): number {
    return -(method.item.creationProfit ?? 0) / method.xp;
}

/**
 * Cheapest XP first. Every method that pays counts as free, and among those the most XP each wins,
 * the same rule as the homepage. Ranking by what a method pays instead would turn a training list
 * into a money-making one, led by things like a 3rd age axe that pays a fortune for 5 XP.
 */
export function compareXpMethods(a: XpMethod, b: XpMethod): number {
    return a.gpPerXp - b.gpPerXp || b.xp - a.xp || a.item.name.localeCompare(b.item.name);
}

/** Each skill's single cheapest method across its level bands, for the cheapest-XP overview. */
export function cheapestPerSkill(guide: CheapestXpGuide): { skill: string; method: XpMethod }[] {
    const result: { skill: string; method: XpMethod }[] = [];
    for (const { skill, bands } of guide.skills) {
        const best = bands.flatMap((band) => band.rows).sort(compareXpMethods)[0];
        if (best) result.push({ skill, method: best });
    }
    return result;
}
