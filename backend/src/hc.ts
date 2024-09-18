import { hc } from 'hono/client';
import type app from './routes';

// assign the client to a variable to calculate the type when compiling
const client = hc<typeof app>('');
export type Client = typeof client;

export const hcWithType = (...args: Parameters<typeof hc>): Client => hc<typeof app>(...args);
