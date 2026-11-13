import type { z } from '@hono/zod-openapi';
import { and, count, eq, getColumns, getTableName, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { appConfig, entityIdColumnName } from 'shared';
import type { ActorContext, DbContext } from '#/core/context';
import { preconditionWhere } from '#/core/preconditions';
import { channelTables } from '#/db/channel-tables';
import { imageColumns } from '#/db/storage-columns';
import { exactTotal, type ListTotalSource, resolveListTotal } from '#/db/utils/list-total';
import { publishedRowsPredicate } from '#/db/utils/published-predicate';
import { requestScopeWhere } from '#/db/utils/request-scope';
import { attachmentsTable, type InsertAttachmentModel } from '#/modules/attachment/attachment-db';
import type { attachmentListQuerySchema } from '#/modules/attachment/attachment-schema';
import { getOrganizationEntityCount, productViewCountJoin, productViewCountSelect } from '#/modules/entities/entities-queries';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { usersTable } from '#/modules/user/user-db';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';
import { type SeqRange, seqRangeRead } from '#/utils/seq-range';
import { searchFilter } from '#/utils/sql';

// Every attachment read and write below carries the request's tenant + organization predicate, so the result is the
// same with RLS bypassed; the RLS transaction wrappers stay the backstop.

/** Inserts the rows and returns those it inserted: a row whose id exists is skipped and absent from the result. */
export const insertAttachments = async (ctx: DbContext, { attachments }: { attachments: InsertAttachmentModel[] }) =>
  ctx.var.db.insert(attachmentsTable).values(attachments).onConflictDoNothing().returning();

/**
 * Writes `values` to the attachment within the request's tenant and organization; undefined when no such row exists,
 * or when a write moved it past the request's preconditions (`preconditionWhere`).
 */
export const updateAttachment = async (ctx: ActorContext, { id, values }: { id: string; values: PgUpdateSetSource<typeof attachmentsTable> }) => {
  const [updated] = await ctx.var.db
    .update(attachmentsTable)
    .set(values)
    .where(and(eq(attachmentsTable.id, id), requestScopeWhere(ctx, attachmentsTable), preconditionWhere(ctx, attachmentsTable)))
    .returning();
  return updated;
};

/** Unknown, deleted and out-of-scope ids are absent; the caller treats absence as rejection. */
export const findAttachmentsByIds = async (ctx: ActorContext, { ids }: { ids: string[] }) =>
  ctx.var.db
    .select()
    .from(attachmentsTable)
    .where(and(inArray(attachmentsTable.id, ids), requestScopeWhere(ctx, attachmentsTable), isNull(attachmentsTable.deletedAt)));

/** `findAttachmentsByIds` for a read without a request scope, such as a visitor's: the scope comes as arguments. */
export const findLiveAttachmentsIn = async (
  ctx: DbContext,
  { ids, tenantId, organizationId }: { ids: string[]; tenantId: string; organizationId: string },
) =>
  ctx.var.db
    .select()
    .from(attachmentsTable)
    .where(
      and(
        inArray(attachmentsTable.id, ids),
        eq(attachmentsTable.tenantId, tenantId),
        eq(attachmentsTable.organizationId, organizationId),
        isNull(attachmentsTable.deletedAt),
      ),
    );

const attachmentOrderColumns = pick(attachmentsTable, ['name', 'createdAt', 'contentType']);

interface FindAttachmentsPaginatedOpts extends Pick<z.infer<typeof attachmentListQuerySchema>['orderBy'], 'sort' | 'order'> {
  organizationId: string;
  /** The caller's request scope and read scope, from guarded context and the permission layer. */
  filters: SQL[];
  /** The read scope is the whole organization, so an unfiltered total can come from the counter. */
  orgWide: boolean;
  q?: string;
  limit: number;
  offset: number;
  /** A range read for sync (`seqRangeRead`). */
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

  // A no-op for attachments, which carry no `publishedAt`; kept as the pattern app entity queries copy.
  const publishedOnly = publishedRowsPredicate(attachmentsTable);
  if (publishedOnly) filters.push(publishedOnly);

  const search = searchFilter([attachmentsTable.name, attachmentsTable.filename, attachmentsTable.contentType, attachmentsTable.keywords], q);
  if (search) filters.push(search);

  const orderBy = rangeRead.orderBy ?? getOrderColumns({ sort, order, columns: attachmentOrderColumns, tieBreaker: attachmentsTable.id });

  const whereClause = and(...filters);

  const itemsQuery = db
    .select({ ...getColumns(attachmentsTable), viewCount: productViewCountSelect() })
    .from(attachmentsTable)
    .leftJoin(productCountersTable, productViewCountJoin(attachmentsTable.id))
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const totalSource: ListTotalSource = range
    ? { kind: 'pageLength' }
    : orgWide && !search
      ? { kind: 'counter', getTotal: () => getOrganizationEntityCount(ctx, { organizationId, entityType: 'attachment' }) }
      : exactTotal(db.select({ total: count() }).from(attachmentsTable).where(whereClause));

  return resolveListTotal(itemsQuery, totalSource);
};

interface FindLiveAttachmentKeysOpts {
  tenantId: string;
  /** Storage keys to look for among the attachments' variants. */
  keys: string[];
}

/** The keys among `keys` that a live attachment of the tenant still names. */
export const findLiveAttachmentKeys = async (ctx: DbContext, { tenantId, keys }: FindLiveAttachmentKeysOpts): Promise<Set<string>> => {
  if (keys.length === 0) return new Set();
  const { rows } = await ctx.var.db.execute<{ key: string }>(sql`
    SELECT DISTINCT variant.value AS key
    FROM ${attachmentsTable}, jsonb_each_text(${attachmentsTable.keys}) AS variant
    WHERE ${attachmentsTable.tenantId} = ${tenantId} AND ${attachmentsTable.deletedAt} IS NULL AND variant.value IN ${keys}`);
  return new Set(rows.map((row) => row.key));
};

interface FindNamedImageKeysOpts {
  /** Storage keys to look for among the image URLs. */
  keys: string[];
  /** Whose rows can still name a key: the user's own row, or the organization's and its channels' rows. */
  holder: { userId: string } | { organizationId: string };
}

/**
 * The keys among `keys` that an image column of the holder's own rows still names, read off its URL as `publicKeyOf`
 * reads it. An image column takes any URL on the public CDN, but only the holder's rows keep its upload: a row of
 * another user, organization or tenant that names it neither keeps it stored nor lets it go.
 */
export const findNamedImageKeys = async (ctx: DbContext, { keys, holder }: FindNamedImageKeysOpts): Promise<Set<string>> => {
  if (keys.length === 0) return new Set();
  const base = `${appConfig.s3.publicCDNUrl}/`;
  const scopes =
    'userId' in holder
      ? [{ table: getTableName(usersTable), column: 'id', id: holder.userId }]
      : Object.entries(channelTables).map(([type, table]) => ({
          table: getTableName(table()),
          column: type === 'organization' ? 'id' : entityIdColumnName('organization'),
          id: holder.organizationId,
        }));
  const urls = scopes.flatMap(({ table, column, id }) =>
    imageColumns.map(
      (imageColumn) => sql`SELECT ${sql.identifier(imageColumn)} AS url FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} = ${id}`,
    ),
  );
  const keyOfUrl = sql`ltrim(substr(image.url, ${base.length + 1}::int), '/')`;
  const { rows } = await ctx.var.db.execute<{ key: string }>(sql`
    SELECT DISTINCT ${keyOfUrl} AS key
    FROM (${sql.join(urls, sql` UNION ALL `)}) AS image
    WHERE starts_with(image.url, ${base}) AND ${keyOfUrl} IN ${keys}`);
  return new Set(rows.map((row) => row.key));
};
