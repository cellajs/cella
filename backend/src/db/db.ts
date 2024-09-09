import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import pg from 'pg';
import { env } from '#/../env';

import { config } from 'config';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export const queryClient = env.PGLITE
  ? await (await import('@electric-sql/pglite')).PGlite.create({
      dataDir: './.db',
    })
  : new pg.Pool({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
    });

const dbConfig = {
  logger: config.debug,
};
export const db: PgDatabase<PgQueryResultHKT> = queryClient instanceof pg.Pool ? pgDrizzle(queryClient, dbConfig) : pgliteDrizzle(queryClient, dbConfig);

export const coalesce = <T>(column: T, value: number) => sql`COALESCE(${column}, ${value})`.mapWith(Number);
