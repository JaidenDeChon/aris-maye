/**
 * Integration coverage for the creation-cost half of the profit/ROI pipeline.
 *
 * Runs against a real MongoDB so the aggregation is executed by the server rather
 * than asserted by inspection. Set TEST_MONGO_URI to point at a throwaway instance:
 *
 *   docker run -d --rm -p 27018:27017 mongo:7
 *   TEST_MONGO_URI=mongodb://127.0.0.1:27018 bun test
 *
 * Skipped automatically when no such instance is reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import mongoose from 'mongoose';

const TEST_MONGO_URI = process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27018';

/** Probes for a usable Mongo before declaring the suite. */
async function mongoReachable(): Promise<boolean> {
    try {
        await mongoose.connect(TEST_MONGO_URI, { dbName: 'aris-maye-test', serverSelectionTimeoutMS: 1500 });
        return true;
    } catch {
        return false;
    }
}

const reachable = await mongoReachable();
const describeIfMongo = reachable ? describe : describe.skip;

if (!reachable) {
    console.warn(`[creation-cost] Skipping: no MongoDB at ${TEST_MONGO_URI}`);
}

describeIfMongo('creation cost for untradeable ingredients', () => {
    let OsrsboxItemModel: typeof import('$lib/models/mongo-schemas/osrsbox-db-item-schema').OsrsboxItemModel;
    let getPaginatedGameItems: typeof import('./game-item-mongo-service.server').getPaginatedGameItems;

    // Minimal item shape satisfying the schema's required fields.
    const baseItem = {
        last_updated: '2026-01-01',
        incomplete: false,
        members: true,
        tradeable: true,
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
        icon: 'x',
    };

    const seedlingObjectId = new mongoose.Types.ObjectId();
    const coinsObjectId = new mongoose.Types.ObjectId();

    beforeAll(async () => {
        ({ OsrsboxItemModel } = await import('$lib/models/mongo-schemas/osrsbox-db-item-schema'));
        ({ getPaginatedGameItems } = await import('./game-item-mongo-service.server'));

        await OsrsboxItemModel.deleteMany({});
        await OsrsboxItemModel.insertMany([
            {
                ...baseItem,
                _id: seedlingObjectId,
                id: 5364,
                name: 'Oak seedling (w)',
                // Untradeable: no market price, and `cost` is a meaningless base value.
                tradeable: false,
                tradeable_on_ge: false,
                cost: 1,
            },
            {
                ...baseItem,
                id: 5370,
                name: 'Oak sapling',
                tradeable_on_ge: true,
                cost: 1,
                highPrice: 316,
                creationSpecs: [
                    {
                        experienceGranted: [],
                        requiredSkills: [],
                        ingredients: [{ item: seedlingObjectId, amount: 1, consumedDuringCreation: true }],
                    },
                ],
            },
            {
                ...baseItem,
                _id: coinsObjectId,
                id: 995,
                name: 'Coins',
                // Coins carry the untradeable flag but their cost is a literal gp price.
                tradeable: false,
                tradeable_on_ge: false,
                stackable: true,
                cost: 1,
            },
            {
                ...baseItem,
                id: 113,
                name: 'Strength potion(4)',
                tradeable_on_ge: true,
                cost: 1,
                highPrice: 500,
                creationSpecs: [
                    {
                        experienceGranted: [],
                        requiredSkills: [],
                        ingredients: [{ item: coinsObjectId, amount: 5, consumedDuringCreation: true }],
                    },
                ],
            },
        ]);
    });

    afterAll(async () => {
        await OsrsboxItemModel.deleteMany({});
        await mongoose.disconnect();
    });

    it('does not invent a 1gp cost from an untradeable ingredient', async () => {
        const page = await getPaginatedGameItems({ page: 1, perPage: 10, sortOrder: 'desc', profitMode: true });
        const sapling = page.items.find((item) => item.name === 'Oak sapling') as Record<string, unknown> | undefined;

        expect(sapling).toBeDefined();
        // Previously this was 1, making profit 315 and ROI 31500%.
        expect(sapling!.creationCost ?? null).toBeNull();
        expect(sapling!.creationProfit ?? null).toBeNull();
    });

    it('still prices a coin fee, which is untradeable but is literally gp', async () => {
        const page = await getPaginatedGameItems({ page: 1, perPage: 10, sortOrder: 'desc', profitMode: true });
        const potion = page.items.find((item) => item.name === 'Strength potion(4)') as
            | Record<string, unknown>
            | undefined;

        expect(potion).toBeDefined();
        expect(potion!.creationCost).toBe(5);
        expect(potion!.creationProfit).toBe(495);
    });

    it('keeps items with an unknown creation cost out of the ROI sort', async () => {
        const page = await getPaginatedGameItems({ page: 1, perPage: 10, sortOrder: 'roi-desc' });
        expect(page.items.some((item) => item.name === 'Oak sapling')).toBe(false);
    });

    it('still prices a tradeable ingredient from cost when it has no live GE price', async () => {
        await OsrsboxItemModel.updateOne({ _id: seedlingObjectId }, { $set: { tradeable_on_ge: true, cost: 40 } });

        const page = await getPaginatedGameItems({ page: 1, perPage: 10, sortOrder: 'desc', profitMode: true });
        const sapling = page.items.find((item) => item.name === 'Oak sapling') as Record<string, unknown> | undefined;

        expect(sapling!.creationCost).toBe(40);
        expect(sapling!.creationProfit).toBe(276);

        await OsrsboxItemModel.updateOne({ _id: seedlingObjectId }, { $set: { tradeable_on_ge: false, cost: 1 } });
    });
});
