import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from 'env';
import pg from 'pg';

import { config } from 'config';
import { sql } from 'drizzle-orm';

export const queryClient = new pg.Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(queryClient, {
  logger: config.debug,
});

export const coalesce = <T>(column: T, value: number) => sql`COALESCE(${column}, ${value})`.mapWith(Number);
