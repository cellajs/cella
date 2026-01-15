import { appConfig, type ContextEntityType, type ProductEntityType } from 'config';
import { getContextMemberships, getContextOrganization, getContextUserSystemRole } from '#/lib/context';
import { type EntityModel, resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import type { CrudAction } from '#/permissions/permissions-config';
import permissionManager from '#/permissions/permissions-config';

/**
 * Checks if current user has permission to perform a given action on a product entity.
 *
 * Resolves product entity based on provided type and ID/slug, and verifies user permissions
 * (including system admin overrides).
 *
 * Returns resolved product entity if access is granted, otherwise throws an error.
 *
 * @param idOrSlug - Product's unique ID or slug.
 * @param entityType - Type of product entity.
 * @param contextEntityType - Type of context entity that the product entity belongs to (e.g., "organization", "project").
 * @param action - The action to check (e.g., `"read" | "update" | "delete"`).
 * @returns Resolved product entity.
 */

export const getValidProductEntity = async <K extends ProductEntityType>(
  idOrSlug: string,
  entityType: K,
  contextEntityType: ContextEntityType,
  action: Exclude<CrudAction, 'create'>,
): Promise<EntityModel<K>> => {
  // Get current user role and memberships from request context
  const userSystemRole = getContextUserSystemRole();
  const memberships = getContextMemberships();

  const isSystemAdmin = userSystemRole === 'admin';

  // Step 1: Resolve target entity by ID or slug
  const entity = await resolveEntity(entityType, idOrSlug);
  if (!entity) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType });

  // Step 2: Check permission for the requested action
  const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity);

  if (!isAllowed && !isSystemAdmin) {
    // Step 3: Search for user's membership for context entity
    const entityIdColumnKey = appConfig.entityIdColumnKeys[contextEntityType];
    const entityId = (entity as Record<string, unknown>)[entityIdColumnKey];

    const membership = memberships.find(
      (m) => m.contextType === contextEntityType && m[entityIdColumnKey] === entityId,
    );
    if (!membership)
      throw new AppError({
        status: 403,
        type: 'membership_not_found',
        severity: 'error',
        entityType: contextEntityType,
        meta: entity,
      });

    // Step 4: Validate organization alignment
    const organization = getContextOrganization();
    if (organization) {
      const organizationMatches = 'organizationId' in entity ? entity.organizationId === organization.id : false;
      const membershipOrgMatches = membership.organizationId === organization.id;

      // Reject if entity belongs to a different organization or membership is from a different org
      if (!organizationMatches || !membershipOrgMatches) {
        throw new AppError({
          status: 409,
          type: 'organization_mismatch',
          severity: 'error',
          entityType: contextEntityType,
          meta: entity,
        });
      }
    }

    // Fallback: user is explicitly forbidden
    throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', entityType, meta: { action } });
  }

  return entity;
};
