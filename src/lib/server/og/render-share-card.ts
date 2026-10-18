import satori from 'satori';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import type { ShareCard } from '$lib/seo/share-card';
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '$lib/seo/share-image';
import type { ScaledIcon } from './pixel-icon';
import { shareCardLayout } from './share-card-layout';

type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export type ShareCardFont = { name: string; data: ArrayBuffer; weight: FontWeight };

/** The files the renderer needs. The route reads them with `read()`; scripts and tests from disk. */
export type ShareCardAssets = {
    fonts: ShareCardFont[];
    resvgWasm: ArrayBuffer;
};

// resvg's WebAssembly can only be started once per process, and a warm function serves many images.
let wasmReady: Promise<void> | null = null;

function startResvg(wasm: ArrayBuffer): Promise<void> {
    wasmReady ??= initWasm(wasm).catch((error) => {
        wasmReady = null;
        throw error;
    });
    return wasmReady;
}

/**
 * Draws a share card to a 1200×630 PNG: satori lays it out as SVG, and resvg rasterises that.
 * @returns The PNG bytes.
 */
export async function renderShareCard(
    card: ShareCard,
    icon: ScaledIcon | null,
    assets: ShareCardAssets,
): Promise<Uint8Array> {
    const svg = await satori(shareCardLayout(card, icon) as Parameters<typeof satori>[0], {
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
        fonts: assets.fonts.map((font) => ({ ...font, style: 'normal' as const })),
    });

    await startResvg(assets.resvgWasm);
    const resvg = new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } });
    return resvg.render().asPng();
}
