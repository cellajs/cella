/**
 * Row conditions: per-row qualifications on access-policy grants.
 *
 * A policy cell value of `1` grants an action on every row the context scope reaches.
 * A `RowCondition` cell value grants the action only on rows that satisfy the condition
 * (e.g. "rows the actor created"). Conditions are declared once and consumed by every
 * enforcement path:
 *
 * - **check-form** (`matches`): evaluated by the permission engine per subject, and by
 *   the frontend to resolve conditional `can` states per row.
 * - **SQL-form** (`sqlForm`): a declarative descriptor — this package is ORM-free — that
 *   the backend compiles into a row predicate for collection reads and any other
 *   set-based path. Keeping it declarative (instead of a SQL-building function) is what
 *   makes the check-form/SQL-form parity property testable and the descriptor safe to
 *   evaluate in shared code.
 *
 * The legacy `'own'` policy literal is sugar for the built-in {@link own} condition and
 * is normalized away when policies are configured; engine and consumers only ever see
 * `0 | 1 | RowCondition`.
 */

/**
 * Declarative SQL form of a row condition. Compiled by the backend
 * (`backend/src/permissions/row-predicates.ts`) into an ORM predicate.
 *
 * - `columnEqualsActor`: `row[column] = <acting user id>`. Never matches without an
 *   acting user (anonymous), mirroring the check-form.
 */
export type RowConditionSqlForm = { kind: 'columnEqualsActor'; column: string };

/** The acting user for condition evaluation. `userId` is absent for anonymous actors. */
export type ConditionActor = { userId?: string };

/**
 * Row fields available to a condition's check-form. `createdBy` is first-class (carried
 * by `SubjectForPermission`); additional fields come from `SubjectForPermission.row`.
 */
export type RowForCondition = { createdBy?: string | null } & Record<string, unknown>;

export interface RowCondition {
  /**
   * Stable identifier. Surfaces as the conditional state in `can` maps
   * (`ActionPermissionState`) and as `grantedBy: { type: 'relation', relation: name }`
   * in decision attribution — treat it as part of the public contract.
   */
  name: string;
  /**
   * Check-form: does this row satisfy the condition for this actor?
   * Must be pure and must agree with `sqlForm` — the parity property test asserts this.
   */
  matches: (row: RowForCondition, actor: ConditionActor) => boolean;
  /** SQL-form descriptor, compiled by the backend for set-based reads. */
  sqlForm: RowConditionSqlForm;
}

/** Type guard: distinguishes a RowCondition cell value from `0 | 1`. */
export const isRowCondition = (value: unknown): value is RowCondition => {
  return typeof value === 'object' && value !== null && 'matches' in value && 'sqlForm' in value;
};

/**
 * Built-in "owner" condition: the actor created the row.
 *
 * In Zanzibar terms this is an implicit `owner` relation derived from `createdBy`.
 * The `'own'` policy literal normalizes to this condition.
 */
export const own: RowCondition = {
  name: 'own',
  matches: (row, actor) => !!actor.userId && !!row.createdBy && row.createdBy === actor.userId,
  sqlForm: { kind: 'columnEqualsActor', column: 'createdBy' },
};
