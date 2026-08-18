import type { SubjectForPermission } from 'shared';
import { MissingScopeError, validateAncestorScope as sharedValidateAncestorScope } from 'shared';
import { AppError } from '#/core/error';

/**
 * Backend wrapper over the shared `validateAncestorScope`: every ancestor channel ID must be
 * present on the subject, and `MissingScopeError` becomes `AppError(400, 'missing_scope')`.
 * @throws AppError 400 if any ancestor channel ID is undefined (missing)
 */
export const validateAncestorScope = (entity: SubjectForPermission) => {
  try {
    sharedValidateAncestorScope(entity);
  } catch (e) {
    if (e instanceof MissingScopeError) {
      throw new AppError(400, 'missing_scope', 'error', {
        entityType: e.entityType,
        meta: { missingChannel: e.missingChannel, missingKey: e.missingKey },
      });
    }
    throw e;
  }
};
