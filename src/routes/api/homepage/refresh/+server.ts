import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { GUIDE_KEYS, type GuideKey } from '$lib/constants/guides';
import { refreshGuideSnapshot } from '$lib/services/guide-service.server';
import { refreshHomepageSnapshot } from '$lib/services/homepage-service.server';

function tokenMatches(given: string | null, expected: string): boolean {
    if (!given) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rebuilds a cached snapshot. Called by the hourly price job after prices change, once per
 * `?target=`: `homepage` (the default) or a guide. Each target is its own request so each gets
 * its own function time limit.
 *
 * Rebuilding is expensive, so it's locked behind `HOMEPAGE_REFRESH_TOKEN`. With no token
 * configured the endpoint doesn't exist.
 */
export const POST: RequestHandler = async ({ request, url }) => {
    const expected = env.HOMEPAGE_REFRESH_TOKEN;
    if (!expected) error(404, 'Not found');
    if (!tokenMatches(request.headers.get('x-refresh-token'), expected)) error(401, 'Unauthorized');

    const target = url.searchParams.get('target') ?? 'homepage';
    if (target === 'homepage') {
        const [ge, ironman] = await Promise.all([refreshHomepageSnapshot(false), refreshHomepageSnapshot(true)]);
        return json({ ok: true, target, computedAt: { ge: ge.computedAt, ironman: ironman.computedAt } });
    }
    if (!GUIDE_KEYS.includes(target as GuideKey)) error(400, `Unknown refresh target "${target}".`);

    const snapshot = await refreshGuideSnapshot(target as GuideKey);
    return json({ ok: true, target, computedAt: snapshot.computedAt });
};
