import { persisted } from 'svelte-persisted-store';
import { LocalStorageStoreNames } from '$lib/constants/enums/local-storage-store-names';
import type { IGameItem } from '$lib/models/game-item';
import type { CharacterProfile } from '$lib/models/player-stats';

export interface BankItemEntry {
    id: IGameItem['id'];
    quantity: number;
}

export interface BankItemsState {
    itemsByCharacterId: Record<string, BankItemEntry[]>;
}

const UNASSIGNED_SUPPLIES_KEY = 'unassigned';

export const bankItemsStore = persisted<BankItemsState>(LocalStorageStoreNames.BANK_ITEMS_STORE, {
    itemsByCharacterId: {},
});

function normalizeKey(characterId?: CharacterProfile['id'] | null): string {
    if (characterId === null || characterId === undefined) return UNASSIGNED_SUPPLIES_KEY;
    const key = String(characterId).trim();
    return key ? key : UNASSIGNED_SUPPLIES_KEY;
}

function readLegacyItems(state: unknown): BankItemEntry[] | null {
    if (!state || typeof state !== 'object') return null;
    const legacy = (state as { items?: unknown }).items;
    return Array.isArray(legacy) ? (legacy as BankItemEntry[]) : null;
}

function normalizeState(current?: BankItemsState | null): BankItemsState {
    if (!current || typeof current !== 'object') {
        return { itemsByCharacterId: {} };
    }

    const itemsByCharacterId = current.itemsByCharacterId ?? {};
    const legacyItems = readLegacyItems(current);
    if (!legacyItems || legacyItems.length === 0) {
        return current.itemsByCharacterId ? current : { itemsByCharacterId };
    }

    const existing = itemsByCharacterId[UNASSIGNED_SUPPLIES_KEY];
    if (existing && existing.length) {
        return current.itemsByCharacterId ? current : { itemsByCharacterId };
    }

    return {
        itemsByCharacterId: {
            ...itemsByCharacterId,
            [UNASSIGNED_SUPPLIES_KEY]: legacyItems,
        },
    };
}

function resolveItemsForKey(state: BankItemsState, key: string) {
    const existing = state.itemsByCharacterId[key];
    if (existing) {
        return { items: existing, itemsByCharacterId: state.itemsByCharacterId };
    }

    if (key !== UNASSIGNED_SUPPLIES_KEY) {
        const unassigned = state.itemsByCharacterId[UNASSIGNED_SUPPLIES_KEY];
        if (unassigned && unassigned.length) {
            const nextMap = { ...state.itemsByCharacterId, [key]: unassigned };
            delete nextMap[UNASSIGNED_SUPPLIES_KEY];
            return { items: unassigned, itemsByCharacterId: nextMap };
        }
    }

    return { items: [], itemsByCharacterId: state.itemsByCharacterId };
}

export function getSuppliesForCharacter(
    state: BankItemsState | undefined,
    characterId?: CharacterProfile['id'] | null,
): BankItemEntry[] {
    if (!state) return [];
    const normalized = normalizeState(state);
    const key = normalizeKey(characterId);
    return normalized.itemsByCharacterId[key] ?? [];
}

export function ensureSuppliesForCharacter(characterId?: CharacterProfile['id'] | null) {
    bankItemsStore.update((current) => {
        const normalized = normalizeState(current);
        const key = normalizeKey(characterId);
        const resolved = resolveItemsForKey(normalized, key);
        if (resolved.itemsByCharacterId === normalized.itemsByCharacterId) {
            return normalized;
        }
        return { ...normalized, itemsByCharacterId: resolved.itemsByCharacterId };
    });
}

export function updateSuppliesForCharacter(
    characterId: CharacterProfile['id'] | null | undefined,
    updater: (items: BankItemEntry[]) => BankItemEntry[],
) {
    bankItemsStore.update((current) => {
        const normalized = normalizeState(current);
        const key = normalizeKey(characterId);
        const resolved = resolveItemsForKey(normalized, key);
        const nextItems = updater(resolved.items);
        return {
            ...normalized,
            itemsByCharacterId: { ...resolved.itemsByCharacterId, [key]: nextItems },
        };
    });
}

export function removeSuppliesForCharacter(characterId: CharacterProfile['id'] | null | undefined) {
    if (characterId === null || characterId === undefined) return;
    const key = normalizeKey(characterId);
    if (key === UNASSIGNED_SUPPLIES_KEY) return;

    bankItemsStore.update((current) => {
        const normalized = normalizeState(current);
        if (!normalized.itemsByCharacterId[key]) {
            return normalized;
        }
        const nextMap = { ...normalized.itemsByCharacterId };
        delete nextMap[key];
        return { ...normalized, itemsByCharacterId: nextMap };
    });
}
