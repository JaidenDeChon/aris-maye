import { Types } from 'mongoose';
import { startMongo, db } from '../src/db/mongo';
import { OsrsboxItemModel } from '../src/lib/models/mongo-schemas/osrsbox-db-item-schema';

type DuplicateItem = {
    _id: Types.ObjectId;
    id?: number;
    name?: string;
    last_updated?: string;
};

type DuplicateGroup = {
    _id: number | string | null;
    items: DuplicateItem[];
    count: number;
};

type KeepStrategy = 'latest' | 'oldest';
type DedupeField = 'id' | 'name';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fieldArg = args.find((arg) => arg.startsWith('--field='));
const keepArg = args.find((arg) => arg.startsWith('--keep='));

const field = (fieldArg?.split('=')[1] as DedupeField | undefined) ?? 'id';
const keep = (keepArg?.split('=')[1] as KeepStrategy | undefined) ?? 'latest';

if (field !== 'id' && field !== 'name') {
    console.error(`Invalid --field value "${field}". Use "id" or "name".`);
    process.exit(1);
}

if (keep !== 'latest' && keep !== 'oldest') {
    console.error(`Invalid --keep value "${keep}". Use "latest" or "oldest".`);
    process.exit(1);
}

function normalizeTimestamp(item: DuplicateItem): number {
    const parsed = Date.parse(item.last_updated ?? '');
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;

    const objectId = item._id instanceof Types.ObjectId ? item._id : new Types.ObjectId(item._id);
    return objectId.getTimestamp().getTime();
}

function pickKeepItem(items: DuplicateItem[], strategy: KeepStrategy): DuplicateItem {
    const sorted = [...items].sort((a, b) => {
        const aTs = normalizeTimestamp(a);
        const bTs = normalizeTimestamp(b);
        if (aTs === bTs) return a._id.toString().localeCompare(b._id.toString());
        return aTs - bTs;
    });

    return strategy === 'latest' ? sorted[sorted.length - 1] : sorted[0];
}

function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

async function removeDuplicateItems(): Promise<void> {
    await startMongo();
    console.log('MongoDB connection established. Searching for duplicates...');

    const groups = await OsrsboxItemModel.aggregate<DuplicateGroup>([
        { $match: { [field]: { $ne: null } } },
        {
            $group: {
                _id: `$${field}`,
                items: {
                    $push: {
                        _id: '$_id',
                        id: '$id',
                        name: '$name',
                        last_updated: '$last_updated',
                    },
                },
                count: { $sum: 1 },
            },
        },
        { $match: { count: { $gt: 1 } } },
    ]).allowDiskUse(true);

    if (!groups.length) {
        console.log(`No duplicates found for field "${field}".`);
        return;
    }

    const idsToRemove: Types.ObjectId[] = [];
    const sampleGroups = groups.slice(0, 5);

    for (const group of groups) {
        if (!group.items?.length) continue;
        const keepItem = pickKeepItem(group.items, keep);
        for (const item of group.items) {
            if (item._id.toString() !== keepItem._id.toString()) {
                idsToRemove.push(item._id);
            }
        }
    }

    console.log(
        `Found ${groups.length} duplicate ${field} group(s). Marked ${idsToRemove.length} document(s) for removal (keep=${keep}).`,
    );

    console.log(
        'Sample duplicates:',
        sampleGroups.map((group) => ({
            fieldValue: group._id,
            ids: group.items.map((item) => item._id.toString()),
        })),
    );

    if (dryRun) {
        console.log('Dry run enabled. No documents were deleted.');
        return;
    }

    const chunks = chunkArray(idsToRemove, 1000);
    let deleted = 0;

    for (const chunk of chunks) {
        if (!chunk.length) continue;
        const result = await OsrsboxItemModel.deleteMany({ _id: { $in: chunk } }).exec();
        deleted += result.deletedCount ?? 0;
    }

    console.log(`Deletion complete. Removed ${deleted} document(s).`);
}

try {
    await removeDuplicateItems();
} catch (error) {
    console.error('Failed to remove duplicate items:', error);
    process.exitCode = 1;
} finally {
    await db.close();
}
