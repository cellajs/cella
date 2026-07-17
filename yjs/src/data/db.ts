import pg from 'pg';
import { env } from '../env';

// In production we require a verified TLS connection to the managed PostgreSQL.
// The CA (Scaleway RDB instance cert) is provisioned automatically into the
// DATABASE_SSL_CA runtime secret by `pulumi up`; a missing value is a
// misconfiguration causes an immediate failure to prevent a silent security downgrade.
// The secret is base64-encoded (the PEM is multi-line and would break the
// line-based `.env.runtime` delivery), so decode it back to PEM here.
const sslConfig =
  env.NODE_ENV === 'production' && !env.NODB
    ? (() => {
        if (!env.DATABASE_SSL_CA) {
          throw new Error(
            'FATAL: DATABASE_SSL_CA is required in production for verified TLS to PostgreSQL. ' +
              'It is provisioned automatically by `pulumi up` (Scaleway RDB CA). Run the infra ' +
              "CLI → 'Apply infra change', or check the database-ssl-ca runtime secret.",
          );
        }
        return { ca: Buffer.from(env.DATABASE_SSL_CA, 'base64').toString('utf-8'), rejectUnauthorized: true };
      })()
    : undefined;

// Scaleway-built connection strings pin `sslmode=require&uselibpqcompat=true`,
// which pg would let override the verified `ssl` config above. Strip those
// params so our CA-pinned config wins.
const connectionString = (() => {
  try {
    const parsed = new URL(env.DATABASE_URL);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return env.DATABASE_URL;
  }
})();

export const pool = new pg.Pool({
  connectionString,
  max: env.YJS_DB_POOL_MAX,
  ssl: sslConfig,
});

/** Set RLS session context on a client connection */
async function setSessionContext(client: pg.PoolClient, tenantId: string, userId: string) {
  await client.query(
    "SELECT set_config('app.tenant_id', $1, false), set_config('app.user_id', $2, false)",
    [tenantId, userId],
  );
}

/** Acquire a pooled client with RLS context, execute `fn`, then release. */
export async function withClient<T>(tenantId: string, userId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await setSessionContext(client, tenantId, userId);
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
