import type { DrizzleConfig } from 'drizzle-orm';
import { type NodePgClient, type NodePgDatabase, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { stripPostgresSslParams, verifiedPostgresSsl } from 'shared/utils/postgres-tls';
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
const sslCa =
  env.NODE_ENV === 'production' && !env.NODB
    ? (() => {
        if (!env.DATABASE_SSL_CA) {
          throw new Error(
            'FATAL: DATABASE_SSL_CA is required in production for verified TLS to PostgreSQL. ' +
              'It is provisioned automatically by `pulumi up` (Scaleway RDB CA). Run the infra ' +
              "CLI → 'Apply infra change', or check the database-ssl-ca runtime secret.",
          );
        }
        return Buffer.from(env.DATABASE_SSL_CA, 'base64').toString('utf-8');
      })()
    : undefined;

const createPgConnection = (connectionString: string, max: number): PgDB =>
  pgDrizzle({
    connection: {
      connectionString: stripPostgresSslParams(connectionString),
      connectionTimeoutMillis: 10_000,
      max,
      ssl: verifiedPostgresSsl(connectionString, sslCa),
    },
    ...dbConfig,
  });

/**
 * Stand-in for `baseDb` when `NODB` is set. Every property access throws with the accessed
 * name, so a code path that reaches the database under `NODB` names itself in the stack trace.
 * Capability probes are exempt: `prepared.ts` reads `select` to decide whether prepared
 * statements can be built, and `dbPoolPressure` reads `$client` to sample the pool.
 */
const noDbProbeKeys: ReadonlySet<string | symbol> = new Set(['select', '$client']);

const createNoDbStub = (): DB =>
  new Proxy({} as DB, {
    get(_target, property) {
      if (noDbProbeKeys.has(property)) return undefined;
      throw new Error(
        `Database access ("${String(property)}") attempted while NODB is set. This process runs without a database connection.`,
      );
    },
  });

const initConnections = (): { db: DB; migrationDb?: PgDB; adminDb?: PgDB } => {
  if (env.NODB) {
    return { db: createNoDbStub() };
  }

  return {
    db: createPgConnection(env.DATABASE_URL, env.DATABASE_POOL_MAX),
    migrationDb: createPgConnection(env.DATABASE_ADMIN_URL, 5),
    adminDb: createPgConnection(env.DATABASE_ADMIN_URL, 5),
  };
};

const connections = initConnections();

export const baseDb: DB = connections.db;

/**
 * Runtime pool pressure: waiting clients relative to pool size (0 = idle, ≥1 = queueing).
 * Feeds the sync spread window so the notification fan-out decelerates under DB load.
 */
export const dbPoolPressure = (): number => {
  // `$client` is a pg Pool or Client; only the Pool carries these counters, so both are read
  // defensively. Absent under NODB, where the client probe yields undefined.
  const client: unknown = baseDb.$client;
  if (typeof client !== 'object' || client === null) return 0;
  const { waitingCount, options } = client as { waitingCount?: unknown; options?: { max?: unknown } };
  const max = typeof options?.max === 'number' ? options.max : 0;
  if (!max || typeof waitingCount !== 'number') return 0;
  return waitingCount / max;
};
export const migrationDb: PgDB | undefined = connections.migrationDb;
export const unsafeInternalAdminDb: PgDB | undefined = connections.adminDb;

/** Admin connection for seed scripts */
export const seedDb: DB = (connections.adminDb ?? connections.db) as DB;
