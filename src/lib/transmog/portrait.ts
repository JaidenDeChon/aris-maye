/**
 * Still pictures of an outfit, drawn once with the same renderer as the 3D viewer, for places
 * that show a character without the live preview (the My characters cards).
 */
import { PlayerModel } from '$lib/osrs-model/player-model';
import { createPalette, Rasterizer, type Camera } from '$lib/osrs-model/rasterizer';
import { BRIGHTNESS, buildOutfitMesh, loadTransmogData, type TransmogData } from './data';
import { idleFor, outfitParams, type Outfit } from './outfit';

/** Starting turn: a little toward the controls, as the game's character designer shows you. */
export const START_YAW = 1848;

/**
 * The camera the viewer and portraits share. At scale 1 a standing player (about 200 units tall)
 * fills roughly 80% of the height, leaving room for raised weapons. `middle` is how far down the
 * frame the player's middle sits, as a fraction of the height; lower it shows more of the top half.
 */
export function playerCamera(width: number, height: number, yaw: number, scale = 1, middle = 0.53): Camera {
    return {
        yaw,
        pitch: 96,
        distance: 1000,
        zoom: Math.round(height * 3.7 * scale),
        centerX: width >> 1,
        centerY: Math.round(height * middle),
        lift: 95,
    };
}

let data: Promise<TransmogData> | null = null;

/** The manifest and item list, fetched once however many portraits ask for them. */
function sharedData(): Promise<TransmogData> {
    if (!data) {
        data = loadTransmogData();
        // Let a failed fetch be retried next time.
        data.catch(() => (data = null));
    }
    return data;
}

const portraits = new Map<string, Promise<string | null>>();

/**
 * The outfit standing in its idle pose, as a PNG data URL with a transparent background, or null
 * if it couldn't be drawn. The same outfit at the same size is only drawn once per visit.
 */
export function renderPortrait(outfit: Outfit, width: number, height: number): Promise<string | null> {
    const key = `${outfitParams(outfit)}|${width}x${height}`;
    let pending = portraits.get(key);
    if (!pending) {
        pending = draw(outfit, width, height).catch((error) => {
            console.warn('Portrait failed to draw', error);
            portraits.delete(key);
            return null;
        });
        portraits.set(key, pending);
    }
    return pending;
}

let palette: Uint32Array | null = null;

/** Portraits are a head-and-torso shot: zoomed in, with the player's middle near the bottom edge. */
const PORTRAIT_ZOOM = 2;
const PORTRAIT_MIDDLE = 1;

async function draw(outfit: Outfit, width: number, height: number): Promise<string | null> {
    const loaded = await sharedData();
    const { mesh, textures } = await buildOutfitMesh(loaded, outfit);
    const { manifest } = loaded;
    const model = new PlayerModel(mesh, manifest.framemaps);
    const idle = manifest.animations[idleFor(outfit, manifest.stances)] ?? manifest.animations.idle;
    model.pose(idle?.frames[0] ?? null);

    palette ??= createPalette(BRIGHTNESS);
    const rasterizer = new Rasterizer(width, height, palette, textures);
    // Keep the game's chunky joints at the larger sizes, as the viewer does.
    rasterizer.snap = Math.max(1, Math.round(height / 200));
    rasterizer.clear();
    rasterizer.draw(model, playerCamera(width, height, START_YAW, PORTRAIT_ZOOM, PORTRAIT_MIDDLE));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(rasterizer.image, 0, 0);
    return canvas.toDataURL('image/png');
}
