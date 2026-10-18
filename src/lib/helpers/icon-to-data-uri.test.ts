import { describe, expect, it } from 'bun:test';
import { decodeIcon } from './icon-to-data-uri';

// The first bytes of a PNG and a GIF, base64-encoded.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
const GIF = Buffer.from('GIF89a').toString('base64');

describe('decodeIcon', () => {
    it('decodes raw base64 by its magic number', () => {
        expect(decodeIcon(PNG)).toEqual({
            bytes: Uint8Array.from(Buffer.from(PNG, 'base64')),
            contentType: 'image/png',
        });
        expect(decodeIcon(GIF)?.contentType).toBe('image/gif');
    });

    it('keeps the type of a data URI', () => {
        expect(decodeIcon(`data:image/gif;base64,${GIF}`)?.contentType).toBe('image/gif');
    });

    it('is null for nothing', () => {
        expect(decodeIcon(null)).toBeNull();
        expect(decodeIcon('')).toBeNull();
    });
});
