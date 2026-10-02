/**
 * Tunable numbers behind the homepage's Market pulse. See "Movers floor" in
 * `docs/homepage-plan.md` for why they are what they are and what to look at when changing them.
 *
 * No imports here: the hourly price job reads this file, and its bundler can't resolve `$lib`.
 */

/**
 * Bumped whenever how an hour is recorded changes. A database whose history was recorded under an
 * older version has its whole day fetched again on the next run, so old and new hours never mix.
 */
export const VOLUME_HISTORY_VERSION = 2;

/** How many hours of trade volume each item keeps. A day's worth, so 24h volume and change work. */
export const VOLUME_HISTORY_HOURS = 24;

/**
 * How much history counts as "a day" for price change. One short of the full window, so a single
 * missed hourly run doesn't hide the movers for another day.
 */
export const PRICE_CHANGE_MIN_HOURS = VOLUME_HISTORY_HOURS - 1;

/**
 * How many traded hours at each end of the day price change compares, by their median. A few
 * odd trades can drag one hour's average a long way (a 40 gp potion insta-bought at 90k); a
 * median of three needs two of them to be odd.
 */
export const MOVERS_PRICE_HOURS = 3;

/**
 * ...and it traded in at least this many of the day's hours. An item that only trades now and then
 * has its whole day's change set by a handful of trades.
 */
export const MOVERS_MIN_TRADED_HOURS = 18;

/** An item counts as a mover only if at least this much gp of it trades per day. */
export const MOVERS_MIN_GP_PER_DAY = 10_000_000;

/** ...and it trades at least this many times per day, so one sale of something expensive doesn't count. */
export const MOVERS_MIN_TRADES_PER_DAY = 10;
