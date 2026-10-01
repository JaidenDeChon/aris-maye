/**
 * Rolling trade volume for one item, kept by the hourly price job.
 *
 * Each run adds the last hour's trade count and average price, drops anything older than a day,
 * and works out the day's totals from what's left. Relative imports only: the price job's bundler
 * can't resolve `$lib`.
 */
import { PRICE_CHANGE_MIN_HOURS, VOLUME_HISTORY_HOURS } from '../constants/market';

/** One hour of trading. */
export type VolumeHistoryEntry = {
    /** Start of the hour, in Unix seconds. */
    t: number;
    /** How many traded, buys and sells together. */
    v: number;
    /** The average of the hour's average buy and sell prices, or null when nothing traded. */
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
    /** Price change across the day as a ratio (0.05 is +5%), or null until there's a day of history. */
    priceChange24h: number | null;
    /** How many hours the history spans, counting the latest. */
    historyHours: number;
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
    const mid = high !== null && low !== null ? (high + low) / 2 : (high ?? low);
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
    const windowStart = latest.t - (VOLUME_HISTORY_HOURS - 1) * 3600;
    // A second run in the same hour replaces that hour rather than counting it twice.
    const kept = (previous ?? []).filter((entry) => entry.t >= windowStart && entry.t < latest.t);
    const volumeHistory = [...kept, latest].sort((a, b) => a.t - b.t).slice(-VOLUME_HISTORY_HOURS);

    const oldest = volumeHistory[0];
    const historyHours = Math.round((latest.t - oldest.t) / 3600) + 1;
    const volume24h = volumeHistory.reduce((sum, entry) => sum + entry.v, 0);

    // Price change compares the latest hour that traded with the earliest one, and only once the
    // history spans a day; a few hours of history would make every move look like a day's.
    let priceChange24h: number | null = null;
    if (historyHours >= PRICE_CHANGE_MIN_HOURS) {
        const first = volumeHistory.find((entry) => entry.mid !== null);
        const last = [...volumeHistory].reverse().find((entry) => entry.mid !== null);
        if (first && last && first !== last && first.mid) priceChange24h = (last.mid! - first.mid) / first.mid;
    }

    return { volumeHistory, volume1h: latest.v, volume24h, priceChange24h, historyHours };
}
