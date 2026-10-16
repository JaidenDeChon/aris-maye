import { describe, expect, it } from 'bun:test';
import { skillTreePages } from '$lib/constants/skill-tree-pages';
import {
    addItemSeo,
    buildSkillSeo,
    favoritesSeo,
    hiddenSeo,
    homeSeo,
    itemsSeo,
    myCharacterSeo,
} from './static-page-seo';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from './fit-text';

describe('static page SEO', () => {
    it.each([
        ['home', homeSeo],
        ['items', itemsSeo],
        ...skillTreePages.map((skill) => [skill.slug, buildSkillSeo(skill)] as const),
    ])('%s is indexable and within limits', (_, seo) => {
        expect(seo.robots).toBe('index');
        expect(seo.title.length).toBeLessThanOrEqual(TITLE_MAX);
        expect(seo.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
        expect(seo.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    });

    it('titles skill pages by skill', () => {
        const cooking = skillTreePages.find((s) => s.slug === 'cooking')!;
        expect(buildSkillSeo(cooking).title).toBe('Best OSRS Cooking Money Makers & Profits');
    });

    it('uses the lowercase slug as the canonical path whatever the URL casing', () => {
        const cooking = skillTreePages.find((s) => s.slug === 'cooking')!;
        expect(buildSkillSeo(cooking).canonicalPath).toBe('/items/cooking');
    });

    it('keeps personal pages out of the index', () => {
        for (const seo of [favoritesSeo, hiddenSeo, myCharacterSeo, addItemSeo]) {
            expect(seo.robots).toBe('noindex');
        }
    });

    it('gives every fixed page a different title', () => {
        const titles = [homeSeo, itemsSeo, favoritesSeo, hiddenSeo, myCharacterSeo, addItemSeo].map((s) => s.title);
        expect(new Set(titles).size).toBe(titles.length);
    });
});
