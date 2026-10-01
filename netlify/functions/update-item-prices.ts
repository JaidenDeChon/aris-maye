import type { Handler } from '@netlify/functions';
import { startMongo } from '../../src/db/mongo';
import { updateAllGameItemPricesInMongo } from '../../src/lib/services/game-item-price-service';

export const handler: Handler = async () => {
    console.info('Attempting item prices update');

    try {
        await startMongo();
        console.info('MongoDB connection established. Updating all game item prices...');
        await updateAllGameItemPricesInMongo();
        console.info('All game item prices updated.');
        await refreshHomepageSnapshots();

        return {
            statusCode: 200,
            body: JSON.stringify({ ok: true }),
        };
    } catch (error) {
        console.error('Error updating item prices:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};

/**
 * Asks the site to rebuild its homepage sections from the new prices, so visitors don't wait for it.
 *
 * This goes through the site rather than importing the homepage service, because that service uses
 * SvelteKit's `$lib` imports, which this function's bundler can't resolve. It needs
 * `HOMEPAGE_REFRESH_TOKEN` set on the site. Without it, or if the call fails, the homepage still
 * rebuilds a stale snapshot itself on the next visit.
 */
async function refreshHomepageSnapshots(): Promise<void> {
    const token = process.env.HOMEPAGE_REFRESH_TOKEN;
    const siteUrl = process.env.URL;
    if (!token || !siteUrl) {
        console.info('Skipping homepage refresh: HOMEPAGE_REFRESH_TOKEN or URL is not set.');
        return;
    }

    try {
        const response = await fetch(new URL('/api/homepage/refresh', siteUrl), {
            method: 'POST',
            headers: { 'x-refresh-token': token },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.info('Homepage snapshots refreshed.');
    } catch (error) {
        console.error('Error refreshing homepage snapshots:', error);
    }
}
