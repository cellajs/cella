import type { PGlite } from '@electric-sql/pglite';
import type { DrizzleConfig } from 'drizzle-orm';

import { type NodePgClient, type NodePgDatabase, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core';
import { type PgliteDatabase, drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';

import { appConfig } from 'shared';
import * as schema from '#/db/schema';
import { env } from '../env';

export type DBSchema = typeof schema;

export const dbConfig = {
  logger: appConfig.debug,
  casing: 'snake_case',
} satisfies DrizzleConfig<DBSchema>;

export const migrateConfig = { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' };

export type PgDB = NodePgDatabase<DBSchema> & { $client: NodePgClient };
export type LiteDB = PgliteDatabase<DBSchema> & { $client: PGlite };

// biome-ignore lint/suspicious/noExplicitAny: Common base type avoids union issues with .returning() and .execute()
export type DB = PgAsyncDatabase<any, DBSchema> & { $client: PGlite | NodePgClient };

type TxOf<D extends { transaction: (...args: any[]) => any }> = Parameters<Parameters<D['transaction']>[0]>[0];

export type Tx = TxOf<DB>;
export type DbOrTx = DB | Tx;

const createPgConnection = (connectionString: string): PgDB =>
  pgDrizzle({
    connection: { connectionString, connectionTimeoutMillis: 10_000 },
    schema,
    ...dbConfig,
  });

const createPgliteConnection = (): LiteDB =>
  pgliteDrizzle({
    connection: { dataDir: './.db' },
    schema,
    ...dbConfig,
  });

const initConnections = (): { db: DB; migrationDb?: PgDB; adminDb?: PgDB } => {
  if (env.DEV_MODE === 'none') {
    return { db: {} as unknown as DB };
  }

  if (env.DEV_MODE === 'basic') {
    return { db: createPgliteConnection() };
  }

  return {
    db: createPgConnection(env.DATABASE_URL),
    migrationDb: createPgConnection(env.DATABASE_ADMIN_URL),
    adminDb: createPgConnection(env.DATABASE_ADMIN_URL),
  };
};

const connections = initConnections();

export const baseDb: DB = connections.db;
export const migrationDb: PgDB | undefined = connections.migrationDb;
export const unsafeInternalAdminDb: PgDB | undefined = connections.adminDb;
