import type { ContextEntity } from 'config';
import type { Context } from 'hono';
import type { MembershipModel } from '#/db/schema/memberships';
import { entityIdFields } from '#/entity-config';
import { type ErrorType, createError } from '#/lib/errors';
import { getContextMemberships, getContextUser } from '../lib/context';
import { type EntityModel, resolveEntity } from '../lib/entity';
import permissionManager, { type PermittedAction } from './permission-manager';

/**
 * Checks if user has permission to perform an action on an entity.
 *
 * Resolves entity based on the given type and ID/slug, checks user permissions (including system admins),
 * and retrieves the user's membership for the entity.
 *
 * @param ctx - The request context.
 * @param entityType - The type of entity (e.g., organization, project).
 * @param action - Action to check `"create" | "read" | "update" | "delete"`.
 * @param idOrSlug - entity's id or slug.
 * @returns An object with:
 *   - `entity`: Resolved entity or `null` if not found.
 *   - `membership`: User's membership or `null` if not found.
 *   - `error`: Error object or `null` if no error occurred.
 */
export const getValidEntity = async <T extends ContextEntity>(
  ctx: Context,
  entityType: T,
  action: PermittedAction,
  idOrSlug: string,
): Promise<{ error: ErrorType; entity: null; membership: null } | { error: null; entity: EntityModel<T>; membership: MembershipModel | null }> => {
  const user = getContextUser();
  const memberships = getContextMemberships();
  const isSystemAdmin = user.role === 'admin';

  const nullData = { entity: null, membership: null };

  // Resolve entity
  const entity = (await resolveEntity(entityType, idOrSlug)) || null;
  if (!entity) return { error: createError(ctx, 404, 'not_found', 'warn', entityType), ...nullData };

  // Check if user is allowed to perform an action on entity
  const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity) || isSystemAdmin;
  if (!isAllowed) return { error: createError(ctx, 403, 'forbidden', 'warn', entityType), ...nullData };

  // Find membership for entity
  const entityIdField = entityIdFields[entity.entity];
  const membership = memberships.find((m) => m[entityIdField] === entity.id && m.type === entityType) || null;

  if (!membership && !isSystemAdmin) return { error: createError(ctx, 400, 'invalid_request', 'error', entityType), ...nullData };

  const organization = ctx.get('organization');

  if (membership?.organizationId && organization) {
    const organizationMatches = membership.organizationId === organization.id;
    if (!organizationMatches) return { error: createError(ctx, 400, 'invalid_request', 'error', entityType), ...nullData };
  }

  return { error: null, entity, membership };
};
