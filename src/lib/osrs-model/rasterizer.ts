/**
 * A small software renderer that draws a posed player model the way the OSRS client's
 * Rasterizer3D does: vertices are rotated with integer maths and projected to whole pixels, faces
 * are painter-sorted rather than depth-buffered, and each face's lightness is blended across it
 * through the game's 65,536-colour HSL palette. Drawing at a low resolution and scaling the canvas
 * up without smoothing gives the wobbling, snapping edges of the real thing.
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
        // The brightness setting is a gamma curve over the 8-bit channels.
        const channel = (c: number) => Math.trunc(Math.pow(Math.trunc(c * 256) / 256, brightness) * 256);
        palette[hsl] = (channel(r) << 16) | (channel(g) << 8) | channel(b);
    }
    return palette;
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

export class Rasterizer {
    readonly pixels: Uint32Array;
    readonly image: ImageData;
    private readonly screenX: Int32Array;
    private readonly screenY: Int32Array;
    private readonly depth: Int32Array;
    private order: Int32Array;
    private faceDepth: Float64Array;
    private readonly rgba = new Uint32Array(65536);
    /** The topmost pixel row the last drawn model reached, for placing overhead text. */
    top = 0;

    constructor(
        readonly width: number,
        readonly height: number,
        palette: Uint32Array,
        vertexCapacity: number,
        faceCapacity: number,
    ) {
        this.image = new ImageData(width, height);
        this.pixels = new Uint32Array(this.image.data.buffer);
        this.screenX = new Int32Array(vertexCapacity);
        this.screenY = new Int32Array(vertexCapacity);
        this.depth = new Int32Array(vertexCapacity);
        this.order = new Int32Array(faceCapacity);
        this.faceDepth = new Float64Array(faceCapacity);
        // ImageData is RGBA in memory, which a little-endian Uint32 reads as 0xAABBGGRR.
        for (let i = 0; i < 65536; i++) {
            const rgb = palette[i];
            this.rgba[i] = 0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff);
        }
    }

    clear(): void {
        this.pixels.fill(0);
    }

    draw(model: PlayerModel, camera: Camera): void {
        const { screenX, screenY, depth } = this;
        const sinYaw = SINE[camera.yaw & 2047];
        const cosYaw = COSINE[camera.yaw & 2047];
        const sinPitch = SINE[camera.pitch & 2047];
        const cosPitch = COSINE[camera.pitch & 2047];
        let top = this.height;

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
            screenX[v] = camera.centerX + Math.trunc((rx * camera.zoom) / depthZ);
            screenY[v] = camera.centerY + Math.trunc((ry * camera.zoom) / depthZ);
            if (screenY[v] < top) top = screenY[v];
        }
        this.top = top;

        const { faces, colors } = model.data;
        const faceCount = model.faceCount;
        for (let f = 0; f < faceCount; f++) {
            this.order[f] = f;
            this.faceDepth[f] = depth[faces[f * 3]] + depth[faces[f * 3 + 1]] + depth[faces[f * 3 + 2]];
        }
        // Painter's algorithm: farthest faces first, as the client's depth buckets do.
        const faceDepth = this.faceDepth;
        const sorted = Array.from(this.order.subarray(0, faceCount)).sort((a, b) => faceDepth[b] - faceDepth[a]);

        for (const f of sorted) {
            const a = faces[f * 3];
            const b = faces[f * 3 + 1];
            const c = faces[f * 3 + 2];
            const xa = screenX[a];
            const ya = screenY[a];
            const xb = screenX[b];
            const yb = screenY[b];
            const xc = screenX[c];
            const yc = screenY[c];
            // Back faces wind the other way once projected; the client skips them the same way.
            if ((xa - xb) * (yc - yb) - (ya - yb) * (xc - xb) <= 0) continue;
            const c1 = colors[f * 3];
            const c3 = colors[f * 3 + 2];
            if (c3 === -1) this.triangle(xa, ya, xb, yb, xc, yc, c1, c1, c1);
            else if (c3 !== -2) this.triangle(xa, ya, xb, yb, xc, yc, c1, colors[f * 3 + 1], c3);
        }
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
    ): void {
        const { width, height, pixels, rgba } = this;
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
                pixels[row + px] = rgba[base | (light & 127)];
            }
        }
    }
}
