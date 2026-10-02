import { browser } from '$app/environment';
import { canDeferPageData } from '$lib/helpers/deferred-page-data';
import type { HomepageSnapshot } from '$lib/models/homepage';
import type { PageLoad } from './$types';

/**
 * A universal load rather than a server one, so clicking through to the homepage from elsewhere in
 * the app swaps the page straight away. A server load makes every navigation here wait on a round
 * trip to the server first (longer on a cold start), with nothing on screen to show the click
 * landed. See `canDeferPageData`.
 */

const npcImages: string[] = [
    'aggie.webp',
    'aris-maye.png',
    'carpenter.webp',
    'duke-horacio.webp',
    'forestry-f.webp',
    'horvik.webp',
    'prospector-f.webp',
    'wise-old-man.png',
    'anglers-outfit.png',
    'charlie-the-tramp.png',
    'evil-chicken-outfit.webp',
    'forestry-m.webp',
    'king-narnode-shareen.webp',
    'prospector-m.webp',
    'zanik.png',
    'bob-the-cat.webp',
    'chicken-outfit.png',
    'farmer-f.png',
    'frog-price.png',
    'lumberjack-f.webp',
    'sedridor.webp',
    'captain-barnaby.png',
    'django.png',
    'farmer-m.png',
    'frog-princess.png',
    'lumberjack-m.png',
    'shayzien.png',
];

/**
 * How long the server waits for the homepage sections before sending the page without them.
 *
 * A warm cache answers well inside this, so the page usually arrives complete. When the snapshot
 * has to be built from scratch, waiting would hold the whole page, hero included, on a blank
 * screen; sending a skeleton instead gets something on screen straight away.
 */
const SNAPSHOT_WAIT_MS = 400;

/**
 * How long hydration waits. The load runs again in the browser, where a snapshot the server
 * rendered comes back at once from the response SvelteKit inlined in the page. One the server gave
 * up on isn't there, and the sections fetch it themselves rather than holding hydration up.
 */
const HYDRATION_WAIT_MS = 50;

type LoadFetch = typeof globalThis.fetch;

async function loadSnapshot(fetch: LoadFetch, waitMs: number): Promise<HomepageSnapshot | null> {
    const snapshot = fetch('/api/homepage')
        .then((response) => (response.ok ? (response.json() as Promise<HomepageSnapshot>) : null))
        // The hero and FAQ still work without the data sections, so a failure here shouldn't take
        // the whole homepage down. The sections try again on their own.
        .catch(() => null);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs));
    return Promise.race([snapshot, timeout]);
}

/**
 * A random NPC for the hero. Hydration reuses the one the server drew, which the load would
 * otherwise pick again and swap mid-render.
 */
function pickHeroImage(): string {
    if (browser && !canDeferPageData()) {
        const rendered = document.querySelector('[data-hero-npc]')?.getAttribute('src');
        if (rendered) return rendered;
    }
    return `/npc-images/${npcImages[Math.floor(Math.random() * npcImages.length)]}`;
}

/**
 * Lets Netlify's CDN keep the server-rendered homepage, so most visits get it from the edge instead
 * of waking a function (seconds on a cold start). Nothing in it is personal: profiles live in the
 * browser, and the sections are the same snapshot for everyone. Browsers always check back, and
 * the CDN serves its copy while it fetches a fresh one in the background for up to a day.
 *
 * See https://docs.netlify.com/platform/caching/
 */
const CDN_CACHE_HEADERS = {
    'cache-control': 'public, max-age=0, must-revalidate',
    'netlify-cdn-cache-control': 'public, durable, s-maxage=300, stale-while-revalidate=86400',
};

export const load: PageLoad = async ({ fetch, setHeaders }) => {
    const imageUrl = pickHeroImage();

    // On a click from elsewhere in the app, render now; the sections show their skeleton and fetch
    // the data (or reuse what they fetched last time).
    if (canDeferPageData()) return { imageUrl, snapshot: null };

    const snapshot = await loadSnapshot(fetch, browser ? HYDRATION_WAIT_MS : SNAPSHOT_WAIT_MS);
    // Only a complete page is worth keeping; one sent with skeletons is left uncached. setHeaders
    // does nothing in the browser.
    if (!browser && snapshot) setHeaders(CDN_CACHE_HEADERS);
    return { imageUrl, snapshot };
};
