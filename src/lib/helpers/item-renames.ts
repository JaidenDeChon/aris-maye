/**
 * Items the game has renamed since the osrsreboxed-db snapshot was taken.
 *
 * The snapshot still carries the old name, and its `wiki_url` points at the old page. For
 * these items that page no longer documents the recipe: "Cannonball" became an overview
 * of every cannonball type when Sailing launched, and "Bronze javelin heads" is now only
 * a redirect to "Bronze javelin tips", which the importer doesn't follow. Either way the
 * scrape finds no Creation section and the item ends up with no `creationSpecs`.
 *
 * Keyed by the old in-game name, so every copy (noted, placeholder, the duplicate ids)
 * is renamed together and they keep sharing one name.
 *
 * Only add a rename here when the item's current wiki page has a Creation section the
 * old one lacks. The GE mapping's names differ from ours for ~400 other items, but
 * nearly all of those are wiki disambiguation labels ("Oak chair (flatpack)"), not
 * renames, and the old page still holds the recipe.
 */
export const ITEM_RENAMES: Readonly<Record<string, string>> = {
    Cannonball: 'Steel cannonball',
    'Bronze javelin heads': 'Bronze javelin tips',
    'Iron javelin heads': 'Iron javelin tips',
    'Steel javelin heads': 'Steel javelin tips',
    'Mithril javelin heads': 'Mithril javelin tips',
    'Adamant javelin heads': 'Adamant javelin tips',
    'Rune javelin heads': 'Rune javelin tips',
    'Dragon javelin heads': 'Dragon javelin tips',
    'Amethyst javelin heads': 'Amethyst javelin tips',
};

const WIKI_ARTICLE_BASE = 'https://oldschool.runescape.wiki/w/';

/** The fields a rename rewrites. */
export interface RenameableItem {
    name?: string | null;
    wiki_name?: string | null;
    wiki_url?: string | null;
}

/**
 * Returns the item with its current name and wiki page, if the game has renamed it.
 *
 * `wiki_name` and `wiki_url` move with the name, so the wiki title derived from them
 * (`deriveWikiPageIdentity`) is the new page. Items not in `ITEM_RENAMES` come back
 * unchanged, as the same object.
 * @param item - An item document, or anything carrying its name and wiki fields.
 * @returns The renamed item, or `item` itself.
 */
export function applyItemRename<T extends RenameableItem>(item: T): T {
    const newName = item.name ? ITEM_RENAMES[item.name] : undefined;
    if (!newName) return item;

    return {
        ...item,
        name: newName,
        wiki_name: newName,
        wiki_url: `${WIKI_ARTICLE_BASE}${encodeURIComponent(newName.replace(/ /g, '_'))}`,
    };
}
