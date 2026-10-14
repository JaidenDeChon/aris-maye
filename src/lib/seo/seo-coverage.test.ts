import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routesDir = join(import.meta.dir, '../../routes');
const pages = [...new Glob('**/+page.svelte').scanSync({ cwd: routesDir })];

describe('SEO coverage', () => {
    it('finds the route pages', () => {
        expect(pages.length).toBeGreaterThanOrEqual(8);
    });

    // A page without SeoHead would ship with no title at all now that the layout no longer
    // provides one.
    it.each(pages)('%s renders SeoHead', (page) => {
        const source = readFileSync(join(routesDir, page), 'utf8');
        expect(source).toContain("import SeoHead from '$lib/components/global/seo-head.svelte'");
        expect(source).toMatch(/<SeoHead\s/);
    });

    it('leaves per-page tags out of the layout, so none appear twice', () => {
        const layout = readFileSync(join(routesDir, '+layout.svelte'), 'utf8');
        for (const tag of [
            '<title>',
            'name="description"',
            'og:title',
            'og:description',
            'og:url',
            'og:image',
            'twitter:title',
        ]) {
            expect(layout).not.toContain(tag);
        }
    });
});
