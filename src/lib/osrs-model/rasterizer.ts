/**
 * A small software renderer that draws a posed player the way the OSRS client's Rasterizer3D does:
 * vertices are rotated with integer maths and projected to whole pixels, faces are ordered by the
 * client's priority-and-distance scheme rather than a depth buffer, and each face's lightness is
 * blended across it through the game's 65,536-colour HSL palette. Faces are filled at full
 * resolution, but vertices can be snapped to a coarser grid (`snap`) to keep the game's wobble.
 */
import { COSINE, SINE, type PlayerModel } from './player-model';

/**
 * Port of RuneLite's JagexColor.HSLtoRGB: the client's palette for a given brightness setting,
 * from 0.6 (brightest) to 0.9 (darkest). Entries are packed as 0xRRGGBB.
 */
export function createPalette(brightness: number): Uint32Array {
    const palette = new Uint32Array(65536);
    for (let hsl = 0; hsl < 65536; hsl++) {
        const hue = ((hsl >> 10) & 63) / 64 + 0.5 / 64;
        const saturation = ((hsl >> 7) & 7) / 8 + 0.5 / 8;
        const luminance = (hsl & 127) / 128;
        const chroma = (1 - Math.abs(2 * luminance - 1)) * saturation;
        const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1));
        const lightness = luminance - chroma / 2;
        let r = lightness;
        let g = lightness;
        let b = lightness;
        switch (Math.trunc(hue * 6)) {
            case 0:
                r += chroma;
                g += x;
                break;
            case 1:
                g += chroma;
                r += x;
                break;
            case 2:
                g += chroma;
                b += x;
                break;
            case 3:
                b += chroma;
                g += x;
                break;
            case 4:
                b += chroma;
                r += x;
                break;
            default:
                r += chroma;
                b += x;
                break;
        }
        palette[hsl] =
            (gamma(Math.trunc(r * 256), brightness) << 16) |
            (gamma(Math.trunc(g * 256), brightness) << 8) |
            gamma(Math.trunc(b * 256), brightness);
    }
    return palette;
}

/** The brightness setting is a gamma curve over 8-bit channels. */
function gamma(channel: number, brightness: number): number {
    return Math.min(255, Math.trunc(Math.pow(channel / 256, brightness) * 256));
}

export interface Texture {
    /** Width and height; textures are square. */
    size: number;
    /** Brightness-adjusted pixels as little-endian RGBA (0xAABBGGRR); alpha 0 is see-through. */
    pixels: Uint32Array;
    /** Scroll per client cycle as [du, dv] in 128ths of the texture. */
    animation: [number, number];
}

/** Applies the palette's brightness curve to a texture loaded as RGBA bytes. */
export function prepareTexture(
    rgba: Uint8ClampedArray,
    size: number,
    brightness: number,
    animation: [number, number],
): Texture {
    const pixels = new Uint32Array(size * size);
    for (let i = 0; i < size * size; i++) {
        if (rgba[i * 4 + 3] < 128) continue;
        const r = gamma(rgba[i * 4], brightness);
        const g = gamma(rgba[i * 4 + 1], brightness);
        const b = gamma(rgba[i * 4 + 2], brightness);
        pixels[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
    return { size, pixels, animation };
}

export interface Camera {
    /** Turn of the model about its vertical axis, in the game's 2048ths of a circle. */
    yaw: number;
    /** Tilt of the camera looking down at the model, in 2048ths. */
    pitch: number;
    /** Distance from the camera to the model's origin, in model units (128 to a tile). */
    distance: number;
    /** Projection scale: pixels per model unit at a depth of one unit. */
    zoom: number;
    /** Where the model's origin lands on screen. */
    centerX: number;
    centerY: number;
    /** Model units to raise the model by before it's turned, so the camera aims at its middle. */
    lift: number;
}

/**
 * Where priority-10 and -11 faces slot in among priorities 0-9, given their distance and the
 * average distances of the priority 1-2, 3-4 and 6-8 faces. Port of RuneLite's priority_map, which
 * mirrors the client's Model.draw0.
 */
export function adjustedPriority(
    p: number,
    distance: number,
    min10: number,
    avg1: number,
    avg2: number,
    avg3: number,
): number {
    switch (p) {
        case 0:
            return 2;
        case 1:
            return 3;
        case 2:
            return 4;
        case 3:
            return 7;
        case 4:
            return 8;
        case 5:
            return 11;
        case 6:
            return 12;
        case 7:
            return 13;
        case 8:
            return 14;
        case 9:
            return 15;
        case 10:
            if (distance > avg1) return 0;
            if (distance > avg2) return 5;
            if (distance > avg3) return 9;
            return 16;
        case 11:
            if (distance > avg1 && min10 > avg1) return 1;
            if (distance > avg2 && (min10 > avg1 || min10 > avg2)) return 6;
            if (distance > avg3 && (min10 > avg1 || min10 > avg2 || min10 > avg3)) return 10;
            return 17;
        default:
            return 0;
    }
}

/**
 * The order to draw faces in: by adjusted priority, then farthest first, then lowest face index.
 * `distances` holds each face's depth; faces not in `visible` are left out.
 */
export function drawOrder(visible: number[], priorities: ArrayLike<number>, distances: ArrayLike<number>): number[] {
    const count = new Array(12).fill(0);
    const total = new Array(12).fill(0);
    let min10 = Number.MAX_SAFE_INTEGER;
    for (const f of visible) {
        const p = priorities[f];
        count[p]++;
        total[p] += distances[f];
        if (p === 10) min10 = Math.min(min10, distances[f]);
    }
    const average = (a: number, b: number) =>
        count[a] + count[b] > 0 ? Math.trunc((total[a] + total[b]) / (count[a] + count[b])) : -6000;
    const avg1 = average(1, 2);
    const avg2 = average(3, 4);
    const avg3 = average(6, 8);
    const adjusted = new Map<number, number>();
    for (const f of visible) adjusted.set(f, adjustedPriority(priorities[f], distances[f], min10, avg1, avg2, avg3));
    return [...visible].sort((a, b) => adjusted.get(a)! - adjusted.get(b)! || distances[b] - distances[a] || a - b);
}

export class Rasterizer {
    readonly pixels: Uint32Array;
    readonly image: ImageData;
    private screenX: Int32Array;
    private screenY: Int32Array;
    private depth: Int32Array;
    private faceDistance: Int32Array;
    private readonly rgba = new Uint32Array(65536);
    /** The topmost and bottommost pixel rows the last drawn model reached. */
    top = 0;
    bottom = 0;
    /** Client cycle, for scrolling animated textures. */
    cycle = 0;
    /**
     * Grid, in pixels, that projected vertices are snapped to. At 1 they land on whole pixels as in
     * the game; larger values keep the game's jittery joints when drawing at high resolution.
     */
    snap = 1;

    constructor(
        readonly width: number,
        readonly height: number,
        palette: Uint32Array,
        /** Textures the current model uses, by id; faces whose texture is missing are skipped. */
        public textures: Map<number, Texture> = new Map(),
    ) {
        this.image = new ImageData(width, height);
        this.pixels = new Uint32Array(this.image.data.buffer);
        this.screenX = new Int32Array(0);
        this.screenY = new Int32Array(0);
        this.depth = new Int32Array(0);
        this.faceDistance = new Int32Array(0);
        // ImageData is RGBA in memory, which a little-endian Uint32 reads as 0xAABBGGRR.
        for (let i = 0; i < 65536; i++) {
            const rgb = palette[i];
            this.rgba[i] = (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff)) >>> 0;
        }
    }

    clear(): void {
        this.pixels.fill(0);
    }

    draw(model: PlayerModel, camera: Camera): void {
        const { mesh } = model;
        if (this.screenX.length < model.vertexCount) {
            this.screenX = new Int32Array(model.vertexCount);
            this.screenY = new Int32Array(model.vertexCount);
            this.depth = new Int32Array(model.vertexCount);
        }
        if (this.faceDistance.length < model.faceCount) this.faceDistance = new Int32Array(model.faceCount);
        const { screenX, screenY, depth, faceDistance } = this;
        const sinYaw = SINE[camera.yaw & 2047];
        const cosYaw = COSINE[camera.yaw & 2047];
        const sinPitch = SINE[camera.pitch & 2047];
        const cosPitch = COSINE[camera.pitch & 2047];
        let top = this.height;
        let bottom = 0;

        for (let v = 0; v < model.vertexCount; v++) {
            const x = model.x[v];
            const y = model.y[v] + camera.lift;
            const z = model.z[v];
            const rx = (z * sinYaw + x * cosYaw) >> 16;
            const rz = (z * cosYaw - x * sinYaw) >> 16;
            const ry = (y * cosPitch - rz * sinPitch) >> 16;
            const depthZ = ((y * sinPitch + rz * cosPitch) >> 16) + camera.distance;
            depth[v] = depthZ;
            // Integer division, so every vertex lands on a whole pixel.
            const sx = Math.trunc((rx * camera.zoom) / depthZ);
            const sy = Math.trunc((ry * camera.zoom) / depthZ);
            screenX[v] = camera.centerX + (this.snap > 1 ? Math.round(sx / this.snap) * this.snap : sx);
            screenY[v] = camera.centerY + (this.snap > 1 ? Math.round(sy / this.snap) * this.snap : sy);
            if (screenY[v] < top) top = screenY[v];
            if (screenY[v] > bottom) bottom = screenY[v];
        }
        this.top = top;
        this.bottom = bottom;

        const { faces, colors } = mesh;
        const visible: number[] = [];
        for (let f = 0; f < model.faceCount; f++) {
            if (colors[f * 3 + 2] === -2) continue;
            const a = faces[f * 3];
            const b = faces[f * 3 + 1];
            const c = faces[f * 3 + 2];
            // Back faces wind the other way once projected; the client skips them the same way.
            if (
                (screenX[a] - screenX[b]) * (screenY[c] - screenY[b]) -
                    (screenX[c] - screenX[b]) * (screenY[a] - screenY[b]) <=
                0
            )
                continue;
            faceDistance[f] = Math.trunc((depth[a] + depth[b] + depth[c]) / 3);
            visible.push(f);
        }

        for (const f of drawOrder(visible, mesh.priorities, faceDistance)) {
            const a = faces[f * 3];
            const b = faces[f * 3 + 1];
            const c = faces[f * 3 + 2];
            const c1 = colors[f * 3];
            const flat = colors[f * 3 + 2] === -1;
            const c2 = flat ? c1 : colors[f * 3 + 1];
            const c3 = flat ? c1 : colors[f * 3 + 2];
            const alpha = mesh.alphas[f];
            const texture = mesh.textures[f] === -1 ? undefined : this.textures.get(mesh.textures[f]);
            if (texture) {
                this.texturedTriangle(f, a, b, c, c1, c2, c3, alpha, texture, mesh.uvs);
            } else {
                this.triangle(
                    screenX[a],
                    screenY[a],
                    screenX[b],
                    screenY[b],
                    screenX[c],
                    screenY[c],
                    c1,
                    c2,
                    c3,
                    alpha,
                );
            }
        }
    }

    /** Writes one pixel, blending by the client's alpha (0 opaque, 255 invisible). */
    private plot(index: number, src: number, alpha: number): void {
        if (alpha === 0) {
            this.pixels[index] = src;
            return;
        }
        const dst = this.pixels[index];
        const keep = 256 - alpha;
        const r = (((src & 0xff) * keep + (dst & 0xff) * alpha) >> 8) & 0xff;
        const g = ((((src >> 8) & 0xff) * keep + ((dst >> 8) & 0xff) * alpha) >> 8) & 0xff;
        const b = ((((src >> 16) & 0xff) * keep + ((dst >> 16) & 0xff) * alpha) >> 8) & 0xff;
        // An empty pixel behind a see-through face stays partly see-through.
        const a = dst >>> 24 === 0 ? 255 - alpha : 255;
        this.pixels[index] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }

    /**
     * Fills one Gouraud triangle. Hue and saturation are the same at every corner, so only the
     * 7-bit lightness is blended, and it's truncated per pixel, which gives the game's banding.
     */
    private triangle(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        c0: number,
        c1: number,
        c2: number,
        alpha: number,
    ): void {
        const { width, height, rgba } = this;
        const minX = Math.max(0, Math.min(x0, x1, x2));
        const maxX = Math.min(width - 1, Math.max(x0, x1, x2));
        const minY = Math.max(0, Math.min(y0, y1, y2));
        const maxY = Math.min(height - 1, Math.max(y0, y1, y2));
        if (minX > maxX || minY > maxY) return;

        const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
        if (area === 0) return;
        const base = c0 & 0xff80;
        const l0 = c0 & 127;
        const l1 = c1 & 127;
        const l2 = c2 & 127;

        for (let py = minY; py <= maxY; py++) {
            const row = py * width;
            for (let px = minX; px <= maxX; px++) {
                // Edge functions at the pixel's top-left corner, matching whole-pixel vertices.
                const w0 = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
                const w1 = (x0 - x2) * (py - y2) - (y0 - y2) * (px - x2);
                const w2 = (x1 - x0) * (py - y0) - (y1 - y0) * (px - x0);
                if (area > 0 ? w0 < 0 || w1 < 0 || w2 < 0 : w0 > 0 || w1 > 0 || w2 > 0) continue;
                const light = Math.trunc((w0 * l0 + w1 * l1 + w2 * l2) / area);
                this.plot(row + px, rgba[base | (light & 127)], alpha);
            }
        }
    }

    /**
     * Fills one textured triangle with perspective-correct coordinates. The texel is darkened by
     * the face's lightness (2-126, out of 127) as RuneLite's GPU renderer does, texels with no
     * alpha are skipped, and animated textures scroll with the client cycle.
     */
    private texturedTriangle(
        f: number,
        a: number,
        b: number,
        c: number,
        l0: number,
        l1: number,
        l2: number,
        alpha: number,
        texture: Texture,
        uvs: Float32Array,
    ): void {
        const { width, height, screenX, screenY, depth } = this;
        const x0 = screenX[a];
        const y0 = screenY[a];
        const x1 = screenX[b];
        const y1 = screenY[b];
        const x2 = screenX[c];
        const y2 = screenY[c];
        const minX = Math.max(0, Math.min(x0, x1, x2));
        const maxX = Math.min(width - 1, Math.max(x0, x1, x2));
        const minY = Math.max(0, Math.min(y0, y1, y2));
        const maxY = Math.min(height - 1, Math.max(y0, y1, y2));
        if (minX > maxX || minY > maxY) return;
        const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
        if (area === 0) return;

        const iz0 = 1 / depth[a];
        const iz1 = 1 / depth[b];
        const iz2 = 1 / depth[c];
        const tick = (this.cycle & 127) / 128;
        const shiftU = texture.animation[0] * tick;
        const shiftV = texture.animation[1] * tick;
        const u0 = (uvs[f * 6] + shiftU) * iz0;
        const v0 = (uvs[f * 6 + 1] + shiftV) * iz0;
        const u1 = (uvs[f * 6 + 2] + shiftU) * iz1;
        const v1 = (uvs[f * 6 + 3] + shiftV) * iz1;
        const u2 = (uvs[f * 6 + 4] + shiftU) * iz2;
        const v2 = (uvs[f * 6 + 5] + shiftV) * iz2;
        const { size, pixels: texels } = texture;
        const mask = size - 1;

        for (let py = minY; py <= maxY; py++) {
            const row = py * width;
            for (let px = minX; px <= maxX; px++) {
                const w0 = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
                const w1 = (x0 - x2) * (py - y2) - (y0 - y2) * (px - x2);
                const w2 = (x1 - x0) * (py - y0) - (y1 - y0) * (px - x0);
                if (area > 0 ? w0 < 0 || w1 < 0 || w2 < 0 : w0 > 0 || w1 > 0 || w2 > 0) continue;
                const iz = w0 * iz0 + w1 * iz1 + w2 * iz2;
                const tu = Math.floor(((w0 * u0 + w1 * u1 + w2 * u2) / iz) * size) & mask;
                const tv = Math.floor(((w0 * v0 + w1 * v1 + w2 * v2) / iz) * size) & mask;
                const texel = texels[tv * size + tu];
                if (texel >>> 24 === 0) continue;
                const light = (w0 * l0 + w1 * l1 + w2 * l2) / area / 127;
                const r = Math.min(255, (texel & 0xff) * light);
                const g = Math.min(255, ((texel >> 8) & 0xff) * light);
                const bl = Math.min(255, ((texel >> 16) & 0xff) * light);
                this.plot(row + px, (0xff000000 | (bl << 16) | (g << 8) | r) >>> 0, alpha);
            }
        }
    }
}
