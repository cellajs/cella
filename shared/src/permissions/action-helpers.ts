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
 * Resolves a three-state permission (`true | false | condition name`) to a boolean.
 *
 * Handles the built-in `'own'` condition (actor created the entity, derived from
 * `entity.createdBy`). Any other condition name resolves to `false` here (a secure
 * default); call sites using a custom row condition must resolve it via the
 * condition's own check-form.
 *
 * @param permission - The permission state from `EntityCanMap` (`true`, `false`, or a condition name)
 * @param entityCreatedBy - The `createdBy` field of the entity being checked
 * @param userId - The current user's ID (the actor)
 * @returns `true` if action is allowed, `false` otherwise. Defaults to `false` for safety.
 */
export const resolvePermission = (
  permission: ActionPermissionState | undefined,
  entityCreatedBy?: string | null,
  userId?: string,
): boolean => {
  if (permission === true) return true;
  if (permission === 'own') return !!userId && !!entityCreatedBy && entityCreatedBy === userId;
  return false;
};

/**
 * Checks whether a permission is unconditionally granted (`true`),
 * as opposed to entity-dependent (`'own'`) or denied (`false`).
 *
 * Use this to decide if a user qualifies for context-scoped features
 * (e.g. collaborative editing) where per-entity ownership can't be checked upfront.
 */
export const isUnconditionalPermission = (permission: ActionPermissionState | undefined): boolean => {
  return permission === true;
};
