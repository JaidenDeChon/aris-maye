import { PRICE_CHANGE_MIN_HOURS } from '$lib/constants/market';
import { formatChange } from '$lib/helpers/homepage';
import type { MarketReport } from '$lib/models/guides';
import type { ShareCard, ShareCardSegment } from './share-card';

/** The report's day, as the card and its alt text show it: "17 Oct 2026", in UTC. */
export function marketReportDate(computedAt: number): string {
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(computedAt);
}

/**
 * The market report's share image text, laid out by the same `shareCardLayout` as the item cards.
 * Null when there's nothing to put on it (too little history, or no movers), so the page falls
 * back to the default image.
 */
export function buildMarketShareCard(report: MarketReport): ShareCard | null {
    if (report.historyHours < PRICE_CHANGE_MIN_HOURS) return null;
    const [riser] = report.risers;
    const [faller] = report.fallers;
    if (!riser && !faller) return null;

    const date = marketReportDate(report.computedAt);
    const sentence: ShareCardSegment[] = [];
    if (riser) {
        sentence.push(
            { text: 'Biggest riser: ' },
            { text: `${riser.name} ${formatChange(riser.priceChange24h)}`, strong: true },
        );
    }
    if (faller) {
        sentence.push(
            { text: riser ? '. Biggest faller: ' : 'Biggest faller: ' },
            { text: `${faller.name} ${formatChange(faller.priceChange24h)}`, strong: true },
        );
    }
    sentence.push({ text: '. Live GE prices, updated hourly.' });

    return {
        name: 'GE Market Report',
        sentence,
        chips: [
            date,
            `${report.summary.rising.toLocaleString('en-US')} rising`,
            `${report.summary.falling.toLocaleString('en-US')} falling`,
        ],
        alt: `OSRS Grand Exchange market report for ${date}: biggest risers and fallers on Aris Maye.`,
    };
}
