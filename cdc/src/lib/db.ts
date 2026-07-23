import { type DrizzleConfig } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { stripPostgresSslParams, verifiedPostgresSsl } from 'shared/utils/postgres-tls';
import type { PgDB } from '#/db/db';
import { env } from '../env';

const dbConfig: DrizzleConfig = {
  logger: env.DEBUG,
};

// Production requires the Pulumi-provisioned database CA and verified TLS.
// Decode its single-line base64 runtime-secret representation back to PEM.
const sslCa =
  env.NODE_ENV === 'production'
    ? (() => {
        if (!env.DATABASE_SSL_CA) {
          throw new Error(
            'FATAL: DATABASE_SSL_CA is required in production for verified TLS to PostgreSQL. ' +
              'It is provisioned automatically by `pulumi up` (Scaleway RDB CA). Run the infra ' +
              "CLI → 'Apply infra change', or check the database-ssl-ca runtime secret.",
          );
        }
        return Buffer.from(env.DATABASE_SSL_CA, 'base64').toString('utf-8');
      })()
    : undefined;

export const stripSslParams = stripPostgresSslParams;
export const buildVerifiedSsl = (connectionString: string) => verifiedPostgresSsl(connectionString, sslCa);

const connectionString = stripPostgresSslParams(env.DATABASE_CDC_URL);

/**
 * CDC database client.
 *
 * Connects via DATABASE_CDC_URL, which uses admin_role: Scaleway only grants the
 * REPLICATION attribute (required to open a logical replication slot) to admin
 * users, so the worker cannot run under a lesser role. Append-only behaviour on
 * the activities table is enforced by the immutability triggers, not by role
 * privileges.
 */
export const cdcDb: PgDB = drizzle({
  connection: { connectionString, connectionTimeoutMillis: 10_000, max: 20, ssl: buildVerifiedSsl(env.DATABASE_CDC_URL) },
  ...dbConfig,
});
