import type { EntityActionType } from '../../types.ts';
import { appConfig } from '../config-builder/app-config.ts';
import { recordFromKeys } from '../config-builder/utils.ts';

/** A record over `appConfig.entityActions`, in its order, with each action's value from `valueFn`. */
export const createActionRecord = <T>(valueFn: (action: EntityActionType) => T): Record<EntityActionType, T> =>
  recordFromKeys(appConfig.entityActions, valueFn);

/** The secure-by-default base for building a permission record. */
export const allActionsDenied = Object.freeze(createActionRecord(() => false as const));

/** For system admin and other full-access cases. */
export const allActionsAllowed = Object.freeze(createActionRecord(() => true as const));
