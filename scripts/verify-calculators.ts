/**
 * Read-only checks for the calculators' data, against whichever database `.env` points at. It
 * builds the calculator snapshot and the cheapest XP guide in memory (nothing is written) and
 * checks the numbers hold up and the two agree.
 *
 *   bun run verify-calculators
 *   VITE_MONGO_DB_DB_NAME=osrsbox-prod bun run verify-calculators
 */
import mongoose from 'mongoose';
import { startMongo } from '../src/db/mongo';

// Mongoose builds a model's indexes as soon as it's compiled and connected. Switch that off before
// the model is imported (hence the dynamic imports), so this script never writes.
mongoose.set('autoIndex', false);
const { computeCalculatorMethods, computeCheapestXp } = await import('../src/lib/services/guide-service.server');
const { XP_GUIDE_SKILLS } = await import('../src/lib/constants/guides');
const { compareCalculatorMethods } = await import('../src/lib/helpers/guides');

/** A build slower than this might not fit in a function's time limit on Netlify. */
const SLOW_BUILD_MS = 8_000;

const failures: string[] = [];
function check(ok: boolean, message: string) {
    if (!ok) failures.push(message);
}

await startMongo();
console.log(`Database: ${mongoose.connection.name}\n`);

const started = performance.now();
const snapshot = await computeCalculatorMethods();
const buildMs = Math.round(performance.now() - started);
const guide = await computeCheapestXp();

console.log('Skill'.padEnd(14) + 'Methods'.padStart(8));
for (const { slug } of XP_GUIDE_SKILLS) {
    const methods = snapshot.skills[slug] ?? [];
    console.log(slug.padEnd(14) + String(methods.length).padStart(8));
    check(methods.length >= 10, `${slug} has only ${methods.length} methods.`);

    methods.forEach((method, i) => {
        check(method.xp > 0, `${method.name} (${slug}) gives ${method.xp} XP.`);
        check(
            Number.isInteger(method.level) && method.level >= 1 && method.level <= 99,
            `${method.name} (${slug}) needs level ${method.level}.`,
        );
        const expected = Math.max(0, method.netCost) / method.xp;
        check(
            Math.abs(method.gpPerXp - expected) < 1e-9,
            `${method.name} (${slug}) has ${method.gpPerXp} gp/xp, expected ${expected}.`,
        );
        const previous = methods[i - 1];
        if (previous) check(compareCalculatorMethods(previous, method) <= 0, `${slug} isn't sorted.`);
    });

    // Every guide row has to match its calculator row, so the two pages never disagree.
    const byKey = new Map(methods.map((method) => [`${method.id}:${method.xp}`, method]));
    const guideRows = guide.skills.find((entry) => entry.skill === slug)?.bands.flatMap((band) => band.rows) ?? [];
    for (const row of guideRows) {
        const match = byKey.get(`${row.item.id}:${row.xp}`);
        check(
            Boolean(match) &&
                match?.level === row.level &&
                Math.abs((match?.gpPerXp ?? NaN) - row.gpPerXp) < 1e-9 &&
                Math.abs((match?.netCost ?? NaN) + (row.item.creationProfit ?? 0)) < 1e-9,
            `${row.item.name} (${slug}) differs between the guide and the calculator.`,
        );
    }
}

const bytes = JSON.stringify(snapshot).length;
console.log(`\nBuilt in ${buildMs} ms, ${Math.round(bytes / 1024)} KB stored.`);
if (buildMs > SLOW_BUILD_MS) console.warn(`WARN the build took over ${SLOW_BUILD_MS} ms.`);

await mongoose.disconnect();

if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const failure of failures.slice(0, 50)) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log('\nAll calculator data checks passed.');
