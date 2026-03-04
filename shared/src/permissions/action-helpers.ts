import { appConfig } from '../../app-config';
import type { EntityActionType } from '../../types';
import { recordFromKeys } from '../builder/utils';
import type { ActionPermissionState } from './compute-can';

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
 * Resolves a three-state permission (`true | false | 'own'`) to a boolean
 * by checking the implicit "owner" relation.
 *
 * In Zanzibar terms: evaluates `check(userId, action, entity)` where an `'own'` policy
 * is resolved via the implicit `owner` relation derived from `entity.createdBy`.
 *
 * @param permission - The permission state from `EntityCanMap` (`true`, `false`, or `'own'`)
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
