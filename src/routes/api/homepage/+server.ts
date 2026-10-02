import { json, type RequestHandler } from '@sveltejs/kit';
import { getFreshHomepageSnapshot, getHomepageSnapshot } from '$lib/services/homepage-service.server';

/**
 * The global homepage sections. `?ironman=1` values them the Ironman way. `?fresh=1` rebuilds a
 * stale snapshot before answering; the homepage asks for that when the one it has is out of date.
 */
export const GET: RequestHandler = async ({ url }) => {
    const ironman = url.searchParams.get('ironman') === '1';
    const fresh = url.searchParams.get('fresh') === '1';
    return json(await (fresh ? getFreshHomepageSnapshot(ironman) : getHomepageSnapshot(ironman)));
};
