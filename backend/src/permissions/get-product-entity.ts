import type { EntityActionType, ProductEntityType } from 'config';
import { getContextMemberships, getContextUserSystemRole } from '#/lib/context';
import { type EntityModel, resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import { isPermissionAllowed } from '#/permissions';

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
  action: Exclude<EntityActionType, 'create'>,
): Promise<EntityModel<K>> => {
  // Get current user role and memberships from request context
  const userSystemRole = getContextUserSystemRole();
  const memberships = getContextMemberships();

  const isSystemAdmin = userSystemRole === 'admin';

  // Step 1: Resolve target entity by ID or slug
  const entity = await resolveEntity(entityType, idOrSlug);
  if (!entity) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType });

  // Step 2: Check permission for the requested action
  const { allowed } = isPermissionAllowed(memberships, action, entity);

  if (!allowed && !isSystemAdmin) {
    throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', entityType, meta: { action } });
  }

  return entity;
};
