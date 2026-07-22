import { appConfig } from '../config-builder/app-config';
import type { EntityActionType } from '../../types';
import { recordFromKeys } from '../config-builder/utils';
import type { ActionPermissionState } from './types';

/**
 * Creates a typed record mapping each entity action to a value.
 * Hides the type assertion in one place for clean call sites.
 */
export function createActionRecord<T>(valueFn: (action: EntityActionType) => T): Record<EntityActionType, T> {
  return recordFromKeys(appConfig.entityActions, valueFn);
}

/** Frozen record with all actions set to false (denied). Use as base for secure-by-default permission building. */
export const allActionsDenied = Object.freeze(createActionRecord(() => false as const)) as Readonly<
  Record<EntityActionType, false>
>;

/** Frozen record with all actions set to true (allowed). Use for system admin or full-access scenarios. */
export const allActionsAllowed = Object.freeze(createActionRecord(() => true as const)) as Readonly<
  Record<EntityActionType, true>
>;

/**
 * Resolves a three-state permission (`true | false | condition name`) to a boolean. `'own'`
 * compares the actor's `userId` against `entity.createdBy`. The switch is exhaustive over the
 * closed {@link ActionPermissionState} name union, so adding a row condition is a compile error
 * here: the frontend can never silently deny a new condition.
 */
export const resolvePermission = (
  permission: ActionPermissionState | undefined,
  entityCreatedBy?: string | null,
  userId?: string,
): boolean => {
  if (typeof permission !== 'string') return permission === true;
  switch (permission) {
    case 'own':
      return !!userId && !!entityCreatedBy && entityCreatedBy === userId;
    case 'public':
      // Public read is membership-independent and resolved server-side; it never appears in the
      // frontend can-map. Denied here (secure default). This arm exists only for exhaustiveness.
      return false;
  }
};

/**
 * Returns true only for unconditional permission.
 * Context-wide features use this secure default; row affordances should call `resolvePermission`.
 */
export const isUnconditionalPermission = (permission: ActionPermissionState | undefined): boolean =>
  permission === true;
