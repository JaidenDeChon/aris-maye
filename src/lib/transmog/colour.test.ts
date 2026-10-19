import { expect, test } from 'bun:test';
import type { ModelFile } from '$lib/osrs-model/types';
import { mainColour, toHex } from './colour';

// A palette where each HSL value is its own "colour", so results can be read back directly.
const palette = Uint32Array.from({ length: 65536 }, (_, i) => i);

/** Two triangles: a big one in `big` and a small one in `small`. */
function model(big: number, small: number, extra: Partial<ModelFile> = {}): ModelFile {
    return {
        v: [0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 0, 10, 0, 0, 0, 10, 0],
        l: [0, 0, 0, 0, 0, 0],
        f: [0, 1, 2, 3, 4, 5],
        c: [big, small],
        p: [0, 0],
        ...extra,
    };
}

test('picks the colour covering the most surface', () => {
    expect(mainColour([model(1000, 2000)], [], palette)).toBe(1000);
});

test('applies the item recolours', () => {
    expect(mainColour([model(1000, 2000)], [[1000, 3000]], palette)).toBe(3000);
});

test('ignores hidden, see-through and textured faces', () => {
    expect(mainColour([model(1000, 2000, { r: [2, 0] })], [], palette)).toBe(2000);
    expect(mainColour([model(1000, 2000, { a: [200, 0] })], [], palette)).toBe(2000);
    expect(mainColour([model(1000, 2000, { t: [5, -1] })], [], palette)).toBe(2000);
    expect(mainColour([model(1000, 2000, { r: [2, 2] })], [], palette)).toBeNull();
});

test('toHex pads to six digits', () => {
    expect(toHex(0xff)).toBe('#0000ff');
});
