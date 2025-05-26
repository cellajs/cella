import { type ContextEntityType, config } from 'config';
import type { Context } from 'hono';
import { type Env, getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { type EntityModel, resolveEntity } from '#/lib/entity';
import { type ErrorType, createError } from '#/lib/errors';
import type { MembershipSummary } from '#/modules/memberships/helpers/select';
import permissionManager, { type PermittedAction } from './permissions-config';

/**
 * Checks if user has permission to perform an action on a context entity.
 *
 * Resolves entity based on the given type and ID/slug, checks user permissions (including system admins),
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
export const getValidEntity = async <T extends ContextEntityType>(
  ctx: Context<Env>,
  entityType: T,
  action: PermittedAction,
  idOrSlug: string,
): Promise<
  { error: ErrorType; entityType: null; membership: null } | { error: null; entity: EntityModel<T>; membership: MembershipSummary | null }
> => {
  const user = getContextUser();
  const memberships = getContextMemberships();
  const isSystemAdmin = user.role === 'admin';

  const nullData = { entityType: null, membership: null };

  // Resolve entity
  const entity = (await resolveEntity(entityType, idOrSlug)) || null;
  if (!entity) return { error: createError(ctx, 404, 'not_found', 'warn', entityType), ...nullData };

  // Check if user is allowed to perform an action on entity
  const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity) || isSystemAdmin;
  if (!isAllowed) return { error: createError(ctx, 403, 'forbidden', 'warn', entityType), ...nullData };

  // Find membership for entity
  const entityIdField = config.entityIdFields[entity.entityType];
  const membership = memberships.find((m) => m[entityIdField] === entity.id && m.contextType === entityType) || null;

  if (!membership && !isSystemAdmin) return { error: createError(ctx, 400, 'invalid_request', 'error', entityType), ...nullData };

  const organization = getContextOrganization();

  if (membership?.organizationId && organization) {
    const organizationMatches = membership.organizationId === organization.id;
    if (!organizationMatches) return { error: createError(ctx, 400, 'invalid_request', 'error', entityType), ...nullData };
  }

  return { error: null, entity, membership };
};
