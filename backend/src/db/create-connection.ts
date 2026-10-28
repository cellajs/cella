import { DefaultLogger, type Logger } from 'drizzle-orm';
import {
  type NodePgClient,
  type NodePgDatabase,
  NodePgSession,
  NodePgTransaction,
  nodePgCodecs,
  drizzle as pgDrizzle,
} from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
import { appConfig } from 'shared';
import { verifiedPostgresConnection } from 'shared/utils/postgres-tls';

// No `#/env` import and no pool opened at module load, so the cdc and yjs workers can import this.

/** A drizzle client on a node-postgres pool, as `createPgConnection` returns it. */
export type DB = NodePgDatabase & { $client: NodePgClient };

type TxOf<D extends { transaction: (...args: never[]) => unknown }> = Parameters<Parameters<D['transaction']>[0]>[0];

/** A transaction of a `DB`, as its `transaction()` callback receives it. */
export type Tx = TxOf<DB>;
/** What a query runs on: a client or a transaction. */
export type DbOrTx = DB | Tx;

/** Server-side `lock_timeout` and `statement_timeout` for every session of a pool, in milliseconds. */
export interface SessionTimeouts {
  lockMs: number;
  statementMs: number;
  /** `idle_in_transaction_session_timeout`: ends a session that holds a transaction, and its locks, without a statement. Absent = no limit. */
  idleInTransactionMs?: number;
}

interface CreatePgConnectionOptions {
  max: number;
  /** PEM CA for verified TLS; omit for plain connections (dev/test). */
  sslCa?: string;
  /** The process's parsed `DEBUG` flag. */
  debug?: boolean;
  connectionTimeoutMillis?: number;
  /** Absent = the server defaults (no limit). */
  sessionTimeouts?: SessionTimeouts;
}

/** A connection quiet this long gets TCP keepalive probes, so a dead peer or a middlebox idle timeout ends it. */
const keepAliveIdleMs = 30_000;

/** The dialect drizzle builds for a node-postgres client given neither `jit` nor `codecs`, as every client here is. */
const dialect = new PgDialect({ codecs: nodePgCodecs });

/** The query logger of each client that has one, so a transaction opened on its pool logs alike. */
const queryLoggers = new WeakMap<DB, Logger>();

/**
 * A drizzle client on a pool of its own, for the API and both workers. Drizzle's query logger prints every query with
 * the values it bound (tokens, email addresses) to stdout, so `debug` turns it on in development only.
 * @param url - The connection string; its libpq TLS parameters are dropped, so `sslCa` alone decides TLS.
 * @param options - Pool size, TLS CA, the `DEBUG` flag, the connect timeout and the server-side session timeouts.
 * @returns The client; its pool opens a connection on the first query.
 */
export const createPgConnection = (
  url: string,
  { max, sslCa, debug = false, connectionTimeoutMillis = 10_000, sessionTimeouts }: CreatePgConnectionOptions,
): DB => {
  const logger = debug && appConfig.mode === 'development' ? new DefaultLogger() : undefined;
  const db = pgDrizzle({
    connection: {
      ...verifiedPostgresConnection(url, sslCa),
      connectionTimeoutMillis,
      max,
      // Long-lived pooled connections (the job lock) sit idle for minutes.
      keepAlive: true,
      keepAliveInitialDelayMillis: keepAliveIdleMs,
      // Every session runs in UTC: zone-less columns (the partition keys) and a migration's casts read as UTC wherever the server runs.
      options: '-c TimeZone=UTC',
      // Sent as startup parameters, so the server enforces them even after the client is gone.
      ...(sessionTimeouts ? { lock_timeout: sessionTimeouts.lockMs, statement_timeout: sessionTimeouts.statementMs } : {}),
      ...(sessionTimeouts?.idleInTransactionMs ? { idle_in_transaction_session_timeout: sessionTimeouts.idleInTransactionMs } : {}),
    },
    logger,
  });
  if (logger) queryLoggers.set(db, logger);
  return db;
};

/** Only a pg Pool counts its clients and hands out a connection of its own; the NODB stub yields undefined. */
export const isPool = (client: unknown): client is Pool => typeof client === 'object' && client !== null && 'totalCount' in client;

/**
 * Runs `fn` in a transaction on a connection of its own from the client's pool, started by `opening`: BEGIN and the
 * statements that must precede the rest, sent as one simple-protocol message, so they cost one round trip where
 * drizzle's `transaction()` spends one on BEGIN alone. Otherwise it behaves like drizzle's: a nested `transaction()` is
 * a savepoint, a failure rolls back, and a connection that failed is destroyed, never returned to the pool.
 * @param opening - Text with no bound parameters: every value in it is already escaped.
 * @throws When the client has no pool, or whatever the opening or `fn` throws.
 */
export async function transactionOpenedWith<T>(db: DB, opening: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const pool = db.$client;
  if (!isPool(pool)) throw new Error('A transaction opened in one round trip needs a pg pool');
  const client = await pool.connect();
  let broken: Error | undefined;
  const onError = (error: Error) => {
    broken ??= error;
  };
  client.on('error', onError);
  try {
    await client.query(opening);
  } catch (error) {
    // BEGIN may have run before the statement that failed: destroying the connection ends what it started.
    client.off('error', onError);
    client.release(true);
    throw error;
  }
  const tx: Tx = new NodePgTransaction(dialect, new NodePgSession(client, dialect, {}, { logger: queryLoggers.get(db) }), {}, undefined, false);
  try {
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (!broken) {
      await client.query('ROLLBACK').catch((rollbackError: Error) => {
        broken = rollbackError;
      });
    }
    throw error;
  } finally {
    if (!broken) client.off('error', onError);
    client.release(broken);
  }
}
