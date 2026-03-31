import { sql } from 'drizzle-orm';
import type { Env } from '#/lib/context';
import { baseDb } from './db';

/** Minimum context needed to set RLS session vars. */
type TenantCtx = { var: Pick<Env['Variables'], 'tenantId' | 'user'> & Record<string, unknown> };

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
export async function tenantRead<T>(
  ctx: TenantCtx,
  fn: (readCtx: { var: Env['Variables'] }) => Promise<T>,
): Promise<T> {
  return baseDb.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    await tx.execute(sql`
      SELECT set_config('app.tenant_id', ${ctx.var.tenantId}, true),
             set_config('app.user_id', ${ctx.var.user.id}, true)
    `);
    return fn({ var: { ...ctx.var, db: tx } as Env['Variables'] });
  });
}

/**
 * Read-write RLS context for mutation handlers.
 * Sets session vars so RLS SELECT policies pass (e.g. resolveEntity, RETURNING).
 */
export async function tenantContext<T>(
  ctx: TenantCtx,
  fn: (txCtx: { var: Env['Variables'] }) => Promise<T>,
): Promise<T> {
  return baseDb.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT set_config('app.tenant_id', ${ctx.var.tenantId}, true),
             set_config('app.user_id', ${ctx.var.user.id}, true)
    `);
    return fn({ var: { ...ctx.var, db: tx } as Env['Variables'] });
  });
}
