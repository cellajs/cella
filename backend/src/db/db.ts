import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from 'env';
import postgres from 'postgres';

import { config } from 'config';
import { sql } from 'drizzle-orm';

export const queryClient = postgres(env.DATABASE_URL ?? '', {
  onnotice: () => {},
});

export const db = drizzle(queryClient, {
  logger: config.debug,
});

export const coalesce = <T>(column: T, value: number) => sql`COALESCE(${column}, ${value})`.mapWith(Number);
