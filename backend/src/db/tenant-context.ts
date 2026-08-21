import { sql } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import type { DbOrTx, Tx } from './db';
import { baseDb } from './db';

/** Sets the session variables the RLS policies read: tenant id, user id, include_deleted. */
async function setSessionVars(tx: Tx, tenantId: string, userId: string, includeDeleted: boolean): Promise<void> {
  await tx.execute(sql`
    SELECT set_config('app.tenant_id', ${tenantId}, true),
           set_config('app.user_id', ${userId}, true),
           set_config('app.include_deleted', ${includeDeleted ? 'true' : 'false'}, true)
  `);
}

async function setTenantSessionVars(tx: Tx, ctx: AuthContext, includeDeleted: boolean): Promise<void> {
  await setSessionVars(tx, ctx.var.tenantId, ctx.var.userId, includeDeleted);
}

/**
 * Read-only RLS transaction for code with no request behind it, such as a CDC listener or a
 * scheduled job. Keeps the RLS session-variable contract in this file, so a policy that starts
 * reading a new `app.*` variable needs no change in background callers.
 *
 * `app.user_id` is set empty: product read policies are tenant-scoped, and any per-user rule must
 * be applied explicitly by the caller.
 */
export async function tenantReadById<T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return baseDb.transaction(
    async (tx) => {
      await setSessionVars(tx, tenantId, '', false);
      return fn(tx);
    },
    { accessMode: 'read only' },
  );
}

/** Read-only tenant RLS transaction for normal product queries. */
export async function tenantRead<T>(ctx: AuthContext, fn: (readCtx: AuthContext) => Promise<T>): Promise<T> {
  // Fold READ ONLY into BEGIN, saving one DB round trip per read.
  return baseDb.transaction(
    async (tx) => {
      await setTenantSessionVars(tx, ctx, false);
      return fn({ var: { ...ctx.var, db: tx } });
    },
    { accessMode: 'read only' },
  );
}

export async function tenantReadIncludingDeleted<T>(
  ctx: AuthContext,
  fn: (readCtx: AuthContext) => Promise<T>,
): Promise<T> {
  return baseDb.transaction(
    async (tx) => {
      await setTenantSessionVars(tx, ctx, true);
      return fn({ var: { ...ctx.var, db: tx } });
    },
    { accessMode: 'read only' },
  );
}

/** Read-write RLS transaction for mutation handlers; session vars let RLS SELECT policies pass on RETURNING. */
export async function tenantContext<T>(ctx: AuthContext, fn: (txCtx: AuthContext) => Promise<T>): Promise<T> {
  return baseDb.transaction(async (tx) => {
    await setTenantSessionVars(tx, ctx, false);
    return fn({ var: { ...ctx.var, db: tx } });
  });
}

export async function tenantContextIncludingDeleted<T>(
  ctx: AuthContext,
  fn: (txCtx: AuthContext) => Promise<T>,
): Promise<T> {
  return baseDb.transaction(async (tx) => {
    await setTenantSessionVars(tx, ctx, true);
    return fn({ var: { ...ctx.var, db: tx } });
  });
}
