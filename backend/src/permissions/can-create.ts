import type { ContextEntityType, ProductEntityType } from 'config';
import { getContextMemberships, getContextOrganization, getContextUserSystemRole } from '#/lib/context';
import type { EntityModel } from '#/lib/entity';
import { AppError } from '#/lib/error';
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

  // Deny if not allowed and not system admin
  if (!allowed && !isSystemAdmin) {
    throw new AppError(403, 'forbidden', 'warn', { entityType });
  }

  const org = getContextOrganization();

  //Defensive check: it must match context organization
  if (org && 'organizationId' in entity && entity.organizationId !== org.id) {
    throw new AppError(409, 'organization_mismatch', 'error', { entityType });
  }
};
