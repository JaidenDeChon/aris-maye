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
