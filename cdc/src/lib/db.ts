import { type DrizzleConfig } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env';

/**
 * Database configuration for CDC Worker.
 */
const dbConfig: DrizzleConfig = {
  logger: env.DEBUG,
};

// In production we require a verified TLS connection to the managed PostgreSQL.
// The CA (Scaleway RDB instance cert) is provisioned automatically into the
// DATABASE_SSL_CA runtime secret by `pulumi up`; a missing value is a
// misconfiguration we fail fast on rather than silently downgrading security.
const sslConfig =
  env.NODE_ENV === 'production'
    ? (() => {
        if (!env.DATABASE_SSL_CA) {
          throw new Error(
            'FATAL: DATABASE_SSL_CA is required in production for verified TLS to PostgreSQL. ' +
              'It is provisioned automatically by `pulumi up` (Scaleway RDB CA). Run the infra ' +
              "CLI → 'Apply infra change', or check the database-ssl-ca runtime secret.",
          );
        }
        return { ca: env.DATABASE_SSL_CA, rejectUnauthorized: true };
      })()
    : undefined;

// Scaleway-built connection strings pin `sslmode=require&uselibpqcompat=true`,
// which pg would let override the verified `ssl` config above. Strip those
// params so our CA-pinned config wins.
const connectionString = (() => {
  try {
    const parsed = new URL(env.DATABASE_CDC_URL);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return env.DATABASE_CDC_URL;
  }
})();

/**
 * CDC database client.
 *
 * Connects via DATABASE_CDC_URL, which uses admin_role: Scaleway only grants the
 * REPLICATION attribute (required to open a logical replication slot) to admin
 * users, so the worker cannot run under a lesser role. Append-only behaviour on
 * the activities table is enforced by the immutability triggers, not by role
 * privileges.
 */
export const cdcDb = drizzle({
  connection: { connectionString, connectionTimeoutMillis: 10_000, max: 20, ssl: sslConfig },
  ...dbConfig,
});
