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

/** WHERE clause for a collection read, discriminated so an empty scope cannot become a bare `undefined` that leaks the table. */
export type CollectionReadWhere =
  /** Org-wide unconditional read: no scope restriction needed. */
  | { kind: 'all' }
  /** No readable scope: the operation returns an empty list without querying. */
  | { kind: 'none' }
  | { kind: 'where'; where: SQL };

/**
 * OR-combines the resolved collection scopes into the predicate of a product list: per scope, its level's id column
 * in its ids, its condition, and NULL in the columns of `deeperChannels`.
 */
export const buildCollectionReadWhere = (filter: CollectionReadFilter, table: AnyPgTable, access: Access): CollectionReadWhere => {
  if (filter.orgWide) return { kind: 'all' };

  const levelColumn = (channelType: string): PgColumn => resolveColumn(table, entityIdColumnKey(channelType), `${channelType} scope`);

  const clauses = filter.scopes.flatMap(({ channelType, channelIds, condition, deeperChannels = [] }) => {
    const scoped = and(
      inArray(levelColumn(channelType), channelIds),
      ...(condition ? [compileRowConditionSql(condition, table, access)] : []),
      ...deeperChannels.map((deeper) => isNull(levelColumn(deeper))),
    );
    return scoped ? [scoped] : [];
  });

  const where = or(...clauses);
  return where ? { kind: 'where', where } : { kind: 'none' };
};
