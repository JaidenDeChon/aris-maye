import { error } from '@sveltejs/kit';
import { findXpGuideSkill } from '$lib/constants/guides';
import { loadGuide } from '$lib/services/guide-service.server';

export async function load({ params, setHeaders }) {
    // The matcher already checked it, so this only narrows the type.
    const skill = findXpGuideSkill(params.skill);
    if (!skill) error(404, 'Not found');
    const guide = await loadGuide('cheapest-xp', setHeaders);
    const bands = guide.skills.find((entry) => entry.skill === skill.slug)?.bands ?? [];
    return { skill, bands, computedAt: guide.computedAt };
}
