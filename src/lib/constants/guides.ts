/**
 * The guide pages under `/guides`. See `docs/superpowers/specs/2026-10-17-evergreen-guides-design.md`.
 */

/**
 * Bump whenever a guide snapshot's shape changes. Every deploy preview reads the same
 * `osrsbox-dev` database, so each version reads and writes its own documents.
 */
export const GUIDE_SNAPSHOT_VERSION = 1;

export const GUIDE_SNAPSHOT_COLLECTION = 'guide-snapshots';

/**
 * The skills with a cheapest-XP page. A fixed list rather than one worked out from the data, so the
 * sitemap can't change from hour to hour. Each has methods in at least three level bands when
 * valued from GE prices (`scripts/verify-guides.ts` checks). Farming (three tradeable composts) and
 * Firemaking (pyre logs, with no Firemaking level in the data) are too thin for a page, and the
 * gathering skills have almost no creations at all.
 */
export const XP_GUIDE_SKILLS = [
    { slug: 'construction', title: 'Construction' },
    { slug: 'cooking', title: 'Cooking' },
    { slug: 'crafting', title: 'Crafting' },
    { slug: 'fletching', title: 'Fletching' },
    { slug: 'herblore', title: 'Herblore' },
    { slug: 'magic', title: 'Magic' },
    { slug: 'runecrafting', title: 'Runecrafting' },
    { slug: 'smithing', title: 'Smithing' },
] as const;

export type XpGuideSkill = (typeof XP_GUIDE_SKILLS)[number];

export function findXpGuideSkill(slug: string | null | undefined): XpGuideSkill | undefined {
    const normalized = (slug ?? '').trim().toLowerCase();
    return XP_GUIDE_SKILLS.find((skill) => skill.slug === normalized);
}

/**
 * The level ranges a cheapest-XP page groups methods into. Without them the cheapest list would
 * be nothing but level 1 methods.
 */
export const XP_LEVEL_BANDS = [
    { min: 1, max: 19 },
    { min: 20, max: 39 },
    { min: 40, max: 59 },
    { min: 60, max: 79 },
    { min: 80, max: 99 },
] as const;

/** How many rows each guide table shows. */
export const GUIDE_ROWS = { market: 25, highAlch: 50, xpPerBand: 8, ironman: 25 } as const;

export type GuideKey = 'market' | 'high-alch' | 'cheapest-xp' | 'ironman';

export const GUIDE_KEYS: GuideKey[] = ['market', 'high-alch', 'cheapest-xp', 'ironman'];

export type GuidePath = '/guides/market' | '/guides/high-alch' | '/guides/cheapest-xp' | '/guides/ironman-money-making';

export type GuidePage = { key: GuideKey; path: GuidePath; title: string; blurb: string };

/** The guides, for the hub, the sidebar and "Related guides". */
export const GUIDE_PAGES: GuidePage[] = [
    {
        key: 'market',
        path: '/guides/market',
        title: 'GE market report',
        blurb: 'What rose, what fell and what traded most on the Grand Exchange today.',
    },
    {
        key: 'high-alch',
        path: '/guides/high-alch',
        title: 'High alch profit list',
        blurb: 'Items you can buy and high alch for a profit, after paying for the nature rune.',
    },
    {
        key: 'cheapest-xp',
        path: '/guides/cheapest-xp',
        title: 'Cheapest XP',
        blurb: 'The cheapest way to train each production skill, at every level.',
    },
    {
        key: 'ironman',
        path: '/guides/ironman-money-making',
        title: 'Ironman money making',
        blurb: 'Ways to make money without the Grand Exchange: shops, shop-bought crafts and alching.',
    },
];
