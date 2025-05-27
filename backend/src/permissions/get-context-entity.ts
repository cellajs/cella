import { type ContextEntityType, config } from 'config';
import type { Context } from 'hono';

import { type Env, getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { type EntityModel, resolveEntity } from '#/lib/entity';
import { type ErrorType, createError } from '#/lib/errors';
import type { MembershipSummary } from '#/modules/memberships/helpers/select';
import permissionManager, { type PermittedAction } from '#/permissions/permissions-config';

/**
 * Checks if user has permission to perform an action on a context entity.
 *
 * Resolves context entity based on the given type and ID/slug, checks user permissions (including system admins),
 * and retrieves the user's membership for the entity.
 *
 * It returns either an error object or an object with the resolved entity + membership and without error.
 *
 * @param ctx - The request context.
 * @param entityType - The type of entity (e.g., organization, project).
 * @param action - Action to check `"create" | "read" | "update" | "delete"`.
 * @param idOrSlug - entity id or slug.
 * @returns An object with:
 *   - `entity`: Resolved entity or `null` if not found.
 *   - `membership`: User's membership or `null` if not found.
 *   - `error`: Error object or `null` if no error occurred.
 */
export const getValidContextEntity = async <T extends ContextEntityType>(
  ctx: Context<Env>,
  entityType: T,
  action: PermittedAction,
  idOrSlug: string,
): Promise<{ error: ErrorType; entity: null; membership: null } | { error: null; entity: EntityModel<T>; membership: MembershipSummary | null }> => {
  const user = getContextUser();
  const memberships = getContextMemberships();
  const isSystemAdmin = user.role === 'admin';

  const nullData = { entity: null, membership: null };

  // Step 1: Resolve entity
  const entity = (await resolveEntity(entityType, idOrSlug)) || null;
  if (!entity) return { error: createError(ctx, 404, 'not_found', 'warn', entityType), ...nullData };

  // Step 2: Permission check
  // const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity) || isSystemAdmin
  const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity);
  if (!isAllowed) return { error: createError(ctx, 403, 'forbidden', 'warn', entityType), ...nullData };

  // Step 3: Membership check
  const entityIdField = config.entityIdFields[entity.entityType];
  const membership = memberships.find((m) => m[entityIdField] === entity.id && m.contextType === entityType) || null;

  if (!membership && !isSystemAdmin) return { error: createError(ctx, 400, 'invalid_request', 'error', entityType), ...nullData };

  // Step 4: Organization check
  const org = getContextOrganization();
  if (membership?.organizationId && org) {
    const organizationMatches = membership.organizationId === org.id;
    if (!organizationMatches) return { error: createError(ctx, 400, 'invalid_request', 'error', entityType), ...nullData };
  }

  return { error: null, entity, membership };
};
