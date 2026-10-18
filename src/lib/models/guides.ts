/**
 * What each guide page shows. See `docs/superpowers/specs/2026-10-17-evergreen-guides-design.md`.
 */
import type { HomepageAlchPick, HomepageCheapXp, HomepageItem, HomepageShopSale } from './homepage';

/** An item on the market report, with the gold that changed hands for it in the last day. */
export type MarketItem = HomepageItem & {
    /** `volume24h` times `typicalPrice24h`. */
    gpTraded24h: number | null;
};

export type MarketSummary = {
    /** GP traded on the GE in the last day, across every tradeable item. */
    gpTraded24h: number;
    /** Items above the movers floor whose price went up, and down, over the day. */
    rising: number;
    falling: number;
    /** The middle price change among those items, as a ratio. Null when there are none. */
    medianChange: number | null;
};

export type MarketReport = {
    /** Milliseconds since the epoch. */
    computedAt: number;
    /** How many hours of trade history the hourly job has stored, up to a day. */
    historyHours: number;
    summary: MarketSummary;
    risers: MarketItem[];
    fallers: MarketItem[];
    mostTradedByGp: MarketItem[];
    mostTradedByCount: MarketItem[];
};

export type HighAlchGuide = {
    computedAt: number;
    /** What one nature rune costs on the GE right now. */
    natureRunePrice: number;
    picks: HomepageAlchPick[];
};

/** One way to get XP in a skill by making something. */
export type XpMethod = {
    item: HomepageItem;
    /** The level the skill needs, or 1 when the recipe lists none. */
    level: number;
    /** XP for making one. */
    xp: number;
    /** What each XP costs. Zero when making it turns a profit. */
    gpPerXp: number;
};

export type XpBand = { min: number; max: number; rows: XpMethod[] };

export type CheapestXpGuide = {
    computedAt: number;
    skills: { skill: string; bands: XpBand[] }[];
};

export type IronmanGuide = {
    computedAt: number;
    /** What one nature rune costs from the cheapest shop. */
    natureRunePrice: number;
    shopSales: HomepageShopSale[];
    shopSupplied: HomepageItem[];
    craftToAlch: HomepageItem[];
    cheapXp: HomepageCheapXp[];
};
