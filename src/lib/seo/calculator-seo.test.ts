import { describe, expect, it } from 'bun:test';
import { XP_GUIDE_SKILLS, findXpGuideSkill } from '$lib/constants/guides';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from './fit-text';
import { buildSkillCalculatorSeo, calculatorsHubSeo, geTaxCalculatorSeo } from './calculator-seo';
import { buildCheapestXpSkillSeo } from './guide-seo';

const all = [
    ['hub', calculatorsHubSeo],
    ['ge tax', geTaxCalculatorSeo],
    ...XP_GUIDE_SKILLS.map((skill) => [skill.slug, buildSkillCalculatorSeo(skill)] as const),
] as const;

describe('calculator SEO', () => {
    it.each(all)('%s is indexable and within limits', (_, seo) => {
        expect(seo.robots).toBe('index');
        expect(seo.title.length).toBeLessThanOrEqual(TITLE_MAX);
        expect(seo.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
        expect(seo.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    });

    it.each(all)('%s carries no live figures', (_, seo) => {
        expect(`${seo.title} ${seo.description}`).not.toMatch(/\d\s?(gp|k|m|b|%)\b/i);
    });

    it('gives every page its own title, apart from the guides too', () => {
        const titles = [
            ...all.map(([, seo]) => seo.title),
            ...XP_GUIDE_SKILLS.map((skill) => buildCheapestXpSkillSeo(skill).title),
        ];
        expect(new Set(titles).size).toBe(titles.length);
    });

    it('uses the exact titles from the spec', () => {
        expect(calculatorsHubSeo.title).toBe('OSRS Calculators: Skill XP & GE Tax · Aris Maye');
        expect(geTaxCalculatorSeo.title).toBe('OSRS GE Tax Calculator: What You Keep');
        expect(buildSkillCalculatorSeo(findXpGuideSkill('runecrafting')!).title).toBe(
            'OSRS Runecrafting Calculator: XP & GP to Your Goal',
        );
    });

    it('is canonical to the bare path', () => {
        expect(calculatorsHubSeo.canonicalPath).toBe('/calculators');
        expect(geTaxCalculatorSeo.canonicalPath).toBe('/calculators/ge-tax');
        expect(buildSkillCalculatorSeo(findXpGuideSkill('Herblore')!).canonicalPath).toBe('/calculators/herblore');
    });
});
