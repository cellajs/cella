import { sql } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { baseDb } from './db';

// ============================================================================
// Tenant context helpers — set session vars for RLS policies
// ============================================================================

/**
 * Apply tenant/session variables for RLS policies within a transaction.
 *
 * Convention: keep the callback focused on DB queries. Return raw data —
 * hydration, response formatting, and ctx.json() belong outside.
 */
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
  // Fold READ ONLY into BEGIN (drizzle emits `begin read only` in a single round trip)
  // instead of a separate `SET TRANSACTION READ ONLY` statement — saves one DB round trip per read.
  return baseDb.transaction(
    async (tx) => {
      await setTenantSessionVars(tx, ctx, false);
      return fn({ var: { ...ctx.var, db: tx } });
    },
    { accessMode: 'read only' },
  );
}

/** Read-only tenant RLS transaction that hides tombstones by default. */
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

/**
 * Read-write RLS context for mutation handlers.
 * Sets session vars so RLS SELECT policies pass (e.g. resolveEntity, RETURNING).
 */
export async function tenantContext<T>(ctx: AuthContext, fn: (txCtx: AuthContext) => Promise<T>): Promise<T> {
  return baseDb.transaction(async (tx) => {
    await setTenantSessionVars(tx, ctx, false);
    return fn({ var: { ...ctx.var, db: tx } });
  });
}

/** Read-write tenant transaction that can see tombstoned rows during soft-delete updates. */
export async function tenantContextIncludingDeleted<T>(
  ctx: AuthContext,
  fn: (txCtx: AuthContext) => Promise<T>,
): Promise<T> {
  return baseDb.transaction(async (tx) => {
    await setTenantSessionVars(tx, ctx, true);
    return fn({ var: { ...ctx.var, db: tx } });
  });
}
