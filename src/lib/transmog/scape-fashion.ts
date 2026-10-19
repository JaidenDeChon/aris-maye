/**
 * Colour matching from scape.fashion's public API (https://scape.fashion). It knows items by their
 * wiki names, so its results are matched back to our items by name.
 */
import { EquipmentSlot } from '$lib/osrs-model/compose';
import type { Gender, WearableItem } from '$lib/osrs-model/types';

const API = 'https://api.scape.fashion';

/** Our equipment slots under scape.fashion's names for them. */
const SLOT_NAMES: Record<number, string> = {
    [EquipmentSlot.head]: 'head',
    [EquipmentSlot.cape]: 'cape',
    [EquipmentSlot.amulet]: 'neck',
    [EquipmentSlot.weapon]: 'weapon',
    [EquipmentSlot.body]: 'body',
    [EquipmentSlot.shield]: 'shield',
    [EquipmentSlot.legs]: 'leg',
    [EquipmentSlot.hands]: 'hand',
    [EquipmentSlot.feet]: 'feet',
};

export function slotName(slot: number): string | undefined {
    return SLOT_NAMES[slot];
}

/**
 * A name reduced to what both sides agree on. The wiki writes poisoned weapons as
 * "Iron dagger (Poison)" where the game says "Iron dagger(p)", and those look the same anyway.
 */
export function normaliseName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s*\((p\+{0,2}|kp|poison|karambwan poison)\)$/, '')
        .replace(/[^a-z0-9]/g, '');
}

/** Our items by normalised name, for looking up scape.fashion's results. */
export function nameIndex(itemList: WearableItem[]): Map<string, WearableItem[]> {
    const index = new Map<string, WearableItem[]>();
    for (const item of itemList) {
        const key = normaliseName(item.name);
        const list = index.get(key);
        if (list) list.push(item);
        else index.set(key, [item]);
    }
    return index;
}

export type MatchSource = { by: 'item'; name: string } | { by: 'colour'; colour: string };

export interface MatchQuery {
    source: MatchSource;
    /** Our equipment slot to search in, or null for every slot. */
    slot: number | null;
    tradeableOnly: boolean;
    page: number;
    pageSize: number;
}

/** One item as scape.fashion returns it. */
export interface RemoteItem {
    name: string;
    slot: string;
    /** Three hex colours, most prominent first. */
    colors: string[];
    /** How close the colours are, 0 to 1. */
    match: number;
    status: string[];
}

export interface MatchPage {
    /** The item scape.fashion actually matched against, when searching by item (it guesses at unknown names). */
    name?: string;
    lastPage: number;
    items: RemoteItem[];
}

export function matchUrl(query: MatchQuery): string {
    const params = new URLSearchParams();
    if (query.source.by === 'item') params.set('name', query.source.name);
    else params.set('color', query.source.colour);
    const slot = query.slot === null ? undefined : slotName(query.slot);
    if (slot) params.set('slot', slot);
    if (query.tradeableOnly) params.set('tradeable', 'true');
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    return `${API}/items/match?${params}`;
}

export async function fetchMatches(query: MatchQuery, signal?: AbortSignal): Promise<MatchPage> {
    const response = await fetch(matchUrl(query), { signal });
    if (!response.ok) throw new Error(`scape.fashion: HTTP ${response.status}`);
    const body = (await response.json()) as Partial<MatchPage>;
    return { name: body.name, lastPage: body.lastPage ?? 0, items: Array.isArray(body.items) ? body.items : [] };
}

/** A scape.fashion result we can put on: our item, with its colours and closeness. */
export interface Match {
    item: WearableItem;
    colors: string[];
    match: number;
}

/**
 * Turns scape.fashion's results into our items, dropping the ones we can't find or that this
 * body can't wear, the item being matched against, and repeats.
 */
export function toMatches(
    remote: RemoteItem[],
    index: Map<string, WearableItem[]>,
    gender: Gender,
    exclude: Set<number>,
): Match[] {
    const out: Match[] = [];
    for (const result of remote) {
        const wanted = Object.entries(SLOT_NAMES).find(([, name]) => name === result.slot)?.[0];
        const candidates = index.get(normaliseName(result.name)) ?? [];
        const item = candidates.find(
            (c) => (wanted === undefined || c.slot === Number(wanted)) && c.models[gender].length > 0,
        );
        if (!item || exclude.has(item.id)) continue;
        exclude.add(item.id);
        out.push({ item, colors: result.colors, match: result.match });
    }
    return out;
}

/** scape.fashion's own colours for an item, or null if it doesn't know the item. */
export async function fetchItemColours(item: WearableItem, signal?: AbortSignal): Promise<string[] | null> {
    const page = await fetchMatches(
        { source: { by: 'item', name: item.name }, slot: item.slot, tradeableOnly: false, page: 0, pageSize: 5 },
        signal,
    );
    if (!page.name || normaliseName(page.name) !== normaliseName(item.name)) return null;
    return page.items.find((r) => normaliseName(r.name) === normaliseName(item.name))?.colors ?? null;
}
