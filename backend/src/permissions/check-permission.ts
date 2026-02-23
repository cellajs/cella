import { accessPolicies, type EntityActionType } from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import {
  getAllDecisions,
  type PermissionCheckOptions,
  type PermissionDecision,
  type SubjectForPermission,
} from './permission-manager';

/**
 * Permission result containing membership and action permissions.
 */
export interface PermissionResult {
  /** Whether the specific action is allowed */
  isAllowed: boolean;
  /** The user's membership for this entity, if any */
  membership: MembershipBaseModel | null;
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
 * @param memberships - User's memberships to check against
 * @param action - The action to check (create, read, update, delete)
 * @param entityOrEntities - Single entity or array of entities to check
 * @param options - Optional settings (e.g., systemRole for admin bypass)
 * @returns Single entity: `PermissionResult` with `{ allowed, membership, can }`
 * @returns Array: `BatchPermissionResult` with `{ results: Map<id, PermissionResult>, decisions }`
 *
 * Permission is allowed if the entity OR an ancestor matches a membership grant.
 * System admins (options.systemRole === 'admin') get all permissions.
 */
export function checkPermission(
  memberships: MembershipBaseModel[],
  action: EntityActionType,
  entity: SubjectForPermission,
  options?: PermissionCheckOptions,
): PermissionResult;
export function checkPermission(
  memberships: MembershipBaseModel[],
  action: EntityActionType,
  entities: SubjectForPermission[],
  options?: PermissionCheckOptions,
): BatchPermissionResult;
export function checkPermission(
  memberships: MembershipBaseModel[],
  action: EntityActionType,
  entityOrEntities: SubjectForPermission | SubjectForPermission[],
  options?: PermissionCheckOptions,
): PermissionResult | BatchPermissionResult {
  const isSingle = !Array.isArray(entityOrEntities);

  if (isSingle) {
    const { can, membership } = getAllDecisions(accessPolicies, memberships, entityOrEntities, options);
    return { isAllowed: can[action], membership };
  }

  const decisions = getAllDecisions(accessPolicies, memberships, entityOrEntities, options);
  const results = new Map<string, PermissionResult>();

  for (const [id, decision] of decisions) {
    results.set(id, { isAllowed: decision.can[action], membership: decision.membership });
  }

  return { results, decisions };
}
