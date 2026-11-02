import { and, eq, type InferSelectModel, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { tenantRead, tenantReadIncludingDeleted } from '#/db/tenant-context';
import { requestScopeWhere } from '#/db/utils/request-scope';
import { partitionByPermission } from '#/permissions/split-by-permission';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

type ProductTable = PgTable & { id: PgColumn; createdBy: PgColumn; deletedAt: PgColumn; tenantId: PgColumn; organizationId: PgColumn };

/**
 * The rows an earlier attempt of a create already wrote, read by the ids the client gave them, so the answer is the
 * same whether or not the CDC worker has processed that attempt. Only the caller's own live rows in the request scope
 * count: an id another actor learned finds nothing, and so does an id whose row was deleted since (the tenant read
 * policy hides deleted rows too), whose insert then writes nothing.
 * @param ids - The ids of the create's input rows.
 * @returns The rows found, empty for a new create. A create inserts only the items not among them.
 */
export async function checkIdempotency<T extends ProductTable>(ctx: ActorContext, table: T, ids: string[]): Promise<InferSelectModel<T>[]> {
  return tenantRead(ctx, (readCtx) =>
    readCtx.var.db
      .select()
      .from(table)
      .where(and(inArray(table.id, ids), eq(table.createdBy, ctx.var.actor.id), isNull(table.deletedAt), requestScopeWhere(ctx, table))),
  );
}

/**
 * `splitByPermission` for a product delete, which a client sends again when it never got the answer. The rows an
 * earlier attempt of the same delete soft-deleted count as deleted, neither allowed nor rejected, so a delete sent twice
 * answers the same both times. Only the caller's deletes in the request scope whose stored `stx` carries the request's
 * `mutationId` count: a row another mutation deleted stays rejected, and so does a mutation id another actor learned.
 * @param stx - The delete's `stx`; the soft delete stores its `mutationId` on each row it removes.
 * @returns The ids still to delete, and the ids refused.
 * @throws AppError 403 when the caller may delete none of the ids and no earlier attempt deleted any.
 */
export async function splitDeleteByPermission<T extends ProductTable & { deletedBy: PgColumn; stx: PgColumn }>(
  ctx: ActorContext,
  table: T,
  entityType: ProductEntityType,
  ids: string[],
  stx: Pick<StxBase, 'mutationId'>,
): Promise<{ allowedIds: string[]; rejectedIds: string[] }> {
  const deletedByAttempt = await tenantReadIncludingDeleted(ctx, (readCtx) =>
    readCtx.var.db
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          inArray(table.id, ids),
          isNotNull(table.deletedAt),
          eq(table.deletedBy, ctx.var.actor.id),
          sql`${table.stx}->>'mutationId' = ${stx.mutationId}`,
          requestScopeWhere(ctx, table),
        ),
      ),
  );
  const deleted = new Set(deletedByAttempt.map(({ id }) => String(id)));
  const remaining = ids.filter((id) => !deleted.has(id.toLowerCase()));

  const split = remaining.length ? await partitionByPermission(ctx, 'delete', entityType, remaining) : { allowedIds: [], rejectedIds: [] };
  if (!split.allowedIds.length && !deleted.size) throw new AppError(403, 'forbidden', 'warn', { entityType });
  return split;
}
