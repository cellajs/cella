import { type NodePgClient, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { env } from '#/env';

import type { PGlite } from '@electric-sql/pglite';
import { config } from 'config';
import { type DrizzleConfig, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';

export const dbConfig: DrizzleConfig = {
  logger: config.debug,
  casing: 'snake_case',
};

export const migrateConfig = { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' };

export const connection = env.PGLITE
  ? process.env.NODE_ENV === 'test'
    ? // in-memory database for tests
      {}
    : { dataDir: './.db' }
  : {
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
    };

// biome-ignore lint/suspicious/noExplicitAny: Can be two different types
export const db: PgDatabase<any> & {
  $client: PGlite | NodePgClient;
} = env.PGLITE ? pgliteDrizzle({ connection, ...dbConfig }) : pgDrizzle({ connection, ...dbConfig });

export const coalesce = <T>(column: T, value: number) => sql`COALESCE(${column}, ${value})`.mapWith(Number);
