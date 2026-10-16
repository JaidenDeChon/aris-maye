import { PNG } from 'pngjs';
import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';

export type ScaledIcon = { uri: string; width: number; height: number };

/** The scaled icon fits in a square this size. */
export const ICON_BOX = 300;

/** Bounds of the pixels that aren't fully transparent, so padding in the sprite doesn't shrink it. */
function opaqueBounds(png: PNG) {
    let minX = png.width;
    let minY = png.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            if (png.data[(y * png.width + x) * 4 + 3] === 0) continue;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0) return { x: 0, y: 0, width: png.width, height: png.height };
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Enlarges an inventory icon by a whole number with nearest-neighbour sampling.
 *
 * Icons are about 36×32. Left to the renderer they'd be smoothed into a blur at this size, and
 * a whole-number scale keeps every game pixel the same size, which suits the pixel-font title.
 * @param icon - The item's `icon` field: base64 PNG, with or without a data URI prefix.
 * @returns The enlarged icon as a PNG data URI, or null if it can't be read as a PNG.
 */
export function scalePixelIcon(icon: string | null | undefined, box: number = ICON_BOX): ScaledIcon | null {
    const uri = iconToDataUri(icon);
    if (!uri.startsWith('data:image/png;base64,')) return null;

    let source: PNG;
    try {
        source = PNG.sync.read(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64'));
    } catch {
        return null;
    }

    const bounds = opaqueBounds(source);
    const scale = Math.max(1, Math.floor(box / Math.max(bounds.width, bounds.height)));
    const out = new PNG({ width: bounds.width * scale, height: bounds.height * scale });

    for (let y = 0; y < out.height; y++) {
        const sourceRow = (bounds.y + Math.floor(y / scale)) * source.width;
        for (let x = 0; x < out.width; x++) {
            const from = (sourceRow + bounds.x + Math.floor(x / scale)) * 4;
            const to = (y * out.width + x) * 4;
            source.data.copy(out.data, to, from, from + 4);
        }
    }

    const lit = withGlow(out);
    return {
        uri: `data:image/png;base64,${PNG.sync.write(lit).toString('base64')}`,
        width: lit.width,
        height: lit.height,
    };
}

/** How far the glow reaches past the icon's edge, in output pixels. */
export const GLOW_PAD = 36;
const GLOW_RGB = [247, 194, 39] as const;
const GLOW_STRENGTH = 0.7;

/** One pass of a box blur along rows (`horizontal`) or columns, over a single-channel image. */
function boxBlur(
    values: Float32Array,
    width: number,
    height: number,
    radius: number,
    horizontal: boolean,
): Float32Array {
    const out = new Float32Array(values.length);
    const span = radius * 2 + 1;
    const lines = horizontal ? height : width;
    const length = horizontal ? width : height;
    const at = (line: number, i: number) => (horizontal ? line * width + i : i * width + line);

    for (let line = 0; line < lines; line++) {
        let sum = 0;
        for (let i = -radius; i <= radius; i++) sum += i >= 0 && i < length ? values[at(line, i)] : 0;
        for (let i = 0; i < length; i++) {
            out[at(line, i)] = sum / span;
            const leaving = i - radius;
            const entering = i + radius + 1;
            if (leaving >= 0) sum -= values[at(line, leaving)];
            if (entering < length) sum += values[at(line, entering)];
        }
    }
    return out;
}

/**
 * Puts a soft gold glow behind the icon, like the rim light around Aris Maye on the homepage card.
 * Without it a dark item (a cannonball, logs, most armour) all but disappears into the background.
 */
function withGlow(icon: PNG): PNG {
    const width = icon.width + GLOW_PAD * 2;
    const height = icon.height + GLOW_PAD * 2;

    let alpha: Float32Array = new Float32Array(width * height);
    for (let y = 0; y < icon.height; y++) {
        for (let x = 0; x < icon.width; x++) {
            alpha[(y + GLOW_PAD) * width + x + GLOW_PAD] = icon.data[(y * icon.width + x) * 4 + 3] / 255;
        }
    }
    // Three box blurs come close to a Gaussian.
    for (let pass = 0; pass < 3; pass++) {
        alpha = boxBlur(alpha, width, height, GLOW_PAD / 3, true);
        alpha = boxBlur(alpha, width, height, GLOW_PAD / 3, false);
    }

    const out = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const to = (y * width + x) * 4;
            const glow = Math.min(1, alpha[y * width + x] * 1.6) * GLOW_STRENGTH;

            const ix = x - GLOW_PAD;
            const iy = y - GLOW_PAD;
            const inside = ix >= 0 && iy >= 0 && ix < icon.width && iy < icon.height;
            const from = inside ? (iy * icon.width + ix) * 4 : -1;
            const a = inside ? icon.data[from + 3] / 255 : 0;

            // The icon drawn over the glow ("source over").
            const outA = a + glow * (1 - a);
            for (let c = 0; c < 3; c++) {
                const top = inside ? icon.data[from + c] : 0;
                out.data[to + c] = outA === 0 ? 0 : Math.round((top * a + GLOW_RGB[c] * glow * (1 - a)) / outA);
            }
            out.data[to + 3] = Math.round(outA * 255);
        }
    }
    return out;
}
