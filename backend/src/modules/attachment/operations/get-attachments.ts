import type { z } from '@hono/zod-openapi';
import { and, count, eq, getColumns, ilike, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { tenantRead, tenantReadIncludingDeleted } from '#/db/tenant-context';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import type { attachmentListQuerySchema } from '#/modules/attachment/attachment-schema';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { auditUserSelect, coalesceAuditUsers, createdByUser, updatedByUser } from '#/modules/user/helpers/audit-user';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { getOrderColumn } from '#/utils/order-column';
import { seqCursorFilters } from '#/utils/seq-cursor';
import { prepareStringForILikeFilter } from '#/utils/sql';

type GetAttachmentsInput = z.infer<typeof attachmentListQuerySchema>;

export async function getAttachmentsOp(ctx: AuthContext, input: GetAttachmentsInput) {
  const organizationId = ctx.var.organization.id;
  const { q, sort, order, limit, offset, seqCursor } = input;

  // Resolve the caller's readable scope (unconditional + row-conditional read grants,
  // e.g. `read: 'own'`) and compile it to a single row predicate.
  const readFilter = resolveCollectionReadFilter(ctx.var.memberships, 'attachment', organizationId);
  const scopeWhere = buildCollectionReadWhere(
    readFilter,
    attachmentsTable,
    attachmentsTable.organizationId,
    ctx.var.user.id,
  );

  if (scopeWhere.kind === 'none') {
    const data = { items: [], total: 0 };
    return { success: true, data } as OperationResult<typeof data>;
  }

  const filters: SQL[] = [eq(attachmentsTable.organizationId, organizationId)];

  // Restrict to the caller's readable scope unless org-wide (kind 'all').
  if (scopeWhere.kind === 'where') filters.push(scopeWhere.where);

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

  const orderColumn = getOrderColumn(sort, attachmentsTable.createdAt, order, {
    name: attachmentsTable.name,
    createdAt: attachmentsTable.createdAt,
    contentType: attachmentsTable.contentType,
  });

  const read = seqCursor ? tenantReadIncludingDeleted : tenantRead;

  const { rawItems, total } = await read(ctx, async (readCtx) => {
    const { db } = readCtx.var;
    const { createdBy: _cb, updatedBy: _mb, ...attachmentCols } = getColumns(attachmentsTable);

    const whereClause = and(...filters);

    const [rawItems, [{ total }]] = await Promise.all([
      db
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
        .orderBy(orderColumn)
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(attachmentsTable).where(whereClause),
    ]);

    return { rawItems, total };
  });

  const items = coalesceAuditUsers(rawItems);
  const data = { items, total };
  return { success: true, data } as OperationResult<typeof data>;
}
