import { GUIDE_PAGES, XP_GUIDE_SKILLS } from '$lib/constants/guides';
import { skillTreePages } from '$lib/constants/skill-tree-pages';
import { canonicalUrl } from './page-seo';
import { SITE_URL } from './site-url';

/** The sitemaps.org limit for one file. */
export const SITEMAP_MAX_URLS = 50_000;

const HEADERS = {
    'Content-Type': 'application/xml',
    // Prices move hourly, the set of pages much less often, so the CDN can serve one copy an hour.
    'Cache-Control': 'public, max-age=0, s-maxage=3600',
};

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function sitemapUrls(itemIds: number[], base: string = SITE_URL): string[] {
    const paths = [
        '/',
        '/items',
        ...skillTreePages.map((skill) => `/items/${skill.slug}`),
        '/guides',
        ...GUIDE_PAGES.map((guide) => guide.path),
        ...XP_GUIDE_SKILLS.map((skill) => `/guides/cheapest-xp/${skill.slug}`),
        '/calculators',
        ...XP_GUIDE_SKILLS.map((skill) => `/calculators/${skill.slug}`),
        '/calculators/ge-tax',
        '/transmog-dressing-room',
        '/about',
    ];
    for (const id of itemIds) paths.push(`/items/${id}`);
    return [...new Set(paths.map((path) => canonicalUrl(path, base)))];
}

// No <lastmod>: every item's price changes hourly, and search engines ignore dates that always move.
export function buildSitemap(urls: string[]): string {
    const entries = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function buildSitemapIndex(sitemapUrlList: string[]): string {
    const entries = sitemapUrlList.map((url) => `  <sitemap><loc>${escapeXml(url)}</loc></sitemap>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

export function chunkSitemapUrls(urls: string[], max = SITEMAP_MAX_URLS): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < urls.length; i += max) chunks.push(urls.slice(i, i + max));
    return chunks.length ? chunks : [[]];
}

/**
 * The response for `/sitemap.xml` (`page` null) or `/sitemap-{page}.xml`.
 */
export async function renderSitemapResponse(
    loadIds: () => Promise<number[]>,
    page: number | null,
    base: string = SITE_URL,
): Promise<Response> {
    let ids: number[];
    try {
        ids = await loadIds();
    } catch (error) {
        console.error('Failed to build the sitemap', error);
        // An empty sitemap would tell search engines the site has no pages; a 503 tells them to
        // come back later and keep what they have.
        return new Response('Sitemap temporarily unavailable.', {
            status: 503,
            headers: { 'Retry-After': '3600', 'Content-Type': 'text/plain' },
        });
    }

    const chunks = chunkSitemapUrls(sitemapUrls(ids, base));

    if (page === null) {
        const body =
            chunks.length === 1
                ? buildSitemap(chunks[0])
                : buildSitemapIndex(chunks.map((_, i) => `${base}/sitemap-${i + 1}.xml`));
        return new Response(body, { headers: HEADERS });
    }

    const chunk = chunks.length > 1 ? chunks[page - 1] : undefined;
    if (!chunk) return new Response('Not found.', { status: 404 });
    return new Response(buildSitemap(chunk), { headers: HEADERS });
}
