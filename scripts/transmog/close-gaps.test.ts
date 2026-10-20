import { expect, test } from 'bun:test';
import type { ModelFile } from '../../src/lib/osrs-model/types';
import { closeGaps } from './close-gaps';

/**
 * A closed square pyramid split between a "head" (two sides and the base) and a "jaw" (one side),
 * with the fourth side missing.
 */
const apex = [0, -10, 0];
const corners = [
    [-5, 0, -5],
    [5, 0, -5],
    [5, 0, 5],
    [-5, 0, 5],
];
function side(...faces: number[][]): ModelFile {
    const v: number[] = [];
    const f: number[] = [];
    for (const face of faces) {
        const base = v.length / 3;
        // Two numbers are a side (apex first); three are a base triangle.
        const points = face.length === 2 ? [apex, corners[face[0]], corners[face[1]]] : face.map((i) => corners[i]);
        for (const point of points) v.push(...point);
        f.push(base, base + 1, base + 2);
    }
    return { v, l: v.map(() => 7).slice(0, v.length / 3), f, c: faces.map(() => 4550), p: faces.map(() => 6) };
}

const head = side([0, 1], [1, 2], [2, 1, 0], [3, 2, 0]);
const jaw = side([2, 3]);

test('fills a triangular gap, wound like its neighbours and in their colour', () => {
    const out = closeGaps(head, jaw);
    expect(out.c).toEqual([4550, 4550]);
    expect(out.p).toEqual([6, 6]);
    expect(out.f).toHaveLength(6);
    const corner = (i: number) => out.v.slice(out.f[3 + i] * 3, out.f[3 + i] * 3 + 3);
    const added = [corner(0), corner(1), corner(2)];
    expect(added).toContainEqual(apex);
    expect(added).toContainEqual(corners[3]);
    expect(added).toContainEqual(corners[0]);
    // Same winding as the other sides: the normals all point away from the middle.
    const normalY = (a: number[], b: number[], c: number[]) => {
        const u = [b[0] - a[0], b[2] - a[2]];
        const w = [c[0] - a[0], c[2] - a[2]];
        return u[0] * w[1] - u[1] * w[0];
    };
    const original = [apex, corners[2], corners[3]];
    expect(Math.sign(normalY(added[0], added[1], added[2]))).toBe(
        Math.sign(normalY(original[0], original[1], original[2])),
    );
    expect(out.l.slice(-3)).toEqual([7, 7, 7]);
});

test('leaves gaps that are not triangles, and the inputs, alone', () => {
    const before = structuredClone(jaw);
    closeGaps(head, jaw);
    expect(jaw).toEqual(before);
    // Four sides and no base: the gap is a square, which is left alone.
    const whole = side([0, 1], [1, 2], [2, 3], [3, 0]);
    expect(closeGaps(whole, { v: [], l: [], f: [], c: [], p: [] }).c).toEqual([]);
});
