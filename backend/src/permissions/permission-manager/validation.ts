import { appConfig, isContextEntity, isProductEntity } from 'config';
import { PermissionError } from './errors';
import type { MembershipForPermission, SubjectForPermission } from './types';

/**
 * Validates a subject has required fields for permission checking.
 * Throws PermissionError if validation fails.
 */
export const validateSubject = (subject: SubjectForPermission, index?: number): void => {
  const prefix = index !== undefined ? `Subject[${index}]` : 'Subject';

  if (!subject.entityType) {
    throw new PermissionError(`${prefix} missing entityType`, 'INVALID_SUBJECT', { subject });
  }

  if (!isContextEntity(subject.entityType) && !isProductEntity(subject.entityType)) {
    throw new PermissionError(`${prefix} has invalid entityType: ${subject.entityType}`, 'INVALID_SUBJECT', {
      subject,
    });
  }

  if (!subject.id || typeof subject.id !== 'string' || subject.id.trim() === '') {
    throw new PermissionError(`${prefix} missing or invalid id`, 'INVALID_SUBJECT', { subject });
  }
};

/**
 * Validates a membership has required fields.
 * Throws PermissionError if validation fails.
 */
export const validateMembership = <T extends MembershipForPermission>(membership: T, index: number): void => {
  if (!membership.contextType) {
    throw new PermissionError(`Membership[${index}] missing contextType`, 'INVALID_MEMBERSHIP', { membership });
  }

  if (!membership.role || typeof membership.role !== 'string') {
    throw new PermissionError(`Membership[${index}] missing or invalid role`, 'INVALID_MEMBERSHIP', { membership });
  }

  const contextIdKey = appConfig.entityIdColumnKeys[membership.contextType];
  if (!membership[contextIdKey]) {
    throw new PermissionError(`Membership[${index}] missing context ID (${contextIdKey})`, 'INVALID_MEMBERSHIP', {
      membership,
      contextIdKey,
    });
  }
};
