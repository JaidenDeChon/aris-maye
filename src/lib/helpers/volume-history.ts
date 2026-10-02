/**
 * Rolling trade volume for one item, kept by the hourly price job.
 *
 * Each run adds the last hour's trade count and average price, drops anything older than a day,
 * and works out the day's totals from what's left. Relative imports only: the price job's bundler
 * can't resolve `$lib`.
 */
import { MOVERS_PRICE_HOURS, PRICE_CHANGE_MIN_HOURS, VOLUME_HISTORY_HOURS } from '../constants/market';

/** One hour of trading. */
export type VolumeHistoryEntry = {
    /** Start of the hour, in Unix seconds. */
    t: number;
    /** How many traded, buys and sells together. */
    v: number;
    /**
     * The hour's average price, buys and sells weighted by how many of each traded, or null when
     * nothing traded. Weighting keeps a few insta-buys at a silly price from swamping a hundred
     * ordinary sales.
     */
    mid: number | null;
};

/** One item's hour from the wiki's `/1h` endpoint. */
export type HourlyPrice = {
    avgHighPrice: number | null;
    highPriceVolume: number;
    avgLowPrice: number | null;
    lowPriceVolume: number;
};

export type VolumeSummary = {
    volumeHistory: VolumeHistoryEntry[];
    /** Traded in the latest hour. */
    volume1h: number;
    /** Traded across the history kept, up to a day. */
    volume24h: number;
    /**
     * Price change across the day as a ratio (0.05 is +5%): the median price of the last few traded
     * hours against the first few. Null until there's a day of history.
     */
    priceChange24h: number | null;
    /**
     * The median of the day's hourly prices, or null when nothing traded. Steadier than the latest
     * high and low, which a single odd trade sets, so it's what values a day's trading.
     */
    typicalPrice24h: number | null;
    /** How many hours the history spans, counting the latest. */
    historyHours: number;
    /** How many of those hours had any trades. */
    tradedHours: number;
};

function positive(value: number | null | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Turns one wiki hour into a history entry. An item missing from the hour traded nothing. */
export function toVolumeEntry(hour: HourlyPrice | null | undefined, t: number): VolumeHistoryEntry {
    if (!hour) return { t, v: 0, mid: null };
    const v = Math.max(0, hour.highPriceVolume ?? 0) + Math.max(0, hour.lowPriceVolume ?? 0);
    const high = positive(hour.avgHighPrice);
    const low = positive(hour.avgLowPrice);
    const highVolume = high !== null ? Math.max(0, hour.highPriceVolume ?? 0) : 0;
    const lowVolume = low !== null ? Math.max(0, hour.lowPriceVolume ?? 0) : 0;
    let mid: number | null;
    if (highVolume + lowVolume > 0)
        mid = ((high ?? 0) * highVolume + (low ?? 0) * lowVolume) / (highVolume + lowVolume);
    else mid = high !== null && low !== null ? (high + low) / 2 : (high ?? low);
    return { t, v, mid };
}

/**
 * Adds the latest hour to an item's history and works out its totals.
 * @param previous - The history stored so far, in any order.
 * @param latest - The hour just fetched.
 */
export function addVolumeHour(
    previous: VolumeHistoryEntry[] | null | undefined,
    latest: VolumeHistoryEntry,
): VolumeSummary {
    return mergeVolumeHours(previous, [latest]);
}

/**
 * Adds one or more fetched hours to an item's history and works out its totals.
 *
 * The newest fetched hour ends the window. A fetched hour replaces a stored one for the same hour,
 * so a second run in the same hour doesn't count it twice, and a backfilled hour slots into its
 * gap. Anything before the window, or after its end, is dropped.
 * @param previous - The history stored so far, in any order.
 * @param fetched - The hours just fetched, in any order. Must not be empty.
 */
export function mergeVolumeHours(
    previous: VolumeHistoryEntry[] | null | undefined,
    fetched: VolumeHistoryEntry[],
): VolumeSummary {
    const latestT = Math.max(...fetched.map((entry) => entry.t));
    const windowStart = latestT - (VOLUME_HISTORY_HOURS - 1) * 3600;
    const byHour = new Map<number, VolumeHistoryEntry>();
    for (const entry of previous ?? []) byHour.set(entry.t, entry);
    for (const entry of fetched) byHour.set(entry.t, entry);
    const volumeHistory = [...byHour.values()]
        .filter((entry) => entry.t >= windowStart && entry.t <= latestT)
        .sort((a, b) => a.t - b.t);

    const latest = volumeHistory[volumeHistory.length - 1];
    const oldest = volumeHistory[0];
    const historyHours = Math.round((latest.t - oldest.t) / 3600) + 1;
    const volume24h = volumeHistory.reduce((sum, entry) => sum + entry.v, 0);

    const mids = volumeHistory.flatMap((entry) => (entry.mid !== null ? [entry.mid] : []));
    const typicalPrice24h = median(mids);

    // Price change compares the start of the day with the end, by the median of a few traded hours
    // at each, and only once the history spans a day; a few hours of history would make every move
    // look like a day's. The two ends never share an hour.
    let priceChange24h: number | null = null;
    if (historyHours >= PRICE_CHANGE_MIN_HOURS && mids.length >= 2) {
        const each = Math.min(MOVERS_PRICE_HOURS, Math.floor(mids.length / 2));
        const start = median(mids.slice(0, each));
        const end = median(mids.slice(-each));
        if (start && end !== null) priceChange24h = (end - start) / start;
    }

    return {
        volumeHistory,
        volume1h: latest.v,
        volume24h,
        priceChange24h,
        typicalPrice24h,
        historyHours,
        tradedHours: mids.length,
    };
}

function median(values: number[]): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The hours in the day ending at `latestHour` that `present` doesn't have, newest first. These are
 * what the price job backfills, so a new database, a skipped hour or an outage catches up on the
 * next run rather than over a day.
 * @param present - Hours already stored, in Unix seconds.
 * @param latestHour - The newest hour available, in Unix seconds. It's left out, since it's always fetched.
 */
export function missingVolumeHours(present: Iterable<number>, latestHour: number): number[] {
    const have = new Set(present);
    const missing: number[] = [];
    for (let i = 1; i < VOLUME_HISTORY_HOURS; i++) {
        const hour = latestHour - i * 3600;
        if (!have.has(hour)) missing.push(hour);
    }
    return missing;
}
