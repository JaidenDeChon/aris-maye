import { startMongo } from '$db/mongo';
import type { Handle } from '@sveltejs/kit';
import { noindexHeaderFor } from '$lib/seo/robots';

// Establish MongoDB connection.
await startMongo().then(() => console.info('MongoDB connection established.'));

// Set up preloading etc.
export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event, {
        preload: ({ type, path }) => {
            // Preload ttf fonts. (osrs font)
            return type === 'font' || path.endsWith('.ttf');
        },
    });

    const noindex = noindexHeaderFor(event.url.host);
    if (noindex) response.headers.set('X-Robots-Tag', noindex);
    return response;
};
