import { and, type InferSelectModel, inArray, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { ActorContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { requestScopeWhere } from '#/db/utils/request-scope';
import { deleteStamps } from '#/db/utils/stamps';
import { stxWithIds } from '#/db/utils/stx-ids';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/** A product table: tenant and organization scoped, with `auditColumns`, `tombstoneColumns` and `stx`. */
export type TombstoneTable = PgTable &
  Record<'id' | 'tenantId' | 'organizationId' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'deletedAt' | 'deletedBy' | 'stx', PgColumn>;

interface TombstoneRowsOpts {
  ids: string[];
  /** Who deletes: stamped as the tombstone and as the row's last write. */
  actorId: ActorId;
  /** The delete's own mutation and source ids, stored in place of the last edit's. */
  stx: Pick<StxBase, 'mutationId' | 'sourceId'>;
  at?: string;
  /** An app's own condition on top of the request scope, such as a row that nothing references yet. */
  where?: SQL;
}

/**
 * Soft-deletes the live rows among `ids` in the request's tenant and organization, stamping the tombstone, the last
 * write and the delete's `stx` ids.
 * @returns The rows it tombstoned; an id that is unknown, out of scope, already deleted or refused by `where` is absent.
 */
export const tombstoneRows = async <T extends TombstoneTable>(
  ctx: ActorContext,
  table: T,
  { ids, actorId, stx, at, where }: TombstoneRowsOpts,
): Promise<InferSelectModel<T>[]> => {
  // Drizzle types an update of a generic table loosely: the constraint names every key set, and RETURNING gives full rows.
  const values = { ...deleteStamps(actorId, at), stx: stxWithIds(table.stx, stx) } as PgUpdateSetSource<T>;
  const rows = await ctx.var.db
    .update(table)
    .set(values)
    .where(and(inArray(table.id, ids), requestScopeWhere(ctx, table), isNull(table.deletedAt), where))
    .returning();
  return rows as InferSelectModel<T>[];
};
