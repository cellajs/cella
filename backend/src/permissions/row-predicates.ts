import { and, eq, getColumns, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { type Access, entityIdColumnKey, type RowConditionName } from 'shared';
import type { CollectionReadFilter } from '#/permissions/collection-scope';

/** A never-matching predicate: the SQL analogue of a check-form returning `false`. */
const neverPredicate: SQL = sql`false`;

const resolveColumn = (table: AnyPgTable, columnName: string, conditionName: string): PgColumn => {
  const column: PgColumn | undefined = getColumns(table)[columnName];
  if (!column) {
    throw new Error(`[Permission] Row condition "${conditionName}" reads column "${columnName}" which does not exist on the queried table`);
  }
  return column;
};

/** SQL twin of the check-form `matchesRowCondition` (parity-tested); a visitor never matches an actor-bound form. */
const compileRowConditionSql = (name: RowConditionName, table: AnyPgTable, access: Access): SQL => {
  switch (name) {
    case 'own': {
      const actorId = 'visitor' in access ? undefined : access.actorId;
      return actorId ? eq(resolveColumn(table, 'createdBy', name), actorId) : neverPredicate;
    }
    // Actor-independent (public read): matches for a visitor too.
    case 'public':
      return eq(resolveColumn(table, 'public', name), true);
  }
};

/**
 * The predicate of a product list, never unset: an empty scope cannot become a missing filter that leaks the table.
 * An org-wide filter reads the rows of `organizationId`, a filter without scopes reads none, and any other filter
 * OR-combines its scopes: per scope, its level's id column in its ids, its condition, and NULL in the columns of
 * `deeperChannels`.
 * @param organizationId - The organization the filter was resolved for.
 */
export const buildCollectionReadWhere = (filter: CollectionReadFilter, table: AnyPgTable, access: Access, organizationId: string): SQL => {
  const levelColumn = (channelType: string): PgColumn => resolveColumn(table, entityIdColumnKey(channelType), `${channelType} scope`);

  if (filter.orgWide) return eq(levelColumn('organization'), organizationId);

  const clauses = filter.scopes.flatMap(({ channelType, channelIds, condition, deeperChannels = [] }) => {
    const scoped = and(
      inArray(levelColumn(channelType), channelIds),
      ...(condition ? [compileRowConditionSql(condition, table, access)] : []),
      ...deeperChannels.map((deeper) => isNull(levelColumn(deeper))),
    );
    return scoped ? [scoped] : [];
  });

  // A fresh predicate each time: a caller may append to the one it gets.
  return or(...clauses) ?? sql`false`;
};
