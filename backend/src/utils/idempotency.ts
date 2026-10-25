import { and, eq, type InferSelectModel, inArray, isNull } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { ActorContext } from '#/core/context';
import { tenantRead } from '#/db/tenant-context';
import { requestScopeWhere } from '#/db/utils/request-scope';

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
  const rows = await tenantRead(ctx, (readCtx) =>
    readCtx.var.db
      .select()
      .from(table)
      .where(and(inArray(table.id, ids), eq(table.createdBy, ctx.var.actor.id), isNull(table.deletedAt), requestScopeWhere(ctx, table))),
  );
  return rows;
}
