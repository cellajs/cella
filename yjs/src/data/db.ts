import pg from 'pg';
import { stripPostgresSslParams, verifiedPostgresSsl } from 'shared/utils/postgres-tls';
import { env } from '../env';

// Production requires the provisioned RDB CA to prevent a silent TLS downgrade.
// Decode its base64 form after line-based runtime-secret delivery.
const sslCa =
  env.NODE_ENV === 'production' && !env.NODB
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

  // Pin certificate identity to the dialed host and strip URL SSL options that override the CA.
  // Backend and CDC use the same helpers.
export const pool = new pg.Pool({
  connectionString: stripPostgresSslParams(env.DATABASE_URL),
  max: env.YJS_DB_POOL_MAX,
  ssl: verifiedPostgresSsl(env.DATABASE_URL, sslCa),
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
