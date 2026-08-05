import type { DrizzleConfig } from 'drizzle-orm';
import { resolvePostgresSslCa } from 'shared/utils/postgres-tls';
import { env } from '../env';
import { createPgConnection, type DB, type PgDB } from './create-connection';

export type { DB, DbOrTx, PgDB, Tx } from './create-connection';

export const dbConfig = {
  logger: !!env.DEBUG,
} satisfies DrizzleConfig;

export const migrateConfig = { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' };

// In production we require a verified TLS connection to the managed PostgreSQL.
const sslCa = resolvePostgresSslCa(env.DATABASE_SSL_CA, env.NODE_ENV === 'production' && !env.NODB);

const connect = (connectionString: string, max: number): PgDB =>
  createPgConnection(connectionString, { max, sslCa, logger: dbConfig.logger });

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
    db: connect(env.DATABASE_URL, env.DATABASE_POOL_MAX),
    migrationDb: connect(env.DATABASE_ADMIN_URL, 5),
    adminDb: connect(env.DATABASE_ADMIN_URL, 5),
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
