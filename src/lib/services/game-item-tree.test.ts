/**
 * Integration coverage for the ingredient tree builder.
 *
 * Runs against a real MongoDB so the level-by-level fetch and the clone walk are both
 * exercised. Set TEST_MONGO_URI to point at a throwaway instance:
 *
 *   docker run -d --rm -p 27018:27017 mongo:7
 *   TEST_MONGO_URI=mongodb://127.0.0.1:27018 bun test
 *
 * Skipped automatically when no such instance is reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import mongoose from 'mongoose';
import { MAX_ITEM_TREE_NODES } from '$lib/constants/item-tree';

const TEST_MONGO_URI = process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27018';

/** Probes for a usable Mongo before declaring the suite. */
async function mongoReachable(): Promise<boolean> {
    try {
        await mongoose.connect(TEST_MONGO_URI, { dbName: 'aris-maye-tree-test', serverSelectionTimeoutMS: 1500 });
        return true;
    } catch {
        return false;
    }
}

const reachable = await mongoReachable();
const describeIfMongo = reachable ? describe : describe.skip;

if (!reachable) {
    console.warn(`[item-tree] Skipping: no MongoDB at ${TEST_MONGO_URI}`);
}

describeIfMongo('populateIngredientsTree', () => {
    let OsrsboxItemModel: typeof import('$lib/models/mongo-schemas/osrsbox-db-item-schema').OsrsboxItemModel;
    let populateIngredientsTree: typeof import('./game-item-mongo-service.server').populateIngredientsTree;

    const baseItem = {
        last_updated: '2026-01-01',
        incomplete: false,
        members: true,
        tradeable: true,
        tradeable_on_ge: true,
        stackable: false,
        stacked: null,
        noted: false,
        noteable: true,
        linked_id_item: null,
        linked_id_noted: null,
        linked_id_placeholder: null,
        placeholder: false,
        equipable: false,
        equipable_by_player: false,
        equipable_weapon: false,
        quest_item: false,
        duplicate: false,
        cost: 1,
        icon: 'x',
    };

    // Plank and Sawmill voucher list each other, the loop that made the live tree builder
    // multiply instead of terminate.
    const plankId = new mongoose.Types.ObjectId();
    const voucherId = new mongoose.Types.ObjectId();
    const standId = new mongoose.Types.ObjectId();
    const logId = new mongoose.Types.ObjectId();

    const spec = (ingredientIds: mongoose.Types.ObjectId[]) => ({
        experienceGranted: [],
        requiredSkills: [],
        ingredients: ingredientIds.map((item) => ({ item, amount: 1, consumedDuringCreation: true })),
    });

    beforeAll(async () => {
        ({ OsrsboxItemModel } = await import('$lib/models/mongo-schemas/osrsbox-db-item-schema'));
        ({ populateIngredientsTree } = await import('./game-item-mongo-service.server'));

        await OsrsboxItemModel.deleteMany({});
        await OsrsboxItemModel.insertMany([
            { ...baseItem, _id: logId, id: 1511, name: 'Logs' },
            { ...baseItem, _id: plankId, id: 960, name: 'Plank', creationSpecs: [spec([logId, voucherId])] },
            { ...baseItem, _id: voucherId, id: 13357, name: 'Sawmill voucher', creationSpecs: [spec([plankId])] },
            { ...baseItem, _id: standId, id: 8596, name: 'Shaving stand', creationSpecs: [spec([plankId])] },
        ]);
    });

    afterAll(async () => {
        await OsrsboxItemModel.deleteMany({});
        await mongoose.disconnect();
    });

    /** Counts nodes the walk actually materialized, and the ids it left for the client. */
    function summarize(root: unknown) {
        let materialized = 0;
        let references = 0;
        let badReferences = 0;

        const walk = (item: Record<string, unknown>) => {
            materialized += 1;
            const specs = (item?.creationSpecs ?? []) as { ingredients?: { item?: unknown }[] }[];
            for (const entry of specs) {
                for (const ingredient of entry.ingredients ?? []) {
                    const value = ingredient?.item;
                    if (!value) continue;
                    if (typeof value === 'object' && (value as { name?: string }).name) {
                        walk(value as Record<string, unknown>);
                        continue;
                    }
                    references += 1;
                    // A hex id the client can fetch. An ObjectId that lost its prototype to
                    // structuredClone serializes as {"buffer":{"0":105,...}} instead.
                    if (typeof value !== 'string' || !/^[0-9a-f]{24}$/.test(value)) badReferences += 1;
                }
            }
        };

        walk(root as Record<string, unknown>);
        return { materialized, references, badReferences };
    }

    it('terminates on a cyclic recipe instead of multiplying', async () => {
        const tree = await populateIngredientsTree('8596');

        expect(tree).not.toBeNull();
        const { materialized } = summarize(tree);
        // Shaving stand -> Plank -> {Logs, Sawmill voucher} -> Plank(leaf). Before the
        // ancestor guard this ran to hundreds of thousands of nodes and never returned.
        expect(materialized).toBeLessThanOrEqual(MAX_ITEM_TREE_NODES + 1);
        expect(materialized).toBeGreaterThan(1);
    });

    it('leaves an unexpanded ingredient as a readable id', async () => {
        const tree = await populateIngredientsTree('8596');

        const { references, badReferences } = summarize(tree);
        expect(references).toBeGreaterThan(0);
        expect(badReferences).toBe(0);
    });

    it('still materializes a recipe that has no cycle', async () => {
        const tree = (await populateIngredientsTree('13357')) as {
            creationSpecs?: { ingredients?: { item?: { name?: string } }[] }[];
        } | null;

        expect(tree?.creationSpecs?.[0]?.ingredients?.[0]?.item?.name).toBe('Plank');
    });
});
