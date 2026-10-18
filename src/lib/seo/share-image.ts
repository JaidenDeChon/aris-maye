/**
 * Bump when the card's design or wording changes. It's part of the image URL, so Discord, X and
 * the CDN, which all keep images by URL, fetch the new card instead of serving the old one.
 */
export const SHARE_CARD_VERSION = 1;

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

/** Where an item's share image is served, by `src/routes/og/items/[id=integer].png`. */
export function itemShareImagePath(id: number | string): string {
    return `/og/items/${id}.png?v=${SHARE_CARD_VERSION}`;
}
