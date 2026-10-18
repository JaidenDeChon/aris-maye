import type { XpGuideSkill } from '$lib/constants/guides';
import type { PageSeo } from './page-seo';

/**
 * Search titles and descriptions for the guide pages. None of them carries a live figure: search
 * engines keep a snippet for weeks, and the numbers change every hour.
 */

export const guidesHubSeo: PageSeo = {
    title: 'OSRS Money Making & Training Guides · Aris Maye',
    description:
        'Guides to making money and training skills in OSRS, built from live Grand Exchange and shop prices and updated every hour.',
    canonicalPath: '/guides',
    robots: 'index',
};

export function buildMarketSeo(image?: string, imageAlt?: string): PageSeo {
    return {
        title: "OSRS GE Market Report: Today's Biggest Risers & Fallers",
        description:
            'Which OSRS items rose and fell most on the Grand Exchange today, and what traded most, from live prices updated hourly.',
        canonicalPath: '/guides/market',
        robots: 'index',
        ...(image ? { image, imageAlt } : {}),
    };
}

export const highAlchSeo: PageSeo = {
    title: 'OSRS High Alch Profit List: Best Items to Alch',
    description:
        'The most profitable OSRS items to buy and high alch right now, after the nature rune, with buy limits and how often each trades.',
    canonicalPath: '/guides/high-alch',
    robots: 'index',
};

export const cheapestXpSeo: PageSeo = {
    title: 'Cheapest XP in OSRS: GP per XP for Every Skill',
    description:
        'The cheapest way to train each OSRS production skill by making things, ranked by GP per XP from live GE prices.',
    canonicalPath: '/guides/cheapest-xp',
    robots: 'index',
};

export function buildCheapestXpSkillSeo(skill: XpGuideSkill): PageSeo {
    return {
        title: `Cheapest OSRS ${skill.title} XP: GP per XP by Level`,
        description: `The cheapest ${skill.title} training in OSRS at every level, ranked by GP per XP from live Grand Exchange prices, updated hourly.`,
        // The route matches any casing, so the slug, not the URL, decides the canonical.
        canonicalPath: `/guides/cheapest-xp/${skill.slug}`,
        robots: 'index',
    };
}

export const ironmanSeo: PageSeo = {
    title: 'OSRS Ironman Money Making: Shops, Alching & Crafting',
    description:
        'Ways to make money on an OSRS Ironman without the Grand Exchange: selling to shops that pay well, making things from shop stock and alching.',
    canonicalPath: '/guides/ironman-money-making',
    robots: 'index',
};
