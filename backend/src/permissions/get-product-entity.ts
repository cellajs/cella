import { type ContextEntityType, config, type ProductEntityType } from 'config';
import { getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { type EntityModel, resolveEntity } from '#/lib/entity';
import { ApiError } from '#/lib/newErrors';
import { checkPermission } from '#/permissions/check-if-allowed';
import type { PermittedAction } from '#/permissions/permissions-config';

/**
 * Checks if user has permission to perform an action on a product entity.
 *
 * Resolves product entity based on the given type and ID/slug, checks user permissions (including system admins),
 * and retrieves the user's membership for the entity.
 *
 * It returns either an error object or an object with the resolved entity without error.
 *
 * @param idOrSlug - Product id or slug.
 * @param entityType - Product entity type.
 * @param contextEntityType: One of context entity types, that the product entity belongs to (e.g., "organization", "project").
 * @param action - Action to check `"read" | "update" | "delete"`.
 * @returns An object with:
 *   - `entity`: Resolved product entity or `null` if not found.
 *   - `error`: Error object or `null` if no error occurred.
 */
export const getValidProductEntity = async <K extends ProductEntityType>(
  idOrSlug: string,
  entityType: K,
  contextEntityType: ContextEntityType,
  action: Exclude<PermittedAction, 'create'>,
): Promise<EntityModel<K>> => {
  const user = getContextUser();
  const memberships = getContextMemberships();
  const isSystemAdmin = user.role === 'admin';

  // Step 1: Resolve entity
  const entity = await resolveEntity(entityType, idOrSlug);
  if (!entity) throw new ApiError({ status: 404, type: 'not_found', severity: 'warn', entityType });

  // Step 2: Permission check
  const isAllowed = checkPermission(memberships, action, entity);
  if (!isAllowed) throw new ApiError({ status: 403, type: 'forbidden', severity: 'warn', entityType });

  // Step 3: Membership check
  const entityIdField = config.entityIdFields[contextEntityType];
  const entityId = (entity as Record<string, unknown>)[entityIdField];

  const membership = memberships.find((m) => m.contextType === contextEntityType && m[entityIdField] === entityId) || null;

  if (!membership && !isSystemAdmin) throw new ApiError({ status: 400, type: 'invalid_request', severity: 'error', entityType });

  // Step 4: Organization check
  const org = getContextOrganization();
  if (membership?.organizationId && org && membership.organizationId !== org.id) {
    throw new ApiError({ status: 400, type: 'invalid_request', severity: 'error', entityType });
  }
  return entity;
};
