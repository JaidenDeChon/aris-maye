import { describe, expect, test } from 'bun:test';
import { EquipmentSlot } from '$lib/osrs-model/compose';
import type { WearableItem } from '$lib/osrs-model/types';
import { matchUrl, nameIndex, normaliseName, toMatches, type RemoteItem } from './scape-fashion';

function item(id: number, name: string, slot: number, female = true): WearableItem {
    return {
        id,
        name,
        slot,
        hides: [],
        models: { male: [id], female: female ? [id] : [] },
        offset: { male: 0, female: 0 },
        recolor: [],
        retexture: [],
        geTradeable: true,
        members: false,
        textured: false,
    };
}

function remote(name: string, slot: string, match = 0.9): RemoteItem {
    return { name, slot, colors: ['#000000', '#111111', '#222222'], match, status: [] };
}

describe('normaliseName', () => {
    test("matches the wiki's names to the game's", () => {
        expect(normaliseName('Iron dagger (Poison)')).toBe(normaliseName('Iron dagger(p)'));
        expect(normaliseName('Iron dagger (Karambwan poison)')).toBe(normaliseName('Iron dagger(p++)'));
        expect(normaliseName("Ahrim's hood")).toBe('ahrimshood');
    });

    test('keeps variants that look different apart', () => {
        expect(normaliseName('Rune platebody (g)')).not.toBe(normaliseName('Rune platebody'));
    });
});

test('matchUrl uses scape.fashion slot names and filters', () => {
    const url = new URL(
        matchUrl({
            source: { by: 'item', name: 'Rune platebody' },
            slot: EquipmentSlot.legs,
            tradeableOnly: true,
            page: 2,
            pageSize: 40,
        }),
    );
    expect(url.origin + url.pathname).toBe('https://api.scape.fashion/items/match');
    expect(Object.fromEntries(url.searchParams)).toEqual({
        name: 'Rune platebody',
        slot: 'leg',
        tradeable: 'true',
        page: '2',
        pageSize: '40',
    });
    const byColour = new URL(
        matchUrl({
            source: { by: 'colour', colour: '#ff0000' },
            slot: null,
            tradeableOnly: false,
            page: 0,
            pageSize: 5,
        }),
    );
    expect(byColour.searchParams.get('color')).toBe('#ff0000');
    expect(byColour.searchParams.has('slot')).toBe(false);
});

describe('toMatches', () => {
    const helm = item(1, 'Rune full helm', EquipmentSlot.head);
    const legs = item(2, 'Rune platelegs', EquipmentSlot.legs);
    const maleOnly = item(3, 'Male thing', EquipmentSlot.body, false);
    const index = nameIndex([helm, legs, maleOnly]);

    test('finds our items, in order, and keeps the colours and closeness', () => {
        const out = toMatches(
            [remote('Rune platelegs', 'leg', 0.8), remote('Rune full helm', 'head', 0.7)],
            index,
            'male',
            new Set(),
        );
        expect(out.map((m) => [m.item.id, m.match])).toEqual([
            [2, 0.8],
            [1, 0.7],
        ]);
    });

    test("drops unknown items, wrong slots, items this body can't wear, excluded items and repeats", () => {
        const seen = new Set([1]);
        const out = toMatches(
            [
                remote('Not in the game', 'head'),
                remote('Rune platelegs', 'head'),
                remote('Male thing', 'body'),
                remote('Rune full helm', 'head'),
                remote('Rune platelegs', 'leg'),
                remote('Rune platelegs', 'leg'),
            ],
            index,
            'female',
            seen,
        );
        expect(out.map((m) => m.item.id)).toEqual([2]);
        // Later pages skip what earlier ones showed.
        expect(toMatches([remote('Rune platelegs', 'leg')], index, 'female', seen)).toEqual([]);
    });
});
