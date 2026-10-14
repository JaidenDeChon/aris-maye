import type { RequestHandler } from '@sveltejs/kit';
import { getGameItemById, getRecipesUsingItem } from '$lib/services/game-item-mongo-service.server';
import { loadUsedInSafely } from '$lib/helpers/item-used-in';

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

    return new Response(JSON.stringify({ ...item, usedIn }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
