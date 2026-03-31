import type { DrizzleConfig } from 'drizzle-orm';
import { type NodePgClient, type NodePgDatabase, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import * as schema from '#/db/schema';
import { env } from '../env';

export type DBSchema = typeof schema;

export const dbConfig = {
  logger: env.DEBUG,
  casing: 'snake_case',
} satisfies DrizzleConfig<DBSchema>;

export const migrateConfig = { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' };

export type PgDB = NodePgDatabase<DBSchema> & { $client: NodePgClient };
export type DB = PgDB;

type TxOf<D extends { transaction: (...args: any[]) => any }> = Parameters<Parameters<D['transaction']>[0]>[0];

export type Tx = TxOf<DB>;
export type DbOrTx = DB | Tx;

const createPgConnection = (connectionString: string, max: number): PgDB =>
  pgDrizzle({
    connection: { connectionString, connectionTimeoutMillis: 10_000, max },
    schema,
    ...dbConfig,
  });

const initConnections = (): { db: DB; migrationDb?: PgDB; adminDb?: PgDB } => {
  if (env.DEV_MODE === 'none') {
    return { db: {} as unknown as DB };
  }

  return {
    db: createPgConnection(env.DATABASE_URL, env.DATABASE_POOL_MAX),
    migrationDb: createPgConnection(env.DATABASE_ADMIN_URL, 5),
    adminDb: createPgConnection(env.DATABASE_ADMIN_URL, 5),
  };
};

const connections = initConnections();

export const baseDb: DB = connections.db;
export const migrationDb: PgDB | undefined = connections.migrationDb;
export const unsafeInternalAdminDb: PgDB | undefined = connections.adminDb;

/** Admin connection for seed scripts */
export const seedDb: DB = (connections.adminDb ?? connections.db) as DB;
