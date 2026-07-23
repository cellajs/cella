import { hierarchy } from '../../../config/hierarchy-config';
import type { EntityHierarchy } from '../../config-builder/entity-hierarchy';
import type { PermissionMembership, SubjectForPermission } from './types';

/**
 * Validates a subject has required fields for permission checking. `entityGuards` defaults to
 * the real config's hierarchy; the engine passes its (possibly synthetic) hierarchy so a subject
 * whose entity type only exists in a test fixture still validates.
 */
export const validateSubject = (
  subject: SubjectForPermission,
  index?: number,
  entityGuards?: Pick<EntityHierarchy, 'isChannel' | 'isProduct'>,
): void => {
  const prefix = index !== undefined ? `Subject[${index}]` : 'Subject';

  if (!subject.entityType) {
    throw new Error(`[Permission] ${prefix} missing entityType`);
  }

  const isChannel = (entityGuards ?? hierarchy).isChannel(subject.entityType);
  const isProduct = (entityGuards ?? hierarchy).isProduct(subject.entityType);
  if (!isChannel && !isProduct) {
    throw new Error(`[Permission] ${prefix} has invalid entityType: ${subject.entityType}`);
  }

  if (subject.id !== undefined && (typeof subject.id !== 'string' || subject.id.trim() === '')) {
    throw new Error(`[Permission] ${prefix} invalid id`);
  }
};

/** Validates a membership has required fields. */
export const validateMembership = <T extends PermissionMembership>(membership: T, index: number): void => {
  if (!membership.channelType) {
    throw new Error(`[Permission] Membership[${index}] missing channelType`);
  }

  if (!membership.role || typeof membership.role !== 'string') {
    throw new Error(`[Permission] Membership[${index}] missing or invalid role`);
  }

  if (!membership.channelId) {
    throw new Error(`[Permission] Membership[${index}] missing channelId`);
  }
};
