import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { buildItemShareCard } from '$lib/seo/share-card';
import { EMPTY_USED_IN } from '$lib/models/item-used-in';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
import { GLOW_PAD, scalePixelIcon } from './pixel-icon';
import { renderShareCard, type ShareCardAssets } from './render-share-card';
import { sentenceWords, titleFontSize } from './share-card-layout';

/** A width×height PNG, transparent except for the given opaque pixels, as base64. */
function iconPng(width: number, height: number, opaque: [number, number][]): string {
    const png = new PNG({ width, height });
    for (const [x, y] of opaque) png.data.set([200, 100, 50, 255], (y * width + x) * 4);
    return PNG.sync.write(png).toString('base64');
}

function decode(uri: string): PNG {
    return PNG.sync.read(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64'));
}

describe('scalePixelIcon', () => {
    it('trims transparent padding and scales by a whole number', () => {
        // A 2×1 sprite inside a 36×32 icon: the sprite, not the canvas, fills the box.
        const icon = scalePixelIcon(
            iconPng(36, 32, [
                [10, 10],
                [11, 10],
            ]),
            300,
        )!;
        expect(icon.width).toBe(300 + GLOW_PAD * 2);
        expect(icon.height).toBe(150 + GLOW_PAD * 2);
    });

    it('keeps hard pixel edges', () => {
        // Opaque, transparent, opaque: scaled ×33, so the seam is between x=32 and x=33.
        const icon = decode(
            scalePixelIcon(
                iconPng(3, 1, [
                    [0, 0],
                    [2, 0],
                ]),
                100,
            )!.uri,
        );
        const alphaAt = (x: number) => icon.data[((GLOW_PAD + 16) * icon.width + GLOW_PAD + x) * 4 + 3];
        expect(alphaAt(32)).toBe(255);
        expect(alphaAt(33)).toBeLessThan(255);
    });

    it('returns null for something that is not a PNG', () => {
        expect(scalePixelIcon(null)).toBeNull();
        expect(scalePixelIcon('R0lGODlhAQABAAAAACw=')).toBeNull();
        expect(scalePixelIcon('iVBORw0KGgonot-a-png')).toBeNull();
    });
});

describe('titleFontSize', () => {
    it('uses the full size for a short name and steps down for long ones', () => {
        expect(titleFontSize('Logs')).toBe(88);
        expect(titleFontSize('Steel cannonball')).toBe(88);
        expect(titleFontSize('Amulet of the damned (full)')).toBe(88);
        expect(titleFontSize("Zamorak's unholy book & quill ornament kit")).toBeLessThan(88);
        expect(titleFontSize('Supercalifragilisticexpialidocious')).toBeLessThan(76);
    });
});

describe('sentenceWords', () => {
    it('splits at spaces and keeps punctuation with the word before it', () => {
        const words = sentenceWords([{ text: 'for ' }, { text: '25.6 XP', strong: true }, { text: '. Next' }]);
        expect(words).toEqual([
            [{ text: 'for', strong: undefined }],
            [{ text: '25.6', strong: true }],
            [
                { text: 'XP', strong: true },
                { text: '.', strong: undefined },
            ],
            [{ text: 'Next', strong: undefined }],
        ]);
    });
});

describe('renderShareCard', () => {
    const file = (path: string) => {
        const bytes = readFileSync(path);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    };
    const inter = (weight: number) => file(`node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff`);
    const assets: ShareCardAssets = {
        fonts: [
            { name: 'RuneScape', data: file('static/fonts/runescape.ttf'), weight: 400 },
            { name: 'Inter', data: inter(500), weight: 500 },
            { name: 'Inter', data: inter(700), weight: 700 },
        ],
        resvgWasm: file('node_modules/@resvg/resvg-wasm/index_bg.wasm'),
    };

    it('draws a 1200×630 PNG, with or without an icon', async () => {
        const item = { id: 2, name: 'Steel cannonball', members: true } as IOsrsboxItemWithMeta;
        const card = buildItemShareCard(item, EMPTY_USED_IN);

        for (const icon of [scalePixelIcon(iconPng(4, 4, [[1, 1]])), null]) {
            const png = PNG.sync.read(Buffer.from(await renderShareCard(card, icon, assets)));
            expect([png.width, png.height]).toEqual([1200, 630]);
        }
    });
});
