import { type PeerCertificate, checkServerIdentity as tlsCheckServerIdentity } from 'node:tls'

export interface VerifiedPostgresSslOptions {
  ca: string
  rejectUnauthorized: true
  checkServerIdentity?: (host: string, cert: PeerCertificate) => Error | undefined
}

// Scaleway-built connection strings include libpq ssl params. node-postgres can
// let those override an explicit verified `ssl` object, so strip them before
// handing the connection string to pg.
export const stripPostgresSslParams = (url: string): string => {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete('sslmode')
    parsed.searchParams.delete('uselibpqcompat')
    return parsed.toString()
  } catch {
    return url
  }
}

const postgresHost = (connectionString: string): string | undefined => {
  try {
    return new URL(stripPostgresSslParams(connectionString)).hostname || undefined
  } catch {
    return undefined
  }
}

// node-postgres does not thread the connection host into TLS identity checking,
// so Node can verify against `localhost`. Pin verification to the host we dialed
// while keeping CA-chain verification intact.
export const verifiedPostgresSsl = (connectionString: string, ca: string | undefined): VerifiedPostgresSslOptions | undefined => {
  if (!ca) return undefined
  const host = postgresHost(connectionString)
  return {
    ca,
    rejectUnauthorized: true,
    checkServerIdentity: host ? (_passedHost, cert) => tlsCheckServerIdentity(host, cert) : undefined,
  }
}