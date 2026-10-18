/**
 * The calculator pages under `/calculators`. See `docs/superpowers/specs/2026-10-17-calculators-design.md`.
 */

/**
 * Bump whenever the calculator snapshot's shape changes. Deploy previews share `osrsbox-dev`, so
 * each version reads and writes its own document.
 */
export const CALCULATOR_SNAPSHOT_VERSION = 1;

/** Bump to make browsers and the CDN fetch every item icon again. */
export const ITEM_ICON_VERSION = 1;

export function itemIconPath(id: number): string {
    return `/icons/items/${id}.png?v=${ITEM_ICON_VERSION}`;
}
