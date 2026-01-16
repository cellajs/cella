import type { PGlite } from '@electric-sql/pglite';
import { appConfig } from 'config';
import { type DrizzleConfig } from 'drizzle-orm';
import { type NodePgClient, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { env } from '../env';

/**
 * Database configuration for Drizzle ORM.
 */
export const dbConfig: DrizzleConfig = {
  logger: appConfig.debug,
  casing: 'snake_case',
};

/**
 * Migration configuration for Drizzle ORM.
 */
export const migrateConfig = { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' };

/**
 * Database connection configuration.
 */
const connection = (() => {
  if (process.env.AVOID_DB_CONNECTION === 'true') return {};

  if (env.DEV_MODE === 'basic') {
    if (process.env.NODE_ENV === 'test') return {}; // In-memory database for tests

    // PGLite for quick local development
    return { dataDir: './.db' };
  }

  // Regular Postgres connection
  return {
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  };
})();

// biome-ignore lint/suspicious/noExplicitAny: Can be two different types
type DB = PgDatabase<any> & { $client: PGlite | NodePgClient };

/**
 * The database client.
 */
export let db: DB;

if (process.env.SKIP_DB === '1') db = {} as DB;
else
  db = (
    env.DEV_MODE === 'basic' ? pgliteDrizzle({ connection, ...dbConfig }) : pgDrizzle({ connection, ...dbConfig })
  ) as DB;
