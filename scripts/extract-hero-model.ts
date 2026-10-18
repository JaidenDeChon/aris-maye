/**
 * Builds static/hero-model/player.json, the data behind the 3D homepage hero: the default male
 * player (bald, clean-shaven, starter clothes) and a set of emotes, read straight from the live OSRS
 * cache on the OpenRS2 Archive.
 *
 *   bun scripts/extract-hero-model.ts            # newest live cache
 *   bun scripts/extract-hero-model.ts 2740       # a specific OpenRS2 cache id
 *
 * The model is merged and lit here exactly as the client does it when it builds a player
 * (ModelData.toModel(64, 850, -30, -50, -30)), so the page only has to pose vertices and draw.
 * OSRS never relights a model while it animates, so baking the colours in loses nothing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { latestOsrsCache, OsrsCache } from './osrs-cache/cache';
import {
    decodeFrame,
    decodeFramemap,
    decodeKit,
    decodeModel,
    decodeSequence,
    frameFramemapId,
    type FramemapDefinition,
    type ModelDefinition,
} from './osrs-cache/definitions';

const INDEX_FRAMES = 0;
const INDEX_FRAMEMAPS = 1;
const INDEX_CONFIGS = 2;
const INDEX_MODELS = 7;
const CONFIG_IDENTKIT = 3;
const CONFIG_SEQUENCE = 12;

/** Male kits: bald (no hair), clean-shaven jaw, plain torso, arms, hands, legs, feet. */
const PLAYER_KITS = [0, 14, 18, 26, 33, 36, 42];

/** Emote and idle sequence ids, named the way the emote tab names them. */
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

// The client's player lighting constants.
const AMBIENT = 64;
const CONTRAST = 850;
const LIGHT_X = -30;
const LIGHT_Y = -50;
const LIGHT_Z = -30;

function mergeModels(models: ModelDefinition[]): ModelDefinition {
    const merged: ModelDefinition = {
        id: -1,
        vertexX: [],
        vertexY: [],
        vertexZ: [],
        faceA: [],
        faceB: [],
        faceC: [],
        faceColors: [],
        faceRenderTypes: [],
        faceRenderPriorities: null,
        priority: 0,
        faceTransparencies: null,
        faceTextures: null,
        vertexLabels: [],
        faceLabels: null,
    };
    for (const model of models) {
        const base = merged.vertexX.length;
        merged.vertexX.push(...model.vertexX);
        merged.vertexY.push(...model.vertexY);
        merged.vertexZ.push(...model.vertexZ);
        merged.vertexLabels!.push(...(model.vertexLabels ?? model.vertexX.map(() => 0)));
        merged.faceA.push(...model.faceA.map((v) => v + base));
        merged.faceB.push(...model.faceB.map((v) => v + base));
        merged.faceC.push(...model.faceC.map((v) => v + base));
        merged.faceColors.push(...model.faceColors);
        merged.faceRenderTypes!.push(...(model.faceRenderTypes ?? model.faceA.map(() => 0)));
        if (model.faceTransparencies?.some((a) => a !== 0)) {
            console.warn(`Model ${model.id} has transparent faces; they'll be drawn opaque`);
        }
    }
    return merged;
}

/** Jagex's light-a-colour step: scale the 7-bit lightness and keep it off pure black and white. */
function shade(hsl: number, lightness: number): number {
    let light = ((hsl & 127) * lightness) >> 7;
    if (light < 2) light = 2;
    else if (light > 126) light = 126;
    return (hsl & 0xff80) + light;
}

/** ModelData.calculateNormals then the colour half of ModelData.toModel. Returns 3 colours per face. */
function lightModel(model: ModelDefinition): number[] {
    const vertexCount = model.vertexX.length;
    const faceCount = model.faceA.length;
    const nx = new Array(vertexCount).fill(0);
    const ny = new Array(vertexCount).fill(0);
    const nz = new Array(vertexCount).fill(0);
    const nm = new Array(vertexCount).fill(0);
    const faceNormals: [number, number, number][] = [];

    for (let f = 0; f < faceCount; f++) {
        const a = model.faceA[f];
        const b = model.faceB[f];
        const c = model.faceC[f];
        const xA = model.vertexX[b] - model.vertexX[a];
        const yA = model.vertexY[b] - model.vertexY[a];
        const zA = model.vertexZ[b] - model.vertexZ[a];
        const xB = model.vertexX[c] - model.vertexX[a];
        const yB = model.vertexY[c] - model.vertexY[a];
        const zB = model.vertexZ[c] - model.vertexZ[a];
        let x = yA * zB - yB * zA;
        let y = zA * xB - zB * xA;
        let z = xA * yB - xB * yA;
        while (x > 8192 || y > 8192 || z > 8192 || x < -8192 || y < -8192 || z < -8192) {
            x >>= 1;
            y >>= 1;
            z >>= 1;
        }
        let length = Math.trunc(Math.sqrt(x * x + y * y + z * z));
        if (length <= 0) length = 1;
        x = Math.trunc((x * 256) / length);
        y = Math.trunc((y * 256) / length);
        z = Math.trunc((z * 256) / length);
        faceNormals[f] = [x, y, z];
        if (model.faceRenderTypes![f] === 0) {
            for (const v of [a, b, c]) {
                nx[v] += x;
                ny[v] += y;
                nz[v] += z;
                nm[v]++;
            }
        }
    }

    const lightMagnitude = Math.trunc(Math.sqrt(LIGHT_X * LIGHT_X + LIGHT_Y * LIGHT_Y + LIGHT_Z * LIGHT_Z));
    const scale = (CONTRAST * lightMagnitude) >> 8;
    const colors: number[] = [];
    for (let f = 0; f < faceCount; f++) {
        const hsl = model.faceColors[f] & 0xffff;
        if (model.faceRenderTypes![f] === 1) {
            const [x, y, z] = faceNormals[f];
            const lightness =
                Math.trunc((LIGHT_Y * y + LIGHT_Z * z + LIGHT_X * x) / (Math.trunc(scale / 2) + scale)) + AMBIENT;
            colors.push(shade(hsl, lightness), 0, -1);
        } else {
            for (const v of [model.faceA[f], model.faceB[f], model.faceC[f]]) {
                const lightness =
                    Math.trunc((LIGHT_Y * ny[v] + LIGHT_Z * nz[v] + LIGHT_X * nx[v]) / (scale * nm[v])) + AMBIENT;
                colors.push(shade(hsl, lightness));
            }
        }
    }
    return colors;
}

async function main() {
    const requested = process.argv[2] ? Number(process.argv[2]) : null;
    const source = requested ? { id: requested, build: 0, timestamp: '' } : await latestOsrsCache();
    console.log(`Reading OpenRS2 cache ${source.id} (build ${source.build || '?'})`);
    const cache = new OsrsCache(source.id);

    const kitFiles = await cache.files(INDEX_CONFIGS, CONFIG_IDENTKIT);
    const parts: ModelDefinition[] = [];
    for (const kitId of PLAYER_KITS) {
        const kit = decodeKit(kitId, kitFiles.get(kitId)!);
        for (const modelId of kit.models) {
            const model = decodeModel(modelId, await cache.group(INDEX_MODELS, modelId));
            model.faceColors = model.faceColors.map((color) => {
                const i = kit.recolorToFind.indexOf(color);
                return i === -1 ? color : kit.recolorToReplace[i];
            });
            parts.push(model);
        }
        console.log(`  kit ${kitId} (body part ${kit.bodyPartId}): models ${kit.models.join(', ')}`);
    }
    // Player appearance colours all left at index 0, which maps each body colour onto itself.
    const model = mergeModels(parts);
    const colors = lightModel(model);

    const sequenceFiles = await cache.files(INDEX_CONFIGS, CONFIG_SEQUENCE);
    const framemaps = new Map<number, FramemapDefinition>();
    const frameGroups = new Map<number, Map<number, Uint8Array>>();
    const animations: Record<string, { lengths: number[]; frames: number[][] }> = {};

    for (const [name, sequenceId] of Object.entries(ANIMATIONS)) {
        const sequence = decodeSequence(sequenceId, sequenceFiles.get(sequenceId)!);
        if (sequence.animMayaId !== -1) {
            console.warn(`  skipping ${name} (${sequenceId}): it's a skeletal animation`);
            continue;
        }
        const frames: number[][] = [];
        for (const frameId of sequence.frameIds) {
            const group = frameId >>> 16;
            if (!frameGroups.has(group)) frameGroups.set(group, await cache.files(INDEX_FRAMES, group));
            const data = frameGroups.get(group)!.get(frameId & 0xffff)!;
            const framemapId = frameFramemapId(data);
            if (!framemaps.has(framemapId)) {
                const files = await cache.files(INDEX_FRAMEMAPS, framemapId);
                framemaps.set(framemapId, decodeFramemap(framemapId, files.values().next().value!));
            }
            const frame = decodeFrame(framemaps.get(framemapId)!, data);
            // [framemap, slot, dx, dy, dz, slot, dx, dy, dz, ...]
            const packed = [framemapId];
            frame.slots.forEach((slot, i) => packed.push(slot, frame.dx[i], frame.dy[i], frame.dz[i]));
            frames.push(packed);
        }
        animations[name] = { lengths: sequence.frameLengths, frames };
        console.log(`  ${name} (${sequenceId}): ${frames.length} frames`);
    }

    const out = {
        source: {
            archive: 'https://archive.openrs2.org',
            cache: source.id,
            build: source.build,
            timestamp: source.timestamp,
            kits: PLAYER_KITS,
        },
        vertices: model.vertexX.flatMap((x, i) => [x, model.vertexY[i], model.vertexZ[i]]),
        labels: model.vertexLabels,
        faces: model.faceA.flatMap((a, i) => [a, model.faceB[i], model.faceC[i]]),
        colors,
        framemaps: Object.fromEntries([...framemaps].map(([id, fm]) => [id, { types: fm.types, labels: fm.labels }])),
        animations,
    };

    const dir = join(import.meta.dir, '..', 'static', 'hero-model');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'player.json');
    writeFileSync(path, JSON.stringify(out));
    console.log(`Wrote ${path} (${model.vertexX.length} vertices, ${model.faceA.length} faces)`);
}

await main();
