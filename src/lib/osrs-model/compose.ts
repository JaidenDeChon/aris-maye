/**
 * Builds a dressed player model the way the client's PlayerComposition does: walk the twelve
 * equipment slots in order, take an item's worn models where something is equipped and the bare
 * body kit otherwise, drop the slots an item hides, apply recolours, merge, and light the result
 * once with the player lighting constants.
 */
import type { BodyKit, Gender, ModelFile, TransmogManifest, WearableItem } from './types';

export const EquipmentSlot = {
    head: 0,
    cape: 1,
    amulet: 2,
    weapon: 3,
    body: 4,
    shield: 5,
    arms: 6,
    legs: 7,
    hair: 8,
    hands: 9,
    feet: 10,
    jaw: 11,
    ring: 12,
    ammo: 13,
} as const;

/** The slots the client builds a player's model from, in the order it merges them. */
const MODEL_SLOTS = 12;

/** item id per equipment slot. */
export type Equipment = Partial<Record<number, number>>;

/** A merged, lit model ready to pose and draw. */
export interface Mesh {
    vertexCount: number;
    faceCount: number;
    /** x, y, z per vertex in the bind pose. */
    vertices: Int32Array;
    labels: Uint8Array;
    /** a, b, c per face. */
    faces: Int32Array;
    /**
     * Three lit colours per face. For plain faces they're HSL; for textured faces they're 7-bit
     * lightness. A third value of -1 means flat (use the first for all three), -2 means hidden.
     */
    colors: Int32Array;
    priorities: Uint8Array;
    alphas: Uint8Array;
    /** Texture id per face, -1 for none. */
    textures: Int16Array;
    /** u0, v0, u1, v1, u2, v2 per textured face. */
    uvs: Float32Array;
}

interface Part {
    model: ModelFile;
    offsetY: number;
    recolor: [number, number][];
    retexture: [number, number][];
}

/** Every model id an outfit needs, so they can be fetched before composing. */
export function modelsForOutfit(
    manifest: TransmogManifest,
    items: Map<number, WearableItem>,
    gender: Gender,
    equipment: Equipment,
): number[] {
    return partsFor(manifest, items, gender, equipment).flatMap((p) => p.models);
}

function partsFor(
    manifest: TransmogManifest,
    items: Map<number, WearableItem>,
    gender: Gender,
    equipment: Equipment,
): { models: number[]; offset: number; recolor: [number, number][]; retexture: [number, number][] }[] {
    const body = manifest.bodies[gender];
    const slots: ({ kind: 'kit'; kit: BodyKit } | { kind: 'item'; item: WearableItem } | null)[] = [];
    for (let slot = 0; slot < MODEL_SLOTS; slot++) slots[slot] = body[slot] ? { kind: 'kit', kit: body[slot] } : null;
    for (const [slot, id] of Object.entries(equipment)) {
        const item = id === undefined ? undefined : items.get(id);
        if (!item || item.slot !== Number(slot)) continue;
        if (item.slot < MODEL_SLOTS) slots[item.slot] = { kind: 'item', item };
    }
    // Hiding is applied after everything is equipped, so a full helm hides hair whatever the order.
    for (const entry of slots) {
        if (entry?.kind !== 'item') continue;
        for (const hidden of entry.item.hides) {
            if (hidden < MODEL_SLOTS && slots[hidden]?.kind === 'kit') slots[hidden] = null;
        }
    }
    const parts = [];
    for (const entry of slots) {
        if (!entry) continue;
        if (entry.kind === 'kit') {
            parts.push({
                models: entry.kit.models,
                offset: 0,
                recolor: entry.kit.recolor,
                retexture: entry.kit.retexture,
            });
        } else {
            const models = entry.item.models[gender].filter((m) => m >= 0);
            parts.push({
                models,
                offset: entry.item.offset[gender],
                recolor: entry.item.recolor,
                retexture: entry.item.retexture,
            });
        }
    }
    return parts;
}

/** Merges and lights an outfit. Every model `modelsForOutfit` listed must be in `models`. */
export function composeOutfit(
    manifest: TransmogManifest,
    items: Map<number, WearableItem>,
    models: Map<number, ModelFile>,
    gender: Gender,
    equipment: Equipment,
): Mesh {
    const parts: Part[] = [];
    for (const entry of partsFor(manifest, items, gender, equipment)) {
        entry.models.forEach((id, i) => {
            const model = models.get(id);
            if (!model) throw new Error(`Model ${id} wasn't loaded`);
            // Only the first worn model takes the item's vertical offset.
            parts.push({
                model,
                offsetY: i === 0 ? entry.offset : 0,
                recolor: entry.recolor,
                retexture: entry.retexture,
            });
        });
    }
    return lightMesh(mergeParts(parts));
}

interface MergedModel {
    vertices: number[];
    labels: number[];
    faces: number[];
    colors: number[];
    renderTypes: number[];
    priorities: number[];
    alphas: number[];
    textures: number[];
    /** P, M, N vertex indices per face's texture triangle (the face itself when it has none). */
    texTriangles: number[];
}

function mergeParts(parts: Part[]): MergedModel {
    const out: MergedModel = {
        vertices: [],
        labels: [],
        faces: [],
        colors: [],
        renderTypes: [],
        priorities: [],
        alphas: [],
        textures: [],
        texTriangles: [],
    };
    for (const { model, offsetY, recolor, retexture } of parts) {
        const base = out.vertices.length / 3;
        for (let i = 0; i < model.v.length; i += 3)
            out.vertices.push(model.v[i], model.v[i + 1] + offsetY, model.v[i + 2]);
        out.labels.push(...model.l);
        const faceCount = model.f.length / 3;
        for (let f = 0; f < faceCount; f++) {
            const a = model.f[f * 3] + base;
            const b = model.f[f * 3 + 1] + base;
            const c = model.f[f * 3 + 2] + base;
            out.faces.push(a, b, c);
            let texture = model.t?.[f] ?? -1;
            let color = model.c[f];
            if (texture === -1) {
                const swap = recolor.find(([find]) => find === color);
                if (swap) color = swap[1];
            } else {
                const swap = retexture.find(([find]) => find === texture);
                if (swap) texture = swap[1];
            }
            out.colors.push(color);
            out.textures.push(texture);
            out.renderTypes.push(model.r?.[f] ?? 0);
            out.priorities.push(model.p[f]);
            out.alphas.push(model.a?.[f] ?? 0);
            const tri = model.tc?.[f] ?? -1;
            if (texture !== -1 && tri >= 0 && model.tt) {
                out.texTriangles.push(
                    model.tt[tri * 3] + base,
                    model.tt[tri * 3 + 1] + base,
                    model.tt[tri * 3 + 2] + base,
                );
            } else {
                out.texTriangles.push(a, b, c);
            }
        }
    }
    return out;
}

// The client's player lighting: ModelData.toModel(64, 850, -30, -50, -30).
const AMBIENT = 64;
const CONTRAST = 850;
const LIGHT_X = -30;
const LIGHT_Y = -50;
const LIGHT_Z = -30;

/** Jagex's light-a-colour step: scale the 7-bit lightness and keep it off pure black and white. */
function shade(hsl: number, lightness: number): number {
    let light = ((hsl & 127) * lightness) >> 7;
    if (light < 2) light = 2;
    else if (light > 126) light = 126;
    return (hsl & 0xff80) + light;
}

/** Lightness for a textured face, clamped the same way. */
function shadeTexture(lightness: number): number {
    return lightness < 2 ? 2 : lightness > 126 ? 126 : lightness;
}

/** ModelData.calculateNormals plus the colour half of ModelData.toModel, and texture UVs. */
function lightMesh(model: MergedModel): Mesh {
    const vertexCount = model.vertices.length / 3;
    const faceCount = model.faces.length / 3;
    const { vertices: v, faces } = model;
    const nx = new Int32Array(vertexCount);
    const ny = new Int32Array(vertexCount);
    const nz = new Int32Array(vertexCount);
    const nm = new Int32Array(vertexCount);
    const faceNormals = new Int32Array(faceCount * 3);

    for (let f = 0; f < faceCount; f++) {
        const a = faces[f * 3];
        const b = faces[f * 3 + 1];
        const c = faces[f * 3 + 2];
        const xA = v[b * 3] - v[a * 3];
        const yA = v[b * 3 + 1] - v[a * 3 + 1];
        const zA = v[b * 3 + 2] - v[a * 3 + 2];
        const xB = v[c * 3] - v[a * 3];
        const yB = v[c * 3 + 1] - v[a * 3 + 1];
        const zB = v[c * 3 + 2] - v[a * 3 + 2];
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
        faceNormals[f * 3] = x;
        faceNormals[f * 3 + 1] = y;
        faceNormals[f * 3 + 2] = z;
        if (model.renderTypes[f] === 0) {
            for (const vert of [a, b, c]) {
                nx[vert] += x;
                ny[vert] += y;
                nz[vert] += z;
                nm[vert]++;
            }
        }
    }

    const lightMagnitude = Math.trunc(Math.sqrt(LIGHT_X * LIGHT_X + LIGHT_Y * LIGHT_Y + LIGHT_Z * LIGHT_Z));
    const scale = (CONTRAST * lightMagnitude) >> 8;
    const flatScale = Math.trunc(scale / 2) + scale;
    const vertexLight = (vert: number) =>
        Math.trunc((LIGHT_Y * ny[vert] + LIGHT_Z * nz[vert] + LIGHT_X * nx[vert]) / (scale * nm[vert])) + AMBIENT;
    const faceLight = (f: number) =>
        Math.trunc(
            (LIGHT_Y * faceNormals[f * 3 + 1] + LIGHT_Z * faceNormals[f * 3 + 2] + LIGHT_X * faceNormals[f * 3]) /
                flatScale,
        ) + AMBIENT;

    const colors = new Int32Array(faceCount * 3);
    for (let f = 0; f < faceCount; f++) {
        const hsl = model.colors[f] & 0xffff;
        const textured = model.textures[f] !== -1;
        let type = model.renderTypes[f];
        // Alpha bytes of 254 and 255 are the client's markers for black and hidden faces.
        if (model.alphas[f] === 254) type = 3;
        if (model.alphas[f] === 255) type = 2;
        const out = f * 3;
        if (type === 0) {
            for (let i = 0; i < 3; i++) {
                const light = vertexLight(faces[out + i]);
                colors[out + i] = textured ? shadeTexture(light) : shade(hsl, light);
            }
        } else if (type === 1) {
            const light = faceLight(f);
            colors[out] = textured ? shadeTexture(light) : shade(hsl, light);
            colors[out + 2] = -1;
        } else if (type === 3 && !textured) {
            colors[out] = 128;
            colors[out + 2] = -1;
        } else {
            colors[out + 2] = -2;
        }
    }

    return {
        vertexCount,
        faceCount,
        vertices: Int32Array.from(model.vertices),
        labels: Uint8Array.from(model.labels),
        faces: Int32Array.from(faces),
        colors,
        priorities: Uint8Array.from(model.priorities),
        alphas: Uint8Array.from(model.alphas.map((a) => (a >= 254 ? 0 : a))),
        textures: Int16Array.from(model.textures),
        uvs: textureCoordinates(model),
    };
}

/**
 * Port of RuneLite's ModelDefinition.computeTextureUVCoordinates: projects each textured face onto
 * the plane of its texture triangle (P, M, N), giving u along P→M and v along P→N.
 */
function textureCoordinates(model: MergedModel): Float32Array {
    const faceCount = model.faces.length / 3;
    const uvs = new Float32Array(faceCount * 6);
    const v = model.vertices;
    for (let f = 0; f < faceCount; f++) {
        if (model.textures[f] === -1) continue;
        const [p, m, n] = [model.texTriangles[f * 3], model.texTriangles[f * 3 + 1], model.texTriangles[f * 3 + 2]];
        const corners = [model.faces[f * 3], model.faces[f * 3 + 1], model.faces[f * 3 + 2]];
        const v1x = v[p * 3];
        const v1y = v[p * 3 + 1];
        const v1z = v[p * 3 + 2];
        const v2x = v[m * 3] - v1x;
        const v2y = v[m * 3 + 1] - v1y;
        const v2z = v[m * 3 + 2] - v1z;
        const v3x = v[n * 3] - v1x;
        const v3y = v[n * 3 + 1] - v1y;
        const v3z = v[n * 3 + 2] - v1z;
        const v7x = v2y * v3z - v2z * v3y;
        const v7y = v2z * v3x - v2x * v3z;
        const v7z = v2x * v3y - v2y * v3x;
        let v8x = v3y * v7z - v3z * v7y;
        let v8y = v3z * v7x - v3x * v7z;
        let v8z = v3x * v7y - v3y * v7x;
        const fu = 1 / (v8x * v2x + v8y * v2y + v8z * v2z);
        const us = corners.map(
            (c) => (v8x * (v[c * 3] - v1x) + v8y * (v[c * 3 + 1] - v1y) + v8z * (v[c * 3 + 2] - v1z)) * fu,
        );
        v8x = v2y * v7z - v2z * v7y;
        v8y = v2z * v7x - v2x * v7z;
        v8z = v2x * v7y - v2y * v7x;
        const fv = 1 / (v8x * v3x + v8y * v3y + v8z * v3z);
        const vs = corners.map(
            (c) => (v8x * (v[c * 3] - v1x) + v8y * (v[c * 3 + 1] - v1y) + v8z * (v[c * 3 + 2] - v1z)) * fv,
        );
        for (let i = 0; i < 3; i++) {
            // `|| 0` also turns -0 into 0.
            uvs[f * 6 + i * 2] = (Number.isFinite(us[i]) && us[i]) || 0;
            uvs[f * 6 + i * 2 + 1] = (Number.isFinite(vs[i]) && vs[i]) || 0;
        }
    }
    return uvs;
}
