import pg from 'pg';
import { env } from '../env';

// Scaleway private DB endpoints use self-signed certificates.
const sslConfig = env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined;

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
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
