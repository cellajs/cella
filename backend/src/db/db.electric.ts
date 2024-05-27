import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from 'env';
import pg from 'pg';

import { config } from 'config';

const queryClient = new pg.Pool({
  connectionString: env.ELECTRIC_SYNC_URL,
});

export const db = drizzle(queryClient, {
  logger: config.debug,
});
