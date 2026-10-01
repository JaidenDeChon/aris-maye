import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getAlmostUnlocked } from '$lib/services/homepage-service.server';
import type { PlayerSkillLevels } from '$lib/services/game-item-mongo-service.server';

/**
 * Profitable items the player is a few levels short of making.
 * Takes `skillLevels` as JSON, the same way `/api/game-items` does, and `ironman=1`.
 */
export const GET: RequestHandler = async ({ url }) => {
    let skillLevels: PlayerSkillLevels;
    try {
        skillLevels = JSON.parse(url.searchParams.get('skillLevels') ?? '');
    } catch {
        error(400, 'skillLevels must be a JSON object of skill levels');
    }
    if (!skillLevels || typeof skillLevels !== 'object')
        error(400, 'skillLevels must be a JSON object of skill levels');

    const ironman = url.searchParams.get('ironman') === '1';
    return json(await getAlmostUnlocked(skillLevels, ironman));
};
