import { startMongo } from '$db/mongo';
import type { Handle } from '@sveltejs/kit';

// Start connecting to MongoDB, but don't hold the server up for it. Awaiting it here made every
// request on a cold start wait for the whole connection (DNS, TLS and login to Atlas) before
// rendering anything, even pages that don't need the database straight away. Mongoose queues
// queries until the connection is up, so the ones that do need it simply wait for it.
startMongo()
    .then(() => console.info('MongoDB connection established.'))
    // startMongo logs the error itself; this keeps a failed connection from crashing the server.
    .catch(() => {});

// Set up preloading etc.
export const handle: Handle = async ({ event, resolve }) => {
    return resolve(event, {
        preload: ({ type, path }) => {
            // Preload ttf fonts. (osrs font)
            return type === 'font' || path.endsWith('.ttf');
        },
    });
};
