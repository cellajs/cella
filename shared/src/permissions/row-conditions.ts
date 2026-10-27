import type { SubjectForPermission } from './engine/types.ts';

/**
 * Closed vocabulary shared by JS, SQL and frontend enforcement. `own` requires the actor to match
 * `createdBy`; `public` requires the row's `public` flag.
 */
export type RowConditionName = 'own' | 'public';

/** The actor for condition evaluation. `actorId` is absent for anonymous actors. */
export type ConditionActor = { actorId?: string };

/** The row fields a condition reads. */
export type RowForCondition = { createdBy?: string | null } & Record<string, unknown>;

/**
 * The row a subject's conditions read: `createdBy` comes from the subject, other fields from its `row`. The single-row
 * path and the fan-out both read this row, so actors the fan-out groups by it get the decision the single path makes.
 */
export const conditionRowOf = (subject: SubjectForPermission): RowForCondition => ({ ...subject.row, createdBy: subject.createdBy });

export const isRowCondition = (value: unknown): value is RowConditionName => value === 'own' || value === 'public';

/**
 * The check-form the engine and stream dispatch use. Its SQL twin is the backend's
 * `compileRowConditionSql`; a parity test asserts the two agree.
 */
export const matchesRowCondition = (name: RowConditionName, row: RowForCondition, actor: ConditionActor): boolean => {
  switch (name) {
    case 'own':
      return !!actor.actorId && !!row.createdBy && row.createdBy === actor.actorId;
    case 'public':
      return row.public === true;
  }
};
