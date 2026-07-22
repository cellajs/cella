import { and, count, getColumns, gt, inArray, isNotNull, isNull, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { SeenTrackedProductType } from 'shared';
import { appConfig, hierarchy } from 'shared';
import type { DbContext } from '#/core/context';
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
  /**
   * Per-type collection read filter (same SQL compiler as list endpoints), so badges
   * only count rows the user can actually fetch. `undefined` value = unrestricted
   * scope for that type; a type absent from the record is counted unrestricted too
   * (callers should pre-drop types whose scope resolved to `none`).
   */
  scopeWhereByType?: Partial<Record<SeenTrackedProductType, SQL | undefined>>;
}

/**
 * Counts readable, live, unseen rows within the recency window by home context.
 * Per-entity `NOT EXISTS` queries avoid total-minus-seen skew. Draft-lifecycle rows use
 * publish time while other rows use creation time; `unseen-sync.ts` mirrors this rule.
 * Seen-record retention matches the window, so expired records cannot reintroduce a row.
 */
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

    // Home context id: deepest non-null ancestor, falling back to org (matches mark-seen).
    const ancestorColumns = hierarchy
      .getOrderedAncestors(productType)
      .map((ancestor) => columns[appConfig.entityIdColumnKeys[ancestor]])
      .filter((column): column is PgColumn => Boolean(column));
    const channelIdColumn: SQL<string> = ancestorColumns.length
      ? sql<string>`COALESCE(${sql.join(ancestorColumns, sql`, `)})`
      : sql<string>`${orgTable.organizationId}`;

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
