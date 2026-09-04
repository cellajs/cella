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

/** The runtime pool (RLS-subject `runtime_role`): every request handler and worker query goes through this. */
export const baseDb: DB = env.NODB ? createNoDbStub() : connect(env.DATABASE_URL, env.DATABASE_POOL_MAX);

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

let adminConnection: PgDB | undefined;

/** True when this process was handed the admin credential (migrate, seed and maintenance paths). */
export const hasAdminDb = (): boolean => !env.NODB && !!env.DATABASE_ADMIN_URL;

/**
 * The admin pool (table owner, BYPASSRLS), opened on first use and never at import. The API
 * serves without `DATABASE_ADMIN_URL` when it owns neither migrations nor in-process jobs, and a
 * request handler cannot reach an RLS-bypassing connection in a process that was never given one.
 * @param purpose - Names the caller in the error thrown when the credential is absent.
 */
export const getAdminDb = (purpose: string): PgDB => {
  if (env.NODB) throw new Error(`Admin database access (${purpose}) attempted while NODB is set.`);
  if (!env.DATABASE_ADMIN_URL) throw new Error(`DATABASE_ADMIN_URL is required for ${purpose}`);
  adminConnection ??= connect(env.DATABASE_ADMIN_URL, 5);
  return adminConnection;
};

/** Seeds write as admin so RLS never hides what they insert; the same lazy pool as {@link getAdminDb}. */
export const getSeedDb = (): DB => getAdminDb('seeds') as DB;
