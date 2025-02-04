import type { Entity } from 'config';
import type { MembershipModel } from '#/db/schema/memberships';
import { getContextUser } from '#/lib/context';
import { resolveEntities } from '#/lib/entity';
import permissionManager, { type PermittedAction } from '#/permissions/permission-manager';

/**
 * Splits entity IDs into allowed and disallowed based on the user's permissions.
 *
 * Resolves the entities and checks whether the user can perform the specified action.
 * The result is split into `allowedIds` and `disallowedIds`.
 *
 * @param action - Action to check `"create" | "read" | "update" | "delete"`.
 * @param entityType - The type of entity (e.g., 'organization').
 * @param ids - The entity IDs to check.
 * @param memberships - The user's memberships.
 * @returns An object with `allowedIds` and `disallowedIds` arrays.
 */
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
