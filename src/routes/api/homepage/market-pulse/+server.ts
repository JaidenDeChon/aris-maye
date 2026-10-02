import { json, type RequestHandler } from '@sveltejs/kit';
import { getMarketPulse } from '$lib/services/homepage-service.server';

/** The homepage's Market pulse, read from the items rather than the cached snapshot. */
export const GET: RequestHandler = async () => json(await getMarketPulse());
