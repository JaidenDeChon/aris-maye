/**
 * The part of the browse page's state a shared link carries: filter, sort and profit mode. A URL
 * with any of these keys describes a whole view; one with none means "use my saved settings".
 */

export const FILTER_OPTIONS = [
    { value: 'all', label: 'All items' },
    { value: 'members', label: 'Members only' },
    { value: 'f2p', label: 'Free to play' },
    { value: 'equipable', label: 'Equipable' },
    { value: 'stackable', label: 'Stackable' },
    { value: 'quest', label: 'Quest items' },
    { value: 'nonquest', label: 'Non-quest items' },
] as const;

export const SORT_OPTIONS = [
    { value: 'roi-desc', label: 'Sort by ROI (percentage)' },
    { value: 'roi-value-desc', label: 'Sort by ROI (value)' },
    { value: 'desc', label: 'Sort by value' },
] as const;

// Sort orders that are computed from creation cost, so they need profit mode turned on.
export const PROFIT_SORT_VALUES: readonly string[] = ['roi-desc', 'roi-value-desc'];

// Retired sort orders still sitting in persisted preferences or bookmarked URLs.
const LEGACY_SORT_VALUES: Record<string, string> = {
    'profit-asc': 'roi-value-desc',
    'profit-desc': 'roi-value-desc',
};

const VIEW_KEYS = ['filter', 'sort', 'profit'] as const;

export type ItemsView = { filter: string; sort: string; profit: boolean };

export const DEFAULT_ITEMS_VIEW: ItemsView = { filter: 'all', sort: 'desc', profit: false };

export function normalizeSort(value: string | null | undefined, profitEnabled: boolean): string {
    if (!value) return 'desc';
    const resolved = LEGACY_SORT_VALUES[value] ?? value;
    return PROFIT_SORT_VALUES.includes(resolved) && profitEnabled ? resolved : 'desc';
}

export function parseItemsView(params: URLSearchParams): ItemsView | null {
    if (!VIEW_KEYS.some((key) => params.has(key))) return null;
    const filter = params.get('filter');
    const profit = params.get('profit') === '1';
    return {
        filter: FILTER_OPTIONS.some((option) => option.value === filter) ? filter! : 'all',
        sort: normalizeSort(params.get('sort'), profit),
        profit,
    };
}

export function applyItemsView(params: URLSearchParams, view: ItemsView): URLSearchParams {
    const next = new URLSearchParams(params);
    for (const key of VIEW_KEYS) next.delete(key);
    if (view.filter !== DEFAULT_ITEMS_VIEW.filter) next.append('filter', view.filter);
    if (view.sort !== DEFAULT_ITEMS_VIEW.sort) next.append('sort', view.sort);
    if (view.profit) next.append('profit', '1');
    return next;
}

export function itemsViewPath(pathname: string, params: URLSearchParams, view: ItemsView): string {
    const query = applyItemsView(params, view).toString();
    return query ? `${pathname}?${query}` : pathname;
}

export function isDefaultItemsView(view: ItemsView): boolean {
    return (
        view.filter === DEFAULT_ITEMS_VIEW.filter &&
        view.sort === DEFAULT_ITEMS_VIEW.sort &&
        view.profit === DEFAULT_ITEMS_VIEW.profit
    );
}
