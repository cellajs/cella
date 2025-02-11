import { hc } from 'hono/client';
import { createHc } from '#/utils/hc';
import type routes from '.';

const client = hc<typeof routes>('');
type Client = typeof client;
export const requestsHc = createHc<Client>('/requests');
