import { type DrizzleConfig } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { type PeerCertificate, checkServerIdentity as tlsCheckServerIdentity } from 'node:tls';
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
// The secret is base64-encoded (the PEM is multi-line and would break the
// line-based `.env.runtime` delivery), so decode it back to PEM here.
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

// Scaleway-built connection strings pin `sslmode=require&uselibpqcompat=true`,
// which pg would let override the verified `ssl` config below (downgrading to
// no certificate verification). Strip those params so our CA-pinned config wins.
export const stripSslParams = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return url;
  }
};

/** Parse the host (private IP or DNS name) from a postgres connection string. */
const hostOf = (connectionString: string): string | undefined => {
  try {
    return new URL(stripSslParams(connectionString)).hostname || undefined;
  } catch {
    return undefined;
  }
};

/**
 * Build the verified-TLS `ssl` option for one connection. We pin the CA and keep
 * `rejectUnauthorized` so the chain is fully verified. The Scaleway RDB cert
 * carries proper SANs (e.g. `DNS:10.0.0.2, IP Address:10.0.0.2`), so the only
 * problem is WHICH host the identity check runs against: node-postgres does not
 * thread the connection host into the TLS layer, so the check defaults to
 * `localhost` and fails (ERR_TLS_CERT_ALTNAME_INVALID) even though the cert
 * legitimately covers the host we dialed. Pin the identity check to that actual
 * host so the cert's real SANs are honored (chain still verified against the CA).
 * Returns `undefined` outside production, where TLS is not required.
 */
export const buildVerifiedSsl = (connectionString: string) => {
  if (!sslCa) return undefined;
  const host = hostOf(connectionString);
  return {
    ca: sslCa,
    rejectUnauthorized: true,
    checkServerIdentity: host ? (_passedHost: string, cert: PeerCertificate) => tlsCheckServerIdentity(host, cert) : undefined,
  };
};

const connectionString = stripSslParams(env.DATABASE_CDC_URL);

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
  connection: { connectionString, connectionTimeoutMillis: 10_000, max: 20, ssl: buildVerifiedSsl(env.DATABASE_CDC_URL) },
  ...dbConfig,
});
