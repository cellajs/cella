import { and, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { qualifyingDepths, type RowCondition, type RowConditionSqlForm } from 'shared';
import type { CollectionReadFilter, RestrictedScope } from './collection-scope';

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
 * Anonymous actors (`userId` undefined) never match actor-bound forms, mirroring the check-form.
 */
export const compileRowConditionSql = (condition: RowCondition, table: AnyPgTable, userId: string | undefined): SQL => {
  const form: RowConditionSqlForm = condition.sqlForm;
  switch (form.kind) {
    case 'columnEqualsActor': {
      if (!userId) return NEVER;
      return eq(resolveColumn(table, form.column, condition.name), userId);
    }
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
 * SQL-form of a row restriction for ONE membership grant (see
 * `shared/src/permissions/row-restrictions.ts` for semantics; this must agree with
 * `membershipGrantQualifies`, asserted by the parity property test):
 * - depth: row depth is NULL or among the depths this grant's context level qualifies for
 * - roles: row audience is NULL/empty or contains this grant's role
 */
const restrictionPredicates = (
  restricted: RestrictedScope,
  grant: { contextType: (typeof restricted.orderedContexts)[number]; role: string },
  table: AnyPgTable,
): SQL[] => {
  const predicates: SQL[] = [];
  const { restriction, orderedContexts } = restricted;

  if (restriction.depthColumn) {
    const column = resolveColumn(table, restriction.depthColumn, 'visibilityDepth restriction');
    const depths = qualifyingDepths(orderedContexts, grant.contextType);
    const predicate = depths.length > 0 ? or(isNull(column), inArray(column, depths)) : isNull(column);
    if (predicate) predicates.push(predicate);
  }

  if (restriction.rolesColumn) {
    const column = resolveColumn(table, restriction.rolesColumn, 'audienceRoles restriction');
    const predicate = or(isNull(column), sql`cardinality(${column}) = 0`, sql`${grant.role} = any(${column})`);
    if (predicate) predicates.push(predicate);
  }

  return predicates;
};

/**
 * Build the row-scope WHERE clause for a collection read from a resolved filter:
 * `(subContext IN unconditional ids) OR (condition SQL AND subContext IN conditional ids)
 *  OR (restriction predicates for grant AND subContext IN grant ids) OR …`.
 *
 * @param filter - Resolved scope filter (`resolveCollectionReadFilter`).
 * @param table - The product table being queried.
 * @param subContextColumn - The table's sub-context id column (e.g. `tasks.projectId`).
 * @param userId - The acting user id; undefined for anonymous actors.
 */
export const buildCollectionReadWhere = (
  filter: CollectionReadFilter,
  table: AnyPgTable,
  subContextColumn: PgColumn,
  userId: string | undefined,
): CollectionReadWhere => {
  // Org-wide unconditional read (conditional scopes are subsumed and already dropped).
  if (filter.subContextIds === undefined) return { kind: 'all' };

  const clauses: SQL[] = [];

  if (filter.subContextIds.length > 0) {
    clauses.push(inArray(subContextColumn, filter.subContextIds));
  }

  for (const { condition, subContextIds } of filter.conditionalScopes) {
    const conditionSql = compileRowConditionSql(condition, table, userId);
    if (subContextIds === undefined) {
      // Org-wide conditional grant: condition alone bounds the rows.
      clauses.push(conditionSql);
      continue;
    }
    if (subContextIds.length === 0) continue;
    const scoped = and(inArray(subContextColumn, subContextIds), conditionSql);
    if (scoped) clauses.push(scoped);
  }

  if (filter.restricted) {
    for (const grant of filter.restricted.grants) {
      const predicates = restrictionPredicates(filter.restricted, grant, table);
      if (grant.subContextIds !== undefined) {
        if (grant.subContextIds.length === 0) continue;
        predicates.unshift(inArray(subContextColumn, grant.subContextIds));
      }
      const scoped = predicates.length === 1 ? predicates[0] : and(...predicates);
      if (scoped) clauses.push(scoped);
    }
  }

  if (clauses.length === 0) return { kind: 'none' };
  const where = clauses.length === 1 ? clauses[0] : or(...clauses);
  if (!where) return { kind: 'none' };
  return { kind: 'where', where };
};
