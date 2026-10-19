import { and, eq, type InferSelectModel, inArray, isNull } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { ActorContext } from '#/core/context';
import { tenantRead } from '#/db/tenant-context';
import { requestScopeWhere } from '#/db/utils/request-scope';

type ProductTable = PgTable & { id: PgColumn; createdBy: PgColumn; deletedAt: PgColumn; tenantId: PgColumn; organizationId: PgColumn };

/**
 * The rows a replayed create already wrote, null when the create is new. A create names its rows by the ids the client
 * gave them, so the lookup reads those rows by id and answers the same whether or not the CDC worker has processed the
 * first attempt. Only the caller's own live rows in the request scope count: an id another actor learned finds nothing,
 * and so does an id whose row was deleted since (the tenant read policy hides deleted rows too), whose insert then
 * writes nothing.
 * @param ids - The ids of the create's input rows.
 */
export async function checkIdempotency<T extends ProductTable>(ctx: ActorContext, table: T, ids: string[]): Promise<InferSelectModel<T>[] | null> {
  const rows = await tenantRead(ctx, (readCtx) =>
    readCtx.var.db
      .select()
      .from(table as PgTable)
      .where(and(inArray(table.id, ids), eq(table.createdBy, ctx.var.actor.id), isNull(table.deletedAt), requestScopeWhere(ctx, table))),
  );
  return rows.length > 0 ? (rows as InferSelectModel<T>[]) : null;
}
