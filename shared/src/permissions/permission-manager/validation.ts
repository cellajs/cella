import { isChannelEntity, isProductEntity } from '../../entity-guards';
import type { TopologyHierarchy } from './topology';
import type { PermissionMembership, SubjectForPermission } from './types';

/**
 * Validates a subject has required fields for permission checking. `topology` defaults to the
 * real config's entity guards; the engine passes its (possibly synthetic) hierarchy so a subject
 * whose entity type only exists in a test fixture still validates.
 */
export const validateSubject = (
  subject: SubjectForPermission,
  index?: number,
  topology?: Pick<TopologyHierarchy, 'isChannel' | 'isProduct'>,
): void => {
  const prefix = index !== undefined ? `Subject[${index}]` : 'Subject';

  if (!subject.entityType) {
    throw new Error(`[Permission] ${prefix} missing entityType`);
  }

  const isChannel = topology ? topology.isChannel(subject.entityType) : isChannelEntity(subject.entityType);
  const isProduct = topology ? topology.isProduct(subject.entityType) : isProductEntity(subject.entityType);
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
    throw new Error(`[Permission] Membership[${index}] missing context ID (channelId)`);
  }
};
