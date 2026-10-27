import { getColumns, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { appConfig, type ChannelEntityType, hierarchy, isChannel, type ProductEntityType } from 'shared';

/**
 * SQL for a product row's home channel id: deepest non-null ancestor, the organization as the
 * fallback. The seen module keys unseen counts on it and the notification fan-out stores it as
 * `channelId` (`homeChannelOf`, the row-side twin), so badges and inbox rows always agree about a
 * row's channel.
 */
export function homeChannelIdSql(productType: ProductEntityType, table: AnyPgTable): SQL<string> {
  const columns = getColumns(table) as Record<string, PgColumn | undefined>;
  const ancestorColumns = hierarchy
    .getOrderedAncestors(productType)
    .map((ancestor) => columns[appConfig.entityIdColumnKeys[ancestor]])
    .filter((column): column is PgColumn => Boolean(column));
  if (ancestorColumns.length === 0) throw new Error(`homeChannelIdSql: ${productType} table carries no ancestor id column`);
  return sql<string>`COALESCE(${sql.join(ancestorColumns, sql`, `)})`;
}

/** A product row's home channel, the row-side twin of `homeChannelIdSql`: deepest non-null ancestor, else the organization. */
export function homeChannelOf(
  productType: ProductEntityType,
  row: Record<string, unknown> & { organizationId: string },
): { id: string; type: ChannelEntityType } {
  const [deepest] = hierarchy.resolveNonNullAncestors(productType, row);
  if (deepest && isChannel(deepest.type)) return { id: deepest.id, type: deepest.type };
  return { id: row.organizationId, type: 'organization' };
}
