import { describe, expect, test } from 'bun:test';
import type { Mesh } from './compose';
import { PlayerModel, SequencePlayer } from './player-model';
import type { Framemap } from './types';

/** Two vertices, one on skeleton label 1, which a framemap slot moves. */
function tinyMesh(): Mesh {
    return {
        vertexCount: 2,
        faceCount: 0,
        vertices: Int32Array.from([0, 0, 0, 100, -50, 0]),
        labels: Uint8Array.from([0, 1]),
        faces: new Int32Array(0),
        colors: new Int32Array(0),
        priorities: new Uint8Array(0),
        alphas: new Uint8Array(0),
        textures: new Int16Array(0),
        uvs: new Float32Array(0),
    };
}

const framemaps: Record<string, Framemap> = {
    // slot 0: origin of label 1, slot 1: translate label 1, slot 2: rotate label 1, slot 3: scale label 1
    7: { types: [0, 1, 2, 3], labels: [[1], [1], [1], [1]] },
};

describe('PlayerModel', () => {
    test('translates only the vertices on the moved label', () => {
        const model = new PlayerModel(tinyMesh(), framemaps);
        model.pose([7, 1, 10, -5, 3]);
        expect(Array.from(model.x)).toEqual([0, 110]);
        expect(Array.from(model.y)).toEqual([0, -55]);
        expect(Array.from(model.z)).toEqual([0, 3]);
    });

    test('posing nothing restores the bind pose', () => {
        const model = new PlayerModel(tinyMesh(), framemaps);
        model.pose([7, 1, 10, -5, 3]);
        model.pose(null);
        expect(Array.from(model.x)).toEqual([0, 100]);
        expect(Array.from(model.y)).toEqual([0, -50]);
    });

    test('rotates a quarter turn about the vertical axis with the game sine table', () => {
        const model = new PlayerModel(tinyMesh(), framemaps);
        // Origin at (0, 0, 0) via dx, dy, dz offsets from the label's centre (100, -50, 0).
        model.pose([7, 0, -100, 50, 0, 2, 0, 64, 0]);
        // 64 * 8 = 512 of 2048: a quarter turn, which takes +x to -z.
        expect(model.x[1]).toBe(0);
        expect(model.z[1]).toBe(-100);
        expect(model.y[1]).toBe(-50);
    });

    test('scales about the origin in 128ths', () => {
        const model = new PlayerModel(tinyMesh(), framemaps);
        model.pose([7, 0, -100, 50, 0, 3, 256, 128, 64]);
        expect(model.x[1]).toBe(200);
        expect(model.y[1]).toBe(-50);
    });
});

describe('SequencePlayer', () => {
    const animation = { lengths: [2, 3], frames: [[0], [1]] };

    test('steps through frames by client cycle and loops', () => {
        const player = new SequencePlayer(animation);
        expect(player.current).toEqual([0]);
        player.advance(3, true);
        expect(player.current).toEqual([1]);
        player.advance(3, true);
        expect(player.current).toEqual([0]);
    });

    test('reports when a one-off run is over and holds the last frame', () => {
        const player = new SequencePlayer(animation);
        expect(player.advance(4, false)).toBe(false);
        expect(player.advance(10, false)).toBe(true);
        expect(player.current).toEqual([1]);
    });
});
