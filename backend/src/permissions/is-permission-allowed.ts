import type { EntityActionType } from 'config';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkAllPermissions, type SubjectForPermission } from './permission-manager';
import type { PermissionCheckOptions } from './permission-manager/types';
import { accessPolicies } from './permissions-config';

/**
 * Permission result containing membership and action permissions.
 */
export interface PermissionResult {
  /** Whether the specific action is allowed */
  allowed: boolean;
  /** The user's membership for this entity, if any */
  membership: MembershipBaseModel | null;
  /** Object containing permission state for all entity actions */
  can: Record<EntityActionType, boolean>;
}

/**
 * Entity with at minimum an entityType. Context entities need id, product entities need context IDs.
 */
type PermissionEntity = SubjectForPermission & { id?: string };

/**
 * Checks if a permission is allowed for the given memberships and action on an entity.
 * Returns the membership object and a `can` object with all action permissions.
 *
 * ## Requirements
 *
 * 1. **Membership matching**: The returned `membership` must satisfy:
 *    `membership[entityIdColumnKeys[entityType]]` === `entity.id` OR `entity[entityIdColumnKey]`
 *    - For context entities (e.g., organization): use `entity.id`
 *    - For product entities (e.g., attachment): use `entity[organizationId]` etc.
 *    - There should be exactly one match or zero (null is acceptable)
 *
 * 2. **Permission logic**: Permission is allowed if the entity OR an ancestor matches:
 *    - We traverse the entity hierarchy (entity itself → parent contexts)
 *    - For each level, check if a membership grants the requested action
 *    - Match via: `membership[entityIdColumnKeys[contextType]]` === `entity.id` (if entity is context) OR `entity[contextIdKey]`
 *
 * 3. **Single pass**: The `can` object and `membership` are built in the core permission
 *    checking logic (check.ts) as we iterate over the permissions config.
 *
 * 4. **System admin**: If options.systemRole is 'admin', all permissions are granted.
 *
 * @param memberships - User's memberships.
 * @param action - The entity action to check.
 * @param entity - The entity being accessed with entityType and id (for context) or context IDs (for product).
 * @param options - Optional permission check options (e.g., systemRole).
 * @returns Permission result with allowed state, membership, and can object.
 */
export const isPermissionAllowed = (
  memberships: MembershipBaseModel[],
  action: EntityActionType,
  entity: PermissionEntity,
  options?: PermissionCheckOptions,
): PermissionResult => {
  const { can, membership } = checkAllPermissions(accessPolicies, memberships, entity, options);

  return {
    allowed: can[action],
    membership,
    can,
  };
};
