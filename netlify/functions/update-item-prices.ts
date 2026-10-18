import type { Handler } from '@netlify/functions';
import { startMongo } from '../../src/db/mongo';
import { updateAllGameItemPricesInMongo } from '../../src/lib/services/game-item-price-service';

export const handler: Handler = async () => {
    console.info('Attempting item prices update');

    try {
        await startMongo();
        console.info('MongoDB connection established. Updating all game item prices...');
        await updateAllGameItemPricesInMongo(extraPriceDatabases());
        console.info('All game item prices updated.');
        await refreshSnapshots();

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
 * Other databases to keep priced, from `PRICE_SYNC_EXTRA_DBS` (comma-separated), such as the
 * `osrsbox-dev` database deploy previews read. Netlify only runs this function for production.
 */
function extraPriceDatabases(): string[] {
    return (process.env.PRICE_SYNC_EXTRA_DBS ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
}

/**
 * What the site keeps cached from prices: the homepage sections, each guide page and the calculators. Written out
 * here rather than imported, because this function's bundler can't resolve `$lib`.
 */
const REFRESH_TARGETS = ['homepage', 'market', 'high-alch', 'cheapest-xp', 'ironman', 'calculators'];

/**
 * Asks the site to rebuild its cached homepage sections and guides from the new prices, so visitors
 * don't wait for it.
 *
 * This goes through the site rather than importing the services, because they use SvelteKit's
 * `$lib` imports, which this function's bundler can't resolve. Each target is its own request,
 * all sent at once: each rebuild runs in its own function invocation with its own time limit, and
 * this run only waits as long as the slowest one. It needs `HOMEPAGE_REFRESH_TOKEN` set on the
 * site. Without it, or if a call fails, that page still rebuilds a stale snapshot itself on the
 * next visit.
 */
async function refreshSnapshots(): Promise<void> {
    const token = process.env.HOMEPAGE_REFRESH_TOKEN;
    const siteUrl = process.env.URL;
    if (!token || !siteUrl) {
        console.info('Skipping snapshot refresh: HOMEPAGE_REFRESH_TOKEN or URL is not set.');
        return;
    }

    const results = await Promise.allSettled(
        REFRESH_TARGETS.map(async (target) => {
            const url = new URL('/api/homepage/refresh', siteUrl);
            url.searchParams.set('target', target);
            const response = await fetch(url, { method: 'POST', headers: { 'x-refresh-token': token } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }),
    );
    results.forEach((result, i) => {
        if (result.status === 'fulfilled') console.info(`Refreshed ${REFRESH_TARGETS[i]}.`);
        else console.error(`Error refreshing ${REFRESH_TARGETS[i]}:`, result.reason);
    });
}
