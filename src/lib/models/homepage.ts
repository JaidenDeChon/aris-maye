/**
 * The numbers behind the homepage sections. See `docs/homepage-plan.md` for what each one means.
 */

/** One item as a homepage section shows it: enough to draw a tile and link to its page. */
export type HomepageItem = {
    id: number;
    name: string;
    icon: string;
    highPrice: number | null;
    lowPrice: number | null;
    buyLimit: number | null;
    creationCost: number | null;
    creationProfit: number | null;
    creationRoi: number | null;
    ironmanExitValue: number | null;
    /** How many a main can make every 4 hours before an ingredient's GE buy limit stops them. */
    craftsPerLimit: number | null;
    /** Profit times `craftsPerLimit`: the most a main can clear from it every 4 hours. */
    gpPerLimit: number | null;
    /** Traded on the GE in the last hour. */
    volume1h: number | null;
    /** Traded on the GE in the last day. */
    volume24h: number | null;
    /** Price change over the last day as a ratio (0.05 is +5%). */
    priceChange24h: number | null;
};

/** The most profitable thing to make that uses a given skill. */
export type HomepageSkillEarner = {
    skill: string;
    item: HomepageItem;
};

/** The cheapest way to get XP in a skill by making something. */
export type HomepageCheapXp = {
    skill: string;
    item: HomepageItem;
    /** XP for making one. */
    xp: number;
    /** What each XP costs. Zero when making the item turns a profit. */
    gpPerXp: number;
};

/** Something worth buying on the GE to cast High Level Alchemy on. */
export type HomepageAlchPick = {
    item: HomepageItem;
    /** High alch value less the GE buy price and a nature rune. */
    profit: number;
    /** What one costs to buy right now. */
    buyPrice: number;
    highalch: number;
};

/** What's trading on the GE. See "Market pulse" in `docs/homepage-plan.md`. */
export type HomepageMarketPulse = {
    /**
     * How many hours of trade history the hourly job has collected, up to a day. Most traded needs
     * one; risers and fallers need a day, and show a "coming soon" state until then.
     */
    historyHours: number;
    /** Hours of history risers and fallers need. */
    hoursNeeded: number;
    mostTraded: HomepageItem[];
    risers: HomepageItem[];
    fallers: HomepageItem[];
};

/** Somewhere an Ironman can sell an item for more than it alchs for. */
export type HomepageShopSale = {
    item: HomepageItem;
    shop: string;
    /** What the shop pays for the first one. */
    firstPrice: number;
    /** The least it pays once overstocked. */
    floorPrice: number;
    /** How many sales until the price bottoms out, or null when it never drops. */
    salesToFloor: number | null;
    /** What one alchs for after the nature rune, for comparison. 0 when it can't be alched. */
    alchValue: number;
};

/**
 * Money-makers for accounts that can't use the GE. See "Ironman corner" in `docs/homepage-plan.md`.
 * Built for every visitor; an Ironman profile sees it first.
 */
export type HomepageIronmanCorner = {
    shopSales: HomepageShopSale[];
    /**
     * Creations whose every ingredient a shop sells. `creationCost` is what those ingredients cost
     * from shops and `creationProfit` what's left after alching the result.
     */
    shopSupplied: HomepageItem[];
    /** The best creations valued by alch on both sides, as an Ironman's profit pipeline sees them. */
    craftToAlch: HomepageItem[];
    /** Cheapest XP per skill, counted in alch value lost. */
    cheapXp: HomepageCheapXp[];
};

/** Every global homepage section, computed in one go and cached. */
export type HomepageSnapshot = {
    ironman: boolean;
    /** Milliseconds since the epoch. */
    computedAt: number;
    natureRunePrice: number;
    topProfit: HomepageItem[];
    topRoi: HomepageItem[];
    topGpPerLimit: HomepageItem[];
    skillEarners: HomepageSkillEarner[];
    cheapXp: HomepageCheapXp[];
    alchPicks: HomepageAlchPick[];
    /** Null for Ironmen, who can't trade on the GE. */
    marketPulse: HomepageMarketPulse | null;
    ironmanCorner: HomepageIronmanCorner;
};

/** A skill the player is short in for an item they have almost unlocked. */
export type HomepageShortfall = {
    skill: string;
    need: number;
    have: number;
};

/** An item the player could make with a few more levels. */
export type HomepageAlmostUnlocked = {
    item: HomepageItem;
    shortfalls: HomepageShortfall[];
};
