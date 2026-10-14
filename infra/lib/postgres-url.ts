/**
 * Assemble a PostgreSQL DSN from plain string parts. User and password are percent-encoded so neither can break out of the userinfo segment.
 * Always pins `sslmode=require&uselibpqcompat=true`: Scaleway private endpoints use self-signed certs, so libpq-compat mode encrypts without cert verification.
 */
export function formatPostgresUrl(user: string, pass: string, host: string, port: number | string, database: string): string {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${database}?sslmode=require&uselibpqcompat=true`;
}

/** The password a connection string carries, decoded; undefined for anything that is no PostgreSQL URL with one. */
export function passwordOfPostgresUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith('postgres')) return undefined;
    return parsed.password ? decodeURIComponent(parsed.password) : undefined;
  } catch {
    return undefined;
  }
}
