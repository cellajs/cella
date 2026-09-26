import type { DrizzleConfig } from 'drizzle-orm';
import { type NodePgClient, type NodePgDatabase, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import type { ConfigMode } from 'shared';
import { stripPostgresSslParams, verifiedPostgresSsl } from 'shared/utils/postgres-tls';

// No `#/env` import and no pool opened at module load, so the cdc and yjs workers can import this.

/**
 * Drizzle's query logger prints every query with the values it bound (tokens, email addresses) to stdout, so `DEBUG`
 * turns it on in development only, for the API and both workers.
 * @param debug - The parsed `DEBUG` flag.
 * @param mode - The app mode.
 */
export const queryLoggerEnabled = (debug: boolean, mode: ConfigMode) => debug && mode === 'development';

export type PgDB = NodePgDatabase & { $client: NodePgClient };
export type DB = PgDB;

type TxOf<D extends { transaction: (...args: never[]) => unknown }> = Parameters<Parameters<D['transaction']>[0]>[0];

export type Tx = TxOf<DB>;
export type DbOrTx = DB | Tx;

interface CreatePgConnectionOptions {
  max: number;
  /** PEM CA for verified TLS; omit for plain connections (dev/test). */
  sslCa?: string;
  logger?: DrizzleConfig['logger'];
  connectionTimeoutMillis?: number;
}

/** A connection quiet this long gets TCP keepalive probes, so a dead peer or a middlebox idle timeout ends it. */
const KEEP_ALIVE_IDLE_MS = 30_000;

export const createPgConnection = (
  url: string,
  { max, sslCa, logger = false, connectionTimeoutMillis = 10_000 }: CreatePgConnectionOptions,
): PgDB =>
  pgDrizzle({
    connection: {
      connectionString: stripPostgresSslParams(url),
      connectionTimeoutMillis,
      max,
      ssl: verifiedPostgresSsl(url, sslCa),
      // Long-lived pooled connections (the auth invalidation LISTEN, the job lock) sit idle for minutes.
      keepAlive: true,
      keepAliveInitialDelayMillis: KEEP_ALIVE_IDLE_MS,
    },
    logger,
  });
