import type { ContextEntityType, ProductEntityType } from 'config';
import { getContextMemberships, getContextOrganization, getContextUserSystemRole } from '#/lib/context';
import type { EntityModel } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import { isPermissionAllowed } from '#/permissions';

/**
 * Checks if user has permission to create product or context entity.
 *
 * This is separate from read/update/delete checks, since the entity may not exist yet.
 *
 * @param entity - Entity that user wants to create.
 */
export const canCreateEntity = <K extends Exclude<ContextEntityType, 'organization'> | ProductEntityType>(
  entity: EntityModel<K>,
) => {
  const userSystemRole = getContextUserSystemRole();
  const memberships = getContextMemberships();

  const { entityType } = entity;
  const isSystemAdmin = userSystemRole === 'admin';

  // Step 1: Permission check
  const { allowed } = isPermissionAllowed(memberships, 'create', entity);

  if (!allowed && !isSystemAdmin) {
    throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', entityType });
  }

  const org = getContextOrganization();

  // Step 2: Organization ownership check
  if (org && 'organizationId' in entity && entity.organizationId !== org.id) {
    throw new AppError({ status: 409, type: 'organization_mismatch', severity: 'error', entityType });
  }
};
