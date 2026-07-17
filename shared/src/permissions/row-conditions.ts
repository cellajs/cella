/**
 * Row-local read qualifiers: the closed set of rules the permission system enforces per row.
 *
 * There are exactly two, and this is not a fork extension point: `own` and `public`. Each is a
 * pure predicate over the row's OWN columns. A rule that needed a second row, a join, or actor
 * data beyond the user id has no place here. It could not be enforced identically in the paths
 * that must agree: the engine's JS check ({@link matchesRowCondition} here), the backend's
 * compiled SQL (`compileRowConditionSql` in `backend/src/permissions/row-predicates.ts`), and CDC
 * stream dispatch (which only ever ships the row itself).
 *
 * The rule NAME is the single source of truth. It is the value a policy cell normalizes to, the
 * `grantedBy: { type: 'relation', relation: name }` in decision attribution, and the conditional
 * state a `can` map surfaces to the frontend. So treat it as part of the public contract. Each
 * enforcement path maps the name to behaviour through an exhaustive `switch`; the parity property
 * test (`row-predicates.test.ts`) proves the paths agree.
 *
 * @see cella/PERMISSIONS.md
 */

/**
 * The closed vocabulary of row conditions. This union IS the contract.
 *
 * Adding a name is a deliberate edit to the three switches that read it. The JS
 * {@link matchesRowCondition} here, the SQL `compileRowConditionSql` (backend), and the frontend
 * `resolvePermission` (`action-helpers.ts`). And TypeScript's exhaustiveness makes each a compile
 * error until you do.
 *
 * - `own`: `row.createdBy === <acting user id>`. Never matches for an anonymous actor, so an
 *   actor-bound grant fails closed without a user.
 * - `public`: the row's `publicAt` is set. Actor-independent. Anonymous actors match, which is
 *   what public read needs. Never appears as a policy cell; it backs the subject-level public read
 *   grant (see `public-read.ts`).
 */
export type RowConditionName = 'own' | 'public';

/** The acting user for condition evaluation. `userId` is absent for anonymous actors. */
export type ConditionActor = { userId?: string };

/**
 * Row fields available to a condition. `createdBy` is first-class (carried by
 * `SubjectForPermission`); additional fields (e.g. `publicAt`) come from `SubjectForPermission.row`.
 */
export type RowForCondition = { createdBy?: string | null } & Record<string, unknown>;

/** Type guard: distinguishes a row-condition cell value (a name) from `0 | 1`. */
export const isRowCondition = (value: unknown): value is RowConditionName => value === 'own' || value === 'public';

/**
 * Evaluate a row condition in JS: the check-form the engine and stream dispatch use. Its SQL
 * twin is `compileRowConditionSql` (backend); the two must agree, asserted by the parity test.
 */
export const matchesRowCondition = (name: RowConditionName, row: RowForCondition, actor: ConditionActor): boolean => {
  switch (name) {
    case 'own':
      return !!actor.userId && !!row.createdBy && row.createdBy === actor.userId;
    case 'public':
      return !!row.publicAt;
  }
};
