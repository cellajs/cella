import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { resolvePostgresSslCa } from 'shared/utils/postgres-tls';
import { createPgConnection, type Tx } from '#/db/create-connection';
import { env } from '../env';

export type { Tx };

// Production requires the provisioned RDB CA to prevent a silent TLS downgrade.
const sslCa = resolvePostgresSslCa(env.DATABASE_SSL_CA, env.NODE_ENV === 'production' && !env.NODB);

/** The pool opens lazily on first query, so unconditional construction is safe under NODB. */
export const db = createPgConnection(env.DATABASE_URL, { max: env.YJS_DB_POOL_MAX, sslCa, logger: env.DEBUG });

/** Runs `fn` in a transaction with tenant/user RLS context: `set_config(..., true)` scopes the vars to the transaction, so pooled connections never leak context. */
export async function withRlsTx<T>(tenantId: string, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.user_id', ${userId}, true)`,
    );
    return fn(tx);
  });
}

export async function closeDb(): Promise<void> {
  // The factory always constructs a pg.Pool ($client is only narrower for other drivers).
  await (db.$client as pg.Pool).end();
}
