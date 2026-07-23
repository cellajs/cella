import { appConfig } from '../config-builder/app-config';
import { hierarchy } from '../../config/hierarchy-config';
import { MissingScopeError } from './missing-scope-error';
import type { SubjectForPermission } from './engine/types';

/**
 * Validates that every ancestor ID is present. `null` marks an unused ancestor; `undefined`
 * is missing.
 *
 * @throws MissingScopeError if any ancestor channel ID is undefined (missing)
 */
export const validateAncestorScope = (entity: SubjectForPermission) => {
  const ancestors = hierarchy.getOrderedAncestors(entity.entityType);

  for (const ancestor of ancestors) {
    const value = entity.channelIds[ancestor];

    if (value === undefined) {
      throw new MissingScopeError(entity.entityType, ancestor, appConfig.entityIdColumnKeys[ancestor]);
    }
  }
};
