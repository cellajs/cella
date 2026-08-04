/**
 * Rewrite a break-glass public DSN for verified TLS: `sslmode=verify-full`
 * with the instance CA pinned via `sslrootcert`, so an on-path attacker during
 * an exposure window cannot MITM admin-role traffic. Drops `uselibpqcompat`
 * (a node-postgres compat flag libpq rejects as an unknown parameter). Only
 * the query string is touched: the userinfo may carry percent-encoded
 * credentials that a full URL round-trip would re-encode.
 */
export function hardenPublicDsn(dsn: string, caFilePath: string): string {
  const [base, query = ''] = dsn.split('?');
  const params = new URLSearchParams(query);
  params.set('sslmode', 'verify-full');
  params.set('sslrootcert', caFilePath);
  params.delete('uselibpqcompat');
  return `${base}?${params.toString()}`;
}
