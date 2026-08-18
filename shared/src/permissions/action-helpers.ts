import type { EntityActionType } from '../../types.ts';
import { appConfig } from '../config-builder/app-config.ts';
import { recordFromKeys } from '../config-builder/utils.ts';
import type { CanState } from './types.ts';

export function createActionRecord<T>(valueFn: (action: EntityActionType) => T): Record<EntityActionType, T> {
  return recordFromKeys(appConfig.entityActions, valueFn);
}

/** The secure-by-default base for building a permission record. */
export const allActionsDenied = Object.freeze(createActionRecord(() => false as const)) as Readonly<
  Record<EntityActionType, false>
>;

/** For system admin and other full-access cases. */
export const allActionsAllowed = Object.freeze(createActionRecord(() => true as const)) as Readonly<
  Record<EntityActionType, true>
>;

/**
 * Resolves `true | false | condition name` to a boolean. `'own'` compares the actor's `userId`
 * against `entity.createdBy`. The switch is exhaustive over {@link CanState}, so adding a row
 * condition breaks the build here; the frontend never denies a new condition unnoticed.
 */
export const resolveCan = (
  permission: CanState | undefined,
  entityCreatedBy?: string | null,
  userId?: string,
): boolean => {
  if (typeof permission !== 'string') return permission === true;
  switch (permission) {
    case 'own':
      return !!userId && !!entityCreatedBy && entityCreatedBy === userId;
    case 'public':
      // Public read is membership-independent and resolved server-side, so it never reaches the
      // frontend can-map. This arm exists for exhaustiveness and denies by default.
      return false;
  }
};

/** True only for an unconditional grant. Row affordances call `resolveCan`. */
export const isUnconditionalCan = (permission: CanState | undefined): boolean => permission === true;
