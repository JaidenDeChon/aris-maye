import type { RequestHandler } from '@sveltejs/kit';
import { DEFAULT_SHARE_IMAGE } from '$lib/seo/page-seo';
import { buildMarketShareCard } from '$lib/seo/market-share-card';
import { shareCardAssets } from '$lib/server/og/assets';
import { scalePixelIcon } from '$lib/server/og/pixel-icon';
import { renderShareCard } from '$lib/server/og/render-share-card';
import { getGuideSnapshot } from '$lib/services/guide-service.server';

/**
 * The market report's share image, drawn by the same layout as the item cards. The report changes
 * every hour, so the CDN keeps it for an hour rather than the item cards' week; the page links it
 * with the hour in the URL, so a link preview never shows an old day's movers.
 */
export const GET: RequestHandler = async () => {
    try {
        const report = await getGuideSnapshot('market');
        const card = buildMarketShareCard(report);
        if (!card) return fallback();

        const png = await renderShareCard(card, scalePixelIcon(report.risers[0]?.icon), await shareCardAssets());
        return new Response(png as Uint8Array<ArrayBuffer>, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=300',
                'Netlify-CDN-Cache-Control': 'public, max-age=3600, stale-while-revalidate=600, durable',
            },
        });
    } catch (error) {
        console.error('Failed to render the market report share image', error);
        return fallback();
    }
};

/** A link preview with the site's own image beats one with none. Kept briefly, so the real card replaces it. */
function fallback(): Response {
    return new Response(null, {
        status: 302,
        headers: { Location: DEFAULT_SHARE_IMAGE, 'Cache-Control': 'public, max-age=300' },
    });
}
