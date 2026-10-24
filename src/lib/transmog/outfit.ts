/**
 * An outfit in the transmog tool: a body and the item in each equipment slot, plus how it's
 * written into a share link and which idle animation it uses.
 */
import { EquipmentSlot, type Equipment } from '$lib/osrs-model/compose';
import type { Gender, WearableItem } from '$lib/osrs-model/types';

export interface Outfit {
    gender: Gender;
    equipment: Equipment;
}

export const EMPTY_OUTFIT: Outfit = { gender: 'male', equipment: {} };

export interface SlotInfo {
    /** Equipment slot id (see EquipmentSlot). */
    id: number;
    /** URL parameter and sprite name. */
    key: string;
    label: string;
    /** Rings and ammo don't show on a player, so they can't be filled. */
    visible: boolean;
    /** Row and column in the in-game equipment tab, 1-based. */
    row: number;
    column: number;
}

/** The equipment tab, laid out as in game. */
export const SLOTS: SlotInfo[] = [
    { id: EquipmentSlot.head, key: 'head', label: 'Head', visible: true, row: 1, column: 2 },
    { id: EquipmentSlot.cape, key: 'cape', label: 'Cape', visible: true, row: 2, column: 1 },
    { id: EquipmentSlot.amulet, key: 'amulet', label: 'Neck', visible: true, row: 2, column: 2 },
    { id: EquipmentSlot.ammo, key: 'ammo', label: 'Ammo', visible: false, row: 2, column: 3 },
    { id: EquipmentSlot.weapon, key: 'weapon', label: 'Weapon', visible: true, row: 3, column: 1 },
    { id: EquipmentSlot.body, key: 'body', label: 'Body', visible: true, row: 3, column: 2 },
    { id: EquipmentSlot.shield, key: 'shield', label: 'Shield', visible: true, row: 3, column: 3 },
    { id: EquipmentSlot.legs, key: 'legs', label: 'Legs', visible: true, row: 4, column: 2 },
    { id: EquipmentSlot.hands, key: 'hands', label: 'Hands', visible: true, row: 5, column: 1 },
    { id: EquipmentSlot.feet, key: 'feet', label: 'Feet', visible: true, row: 5, column: 2 },
    { id: EquipmentSlot.ring, key: 'ring', label: 'Ring', visible: false, row: 5, column: 3 },
];

export const VISIBLE_SLOTS = SLOTS.filter((s) => s.visible);

/**
 * Puts an item on, taking off whatever the game wouldn't let you wear with it: a two-handed
 * weapon takes the shield off, and a shield takes a two-handed weapon off.
 */
export function equip(outfit: Outfit, item: WearableItem, items: Map<number, WearableItem>): Outfit {
    const equipment: Equipment = { ...outfit.equipment, [item.slot]: item.id };
    for (const hidden of item.hides) {
        if (hidden !== item.slot) delete equipment[hidden];
    }
    for (const [slot, id] of Object.entries(equipment)) {
        const other = id === undefined ? undefined : items.get(id);
        if (other && other.id !== item.id && other.hides.includes(item.slot)) delete equipment[Number(slot)];
    }
    return { ...outfit, equipment };
}

export function unequip(outfit: Outfit, slot: number): Outfit {
    const equipment = { ...outfit.equipment };
    delete equipment[slot];
    return { ...outfit, equipment };
}

/**
 * Which looping animation to play while idle: the weapon's own stance (a godsword, staff, 2h...)
 * when it has one, otherwise the standard stand.
 */
export function idleFor(outfit: Outfit, stances: Record<string, string>): string {
    const weapon = outfit.equipment[EquipmentSlot.weapon];
    return (weapon !== undefined && stances[weapon]) || 'idle';
}

/** Writes an outfit as URL parameters, e.g. ?gender=female&head=1163&body=1127. */
export function outfitParams(outfit: Outfit): URLSearchParams {
    const params = new URLSearchParams();
    if (outfit.gender !== 'male') params.set('gender', outfit.gender);
    for (const slot of SLOTS) {
        const id = outfit.equipment[slot.id];
        if (id !== undefined) params.set(slot.key, String(id));
    }
    return params;
}

/**
 * Reads an outfit from URL parameters. Unknown parameters and anything malformed are ignored;
 * item ids are checked against the item list later, once it's loaded.
 */
export function parseOutfitParams(params: URLSearchParams): Outfit {
    const gender: Gender = params.get('gender') === 'female' ? 'female' : 'male';
    const equipment: Equipment = {};
    for (const slot of VISIBLE_SLOTS) {
        const raw = params.get(slot.key);
        if (raw === null || !/^\d{1,6}$/.test(raw)) continue;
        equipment[slot.id] = Number(raw);
    }
    return { gender, equipment };
}

/** Drops items that don't exist or don't go in the slot they're listed under, then re-applies the equip rules. */
export function validateOutfit(outfit: Outfit, items: Map<number, WearableItem>): Outfit {
    let valid: Outfit = { gender: outfit.gender, equipment: {} };
    for (const [slot, id] of Object.entries(outfit.equipment)) {
        const item = id === undefined ? undefined : items.get(id);
        if (item && item.slot === Number(slot)) valid = equip(valid, item, items);
    }
    return valid;
}

export function isEmptyOutfit(outfit: Outfit): boolean {
    return Object.keys(outfit.equipment).length === 0;
}

/** The emotes the picker offers, in emote-tab order, keyed by their name in the manifest. */
export const EMOTES: { key: string; label: string }[] = [
    { key: 'yes', label: 'Yes' },
    { key: 'no', label: 'No' },
    { key: 'bow', label: 'Bow' },
    { key: 'angry', label: 'Angry' },
    { key: 'think', label: 'Think' },
    { key: 'wave', label: 'Wave' },
    { key: 'shrug', label: 'Shrug' },
    { key: 'cheer', label: 'Cheer' },
    { key: 'beckon', label: 'Beckon' },
    { key: 'laugh', label: 'Laugh' },
    { key: 'jumpForJoy', label: 'Jump for Joy' },
    { key: 'yawn', label: 'Yawn' },
    { key: 'dance', label: 'Dance' },
    { key: 'jig', label: 'Jig' },
    { key: 'spin', label: 'Spin' },
    { key: 'headbang', label: 'Headbang' },
    { key: 'cry', label: 'Cry' },
    { key: 'blowKiss', label: 'Blow Kiss' },
    { key: 'panic', label: 'Panic' },
    { key: 'raspberry', label: 'Raspberry' },
    { key: 'clap', label: 'Clap' },
    { key: 'salute', label: 'Salute' },
];
