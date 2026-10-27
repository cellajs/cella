import { and, eq, getColumns, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import {
  hierarchy as appHierarchy,
  type ChannelEntityType,
  type EntityHierarchy,
  entityIdColumnKey,
  type PredicateActor,
  type ProductEntityType,
  type RowConditionName,
} from 'shared';
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

/** SQL twin of the check-form `matchesRowCondition` (parity-tested); anonymous actors never match actor-bound forms. */
const compileRowConditionSql = (name: RowConditionName, table: AnyPgTable, actor: PredicateActor): SQL => {
  switch (name) {
    case 'own': {
      const actorId = 'anonymous' in actor ? undefined : actor.actorId;
      if (!actorId) return neverPredicate;
      return eq(resolveColumn(table, 'createdBy', name), actorId);
    }
    // Actor-independent (public read): matches for anonymous actors too.
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
 * OR-combines the resolved collection scopes into the predicate of a product list. Intermediate grants filter by
 * their own denormalized ancestor id column. Home grants filter by the id column of the product's declared parent,
 * the level the scope resolver collects `homeChannelIds` at whether or not that ancestor is nullable; for a product
 * that lives in the organization that is the organization column.
 * @param entityType - The product the filter was resolved for; its table is `table`.
 * @param hierarchy - Another hierarchy than the app's, for the parity tests on a synthetic one.
 */
export const buildCollectionReadWhere = (
  filter: CollectionReadFilter,
  table: AnyPgTable,
  entityType: ProductEntityType,
  actor: PredicateActor,
  hierarchy: EntityHierarchy = appHierarchy,
): CollectionReadWhere => {
  // Org-wide unconditional read (conditional scopes are subsumed and already dropped).
  if (filter.homeChannelIds === undefined) return { kind: 'all' };

  const homeChannelColumn = () =>
    resolveColumn(table, entityIdColumnKey(hierarchy.getParent(entityType) ?? 'organization'), `${entityType} home scope`);

  /** The id column a scope entry filters by: its level's, or the home column for an entry that names no level. */
  const scopeColumn = (channelType: ChannelEntityType | undefined): PgColumn =>
    channelType ? resolveColumn(table, entityIdColumnKey(channelType), `${channelType} scope`) : homeChannelColumn();

  const clauses: SQL[] = [];

  if (filter.homeChannelIds.length > 0) {
    clauses.push(inArray(homeChannelColumn(), filter.homeChannelIds));
  }

  for (const { channelType, channelIds } of filter.intermediateScopes ?? []) {
    if (channelIds.length === 0) continue;
    clauses.push(inArray(scopeColumn(channelType), channelIds));
  }

  // HOME-scoped grants (non-elevated): the grant level's column matches AND every deeper ancestor column is NULL.
  for (const { channelType, channelIds, deeperChannels } of filter.homeScopes ?? []) {
    if (channelIds.length === 0) continue;
    const deeperNulls = deeperChannels.map((deeper) => isNull(scopeColumn(deeper)));
    const scoped = and(inArray(scopeColumn(channelType), channelIds), ...deeperNulls);
    if (scoped) clauses.push(scoped);
  }

  for (const { condition, channelIds, channelType, deeperChannels } of filter.conditionalScopes) {
    const conditionSql = compileRowConditionSql(condition, table, actor);
    const homeNulls = (deeperChannels ?? []).map((deeper) => isNull(scopeColumn(deeper)));
    if (channelIds === undefined) {
      // Org-wide conditional grant: condition (plus home NULLs, if home-scoped) bounds the rows.
      const scoped = homeNulls.length > 0 ? and(conditionSql, ...homeNulls) : conditionSql;
      if (scoped) clauses.push(scoped);
      continue;
    }
    if (channelIds.length === 0) continue;
    const scoped = and(inArray(scopeColumn(channelType), channelIds), conditionSql, ...homeNulls);
    if (scoped) clauses.push(scoped);
  }

  const where = or(...clauses);
  return where ? { kind: 'where', where } : { kind: 'none' };
};
