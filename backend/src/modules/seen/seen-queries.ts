import { and, count, getColumns, gt, inArray, isNotNull, isNull, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { SeenTrackedProductType } from 'shared';
import type { DbContext } from '#/core/context';
import { homeChannelIdSql } from '#/db/utils/home-channel';
import { seenByTable } from '#/modules/seen/seen-by-db';
import { getEntityTable } from '#/tables';

type OrgScopedEntityTable = AnyPgTable & {
  id: PgColumn;
  organizationId: PgColumn;
  createdAt: PgColumn;
};

interface FindUnseenCountsByUserOpts {
  userId: string;
  channelIds: string[];
  productTypes: readonly SeenTrackedProductType[];
  cutoff: string;
  /** Per-type collection read filter. An `undefined` value or an absent type counts unrestricted, so callers pre-drop types scoped `none`. */
  scopeWhereByType?: Partial<Record<SeenTrackedProductType, SQL | undefined>>;
}

/** Counts readable, live, unseen rows in the recency window by home context. Draft-lifecycle rows use publish time, others creation time; `unseen-sync.ts` mirrors this. */
export const findUnseenCountsByUser = async (
  ctx: DbContext,
  { userId, channelIds, productTypes, cutoff, scopeWhereByType }: FindUnseenCountsByUserOpts,
) => {
  const { db } = ctx.var;
  const rows: { channelId: string; productType: SeenTrackedProductType; unseenCount: number }[] = [];

  for (const productType of productTypes) {
    const entityTable = getEntityTable(productType);
    const orgTable = entityTable as OrgScopedEntityTable;
    const columns = getColumns(entityTable) as Record<string, PgColumn | undefined>;

    const channelIdColumn = homeChannelIdSql(productType, entityTable);

    // Recency key: publish time on draft-lifecycle tables, createdAt elsewhere.
    const recencyColumn: SQL<string> = columns.publishedAt
      ? sql<string>`COALESCE(${columns.publishedAt}, ${orgTable.createdAt})`
      : sql<string>`${orgTable.createdAt}`;

    const filters: SQL[] = [
      inArray(channelIdColumn, channelIds),
      gt(recencyColumn, cutoff),
      sql`NOT EXISTS (SELECT 1 FROM ${seenByTable} WHERE ${seenByTable.userId} = ${userId} AND ${seenByTable.productId} = ${orgTable.id})`,
    ];
    if (columns.deletedAt) filters.push(isNull(columns.deletedAt));
    // Feed parity: unpublished drafts are hidden from every feed, so they are never unseen.
    if (columns.publishedAt) filters.push(isNotNull(columns.publishedAt));
    const scopeWhere = scopeWhereByType?.[productType];
    if (scopeWhere) filters.push(scopeWhere);

    const entityRows = await db
      .select({
        channelId: channelIdColumn,
        productType: sql<SeenTrackedProductType>`${productType}`,
        unseenCount: count(),
      })
      .from(entityTable)
      .where(and(...filters))
      .groupBy(channelIdColumn);

    rows.push(...entityRows.map((row) => ({ ...row, unseenCount: Number(row.unseenCount) })));
  }

  return rows;
};
