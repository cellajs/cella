import type { DrizzleConfig } from 'drizzle-orm';
import { type NodePgClient, type NodePgDatabase, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { stripPostgresSslParams, verifiedPostgresSsl } from 'shared/utils/postgres-tls';

// Side-effect-free connection factory: no `#/env` import and no pool opened at module
// load, so the cdc and yjs workers can import it without dragging in backend state.

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

/** Build a drizzle node-postgres client with verified TLS pinned to the dialed host. */
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
