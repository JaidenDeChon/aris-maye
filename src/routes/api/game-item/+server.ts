import type { RequestHandler } from '@sveltejs/kit';
import { getGameItemById } from '$lib/services/game-item-mongo-service.server';

export const GET: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) {
        return new Response('Missing "id" query parameter.', { status: 400 });
    }

    const item = await getGameItemById(id);
    if (!item) {
        return new Response('Item not found.', { status: 404 });
    }

    return new Response(JSON.stringify(item), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
