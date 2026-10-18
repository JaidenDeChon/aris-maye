import { read } from '$app/server';
import resvgWasmUrl from '@resvg/resvg-wasm/index_bg.wasm?url';
import inter500Url from '@fontsource/inter/files/inter-latin-500-normal.woff?url';
import inter700Url from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import runescapeUrl from '../../../../static/fonts/runescape.ttf?url';
import type { ShareCardAssets } from './render-share-card';

// Imported with `?url` so Vite ships the files with the server build, and read with `read()`
// so the same code finds them in dev and in the Netlify function.
let assets: Promise<ShareCardAssets> | null = null;

async function load(url: string): Promise<ArrayBuffer> {
    return read(url).arrayBuffer();
}

/** The share card's fonts and resvg's WebAssembly, read once per warm function. */
export function shareCardAssets(): Promise<ShareCardAssets> {
    assets ??= Promise.all([load(runescapeUrl), load(inter500Url), load(inter700Url), load(resvgWasmUrl)])
        .then(([runescape, inter500, inter700, resvgWasm]) => ({
            fonts: [
                { name: 'RuneScape', data: runescape, weight: 400 as const },
                { name: 'Inter', data: inter500, weight: 500 as const },
                { name: 'Inter', data: inter700, weight: 700 as const },
            ],
            resvgWasm,
        }))
        .catch((error) => {
            assets = null;
            throw error;
        });
    return assets;
}
