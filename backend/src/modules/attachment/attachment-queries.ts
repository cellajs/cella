import { and, count, eq, getColumns, getTableName, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { appConfig, entityIdColumnName } from 'shared';
import type { ActorContext, DbContext } from '#/core/context';
import { channelTables } from '#/db/channel-tables';
import { imageColumns } from '#/db/storage-columns';
import type { ActorId } from '#/db/utils/ids';
import { type ListTotalSource, resolveListTotal } from '#/db/utils/list-total';
import { publishedRowsPredicate } from '#/db/utils/published-predicate';
import { requestScopeWhere } from '#/db/utils/request-scope';
import { deleteStamps } from '#/db/utils/stamps';
import { attachmentsTable, type InsertAttachmentModel } from '#/modules/attachment/attachment-db';
import { getOrganizationEntityCount, productViewCountJoin, productViewCountSelect } from '#/modules/entities/entities-queries';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { usersTable } from '#/modules/user/user-db';
import { getOrderColumns } from '#/utils/order-column';
import { type SeqRange, seqRangeRead } from '#/utils/seq-range';
import { textSearchFilter } from '#/utils/sql';

// Every attachment read and write below carries the request's tenant + organization predicate, so the result is the
// same with RLS bypassed; the RLS transaction wrappers stay the backstop.

interface InsertAttachmentsOpts {
  attachments: InsertAttachmentModel[];
}

/** Inserts the rows and returns those it inserted: a row whose id exists is skipped and absent from the result. */
export const insertAttachments = async (ctx: DbContext, { attachments }: InsertAttachmentsOpts) => {
  const { db } = ctx.var;
  return db.insert(attachmentsTable).values(attachments).onConflictDoNothing().returning();
};

interface UpdateAttachmentOpts {
  id: string;
  values: PgUpdateSetSource<typeof attachmentsTable>;
}

/** Writes `values` to the attachment within the request's tenant and organization; undefined when no such row exists. */
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

  const search = q?.trim();
  if (search) {
    filters.push(
      or(
        textSearchFilter(attachmentsTable.name, search),
        textSearchFilter(attachmentsTable.filename, search),
        textSearchFilter(attachmentsTable.contentType, search),
        textSearchFilter(attachmentsTable.keywords, search),
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

  const totalSource: ListTotalSource = range
    ? { kind: 'pageLength' }
    : orgWide && !search
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
