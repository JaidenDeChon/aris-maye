import { describe, expect, it } from 'bun:test';
import {
    addVolumeHour,
    mergeVolumeHours,
    missingVolumeHours,
    toVolumeEntry,
    type VolumeHistoryEntry,
} from './volume-history';

const HOUR = 3600;

function hours(count: number, start = 1_000_000, v = 10, mid: number | null = 100): VolumeHistoryEntry[] {
    return Array.from({ length: count }, (_, i) => ({ t: start + i * HOUR, v, mid }));
}

describe('toVolumeEntry', () => {
    it('adds buys and sells and weights the two prices by how many traded', () => {
        expect(toVolumeEntry({ avgHighPrice: 110, highPriceVolume: 3, avgLowPrice: 90, lowPriceVolume: 1 }, 7)).toEqual(
            {
                t: 7,
                v: 4,
                mid: 105,
            },
        );
    });

    it("doesn't let a few insta-buys at a silly price swamp ordinary sales", () => {
        const entry = toVolumeEntry(
            { avgHighPrice: 10_000, highPriceVolume: 2, avgLowPrice: 350, lowPriceVolume: 198 },
            7,
        );
        expect(entry.mid).toBeCloseTo(446.5);
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
        const previous = [...hours(21, 1_000_000, 10, 100), ...hours(2, 1_000_000 + 21 * HOUR, 10, 110)];
        const summary = addVolumeHour(previous, { t: 1_000_000 + 23 * HOUR, v: 10, mid: 110 });
        expect(summary.priceChange24h).toBeCloseTo(0.1);
    });

    it("doesn't let one odd hour at either end set the price change", () => {
        // A 40 gp potion, with one hour of insta-buys at 90k at the end and a 1 gp dump at the start.
        const previous = [{ t: 1_000_000, v: 2, mid: 1 }, ...hours(22, 1_000_000 + HOUR, 10, 40)];
        const summary = addVolumeHour(previous, { t: 1_000_000 + 23 * HOUR, v: 1000, mid: 67_509 });
        expect(summary.priceChange24h).toBe(0);
        expect(summary.typicalPrice24h).toBe(40);
    });

    it('takes the median of the hours that traded as the typical price', () => {
        const previous = [
            { t: 1_000_000, v: 0, mid: null },
            { t: 1_000_000 + HOUR, v: 3, mid: 10 },
        ];
        const summary = addVolumeHour(previous, { t: 1_000_000 + 2 * HOUR, v: 3, mid: 30 });
        expect(summary.typicalPrice24h).toBe(20);
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

describe('mergeVolumeHours', () => {
    it('builds a full day from backfilled hours in one go', () => {
        const fetched = hours(24).reverse();
        const summary = mergeVolumeHours(null, fetched);
        expect(summary.volumeHistory).toHaveLength(24);
        expect(summary.volumeHistory[0].t).toBe(1_000_000);
        expect(summary.historyHours).toBe(24);
        expect(summary.volume1h).toBe(10);
        expect(summary.priceChange24h).toBe(0);
    });

    it('slots a backfilled hour into its gap', () => {
        const previous = hours(5).filter((_, i) => i !== 2);
        const gap = { t: 1_000_000 + 2 * HOUR, v: 7, mid: 100 };
        const latest = { t: 1_000_000 + 5 * HOUR, v: 3, mid: 100 };
        const summary = mergeVolumeHours(previous, [latest, gap]);
        expect(summary.volumeHistory.map((entry) => entry.t)).toEqual(hours(6).map((entry) => entry.t));
        expect(summary.volume1h).toBe(3);
        expect(summary.volume24h).toBe(10 * 4 + 7 + 3);
    });

    it('lets a fetched hour replace the stored one', () => {
        const previous = hours(3);
        const summary = mergeVolumeHours(previous, [
            { t: previous[1].t, v: 50, mid: 100 },
            { t: previous[2].t, v: 1, mid: 100 },
        ]);
        expect(summary.volume24h).toBe(10 + 50 + 1);
    });
});

describe('missingVolumeHours', () => {
    it('asks for the whole day when nothing is stored', () => {
        const missing = missingVolumeHours([], 1_000_000 + 23 * HOUR);
        expect(missing).toHaveLength(23);
        expect(missing[0]).toBe(1_000_000 + 22 * HOUR);
        expect(missing.at(-1)).toBe(1_000_000);
    });

    it('asks only for the gaps', () => {
        const present = hours(24)
            .map((entry) => entry.t)
            .filter((t) => t !== 1_000_000 + 5 * HOUR);
        expect(missingVolumeHours(present, 1_000_000 + 23 * HOUR)).toEqual([1_000_000 + 5 * HOUR]);
    });

    it('asks for the hours since the last run after an outage', () => {
        // A day of history that stopped 3 hours ago.
        const present = hours(24, 1_000_000 - 10 * HOUR).map((entry) => entry.t);
        const missing = missingVolumeHours(present, 1_000_000 + 16 * HOUR);
        expect(missing).toEqual([1_000_000 + 15 * HOUR, 1_000_000 + 14 * HOUR]);
    });
});
