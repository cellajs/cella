import { hierarchy } from '../../../config/hierarchy-config.ts';
import type { EntityHierarchy } from '../../config-builder/entity-hierarchy.ts';
import type { AccessMembership, SubjectForPermission } from './types.ts';

/**
 * `entityGuards` defaults to the real config's hierarchy. The engine passes its own, possibly
 * synthetic, so a subject whose entity type exists only in a fixture still validates.
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

export const validateMembership = <T extends AccessMembership>(membership: T, index: number): void => {
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
