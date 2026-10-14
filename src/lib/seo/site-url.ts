const DEFAULT_SITE_URL = 'https://aris-maye.com';

// Only the real domain is allowed into search results. Deploy previews and the netlify.app alias
// serve the same pages, and if they were indexed they would compete with it as duplicates.
const PRODUCTION_HOSTS = new Set(['aris-maye.com', 'www.aris-maye.com']);

/**
 * The origin every canonical URL and sitemap entry points at, whichever host served the request.
 */
export function resolveSiteUrl(raw?: string | null): string {
    const value = raw?.trim();
    if (!value) return DEFAULT_SITE_URL;
    return value.replace(/\/+$/, '');
}

// Read the same way `src/db/mongo.ts` reads its settings, so this works under Vite (server and
// browser) and under Bun scripts and tests alike.
function readSiteUrlSetting(): string | undefined {
    const viaVite = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SITE_URL : undefined;
    if (viaVite) return viaVite;
    return globalThis.process?.env?.VITE_SITE_URL;
}

export const SITE_URL = resolveSiteUrl(readSiteUrlSetting());

export function isProductionHost(host: string): boolean {
    return PRODUCTION_HOSTS.has(host.trim().toLowerCase());
}
