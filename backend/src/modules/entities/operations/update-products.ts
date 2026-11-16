import type { ProductEntityType } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { tenantContext } from '#/db/tenant-context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { partitionByPermission } from '#/permissions/split-by-permission';
import type { EntityModel } from '#/tables';
import { log } from '#/utils/logger';

interface UpdateProductsInput<K extends ProductEntityType, I extends { id: string }> {
  entityType: K;
  /** One update per row; the request schema keeps the ids distinct. */
  items: I[];
  /** The product's update of one locked, checked row in the caller's transaction, which the single update calls too; null when it accepts no field. */
  writeRow: (txCtx: ActorContext, row: EntityModel<K>, item: I) => Promise<{ updated: EntityModel<K>; changedFields: string[] } | null>;
}

/**
 * Updates the products the caller may update, each through `writeRow` in one transaction that locks them in id
 * order. A row that accepts no field is answered as stored and dispatches nothing.
 * @returns The allowed rows in request order, as stored after the write, and the ids refused.
 * @throws AppError 403 when the caller may update none of them.
 */
export async function updateProductsOp<K extends ProductEntityType, I extends { id: string }>(
  ctx: ActorContext,
  { entityType, items, writeRow }: UpdateProductsInput<K, I>,
): Promise<{ results: EntityModel<K>[]; rejectedIds: string[] }> {
  const { results, rejectedIds, writtenIds } = await tenantContext(ctx, async (txCtx) => {
    const ids = items.map(({ id }) => id);
    const { allowed, rejectedIds } = await partitionByPermission(txCtx, 'update', entityType, ids, { forUpdate: true });
    if (!allowed.length) throw new AppError(403, 'forbidden', 'warn', { entityType });

    const rows = new Map(allowed.map((row) => [row.id, row]));
    const results: EntityModel<K>[] = [];
    const before: EntityModel<K>[] = [];
    const after: EntityModel<K>[] = [];
    const changedFields: string[][] = [];
    for (const item of items) {
      const row = rows.get(item.id.toLowerCase());
      if (!row) continue;
      const write = await writeRow(txCtx, row, item);
      results.push(write?.updated ?? row);
      if (!write) continue;
      before.push(row);
      after.push(write.updated);
      changedFields.push(write.changedFields);
    }

    const event: `${ProductEntityType}.updated` = `${entityType}.updated`;
    if (after.length) await dispatchMutation(txCtx, event, { before, after, changedFields });
    return { results, rejectedIds, writtenIds: after.map(({ id }) => id) };
  });

  if (writtenIds.length) log.info('Products updated', { entityType, ids: writtenIds });

  return { results, rejectedIds };
}
