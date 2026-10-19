/**
 * Checks the generated data in static/transmog/ hangs together. It's built at build time and not
 * committed, so these are skipped until `bun run extract-transmog` (or a build) has made it.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    TRANSMOG_DATA_VERSION,
    unpackItem,
    type ModelFile,
    type PackedItem,
    type TransmogManifest,
} from '$lib/osrs-model/types';
import { EMOTES } from './outfit';

const DIR = join(import.meta.dir, '..', '..', '..', 'static', 'transmog');
const present = existsSync(join(DIR, 'manifest.json'));

describe.skipIf(!present)('generated transmog data', () => {
    const manifest = present
        ? (JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as TransmogManifest)
        : null!;
    const items = present
        ? (JSON.parse(readFileSync(join(DIR, 'items.json'), 'utf8')) as PackedItem[]).map(unpackItem)
        : [];

    test('is the version the page expects', () => {
        expect(manifest.version).toBe(TRANSMOG_DATA_VERSION);
    });

    test('has every model an item or body needs', () => {
        const ids = new Set<number>();
        for (const item of items) [...item.models.male, ...item.models.female].forEach((m) => ids.add(m));
        for (const body of Object.values(manifest.bodies))
            for (const kit of Object.values(body)) kit.models.forEach((m) => ids.add(m));
        const missing = [...ids].filter((id) => !existsSync(join(DIR, 'models', `${id}.json`)));
        expect(missing).toEqual([]);
    });

    test('has every texture a model uses', () => {
        const sample = items.filter((i) => i.textured).flatMap((i) => i.models.male);
        const missing = new Set<number>();
        for (const id of sample) {
            const model = JSON.parse(readFileSync(join(DIR, 'models', `${id}.json`), 'utf8')) as ModelFile;
            for (const t of model.t ?? []) if (t >= 0 && !existsSync(join(DIR, 'textures', `${t}.png`))) missing.add(t);
        }
        expect([...missing]).toEqual([]);
    });

    test('has the idle and every emote the page offers, with frames on known skeletons', () => {
        for (const name of ['idle', ...EMOTES.map((e) => e.key)]) {
            const animation = manifest.animations[name];
            expect(animation, name).toBeDefined();
            expect(animation.frames.length).toBe(animation.lengths.length);
            for (const frame of animation.frames) expect(manifest.framemaps[frame[0]], name).toBeDefined();
        }
    });

    test('lists a few well-known items in the right slots', () => {
        const slotOf = (name: string) => items.find((i) => i.name === name)?.slot;
        expect(slotOf('Rune platebody')).toBe(4);
        expect(slotOf('Abyssal whip')).toBe(3);
        expect(slotOf('Fire cape')).toBe(1);
    });
});
