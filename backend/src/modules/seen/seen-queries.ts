import { and, count, getColumns, gt, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { SeenTrackedEntityType } from 'shared';
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
  contextIds: string[];
  entityTypes: readonly SeenTrackedEntityType[];
  cutoff: string;
  /**
   * Per-type collection read predicate (same compiler as list endpoints), so badges
   * only count rows the user can actually fetch. `undefined` value = unrestricted
   * scope for that type; a type absent from the record is counted unrestricted too
   * (callers should pre-drop types whose scope resolved to `none`).
   */
  scopeWhereByType?: Partial<Record<SeenTrackedEntityType, SQL | undefined>>;
}

/**
 * Count tracked entities the user has NOT seen, grouped by their home context.
 *
 * "Unseen" = live tracked rows created within the seen window (`cutoff`) that have no seen_by
 * record for this user, restricted to rows the user's read scope can fetch (mirror rule: the
 * badge counts exactly what the corresponding list endpoint would return). Computed per entity
 * type as a single NOT EXISTS query — exact per-entity, so no total-minus-seen aggregate skew
 * (a recently-viewed row that just aged out of the window can no longer cancel a different
 * in-window row).
 *
 * The window lives only here, on entity.createdAt. seen_by is retention-bounded (pg_partman) to
 * the same 90 days on view time, and because viewTime >= createdAt, a seen row can only be dropped
 * once its entity is already out of this window — so NOT EXISTS on a dropped row never miscounts.
 */
export const findUnseenCountsByUser = async (
  ctx: DbContext,
  { userId, contextIds, entityTypes, cutoff, scopeWhereByType }: FindUnseenCountsByUserOpts,
) => {
  const { db } = ctx.var;
  const rows: { contextId: string; entityType: string; unseenCount: number }[] = [];

  for (const entityType of entityTypes) {
    const entityTable = getEntityTable(entityType);
    const orgTable = entityTable as OrgScopedEntityTable;
    const columns = getColumns(entityTable) as Record<string, PgColumn | undefined>;

    // Home context id: deepest non-null ancestor, falling back to org (matches mark-seen).
    const ancestorColumns = hierarchy
      .getOrderedAncestors(entityType)
      .map((ancestor) => columns[appConfig.entityIdColumnKeys[ancestor]])
      .filter((column): column is PgColumn => Boolean(column));
    const contextIdColumn: SQL<string> = ancestorColumns.length
      ? sql<string>`COALESCE(${sql.join(ancestorColumns, sql`, `)})`
      : sql<string>`${orgTable.organizationId}`;

    const filters: SQL[] = [
      inArray(contextIdColumn, contextIds),
      gt(orgTable.createdAt, cutoff),
      sql`NOT EXISTS (SELECT 1 FROM ${seenByTable} WHERE ${seenByTable.userId} = ${userId} AND ${seenByTable.entityId} = ${orgTable.id})`,
    ];
    if (columns.deletedAt) filters.push(isNull(columns.deletedAt));
    // Forks add feed-parity filters here (e.g. excluding draft rows the feed hides).
    const scopeWhere = scopeWhereByType?.[entityType];
    if (scopeWhere) filters.push(scopeWhere);

    const entityRows = await db
      .select({
        contextId: contextIdColumn,
        entityType: sql<string>`${entityType}`,
        unseenCount: count(),
      })
      .from(entityTable)
      .where(and(...filters))
      .groupBy(contextIdColumn);

    rows.push(...entityRows.map((row) => ({ ...row, unseenCount: Number(row.unseenCount) })));
  }

  return rows;
};
