/**
 * Row-local read qualifiers — the closed set of rules the permission system enforces per row.
 *
 * There are exactly two, and this is not a fork extension point: `own` (defined here) and
 * `publicRow` (in `public-read.ts`). Both are a {@link RowPredicate} over the row's OWN columns.
 * A rule that needed a second row, a join, or actor data beyond the user id has no place here —
 * it could not be enforced identically in the three paths that must agree: the engine's JS
 * check, the backend's compiled SQL, and CDC stream dispatch (which only ever ships the row
 * itself). See `cella/PERMISSIONS.md`.
 */

/**
 * The closed vocabulary of row predicates.
 *
 * This union IS the contract. Adding a `kind` is a deliberate edit to the two interpreters that
 * read it — the JS {@link rowPredicateMatches} here and the SQL `compileRowConditionSql` in
 * `backend/src/permissions/row-predicates.ts` — and TypeScript's exhaustiveness makes both a
 * compile error until you do. The parity property test then proves the two agree.
 *
 * - `columnEqualsActor`: `row[column] === <acting user id>`. Never matches for an anonymous
 *   actor, so an actor-bound grant fails closed without a user.
 * - `columnIsNotNull`: `row[column]` is set. Actor-independent — anonymous actors match, which
 *   is what public read needs.
 */
export type RowPredicate =
  | { kind: 'columnEqualsActor'; column: string }
  | { kind: 'columnIsNotNull'; column: string };

/** The acting user for predicate evaluation. `userId` is absent for anonymous actors. */
export type ConditionActor = { userId?: string };

/**
 * Row fields available to a predicate. `createdBy` is first-class (carried by
 * `SubjectForPermission`); additional fields come from `SubjectForPermission.row`.
 */
export type RowForCondition = { createdBy?: string | null } & Record<string, unknown>;

/**
 * A named row predicate. Used two ways: as an access-policy cell (`own`, granting an action only
 * on qualifying rows) and as a subject-level public read grant (`publicRow`).
 *
 * It is pure data — a name and a predicate. Both evaluators derive from `predicate`, so a
 * condition's JS and SQL forms cannot drift from each other; the only thing the parity test has
 * to guard is that the two shared INTERPRETERS agree.
 */
export interface RowCondition {
  /**
   * Stable identifier. Surfaces as the conditional state in `can` maps
   * (`ActionPermissionState`) and as `grantedBy: { type: 'relation', relation: name }` in
   * decision attribution: treat it as part of the public contract.
   */
  name: string;
  /** What makes a row qualify, over the row's own columns. */
  predicate: RowPredicate;
}

/** Type guard: distinguishes a `RowCondition` cell value from `0 | 1`. */
export const isRowCondition = (value: unknown): value is RowCondition =>
  typeof value === 'object' && value !== null && 'predicate' in value;

/**
 * Evaluate a row predicate in JS — the check-form the engine and stream dispatch use. Its SQL
 * twin is `compileRowConditionSql` (backend); the two must agree, asserted by the parity test.
 */
export const rowPredicateMatches = (predicate: RowPredicate, row: RowForCondition, actor: ConditionActor): boolean => {
  switch (predicate.kind) {
    case 'columnEqualsActor':
      return !!actor.userId && !!row[predicate.column] && row[predicate.column] === actor.userId;
    case 'columnIsNotNull':
      return !!row[predicate.column];
  }
};

/**
 * Built-in "owner" condition: the actor created the row. In Zanzibar terms, an implicit `owner`
 * relation derived from `createdBy`. The `'own'` policy literal normalizes to this.
 */
export const own: RowCondition = {
  name: 'own',
  predicate: { kind: 'columnEqualsActor', column: 'createdBy' },
};
