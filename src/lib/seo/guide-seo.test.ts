import { describe, expect, it } from 'bun:test';
import { XP_GUIDE_SKILLS, findXpGuideSkill } from '$lib/constants/guides';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from './fit-text';
import {
    buildCheapestXpSkillSeo,
    buildMarketSeo,
    cheapestXpSeo,
    guidesHubSeo,
    highAlchSeo,
    ironmanSeo,
} from './guide-seo';
import { marketShareImagePath } from './share-image';

const all = [
    ['hub', guidesHubSeo],
    ['market', buildMarketSeo()],
    ['high alch', highAlchSeo],
    ['cheapest xp', cheapestXpSeo],
    ['ironman', ironmanSeo],
    ...XP_GUIDE_SKILLS.map((skill) => [skill.slug, buildCheapestXpSkillSeo(skill)] as const),
] as const;

describe('guide SEO', () => {
    it.each(all)('%s is indexable and within limits', (_, seo) => {
        expect(seo.robots).toBe('index');
        expect(seo.title.length).toBeLessThanOrEqual(TITLE_MAX);
        expect(seo.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
        expect(seo.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    });

    it.each(all)('%s carries no live figures', (_, seo) => {
        expect(`${seo.title} ${seo.description}`).not.toMatch(/\d\s?(gp|k|m|b|%)\b/i);
    });

    it('gives every page its own title', () => {
        const titles = all.map(([, seo]) => seo.title);
        expect(new Set(titles).size).toBe(titles.length);
    });

    it('uses the exact titles from the spec', () => {
        expect(guidesHubSeo.title).toBe('OSRS Money Making & Training Guides · Aris Maye');
        expect(buildMarketSeo().title).toBe("OSRS GE Market Report: Today's Biggest Risers & Fallers");
        expect(highAlchSeo.title).toBe('OSRS High Alch Profit List: Best Items to Alch');
        expect(cheapestXpSeo.title).toBe('Cheapest XP in OSRS: GP per XP for Every Skill');
        expect(ironmanSeo.title).toBe('OSRS Ironman Money Making: Shops, Alching & Crafting');
        expect(buildCheapestXpSkillSeo(findXpGuideSkill('runecrafting')!).title).toBe(
            'Cheapest OSRS Runecrafting XP: GP per XP by Level',
        );
    });

    it('canonicalises skill pages to the lowercase slug', () => {
        expect(buildCheapestXpSkillSeo(findXpGuideSkill('HERBLORE')!).canonicalPath).toBe(
            '/guides/cheapest-xp/herblore',
        );
    });

    it('gives the market report its share image only when there is one', () => {
        expect(buildMarketSeo().image).toBeUndefined();
        const image = marketShareImagePath(7_200_000);
        const seo = buildMarketSeo(image, 'Alt text');
        expect(seo.image).toBe('/og/guides/market.png?v=1&h=2');
        expect(seo.imageAlt).toBe('Alt text');
    });
});
