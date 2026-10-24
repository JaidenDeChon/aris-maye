/**
 * Builds the transmog data in static/transmog/ from the live OSRS cache:
 *
 *   manifest.json   default male and female bodies, animations, skeletons, texture scrolling
 *   items.json      every wearable item (see PackedItem in src/lib/osrs-model/types.ts)
 *   models/<id>.json  each worn or body model, decoded
 *   textures/<id>.png the textures those models use
 *
 * The data isn't committed. `ensureTransmogData` runs at build time (see vite-plugin.ts): it reuses
 * output that already matches the newest cache, otherwise downloads that cache and regenerates,
 * and falls back to the last good output if OpenRS2 can't be reached.
 */
import { closeGaps } from './close-gaps';
import { TRANSMOG_STANCES } from './paths';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import {
    ITEM_FLAG_GE_TRADEABLE,
    ITEM_FLAG_MEMBERS,
    ITEM_FLAG_TEXTURED,
    TRANSMOG_DATA_VERSION,
    type Animation,
    type BodyKit,
    type Framemap,
    type ModelFile,
    type PackedItem,
    type TransmogManifest,
} from '../../src/lib/osrs-model/types';
import { DiskCache, downloadDiskCache, latestOsrsCache, type CacheSource } from '../osrs-cache/cache';
import {
    decodeFrame,
    decodeFramemap,
    decodeItem,
    decodeKit,
    decodeModel,
    decodeSequence,
    decodeSprite,
    decodeTexture,
    frameFramemapId,
    type FramemapDefinition,
    type ItemDefinition,
    type KitDefinition,
    type ModelDefinition,
} from '../osrs-cache/definitions';

const INDEX_FRAMES = 0;
const INDEX_FRAMEMAPS = 1;
const INDEX_CONFIGS = 2;
const INDEX_MODELS = 7;
const INDEX_SPRITES = 8;
const INDEX_TEXTURES = 9;
const CONFIG_IDENTKIT = 3;
const CONFIG_ITEM = 10;
const CONFIG_SEQUENCE = 12;

/**
 * Default bodies, as identity kit ids keyed by the equipment slot each one fills
 * (torso 4, arms 6, legs 7, hair 8, hands 9, feet 10, jaw 11). The male is bald and clean-shaven;
 * the female has no bald option, so she gets the first hairstyle. Both need a jaw: the head models
 * leave the chin and mouth open for it. Kits 14 and 296 are the plain ones, with no facial hair.
 */
const BODIES = {
    male: { 4: 18, 6: 26, 7: 36, 8: 0, 9: 33, 10: 42, 11: 14 },
    female: { 4: 56, 6: 61, 7: 70, 8: 45, 9: 67, 10: 79, 11: 296 },
} as const;

/** The equipment slots the tool lets you fill. Slot 11 items are minigame team icons. */
const WEARABLE_SLOTS = new Set([0, 1, 2, 3, 4, 5, 7, 9, 10]);

/** Equipment tab sprites: the empty-slot outlines, and the stone tile behind each slot. */
const UI_SPRITES: Record<string, number> = {
    head: 156,
    cape: 157,
    amulet: 158,
    weapon: 159,
    ring: 160,
    body: 161,
    shield: 162,
    legs: 163,
    hands: 164,
    feet: 165,
    ammo: 166,
    tile: 170,
    /** The bank's "deposit worn items" button, used for taking everything off. */
    removeAll: 1042,
};

/** Emote tab icons (the unlocked versions), keyed like ANIMATIONS. */
const EMOTE_ICONS: Record<string, number> = {
    yes: 700,
    no: 701,
    think: 702,
    bow: 703,
    angry: 704,
    cry: 705,
    laugh: 706,
    cheer: 707,
    wave: 708,
    beckon: 709,
    panic: 710,
    clap: 711,
    dance: 712,
    jig: 713,
    spin: 714,
    headbang: 715,
    jumpForJoy: 716,
    raspberry: 717,
    yawn: 718,
    salute: 719,
    shrug: 720,
    blowKiss: 721,
};

/** The standard idle and the emotes, named the way the emote tab names them. */
const ANIMATIONS: Record<string, number> = {
    idle: 808,
    yes: 855,
    no: 856,
    think: 857,
    bow: 858,
    angry: 859,
    cry: 860,
    laugh: 861,
    cheer: 862,
    wave: 863,
    beckon: 864,
    clap: 865,
    dance: 866,
    blowKiss: 1374,
    panic: 2105,
    jig: 2106,
    spin: 2107,
    headbang: 2108,
    jumpForJoy: 2109,
    raspberry: 2110,
    yawn: 2111,
    salute: 2112,
    shrug: 2113,
};

/** Weapon slot, the one whose item decides the stance. */
const SLOT_WEAPON = 3;

type Log = (message: string) => void;

/**
 * Stand animation per kept weapon, by item id. The table lists one id per item, so a variant it
 * doesn't name (poisoned, ornamented, a different charge) takes the stance of one with its name.
 */
function weaponStances(all: ItemDefinition[], kept: ItemDefinition[]): Map<number, number> {
    const listed = (JSON.parse(readFileSync(TRANSMOG_STANCES, 'utf8')) as { items: Record<string, number> }).items;
    const byName = new Map<string, number>();
    for (const item of all) {
        const stand = listed[item.id];
        if (stand !== undefined && !byName.has(item.name)) byName.set(item.name, stand);
    }
    const stances = new Map<number, number>();
    for (const item of kept) {
        if (item.wearPos1 !== SLOT_WEAPON) continue;
        const stand = listed[item.id] ?? byName.get(item.name);
        if (stand !== undefined) stances.set(item.id, stand);
    }
    return stances;
}

function packModel(model: ModelDefinition): ModelFile {
    const anyNonZero = (xs: number[]) => xs.some((x) => x !== 0);
    const out: ModelFile = {
        v: model.vertexX.flatMap((x, i) => [x, model.vertexY[i], model.vertexZ[i]]),
        l: model.vertexLabels,
        f: model.faceA.flatMap((a, i) => [a, model.faceB[i], model.faceC[i]]),
        c: model.faceColors,
        p: model.facePriorities,
    };
    if (anyNonZero(model.faceRenderTypes)) out.r = model.faceRenderTypes;
    if (anyNonZero(model.faceAlphas)) out.a = model.faceAlphas;
    if (model.faceTextures.some((t) => t !== -1)) {
        out.t = model.faceTextures;
        out.tc = model.faceTextureCoords;
        out.tt = model.texA.flatMap((p, i) => [p, model.texB[i], model.texC[i]]);
    }
    return out;
}

/** The first frame of a sprite group as a PNG. */
function spritePng(data: Uint8Array): Buffer {
    const sprite = decodeSprite(data);
    const png = new PNG({ width: sprite.width, height: sprite.height });
    for (let i = 0; i < sprite.pixels.length; i++) {
        const argb = sprite.pixels[i];
        png.data[i * 4] = (argb >> 16) & 0xff;
        png.data[i * 4 + 1] = (argb >> 8) & 0xff;
        png.data[i * 4 + 2] = argb & 0xff;
        png.data[i * 4 + 3] = argb >>> 24;
    }
    return PNG.sync.write(png);
}

/** Scroll direction per texture, as RuneLite's GPU TextureManager reads it. */
function textureScroll(direction: number, speed: number): [number, number] {
    if (direction === 1) return [0, -speed];
    if (direction === 2) return [-speed, 0];
    if (direction === 3) return [0, speed];
    if (direction === 4) return [speed, 0];
    return [0, 0];
}

/** Decodes everything the tool needs from an unpacked cache into `outDir`. */
export function extractTransmogData(
    cacheDir: string,
    source: CacheSource,
    outDir: string,
    log: Log = console.log,
): void {
    const cache = new DiskCache(cacheDir);
    try {
        rmSync(outDir, { recursive: true, force: true });
        mkdirSync(join(outDir, 'models'), { recursive: true });
        mkdirSync(join(outDir, 'textures'), { recursive: true });
        mkdirSync(join(outDir, 'ui'), { recursive: true });

        // Bodies
        const kitFiles = cache.files(INDEX_CONFIGS, CONFIG_IDENTKIT);
        const kitToBody = (kit: KitDefinition): BodyKit => ({
            models: kit.models,
            recolor: kit.recolorToFind.map((f, i) => [f, kit.recolorToReplace[i]]),
            retexture: kit.retextureToFind.map((f, i) => [f, kit.retextureToReplace[i]]),
        });
        const bodies = { male: {}, female: {} } as TransmogManifest['bodies'];
        const modelIds = new Set<number>();
        for (const gender of ['male', 'female'] as const) {
            for (const [slot, kitId] of Object.entries(BODIES[gender])) {
                const kit = decodeKit(kitId, kitFiles.get(kitId)!);
                bodies[gender][Number(slot)] = kitToBody(kit);
                kit.models.forEach((m) => modelIds.add(m));
            }
        }

        // Items: skip noted/placeholder copies, and keep one of each identical-looking variant,
        // preferring the GE-tradeable one so it can show a price.
        const items: ItemDefinition[] = [];
        for (const [id, data] of cache.files(INDEX_CONFIGS, CONFIG_ITEM)) {
            const item = decodeItem(id, data);
            if (item.isTemplateCopy || !item.name.trim() || item.name === 'null' || !WEARABLE_SLOTS.has(item.wearPos1))
                continue;
            if (item.maleModels[0] < 0 && item.femaleModels[0] < 0) continue;
            items.push(item);
        }
        const byLook = new Map<string, ItemDefinition>();
        for (const item of items) {
            const key = JSON.stringify([
                item.name,
                item.wearPos1,
                item.maleModels,
                item.femaleModels,
                item.maleOffset,
                item.femaleOffset,
                item.recolorToFind,
                item.recolorToReplace,
                item.retextureToFind,
                item.retextureToReplace,
            ]);
            const existing = byLook.get(key);
            if (!existing || (item.geTradeable && !existing.geTradeable)) byLook.set(key, item);
        }
        const kept = [...byLook.values()].sort((a, b) => a.id - b.id);
        for (const item of kept)
            [...item.maleModels, ...item.femaleModels].filter((m) => m >= 0).forEach((m) => modelIds.add(m));

        // Models
        const textureIds = new Set<number>();
        const texturedModels = new Set<number>();
        let failed = 0;
        for (const id of modelIds) {
            const data = cache.group(INDEX_MODELS, id);
            if (!data) {
                failed++;
                continue;
            }
            try {
                const model = decodeModel(id, data);
                const file = packModel(model);
                if (file.t) {
                    texturedModels.add(id);
                    file.t.forEach((t) => t >= 0 && textureIds.add(t));
                }
                writeFileSync(join(outDir, 'models', `${id}.json`), JSON.stringify(file));
            } catch (error) {
                failed++;
                log(`  model ${id}: ${(error as Error).message}`);
            }
        }
        const written = (id: number) => existsSync(join(outDir, 'models', `${id}.json`));

        // Close the small gap where each default head (hair, slot 8) meets its jaw (slot 11).
        for (const gender of ['male', 'female'] as const) {
            const [headId] = bodies[gender][8]?.models ?? [];
            const [jawId] = bodies[gender][11]?.models ?? [];
            if (headId === undefined || jawId === undefined || !written(headId) || !written(jawId)) continue;
            const read = (id: number) =>
                JSON.parse(readFileSync(join(outDir, 'models', `${id}.json`), 'utf8')) as ModelFile;
            const jaw = closeGaps(read(headId), read(jawId));
            writeFileSync(join(outDir, 'models', `${jawId}.json`), JSON.stringify(jaw));
        }

        const packed: PackedItem[] = [];
        for (const item of kept) {
            const male = item.maleModels.filter((m) => m >= 0);
            const female = item.femaleModels.filter((m) => m >= 0);
            if (![...male, ...female].every(written)) continue;
            item.retextureToReplace.forEach((t) => textureIds.add(t));
            const textured = [...male, ...female].some((m) => texturedModels.has(m));
            const flags =
                (item.geTradeable ? ITEM_FLAG_GE_TRADEABLE : 0) |
                (item.members ? ITEM_FLAG_MEMBERS : 0) |
                (textured ? ITEM_FLAG_TEXTURED : 0);
            packed.push([
                item.id,
                item.name,
                item.wearPos1,
                [item.wearPos2, item.wearPos3].filter((s) => s >= 0),
                male,
                item.maleOffset,
                female,
                item.femaleOffset,
                item.recolorToFind.map((f, i) => [f, item.recolorToReplace[i]]),
                item.retextureToFind.map((f, i) => [f, item.retextureToReplace[i]]),
                flags,
            ]);
        }

        // Textures
        const textureFiles = cache.files(INDEX_TEXTURES, 0);
        const textureAnimations: TransmogManifest['textureAnimations'] = {};
        for (const id of textureIds) {
            const data = textureFiles.get(id);
            if (!data) continue;
            const texture = decodeTexture(id, data);
            const spriteData = cache.group(INDEX_SPRITES, texture.spriteId);
            if (!spriteData) continue;
            writeFileSync(join(outDir, 'textures', `${id}.png`), spritePng(spriteData));
            const scroll = textureScroll(texture.animationDirection, texture.animationSpeed);
            if (scroll[0] || scroll[1]) textureAnimations[id] = scroll;
        }

        for (const [name, spriteId] of Object.entries(UI_SPRITES)) {
            const spriteData = cache.group(INDEX_SPRITES, spriteId);
            if (spriteData) writeFileSync(join(outDir, 'ui', `${name}.png`), spritePng(spriteData));
        }
        mkdirSync(join(outDir, 'ui', 'emotes'), { recursive: true });
        for (const [name, spriteId] of Object.entries(EMOTE_ICONS)) {
            const spriteData = cache.group(INDEX_SPRITES, spriteId);
            if (spriteData) writeFileSync(join(outDir, 'ui', 'emotes', `${name}.png`), spritePng(spriteData));
        }

        // Animations
        const sequenceFiles = cache.files(INDEX_CONFIGS, CONFIG_SEQUENCE);
        const framemapDefs = new Map<number, FramemapDefinition>();
        const frameGroups = new Map<number, Map<number, Uint8Array>>();
        /** A sequence's frames, or null for a skeletal animation, which the renderer can't play. */
        const readAnimation = (sequenceId: number): Animation | null => {
            const sequence = decodeSequence(sequenceId, sequenceFiles.get(sequenceId)!);
            if (sequence.animMayaId !== -1) return null;
            const frames: number[][] = [];
            for (const frameId of sequence.frameIds) {
                const group = frameId >>> 16;
                if (!frameGroups.has(group)) frameGroups.set(group, cache.files(INDEX_FRAMES, group));
                const data = frameGroups.get(group)!.get(frameId & 0xffff)!;
                const framemapId = frameFramemapId(data);
                if (!framemapDefs.has(framemapId)) {
                    const files = cache.files(INDEX_FRAMEMAPS, framemapId);
                    framemapDefs.set(framemapId, decodeFramemap(framemapId, files.values().next().value!));
                }
                const frame = decodeFrame(framemapDefs.get(framemapId)!, data);
                const packedFrame = [framemapId];
                frame.slots.forEach((slot, i) => packedFrame.push(slot, frame.dx[i], frame.dy[i], frame.dz[i]));
                frames.push(packedFrame);
            }
            return { lengths: sequence.frameLengths, frames };
        };
        const animations: Record<string, Animation> = {};
        for (const [name, sequenceId] of Object.entries(ANIMATIONS)) {
            const animation = readAnimation(sequenceId);
            if (animation) animations[name] = animation;
            else log(`  skipping ${name} (${sequenceId}): it's a skeletal animation`);
        }

        // Weapon stances, named stand<sequence id>. Ones that can't be played keep the default idle.
        const stances: TransmogManifest['stances'] = {};
        let skippedStances = 0;
        for (const [itemId, sequenceId] of weaponStances(items, kept)) {
            const name = `stand${sequenceId}`;
            if (!(name in animations)) {
                const animation = sequenceFiles.has(sequenceId) ? readAnimation(sequenceId) : null;
                if (!animation) {
                    skippedStances++;
                    continue;
                }
                animations[name] = animation;
            }
            stances[itemId] = name;
        }
        if (skippedStances) log(`  ${skippedStances} weapons keep the default stance: theirs is missing or skeletal`);
        const framemaps: Record<string, Framemap> = {};
        for (const [id, fm] of framemapDefs) framemaps[id] = { types: fm.types, labels: fm.labels };

        const manifest: TransmogManifest = {
            version: TRANSMOG_DATA_VERSION,
            source: {
                archive: 'https://archive.openrs2.org',
                cache: source.id,
                build: source.build,
                timestamp: source.timestamp,
            },
            bodies,
            animations,
            stances,
            framemaps,
            textureAnimations,
        };
        writeFileSync(join(outDir, 'items.json'), JSON.stringify(packed));
        writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest));
        log(
            `Transmog data: ${packed.length} items, ${modelIds.size - failed} models, ${textureIds.size} textures, ` +
                `${Object.keys(animations).length} animations (cache ${source.id}, build ${source.build})` +
                (failed ? `; ${failed} models couldn't be decoded` : ''),
        );
    } finally {
        cache.close();
    }
}

/** The cache id and data version of existing output, or null if there isn't any. */
function outputSource(dir: string): { cache: number; version: number } | null {
    try {
        const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as TransmogManifest;
        return { cache: manifest.source.cache, version: manifest.version };
    } catch {
        return null;
    }
}

export interface EnsureOptions {
    /** Where the site serves the data from (static/transmog). */
    outDir: string;
    /** A directory that survives between builds, for the last good output and, locally, the cache. */
    persistDir: string;
    /** Keep the ~400MB unpacked cache in persistDir between runs (handy locally, wasteful in CI). */
    keepCache: boolean;
    log?: Log;
}

/**
 * Makes sure `outDir` holds data for the newest cache. Never throws: if the data can't be built,
 * it leaves the best data it has (or none) and says so, so a deploy isn't blocked by OpenRS2.
 */
export async function ensureTransmogData({
    outDir,
    persistDir,
    keepCache,
    log = console.log,
}: EnsureOptions): Promise<void> {
    const lastGood = join(persistDir, 'last-good');
    const isCurrent = (dir: string, cacheId: number) => {
        const found = outputSource(dir);
        return found !== null && found.cache === cacheId && found.version === TRANSMOG_DATA_VERSION;
    };
    try {
        const latest = await latestOsrsCache();
        if (isCurrent(outDir, latest.id)) return;
        if (isCurrent(lastGood, latest.id)) {
            rmSync(outDir, { recursive: true, force: true });
            cpSync(lastGood, outDir, { recursive: true });
            log(`Transmog data: reused build cache for cache ${latest.id}`);
            return;
        }
        log(`Transmog data: downloading OSRS cache ${latest.id} (build ${latest.build}) from OpenRS2…`);
        const workDir = keepCache
            ? join(persistDir, `osrs-cache-${latest.id}`)
            : join(tmpdir(), `osrs-cache-${latest.id}`);
        try {
            const cacheDir = await downloadDiskCache(latest.id, workDir);
            extractTransmogData(cacheDir, latest, outDir, log);
        } finally {
            if (!keepCache) rmSync(workDir, { recursive: true, force: true });
        }
        rmSync(lastGood, { recursive: true, force: true });
        mkdirSync(persistDir, { recursive: true });
        cpSync(outDir, lastGood, { recursive: true });
    } catch (error) {
        log(`Transmog data: couldn't build fresh data (${(error as Error).message})`);
        if (outputSource(outDir)) {
            log('Transmog data: keeping the existing data');
        } else if (outputSource(lastGood)) {
            rmSync(outDir, { recursive: true, force: true });
            cpSync(lastGood, outDir, { recursive: true });
            log('Transmog data: using the last good data from the build cache');
        } else {
            log('Transmog data: none available; the transmog page will say it is unavailable');
        }
    }
}
