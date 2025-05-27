import { type ContextEntityType, type ProductEntityType, config } from 'config';
import type { Context } from 'hono';

import { type Env, getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { type EntityModel, resolveEntity } from '#/lib/entity';
import { type ErrorType, createError } from '#/lib/errors';
import permissionManager, { type PermittedAction } from '#/permissions/permissions-config';

/**
 * Checks if user has permission to perform an action on a product entity.
 *
 * Resolves product entity based on the given type and ID/slug, checks user permissions (including system admins),
 * and retrieves the user's membership for the entity.
 *
 * It returns either an error object or an object with the resolved entity without error.
 *
 * @param ctx - Request context.
 * @param idOrSlug - Product id or slug.
 * @param entityType - Product entity type.
 * @param contextEntityType: One of context entity types, that the product entity belongs to (e.g., "organization", "project").
 * @param action - Action to check `"create" | "read" | "update" | "delete"`.
 * @returns An object with:
 *   - `entity`: Resolved product entity or `null` if not found.
 *   - `error`: Error object or `null` if no error occurred.
 */
export const getValidProductEntity = async <K extends ProductEntityType>(
  ctx: Context<Env>,
  idOrSlug: string,
  entityType: K,
  contextEntityType: ContextEntityType,
  action: PermittedAction,
): Promise<{ error: ErrorType; entity: null } | { error: null; entity: EntityModel<K> }> => {
  const nullResult = { entity: null };

  const user = getContextUser();
  const memberships = getContextMemberships();
  const isSystemAdmin = user.role === 'admin';

  // Step 1: Resolve entity
  const entity = await resolveEntity(entityType, idOrSlug);
  if (!entity) return { error: createError(ctx, 404, 'not_found', 'warn', entityType), ...nullResult };

  // Step 2: Permission check
  const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity) || isSystemAdmin;
  if (!isAllowed) return { error: createError(ctx, 403, 'forbidden', 'warn', entityType), ...nullResult };

  // Step 3: Membership check
  const entityIdField = config.entityIdFields[contextEntityType];
  const entityId = (entity as Record<string, unknown>)[entityIdField];

  const membership = memberships.find((m) => m.contextType === contextEntityType && m[entityIdField] === entityId) || null;

  if (!membership && !isSystemAdmin) return { error: createError(ctx, 400, 'invalid_request', 'error', entityType), ...nullResult };

  // Step 4: Organization check
  const org = getContextOrganization();
  if (membership?.organizationId && org && membership.organizationId !== org.id)
    return { error: createError(ctx, 400, 'invalid_request', 'error', entityType), ...nullResult };

  return { error: null, entity };
};
