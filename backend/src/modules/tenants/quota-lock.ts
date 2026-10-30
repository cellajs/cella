import { sql } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
import type { ActorContext } from '#/core/context';
import { countTenantEntityRows } from '#/modules/entities/entities-queries';
import { assertTenantQuota } from '#/modules/tenants/tenant-restrictions';

/**
 * Runs a product create's `insert` in the caller's tenant transaction under a Postgres lock on the tenant's quota of
 * `entityType`, then counts the tenant's rows: creates of one tenant, in any process, count after each other's commit,
 * so concurrent requests cannot pass the quota together. The lock is held only where a quota applies.
 * @returns The rows `insert` returned.
 * @throws AppError 403 `restrict_by_app` when the inserted rows pass the quota; the throw rolls the insert back.
 */
export async function insertWithinTenantQuota<T>(txCtx: ActorContext, entityType: ProductEntityType, insert: () => Promise<T[]>): Promise<T[]> {
  const quota = txCtx.var.tenant.restrictions.quotas[entityType];
  if (txCtx.var.isSystemAdmin || quota === 0) return insert();

  await txCtx.var.db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`quota:${entityType}:${txCtx.var.tenantId}`}, 0))`);
  const rows = await insert();
  // A row id an earlier attempt inserted adds no row, so a replay at a full quota still answers with it.
  if (rows.length > 0) {
    const held = await countTenantEntityRows(txCtx, { entityType });
    assertTenantQuota(txCtx, entityType, held - rows.length, rows.length);
  }
  return rows;
}
