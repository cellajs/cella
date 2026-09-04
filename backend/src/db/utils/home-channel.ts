import { getColumns, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { appConfig, hierarchy, type ProductEntityType } from 'shared';

/**
 * SQL for a product row's home channel id: deepest non-null ancestor, the organization as the
 * fallback. The seen module keys unseen counts on it and the notification fan-out stores it as
 * `channelId` (`hierarchy.resolveNonNullAncestors`, the row-side twin), so badges and inbox rows
 * always agree about a row's channel.
 */
export function homeChannelIdSql(productType: ProductEntityType, table: AnyPgTable): SQL<string> {
  const columns = getColumns(table) as Record<string, PgColumn | undefined>;
  const ancestorColumns = hierarchy
    .getOrderedAncestors(productType)
    .map((ancestor) => columns[appConfig.entityIdColumnKeys[ancestor]])
    .filter((column): column is PgColumn => Boolean(column));
  if (ancestorColumns.length === 0)
    throw new Error(`homeChannelIdSql: ${productType} table carries no ancestor id column`);
  return sql<string>`COALESCE(${sql.join(ancestorColumns, sql`, `)})`;
}
