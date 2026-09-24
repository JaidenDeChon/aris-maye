import type { RequestHandler } from '@sveltejs/kit';
import { Types } from 'mongoose';
import { OsrsboxItemModel } from '$lib/models/mongo-schemas/osrsbox-db-item-schema';

type IncomingSpec = {
    experienceGranted?: { skillName?: string; experienceAmount?: number }[];
    requiredSkills?: { skillName?: string; skillLevel?: number }[];
    ingredients?: {
        consumedDuringCreation?: boolean;
        amount?: number;
        item?: string | number;
        itemId?: string | number;
    }[];
};

type IncomingPayload = {
    id?: number;
    name?: string;
    last_updated?: string;
    incomplete?: boolean;
    members?: boolean;
    tradeable?: boolean;
    tradeable_on_ge?: boolean;
    stackable?: boolean;
    stacked?: number | null;
    noted?: boolean;
    noteable?: boolean;
    linked_id_item?: number | null;
    linked_id_noted?: number | null;
    linked_id_placeholder?: number | null;
    placeholder?: boolean;
    equipable?: boolean;
    equipable_by_player?: boolean;
    equipable_weapon?: boolean;
    cost?: number;
    lowalch?: number | null;
    highalch?: number | null;
    weight?: number | null;
    buy_limit?: number | null;
    quest_item?: boolean;
    release_date?: string | null;
    duplicate?: boolean;
    examine?: string | null;
    icon?: string;
    wiki_name?: string | null;
    wiki_url?: string | null;
    equipment?: Record<string, unknown> | null;
    weapon?: Record<string, unknown> | null;
    creationSpecs?: IncomingSpec[];
    highPrice?: number | null;
    highTime?: number | null;
    lowPrice?: number | null;
    lowTime?: number | null;
};

export const GET: RequestHandler = async ({ url }) => {
    const idParam = url.searchParams.get('id');
    const nameParam = url.searchParams.get('name');

    if (!idParam && !nameParam) {
        return new Response('Provide an "id" or "name" query parameter.', { status: 400 });
    }

    let query: Record<string, unknown> | null = null;

    if (idParam) {
        const numericId = Number(idParam);
        if (Number.isFinite(numericId)) {
            query = { id: numericId };
        } else if (Types.ObjectId.isValid(idParam)) {
            query = { _id: new Types.ObjectId(idParam) };
        }
    }

    if (!query && nameParam) {
        const trimmed = nameParam.trim();
        if (trimmed) {
            query = { name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') };
        }
    }

    if (!query) {
        return new Response('Invalid lookup parameters.', { status: 400 });
    }

    const doc = await OsrsboxItemModel.findOne(query).lean().exec();
    if (!doc) {
        return new Response('Item not found.', { status: 404 });
    }

    return new Response(JSON.stringify(doc), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};

export const POST: RequestHandler = async ({ request }) => {
    let raw: IncomingPayload | null = null;
    try {
        raw = (await request.json()) as IncomingPayload;
    } catch {
        return new Response('Invalid JSON payload.', { status: 400 });
    }

    try {
        const payload = await normalizePayload(raw);
        const saved = await OsrsboxItemModel.findOneAndUpdate({ id: payload.id }, payload, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        })
            .lean<{ _id: Types.ObjectId; id: number }>()
            .exec();

        return new Response(JSON.stringify({ id: saved?.id, _id: saved?._id }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Failed to save OSRSBox item', error);
        const message = error instanceof Error ? error.message : 'Failed to save item.';
        return new Response(message, { status: 400 });
    }
};

const SENTINEL_PRICE = 2147483647;

function toNumber(value: unknown, field: string, required = false): number | null {
    if (value === null || value === undefined || value === '') {
        if (required) throw new Error(`${field} is required.`);
        return null;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        throw new Error(`"${field}" must be a valid number.`);
    }

    return numeric;
}

function toBoolean(value: unknown): boolean {
    if (typeof value === 'string') {
        return value === 'true' || value === '1' || value.toLowerCase() === 'yes';
    }
    return Boolean(value);
}

function toStringOrNull(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function sanitizePrice(value: number | null): number | null {
    if (value === null) return null;
    if (!Number.isFinite(value)) return null;
    if (value <= 0 || value >= SENTINEL_PRICE) return null;
    return value;
}

function sanitizeTime(value: number | null): number | null {
    if (value === null) return null;
    if (!Number.isFinite(value)) return null;
    return value > 0 ? value : null;
}

async function normalizePayload(raw: IncomingPayload) {
    const id = toNumber(raw.id, 'id', true);
    const cost = toNumber(raw.cost, 'cost', true);
    if (id === null || cost === null) throw new Error('Item id and cost are required.');

    if (!raw.name?.trim()) throw new Error('Name is required.');
    if (!raw.icon?.trim()) throw new Error('Icon (base64) is required.');

    const creationSpecs = await normalizeCreationSpecs(raw.creationSpecs ?? []);

    const highPrice = sanitizePrice(toNumber(raw.highPrice, 'highPrice'));
    const lowPrice = sanitizePrice(toNumber(raw.lowPrice, 'lowPrice'));
    const highTime = highPrice !== null ? sanitizeTime(toNumber(raw.highTime, 'highTime')) : null;
    const lowTime = lowPrice !== null ? sanitizeTime(toNumber(raw.lowTime, 'lowTime')) : null;

    return {
        id,
        name: raw.name.trim(),
        last_updated: raw.last_updated?.trim() || new Date().toISOString(),
        incomplete: toBoolean(raw.incomplete),
        members: toBoolean(raw.members),
        tradeable: toBoolean(raw.tradeable),
        tradeable_on_ge: toBoolean(raw.tradeable_on_ge),
        stackable: toBoolean(raw.stackable),
        stacked: toNumber(raw.stacked, 'stacked'),
        noted: toBoolean(raw.noted),
        noteable: toBoolean(raw.noteable),
        linked_id_item: toNumber(raw.linked_id_item, 'linked_id_item'),
        linked_id_noted: toNumber(raw.linked_id_noted, 'linked_id_noted'),
        linked_id_placeholder: toNumber(raw.linked_id_placeholder, 'linked_id_placeholder'),
        placeholder: toBoolean(raw.placeholder),
        equipable: toBoolean(raw.equipable),
        equipable_by_player: toBoolean(raw.equipable_by_player),
        equipable_weapon: toBoolean(raw.equipable_weapon),
        cost,
        lowalch: toNumber(raw.lowalch, 'lowalch'),
        highalch: toNumber(raw.highalch, 'highalch'),
        weight: toNumber(raw.weight, 'weight'),
        buy_limit: toNumber(raw.buy_limit, 'buy_limit'),
        quest_item: toBoolean(raw.quest_item),
        release_date: toStringOrNull(raw.release_date),
        duplicate: toBoolean(raw.duplicate),
        examine: toStringOrNull(raw.examine),
        icon: raw.icon.trim(),
        wiki_name: toStringOrNull(raw.wiki_name),
        wiki_url: toStringOrNull(raw.wiki_url),
        equipment: raw.equipment ?? null,
        weapon: raw.weapon ?? null,
        creationSpecs,
        highPrice,
        highTime,
        lowPrice,
        lowTime,
    };
}

async function normalizeCreationSpecs(specs: IncomingSpec[]) {
    const results = [];

    for (let i = 0; i < specs.length; i += 1) {
        const spec = specs[i];
        const experienceGranted =
            spec.experienceGranted
                ?.map((row, rowIndex) => {
                    if (!row?.skillName?.trim()) return null;
                    const amount = toNumber(
                        row.experienceAmount,
                        `creationSpecs[${i}].experienceGranted[${rowIndex}]`,
                        true,
                    );
                    return amount === null ? null : { skillName: row.skillName.trim(), experienceAmount: amount };
                })
                .filter(Boolean) ?? [];

        const requiredSkills =
            spec.requiredSkills
                ?.map((row, rowIndex) => {
                    if (!row?.skillName?.trim()) return null;
                    const level = toNumber(row.skillLevel, `creationSpecs[${i}].requiredSkills[${rowIndex}]`, true);
                    return level === null ? null : { skillName: row.skillName.trim(), skillLevel: level };
                })
                .filter(Boolean) ?? [];

        const ingredients: {
            consumedDuringCreation: boolean;
            amount: number;
            item: Types.ObjectId;
        }[] = [];

        for (let j = 0; j < (spec.ingredients?.length ?? 0); j += 1) {
            const ingredient = spec.ingredients?.[j];
            if (!ingredient) continue;

            const amount = toNumber(ingredient.amount, `creationSpecs[${i}].ingredients[${j}].amount`, true);
            const rawItemId = ingredient.item ?? ingredient.itemId;
            if (amount === null || rawItemId === null || rawItemId === undefined || rawItemId === '') continue;

            const item = await resolveItemReference(rawItemId);
            ingredients.push({
                consumedDuringCreation: toBoolean(ingredient.consumedDuringCreation),
                amount,
                item,
            });
        }

        if (experienceGranted.length || requiredSkills.length || ingredients.length) {
            results.push({ experienceGranted, requiredSkills, ingredients });
        }
    }

    return results;
}

async function resolveItemReference(value: string | number): Promise<Types.ObjectId> {
    const raw = String(value).trim();
    if (!raw) throw new Error('Ingredient item id is required.');

    if (Types.ObjectId.isValid(raw)) {
        return new Types.ObjectId(raw);
    }

    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
        const found = await OsrsboxItemModel.findOne({ id: numeric })
            .select('_id')
            .lean<{ _id: Types.ObjectId }>()
            .exec();
        if (found?._id) return found._id;
    }

    throw new Error(`Could not resolve ingredient item id: ${raw}`);
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
