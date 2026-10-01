import type { Pool, PoolClient } from 'pg';
import { resolvePostgresSslCa } from 'shared/utils/postgres-tls';
import { env } from '../env';
import { createPgConnection, type DB, type PgDB } from './create-connection';

export type { DB, DbOrTx, PgDB, Tx } from './create-connection';

export const migrateConfig = { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' };

// In production we require a verified TLS connection to the managed PostgreSQL.
const sslCa = resolvePostgresSslCa(env.DATABASE_SSL_CA, env.NODE_ENV === 'production' && !env.NODB);

const connect = (connectionString: string, max: number): PgDB => createPgConnection(connectionString, { max, sslCa, debug: env.DEBUG });

/** Probes exempt from the NODB throw: `prepared.ts` reads `select`, the pool probe reads `$client`. */
const noDbProbeKeys: ReadonlySet<string | symbol> = new Set(['select', '$client']);

const createNoDbStub = (): DB =>
  new Proxy({} as DB, {
    get(_target, property) {
      if (noDbProbeKeys.has(property)) return undefined;
      throw new Error(`Database access ("${String(property)}") attempted while NODB is set. This process runs without a database connection.`);
    },
  });

/** The runtime pool (RLS-subject `runtime_role`): every request handler and worker query goes through this. */
export const baseDb: DB = env.NODB ? createNoDbStub() : connect(env.DATABASE_URL, env.DATABASE_POOL_MAX);

/** Only a pg Pool counts its clients and hands out a connection of its own; the NODB probe yields undefined. */
const isPool = (client: unknown): client is Pool => typeof client === 'object' && client !== null && 'totalCount' in client;

/** Waiting clients relative to pool size (0 = idle, 1 or more = queueing). Feeds the sync spread window. */
export const dbPoolPressure = (): number => {
  const client: unknown = baseDb.$client;
  if (!isPool(client)) return 0;
  const max = client.options.max;
  return max ? client.waitingCount / max : 0;
};

/**
 * A connection of its own from the runtime pool, for a session that outlives one query, such as a transaction driven
 * statement by statement. The caller ends it with `release(true)`, which destroys it, so no session state goes back to
 * the pool.
 * @param onError - Attached before the connection is handed out: a checked-out client has no error listener, and an
 *   unhandled one ends the process.
 * @returns The checked-out client.
 */
export const openDedicatedConnection = async (onError: (error: Error) => void): Promise<PoolClient> => {
  const pool: unknown = baseDb.$client;
  if (!isPool(pool)) throw new Error('A dedicated database connection needs the runtime pg pool');
  const client = await pool.connect();
  client.on('error', onError);
  return client;
};

let adminConnection: PgDB | undefined;

/** True when this process was handed the admin credential (migrate, seed and maintenance paths). */
export const hasAdminDb = (): boolean => !env.NODB && !!env.DATABASE_ADMIN_URL;

/**
 * The admin pool (table owner, BYPASSRLS), opened on first use and never at import. The API
 * serves without `DATABASE_ADMIN_URL` when it owns neither migrations nor in-process jobs, and a
 * request handler cannot reach an RLS-bypassing connection in a process that was never given one.
 * Call it where the connection is used: at module scope it throws or opens the pool at import.
 * @param purpose - Names the caller in the error thrown when the credential is absent.
 */
export const getAdminDb = (purpose: string): PgDB => {
  if (env.NODB) throw new Error(`Admin database access (${purpose}) attempted while NODB is set.`);
  if (!env.DATABASE_ADMIN_URL) throw new Error(`DATABASE_ADMIN_URL is required for ${purpose}`);
  adminConnection ??= connect(env.DATABASE_ADMIN_URL, 5);
  return adminConnection;
};

/**
 * A one-connection admin pool on another database of the same cluster, for the pg_cron home database
 * that holds the partition maintenance job. The caller ends it.
 * @param database - Database name replacing the one in `DATABASE_ADMIN_URL`.
 */
export const getAdminDbFor = (database: string): PgDB => {
  if (!env.DATABASE_ADMIN_URL) throw new Error(`DATABASE_ADMIN_URL is required to reach database ${database}`);
  const url = new URL(env.DATABASE_ADMIN_URL);
  url.pathname = `/${database}`;
  return connect(url.toString(), 1);
};

/** Seeds write as admin so RLS never hides what they insert; the same lazy pool as {@link getAdminDb}. */
export const getSeedDb = (): DB => getAdminDb('seeds') as DB;
