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

/**
 * Ironman mode switched by hand, for the character it was switched for. Selecting a different
 * character leaves it behind, so each character starts from its own account type again.
 */
interface IronmanModeOverride {
    characterId: CharacterProfile['id'] | null;
    ironman: boolean;
}

interface ICharacterStoreData {
    activeCharacter: undefined | CharacterProfile['id'];
    characters: CharacterProfile[];
    /** Absent in profiles saved before the toggle existed. */
    ironmanModeOverride?: IronmanModeOverride | null;
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

/** Whether the active character's account type is an Ironman one, ignoring any toggle. */
function accountTypeIsIronman(): boolean {
    return !canUseGrandExchange(getActiveAccountType());
}

function activeCharacterKey(): CharacterProfile['id'] | null {
    const activeId = _store.current.activeCharacter;
    return activeId === undefined || activeId === null ? null : activeId;
}

/**
 * Whether the site is in Ironman mode: every price is an Ironman's (alch and shop values), and
 * nothing from the Grand Exchange is shown.
 *
 * This is the one switch everything reads. It follows the active character's account type unless
 * Ironman mode was toggled by hand for that character.
 */
export function activeIsIronman(): boolean {
    const override = _store.current.ironmanModeOverride;
    if (override && String(override.characterId) === String(activeCharacterKey())) return override.ironman;
    return accountTypeIsIronman();
}

/** Whether GE prices apply, i.e. Ironman mode is off. */
export function activeCanUseGrandExchange(): boolean {
    return !activeIsIronman();
}

/**
 * Turns Ironman mode on or off without changing the character. Matching the character's own
 * account type clears the override rather than storing a redundant one.
 */
export function setIronmanMode(ironman: boolean): void {
    _store.current.ironmanModeOverride =
        ironman === accountTypeIsIronman() ? null : { characterId: activeCharacterKey(), ironman };
}
