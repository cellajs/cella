import { appConfig, type EntityActionType } from 'config';

/******************************************************************************
 * ACTION RECORD HELPERS
 * Secure-by-default: allActionsDenied is the base, grant permissions explicitly.
 ******************************************************************************/

/**
 * Creates a typed record mapping each entity action to a value.
 * Hides the type assertion in one place for clean call sites.
 *
 * @example
 * const can = createActionRecord(() => false);
 * const permissions = createActionRecord(action => policy[action] === 1);
 */
export function createActionRecord<T>(valueFn: (action: EntityActionType) => T): Record<EntityActionType, T> {
  return Object.fromEntries(appConfig.entityActions.map((a) => [a, valueFn(a)])) as Record<EntityActionType, T>;
}

/**
 * Frozen record with all actions set to false (denied).
 * Use as base for secure-by-default permission building.
 */
export const allActionsDenied = Object.freeze(createActionRecord(() => false as const)) as Readonly<
  Record<EntityActionType, false>
>;

/**
 * Frozen record with all actions set to true (allowed).
 * Use for system admin or full-access scenarios.
 */
export const allActionsAllowed = Object.freeze(createActionRecord(() => true as const)) as Readonly<
  Record<EntityActionType, true>
>;
