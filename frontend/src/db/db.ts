import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { config } from 'config';

const client = postgres('postgres://postgres:proxy_password@localhost:65431/electric');

export const db = drizzle(client, {
  logger: config.debug,
});
