import { describe, expect, it } from 'bun:test';
import { addVolumeHour, toVolumeEntry, type VolumeHistoryEntry } from './volume-history';

const HOUR = 3600;

function hours(count: number, start = 1_000_000, v = 10, mid: number | null = 100): VolumeHistoryEntry[] {
    return Array.from({ length: count }, (_, i) => ({ t: start + i * HOUR, v, mid }));
}

describe('toVolumeEntry', () => {
    it('adds buys and sells and averages the two prices', () => {
        expect(toVolumeEntry({ avgHighPrice: 110, highPriceVolume: 3, avgLowPrice: 90, lowPriceVolume: 5 }, 7)).toEqual(
            {
                t: 7,
                v: 8,
                mid: 100,
            },
        );
    });

    it('uses whichever price exists when only one side traded', () => {
        expect(
            toVolumeEntry({ avgHighPrice: 110, highPriceVolume: 3, avgLowPrice: null, lowPriceVolume: 0 }, 7).mid,
        ).toBe(110);
    });

    it('records an hour with no trades for an item missing from the data', () => {
        expect(toVolumeEntry(undefined, 7)).toEqual({ t: 7, v: 0, mid: null });
    });
});

describe('addVolumeHour', () => {
    it('starts a history from nothing', () => {
        const summary = addVolumeHour(null, { t: 1_000_000, v: 12, mid: 50 });
        expect(summary.volume1h).toBe(12);
        expect(summary.volume24h).toBe(12);
        expect(summary.historyHours).toBe(1);
        expect(summary.priceChange24h).toBeNull();
    });

    it('keeps a day and drops older hours', () => {
        const previous = hours(30);
        const latest = { t: 1_000_000 + 30 * HOUR, v: 10, mid: 100 };
        const summary = addVolumeHour(previous, latest);
        expect(summary.volumeHistory).toHaveLength(24);
        expect(summary.volumeHistory.at(-1)).toEqual(latest);
        expect(summary.volume24h).toBe(240);
        expect(summary.historyHours).toBe(24);
    });

    it('replaces the hour on a second run instead of counting it twice', () => {
        const previous = hours(3);
        const summary = addVolumeHour(previous, { t: previous[2].t, v: 99, mid: 100 });
        expect(summary.volumeHistory).toHaveLength(3);
        expect(summary.volume24h).toBe(10 + 10 + 99);
    });

    it('reports price change once the history spans a day', () => {
        const previous = hours(23, 1_000_000, 10, 100);
        const summary = addVolumeHour(previous, { t: 1_000_000 + 23 * HOUR, v: 10, mid: 110 });
        expect(summary.priceChange24h).toBeCloseTo(0.1);
    });

    it('holds back price change with less than a day of history', () => {
        const previous = hours(5, 1_000_000, 10, 100);
        const summary = addVolumeHour(previous, { t: 1_000_000 + 5 * HOUR, v: 10, mid: 200 });
        expect(summary.priceChange24h).toBeNull();
        expect(summary.historyHours).toBe(6);
    });

    it('skips hours with no trades when comparing prices', () => {
        const previous = [...hours(1, 1_000_000, 0, null), ...hours(22, 1_000_000 + HOUR, 10, 100)];
        const summary = addVolumeHour(previous, { t: 1_000_000 + 23 * HOUR, v: 0, mid: null });
        expect(summary.priceChange24h).toBe(0);
    });
});
