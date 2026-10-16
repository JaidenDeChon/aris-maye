import type { RequestHandler } from '@sveltejs/kit';
import {
    getGameItemById,
    getRecipesUsingItem,
    getSameNamePrimaryId,
} from '$lib/services/game-item-mongo-service.server';
import { loadGameItemPayload } from '$lib/helpers/game-item-payload';

export const GET: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) {
        return new Response('Missing "id" query parameter.', { status: 400 });
    }

    const payload = await loadGameItemPayload(
        id,
        { priceOnly: url.searchParams.get('fields') === 'price' },
        { getItem: getGameItemById, getUsedIn: getRecipesUsingItem, getSameNamePrimaryId },
    );
    if (!payload) {
        return new Response('Item not found.', { status: 404 });
    }

    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
