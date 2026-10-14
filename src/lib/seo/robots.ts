import { SITE_URL, isProductionHost } from './site-url';

export function buildRobots(host: string, base: string = SITE_URL): string {
    if (!isProductionHost(host)) return 'User-agent: *\nDisallow: /\n';
    return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`;
}

/**
 * Deploy previews and the netlify.app alias serve the same pages as the real domain. A header on
 * every response keeps them out of search results even when a crawler skips robots.txt.
 */
export function noindexHeaderFor(host: string): string | null {
    return isProductionHost(host) ? null : 'noindex, nofollow';
}
