/**
 * Read-only checks for the guide pages' data, against whichever database `.env` points at. It
 * builds each guide's snapshot in memory (nothing is written) and checks the numbers hold up.
 *
 *   bun run verify-guides
 *   VITE_MONGO_DB_DB_NAME=osrsbox-prod bun run verify-guides
 */
import mongoose from 'mongoose';
import { startMongo } from '../src/db/mongo';

// Mongoose builds a model's indexes as soon as it's compiled and connected. Switch that off before
// the model is imported (hence the dynamic imports), so this script never writes.
mongoose.set('autoIndex', false);
const { computeCheapestXp, computeHighAlch, computeIronmanGuide, computeMarketReport } =
    await import('../src/lib/services/guide-service.server');
const { getGameItemById } = await import('../src/lib/services/game-item-mongo-service.server');
const { XP_GUIDE_SKILLS, XP_LEVEL_BANDS } = await import('../src/lib/constants/guides');
const { PRICE_CHANGE_MIN_HOURS } = await import('../src/lib/constants/market');
const { compareXpMethods } = await import('../src/lib/helpers/guides');

/** A build slower than this might not fit in a function's time limit on Netlify. */
const SLOW_BUILD_MS = 8_000;

const failures: string[] = [];
const warnings: string[] = [];
function check(ok: boolean, message: string) {
    if (!ok) failures.push(message);
}

async function timed<T>(label: string, build: () => Promise<T>): Promise<T> {
    const started = performance.now();
    const result = await build();
    const ms = Math.round(performance.now() - started);
    console.log(`${label}: built in ${ms} ms`);
    if (ms > SLOW_BUILD_MS) warnings.push(`${label} took ${ms} ms to build (over ${SLOW_BUILD_MS} ms).`);
    return result;
}

await startMongo();
console.log(`Database: ${mongoose.connection.name}\n`);

// Cheapest XP.
const xp = await timed('Cheapest XP', computeCheapestXp);
const header = ['Skill'.padEnd(14), ...XP_LEVEL_BANDS.map((b) => `${b.min}-${b.max}`.padStart(6))].join('');
console.log(header);
for (const { slug } of XP_GUIDE_SKILLS) {
    const entry = xp.skills.find((s) => s.skill === slug);
    const counts = entry?.bands.map((band) => band.rows.length) ?? [];
    console.log([slug.padEnd(14), ...counts.map((n) => String(n).padStart(6))].join(''));
    const total = counts.reduce((a, b) => a + b, 0);
    const filled = counts.filter((n) => n > 0).length;
    check(total >= 10, `Cheapest XP: ${slug} has only ${total} rows.`);
    check(filled >= 3, `Cheapest XP: ${slug} has rows in only ${filled} level bands.`);

    for (const band of entry?.bands ?? []) {
        band.rows.forEach((row, i) => {
            const expected = Math.max(0, -(row.item.creationProfit ?? NaN)) / row.xp;
            check(
                Math.abs(row.gpPerXp - expected) < 1e-9,
                `Cheapest XP: ${row.item.name} (${slug}) has ${row.gpPerXp} gp/xp, expected ${expected}.`,
            );
            check(
                row.level >= band.min && (row.level <= band.max || band.max === 99),
                `Cheapest XP: ${row.item.name} (level ${row.level}) is in the ${band.min}-${band.max} band.`,
            );
            const previous = band.rows[i - 1];
            if (previous) {
                check(
                    compareXpMethods(previous, row) <= 0,
                    `Cheapest XP: ${slug} ${band.min}-${band.max} isn't sorted.`,
                );
            }
        });
    }
}

// High alch.
console.log('');
const alch = await timed('High alch', computeHighAlch);
console.log(`High alch: ${alch.picks.length} picks, nature rune ${alch.natureRunePrice} gp`);
check(alch.picks.length >= 10, `High alch: only ${alch.picks.length} picks.`);
for (const pick of alch.picks) {
    check(
        pick.profit === pick.highalch - pick.buyPrice - alch.natureRunePrice,
        `High alch: ${pick.item.name} profit ${pick.profit} doesn't add up.`,
    );
}

// Market report.
const market = await timed('Market report', computeMarketReport);
console.log(
    `Market: ${market.historyHours}h of history, ${market.risers.length} risers, ${market.fallers.length} fallers, ` +
        `${market.summary.rising} rising / ${market.summary.falling} falling, ` +
        `${Math.round(market.summary.gpTraded24h / 1e9)}B gp traded`,
);
check(market.historyHours >= PRICE_CHANGE_MIN_HOURS, `Market: only ${market.historyHours} hours of history.`);
check(market.risers.length >= 10, `Market: only ${market.risers.length} risers.`);
check(market.fallers.length >= 10, `Market: only ${market.fallers.length} fallers.`);
check(market.mostTradedByGp.length >= 10, `Market: only ${market.mostTradedByGp.length} most traded by GP.`);
check(
    market.summary.rising >= market.risers.length && market.summary.falling >= market.fallers.length,
    'Market: the summary counts fewer movers than the tables show.',
);

// Ironman.
const ironman = await timed('Ironman', computeIronmanGuide);
console.log(
    `Ironman: ${ironman.shopSales.length} shop sales, ${ironman.shopSupplied.length} from shop stock, ` +
        `${ironman.craftToAlch.length} craft to alch, ${ironman.cheapXp.length} cheap XP skills`,
);
check(
    ironman.shopSales.length + ironman.shopSupplied.length + ironman.craftToAlch.length > 0,
    'Ironman: every list is empty.',
);

// Spot checks against the item pages' own figures, for a by-hand comparison.
console.log('\nSpot checks (guide vs item page):');
const herblore = xp.skills.find((s) => s.skill === 'herblore')?.bands.flatMap((b) => b.rows)[0];
const topAlch = alch.picks[0];
if (herblore) {
    const page = (await getGameItemById(String(herblore.item.id))) as { name?: string } | null;
    console.log(
        `  Herblore cheapest: ${page?.name} (/items/${herblore.item.id}) cost ${herblore.item.creationCost} gp, ` +
            `profit ${herblore.item.creationProfit} gp. Compare with the item page's profit breakdown.`,
    );
}
if (topAlch) {
    const page = (await getGameItemById(String(topAlch.item.id))) as { name?: string; highPrice?: number } | null;
    check(page?.highPrice === topAlch.buyPrice, `High alch: ${page?.name}'s buy price differs from its item page.`);
    console.log(`  Top high alch: ${page?.name} buy ${topAlch.buyPrice} gp, item page ${page?.highPrice} gp`);
}

await mongoose.disconnect();

for (const warning of warnings) console.warn(`WARN ${warning}`);
if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log('\nAll guide data checks passed.');
