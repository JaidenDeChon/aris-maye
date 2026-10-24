/**
 * Rebuilds stances.json: which stand animation each weapon uses. The game cache doesn't say (the
 * server sends it), so this merges two community tables, both BSD-2-Clause (see STANCES-LICENSE):
 *
 *   Weapon Animation Replacer (geheur), recorded from the live game and kept current; preferred.
 *   Alter (AlterRSPS), an emulator's per-item table, which fills in what the first one lacks.
 *
 * Only stands other than the default (808) are kept. Run with `bun scripts/transmog/update-stances.ts`.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WAR_URL =
    'https://raw.githubusercontent.com/geheur/weapon-animation-replacer/master/src/main/resources/com/weaponanimationreplacer/data.json';
const ALTER_BAS_URL =
    'https://raw.githubusercontent.com/AlterRSPS/Alter/main/data/cfg/items/renderAnimations/bas_mappings.json';
const ALTER_ITEMS_URL =
    'https://raw.githubusercontent.com/AlterRSPS/Alter/main/data/cfg/items/renderAnimations/item_bas.json';
const DEFAULT_STAND = 808;

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return (await response.json()) as T;
}

interface WarData {
    poseanims: Record<string, number[]>;
    animationSets: { name: string; animations: number[] }[];
}

const [war, alterBas, alterItems] = await Promise.all([
    fetchJson<WarData>(WAR_URL),
    fetchJson<Record<string, { readyAnim: number }>>(ALTER_BAS_URL),
    fetchJson<Record<string, number>>(ALTER_ITEMS_URL),
]);

const stands = new Map<number, number>();
for (const [itemId, bas] of Object.entries(alterItems)) {
    const stand = alterBas[String(bas)]?.readyAnim;
    if (stand !== undefined && stand >= 0) stands.set(Number(itemId), stand);
}
// The animation array starts with the stand.
const setStand = new Map(war.animationSets.map((set) => [set.name, set.animations[0]]));
for (const [name, itemIds] of Object.entries(war.poseanims)) {
    const stand = setStand.get(name);
    if (stand === undefined || stand < 0) continue;
    for (const itemId of itemIds) stands.set(itemId, stand);
}

const items: Record<string, number> = {};
for (const [itemId, stand] of [...stands].sort((a, b) => a[0] - b[0])) {
    if (stand !== DEFAULT_STAND) items[itemId] = stand;
}
writeFileSync(join(import.meta.dirname, 'stances.json'), JSON.stringify({ items }, null, 4) + '\n');
console.log(`stances.json: ${Object.keys(items).length} items, ${new Set(Object.values(items)).size} stands`);
