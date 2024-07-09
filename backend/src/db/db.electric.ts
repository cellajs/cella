import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../../env';

import { config } from 'config';

const queryClient = new pg.Pool({
  connectionString: env.ELECTRIC_SYNC_URL,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(queryClient, {
  logger: config.debug,
});
