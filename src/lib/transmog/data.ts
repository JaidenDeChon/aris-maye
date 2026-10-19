/**
 * Loads the transmog data from /transmog/ in the browser: the manifest and item list once, then
 * models and textures as outfits need them, each fetched only once per visit.
 */
import { composeOutfit, modelsForOutfit, type Mesh } from '$lib/osrs-model/compose';
import { prepareTexture, type Texture } from '$lib/osrs-model/rasterizer';
import {
    TRANSMOG_DATA_VERSION,
    unpackItem,
    type ModelFile,
    type PackedItem,
    type TransmogManifest,
    type WearableItem,
} from '$lib/osrs-model/types';
import type { Outfit } from './outfit';

const BASE = '/transmog';

/** The game's default brightness setting, as a gamma for the palette and textures. */
export const BRIGHTNESS = 0.7;

export interface TransmogData {
    manifest: TransmogManifest;
    items: Map<number, WearableItem>;
    /** Items sorted by name, for searching. */
    itemList: WearableItem[];
}

async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${BASE}/${path}`);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return (await response.json()) as T;
}

export async function loadTransmogData(): Promise<TransmogData> {
    const [manifest, packed] = await Promise.all([
        getJson<TransmogManifest>('manifest.json'),
        getJson<PackedItem[]>('items.json'),
    ]);
    if (manifest.version !== TRANSMOG_DATA_VERSION) throw new Error(`Unexpected data version ${manifest.version}`);
    const itemList = packed.map(unpackItem).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    return { manifest, items: new Map(itemList.map((item) => [item.id, item])), itemList };
}

const models = new Map<number, Promise<ModelFile>>();
const textures = new Map<number, Promise<Texture | null>>();

function loadModel(id: number): Promise<ModelFile> {
    let pending = models.get(id);
    if (!pending) {
        pending = getJson<ModelFile>(`models/${id}.json`);
        // Let a failed fetch be retried next time.
        pending.catch(() => models.delete(id));
        models.set(id, pending);
    }
    return pending;
}

function loadTexture(id: number, manifest: TransmogManifest): Promise<Texture | null> {
    let pending = textures.get(id);
    if (!pending) {
        pending = new Promise<Texture | null>((resolve) => {
            const image = new Image();
            image.onload = () => {
                const size = image.naturalWidth;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return resolve(null);
                ctx.drawImage(image, 0, 0);
                const rgba = ctx.getImageData(0, 0, size, size).data;
                resolve(prepareTexture(rgba, size, BRIGHTNESS, manifest.textureAnimations[id] ?? [0, 0]));
            };
            // A missing texture leaves the faces in their plain colour rather than breaking the outfit.
            image.onerror = () => resolve(null);
            image.src = `${BASE}/textures/${id}.png`;
        });
        textures.set(id, pending);
    }
    return pending;
}

/** Composes an outfit, fetching any models and textures it needs first. */
export async function buildOutfitMesh(
    data: TransmogData,
    outfit: Outfit,
): Promise<{ mesh: Mesh; textures: Map<number, Texture> }> {
    const ids = modelsForOutfit(data.manifest, data.items, outfit.gender, outfit.equipment);
    const files = await Promise.all(ids.map(loadModel));
    const loaded = new Map(ids.map((id, i) => [id, files[i]]));
    const mesh = composeOutfit(data.manifest, data.items, loaded, outfit.gender, outfit.equipment);
    const textureIds = [...new Set(Array.from(mesh.textures).filter((t) => t >= 0))];
    const loadedTextures = await Promise.all(textureIds.map((id) => loadTexture(id, data.manifest)));
    const textureMap = new Map<number, Texture>();
    textureIds.forEach((id, i) => {
        const texture = loadedTextures[i];
        if (texture) textureMap.set(id, texture);
    });
    return { mesh, textures: textureMap };
}

/** The game's empty-slot outline (or `tile`, the stone square behind every slot). */
export function slotSprite(key: string): string {
    return `${BASE}/ui/${key}.png`;
}

/** The emote tab's icon for an emote (keyed as in EMOTES). */
export function emoteIcon(key: string): string {
    return `${BASE}/ui/emotes/${key}.png`;
}
