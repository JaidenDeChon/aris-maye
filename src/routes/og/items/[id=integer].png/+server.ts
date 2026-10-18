import type { RequestHandler } from '@sveltejs/kit';
import { loadUsedInSafely } from '$lib/helpers/item-used-in';
import { DEFAULT_SHARE_IMAGE } from '$lib/seo/page-seo';
import { buildItemShareCard } from '$lib/seo/share-card';
import { shareCardAssets } from '$lib/server/og/assets';
import { scalePixelIcon } from '$lib/server/og/pixel-icon';
import { renderShareCard } from '$lib/server/og/render-share-card';
import { getGameItemById, getRecipesUsingItem } from '$lib/services/game-item-mongo-service.server';

/**
 * An item page's share image (its `og:image`). Rendering takes about 200ms, so the CDN keeps each
 * one for a week, shared across regions (`durable`). A deploy clears it, and the `?v=` the page
 * links with changes whenever the design does.
 */
export const GET: RequestHandler = async ({ params }) => {
    const item = await getGameItemById(params.id!);
    if (!item) return new Response('Item not found.', { status: 404 });

    try {
        const usedIn = await loadUsedInSafely(() => getRecipesUsingItem((item as { _id?: unknown })._id));
        const png = await renderShareCard(
            buildItemShareCard(item, usedIn),
            scalePixelIcon(item.icon),
            await shareCardAssets(),
        );

        return new Response(png as Uint8Array<ArrayBuffer>, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400',
                'Netlify-CDN-Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400, durable',
            },
        });
    } catch (error) {
        // A link preview with the site's own image beats one with none. Kept briefly, so the
        // real card replaces it once whatever failed recovers.
        console.error(`Failed to render the share image for item ${params.id}`, error);
        return new Response(null, {
            status: 302,
            headers: { Location: DEFAULT_SHARE_IMAGE, 'Cache-Control': 'public, max-age=300' },
        });
    }
};
