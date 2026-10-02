import { type NodePgClient, type NodePgDatabase, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { appConfig } from 'shared';
import { stripPostgresSslParams, verifiedPostgresSsl } from 'shared/utils/postgres-tls';

// No `#/env` import and no pool opened at module load, so the cdc and yjs workers can import this.

export type PgDB = NodePgDatabase & { $client: NodePgClient };
export type DB = PgDB;

type TxOf<D extends { transaction: (...args: never[]) => unknown }> = Parameters<Parameters<D['transaction']>[0]>[0];

export type Tx = TxOf<DB>;
export type DbOrTx = DB | Tx;

/** Server-side `lock_timeout` and `statement_timeout` for every session of a pool, in milliseconds. */
export interface SessionTimeouts {
  lockMs: number;
  statementMs: number;
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
const KEEP_ALIVE_IDLE_MS = 30_000;

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
): PgDB =>
  pgDrizzle({
    connection: {
      connectionString: stripPostgresSslParams(url),
      connectionTimeoutMillis,
      max,
      ssl: verifiedPostgresSsl(url, sslCa),
      // Long-lived pooled connections (the job lock) sit idle for minutes.
      keepAlive: true,
      keepAliveInitialDelayMillis: KEEP_ALIVE_IDLE_MS,
      // Sent as startup parameters, so the server enforces them even after the client is gone.
      ...(sessionTimeouts ? { lock_timeout: sessionTimeouts.lockMs, statement_timeout: sessionTimeouts.statementMs } : {}),
    },
    logger: debug && appConfig.mode === 'development',
  });
