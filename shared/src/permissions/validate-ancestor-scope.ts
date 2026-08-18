import { hierarchy } from '../../config/hierarchy-config.ts';
import { appConfig } from '../config-builder/app-config.ts';
import type { SubjectForPermission } from './engine/types.ts';
import { MissingScopeError } from './missing-scope-error.ts';

/**
 * `null` marks an unused ancestor; `undefined` is missing.
 * @throws MissingScopeError when an ancestor channel id is `undefined`
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
