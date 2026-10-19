/**
 * Makes sure static/transmog/ exists before the site is built or served. See extract.ts.
 * Set TRANSMOG_DATA=skip to leave whatever is there alone (e.g. offline).
 */
import type { Plugin } from 'vite';
import { ensureTransmogData } from './extract';
import { TRANSMOG_OUT_DIR, TRANSMOG_PERSIST_DIR } from './paths';

export function transmogData(): Plugin {
    let done: Promise<void> | null = null;
    let serving = false;
    return {
        name: 'transmog-data',
        configResolved(config) {
            serving = config.command === 'serve';
        },
        buildStart() {
            if (process.env.TRANSMOG_DATA === 'skip') return;
            // SvelteKit runs more than one build pass; only fetch once.
            done ??= ensureTransmogData({
                outDir: TRANSMOG_OUT_DIR,
                persistDir: TRANSMOG_PERSIST_DIR,
                // Keep the unpacked cache between local runs, but not on CI, where it'd bloat the build cache.
                keepCache: !process.env.CI && !process.env.NETLIFY,
                log: (message) => console.log(message),
            });
            // A dev server shouldn't wait on a download; the page picks the data up once it's there.
            return serving ? undefined : done;
        },
    };
}
