import { appConfig, hierarchy } from 'shared';
import { AppError } from '#/core/error';
import type { SubjectForPermission } from '#/permissions/permission-manager/types';

/**
 * Validates that all ancestor context IDs are explicitly provided on the subject.
 *
 * Secure-by-design: product entities with parent contexts (e.g., attachment → project → organization)
 * must have all ancestor context IDs set. `null` means "intentionally not scoped to this context"
 * (e.g., org-level attachment), while `undefined` means the caller forgot — which is an error.
 *
 * This prevents handlers from accidentally skipping a context check, which would cause
 * the permission engine to fall back to a broader scope (e.g., granting org-member access
 * to a project-scoped attachment).
 *
 * @throws AppError 400 if any ancestor context ID is undefined (missing)
 */
export const validateAncestorScope = (entity: SubjectForPermission) => {
  const ancestors = hierarchy.getOrderedAncestors(entity.entityType);

  for (const ancestor of ancestors) {
    const idKey = appConfig.entityIdColumnKeys[ancestor];
    const value = entity[idKey as keyof SubjectForPermission];

    // undefined = caller forgot to provide scope → error
    // null = explicitly "not in this context" → allowed (engine skips this context)
    if (value === undefined) {
      throw new AppError(400, 'missing_scope', 'error', {
        entityType: entity.entityType,
        meta: { missingContext: ancestor, missingKey: idKey },
      });
    }
  }
};
