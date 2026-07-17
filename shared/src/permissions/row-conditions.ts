/**
 * Closed row-condition vocabulary shared by JS, SQL, and frontend enforcement.
 * `own` requires the actor's `createdBy`; `public` requires the row's `publicAt`.
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
