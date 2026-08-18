import { type PeerCertificate, checkServerIdentity as tlsCheckServerIdentity } from 'node:tls';

export interface VerifiedPostgresSslOptions {
  ca: string;
  rejectUnauthorized: true;
  checkServerIdentity?: (host: string, cert: PeerCertificate) => Error | undefined;
}

// Scaleway connection strings carry libpq ssl params that node-postgres may let override an
// explicit verified `ssl` object, so strip them before handing the string to pg.
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

// Production requires the Pulumi-provisioned database CA and verified TLS. Decodes the
// single-line base64 runtime secret back to PEM; callers pass the raw env value.
export const resolvePostgresSslCa = (ca: string | undefined, required: boolean): string | undefined => {
  if (!ca) {
    if (!required) return undefined;
    throw new Error(
      'FATAL: DATABASE_SSL_CA is required in production for verified TLS to PostgreSQL. ' +
        'It is provisioned automatically by `pulumi up` (Scaleway RDB CA). Run the infra ' +
        "CLI → 'Apply infra change', or check the database-ssl-ca runtime secret.",
    );
  }
  return Buffer.from(ca, 'base64').toString('utf-8');
};

const postgresHost = (connectionString: string): string | undefined => {
  try {
    return new URL(stripPostgresSslParams(connectionString)).hostname || undefined;
  } catch {
    return undefined;
  }
};

// node-postgres omits the connection host from TLS identity checking, so Node would verify
// against `localhost`. Pins verification to the dialed host, keeping CA-chain verification.
export const verifiedPostgresSsl = (
  connectionString: string,
  ca: string | undefined,
): VerifiedPostgresSslOptions | undefined => {
  if (!ca) return undefined;
  const host = postgresHost(connectionString);
  return {
    ca,
    rejectUnauthorized: true,
    checkServerIdentity: host ? (_passedHost, cert) => tlsCheckServerIdentity(host, cert) : undefined,
  };
};
