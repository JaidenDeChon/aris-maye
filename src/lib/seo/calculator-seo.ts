import type { XpGuideSkill } from '$lib/constants/guides';
import type { PageSeo } from './page-seo';

/**
 * Search titles and descriptions for the calculators. None carries a live figure, and the
 * canonical never carries the goal in the query: every goal is the same page to a search engine.
 */

export const calculatorsHubSeo: PageSeo = {
    title: 'OSRS Calculators: Skill XP & GE Tax · Aris Maye',
    description:
        'Free OSRS calculators that use live Grand Exchange prices: what a skill goal costs, and what you keep after GE tax.',
    canonicalPath: '/calculators',
    robots: 'index',
};

export function buildSkillCalculatorSeo(skill: XpGuideSkill): PageSeo {
    return {
        title: `OSRS ${skill.title} Calculator: XP & GP to Your Goal`,
        description: `Work out the XP and GP to reach your ${skill.title} goal in OSRS, with every method priced from live Grand Exchange data.`,
        // The route matches any casing, so the slug, not the URL, decides the canonical.
        canonicalPath: `/calculators/${skill.slug}`,
        robots: 'index',
    };
}

export const geTaxCalculatorSeo: PageSeo = {
    title: 'OSRS GE Tax Calculator: What You Keep',
    description:
        "See how much Grand Exchange tax you'll pay on a sale in OSRS and what you keep, with the tax rate, the cap and the exemptions.",
    canonicalPath: '/calculators/ge-tax',
    robots: 'index',
};
