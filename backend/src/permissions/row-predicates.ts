import { and, eq, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { type Actor, appConfig, type ChannelEntityType, type RowCondition, type RowPredicate } from 'shared';
import type { CollectionReadFilter } from './collection-scope';

/**
 * Compiles row-condition SQL forms (declared ORM-free in `shared`, see
 * `shared/src/permissions/row-conditions.ts`) into drizzle predicates, and assembles the
 * full WHERE clause for a conditionally-scoped collection read.
 *
 * The compiled SQL must agree with each condition's check-form, asserted by the parity
 * property test (`row-predicates.test.ts`).
 */

/** A never-matching predicate: the SQL analogue of a check-form returning `false`. */
const NEVER: SQL = sql`false`;

const resolveColumn = (table: AnyPgTable, columnName: string, conditionName: string): PgColumn => {
  const column = (table as unknown as Record<string, PgColumn | undefined>)[columnName];
  if (!column) {
    throw new Error(
      `[Permission] Row condition "${conditionName}" reads column "${columnName}" which does not exist on the queried table`,
    );
  }
  return column;
};

/**
 * Compile a single row condition to a predicate over `table`'s rows for the acting user.
 * Anonymous actors never match actor-bound forms, mirroring the check-form.
 */
export const compileRowConditionSql = (condition: RowCondition, table: AnyPgTable, actor: Actor): SQL => {
  const predicate: RowPredicate = condition.predicate;
  const column = resolveColumn(table, predicate.column, condition.name);

  switch (predicate.kind) {
    case 'columnEqualsActor': {
      const userId = 'anonymous' in actor ? undefined : actor.userId;
      if (!userId) return NEVER;
      return eq(column, userId);
    }
    // Actor-independent (public read): matches for anonymous actors too.
    case 'columnIsNotNull':
      return isNotNull(column);
  }
};

/**
 * Assembled WHERE clause for a collection read. Discriminated so "no restriction" can
 * never be confused with "no rows". Returning a bare `undefined` where-clause for an
 * empty scope would leak the whole table.
 */
export type CollectionReadWhere =
  | { kind: 'all' } // org-wide unconditional read: no scope restriction needed
  | { kind: 'none' } // no readable scope: op should return an empty list without querying
  | { kind: 'where'; where: SQL };

/**
 * Build the row-scope WHERE clause for a collection read from a resolved filter:
 * `(subChannel IN unconditional ids) OR (condition SQL AND subChannel IN conditional ids) OR …`.
 *
 * Deep chains: entries tagged with an intermediate `channelType` (e.g. course grants on
 * a project-homed entity) are scoped by THAT level's own id column, resolved via
 * `appConfig.entityIdColumnKeys` — on tables with denormalized ancestor columns an
 * intermediate id covers every row physically below it.
 *
 * @param filter - Resolved scope filter (`resolveCollectionReadFilter`).
 * @param table - The product table being queried.
 * @param subChannelColumn - The table's home sub-context id column (e.g. `tasks.projectId`).
 * @param actor - Who is asking; row conditions compile against it.
 */
export const buildCollectionReadWhere = (
  filter: CollectionReadFilter,
  table: AnyPgTable,
  subChannelColumn: PgColumn,
  actor: Actor,
): CollectionReadWhere => {
  // Org-wide unconditional read (conditional scopes are subsumed and already dropped).
  if (filter.subChannelIds === undefined) return { kind: 'all' };

  /**
   * The id column a scope entry filters by: its own level's column, or the home column.
   * Column keys come from `appConfig.entityIdColumnKeys`; a synthetic topology level
   * (parity tests) is absent there and falls back to the `${channelType}Id` convention
   * the config validator enforces for real entities.
   */
  const scopeColumn = (channelType: ChannelEntityType | undefined): PgColumn =>
    channelType
      ? resolveColumn(
          table,
          (appConfig.entityIdColumnKeys as Partial<Record<string, string>>)[channelType] ?? `${channelType}Id`,
          `${channelType} scope`,
        )
      : subChannelColumn;

  const clauses: SQL[] = [];

  if (filter.subChannelIds.length > 0) {
    clauses.push(inArray(subChannelColumn, filter.subChannelIds));
  }

  for (const { channelType, subChannelIds } of filter.ancestorScopes ?? []) {
    if (subChannelIds.length === 0) continue;
    clauses.push(inArray(scopeColumn(channelType), subChannelIds));
  }

  // HOME-scoped grants (elevatedRoles): the grant level's column matches AND every
  // more-specific ancestor column is NULL — rows homed exactly at that level.
  for (const { channelType, subChannelIds, deeperChannels } of filter.homeScopes ?? []) {
    if (subChannelIds.length === 0) continue;
    const scoped = and(
      inArray(scopeColumn(channelType), subChannelIds),
      ...deeperChannels.map((deeper) => isNull(scopeColumn(deeper))),
    );
    if (scoped) clauses.push(scoped);
  }

  for (const { condition, subChannelIds, channelType, deeperChannels } of filter.conditionalScopes) {
    const conditionSql = compileRowConditionSql(condition, table, actor);
    const homeNulls = (deeperChannels ?? []).map((deeper) => isNull(scopeColumn(deeper)));
    if (subChannelIds === undefined) {
      // Org-wide conditional grant: condition (plus home NULLs, if home-scoped) bounds the rows.
      const scoped = homeNulls.length > 0 ? and(conditionSql, ...homeNulls) : conditionSql;
      if (scoped) clauses.push(scoped);
      continue;
    }
    if (subChannelIds.length === 0) continue;
    const scoped = and(inArray(scopeColumn(channelType), subChannelIds), conditionSql, ...homeNulls);
    if (scoped) clauses.push(scoped);
  }

  if (clauses.length === 0) return { kind: 'none' };
  const where = clauses.length === 1 ? clauses[0] : or(...clauses);
  if (!where) return { kind: 'none' };
  return { kind: 'where', where };
};
