import type { MembershipModel } from '#/db/schema/memberships';
import { getContextUser } from '#/lib/context';
import { resolveEntities } from '#/lib/entity';
import permissionManager from '#/lib/permission-manager';
import type { Entity } from '#/types/common';

export const splitByAllowance = async (action: string, entityType: Entity, ids: string[], memberships: [MembershipModel]) => {
  // Extract user
  const user = getContextUser();

  // Resolve ids
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
