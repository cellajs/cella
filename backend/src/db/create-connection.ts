import { type NodePgClient, type NodePgDatabase, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { appConfig } from 'shared';
import { stripPostgresSslParams, verifiedPostgresSsl } from 'shared/utils/postgres-tls';

// No `#/env` import and no pool opened at module load, so the cdc and yjs workers can import this.

export type PgDB = NodePgDatabase & { $client: NodePgClient };
export type DB = PgDB;

type TxOf<D extends { transaction: (...args: never[]) => unknown }> = Parameters<Parameters<D['transaction']>[0]>[0];

export type Tx = TxOf<DB>;
export type DbOrTx = DB | Tx;

interface CreatePgConnectionOptions {
  max: number;
  /** PEM CA for verified TLS; omit for plain connections (dev/test). */
  sslCa?: string;
  /** The process's parsed `DEBUG` flag. */
  debug?: boolean;
  connectionTimeoutMillis?: number;
}

/** A connection quiet this long gets TCP keepalive probes, so a dead peer or a middlebox idle timeout ends it. */
const KEEP_ALIVE_IDLE_MS = 30_000;

/**
 * A drizzle client on a pool of its own, for the API and both workers. Drizzle's query logger prints every query with
 * the values it bound (tokens, email addresses) to stdout, so `debug` turns it on in development only.
 * @param url - The connection string; its libpq TLS parameters are dropped, so `sslCa` alone decides TLS.
 * @param options - Pool size, TLS CA, the `DEBUG` flag and the connect timeout.
 * @returns The client; its pool opens a connection on the first query.
 */
export const createPgConnection = (url: string, { max, sslCa, debug = false, connectionTimeoutMillis = 10_000 }: CreatePgConnectionOptions): PgDB =>
  pgDrizzle({
    connection: {
      connectionString: stripPostgresSslParams(url),
      connectionTimeoutMillis,
      max,
      ssl: verifiedPostgresSsl(url, sslCa),
      // Long-lived pooled connections (the job lock) sit idle for minutes.
      keepAlive: true,
      keepAliveInitialDelayMillis: KEEP_ALIVE_IDLE_MS,
    },
    logger: debug && appConfig.mode === 'development',
  });
