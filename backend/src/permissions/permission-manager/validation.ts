import { appConfig, isContextEntity, isProductEntity } from 'shared';
import type { MembershipForPermission, SubjectForPermission } from './types';

/** Validates a subject has required fields for permission checking. */
export const validateSubject = (subject: SubjectForPermission, index?: number): void => {
  const prefix = index !== undefined ? `Subject[${index}]` : 'Subject';

  if (!subject.entityType) {
    throw new Error(`[Permission] ${prefix} missing entityType`);
  }

  if (!isContextEntity(subject.entityType) && !isProductEntity(subject.entityType)) {
    throw new Error(`[Permission] ${prefix} has invalid entityType: ${subject.entityType}`);
  }

  if (!subject.id || typeof subject.id !== 'string' || subject.id.trim() === '') {
    throw new Error(`[Permission] ${prefix} missing or invalid id`);
  }
};

/** Validates a membership has required fields. */
export const validateMembership = <T extends MembershipForPermission>(membership: T, index: number): void => {
  if (!membership.contextType) {
    throw new Error(`[Permission] Membership[${index}] missing contextType`);
  }

  if (!membership.role || typeof membership.role !== 'string') {
    throw new Error(`[Permission] Membership[${index}] missing or invalid role`);
  }

  const contextIdKey = appConfig.entityIdColumnKeys[membership.contextType];
  if (!membership[contextIdKey]) {
    throw new Error(`[Permission] Membership[${index}] missing context ID (${contextIdKey})`);
  }
};
