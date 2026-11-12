import { and, eq, getColumns, inArray, isNotNull, sql } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { createServerStx } from '#/core/stx/create-server-stx';
import { inWriteTransaction, tenantContextIncludingDeleted } from '#/db/tenant-context';
import { draftVisibleRowsPredicate } from '#/db/utils/published-predicate';
import { requestScope } from '#/db/utils/request-scope';
import { updateStamps } from '#/db/utils/stamps';
import { isCollected, stxRestored } from '#/db/utils/stx-ids';
import { insertWithinTenantQuota } from '#/modules/tenants/quota-lock';
import { partitionByPermission } from '#/permissions/split-by-permission';
import { getEntityTable } from '#/tables';

interface ProductIds {
  entityType: ProductEntityType;
  ids: string[];
}

/**
 * Brings back the rows of `ids` that the CDC worker collected. The worker soft-deletes an owned embedded row once no
 * live host names it, which an undo then names again. Only a tombstone with the worker's mark comes back
 * (`isCollected`): a row a person deleted stays deleted, whoever names it. A restore passes what a create does: the
 * tenant's quota, the caller's permission to create each row where it lives, and the archive of that channel. When
 * one of the rows is refused, none comes back.
 */
const restoreCollectedRows = (ctx: ActorContext, { entityType, ids }: ProductIds): Promise<void> =>
  tenantContextIncludingDeleted(ctx, async (txCtx) => {
    const { tenantId, organizationId } = requestScope(txCtx, entityType);
    const entityTable = getEntityTable(entityType);
    const columns = getColumns(entityTable);
    // Widened for the update, whose typed form takes one table and no union of them.
    const table: AnyPgTable = entityTable;
    const collected = and(
      inArray(columns.id, ids),
      eq(columns.tenantId, tenantId),
      eq(columns.organizationId, organizationId),
      isNotNull(columns.deletedAt),
      isCollected(columns.stx),
      draftVisibleRowsPredicate(table, txCtx.var.actor.id),
    );

    // Most ids a host no longer finds name a row a person deleted: those take no quota lock.
    const candidates = await txCtx.var.db.select({ id: columns.id }).from(table).where(collected);
    if (candidates.length === 0) return;

    try {
      // A transaction of its own, which a refusal rolls back alone.
      await tenantContextIncludingDeleted(txCtx, async (restoreCtx) => {
        const restored = await insertWithinTenantQuota(restoreCtx, entityType, () =>
          restoreCtx.var.db
            .update(table)
            .set({ deletedAt: null, deletedBy: null, ...updateStamps(restoreCtx.var.actor.id), stx: stxRestored(columns.stx, createServerStx()) })
            .where(collected)
            .returning({ id: columns.id }),
        );
        // Checked on the live rows, which is what the permission helpers resolve.
        const restoredIds = restored.map((row) => row.id);
        const { rejectedIds } = await partitionByPermission(restoreCtx, 'create', entityType, restoredIds);
        if (rejectedIds.length > 0) throw new AppError(403, 'forbidden', 'warn', { entityType });
      });
    } catch (error) {
      if (!(error instanceof AppError && (error.type === 'restrict_by_app' || error.type === 'forbidden'))) throw error;
    }
  });

/**
 * Out of `ids`, the ones that name a live row of `entityType` in the request's tenant and organization, in the order
 * given: what a host row may store in an id array column (`appConfig.productEmbeddings`). An unknown, deleted or
 * out-of-scope id is left out, and so is a draft that does not show to the caller, so a host names no row its
 * organization does not hold. Runs on the connection it is handed: a host write calls it inside its tenant transaction,
 * and there a row the CDC worker collected comes back with the write (`restoreCollectedRows`). The host stores what
 * this returns: the worker collects a row when its id leaves a host, and never one no host named.
 */
export const filterExistingProductIds = async (ctx: ActorContext, { entityType, ids }: ProductIds) => {
  if (ids.length === 0) return [];
  const { tenantId, organizationId } = requestScope(ctx, entityType);
  const table = getEntityTable(entityType);
  const drafts = draftVisibleRowsPredicate(table, ctx.var.actor.id);

  const readLiveIds = async () => {
    const result = await ctx.var.db.execute<{ id: string }>(sql`
      SELECT id FROM ${table}
      WHERE id IN (${sql.join(ids, sql`, `)}) AND tenant_id = ${tenantId} AND organization_id = ${organizationId}
        AND deleted_at IS NULL${drafts ? sql` AND ${drafts}` : sql``}
    `);
    return new Set(result.rows.map((row) => row.id));
  };

  let live = await readLiveIds();
  const missing = ids.filter((id) => !live.has(id));
  if (missing.length > 0 && inWriteTransaction(ctx)) {
    await restoreCollectedRows(ctx, { entityType, ids: missing });
    // Read again and trust no count of the restore: a concurrent host write that names the same row may bring it back first.
    live = await readLiveIds();
  }
  return ids.filter((id) => live.has(id));
};
