/**
 * Closed vocabulary shared by JS, SQL and frontend enforcement. `own` requires the actor to match
 * `createdBy`; `public` requires the row's `publicAt`.
 */
export type RowConditionName = 'own' | 'public';

/** The acting user for condition evaluation. `userId` is absent for anonymous actors. */
export type ConditionActor = { userId?: string };

/** `createdBy` comes from `SubjectForPermission`; other fields from its `row`. */
export type RowForCondition = { createdBy?: string | null } & Record<string, unknown>;

export const isRowCondition = (value: unknown): value is RowConditionName => value === 'own' || value === 'public';

/**
 * The check-form the engine and stream dispatch use. Its SQL twin is the backend's
 * `compileRowConditionSql`; a parity test asserts the two agree.
 */
export const matchesRowCondition = (name: RowConditionName, row: RowForCondition, actor: ConditionActor): boolean => {
  switch (name) {
    case 'own':
      return !!actor.userId && !!row.createdBy && row.createdBy === actor.userId;
    case 'public':
      return !!row.publicAt;
  }
};
