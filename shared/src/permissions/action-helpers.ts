import { appConfig } from '../../app-config';
import type { EntityActionType } from '../../types';
import { recordFromKeys } from '../builder/utils';

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
