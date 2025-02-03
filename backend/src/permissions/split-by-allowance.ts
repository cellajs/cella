import type { MembershipModel } from '#/db/schema/memberships';
import { getContextUser } from '#/lib/context';
import { resolveEntities } from '#/lib/entity';
import permissionManager, { type PermittedAction } from '#/permissions/permission-manager';
import type { Entity } from '#/types/common';

// Split entities into those that user is allowed to act (action) on from the ones that are restricted
export const splitByAllowance = async (action: PermittedAction, entityType: Entity, ids: string[], memberships: [MembershipModel]) => {
  const user = getContextUser();

  // Resolve entities
  const entities = await resolveEntities(entityType, ids);

  // Logic to split ids based on permission
  const allowedIds: string[] = [];
  const disallowedIds: string[] = [];

  for (const entity of entities) {
    const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity);
    if (!isAllowed && user.role !== 'admin') {
      disallowedIds.push(entity.id);
    } else {
      allowedIds.push(entity.id);
    }
  }

  return { allowedIds, disallowedIds };
};
