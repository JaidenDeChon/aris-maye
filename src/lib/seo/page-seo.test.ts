import { describe, expect, it } from 'bun:test';
import { canonicalPath, canonicalUrl, robotsContent } from './page-seo';

describe('canonicalPath', () => {
    it.each([
        ['/', '/'],
        ['', '/'],
        ['/items/', '/items'],
        ['/items?skill=cooking&page=2', '/items'],
        ['/items/2#prices', '/items/2'],
        ['items/2', '/items/2'],
        ['/items//', '/items'],
    ])('%p -> %p', (input, expected) => {
        expect(canonicalPath(input)).toBe(expected);
    });
});

describe('canonicalUrl', () => {
    it('keeps the trailing slash only on the homepage', () => {
        expect(canonicalUrl('/', 'https://aris-maye.com')).toBe('https://aris-maye.com/');
        expect(canonicalUrl('/items/2?x=1', 'https://aris-maye.com')).toBe('https://aris-maye.com/items/2');
    });

    it('uses the production domain by default', () => {
        expect(canonicalUrl('/items')).toBe('https://aris-maye.com/items');
    });
});

describe('robotsContent', () => {
    it('spells out both directives', () => {
        expect(robotsContent('index')).toBe('index, follow');
        expect(robotsContent('noindex')).toBe('noindex, follow');
    });
});
