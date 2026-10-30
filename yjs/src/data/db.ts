import process from 'node:process';
import pg from 'pg';
import { resolvePostgresSslCa, verifiedPostgresConnection } from 'shared/utils/postgres-tls';
import { createPgConnection, type Tx, transactionOpenedWith } from '#/db/create-connection';
import { tenantTransactionOpening } from '#/db/tenant-transaction-opening';
import { env } from '../env';

// Production requires the provisioned RDB CA, so the TLS connection is always verified.
const sslCa = resolvePostgresSslCa(env.DATABASE_SSL_CA, env.NODE_ENV === 'production' && !env.NODB);

/** The pool opens lazily on first query, so unconditional construction is safe under NODB. */
export const db = createPgConnection(env.DATABASE_URL, { name: 'yjs', max: env.YJS_DB_POOL_MAX, sslCa, debug: env.DEBUG });

/** What a relay transaction may read beyond live rows: `includeDeleted` lets RLS show soft-deleted rows too. */
interface RlsOptions {
  includeDeleted?: boolean;
}

/**
 * Runs `fn` in a transaction that opens with the tenant/user RLS context, as the API's tenant transactions do: set
 * transaction-local, so pooled connections never leak context.
 * @throws An id outside the id alphabet, before a connection is taken.
 */
export async function withRlsTx<T>(
  tenantId: string,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
  { includeDeleted = false }: RlsOptions = {},
): Promise<T> {
  return transactionOpenedWith(db, tenantTransactionOpening({ tenantId, userId, includeDeleted }, false), fn);
}

/** The name the log listener's connection carries in `pg_stat_activity`: one per relay process. */
export const listenerApplicationName = `yjs-log-listener:${process.pid}`;

/**
 * One connection outside the pool, on the pool's URL and TLS, for the log listener: LISTEN belongs to a session, and a
 * pooled connection goes back to the pool. TCP keepalive ends it when the peer or a middlebox drops it while idle.
 */
export function createListenerClient(): pg.Client {
  return new pg.Client({
    ...verifiedPostgresConnection(env.DATABASE_URL, sslCa),
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 30_000,
    application_name: listenerApplicationName,
  });
}

/** Ends the pool once its connections are released: the last step of the relay's shutdown. */
export async function closeDb(): Promise<void> {
  await db.$client.end();
}
