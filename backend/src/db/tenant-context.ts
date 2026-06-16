import { sql } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { baseDb } from './db';

// ============================================================================
// Tenant context helpers — set session vars for RLS policies
// ============================================================================

/**
 * Read-only RLS context for product entity queries.
 * Sets session vars so SELECT policies can verify tenant + auth.
 *
 * Convention: keep the callback focused on DB queries. Return raw data —
 * hydration, response formatting, and ctx.json() belong outside.
 */
export async function tenantRead<T>(ctx: AuthContext, fn: (readCtx: AuthContext) => Promise<T>): Promise<T> {
  // Fold READ ONLY into BEGIN (drizzle emits `begin read only` in a single round trip)
  // instead of a separate `SET TRANSACTION READ ONLY` statement — saves one DB round trip per read.
  return baseDb.transaction(
    async (tx) => {
      await tx.execute(sql`
        SELECT set_config('app.tenant_id', ${ctx.var.tenantId}, true),
               set_config('app.user_id', ${ctx.var.userId}, true)
      `);
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
    await tx.execute(sql`
      SELECT set_config('app.tenant_id', ${ctx.var.tenantId}, true),
             set_config('app.user_id', ${ctx.var.userId}, true)
    `);
    return fn({ var: { ...ctx.var, db: tx } });
  });
}
