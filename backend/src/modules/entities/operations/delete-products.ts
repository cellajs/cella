import type { InferSelectModel } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
import type { ActorContext } from '#/core/context';
import { createServerStx } from '#/core/stx/create-server-stx';
import { tenantContext } from '#/db/tenant-context';
import { type TombstoneTable, tombstoneRows } from '#/db/utils/tombstone-rows';
import { dispatchMutation } from '#/lib/mutation-bus';
import type { StxBase } from '#/schemas/sync-transaction-schemas';
import type { TrackedModel } from '#/tables';
import { splitDeleteByPermission } from '#/utils/idempotency';
import { log } from '#/utils/logger';

interface DeleteProductsInput<T extends TombstoneTable> {
  entityType: ProductEntityType;
  table: T;
  ids: string[];
  /** The ids the client sent with the delete; a server stx when it sent none. */
  stx?: Pick<StxBase, 'mutationId' | 'sourceId'>;
  /** App logic that commits or rolls back with the delete, called with the rows it tombstoned. */
  onDelete?: (txCtx: ActorContext, deleted: InferSelectModel<T>[]) => Promise<void>;
}

/**
 * Soft-deletes the products the caller may delete, stamping each row with the delete's `stx`. The collaborative
 * documents of the rows go with them: `<entityType>.deleted` is dispatched in the same transaction. A delete sent again
 * answers as its first attempt did: the rows that attempt removed count as deleted.
 * @returns The ids the caller may not delete, as `rejectedIds`.
 * @throws AppError 403 when the caller may delete none of them.
 */
export async function deleteProductsOp<T extends TombstoneTable>(
  ctx: ActorContext,
  { entityType, table, ids, stx = createServerStx(), onDelete }: DeleteProductsInput<T>,
): Promise<{ results: []; rejectedIds: string[] }> {
  const { allowedIds, rejectedIds } = await splitDeleteByPermission(ctx, table, entityType, ids, stx);
  if (!allowedIds.length) return { results: [], rejectedIds };

  await tenantContext(
    ctx,
    async (txCtx) => {
      const deleted = await tombstoneRows(txCtx, table, { ids: allowedIds, actorId: ctx.var.actor.id, stx });
      await onDelete?.(txCtx, deleted);
      // `table` is the table of `entityType`, a link the generic signature cannot state.
      await dispatchMutation(txCtx, `${entityType}.deleted`, { before: deleted as TrackedModel<ProductEntityType>[] });
    },
    { includeDeleted: true },
  );

  log.info('Products deleted', { entityType, ids: allowedIds });

  return { results: [], rejectedIds };
}
