import type { RequestHandler } from '@sveltejs/kit';
import { renderSitemapResponse } from '$lib/seo/sitemap';
import { getIndexableItemIds } from '$lib/services/game-item-mongo-service.server';

export const GET: RequestHandler = () => renderSitemapResponse(getIndexableItemIds, null);
