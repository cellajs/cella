import { count, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { baseDb } from '#/db/db';
import { pagesTable } from '#/modules/page/page-db';
import { buildPagesListQuery } from '#/modules/page/page-queries';
import { coalesceAuditUsers, createdByUser } from '#/modules/user/helpers/audit-user';
import { getOrderColumn } from '#/utils/order-column';
import { seqCursorFilters } from '#/utils/seq-cursor';
import { prepareStringForILikeFilter } from '#/utils/sql';

interface GetPagesOpts {
  q?: string;
  sort?: 'createdAt' | 'name' | 'status' | 'displayOrder';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
  seqCursor?: string;
}

export const getPages = async (opts: GetPagesOpts) => {
  const { q, sort, order, limit, offset, seqCursor } = opts;

  const db = baseDb;
  const matchMode = 'all';

  const filters: SQL[] = [];

  if (!seqCursor) {
    filters.push(isNull(pagesTable.deletedAt));
  }

  filters.push(...seqCursorFilters(pagesTable.seq, seqCursor));

  const trimmedQuery = q?.trim();
  if (trimmedQuery) {
    const searchTerms = trimmedQuery.split(/\s+/).filter(Boolean);

    const queryToken = prepareStringForILikeFilter(trimmedQuery);
    const qFilters =
      matchMode === 'all' || searchTerms.length === 1
        ? [
            ilike(pagesTable.name, queryToken),
            ilike(pagesTable.keywords, queryToken),
            ilike(pagesTable.description, queryToken),
            ilike(createdByUser.name, queryToken),
            ilike(createdByUser.email, queryToken),
          ]
        : [
            inArray(pagesTable.name, searchTerms),
            inArray(pagesTable.keywords, searchTerms),
            inArray(pagesTable.description, searchTerms),
            inArray(createdByUser.name, searchTerms),
            inArray(createdByUser.email, searchTerms),
          ];

    filters.push(or(...qFilters) as SQL);
  }

  const orderColumn = getOrderColumn(sort, pagesTable.status, order, {
    status: pagesTable.status,
    createdAt: pagesTable.createdAt,
    name: pagesTable.name,
    displayOrder: pagesTable.displayOrder,
  });

  const pagesQuery = buildPagesListQuery({ var: { db } }, { filters });

  const [items, total] = await Promise.all([
    pagesQuery.orderBy(orderColumn).limit(limit).offset(offset),
    db
      .select({ total: count() })
      .from(pagesQuery.as('pages'))
      .then(([{ total }]) => total),
  ]);

  return { items: coalesceAuditUsers(items), total };
};
