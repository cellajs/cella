import type { z } from '@hono/zod-openapi';
import { and, asc, count, eq, getColumns, ilike, isNull, or, type SQL } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { tenantRead, tenantReadIncludingDeleted } from '#/db/tenant-context';
import { type ListTotalSource, resolveListTotal } from '#/db/utils/list-total';
import { publishedRowsPredicate } from '#/db/utils/published-predicate';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import type { attachmentListQuerySchema } from '#/modules/attachment/attachment-schema';
import { attachmentHomeColumnKey, resolveAttachmentHomeScope } from '#/modules/attachment/helpers/attachment-placement';
import {
  getOrganizationEntityCount,
  productViewCountJoin,
  productViewCountSelect,
} from '#/modules/entities/entities-queries';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { auditUserSelect, coalesceAuditUsers, createdByUser, updatedByUser } from '#/modules/user/helpers/audit-user';
import { actorFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { getOrderColumns } from '#/utils/order-column';
import { seqCursorFilters } from '#/utils/seq-cursor';
import { prepareStringForILikeFilter } from '#/utils/sql';

type GetAttachmentsInput = z.infer<typeof attachmentListQuerySchema>;

export async function getAttachmentsOp(ctx: AuthContext, input: GetAttachmentsInput) {
  const organizationId = ctx.var.organization.id;
  const { q, sort, order, limit, offset, seqCursor, channelId } = input;

  // Placement seam: the readable scope compiles against the app's home column and, when a home
  // channel is requested, narrows to it; the org-homed default reads org-wide.
  const homeChannelId = await resolveAttachmentHomeScope(ctx, channelId);
  const actor = actorFrom(ctx);
  const readFilter = resolveCollectionReadFilter(
    ctx.var.memberships,
    'attachment',
    organizationId,
    actor,
    homeChannelId ? { homeChannelId } : undefined,
  );
  const scopeWhere = buildCollectionReadWhere(
    readFilter,
    attachmentsTable,
    attachmentsTable[attachmentHomeColumnKey],
    actor,
  );

  if (scopeWhere.kind === 'none') {
    return { items: [], total: 0 };
  }

  const filters: SQL[] = [eq(attachmentsTable.organizationId, organizationId)];

  // Restrict to the caller's readable scope unless org-wide (kind 'all').
  if (scopeWhere.kind === 'where') filters.push(scopeWhere.where);

  // Hide tombstones for normal reads; delta sync passes them through so caches can drop rows.
  if (!seqCursor) {
    filters.push(isNull(attachmentsTable.deletedAt));
  }

  // Unpublished drafts stay out of every read, deltas included. A no-op for attachments, which
  // carry no publishedAt; kept as the pattern app-specific entity operations copy.
  const publishedOnly = publishedRowsPredicate(attachmentsTable);
  if (publishedOnly) filters.push(publishedOnly);

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

  const orderBy = seqCursor
    ? [asc(attachmentsTable.seq), asc(attachmentsTable.id)]
    : getOrderColumns({
        sort,
        order,
        fallback: ['createdAt', 'desc'],
        columns: {
          name: attachmentsTable.name,
          createdAt: attachmentsTable.createdAt,
          contentType: attachmentsTable.contentType,
        },
        tieBreaker: attachmentsTable.id,
      });

  const read = seqCursor ? tenantReadIncludingDeleted : tenantRead;

  // Delta reads discard `total`; an org-wide read with no search maps to the pre-computed
  // `e:c:attachment` channel counter; anything narrower needs COUNT(*).
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
        viewCount: productViewCountSelect(),
      })
      .from(attachmentsTable)
      .leftJoin(productCountersTable, productViewCountJoin(attachmentsTable.id))
      .leftJoin(createdByUser, eq(createdByUser.id, attachmentsTable.createdBy))
      .leftJoin(updatedByUser, eq(updatedByUser.id, attachmentsTable.updatedBy))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

    const totalSource: ListTotalSource = isDelta
      ? { kind: 'pageLength' }
      : counterEligible
        ? {
            kind: 'counter',
            getTotal: () => getOrganizationEntityCount(readCtx, { organizationId, entityType: 'attachment' }),
          }
        : {
            kind: 'exact',
            getTotal: async () => {
              const [{ total }] = await db.select({ total: count() }).from(attachmentsTable).where(whereClause);
              return total;
            },
          };

    const { items: rawItems, total } = await resolveListTotal(itemsQuery, totalSource);

    return { rawItems, total };
  });

  const items = coalesceAuditUsers(rawItems);
  return { items, total };
}
