import { describe, expect, test } from 'bun:test';
import { composeOutfit, EquipmentSlot, modelsForOutfit } from './compose';
import type { ModelFile, TransmogManifest, WearableItem } from './types';

/** A single upward-facing triangle model in one colour. */
function triangle(color: number, extra: Partial<ModelFile> = {}): ModelFile {
    return { v: [0, 0, 0, 10, 0, 0, 0, 0, 10], l: [0, 0, 0], f: [0, 1, 2], c: [color], p: [0], ...extra };
}

const manifest: TransmogManifest = {
    version: 1,
    source: { archive: '', cache: 0, build: 0, timestamp: '' },
    bodies: {
        male: {
            [EquipmentSlot.body]: { models: [1], recolor: [], retexture: [] },
            [EquipmentSlot.hair]: { models: [2], recolor: [], retexture: [] },
        },
        female: {},
    },
    animations: {},
    stances: {},
    framemaps: {},
    textureAnimations: {},
};

function item(partial: Partial<WearableItem> & Pick<WearableItem, 'id' | 'slot'>): WearableItem {
    return {
        name: 'Test',
        hides: [],
        models: { male: [], female: [] },
        offset: { male: 0, female: 0 },
        recolor: [],
        retexture: [],
        geTradeable: false,
        members: false,
        textured: false,
        ...partial,
    };
}

const helm = item({
    id: 100,
    slot: EquipmentSlot.head,
    hides: [EquipmentSlot.hair],
    models: { male: [10], female: [] },
});
const platebody = item({
    id: 200,
    slot: EquipmentSlot.body,
    models: { male: [20, 21], female: [] },
    offset: { male: 5, female: 0 },
    recolor: [[1000, 2000]],
});
const items = new Map([helm, platebody].map((i) => [i.id, i]));

const files = new Map<number, ModelFile>([
    [1, triangle(4550)],
    [2, triangle(6798)],
    [10, triangle(30000)],
    [20, triangle(1000)],
    [21, triangle(1000)],
]);

describe('modelsForOutfit', () => {
    test('uses the bare body where nothing is worn', () => {
        expect(modelsForOutfit(manifest, items, 'male', {})).toEqual([1, 2]);
    });

    test('a helm that hides hair drops the hair kit, and worn items replace their kit', () => {
        const ids = modelsForOutfit(manifest, items, 'male', { [EquipmentSlot.head]: 100, [EquipmentSlot.body]: 200 });
        // Slot order: head (0), then body (4); hair (8) is hidden.
        expect(ids).toEqual([10, 20, 21]);
    });

    test('ignores an item listed under the wrong slot', () => {
        expect(modelsForOutfit(manifest, items, 'male', { [EquipmentSlot.legs]: 100 })).toEqual([1, 2]);
    });
});

describe('composeOutfit', () => {
    test("applies the item's recolours and offsets only its first model", () => {
        const mesh = composeOutfit(manifest, items, files, 'male', { [EquipmentSlot.body]: 200 });
        expect(mesh.faceCount).toBe(3);
        // Body models come before the hair kit (slot 4 before 8). Recoloured 1000 -> 2000 keeps its hue bits.
        expect(mesh.colors[0] & 0xff80).toBe(2000 & 0xff80);
        expect(mesh.vertices[1]).toBe(5);
        expect(mesh.vertices[9 + 1]).toBe(0);
    });

    test('marks hidden faces -2 and flat faces -1', () => {
        const flatAndHidden = new Map(files);
        flatAndHidden.set(1, {
            ...triangle(4550),
            f: [0, 1, 2, 0, 2, 1],
            c: [4550, 4550],
            p: [0, 0],
            r: [1, 0],
            a: [0, 255],
        });
        const mesh = composeOutfit(manifest, items, flatAndHidden, 'male', {});
        expect(mesh.colors[2]).toBe(-1);
        expect(mesh.colors[5]).toBe(-2);
    });

    test('gives textured faces texture coordinates across the face', () => {
        const textured = new Map(files);
        textured.set(1, { ...triangle(127), t: [5], tc: [-1] });
        const mesh = composeOutfit(manifest, items, textured, 'male', {});
        expect(mesh.textures[0]).toBe(5);
        // With no texture triangle the face maps onto itself: (0,0), (1,0), (0,1).
        expect(Array.from(mesh.uvs.slice(0, 6))).toEqual([0, 0, 1, 0, 0, 1]);
    });
});
