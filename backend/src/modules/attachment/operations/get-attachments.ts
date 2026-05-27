import type { z } from '@hono/zod-openapi';
import { and, count, eq, getColumns, ilike, or, type SQL, sql } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { attachmentsTable } from '#/db/schema/attachments';
import { productCountersTable } from '#/db/schema/product-counters';
import { tenantRead } from '#/db/tenant-context';
import type { attachmentListQuerySchema } from '#/modules/attachment/attachment-schema';
import { auditUserSelect, coalesceAuditUsers, createdByUser, updatedByUser } from '#/modules/user/helpers/audit-user';
import { getOrderColumn } from '#/utils/order-column';
import { seqCursorFilters } from '#/utils/seq-cursor';
import { prepareStringForILikeFilter } from '#/utils/sql';

type GetAttachmentsInput = z.infer<typeof attachmentListQuerySchema>;

export async function getAttachmentsOp(ctx: AuthContext, input: GetAttachmentsInput) {
  const organizationId = ctx.var.organization.id;
  const { q, sort, order, limit, offset, seqCursor } = input;

  const filters: SQL[] = [eq(attachmentsTable.organizationId, organizationId)];

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

  const { rawItems, total } = await tenantRead(ctx, async (readCtx) => {
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
