import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { GUIDE_PAGES, XP_GUIDE_SKILLS } from '$lib/constants/guides';
import { skillTreePages } from '$lib/constants/skill-tree-pages';
import {
    SITEMAP_MAX_URLS,
    buildSitemap,
    buildSitemapIndex,
    chunkSitemapUrls,
    renderSitemapResponse,
    sitemapUrls,
} from './sitemap';

const BASE = 'https://aris-maye.com';
const fixtures = join(import.meta.dir, '../../../scripts/fixtures');

// Validates against the official sitemaps.org schema, not just "looks like XML".
function xmllint(xml: string, schema: string) {
    const result = Bun.spawnSync(['xmllint', '--noout', '--schema', join(fixtures, schema), '-'], {
        stdin: new TextEncoder().encode(xml),
    });
    return { ok: result.exitCode === 0, output: result.stderr.toString() };
}

describe('sitemapUrls', () => {
    it('lists the homepage, items, every skill page and each item once', () => {
        const urls = sitemapUrls([2, 440, 2], BASE);
        expect(urls[0]).toBe(`${BASE}/`);
        expect(urls).toContain(`${BASE}/items`);
        for (const skill of skillTreePages) expect(urls).toContain(`${BASE}/items/${skill.slug}`);
        expect(urls.filter((u) => u === `${BASE}/items/2`)).toHaveLength(1);
        expect(new Set(urls).size).toBe(urls.length);
    });

    it('lists the guides hub, every guide and every cheapest XP skill page once', () => {
        const urls = sitemapUrls([], BASE);
        const guides = [
            '/guides',
            ...GUIDE_PAGES.map((guide) => guide.path),
            ...XP_GUIDE_SKILLS.map((skill) => `/guides/cheapest-xp/${skill.slug}`),
        ];
        expect(guides).toHaveLength(13);
        for (const path of guides) expect(urls.filter((u) => u === `${BASE}${path}`)).toHaveLength(1);
    });
});

describe('buildSitemap', () => {
    it('produces a sitemap that passes the official schema', () => {
        const check = xmllint(buildSitemap(sitemapUrls([2, 440], BASE)), 'sitemap-0.9.xsd');
        expect(check.output).toContain('validates');
        expect(check.ok).toBe(true);
    });

    it('escapes characters that are special in XML', () => {
        const xml = buildSitemap([`${BASE}/items?a=1&b='2'`]);
        expect(xml).toContain('<loc>https://aris-maye.com/items?a=1&amp;b=&apos;2&apos;</loc>');
        expect(xmllint(xml, 'sitemap-0.9.xsd').ok).toBe(true);
    });
});

describe('chunkSitemapUrls / buildSitemapIndex', () => {
    it('splits past the 50,000-URL limit and indexes the parts', () => {
        const urls = Array.from({ length: SITEMAP_MAX_URLS + 5 }, (_, i) => `${BASE}/items/${i}`);
        const chunks = chunkSitemapUrls(urls);
        expect(chunks.map((c) => c.length)).toEqual([SITEMAP_MAX_URLS, 5]);
        const index = buildSitemapIndex([`${BASE}/sitemap-1.xml`, `${BASE}/sitemap-2.xml`]);
        expect(xmllint(index, 'siteindex-0.9.xsd').ok).toBe(true);
    });
});

describe('renderSitemapResponse', () => {
    it('serves XML with an hour of CDN caching', async () => {
        const response = await renderSitemapResponse(async () => [2], null, BASE);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/xml');
        expect(response.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=3600');
        expect(await response.text()).toContain(`<loc>${BASE}/items/2</loc>`);
    });

    // An empty 200 would tell search engines the site has no pages.
    it('answers 503 when the database fails, never an empty sitemap', async () => {
        const response = await renderSitemapResponse(
            async () => {
                throw new Error('mongo down');
            },
            null,
            BASE,
        );
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('3600');
    });

    it('serves an index and numbered parts when there are too many URLs', async () => {
        const ids = Array.from({ length: SITEMAP_MAX_URLS + 10 }, (_, i) => i + 1);
        const index = await renderSitemapResponse(async () => ids, null, BASE);
        expect(await index.text()).toContain(`<loc>${BASE}/sitemap-2.xml</loc>`);
        const part = await renderSitemapResponse(async () => ids, 2, BASE);
        expect(part.status).toBe(200);
        const missing = await renderSitemapResponse(async () => ids, 3, BASE);
        expect(missing.status).toBe(404);
    });
});
