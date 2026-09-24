import type { Handler } from '@netlify/functions';
import { startMongo } from '../../src/db/mongo';
import { updateAllGameItemPricesInMongo } from '../../src/lib/services/game-item-price-service';

export const handler: Handler = async () => {
    console.info('Attempting item prices update');

    try {
        await startMongo();
        console.info('MongoDB connection established. Updating all game item prices...');
        await updateAllGameItemPricesInMongo();
        console.info('All game item prices updated.');

        return {
            statusCode: 200,
            body: JSON.stringify({ ok: true }),
        };
    } catch (error) {
        console.error('Error updating item prices:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
