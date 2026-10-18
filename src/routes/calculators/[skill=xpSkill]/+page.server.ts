import { error } from '@sveltejs/kit';
import { findXpGuideSkill } from '$lib/constants/guides';
import { parseSkillGoal } from '$lib/helpers/skill-calculator';
import { loadCalculatorMethods } from '$lib/services/guide-service.server';

export async function load({ params, url, setHeaders }) {
    // The matcher already checked it, so this only narrows the type.
    const skill = findXpGuideSkill(params.skill);
    if (!skill) error(404, 'Not found');
    const { computedAt, methods } = await loadCalculatorMethods(skill.slug, setHeaders);
    // The goal comes from the URL so a shared link, and a crawler, gets the same results.
    return { skill, goal: parseSkillGoal(url.searchParams), methods, computedAt };
}
