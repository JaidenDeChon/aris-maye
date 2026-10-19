/**
 * An item's main colour, worked out from its model: the colour covering the most surface. Used
 * to colour-match items scape.fashion doesn't know by name.
 */
import type { ModelFile } from '$lib/osrs-model/types';

/**
 * The most common colour across the models' faces, weighted by face area, as a 0xRRGGBB value
 * from the palette. Hidden, see-through and textured faces are left out. Null if nothing's left.
 */
export function mainColour(models: ModelFile[], recolor: [number, number][], palette: Uint32Array): number | null {
    // Similar shades share a bucket (hue and saturation exact, lightness in steps of 8).
    const area = new Map<number, number>();
    const lightness = new Map<number, number>();
    for (const model of models) {
        for (let f = 0; f < model.c.length; f++) {
            if ((model.t?.[f] ?? -1) !== -1) continue;
            const type = model.r?.[f] ?? 0;
            if (type === 2 || type === 3) continue;
            if ((model.a?.[f] ?? 0) >= 128) continue;
            let hsl = model.c[f];
            const swap = recolor.find(([find]) => find === hsl);
            if (swap) hsl = swap[1];
            const size = faceArea(model, f);
            if (size === 0) continue;
            const bucket = hsl & 0xfff8;
            area.set(bucket, (area.get(bucket) ?? 0) + size);
            lightness.set(bucket, (lightness.get(bucket) ?? 0) + (hsl & 127) * size);
        }
    }
    let best = -1;
    let bestArea = 0;
    for (const [bucket, size] of area) {
        if (size > bestArea) {
            best = bucket;
            bestArea = size;
        }
    }
    if (best < 0) return null;
    const light = Math.round(lightness.get(best)! / bestArea);
    return palette[(best & 0xff80) | light] & 0xffffff;
}

function faceArea(model: ModelFile, f: number): number {
    const [a, b, c] = [model.f[f * 3] * 3, model.f[f * 3 + 1] * 3, model.f[f * 3 + 2] * 3];
    const v = model.v;
    const ux = v[b] - v[a];
    const uy = v[b + 1] - v[a + 1];
    const uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a];
    const wy = v[c + 1] - v[a + 1];
    const wz = v[c + 2] - v[a + 2];
    return Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
}

export function toHex(rgb: number): string {
    return `#${rgb.toString(16).padStart(6, '0')}`;
}
