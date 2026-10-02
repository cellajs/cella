import process from 'node:process';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { resolvePostgresSslCa, stripPostgresSslParams, verifiedPostgresSsl } from 'shared/utils/postgres-tls';
import { createPgConnection, type Tx } from '#/db/create-connection';
import { env } from '../env';

export type { Tx };

// Production requires the provisioned RDB CA to prevent a silent TLS downgrade.
const sslCa = resolvePostgresSslCa(env.DATABASE_SSL_CA, env.NODE_ENV === 'production' && !env.NODB);

/** The pool opens lazily on first query, so unconditional construction is safe under NODB. */
export const db = createPgConnection(env.DATABASE_URL, { max: env.YJS_DB_POOL_MAX, sslCa, debug: env.DEBUG });

/** What a relay transaction may read beyond live rows: `includeDeleted` lets RLS show soft-deleted rows too. */
interface RlsOptions {
  includeDeleted?: boolean;
}

/** Runs `fn` in a transaction with tenant/user RLS context: `set_config(..., true)` scopes the vars to the transaction, so pooled connections never leak context. */
export async function withRlsTx<T>(
  tenantId: string,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
  { includeDeleted = false }: RlsOptions = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.user_id', ${userId}, true), set_config('app.include_deleted', ${includeDeleted ? 'true' : 'false'}, true)`,
    );
    return fn(tx);
  });
}

/** The name the log listener's connection carries in `pg_stat_activity`: one per relay process. */
export const listenerApplicationName = `yjs-log-listener:${process.pid}`;

/**
 * One connection outside the pool, on the pool's URL and TLS, for the log listener: LISTEN belongs to a session, and a
 * pooled connection goes back to the pool. TCP keepalive ends it when the peer or a middlebox drops it while idle.
 */
export function createListenerClient(): pg.Client {
  return new pg.Client({
    connectionString: stripPostgresSslParams(env.DATABASE_URL),
    ssl: verifiedPostgresSsl(env.DATABASE_URL, sslCa),
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 30_000,
    application_name: listenerApplicationName,
  });
}

export async function closeDb(): Promise<void> {
  // The factory always constructs a pg.Pool ($client is only narrower for other drivers).
  await (db.$client as pg.Pool).end();
}
