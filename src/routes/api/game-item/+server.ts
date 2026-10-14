import type { RequestHandler } from '@sveltejs/kit';
import {
    getGameItemById,
    getRecipesUsingItem,
    getSameNamePrimaryId,
} from '$lib/services/game-item-mongo-service.server';
import { loadUsedInSafely } from '$lib/helpers/item-used-in';
import { hasRecipe } from '$lib/seo/item-seo';

export const GET: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) {
        return new Response('Missing "id" query parameter.', { status: 400 });
    }

    const item = await getGameItemById(id);
    if (!item) {
        return new Response('Item not found.', { status: 404 });
    }

    // Carried on the same response so the item page's title, robots tag and "Used in" card are all
    // in its server render, with no second request.
    const usedIn = await loadUsedInSafely(() => getRecipesUsingItem((item as { _id?: unknown })._id));

    // Only an item that could be indexed needs to know whether a namesake is indexed instead. If the
    // lookup fails the page stays indexable, which at worst repeats a title for a while.
    let sameNamePrimaryId: number | null = null;
    if (hasRecipe(item) || usedIn.total > 0) {
        try {
            sameNamePrimaryId = await getSameNamePrimaryId(item);
        } catch (error) {
            console.error('Failed to look up items with the same name', error);
        }
    }

    return new Response(JSON.stringify({ ...item, usedIn, sameNamePrimaryId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
