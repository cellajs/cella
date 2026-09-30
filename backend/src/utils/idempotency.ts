import { and, eq, type InferSelectModel, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { ActorContext } from '#/core/context';
import { findActivityByMutationId } from '#/db/prepared';
import { tenantRead } from '#/db/tenant-context';
import { requestScopeWhere } from '#/db/utils/request-scope';

/** Replay check on the client-generated mutation id. Prepared, since it runs on every mutation. */
export async function isTransactionProcessed(stxId: string): Promise<boolean> {
  const existing = await findActivityByMutationId.execute({ mutationId: stxId });
  return existing.length > 0;
}

type ProductTable = PgTable & { stx: PgColumn; createdBy: PgColumn; tenantId: PgColumn; organizationId: PgColumn };

/**
 * The rows of `table` a processed transaction created, null when it is new. Mutation ids travel in sync payloads, so
 * the lookup takes the caller's own rows in the request scope: a replay by another actor finds nothing and creates
 * its own rows.
 */
export async function checkIdempotency<T extends ProductTable>(
  ctx: ActorContext,
  table: T,
  stxId: string,
): Promise<InferSelectModel<T>[] | null> {
  if (!(await isTransactionProcessed(stxId))) return null;
  const batch = await tenantRead(ctx, (readCtx) =>
    readCtx.var.db
      .select()
      .from(table as PgTable)
      .where(
        and(
          sql`${table.stx}->>'mutationId' = ${stxId}`,
          eq(table.createdBy, ctx.var.actor.id),
          requestScopeWhere(ctx, table),
        ),
      ),
  );
  return batch.length > 0 ? (batch as InferSelectModel<T>[]) : null;
}
