import { and, asc, count, eq, getColumns, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { ActorContext, DbContext } from '#/core/context';
import { type ListTotalSource, resolveListTotal } from '#/db/utils/list-total';
import { publishedRowsPredicate } from '#/db/utils/published-predicate';
import { requestScopeWhere } from '#/db/utils/request-scope';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { getOrganizationEntityCount, productViewCountJoin, productViewCountSelect } from '#/modules/entities/entities-queries';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { auditUserSelect, createdByUser, updatedByUser } from '#/modules/user/helpers/audit-user';
import { getOrderColumns } from '#/utils/order-column';
import { seqCursorFilters } from '#/utils/seq-cursor';
import { prepareStringForILikeFilter } from '#/utils/sql';

// Every read and write below carries the request's tenant + organization predicate, so the
// result is the same with RLS bypassed; the RLS transaction wrappers stay the backstop.

export const insertAttachments = async (ctx: DbContext, { attachments }: { attachments: (typeof attachmentsTable.$inferInsert)[] }) => {
  const { db } = ctx.var;
  return db.insert(attachmentsTable).values(attachments).onConflictDoNothing().returning();
};

interface UpdateAttachmentOpts {
  id: string;
  values: Partial<typeof attachmentsTable.$inferInsert>;
}

export const updateAttachment = async (ctx: ActorContext, { id, values }: UpdateAttachmentOpts) => {
  const { db } = ctx.var;
  const [updated] = await db
    .update(attachmentsTable)
    .set(values)
    .where(and(eq(attachmentsTable.id, id), requestScopeWhere(ctx, attachmentsTable)))
    .returning();
  return updated;
};

interface DeleteAttachmentsByIdsOpts {
  ids: string[];
  deletedBy: string;
  deletedAt: string;
}

/** Soft-deletes the rows and returns them, for the `attachment.deleted` event. */
export const deleteAttachmentsByIds = async (ctx: ActorContext, { ids, deletedAt, deletedBy }: DeleteAttachmentsByIdsOpts) => {
  const { db } = ctx.var;
  return db
    .update(attachmentsTable)
    .set({ deletedAt, deletedBy, updatedAt: deletedAt, updatedBy: deletedBy })
    .where(and(inArray(attachmentsTable.id, ids), requestScopeWhere(ctx, attachmentsTable), isNull(attachmentsTable.deletedAt)))
    .returning();
};

interface FindAttachmentsByIdsOpts {
  ids: string[];
}

/** Unknown, deleted and out-of-scope ids are absent; the caller treats absence as rejection. */
export const findAttachmentsByIds = async (ctx: ActorContext, { ids }: FindAttachmentsByIdsOpts) => {
  const { db } = ctx.var;
  return db
    .select()
    .from(attachmentsTable)
    .where(and(inArray(attachmentsTable.id, ids), requestScopeWhere(ctx, attachmentsTable), isNull(attachmentsTable.deletedAt)));
};

interface FindAttachmentsPaginatedOpts {
  organizationId: string;
  /** The caller's request scope and read scope, from guarded context and the permission layer. */
  filters: SQL[];
  /** The read scope is the whole organization, so an unfiltered total can come from the counter. */
  orgWide: boolean;
  q?: string;
  sort?: 'name' | 'createdAt' | 'contentType';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
  /** A delta read: tombstones included, ordered by seq, total from the page length. */
  seqCursor?: string;
}

/**
 * A page of attachments with their audit users and view counts. Normal reads hide tombstones and every read hides
 * unpublished drafts; a delta read passes tombstones through so caches can drop rows. The total is the page length for
 * a delta read, the `e:c:attachment` counter for an org-wide read without search, else a COUNT.
 */
export const findAttachmentsPaginated = async (ctx: DbContext, opts: FindAttachmentsPaginatedOpts) => {
  const { db } = ctx.var;
  const { organizationId, orgWide, q, sort, order, limit, offset, seqCursor } = opts;
  const filters = [...opts.filters];

  // Hide tombstones for normal reads; delta sync passes them through so caches can drop rows.
  if (!seqCursor) filters.push(isNull(attachmentsTable.deletedAt));

  // Unpublished drafts stay out of every read, deltas included. A no-op for attachments, which
  // carry no publishedAt; kept as the pattern app-specific entity queries copy.
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
        ilike(attachmentsTable.keywords, queryToken),
      ) as SQL,
    );
  }

  const orderBy = seqCursor
    ? [asc(attachmentsTable.seq), asc(attachmentsTable.id)]
    : getOrderColumns({
        sort,
        order,
        fallback: ['createdAt', 'desc'],
        columns: { name: attachmentsTable.name, createdAt: attachmentsTable.createdAt, contentType: attachmentsTable.contentType },
        tieBreaker: attachmentsTable.id,
      });

  const whereClause = and(...filters);
  const { createdBy: _cb, updatedBy: _mb, ...attachmentCols } = getColumns(attachmentsTable);

  const itemsQuery = db
    .select({ ...attachmentCols, ...auditUserSelect, viewCount: productViewCountSelect() })
    .from(attachmentsTable)
    .leftJoin(productCountersTable, productViewCountJoin(attachmentsTable.id))
    .leftJoin(createdByUser, eq(createdByUser.id, attachmentsTable.createdBy))
    .leftJoin(updatedByUser, eq(updatedByUser.id, attachmentsTable.updatedBy))
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  // Delta reads discard `total`; an org-wide read with no search maps to the pre-computed
  // `e:c:attachment` channel counter; anything narrower needs COUNT(*).
  const totalSource: ListTotalSource = seqCursor
    ? { kind: 'pageLength' }
    : orgWide && !q?.trim()
      ? { kind: 'counter', getTotal: () => getOrganizationEntityCount(ctx, { organizationId, entityType: 'attachment' }) }
      : {
          kind: 'exact',
          getTotal: async () => {
            const [{ total }] = await db.select({ total: count() }).from(attachmentsTable).where(whereClause);
            return total;
          },
        };

  return resolveListTotal(itemsQuery, totalSource);
};
