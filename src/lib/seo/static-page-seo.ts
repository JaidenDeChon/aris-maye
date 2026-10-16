import type { SkillTreePage } from '$lib/constants/skill-tree-pages';
import type { PageSeo } from './page-seo';

export const homeSeo: PageSeo = {
    title: 'Aris Maye: Find the Best OSRS Items to Craft & Profit',
    description: 'Find the best things to make using your skill levels, powered by real-time GE prices on Aris Maye.',
    canonicalPath: '/',
    robots: 'index',
};

export const itemsSeo: PageSeo = {
    title: 'OSRS Money Making & Crafting Profits, Updated Hourly',
    description:
        'Every OSRS item you can make, ranked by profit from live Grand Exchange prices and filtered to your skill levels.',
    canonicalPath: '/items',
    robots: 'index',
};

export function buildSkillSeo(skill: SkillTreePage): PageSeo {
    return {
        title: `Best OSRS ${skill.title} Money Makers & Profits`,
        description: `The most profitable things to make with ${skill.title} in OSRS, ranked by live GE prices and filtered to your levels.`,
        // The route matches any casing, so the slug, not the URL, decides the canonical.
        canonicalPath: `/items/${skill.slug}`,
        robots: 'index',
    };
}

// These pages show what is stored in the visitor's own browser, so a crawler would only ever see
// an empty state. They stay out of the index.
export const favoritesSeo: PageSeo = {
    title: 'Favorites · Aris Maye',
    description: 'The OSRS items you have starred on Aris Maye, with live Grand Exchange prices.',
    canonicalPath: '/favorites',
    robots: 'noindex',
};

export const hiddenSeo: PageSeo = {
    title: 'Hidden items · Aris Maye',
    description: 'The OSRS items you have hidden from your lists on Aris Maye.',
    canonicalPath: '/hidden',
    robots: 'noindex',
};

export const myCharacterSeo: PageSeo = {
    title: 'My character · Aris Maye',
    description: 'Your OSRS characters, skill levels and supplies, used to filter what you can make on Aris Maye.',
    canonicalPath: '/my-character',
    robots: 'noindex',
};

export const addItemSeo: PageSeo = {
    title: 'Add item · Aris Maye',
    description: 'Add an OSRS item to Aris Maye.',
    canonicalPath: '/items/new',
    robots: 'noindex',
};
