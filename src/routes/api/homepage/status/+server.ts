import { json, type RequestHandler } from '@sveltejs/kit';
import { getHomepageStatus } from '$lib/services/homepage-service.server';

/**
 * Where the homepage's data stands: when prices last updated, how much trade history is stored,
 * and how old each cached snapshot is. Open it in a browser to check a deploy.
 */
export const GET: RequestHandler = async () => json(await getHomepageStatus());
