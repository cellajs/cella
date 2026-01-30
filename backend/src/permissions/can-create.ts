import type { ContextEntityType, ProductEntityType } from 'config';
import { getContextMemberships, getContextOrganization, getContextUserSystemRole } from '#/lib/context';
import type { EntityModel } from '#/lib/entity';
import { AppError } from '#/lib/error';
import { checkPermission } from '#/permissions';

/**
 * Checks if user has permission to create product or context entity.
 * This is separate from read/update/delete checks, since the entity doesn not exist yet.
 *
 * @param entity - Entity that user wants to create.
 */
export const canCreateEntity = <K extends Exclude<ContextEntityType, 'organization'> | ProductEntityType>(
  entity: EntityModel<K>,
) => {
  const userSystemRole = getContextUserSystemRole();
  const memberships = getContextMemberships();

  const { entityType } = entity;

  // Step 1: Permission check (system admin bypass is handled inside)
  const { isAllowed } = checkPermission(memberships, 'create', entity, { systemRole: userSystemRole });

  // Deny if not allowed
  if (!isAllowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType });
  }

  const org = getContextOrganization();

  // Defense in depth check: it must match context organization
  if (org && 'organizationId' in entity && entity.organizationId !== org.id) {
    throw new AppError(409, 'organization_mismatch', 'error', { entityType });
  }
};
