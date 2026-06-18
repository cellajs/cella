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

// In production we require a verified TLS connection to the managed PostgreSQL.
// The CA (Scaleway RDB instance cert) is provisioned automatically into the
// DATABASE_SSL_CA runtime secret by `pulumi up`, so a missing value is a
// misconfiguration we fail fast on rather than silently downgrading security.
const sslConfig =
  env.NODE_ENV === 'production' && !env.NODB
    ? (() => {
        if (!env.DATABASE_SSL_CA) {
          throw new Error(
            'FATAL: DATABASE_SSL_CA is required in production for verified TLS to PostgreSQL. ' +
              'It is provisioned automatically by `pulumi up` (Scaleway RDB CA). Run the infra ' +
              "CLI → 'Apply infra change', or check the database-ssl-ca runtime secret.",
          );
        }
        return { ca: env.DATABASE_SSL_CA, rejectUnauthorized: true };
      })()
    : undefined;

// Scaleway-built connection strings pin `sslmode=require&uselibpqcompat=true`,
// which pg would let override the verified `ssl` config above (downgrading to
// rejectUnauthorized:false). Strip those params so our CA-pinned config wins.
const toConnectionString = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return url;
  }
};

const createPgConnection = (connectionString: string, max: number): PgDB =>
  pgDrizzle({
    connection: {
      connectionString: toConnectionString(connectionString),
      connectionTimeoutMillis: 10_000,
      max,
      ssl: sslConfig,
    },
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
