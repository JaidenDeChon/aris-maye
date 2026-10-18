import { json, type RequestHandler } from '@sveltejs/kit';
import { getGuideStatus } from '$lib/services/guide-service.server';
import { getHomepageStatus } from '$lib/services/homepage-service.server';

/**
 * Where the homepage's data stands: when prices last updated, how much trade history is stored,
 * and how old each cached snapshot is, the guides' included. Open it in a browser to check a deploy.
 */
export const GET: RequestHandler = async () => {
    const [homepage, guides] = await Promise.all([getHomepageStatus(), getGuideStatus()]);
    return json({ ...homepage, guides });
};
