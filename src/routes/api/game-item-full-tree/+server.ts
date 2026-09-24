import { error } from '@sveltejs/kit';
import { populateIngredientsTree } from '$lib/services/game-item-mongo-service.server';
import type { RequestHandler } from '@sveltejs/kit';

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const treeCache = new Map<string, { payload: string; expiresAt: number }>();

function pruneCache(now = Date.now()) {
    for (const [key, entry] of treeCache.entries()) {
        if (entry.expiresAt <= now) {
            treeCache.delete(key);
        }
    }
    while (treeCache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = treeCache.keys().next().value as string | undefined;
        if (!oldestKey) break;
        treeCache.delete(oldestKey);
    }
}

function readCache(key: string): string | null {
    const entry = treeCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        treeCache.delete(key);
        return null;
    }
    return entry.payload;
}

function writeCache(key: string, payload: string) {
    treeCache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    pruneCache();
}

export const GET: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) {
        console.error('id was null');
        error(404);
    }

    try {
        const cacheKey = String(id);
        const cached = readCache(cacheKey);
        if (cached) {
            return new Response(cached, {
                headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
            });
        }

        const gameItems = await populateIngredientsTree(id);
        const json = safeStringify(gameItems);
        writeCache(cacheKey, json);
        return new Response(json, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' } });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : 'Failed to serialize game item tree (possible circular reference).';
        console.error('[game-item-full-tree] serialization error:', err);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};

function safeStringify(value: unknown): string {
    detectCircular(value);
    const json = JSON.stringify(value);
    return json ?? 'null';
}

function detectCircular(value: unknown) {
    const seen = new WeakMap<object, string[]>();

    function traverse(val: unknown, path: string[]) {
        if (!val || typeof val !== 'object') return;

        const label = describeObject(val as Record<string, unknown>);
        const currentPath = [...path, label];

        const existingPath = seen.get(val as object);
        if (existingPath) {
            const chain = [...existingPath, label];
            const uniqueNodes = Array.from(new Set(chain));
            const lines = uniqueNodes.map((entry) => `- ${entry}`);
            throw new Error(
                `Circular reference path:\n${lines.join('\n')}\nFix these items' creationSpecs/ingredients in the database.`,
            );
        }

        seen.set(val as object, currentPath);

        if (Array.isArray(val)) {
            val.forEach((child) => traverse(child, currentPath));
        } else {
            for (const [, child] of Object.entries(val)) {
                // Only descend into object/array children and skip primitive props
                if (child && typeof child === 'object') {
                    traverse(child, currentPath);
                }
            }
        }
    }

    traverse(value, ['root']);
}

function describeObject(obj: Record<string, unknown>): string {
    const id = obj._id ?? obj.id;
    const name = obj.name ?? obj.wiki_name;
    const parts: string[] = [];
    if (name) parts.push(String(name));
    if (id) parts.push(`(${String(id)})`);
    return parts.length ? parts.join(' ') : (obj.constructor?.name ?? 'object');
}
