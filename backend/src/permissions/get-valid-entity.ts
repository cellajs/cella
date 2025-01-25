import type { MembershipModel } from '#/db/schema/memberships';
import type { ContextEntity } from '#/types/common';
import { getContextUser, getMemberships } from '../lib/context';
import { type EntityModel, resolveEntity } from '../lib/entity';
import permissionManager, { type PermittedAction } from './permission-manager';

// Check if the user is allowed to perform an action on an entity.
// Return the entity, whether the user is allowed, and the membership.
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
  const memberships = getMemberships();

  const isSystemAdmin = user.role === 'admin';

  // Check if user is allowed to perform an action on entity
  const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity) || isSystemAdmin;
  if (!isAllowed) return { entity: null, isAllowed: false, membership: null };

  // TODO: can we make this dynamic? Find membership for entity
  const membership = memberships.find((m) => entity && [m.organizationId].includes(entity.id) && m.type === entityType) || null;

  return { entity, isAllowed, membership };
};
