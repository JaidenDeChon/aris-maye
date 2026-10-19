import { persisted } from 'svelte-persisted-store';
import { LocalStorageStoreNames } from '$lib/constants/enums/local-storage-store-names';
import type { Outfit } from '$lib/transmog/outfit';

export interface SavedOutfit {
    id: string;
    name: string;
    outfit: Outfit;
    savedAt: number;
}

/** Outfits saved in this browser from the transmog page, newest first. */
export const savedOutfitsStore = persisted(LocalStorageStoreNames.TRANSMOG_OUTFITS_STORE, {
    outfits: [] as SavedOutfit[],
});

/** How many saved outfits to keep; saving past this drops the oldest. */
export const MAX_SAVED_OUTFITS = 50;
