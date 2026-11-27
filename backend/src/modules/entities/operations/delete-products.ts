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

type DeleteStx = Pick<StxBase, 'mutationId' | 'sourceId'>;

interface TombstoneProductsInput<T extends TombstoneTable> {
  entityType: ProductEntityType;
  table: T;
  /** Ids the caller may delete: `splitDeleteByPermission`'s `allowedIds`, or fewer. */
  ids: string[];
  /** The delete's own ids, the ones `splitDeleteByPermission` was given. */
  stx: DeleteStx;
}

/**
 * Soft-deletes the live rows among `ids` with the delete's `stx` and dispatches `<entityType>.deleted` for them, which
 * retires their collaborative documents. Inside a caller's tenant transaction it commits or rolls back with it.
 * @returns The rows it tombstoned; an id already deleted or outside the request's organization is absent.
 */
export const tombstoneProducts = <T extends TombstoneTable>(
  ctx: ActorContext,
  { entityType, table, ids, stx }: TombstoneProductsInput<T>,
): Promise<InferSelectModel<T>[]> =>
  // RETURNING hands back rows the update just deleted, which the tenant policy accepts only with deleted rows included.
  tenantContext(
    ctx,
    async (txCtx) => {
      const deleted = await tombstoneRows(txCtx, table, { ids, actorId: ctx.var.actor.id, stx });
      // `table` is the table of `entityType`, a link the generic signature cannot state.
      await dispatchMutation(txCtx, `${entityType}.deleted`, { before: deleted as TrackedModel<ProductEntityType>[] });
      return deleted;
    },
    { includeDeleted: true },
  );

interface DeleteProductsInput<T extends TombstoneTable, R> {
  entityType: ProductEntityType;
  table: T;
  ids: string[];
  /** The ids the client sent with the delete; a server stx when it sent none. */
  stx?: DeleteStx;
  /**
   * App logic that commits or rolls back with the delete, called with the rows it tombstoned in a transaction that reads
   * deleted rows. What it returns comes back as `onDeleteResult`.
   */
  onDelete?: (txCtx: ActorContext, deleted: InferSelectModel<T>[]) => Promise<R>;
}

/**
 * Soft-deletes the products the caller may delete: {@link splitDeleteByPermission}, then {@link tombstoneProducts} and
 * `onDelete` in one transaction. A delete sent again answers as its first attempt did: the rows that attempt removed
 * count as deleted. An app that narrows the ids inside the transaction composes the two parts in its own operation.
 * @returns The ids the caller may not delete, as `rejectedIds`, and what `onDelete` returned as `onDeleteResult`:
 * undefined when it did not run, and no part of the route's answer.
 * @throws AppError 403 when the caller may delete none of them.
 */
export async function deleteProductsOp<T extends TombstoneTable, R = undefined>(
  ctx: ActorContext,
  { entityType, table, ids, stx = createServerStx(), onDelete }: DeleteProductsInput<T, R>,
): Promise<{ results: []; rejectedIds: string[]; onDeleteResult?: R }> {
  const { allowedIds, rejectedIds } = await splitDeleteByPermission(ctx, table, entityType, ids, stx);
  if (!allowedIds.length) return { results: [], rejectedIds };

  const onDeleteResult = await tenantContext(
    ctx,
    async (txCtx) => {
      const deleted = await tombstoneProducts(txCtx, { entityType, table, ids: allowedIds, stx });
      return onDelete?.(txCtx, deleted);
    },
    { includeDeleted: true },
  );

  log.info('Products deleted', { entityType, ids: allowedIds });

  return { results: [], rejectedIds, onDeleteResult };
}
