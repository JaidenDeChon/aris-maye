import { handler } from '../netlify/functions/update-item-prices';

const response = await handler({} as never, {} as never);
console.log('Local run complete:', response);
