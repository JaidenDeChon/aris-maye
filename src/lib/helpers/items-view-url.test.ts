import { describe, expect, it } from 'bun:test';
import {
    DEFAULT_ITEMS_VIEW,
    FILTER_OPTIONS,
    applyItemsView,
    isDefaultItemsView,
    itemsViewPath,
    normalizeSort,
    parseItemsView,
    type ItemsView,
} from './items-view-url';

const params = (query: string) => new URLSearchParams(query);
const write = (view: ItemsView, query = '') => applyItemsView(params(query), view).toString();

describe('parseItemsView', () => {
    it('returns null when the URL carries no view, so saved settings apply', () => {
        expect(parseItemsView(params(''))).toBeNull();
        expect(parseItemsView(params('utm_source=discord'))).toBeNull();
    });

    it('fills the parameters a link leaves out with defaults', () => {
        expect(parseItemsView(params('filter=members'))).toEqual({ filter: 'members', sort: 'desc', profit: false });
        expect(parseItemsView(params('profit=1'))).toEqual({ filter: 'all', sort: 'desc', profit: true });
    });

    it('treats invalid and empty values as defaults', () => {
        expect(parseItemsView(params('filter=bogus&sort=nonsense'))).toEqual(DEFAULT_ITEMS_VIEW);
        expect(parseItemsView(params('filter=&sort=&profit='))).toEqual(DEFAULT_ITEMS_VIEW);
        expect(parseItemsView(params('profit=yes'))).toEqual(DEFAULT_ITEMS_VIEW);
    });

    it('maps legacy sort names', () => {
        expect(parseItemsView(params('sort=profit-asc&profit=1'))?.sort).toBe('roi-value-desc');
        expect(parseItemsView(params('sort=profit-desc&profit=1'))?.sort).toBe('roi-value-desc');
    });

    it('falls back to sort by value when an ROI sort arrives without profit mode', () => {
        expect(parseItemsView(params('sort=roi-desc'))).toEqual({ filter: 'all', sort: 'desc', profit: false });
    });

    it('uses the first value when a key is repeated', () => {
        expect(parseItemsView(params('filter=members&filter=f2p'))?.filter).toBe('members');
    });
});

describe('applyItemsView', () => {
    it('round-trips every filter and sort value, alone and combined', () => {
        const sorts = ['desc', 'roi-desc', 'roi-value-desc'];
        for (const { value: filter } of FILTER_OPTIONS) {
            for (const sort of sorts) {
                for (const profit of [true, false]) {
                    const view = { filter, sort: normalizeSort(sort, profit), profit };
                    const back = parseItemsView(applyItemsView(params(''), view)) ?? DEFAULT_ITEMS_VIEW;
                    expect(back).toEqual(view);
                }
            }
        }
    });

    it('leaves defaults out, so a default view writes an empty query', () => {
        expect(write(DEFAULT_ITEMS_VIEW)).toBe('');
        expect(write({ filter: 'members', sort: 'desc', profit: true })).toBe('filter=members&profit=1');
        expect(write({ filter: 'all', sort: 'roi-desc', profit: true })).toBe('sort=roi-desc&profit=1');
    });

    it('keeps unrelated parameters and never duplicates its own', () => {
        const view = { filter: 'f2p', sort: 'desc', profit: false };
        expect(write(view, 'utm_source=discord&filter=members&filter=quest')).toBe('utm_source=discord&filter=f2p');
        expect(write(DEFAULT_ITEMS_VIEW, 'utm_source=discord&sort=roi-desc&profit=1')).toBe('utm_source=discord');
    });

    it('does not mutate the params it is given', () => {
        const input = params('filter=members');
        applyItemsView(input, DEFAULT_ITEMS_VIEW);
        expect(input.toString()).toBe('filter=members');
    });
});

describe('itemsViewPath', () => {
    it('drops the question mark when there is no query', () => {
        expect(itemsViewPath('/items', params(''), DEFAULT_ITEMS_VIEW)).toBe('/items');
        expect(itemsViewPath('/items/smithing', params(''), { ...DEFAULT_ITEMS_VIEW, filter: 'members' })).toBe(
            '/items/smithing?filter=members',
        );
    });
});

describe('isDefaultItemsView', () => {
    it('is true only for all, desc, profit off', () => {
        expect(isDefaultItemsView(DEFAULT_ITEMS_VIEW)).toBe(true);
        expect(isDefaultItemsView({ ...DEFAULT_ITEMS_VIEW, profit: true })).toBe(false);
    });
});
