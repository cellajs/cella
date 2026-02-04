import type { EntityActionType, ProductEntityType } from 'config';
import { getContextMemberships, getContextUserSystemRole } from '#/lib/context';
import { type EntityModel, resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/error';
import { checkPermission, type PermissionResult } from '#/permissions';

/**
 * Result type for product entity validation including the can object.
 */
export interface ValidProductEntityResult<K extends ProductEntityType> {
  entity: EntityModel<K>;
  can: PermissionResult['can'];
}

/**
 * Checks if current user has permission to perform a given action on a product entity.
 *
 * Resolves product entity based on provided type and ID/slug, and verifies user permissions
 * (including system admin overrides).
 *
 * Returns resolved product entity and a `can` object with all action permissions.
 * Throws an error if entity cannot be found or user lacks required permissions.
 *
 * @param id - Product's unique ID.
 * @param entityType - Type of product entity.
 * @param action - The action to check (e.g., `"read" | "update" | "delete"`).
 * @returns An object containing resolved entity and can object.
 */
export const getValidProductEntity = async <K extends ProductEntityType>(
  id: string,
  entityType: K,
  action: Exclude<EntityActionType, 'create'>,
): Promise<ValidProductEntityResult<K>> => {
  // Get current user role and memberships from request context
  const userSystemRole = getContextUserSystemRole();
  const memberships = getContextMemberships();

  // Step 1: Resolve target entity by ID or slug
  const entity = await resolveEntity(entityType, id);
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  // Step 2: Check permission for the requested action (system admin bypass is handled inside)
  const { isAllowed, can } = checkPermission(memberships, action, entity, { systemRole: userSystemRole });

  if (!isAllowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });
  }

  return { entity, can };
};
