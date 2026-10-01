import { json, type RequestHandler } from '@sveltejs/kit';
import { getHomepageSnapshot } from '$lib/services/homepage-service.server';

/** The global homepage sections. `?ironman=1` values them the Ironman way. */
export const GET: RequestHandler = async ({ url }) => {
    const ironman = url.searchParams.get('ironman') === '1';
    return json(await getHomepageSnapshot(ironman));
};
