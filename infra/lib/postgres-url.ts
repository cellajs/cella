/**
 * Assemble a PostgreSQL DSN from plain string parts. User and password are percent-encoded so neither can break out of the userinfo segment.
 * Always pins `sslmode=require&uselibpqcompat=true`: Scaleway private endpoints use self-signed certs, so libpq-compat mode encrypts without cert verification.
 */
export function formatPostgresUrl(user: string, pass: string, host: string, port: number | string, database: string): string {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${database}?sslmode=require&uselibpqcompat=true`;
}
