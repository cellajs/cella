import type { ContextEntity } from 'config';
import type { MembershipModel } from '#/db/schema/memberships';
import { entityIdFields } from '#/entity-config';
import { getContextMemberships, getContextUser } from '../lib/context';
import { type EntityModel, resolveEntity } from '../lib/entity';
import permissionManager, { type PermittedAction } from './permission-manager';

/**
 * Checks if user has permission to perform an action on an entity.
 *
 * Resolves entity based on the given type and ID/slug, checks user permissions (including system admins),
 * and retrieves the user's membership for the entity.
 *
 * @param entityType - The type of entity (e.g., organization, project).
 * @param action - Action to check `"create" | "read" | "update" | "delete"`.
 * @param idOrSlug - entity's id or slug.
 * @returns An object with:
 *   - `entity`: Resolved entity or `null` if not found.
 *   - `isAllowed`: Whether user can perform the action.
 *   - `membership`: User's membership or `null` if not found.
 */
export const getValidEntity = async <T extends ContextEntity>(
  entityType: T,
  action: PermittedAction,
  idOrSlug: string,
): Promise<{
  entity: EntityModel<T> | null;
  isAllowed: boolean;
  membership: MembershipModel | null;
}> => {
  const entity = (await resolveEntity(entityType, idOrSlug)) || null;

  if (!entity) {
    return {
      entity: null,
      isAllowed: false,
      membership: null,
    };
  }

  const user = getContextUser();
  const memberships = getContextMemberships();

  const isSystemAdmin = user.role === 'admin';

  // Check if user is allowed to perform an action on entity
  const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity) || isSystemAdmin;
  if (!isAllowed) return { entity: null, isAllowed: false, membership: null };

  // Find membership for entity
  const entityIdField = entityIdFields[entity.entity];
  const membership = memberships.find((m) => m[entityIdField] === entity.id && m.type === entityType) || null;

  return { entity, isAllowed, membership };
};
