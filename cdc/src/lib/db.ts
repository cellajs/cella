import { resolvePostgresSslCa, stripPostgresSslParams, verifiedPostgresSsl } from 'shared/utils/postgres-tls';
import { createPgConnection, type PgDB } from '#/db/create-connection';
import { env } from '../env';

// Production requires the Pulumi-provisioned database CA and verified TLS.
const sslCa = resolvePostgresSslCa(env.DATABASE_SSL_CA, env.NODE_ENV === 'production');

export const stripSslParams = stripPostgresSslParams;
export const buildVerifiedSsl = (connectionString: string) => verifiedPostgresSsl(connectionString, sslCa);

/**
 * CDC database client.
 *
 * Connects via DATABASE_CDC_URL, which uses admin_role: Scaleway only grants the
 * REPLICATION attribute (required to open a logical replication slot) to admin
 * users, so the worker cannot run under a lesser role. Append-only behaviour on
 * the activities table is enforced by the immutability triggers, not by role
 * privileges.
 */
export const cdcDb: PgDB = createPgConnection(env.DATABASE_CDC_URL, { max: 20, sslCa, logger: env.DEBUG });
