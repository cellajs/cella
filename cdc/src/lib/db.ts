import { resolvePostgresSslCa, verifiedPostgresSsl } from 'shared/utils/postgres-tls';
import { createPgConnection, type DB } from '#/db/create-connection';
import { resourceLimits } from '../constants';
import { env } from '../env';

// Production requires the Pulumi-provisioned database CA and verified TLS.
const sslCa = resolvePostgresSslCa(env.DATABASE_SSL_CA, env.NODE_ENV === 'production');

export const buildVerifiedSsl = (connectionString: string) => verifiedPostgresSsl(connectionString, sslCa);

/** What a statement runs through: the worker's pool or one of its transactions. Only `execute`, so a test can pass a stand-in. */
export type Executor = Pick<DB, 'execute'>;

/**
 * DATABASE_CDC_URL uses admin_role because Scaleway grants the REPLICATION attribute, required to
 * open a logical replication slot, to admin users only. Append-only behaviour on the activities table
 * comes from the immutability triggers, not from role privileges.
 */
export const cdcDb: DB = createPgConnection(env.DATABASE_CDC_URL, {
  max: 10,
  sslCa,
  debug: env.DEBUG,
  // A flush locks the product rows it stamps. Postgres ends a session of this pool that waits, runs or sits in a
  // transaction for too long, so a worker that hangs or is cut off cannot keep those rows from the API.
  sessionTimeouts: resourceLimits.database,
});
