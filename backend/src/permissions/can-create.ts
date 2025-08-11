import { getContextMemberships, getContextOrganization } from '#/lib/context';
import type { EntityModel } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import { checkPermission } from '#/permissions/check-if-allowed';
import type { ContextEntityType, ProductEntityType } from 'config';

/**
 * Checks if user has permission to create product or context entity.
 *
 * This is separate from read/update/delete checks, since the entity may not exist yet.
 *
 * @param entity - Entity the user wants to create.
 * @returns Error object or `null` if no error occurred.
 */
export const canCreateEntity = <K extends Exclude<ContextEntityType, 'organization'> | ProductEntityType>(entity: EntityModel<K>) => {
  const { entityType } = entity;
  const org = getContextOrganization();
  const memberships = getContextMemberships();

  // Step 1: Permission check
  const isAllowed = checkPermission(memberships, 'create', entity);
  if (!isAllowed) throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', entityType });

  // Step 2: Organization ownership check
  if (org && 'organizationId' in entity && entity.organizationId !== org.id) {
    throw new AppError({ status: 409, type: 'organization_mismatch', severity: 'error', entityType });
  }
};
