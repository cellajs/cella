import { hc } from 'hono/client';
import { createHc } from '#/utils/hc';
import type routes from './handlers';

const client = hc<typeof routes>('');
type Client = typeof client;
export const entitiesHc = createHc<Client>('/entities');
