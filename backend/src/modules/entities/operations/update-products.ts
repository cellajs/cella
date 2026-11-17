import type { ProductEntityType } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { tenantContext } from '#/db/tenant-context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { partitionByPermission } from '#/permissions/split-by-permission';
import type { EntityModel } from '#/tables';
import { log } from '#/utils/logger';

/** A row writer's answer: the row as stored after its write and the fields it accepted; null when it accepted none and wrote nothing. */
export type RowWrite<M> = { updated: M; changedFields: string[] } | null;

/**
 * A product's update of one locked, checked row in the caller's transaction, which its single update calls too. It
 * refuses the row by throwing the 403 `AppError` that `canCreateEntity` and `getValidChannel` throw.
 */
export type RowWriter<K extends ProductEntityType, I> = (txCtx: ActorContext, row: EntityModel<K>, item: I) => Promise<RowWrite<EntityModel<K>>>;

/** What became of one item of a batch update; `id` is the item's id as the request spells it. */
export type RowOutcome<M> =
  | { outcome: 'written'; id: string; before: M; row: M; changedFields: string[] }
  | { outcome: 'unchanged'; id: string; row: M }
  | { outcome: 'rejected'; id: string };

/**
 * Reads the rows of `ids` the caller may update, locked in id order until the caller's transaction ends.
 * @returns The rows by stored id; an id the caller may not update, or that names no live row, is absent.
 */
export const lockUpdatableRows = async <K extends ProductEntityType>(txCtx: ActorContext, entityType: K, ids: string[]) => {
  const { allowed } = await partitionByPermission(txCtx, 'update', entityType, ids, { forUpdate: true });
  return new Map(allowed.map((row) => [row.id, row]));
};

/**
 * Runs `writeRow` on each item's locked row in request order, each in a savepoint of its own. A 403 the writer throws
 * rejects its row and rolls back that row's writes alone. Any other error fails the batch.
 * @returns One outcome per item, in request order; an item without a locked row is rejected.
 */
export const writeEachRow = async <K extends ProductEntityType, I extends { id: string }>(
  txCtx: ActorContext,
  items: I[],
  rows: Map<string, EntityModel<K>>,
  writeRow: RowWriter<K, I>,
): Promise<RowOutcome<EntityModel<K>>[]> => {
  const outcomes: RowOutcome<EntityModel<K>>[] = [];
  for (const item of items) {
    const { id } = item;
    const before = rows.get(id.toLowerCase());
    if (!before) {
      outcomes.push({ outcome: 'rejected', id });
      continue;
    }
    try {
      const write = await tenantContext(txCtx, (rowCtx) => writeRow(rowCtx, before, item));
      outcomes.push(
        write
          ? { outcome: 'written', id, before, row: write.updated, changedFields: write.changedFields }
          : { outcome: 'unchanged', id, row: before },
      );
    } catch (error) {
      if (!(error instanceof AppError) || error.status !== 403) throw error;
      outcomes.push({ outcome: 'rejected', id });
    }
  }
  return outcomes;
};

/** Dispatches `<entityType>.updated` for the written rows, `before`/`after` index-aligned as the mutation bus requires; nothing when none was written. */
export const dispatchUpdated = async <K extends ProductEntityType>(txCtx: ActorContext, entityType: K, outcomes: RowOutcome<EntityModel<K>>[]) => {
  const written = outcomes.filter((outcome) => outcome.outcome === 'written');
  if (!written.length) return;

  const event: `${ProductEntityType}.updated` = `${entityType}.updated`;
  await dispatchMutation(txCtx, event, {
    before: written.map(({ before }) => before),
    after: written.map(({ row }) => row),
    changedFields: written.map(({ changedFields }) => changedFields),
  });
};

/**
 * The answer to a batch update: the rows written or unchanged, as stored, and the ids rejected, both in request order.
 * @throws AppError 403 when every row was rejected.
 */
export const batchUpdateAnswer = <M>(entityType: ProductEntityType, outcomes: RowOutcome<M>[]): { results: M[]; rejectedIds: string[] } => {
  const results: M[] = [];
  const rejectedIds: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.outcome === 'rejected') rejectedIds.push(outcome.id);
    else results.push(outcome.row);
  }
  if (!results.length) throw new AppError(403, 'forbidden', 'warn', { entityType });
  return { results, rejectedIds };
};

interface UpdateProductsInput<K extends ProductEntityType, I extends { id: string }> {
  entityType: K;
  /** One update per row; the request schema keeps the ids distinct. */
  items: I[];
  writeRow: RowWriter<K, I>;
}

/**
 * Updates the products of a batch in one transaction. A row that accepts no field is answered as stored and dispatches
 * nothing. An app whose batch needs another policy composes the parts above in an operation of its own.
 * @returns The rows written or unchanged in request order, as stored after the write, and the ids refused by the
 * permission check or by the writer.
 * @throws AppError 403 when every row was refused.
 */
export async function updateProductsOp<K extends ProductEntityType, I extends { id: string }>(
  ctx: ActorContext,
  { entityType, items, writeRow }: UpdateProductsInput<K, I>,
): Promise<{ results: EntityModel<K>[]; rejectedIds: string[] }> {
  const ids = items.map(({ id }) => id);
  const { answer, outcomes } = await tenantContext(ctx, async (txCtx) => {
    const rows = await lockUpdatableRows(txCtx, entityType, ids);
    const outcomes = await writeEachRow(txCtx, items, rows, writeRow);
    const answer = batchUpdateAnswer(entityType, outcomes);
    await dispatchUpdated(txCtx, entityType, outcomes);
    return { answer, outcomes };
  });

  const writtenIds = outcomes.flatMap((outcome) => (outcome.outcome === 'written' ? [outcome.row.id] : []));
  if (writtenIds.length) log.info('Products updated', { entityType, ids: writtenIds });

  return answer;
}
