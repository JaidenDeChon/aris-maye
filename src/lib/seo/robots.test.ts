import { describe, expect, it } from 'bun:test';
import { buildRobots, noindexHeaderFor } from './robots';

describe('buildRobots', () => {
    it('opens the production site, except the API, and points at the sitemap', () => {
        expect(buildRobots('aris-maye.com', 'https://aris-maye.com')).toBe(
            'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://aris-maye.com/sitemap.xml\n',
        );
        expect(buildRobots('www.aris-maye.com', 'https://aris-maye.com')).toContain('Sitemap:');
    });

    it.each(['deploy-preview-33--aris-maye.netlify.app', 'aris-maye.netlify.app', 'localhost:5173'])(
        'closes %s entirely',
        (host) => {
            expect(buildRobots(host)).toBe('User-agent: *\nDisallow: /\n');
        },
    );
});

describe('noindexHeaderFor', () => {
    it('sends no header on production and noindex everywhere else', () => {
        expect(noindexHeaderFor('aris-maye.com')).toBeNull();
        expect(noindexHeaderFor('deploy-preview-33--aris-maye.netlify.app')).toBe('noindex, nofollow');
    });
});
