import mongoose from 'mongoose';
import { handler } from '../netlify/functions/update-item-prices';

const response = await handler({} as never, {} as never);
console.log('Local run complete:', response);

// The handler leaves the Mongo connection open for the next warm invocation; a script has to close it to exit.
await mongoose.disconnect();
