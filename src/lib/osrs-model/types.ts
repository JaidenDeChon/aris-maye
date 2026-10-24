/**
 * Shapes of the transmog data that scripts/extract-transmog.ts writes to static/transmog/.
 * Kept in one place so the extractor and the page agree on them.
 */

/** Bump when the shape of these files changes, so stale build caches get regenerated. */
export const TRANSMOG_DATA_VERSION = 5;

export interface Animation {
    /** Client cycles (20ms) per frame. */
    lengths: number[];
    /** [framemap id, slot, dx, dy, dz, slot, dx, dy, dz, ...] per frame. */
    frames: number[][];
}

export interface Framemap {
    /** Transform type per slot: 0 origin, 1 translate, 2 rotate, 3 scale, 5 alpha. */
    types: number[];
    /** The vertex labels each slot moves. */
    labels: number[][];
}

/** One bare body part (identity kit). */
export interface BodyKit {
    models: number[];
    /** [find, replace] HSL pairs. */
    recolor: [number, number][];
    retexture: [number, number][];
}

export type Gender = 'male' | 'female';

export interface TransmogManifest {
    version: number;
    source: { archive: string; cache: number; build: number; timestamp: string };
    /** Default body per gender, keyed by the equipment slot each kit occupies. */
    bodies: Record<Gender, Record<number, BodyKit>>;
    animations: Record<string, Animation>;
    /** The stand animation (a key of `animations`) for each weapon that doesn't use the default idle. */
    stances: Record<string, string>;
    framemaps: Record<string, Framemap>;
    /** Textures that scroll, as [du, dv] in 128ths of the texture per client cycle. */
    textureAnimations: Record<string, [number, number]>;
}

/**
 * A wearable item, packed as an array to keep items.json small:
 * [id, name, slot, hidden slots, male models, male offset, female models, female offset,
 *  recolor pairs, retexture pairs, flags]
 */
export type PackedItem = [
    number,
    string,
    number,
    number[],
    number[],
    number,
    number[],
    number,
    [number, number][],
    [number, number][],
    number,
];

export const ITEM_FLAG_GE_TRADEABLE = 1;
export const ITEM_FLAG_MEMBERS = 2;
export const ITEM_FLAG_TEXTURED = 4;

export interface WearableItem {
    id: number;
    name: string;
    slot: number;
    hides: number[];
    models: Record<Gender, number[]>;
    offset: Record<Gender, number>;
    recolor: [number, number][];
    retexture: [number, number][];
    geTradeable: boolean;
    members: boolean;
    textured: boolean;
}

export function unpackItem(packed: PackedItem): WearableItem {
    const [id, name, slot, hides, male, maleOffset, female, femaleOffset, recolor, retexture, flags] = packed;
    return {
        id,
        name,
        slot,
        hides,
        models: { male, female },
        offset: { male: maleOffset, female: femaleOffset },
        recolor,
        retexture,
        geTradeable: (flags & ITEM_FLAG_GE_TRADEABLE) !== 0,
        members: (flags & ITEM_FLAG_MEMBERS) !== 0,
        textured: (flags & ITEM_FLAG_TEXTURED) !== 0,
    };
}

/**
 * One decoded model as stored in static/transmog/models/<id>.json. Optional arrays are left out
 * when every face has the default (0, or -1 for textures).
 */
export interface ModelFile {
    /** x, y, z per vertex; y points down. */
    v: number[];
    /** Skeleton label per vertex. */
    l: number[];
    /** a, b, c per face. */
    f: number[];
    /** HSL colour per face. */
    c: number[];
    /** Render type per face: 0 smooth, 1 flat, 2 hidden, 3 flat black. */
    r?: number[];
    /** Draw priority per face. */
    p: number[];
    /** Transparency per face, 0 opaque to 255 invisible. */
    a?: number[];
    /** Texture id per face, -1 for none. */
    t?: number[];
    /** Texture triangle index per face, -1 to map the face onto itself. */
    tc?: number[];
    /** Texture triangles as P, M, N vertex indices. */
    tt?: number[];
}
