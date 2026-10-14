/**
 * Read-only checks for the "Used in" index and the sitemap's item set, against whichever
 * database `.env` points at. Pass `--create-index` to build the index if it's missing. The app
 * would build it on its next connect anyway; this just lets you do it on purpose.
 *
 *   bun run --env-file .env scripts/verify-used-in-index.ts [--create-index]
 */
import mongoose from 'mongoose';
import { startMongo } from '../src/db/mongo';

// Mongoose builds a model's indexes as soon as it's compiled and connected. Switch that off before
// the model is imported (hence the dynamic imports), so this script only writes when asked to.
mongoose.set('autoIndex', false);
const { OsrsboxItemModel } = await import('../src/lib/models/mongo-schemas/osrsbox-db-item-schema');
const { INDEXABLE_ITEM_FILTER, getIndexableItemIds, getRecipesUsingItem } =
    await import('../src/lib/services/game-item-mongo-service.server');

const INDEX_NAME = 'creationSpecs.ingredients.item_1';
const failures: string[] = [];

await startMongo();
console.log(`Database: ${mongoose.connection.name}`);

const indexes = await OsrsboxItemModel.collection.indexes();
let hasIndex = indexes.some((index) => index.name === INDEX_NAME);
if (!hasIndex && process.argv.includes('--create-index')) {
    await OsrsboxItemModel.collection.createIndex({ 'creationSpecs.ingredients.item': 1 });
    hasIndex = true;
    console.log(`Created ${INDEX_NAME}.`);
}
console.log(`Index ${INDEX_NAME}: ${hasIndex ? 'present' : 'MISSING'}`);
if (!hasIndex) failures.push(`${INDEX_NAME} is missing (re-run with --create-index).`);

for (const name of ['Iron ore', 'Logs', 'Nature rune']) {
    const item = await OsrsboxItemModel.findOne({ name, ...INDEXABLE_ITEM_FILTER })
        .select({ _id: 1, id: 1 })
        .lean();
    if (!item) {
        failures.push(`Could not find "${name}".`);
        continue;
    }
    const plan = await OsrsboxItemModel.find({ 'creationSpecs.ingredients.item': item._id }).explain('queryPlanner');
    const usesIndex = JSON.stringify(plan).includes('IXSCAN');
    const usedIn = await getRecipesUsingItem(item._id);
    const first = usedIn.items
        .slice(0, 5)
        .map((r) => `${r.name} (${r.skill ?? '?'} ${r.level ?? '?'})`)
        .join(', ');
    console.log(`${name} (#${item.id}): used in ${usedIn.total}, plan ${usesIndex ? 'IXSCAN' : 'COLLSCAN'}; ${first}`);
    if (!usesIndex) failures.push(`"${name}" lookup does not use the index.`);
    if (usedIn.total === 0) failures.push(`"${name}" is used in nothing, which is not plausible.`);
    const names = usedIn.items.map((r) => r.name);
    if (new Set(names).size !== names.length) failures.push(`"${name}" lists a recipe twice (a copy slipped in).`);
}

const indexable = await getIndexableItemIds();
console.log(`Indexable item pages (sitemap): ${indexable.length}`);
if (indexable.length === 0) failures.push('No indexable items.');

// Noted, placeholder and duplicate copies must never reach the sitemap.
const copies = await OsrsboxItemModel.countDocuments({
    id: { $in: indexable },
    $or: [{ noted: true }, { placeholder: true }, { duplicate: true }],
});
console.log(`Copies among indexable items: ${copies}`);
if (copies > 0) failures.push(`${copies} noted/placeholder/duplicate copies are in the sitemap set.`);

// A few pages that should be noindex, for the full-site audit: plain items and copies.
const ingredientRefs = await OsrsboxItemModel.distinct('creationSpecs.ingredients.item');
const plain = await OsrsboxItemModel.find({
    'creationSpecs.0': { $exists: false },
    _id: { $nin: ingredientRefs },
    ...INDEXABLE_ITEM_FILTER,
})
    .select({ _id: 0, id: 1 })
    .limit(7)
    .lean<{ id: number }[]>();
const copySample = await OsrsboxItemModel.find({ 'creationSpecs.0': { $exists: true }, noted: true })
    .select({ _id: 0, id: 1 })
    .limit(3)
    .lean<{ id: number }[]>();
console.log(`--noindex-ids=${[...plain, ...copySample].map((p) => p.id).join(',')}`);

await mongoose.disconnect();

if (failures.length) {
    console.error(`\nFAIL\n- ${failures.join('\n- ')}`);
    process.exit(1);
}
console.log('\nPASS');
