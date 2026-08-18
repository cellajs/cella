import type { DrizzleConfig } from 'drizzle-orm';
import { type NodePgClient, type NodePgDatabase, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
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
  logger?: DrizzleConfig['logger'];
  connectionTimeoutMillis?: number;
}

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
    },
    logger,
  });
