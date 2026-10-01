import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { refreshHomepageSnapshot } from '$lib/services/homepage-service.server';

function tokenMatches(given: string | null, expected: string): boolean {
    if (!given) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rebuilds the cached homepage sections. Called by the hourly price job after prices change.
 *
 * Rebuilding is expensive, so it's locked behind `HOMEPAGE_REFRESH_TOKEN`. With no token
 * configured the endpoint doesn't exist.
 */
export const POST: RequestHandler = async ({ request }) => {
    const expected = env.HOMEPAGE_REFRESH_TOKEN;
    if (!expected) error(404, 'Not found');
    if (!tokenMatches(request.headers.get('x-refresh-token'), expected)) error(401, 'Unauthorized');

    const [ge, ironman] = await Promise.all([refreshHomepageSnapshot(false), refreshHomepageSnapshot(true)]);
    return json({ ok: true, computedAt: { ge: ge.computedAt, ironman: ironman.computedAt } });
};
