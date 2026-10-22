import { and, count, eq, getColumns, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { ActorContext, DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { type ListTotalSource, resolveListTotal } from '#/db/utils/list-total';
import { publishedRowsPredicate } from '#/db/utils/published-predicate';
import { requestScopeWhere } from '#/db/utils/request-scope';
import { deleteStamps } from '#/db/utils/stamps';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { getOrganizationEntityCount, productViewCountJoin, productViewCountSelect } from '#/modules/entities/entities-queries';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { getOrderColumns } from '#/utils/order-column';
import { type SeqRange, seqRangeRead } from '#/utils/seq-range';
import { textSearchFilter } from '#/utils/sql';

// Every read and write below carries the request's tenant + organization predicate, so the
// result is the same with RLS bypassed; the RLS transaction wrappers stay the backstop.

export const insertAttachments = async (ctx: DbContext, { attachments }: { attachments: (typeof attachmentsTable.$inferInsert)[] }) => {
  const { db } = ctx.var;
  return db.insert(attachmentsTable).values(attachments).onConflictDoNothing().returning();
};

interface UpdateAttachmentOpts {
  id: string;
  values: PgUpdateSetSource<typeof attachmentsTable>;
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
  /** Who deletes: stamped as the tombstone and as the row's last write. */
  actorId: ActorId;
}

/** Soft-deletes the rows and returns them, for the `attachment.deleted` event. */
export const deleteAttachmentsByIds = async (ctx: ActorContext, { ids, actorId }: DeleteAttachmentsByIdsOpts) => {
  const { db } = ctx.var;
  return db
    .update(attachmentsTable)
    .set(deleteStamps(actorId))
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
  /** A range read for sync: deleted rows included, in sequence order, total from the page length. */
  range?: SeqRange;
}

/**
 * A page of attachments with their audit users and view counts. Normal reads hide deleted rows and every read hides
 * unpublished drafts; a range read passes deleted rows through so caches can drop them. The total is the page length
 * for a range read, the `e:c:attachment` counter for an org-wide read without search, else a COUNT.
 */
export const findAttachmentsPaginated = async (ctx: ActorContext, opts: FindAttachmentsPaginatedOpts) => {
  const { db } = ctx.var;
  const { organizationId, orgWide, q, sort, order, limit, offset, range } = opts;
  const rangeRead = seqRangeRead(attachmentsTable, range);
  const filters = [...opts.filters, ...rangeRead.where];

  // Unpublished drafts stay out of every read, range reads included. A no-op for attachments, which
  // carry no publishedAt; kept as the pattern app-specific entity queries copy.
  const publishedOnly = publishedRowsPredicate(attachmentsTable);
  if (publishedOnly) filters.push(publishedOnly);

  if (q?.trim()) {
    filters.push(
      or(
        textSearchFilter(attachmentsTable.name, q),
        textSearchFilter(attachmentsTable.filename, q),
        textSearchFilter(attachmentsTable.contentType, q),
        textSearchFilter(attachmentsTable.keywords, q),
      ) as SQL,
    );
  }

  const orderBy =
    rangeRead.orderBy ??
    getOrderColumns({
      sort,
      order,
      fallback: ['createdAt', 'desc'],
      columns: { name: attachmentsTable.name, createdAt: attachmentsTable.createdAt, contentType: attachmentsTable.contentType },
      tieBreaker: attachmentsTable.id,
    });

  const whereClause = and(...filters);

  // Writer ids stay ids here; the operation resolves them to references for the page (`withActorRefs`).
  const itemsQuery = db
    .select({ ...getColumns(attachmentsTable), viewCount: productViewCountSelect() })
    .from(attachmentsTable)
    .leftJoin(productCountersTable, productViewCountJoin(attachmentsTable.id))
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  // Range reads discard `total`; an org-wide read with no search maps to the pre-computed
  // `e:c:attachment` channel counter; anything narrower needs COUNT(*).
  const totalSource: ListTotalSource = range
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
