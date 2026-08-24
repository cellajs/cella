import { eq, getTableColumns, or, type SQL } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { appConfig, hierarchy, type ProductEntityType } from 'shared';

/**
 * Matches every row homed at or below the covering channel, at any depth, via `OR(eq(ancestorIdColumn,
 * channelId))` over the denormalized non-root ancestor columns. Apply as an explicit AND on top of the read
 * scope: folding the covering id into the permission scope would let an intermediate grant widen the read
 * past the requested subtree. Undefined for an org-homed entity or an absent channelId.
 */
export function buildSubtreeCoverWhere(
  table: AnyPgTable,
  entityType: ProductEntityType,
  channelId: string | undefined,
): SQL | undefined {
  if (!channelId) return undefined;

  const columns = getTableColumns(table) as Record<string, PgColumn>;
  // getOrderedAncestors runs most-specific to root; the root is dropped since covering is by sub-channel.
  const predicates = hierarchy
    .getOrderedAncestors(entityType)
    .slice(0, -1)
    .map((ancestor) => columns[appConfig.entityIdColumnKeys[ancestor]])
    .filter((column): column is PgColumn => column !== undefined)
    .map((column) => eq(column, channelId));

  if (predicates.length === 0) return undefined;
  return predicates.length === 1 ? predicates[0] : or(...predicates);
}
