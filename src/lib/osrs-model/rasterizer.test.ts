import { describe, expect, test } from 'bun:test';
import { adjustedPriority, createPalette, drawOrder } from './rasterizer';

describe('drawOrder', () => {
    test('draws lower priorities first, then farthest first, then lowest face index', () => {
        const priorities = [3, 0, 0, 0];
        const distances = [100, 50, 80, 80];
        expect(drawOrder([0, 1, 2, 3], priorities, distances)).toEqual([2, 3, 1, 0]);
    });

    test('a priority-10 face behind the priority 1-2 faces draws before everything', () => {
        const priorities = [1, 2, 10, 0];
        const distances = [100, 100, 500, 10];
        expect(drawOrder([0, 1, 2, 3], priorities, distances)[0]).toBe(2);
    });

    test('a near priority-10 face draws after priorities 0-9 when every group has faces', () => {
        const priorities = [1, 3, 6, 9, 10];
        const distances = [100, 100, 100, 100, 5];
        expect(drawOrder([0, 1, 2, 3, 4], priorities, distances).at(-1)).toBe(4);
    });

    test('an empty group never holds a priority-10 face back, as in the client', () => {
        // No priority 3-4 faces, so their average is -6000, and the near 10 slots in right after 1-2.
        expect(drawOrder([0, 1, 2], [1, 9, 10], [100, 100, 5])).toEqual([0, 2, 1]);
    });

    test('leaves out faces that are not visible', () => {
        expect(drawOrder([1], [0, 0], [1, 1])).toEqual([1]);
    });
});

test('adjustedPriority keeps plain priorities in their fixed slots', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => adjustedPriority(p, 0, 0, 0, 0, 0))).toEqual([
        2, 3, 4, 7, 8, 11, 12, 13, 14, 15,
    ]);
});

describe('createPalette', () => {
    const palette = createPalette(0.7);

    test('lightness 0 is black and full lightness is near white', () => {
        expect(palette[0]).toBe(0);
        const white = palette[127];
        expect(white >> 16).toBeGreaterThan(240);
    });

    test('a saturated hue-0 colour is red', () => {
        const red = palette[(0 << 10) | (7 << 7) | 64];
        expect((red >> 16) & 0xff).toBeGreaterThan(((red >> 8) & 0xff) + 100);
    });
});
