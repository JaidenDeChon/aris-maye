/**
 * Builds static/transmog/ by hand. The site build does this on its own (scripts/transmog/vite-plugin.ts);
 * run this to refresh the data locally or to try a particular cache.
 *
 *   bun scripts/extract-transmog.ts                       # newest live cache, reusing what's up to date
 *   bun scripts/extract-transmog.ts --from <dir> --id <n> # an already-unpacked cache (the folder with main_file_cache.dat2)
 */
import { ensureTransmogData, extractTransmogData } from './transmog/extract';
import { TRANSMOG_OUT_DIR, TRANSMOG_PERSIST_DIR } from './transmog/paths';

const args = process.argv.slice(2);
const from = args.indexOf('--from');
if (from !== -1) {
    const id = Number(args[args.indexOf('--id') + 1]);
    extractTransmogData(args[from + 1], { id, build: 0, timestamp: '' }, TRANSMOG_OUT_DIR);
} else {
    await ensureTransmogData({ outDir: TRANSMOG_OUT_DIR, persistDir: TRANSMOG_PERSIST_DIR, keepCache: true });
}
