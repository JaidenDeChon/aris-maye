/**
 * Picks the creation methods that belong to one variant of a multi-version wiki page.
 *
 * `wiki_url` anchors an item at a single infobox version ("Steel dart#Poison"), but the
 * wiki API has no way to fetch part of a section: scraping the page returns *every*
 * variant's recipe. Storing all of them makes the item's primary spec — the first one
 * with ingredients — belong to whichever variant the wiki happens to list first, so
 * `Steel dart(p)` was costed as ten unpoisoned darts and `Steel bolts` picked a
 * poisoning recipe.
 *
 * The wiki labels those panels with the same version names OSRSBox anchors on, so the
 * label is the discriminator. It is not always present — plenty of Creation sections are
 * plain subsections with no labels at all, and some pages label by material rather than
 * by version ("Feather", "Yellow feather") — so every step here degrades to "keep
 * everything" rather than dropping data it cannot account for.
 *
 * See `scripts/WIKI-NAME-NORMALIZATION.md`.
 */

/** The shape this module needs from a scraped wiki method. */
export interface VariantLabelled {
    methodName?: string;
}

/**
 * Folds a version or method label to a comparable form.
 *
 * Wiki anchors arrive underscored ("Karambwan_poison") while panel labels are spaced, and
 * either can carry a non-breaking space, so every run of whitespace or underscore — `\s`
 * covers U+00A0 — collapses to a single space.
 */
function normalizeVariantLabel(label: string): string {
    return label
        .replace(/[\s_]+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Narrows scraped methods to the ones that describe the requested infobox version.
 *
 * Resolution order:
 *  1. Methods labelled with this item's own version win outright.
 *  2. Otherwise methods labelled with a *sibling* version are dropped — that is what
 *     keeps the poison recipes off unpoisoned `Steel bolts`, whose own panels are
 *     labelled by fletching material and so never match by name.
 *  3. Anything left unaccounted for is kept, so a page that labels by material rather
 *     than by version comes back whole.
 *
 * Step 2 can legitimately empty the list, and that is an answer rather than a failure:
 * `Abyssal dagger` documents only the three poisoning recipes, so the plain dagger — a
 * drop, not a craft — has no recipe on the page at all. It was being given the cheapest
 * poisoning recipe instead, which put a 399gp cost on a 2.2M item and floated it to the
 * top of the ROI sort. An empty result only happens when *every* method is claimed by a
 * named sibling, so a page whose labels stop matching keeps everything rather than
 * losing it.
 * @param methods - Methods scraped from the page, in wiki order.
 * @param version - The item's `wiki_version`, or null for an unversioned page.
 * @param siblingVersions - Versions of the other items sharing this page.
 * @returns The methods to store, in their original order; empty when the page documents
 *   no recipe for this version.
 */
export function selectMethodsForVersion<T extends VariantLabelled>(
    methods: T[],
    version: string | null | undefined,
    siblingVersions: Iterable<string> = [],
): T[] {
    const target = version ? normalizeVariantLabel(version) : '';
    if (!target || !methods.length) return methods;

    const labelOf = (method: T) => (method.methodName ? normalizeVariantLabel(method.methodName) : '');

    const ownVariant = methods.filter((method) => labelOf(method) === target);
    if (ownVariant.length) return ownVariant;

    const siblings = new Set<string>();
    for (const sibling of siblingVersions) {
        const normalized = normalizeVariantLabel(sibling);
        if (normalized && normalized !== target) siblings.add(normalized);
    }
    if (!siblings.size) return methods;

    return methods.filter((method) => {
        const label = labelOf(method);
        return !label || !siblings.has(label);
    });
}
