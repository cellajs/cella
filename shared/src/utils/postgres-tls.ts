import { type PeerCertificate, checkServerIdentity as tlsCheckServerIdentity } from 'node:tls';

export interface VerifiedPostgresSslOptions {
  ca: string;
  rejectUnauthorized: true;
  checkServerIdentity?: (host: string, cert: PeerCertificate) => Error | undefined;
}

/**
 * The connection string without its libpq ssl params: Scaleway's carry them, and node-postgres may let them override an
 * explicit verified `ssl` object. An unparseable string is returned as it is.
 */
export const stripPostgresSslParams = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return url;
  }
};

/**
 * The database CA as PEM, decoded from the single-line base64 runtime secret; callers pass the raw env value. Production
 * requires the Pulumi-provisioned CA and verified TLS.
 * @returns undefined without a CA when none is required.
 * @throws Error when the CA is required and absent.
 */
export const resolvePostgresSslCa = (ca: string | undefined, required: boolean): string | undefined => {
  if (!ca) {
    if (!required) return undefined;
    throw new Error(
      'FATAL: DATABASE_SSL_CA is required in production for verified TLS to PostgreSQL. ' +
        'It is provisioned automatically by `pulumi up` (Scaleway RDB CA). Run ' +
        '`pnpm infra apply`, or check the database-ssl-ca runtime secret.',
    );
  }
  return Buffer.from(ca, 'base64').toString('utf-8');
};

const postgresHost = (connectionString: string): string | undefined => {
  try {
    return new URL(connectionString).hostname || undefined;
  } catch {
    return undefined;
  }
};

/**
 * The `ssl` option for a verified connection, or undefined without a CA. node-postgres omits the connection host from TLS
 * identity checking, so Node would verify against `localhost`: this pins verification to the dialed host and keeps
 * CA-chain verification.
 */
export const verifiedPostgresSsl = (connectionString: string, ca: string | undefined): VerifiedPostgresSslOptions | undefined => {
  if (!ca) return undefined;
  const host = postgresHost(connectionString);
  return { ca, rejectUnauthorized: true, checkServerIdentity: host ? (_passedHost, cert) => tlsCheckServerIdentity(host, cert) : undefined };
};
