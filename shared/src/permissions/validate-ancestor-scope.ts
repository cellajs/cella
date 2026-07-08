import { appConfig } from '../config-builder/app-config';
import { hierarchy } from '../../config/hierarchy-config';
import { MissingScopeError } from './missing-scope-error';
import type { SubjectForPermission } from './permission-manager/types';

/**
 * Validates that all ancestor context IDs are explicitly provided on the subject.
 *
 * `null` means "intentionally not scoped to this context" (e.g., org-level attachment);
 * `undefined` means the caller forgot to provide scope.
 *
 * @throws MissingScopeError if any ancestor context ID is undefined (missing)
 */
export const validateAncestorScope = (entity: SubjectForPermission) => {
  const ancestors = hierarchy.getOrderedAncestors(entity.entityType);

  for (const ancestor of ancestors) {
    const value = entity.contextIds[ancestor];

    if (value === undefined) {
      throw new MissingScopeError(entity.entityType, ancestor, appConfig.entityIdColumnKeys[ancestor]);
    }
  }
};
