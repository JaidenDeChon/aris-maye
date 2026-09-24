// src/lib/stores/character-store.svelte.ts
import { LocalStorageStoreNames } from '$lib/constants/enums/local-storage-store-names';
import type { CharacterProfile } from '$lib/models/player-stats';
import {
    DEFAULT_ACCOUNT_TYPE,
    canUseGrandExchange,
    normalizeAccountType,
    type AccountType,
} from '$lib/models/account-type';
import { LocalStorage } from '$lib/services/persisted-store.svelte';

interface ICharacterStoreData {
    activeCharacter: undefined | CharacterProfile['id'];
    characters: CharacterProfile[];
}

const _store = new LocalStorage<ICharacterStoreData>(LocalStorageStoreNames.CHARACTER_STORE, {
    activeCharacter: undefined,
    characters: [],
});

// Expose live proxies (no runes in module exports).

// live proxy to the JSON root.
export function getStoreRoot() {
    return _store.current;
}

// live proxied array of characters.
export function getCharacters() {
    return _store.current.characters;
}

// live proxied active character id.
export function getActiveCharacter() {
    return _store.current.activeCharacter;
}

// live proxied account type of the active character.
// Falls back to the default when no character is selected, so a visitor with no profile keeps
// seeing Grand Exchange prices exactly as before.
export function getActiveAccountType(): AccountType {
    const activeId = _store.current.activeCharacter;
    if (activeId === undefined || activeId === null) return DEFAULT_ACCOUNT_TYPE;

    const active = _store.current.characters.find((c) => String(c.id) === String(activeId));
    return normalizeAccountType(active?.accountType);
}

/** Whether the active character may use the Grand Exchange, i.e. whether GE prices apply to them. */
export function activeCanUseGrandExchange(): boolean {
    return canUseGrandExchange(getActiveAccountType());
}

/** Whether the active character should be shown Ironman pricing. */
export function activeIsIronman(): boolean {
    return !activeCanUseGrandExchange();
}
