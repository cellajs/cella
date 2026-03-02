import type { Context } from 'hono';
import type { ContextEntityType, EntityActionType } from 'shared';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { type EntityModel, resolveEntity } from '#/lib/resolve-entity';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkPermission } from '#/permissions';

/**
 * Result type for context entity validation including the can object.
 */
export interface ValidContextEntityResult<T extends ContextEntityType> {
  entity: EntityModel<T>;
  membership: MembershipBaseModel | null;
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
 *
 * @param ctx - Hono context with db set by guard middleware.
 * @param entityId - Entity's unique ID (or slug when bySlug is true).
 * @param entityType - Type of context entity (e.g., organization, project).
 * @param action - Action to check (e.g., `"read" | "update" | "delete"`).
 * @param bySlug - If true, resolve by slug instead of ID.
 * @returns An object containing resolved entity, associated membership (or `null`), and can object.
 */
export const getValidContextEntity = async <T extends ContextEntityType>(
  ctx: Context<Env>,
  entityId: string,
  entityType: T,
  action: Exclude<EntityActionType, 'create'>,
  bySlug = false,
): Promise<ValidContextEntityResult<T>> => {
  // Get current user role and memberships from request context
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const memberships = ctx.var.memberships;

  // Get db from context (set by tenantGuard or crossTenantGuard middleware)
  const db = ctx.var.db;

  // Step 1: Resolve target entity by ID (or slug when bySlug is true)
  const entity = await resolveEntity(entityType, entityId, db, bySlug);
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  // Step 2: Check permission for the requested action (system admin bypass is handled inside)
  const { isAllowed, membership } = checkPermission(memberships, action, entity, { isSystemAdmin });

  if (!isAllowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });
  }

  return { entity, membership };
};
