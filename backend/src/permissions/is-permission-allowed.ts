import type { EntityActionType } from 'config';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import {
  getAllDecisions,
  type PermissionCheckOptions,
  type PermissionDecision,
  type SubjectForPermission,
} from './permission-manager';
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
 * Batch permission result containing results for multiple entities.
 */
export interface BatchPermissionResult {
  /** Map from entity ID to simplified permission result */
  results: Map<string, PermissionResult>;
  /** Map from entity ID to full permission decision (for debugging/auditing) */
  decisions: Map<string, PermissionDecision<MembershipBaseModel>>;
}

/**
 * Checks if a permission is allowed for the given memberships and action.
 * Accepts a single entity or array of entities.
 *
 * For single entity: returns PermissionResult.
 * For array of entities: returns BatchPermissionResult with results and decisions maps.
 *
 * ## Requirements
 *
 * 1. **Membership matching**: The returned `membership` must satisfy:
 *    `membership[entityIdColumnKeys[entityType]]` === `entity.id` OR `entity[entityIdColumnKey]`
 *    - For context entities (e.g., organization): use `entity.id`
 *    - For product entities (e.g., attachment): use `entity[organizationId]` etc.
 *
 * 2. **Permission logic**: Permission is allowed if the entity OR an ancestor matches:
 *    - We traverse the entity hierarchy (entity itself → parent contexts)
 *    - For each level, check if a membership grants the requested action
 *
 * 3. **System admin**: If options.systemRole is 'admin', all permissions are granted.
 */
export function isPermissionAllowed(
  memberships: MembershipBaseModel[],
  action: EntityActionType,
  entity: SubjectForPermission,
  options?: PermissionCheckOptions,
): PermissionResult;
export function isPermissionAllowed(
  memberships: MembershipBaseModel[],
  action: EntityActionType,
  entities: SubjectForPermission[],
  options?: PermissionCheckOptions,
): BatchPermissionResult;
export function isPermissionAllowed(
  memberships: MembershipBaseModel[],
  action: EntityActionType,
  entityOrEntities: SubjectForPermission | SubjectForPermission[],
  options?: PermissionCheckOptions,
): PermissionResult | BatchPermissionResult {
  const isSingle = !Array.isArray(entityOrEntities);

  if (isSingle) {
    const { can, membership } = getAllDecisions(accessPolicies, memberships, entityOrEntities, options);
    return { allowed: can[action], membership, can };
  }

  const decisions = getAllDecisions(accessPolicies, memberships, entityOrEntities, options);
  const results = new Map<string, PermissionResult>();

  for (const [id, decision] of decisions) {
    const can = decision.can;
    results.set(id, { allowed: can[action], membership: decision.membership, can });
  }

  return { results, decisions };
}
