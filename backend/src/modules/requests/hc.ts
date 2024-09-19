import { hc } from 'hono/client';
import { createHc } from '#/lib/hc';
import type routes from '.';

// assign the client to a variable to calculate the type when compiling
const client = hc<typeof routes>('');
type Client = typeof client;
export const requestsHc = createHc<Client>('/requests');
