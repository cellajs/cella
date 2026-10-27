import { hierarchy } from '../../config/hierarchy-config.ts';
import { appConfig } from '../config-builder/app-config.ts';
import type { SubjectForPermission } from './engine/types.ts';
import { MissingAncestorError } from './missing-ancestor-error.ts';

/**
 * `null` marks an unused ancestor; `undefined` is missing.
 * @throws MissingAncestorError when an ancestor channel id is `undefined`
 */
export const validateAncestorScope = (subject: SubjectForPermission): void => {
  for (const ancestor of hierarchy.getOrderedAncestors(subject.entityType)) {
    if (subject.channelIds[ancestor] === undefined) {
      throw new MissingAncestorError(subject.entityType, ancestor, appConfig.entityIdColumnKeys[ancestor]);
    }
  }
};
