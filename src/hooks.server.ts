import { startMongo } from '$db/mongo';
import type { Handle } from '@sveltejs/kit';

// Establish MongoDB connection.
await startMongo().then(() => console.info('MongoDB connection established.'));

// Set up preloading etc.
export const handle: Handle = async ({ event, resolve }) => {
    return resolve(event, {
        preload: ({ type, path }) => {
            // Preload ttf fonts. (osrs font)
            return type === 'font' || path.endsWith('.ttf');
        },
    });
};
