import type { z } from '@hono/zod-openapi';
import { and, asc, count, eq, getColumns, ilike, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { tenantRead, tenantReadIncludingDeleted } from '#/db/tenant-context';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import type { attachmentListQuerySchema } from '#/modules/attachment/attachment-schema';
import { resolveListTotal } from '#/modules/entities/helpers/list-total';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { auditUserSelect, coalesceAuditUsers, createdByUser, updatedByUser } from '#/modules/user/helpers/audit-user';
import { actorFrom } from '#/permissions/actor';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { getOrderColumn } from '#/utils/order-column';
import { seqCursorFilters } from '#/utils/seq-cursor';
import { prepareStringForILikeFilter } from '#/utils/sql';

type GetAttachmentsInput = z.infer<typeof attachmentListQuerySchema>;

export async function getAttachmentsOp(ctx: AuthContext, input: GetAttachmentsInput) {
  const organizationId = ctx.var.organization.id;
  const { q, sort, order, limit, offset, seqCursor } = input;

  // Resolve the caller's readable scope (unconditional grants + row-conditional slices,
  // e.g. `read: 'own'`) and compile it to a single row predicate. Attachments live
  // directly under the organization, so there is no sub-context to narrow by; the
  // organization id column stands in as the (never-hit) sub-context column.
  const actor = actorFrom(ctx);
  const readFilter = resolveCollectionReadFilter(ctx.var.memberships, 'attachment', organizationId, actor);
  const scopeWhere = buildCollectionReadWhere(readFilter, attachmentsTable, attachmentsTable.organizationId, actor);

  if (scopeWhere.kind === 'none') {
    const data = { items: [], total: 0 };
    return { success: true, data } as OperationResult<typeof data>;
  }

  const filters: SQL[] = [eq(attachmentsTable.organizationId, organizationId)];

  // Restrict to the caller's readable scope unless org-wide (kind 'all').
  if (scopeWhere.kind === 'where') filters.push(scopeWhere.where);

  // Hide tombstones for normal reads; on delta sync they flow through so caches can drop them
  if (!seqCursor) {
    filters.push(isNull(attachmentsTable.deletedAt));
  }

  // Sequence-based delta sync filter
  filters.push(...seqCursorFilters(attachmentsTable.seq, seqCursor));

  if (q?.trim()) {
    const queryToken = prepareStringForILikeFilter(q.trim());
    filters.push(
      or(
        ilike(attachmentsTable.name, queryToken),
        ilike(attachmentsTable.filename, queryToken),
        ilike(attachmentsTable.contentType, queryToken),
      ) as SQL,
    );
  }

  // Seq reads are keyset-paged: seq order (id tiebreak) makes a capped page a clean prefix
  const orderBy = seqCursor
    ? [asc(attachmentsTable.seq), asc(attachmentsTable.id)]
    : [
        getOrderColumn(sort, attachmentsTable.createdAt, order, {
          name: attachmentsTable.name,
          createdAt: attachmentsTable.createdAt,
          contentType: attachmentsTable.contentType,
        }),
      ];

  // Delta sync (seqCursor) must see tombstones so the client can remove soft-deleted attachments
  const read = seqCursor ? tenantReadIncludingDeleted : tenantRead;

  // Where `total` comes from: delta reads discard it; an org-wide read with no search maps
  // to the pre-computed `e:attachment` channel counter; anything narrower needs COUNT(*).
  const isDelta = !!seqCursor;
  const counterEligible = !isDelta && scopeWhere.kind === 'all' && !q?.trim();

  const { rawItems, total } = await read(ctx, async (readCtx) => {
    const { db } = readCtx.var;
    const { createdBy: _cb, updatedBy: _mb, ...attachmentCols } = getColumns(attachmentsTable);

    const whereClause = and(...filters);

    const itemsQuery = db
      .select({
        ...attachmentCols,
        ...auditUserSelect,
        viewCount: sql<number>`coalesce(${productCountersTable.viewCount}, 0)`.as('view_count'),
      })
      .from(attachmentsTable)
      .leftJoin(productCountersTable, eq(productCountersTable.entityId, attachmentsTable.id))
      .leftJoin(createdByUser, eq(createdByUser.id, attachmentsTable.createdBy))
      .leftJoin(updatedByUser, eq(updatedByUser.id, attachmentsTable.updatedBy))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

    const { items: rawItems, total } = await resolveListTotal({
      ctx: readCtx,
      itemsQuery,
      isDelta,
      counterEligible,
      channelKey: organizationId,
      entityType: 'attachment',
      exactCount: async () => {
        const [{ total }] = await db.select({ total: count() }).from(attachmentsTable).where(whereClause);
        return total;
      },
    });

    return { rawItems, total };
  });

  const items = coalesceAuditUsers(rawItems);
  const data = { items, total };
  return { success: true, data } as OperationResult<typeof data>;
}
