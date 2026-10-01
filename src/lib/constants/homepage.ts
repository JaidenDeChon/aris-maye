/**
 * Tunable numbers behind the homepage sections. See `docs/homepage-plan.md`.
 */

/** How many items each homepage list shows. */
export const HOMEPAGE_LIST_SIZE = 6;

/**
 * The smallest profit an item needs before it can rank on ROI.
 *
 * Without it the ROI list fills with items that cost 2 gp to make and sell for 5: a 150% return
 * that isn't worth anyone's time.
 */
export const HOMEPAGE_MIN_ROI_PROFIT = 100;

/** How long a cached homepage snapshot is served before it is rebuilt. Prices update hourly. */
export const HOMEPAGE_SNAPSHOT_MAX_AGE_MS = 65 * 60 * 1000;

/**
 * How stale a GE price can be and still count for alch picks, in seconds.
 *
 * A price from a week ago can make an item look like free money to alch when nobody is selling it
 * at that price any more.
 */
export const HOMEPAGE_ALCH_MAX_PRICE_AGE_S = 24 * 60 * 60;

/** How many levels ahead "Almost unlocked" looks. */
export const HOMEPAGE_ALMOST_UNLOCKED_LEVELS = 5;
