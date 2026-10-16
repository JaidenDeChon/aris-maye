import { describe, expect, it } from 'bun:test';
import { applyItemRename } from './item-renames';
import { deriveWikiPageIdentity } from './wiki-page-title';

describe('applyItemRename', () => {
    it('moves a renamed item to its new name and wiki page', () => {
        const renamed = applyItemRename({
            id: 2,
            name: 'Cannonball',
            wiki_name: 'Cannonball',
            wiki_url: 'https://oldschool.runescape.wiki/w/Cannonball',
            tradeable_on_ge: true,
        });

        expect(renamed).toEqual({
            id: 2,
            name: 'Steel cannonball',
            wiki_name: 'Steel cannonball',
            wiki_url: 'https://oldschool.runescape.wiki/w/Steel_cannonball',
            tradeable_on_ge: true,
        });
        expect(deriveWikiPageIdentity(renamed)).toEqual({ wikiPageTitle: 'Steel cannonball', wikiVersion: null });
    });

    it('renames every copy that shares the old name', () => {
        // The placeholder (17853) carries the same name as the real item (2).
        expect(applyItemRename({ id: 17853, name: 'Cannonball', placeholder: true }).name).toBe('Steel cannonball');
        expect(applyItemRename({ id: 3066, name: 'Bronze javelin heads', duplicate: true }).name).toBe(
            'Bronze javelin tips',
        );
    });

    it('returns other items untouched', () => {
        const item = { name: 'Granite cannonball', wiki_url: 'https://oldschool.runescape.wiki/w/Granite_cannonball' };
        expect(applyItemRename(item)).toBe(item);
        const unnamed = { name: null };
        expect(applyItemRename(unnamed)).toBe(unnamed);
    });

    it('is idempotent', () => {
        const once = applyItemRename({ name: 'Rune javelin heads' });
        expect(applyItemRename(once)).toBe(once);
    });
});
