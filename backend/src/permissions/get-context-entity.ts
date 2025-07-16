import { type ContextEntityType, config } from 'config';

import { getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { type EntityModel, resolveEntity } from '#/lib/entity';
import { ApiError } from '#/lib/errors';
import type { MembershipSummary } from '#/modules/memberships/helpers/select';
import { checkPermission } from '#/permissions/check-if-allowed';
import type { PermittedAction } from '#/permissions/permissions-config';

/**
 * Checks if user has permission to perform an action on a context entity.
 *
 * Resolves context entity based on the given type and ID/slug, checks user permissions (including system admins),
 * and retrieves the user's membership for the entity.
 *
 * It returns either an error object or an object with the resolved entity + membership and without error.
 *
 * @param entityType - The type of entity (e.g., organization, project).
 * @param action - Action to check `"create" | "read" | "update" | "delete"`.
 * @param idOrSlug - entity id or slug.
 * @returns An object with:
 *   - `entity`: Resolved context entity or `null` if not found.
 *   - `membership`: User's membership or `null` if not found.
 *   - `error`: Error object or `null` if no error occurred.
 */
export const getValidContextEntity = async <T extends ContextEntityType>(
  idOrSlug: string,
  entityType: T,
  action: Exclude<PermittedAction, 'create'>,
): Promise<{ error: null; entity: EntityModel<T>; membership: MembershipSummary | null }> => {
  const user = getContextUser();
  const memberships = getContextMemberships();
  const isSystemAdmin = user.role === 'admin';

  // Step 1: Resolve entity
  const entity = (await resolveEntity(entityType, idOrSlug)) || null;
  if (!entity) throw new ApiError({ status: 404, type: 'not_found', severity: 'warn' });

  // Step 2: Permission check
  const isAllowed = checkPermission(memberships, action, entity);
  if (!isAllowed) throw new ApiError({ status: 403, type: 'forbidden', severity: 'warn' });

  // Step 3: Membership check
  const entityIdField = config.entityIdFields[entity.entityType];
  const membership = memberships.find((m) => m[entityIdField] === entity.id && m.contextType === entityType) || null;

  if (!membership && !isSystemAdmin) throw new ApiError({ status: 400, type: 'invalid_request', severity: 'error' });

  // Step 4: Organization check
  const org = getContextOrganization();
  if (membership?.organizationId && org) {
    const organizationMatches = membership.organizationId === org.id;
    if (!organizationMatches) throw new ApiError({ status: 400, type: 'invalid_request', severity: 'error', entityType });
  }

  return { error: null, entity, membership };
};
