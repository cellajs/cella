import { sql } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { baseDb } from './db';

/** Sets the session variables the RLS policies read: tenant id, user id, include_deleted. */
async function setTenantSessionVars(
  tx: Parameters<typeof baseDb.transaction>[0] extends (tx: infer T) => unknown ? T : never,
  ctx: AuthContext,
  includeDeleted: boolean,
): Promise<void> {
  await tx.execute(sql`
    SELECT set_config('app.tenant_id', ${ctx.var.tenantId}, true),
           set_config('app.user_id', ${ctx.var.userId}, true),
           set_config('app.include_deleted', ${includeDeleted ? 'true' : 'false'}, true)
  `);
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
