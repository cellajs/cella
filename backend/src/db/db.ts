import type { DrizzleConfig } from 'drizzle-orm';
import { type NodePgClient, type NodePgDatabase, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env';

export const dbConfig = {
  logger: !!env.DEBUG,
} satisfies DrizzleConfig;

export const migrateConfig = { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' };

export type PgDB = NodePgDatabase & { $client: NodePgClient };
export type DB = PgDB;

type TxOf<D extends { transaction: (...args: never[]) => unknown }> = Parameters<Parameters<D['transaction']>[0]>[0];

export type Tx = TxOf<DB>;
export type DbOrTx = DB | Tx;

// Scaleway private DB endpoints use self-signed certificates.
// pg v8+ treats sslmode=require as verify-full, so we must explicitly
// disable certificate verification when connecting over a private network.
const sslConfig = env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined;

const createPgConnection = (connectionString: string, max: number): PgDB =>
  pgDrizzle({
    connection: { connectionString, connectionTimeoutMillis: 10_000, max, ssl: sslConfig },
    ...dbConfig,
  });

const initConnections = (): { db: DB; migrationDb?: PgDB; adminDb?: PgDB } => {
  if (env.NODB) {
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
