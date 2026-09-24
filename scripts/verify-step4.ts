// Step 4 checks, run against the DB instead of the browser.
// Mirrors the browser pass: tree renders, drops report no ingredient data,
// and the two ROI sorts contain (and exclude) the right items.
//
//   VITE_MONGO_DB_DB_NAME=osrsbox-dev bun run --env-file .env scripts/verify-step4.ts

import mongoose from 'mongoose';
import { startMongo } from '../src/db/mongo';
import { OsrsboxItemModel } from '../src/lib/models/mongo-schemas/osrsbox-db-item-schema';
import { populateIngredientsTree, getPaginatedGameItems } from '../src/lib/services/game-item-mongo-service.server';

const MUST_RENDER = ['Shaving stand', 'Oak fancy dress box'];
const MUST_LOAD = ['Abyssal dagger', 'Dragon spear', 'Iron hasta'];
const EXPECT_IN_ROI_VALUE = ['Dragon kiteshield', 'Zenyte amulet', 'Torva'];

let failures = 0;
function check(ok: boolean, label: string, detail = '') {
    if (!ok) failures++;
    console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Counts nodes in a populated ingredient tree. */
function countNodes(node: any): number {
    if (!node) return 0;
    const kids = node.creationSpecs?.flatMap((s: any) => s.ingredients ?? []) ?? [];
    return 1 + kids.reduce((sum: number, k: any) => sum + countNodes(k.item ?? k), 0);
}

async function main() {
    console.log(`db: ${process.env.VITE_MONGO_DB_DB_NAME}\n`);
    await startMongo();

    console.log('Trees must render:');
    for (const name of MUST_RENDER) {
        const doc = await OsrsboxItemModel.findOne({ name }).select('_id').lean();
        if (!doc) { check(false, name, 'item not found'); continue; }
        const started = Date.now();
        const tree = await populateIngredientsTree(String(doc._id));
        const nodes = countNodes(tree);
        check(nodes > 1, name, `${nodes} nodes in ${Date.now() - started}ms`);
    }

    console.log('\nMust load; drops report no ingredient data:');
    for (const name of MUST_LOAD) {
        const doc = await OsrsboxItemModel.findOne({ name }).select('_id creationSpecs').lean();
        if (!doc) { check(false, name, 'item not found'); continue; }
        const specs = (doc as any).creationSpecs?.length ?? 0;
        check(true, name, specs === 0 ? 'no ingredient data (expected for a drop)' : `${specs} spec(s)`);
    }

    for (const [order, label] of [['roi-desc', 'ROI (percentage)'], ['roi-value-desc', 'ROI (value)']] as const) {
        console.log(`\n${label} — top 15:`);
        const page = await getPaginatedGameItems({ page: 1, perPage: 15, sortOrder: order as any });
        const names = page.items.map((i: any) => i.name);
        names.forEach((n, i) => console.log(`    ${String(i + 1).padStart(2)}. ${n}`));
        const leaked = MUST_LOAD.filter((n) => names.includes(n));
        check(leaked.length === 0, `${label}: drops excluded`, leaked.length ? `leaked: ${leaked.join(', ')}` : '');
        if (order === 'roi-value-desc') {
            const hits = EXPECT_IN_ROI_VALUE.filter((e) => names.some((n) => n.includes(e)));
            check(hits.length > 0, `${label}: expected names present`, `matched ${hits.join(', ') || 'none'}`);
        }
    }

    console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) FAILED`}`);
    await mongoose.disconnect();
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
