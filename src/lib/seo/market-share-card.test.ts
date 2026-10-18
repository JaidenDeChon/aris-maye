import { describe, expect, it } from 'bun:test';
import type { MarketItem, MarketReport } from '$lib/models/guides';
import { buildMarketShareCard, marketReportDate } from './market-share-card';
import type { ShareCard } from './share-card';

const COMPUTED_AT = Date.UTC(2026, 9, 17, 23, 30);

function mover(name: string, priceChange24h: number): MarketItem {
    return {
        id: 1,
        name,
        icon: '',
        highPrice: null,
        lowPrice: null,
        buyLimit: null,
        creationCost: null,
        creationProfit: null,
        creationRoi: null,
        ironmanExitValue: null,
        craftsPerLimit: null,
        gpPerLimit: null,
        volume1h: null,
        volume24h: null,
        priceChange24h,
        typicalPrice24h: null,
        gpTraded24h: null,
    };
}

function report(overrides: Partial<MarketReport> = {}): MarketReport {
    return {
        computedAt: COMPUTED_AT,
        historyHours: 24,
        summary: { gpTraded24h: 1, rising: 1200, falling: 749, medianChange: 0 },
        risers: [mover('Dragon bones', 0.124)],
        fallers: [mover('Zulrah scales', -0.081)],
        mostTradedByGp: [],
        mostTradedByCount: [],
        ...overrides,
    };
}

/** The sentence as it reads, with the gold runs in [brackets]. */
function read(card: ShareCard | null): string {
    return card!.sentence.map((s) => (s.strong ? `[${s.text}]` : s.text)).join('');
}

describe('buildMarketShareCard', () => {
    it('names the biggest riser and faller', () => {
        const card = buildMarketShareCard(report());
        expect(card?.name).toBe('GE Market Report');
        expect(read(card)).toBe(
            'Biggest riser: [Dragon bones +12%]. Biggest faller: [Zulrah scales -8.1%]. Live GE prices, updated hourly.',
        );
        expect(card?.chips).toEqual(['17 Oct 2026', '1,200 rising', '749 falling']);
        expect(card?.alt).toBe(
            'OSRS Grand Exchange market report for 17 Oct 2026: biggest risers and fallers on Aris Maye.',
        );
    });

    it('leaves out a missing side', () => {
        expect(read(buildMarketShareCard(report({ fallers: [] })))).toBe(
            'Biggest riser: [Dragon bones +12%]. Live GE prices, updated hourly.',
        );
        expect(read(buildMarketShareCard(report({ risers: [] })))).toBe(
            'Biggest faller: [Zulrah scales -8.1%]. Live GE prices, updated hourly.',
        );
    });

    it('keeps a long name whole', () => {
        const name = "Tumeken's shadow (uncharged) ornament kit";
        expect(read(buildMarketShareCard(report({ risers: [mover(name, 0.05)] })))).toContain(`[${name} +5.0%]`);
    });

    it('has no card without movers or with too little history', () => {
        expect(buildMarketShareCard(report({ risers: [], fallers: [] }))).toBeNull();
        expect(buildMarketShareCard(report({ historyHours: 5 }))).toBeNull();
    });

    it('dates the report in UTC', () => {
        expect(marketReportDate(Date.UTC(2026, 0, 1, 0, 5))).toBe('1 Jan 2026');
    });
});
