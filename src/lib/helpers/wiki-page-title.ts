/**
 * Recovers the real OSRS Wiki page title for an item.
 *
 * OSRSBox does not store the page title for items that live on a "switch infobox"
 * page. It synthesises `wiki_name` by appending the infobox version label in
 * parentheses and points `wiki_url` at an anchor:
 *
 *   name      = "Oak seedling (w)"        <- the in-game name
 *   wiki_name = "Oak seedling (Watered)"  <- synthetic; 404s on the wiki
 *   wiki_url  = ".../w/Oak_seedling#Watered"
 *
 * Roughly 8,300 of the ~28,700 items in the dataset are shaped this way, so anything
 * that scrapes the wiki by `wiki_name` silently misses all of them.
 *
 * `wiki_url` is the authoritative source: the page title is the part before the `#`
 * and the version is the part after it. Deriving from the URL rather than
 * regex-stripping `wiki_name` matters, because ~4,300 items have a parenthetical that
 * is genuinely part of the page title ("Longbow (u)", "Holy grail (item)") and must
 * survive intact.
 *
 * See `scripts/WIKI-NAME-NORMALIZATION.md` for the full analysis.
 */

/** An item's wiki fields, as stored on the OSRSBox item document. */
export interface WikiNamedItem {
    name?: string | null;
    wiki_name?: string | null;
    wiki_url?: string | null;
}

/** The real page title plus the infobox version it was anchored to, if any. */
export interface WikiPageIdentity {
    /** A page title that can actually be fetched from the wiki, e.g. "Oak seedling". */
    wikiPageTitle: string | null;
    /** The infobox version label, e.g. "Watered". Null when the page has no variants. */
    wikiVersion: string | null;
}

/**
 * Percent-decodes a URL segment, then converts wiki underscores to spaces.
 *
 * Order matters: decoding first means an encoded underscore is treated the same as a
 * literal one, which is how MediaWiki resolves titles.
 */
function decodeWikiSegment(segment: string): string {
    let decoded: string;

    try {
        decoded = decodeURIComponent(segment);
    } catch {
        // A stray '%' that isn't a valid escape (e.g. "100%_broken") throws; the raw
        // segment is still a better answer than nothing.
        decoded = segment;
    }

    return decoded.replace(/_/g, ' ').trim();
}

/**
 * Strips the wiki's article-path prefix, leaving the raw page title.
 *
 * The title itself may contain slashes ("Dragon legs/skirt ornament kit"), so only the
 * known `/w/` (or `/wiki/`) prefix is removed rather than splitting on every slash.
 */
function stripArticlePath(pagePart: string): string {
    const articlePath = pagePart.match(/\/(?:w|wiki)\/(.+)$/);
    if (articlePath) return articlePath[1];

    // Not a recognised wiki URL — fall back to the segment after the last slash.
    return pagePart.split('/').filter(Boolean).pop() ?? '';
}

/**
 * Derives the fetchable wiki page title and version label for an item.
 * @param item - The item's `name` / `wiki_name` / `wiki_url` fields.
 * @returns The real page title and version label, either of which may be null.
 */
export function deriveWikiPageIdentity(item: WikiNamedItem): WikiPageIdentity {
    const wikiUrl = item.wiki_url?.trim();

    if (wikiUrl) {
        const [pagePart, ...anchorParts] = wikiUrl.split('#');
        const anchor = anchorParts.join('#');

        const titleSegment = stripArticlePath(pagePart);

        if (titleSegment) {
            const wikiPageTitle = decodeWikiSegment(titleSegment);
            const wikiVersion = anchor ? decodeWikiSegment(anchor) || null : null;

            if (wikiPageTitle) return { wikiPageTitle, wikiVersion };
        }
    }

    const fallback = item.wiki_name?.trim() || item.name?.trim();

    return { wikiPageTitle: fallback || null, wikiVersion: null };
}

/**
 * Builds an ordered, deduplicated list of titles to try when scraping the wiki.
 *
 * The derived page title goes first because it is the only one guaranteed to resolve.
 * The in-game name comes next (it is usually a redirect, e.g. "Oak seedling (w)"), and
 * the synthetic `wiki_name` is kept last as a final fallback for the handful of items
 * where it happens to be the real title.
 * @param item - The item's `name` / `wiki_name` / `wiki_url` fields.
 * @returns Candidate page titles, most reliable first.
 */
export function wikiTitleCandidates(item: WikiNamedItem): string[] {
    const { wikiPageTitle } = deriveWikiPageIdentity(item);
    const ordered = [wikiPageTitle, item.name?.trim(), item.wiki_name?.trim()];

    const seen = new Set<string>();
    const candidates: string[] = [];

    for (const candidate of ordered) {
        if (!candidate) continue;
        const key = candidate.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(candidate);
    }

    return candidates;
}
