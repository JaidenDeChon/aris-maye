import type { RequestHandler } from '@sveltejs/kit';
import { renderSitemapResponse } from '$lib/seo/sitemap';
import { getIndexableItemIds } from '$lib/services/game-item-mongo-service.server';

// Only used if the site ever passes 50,000 indexable pages; until then `/sitemap.xml` is the
// whole list and every numbered part is a 404.
export const GET: RequestHandler = ({ params }) => renderSitemapResponse(getIndexableItemIds, Number(params.page));
