import { MissingScopeError, validateAncestorScope as sharedValidateAncestorScope } from 'shared';
import { AppError } from '#/core/error';
import type { SubjectForPermission } from '#/permissions/permission-manager/types';

/**
 * Backend wrapper over the shared `validateAncestorScope`.
 *
 * Validates that all ancestor context IDs are explicitly provided on the subject and translates the
 * shared engine's tier-neutral `MissingScopeError` into `AppError(400, 'missing_scope')` so HTTP
 * behavior is unchanged. See the shared implementation for full semantics.
 *
 * @throws AppError 400 if any ancestor context ID is undefined (missing)
 */
export const validateAncestorScope = (entity: SubjectForPermission) => {
  try {
    sharedValidateAncestorScope(entity);
  } catch (e) {
    if (e instanceof MissingScopeError) {
      throw new AppError(400, 'missing_scope', 'error', {
        entityType: e.entityType,
        meta: { missingContext: e.missingContext, missingKey: e.missingKey },
      });
    }
    throw e;
  }
};
