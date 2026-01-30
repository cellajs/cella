import type { ContextEntityType, EntityActionType } from 'config';
import { getContextMemberships, getContextUserSystemRole } from '#/lib/context';
import { type EntityModel, resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/error';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkPermission, type PermissionResult } from '#/permissions';

/**
 * Result type for context entity validation including the can object.
 */
export interface ValidContextEntityResult<T extends ContextEntityType> {
  entity: EntityModel<T>;
  membership: MembershipBaseModel | null;
  can: PermissionResult['can'];
}

/**
 * Checks if current user has permission to perform a given action on a context entity.
 *
 * Resolves context entity based on provided type and ID/slug, verifies user permissions
 * (including system admin), and retrieves user's membership for entity if applicable.
 *
 * Returns resolved entity along with user's membership and a `can` object with all action permissions.
 * The membership may be `null` if action is allowed because user is a system admin or an admin
 * of a higher-level entity as defined in `permissions-config`.
 * Throws an error if entity cannot be found or user lacks required permissions.
 *
 * @param idOrSlug - Entity's unique ID or slug.
 * @param entityType - Type of context entity (e.g., organization, project).
 * @param action - Action to check (e.g., `"read" | "update" | "delete"`).
 * @returns An object containing resolved entity, associated membership (or `null`), and can object.
 */
export const getValidContextEntity = async <T extends ContextEntityType>(
  idOrSlug: string,
  entityType: T,
  action: Exclude<EntityActionType, 'create'>,
): Promise<ValidContextEntityResult<T>> => {
  // Get current user role and memberships from request context
  const userSystemRole = getContextUserSystemRole();
  const memberships = getContextMemberships();

  // Step 1: Resolve target entity by ID or slug
  const entity = await resolveEntity(entityType, idOrSlug);
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  // Step 2: Check permission for the requested action (system admin bypass is handled inside)
  const { allowed, membership, can } = checkPermission(memberships, action, entity, { systemRole: userSystemRole });

  if (!allowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });
  }

  return { entity, membership, can };
};
