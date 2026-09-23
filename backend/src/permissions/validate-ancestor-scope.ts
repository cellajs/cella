import type { SubjectForPermission } from 'shared';
import { MissingAncestorError, validateAncestorScope as sharedValidateAncestorScope } from 'shared';
import { AppError } from '#/core/error';

/**
 * Backend wrapper over the shared `validateAncestorScope`: every ancestor channel ID must be
 * present on the subject, and `MissingAncestorError` becomes `AppError(400, 'missing_ancestor')`.
 * @throws AppError 400 if any ancestor channel ID is undefined (missing)
 */
export const validateAncestorScope = (entity: SubjectForPermission) => {
  try {
    sharedValidateAncestorScope(entity);
  } catch (e) {
    if (e instanceof MissingAncestorError) {
      throw new AppError(400, 'missing_ancestor', 'error', {
        entityType: e.entityType,
        meta: { missingChannel: e.missingChannel, missingKey: e.missingKey },
      });
    }
    throw e;
  }
};
