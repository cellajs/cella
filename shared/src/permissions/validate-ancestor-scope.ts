import { appConfig } from '../config-builder/app-config';
import { hierarchy } from '../../config/hierarchy-config';
import { MissingScopeError } from './missing-scope-error';
import type { SubjectForPermission } from './permission-manager/types';

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
 * @throws MissingScopeError if any ancestor context ID is undefined (missing)
 */
export const validateAncestorScope = (entity: SubjectForPermission) => {
  const ancestors = hierarchy.getOrderedAncestors(entity.entityType);

  for (const ancestor of ancestors) {
    const value = entity.contextIds[ancestor];

    // undefined = caller forgot to provide scope → error
    // null = explicitly "not in this context" → allowed (engine skips this context)
    if (value === undefined) {
      throw new MissingScopeError(entity.entityType, ancestor, appConfig.entityIdColumnKeys[ancestor]);
    }
  }
};
