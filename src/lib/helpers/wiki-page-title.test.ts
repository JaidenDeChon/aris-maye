import { describe, expect, it } from 'bun:test';
import { deriveWikiPageIdentity, wikiTitleCandidates } from './wiki-page-title';

describe('deriveWikiPageIdentity', () => {
    it('splits an anchored wiki_url into page title and version', () => {
        expect(
            deriveWikiPageIdentity({
                name: 'Oak seedling (w)',
                wiki_name: 'Oak seedling (Watered)',
                wiki_url: 'https://oldschool.runescape.wiki/w/Oak_seedling#Watered',
            }),
        ).toEqual({ wikiPageTitle: 'Oak seedling', wikiVersion: 'Watered' });
    });

    it('does not strip a parenthetical that is part of a real page title', () => {
        // "Longbow (u)" is genuinely the page name — there is no anchor to key off,
        // so the title must survive untouched.
        expect(
            deriveWikiPageIdentity({
                name: 'Longbow (u)',
                wiki_name: 'Longbow (u)',
                wiki_url: 'https://oldschool.runescape.wiki/w/Longbow_(u)',
            }),
        ).toEqual({ wikiPageTitle: 'Longbow (u)', wikiVersion: null });
    });

    it('handles a page title that is parenthetical AND versioned', () => {
        expect(
            deriveWikiPageIdentity({
                name: 'Holy grail',
                wiki_name: 'Holy grail (item) (Normal)',
                wiki_url: 'https://oldschool.runescape.wiki/w/Holy_grail_(item)#Normal',
            }),
        ).toEqual({ wikiPageTitle: 'Holy grail (item)', wikiVersion: 'Normal' });
    });

    it('percent-decodes before converting underscores to spaces', () => {
        expect(
            deriveWikiPageIdentity({
                name: "Hydra's eye",
                wiki_name: "Hydra's eye",
                wiki_url: 'https://oldschool.runescape.wiki/w/Hydra%27s_eye',
            }),
        ).toEqual({ wikiPageTitle: "Hydra's eye", wikiVersion: null });
    });

    it('keeps a dose anchor that is itself parenthesised', () => {
        expect(
            deriveWikiPageIdentity({
                name: 'Waterskin(4)',
                wiki_name: 'Waterskin (4)',
                wiki_url: 'https://oldschool.runescape.wiki/w/Waterskin#(4)',
            }),
        ).toEqual({ wikiPageTitle: 'Waterskin', wikiVersion: '(4)' });
    });

    it('decodes an encoded anchor', () => {
        expect(
            deriveWikiPageIdentity({
                name: 'Ring of recoil',
                wiki_name: 'Ring of recoil (1 charge)',
                wiki_url: 'https://oldschool.runescape.wiki/w/Ring_of_recoil#1_charge',
            }),
        ).toEqual({ wikiPageTitle: 'Ring of recoil', wikiVersion: '1 charge' });
    });

    it('falls back to wiki_name when wiki_url is missing', () => {
        expect(deriveWikiPageIdentity({ name: 'Axe', wiki_name: 'Bronze axe', wiki_url: null })).toEqual({
            wikiPageTitle: 'Bronze axe',
            wikiVersion: null,
        });
    });

    it('falls back to name when both wiki fields are missing', () => {
        expect(deriveWikiPageIdentity({ name: 'Bronze axe' })).toEqual({
            wikiPageTitle: 'Bronze axe',
            wikiVersion: null,
        });
    });

    it('returns nulls when there is nothing to derive from', () => {
        expect(deriveWikiPageIdentity({})).toEqual({ wikiPageTitle: null, wikiVersion: null });
    });

    it('ignores an empty anchor', () => {
        expect(
            deriveWikiPageIdentity({
                name: 'Bronze axe',
                wiki_url: 'https://oldschool.runescape.wiki/w/Bronze_axe#',
            }),
        ).toEqual({ wikiPageTitle: 'Bronze axe', wikiVersion: null });
    });

    it('keeps slashes that are part of the title', () => {
        // MediaWiki titles may contain literal slashes, so the path cannot simply be
        // split on '/' and reduced to its last segment.
        expect(
            deriveWikiPageIdentity({
                name: '4/5ths full bucket',
                wiki_name: '4/5ths full bucket',
                wiki_url: 'https://oldschool.runescape.wiki/w/4/5ths_full_bucket',
            }),
        ).toEqual({ wikiPageTitle: '4/5ths full bucket', wikiVersion: null });
    });

    it('keeps slashes in a title that is also versioned', () => {
        expect(
            deriveWikiPageIdentity({
                name: 'Dragon legs/skirt ornament kit',
                wiki_name: 'Dragon legs/skirt ornament kit (Legs)',
                wiki_url: 'https://oldschool.runescape.wiki/w/Dragon_legs/skirt_ornament_kit#Legs',
            }),
        ).toEqual({ wikiPageTitle: 'Dragon legs/skirt ornament kit', wikiVersion: 'Legs' });
    });

    it('tolerates a malformed percent-escape rather than throwing', () => {
        expect(
            deriveWikiPageIdentity({
                name: 'Broken',
                wiki_url: 'https://oldschool.runescape.wiki/w/100%_broken',
            }),
        ).toEqual({ wikiPageTitle: '100% broken', wikiVersion: null });
    });
});

describe('wikiTitleCandidates', () => {
    it('puts the real page title ahead of the synthetic wiki_name', () => {
        expect(
            wikiTitleCandidates({
                name: 'Oak seedling (w)',
                wiki_name: 'Oak seedling (Watered)',
                wiki_url: 'https://oldschool.runescape.wiki/w/Oak_seedling#Watered',
            }),
        ).toEqual(['Oak seedling', 'Oak seedling (w)', 'Oak seedling (Watered)']);
    });

    it('deduplicates when the fields agree', () => {
        expect(
            wikiTitleCandidates({
                name: 'Bronze axe',
                wiki_name: 'Bronze axe',
                wiki_url: 'https://oldschool.runescape.wiki/w/Bronze_axe',
            }),
        ).toEqual(['Bronze axe']);
    });

    it('returns an empty list when nothing is known', () => {
        expect(wikiTitleCandidates({})).toEqual([]);
    });
});
