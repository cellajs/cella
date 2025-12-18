import { appConfig, type ContextEntityType } from 'config';
import { getContextMemberships, getContextOrganization, getContextUserSystemRole } from '#/lib/context';
import { type EntityModel, resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { EntityAction } from '#/permissions/permissions-config';
import permissionManager from '#/permissions/permissions-config';

/**
 * Checks if current user has permission to perform a given action on a context entity.
 *
 * Resolves context entity based on provided type and ID/slug, verifies user permissions
 * (including system admin), and retrieves user's membership for entity if applicable.
 *
 * Returns resolved entity along with user's membership, which may be `null` if action is
 * allowed because user is a system admin or an admin of a higher-level entity as defined in `permissions-config`.
 * Throws an error if entity cannot be found or user lacks required permissions.
 *
 * @param idOrSlug - Entity's unique ID or slug.
 * @param entityType - Type of context entity (e.g., organization, project).
 * @param action - Action to check (e.g., `"read" | "update" | "delete"`).
 * @returns An object containing resolved entity and associated membership (or `null` if not required).
 */
export const getValidContextEntity = async <T extends ContextEntityType>(
  idOrSlug: string,
  entityType: T,
  action: Exclude<EntityAction, 'create'>,
): Promise<{ entity: EntityModel<T>; membership: MembershipBaseModel | null }> => {
  // Get current user role and memberships from request context
  const userSystemRole = getContextUserSystemRole();
  const memberships = getContextMemberships();

  const isSystemAdmin = userSystemRole === 'admin';

  // Step 1: Resolve target entity by ID or slug
  const entity = await resolveEntity(entityType, idOrSlug);
  if (!entity) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType });

  // Step 2: Check permission for the requested action
  const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity);

  // If user is a system admin, skip membership/org checks entirely
  if (!isAllowed && isSystemAdmin) return { entity, membership: null };

  // Step 3: Search for user's membership for this entity
  const entityIdColumnKey = appConfig.entityIdColumnKeys[entity.entityType];
  const membership = memberships.find((m) => m[entityIdColumnKey] === entity.id && m.contextType === entityType) || null;

  if (!isAllowed) {
    if (!membership) throw new AppError({ status: 403, type: 'membership_not_found', severity: 'error', entityType });

    // Step 4: Validate organization alignment
    const organization = getContextOrganization();
    if (organization) {
      const organizationMatches = 'organizationId' in entity ? entity.organizationId === organization.id : false;
      const membershipOrgMatches = membership.organizationId === organization.id;

      // Reject if entity belongs to a different organization or membership is from a different org
      if (!organizationMatches || !membershipOrgMatches) {
        throw new AppError({ status: 409, type: 'organization_mismatch', severity: 'error', entityType });
      }
    }

    // Fallback: user is explicitly forbidden
    throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', entityType, meta: { action } });
  }

  return { entity, membership };
};
