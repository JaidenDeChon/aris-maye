import { describe, expect, test } from 'bun:test';
import type { WearableItem } from '$lib/osrs-model/types';
import { EquipmentSlot } from '$lib/osrs-model/compose';
import { equip, idleFor, outfitParams, parseOutfitParams, unequip, validateOutfit, type Outfit } from './outfit';

function item(id: number, slot: number, hides: number[] = []): WearableItem {
    return {
        id,
        name: `Item ${id}`,
        slot,
        hides,
        models: { male: [id], female: [id] },
        offset: { male: 0, female: 0 },
        recolor: [],
        retexture: [],
        geTradeable: true,
        members: false,
        textured: false,
    };
}

const helm = item(1163, EquipmentSlot.head, [EquipmentSlot.hair, EquipmentSlot.jaw]);
const sword = item(1333, EquipmentSlot.weapon);
const twoHander = item(11802, EquipmentSlot.weapon, [EquipmentSlot.shield]);
const shield = item(1201, EquipmentSlot.shield);
const items = new Map([helm, sword, twoHander, shield].map((i) => [i.id, i]));
const empty: Outfit = { gender: 'male', equipment: {} };

describe('equip', () => {
    test('puts an item in its slot', () => {
        expect(equip(empty, helm, items).equipment).toEqual({ [EquipmentSlot.head]: 1163 });
    });

    test('a two-handed weapon takes the shield off', () => {
        const withShield = equip(equip(empty, sword, items), shield, items);
        expect(equip(withShield, twoHander, items).equipment).toEqual({ [EquipmentSlot.weapon]: 11802 });
    });

    test('a shield takes a two-handed weapon off', () => {
        const withTwoHander = equip(empty, twoHander, items);
        expect(equip(withTwoHander, shield, items).equipment).toEqual({ [EquipmentSlot.shield]: 1201 });
    });

    test('a one-handed weapon and a shield go together', () => {
        const outfit = equip(equip(empty, sword, items), shield, items);
        expect(outfit.equipment).toEqual({ [EquipmentSlot.weapon]: 1333, [EquipmentSlot.shield]: 1201 });
    });

    test('unequip empties the slot', () => {
        expect(unequip(equip(empty, helm, items), EquipmentSlot.head).equipment).toEqual({});
    });
});

describe('share links', () => {
    test('round-trip an outfit', () => {
        const outfit: Outfit = {
            gender: 'female',
            equipment: { [EquipmentSlot.head]: 1163, [EquipmentSlot.weapon]: 1333 },
        };
        const params = outfitParams(outfit);
        expect(params.toString()).toBe('gender=female&head=1163&weapon=1333');
        expect(parseOutfitParams(params)).toEqual(outfit);
    });

    test('leave the default body out of the link', () => {
        expect(outfitParams(empty).toString()).toBe('');
    });

    test('ignore junk and slots that never show', () => {
        const parsed = parseOutfitParams(
            new URLSearchParams('gender=robot&head=abc&body=-1&ring=2550&legs=1079&extra=1'),
        );
        expect(parsed).toEqual({ gender: 'male', equipment: { [EquipmentSlot.legs]: 1079 } });
    });

    test('validation drops unknown items and items in the wrong slot, and applies the equip rules', () => {
        const fromLink: Outfit = {
            gender: 'male',
            equipment: {
                [EquipmentSlot.head]: 999999,
                [EquipmentSlot.body]: 1163,
                [EquipmentSlot.weapon]: 11802,
                [EquipmentSlot.shield]: 1201,
            },
        };
        const valid = validateOutfit(fromLink, items);
        expect(valid.equipment[EquipmentSlot.head]).toBeUndefined();
        expect(valid.equipment[EquipmentSlot.body]).toBeUndefined();
        // Both can't be worn together; whichever the rules keep, it's only one of them.
        expect(Object.keys(valid.equipment)).toHaveLength(1);
    });
});

test('every outfit idles in the standard stance until weapon stances exist', () => {
    expect(idleFor({ gender: 'male', equipment: { [EquipmentSlot.weapon]: 11802 } })).toBe('idle');
});
