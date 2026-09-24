import { persisted } from 'svelte-persisted-store';
import { LocalStorageStoreNames } from '$lib/constants/enums/local-storage-store-names';

export type ItemsPagePreferences = {
    filter: string;
    sortOrder: string;
    perPage: string;
    page: number;
    useSupplies: boolean;
    profitMode: boolean;
};

export const itemsPagePreferences = persisted<ItemsPagePreferences>(LocalStorageStoreNames.ITEMS_PAGE_PREFERENCES, {
    filter: 'all',
    sortOrder: 'desc',
    perPage: '12',
    page: 1,
    useSupplies: false,
    profitMode: false,
});
