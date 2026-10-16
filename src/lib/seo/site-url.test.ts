import { describe, expect, it } from 'bun:test';
import { isProductionHost, resolveSiteUrl } from './site-url';

describe('resolveSiteUrl', () => {
    it('defaults to the production domain when unset or blank', () => {
        expect(resolveSiteUrl(undefined)).toBe('https://aris-maye.com');
        expect(resolveSiteUrl('   ')).toBe('https://aris-maye.com');
    });

    it('drops trailing slashes from an override', () => {
        expect(resolveSiteUrl('https://example.test///')).toBe('https://example.test');
    });
});

describe('isProductionHost', () => {
    it.each([
        ['aris-maye.com', true],
        ['www.aris-maye.com', true],
        ['ARIS-MAYE.COM', true],
        ['deploy-preview-33--aris-maye.netlify.app', false],
        ['aris-maye.netlify.app', false],
        ['localhost:5173', false],
        ['aris-maye.com.evil.test', false],
    ])('%s -> %p', (host, expected) => {
        expect(isProductionHost(host)).toBe(expected);
    });
});
