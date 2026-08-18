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

/** Probes exempt from the NODB throw: `prepared.ts` reads `select`, `dbPoolPressure` reads `$client`. */
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

/** Waiting clients relative to pool size (0 = idle, 1 or more = queueing). Feeds the sync spread window. */
export const dbPoolPressure = (): number => {
  // Only a pg Pool carries these counters; a Client or the NODB probe yields undefined.
  const client: unknown = baseDb.$client;
  if (typeof client !== 'object' || client === null) return 0;
  const { waitingCount, options } = client as { waitingCount?: unknown; options?: { max?: unknown } };
  const max = typeof options?.max === 'number' ? options.max : 0;
  if (!max || typeof waitingCount !== 'number') return 0;
  return waitingCount / max;
};
export const migrationDb: PgDB | undefined = connections.migrationDb;
export const unsafeInternalAdminDb: PgDB | undefined = connections.adminDb;

export const seedDb: DB = (connections.adminDb ?? connections.db) as DB;
