import type { EntityActionType } from '../../types';
import { accessPolicies, publicReadGrants, elevatedRoles } from '../../config/permissions-config';
import { getAllDecisions } from './permission-manager/check';
import type {
  PermissionCheckOptions,
  PermissionDecision,
  PermissionMembership,
  SubjectForPermission,
} from './permission-manager/types';

/**
 * Permission result containing membership and whether the action is allowed.
 */
export interface PermissionResult<T extends PermissionMembership = PermissionMembership> {
  /** Whether the specific action is allowed */
  isAllowed: boolean;
  /** The user's membership for this entity, if any */
  membership: T | null;
}

/**
 * Batch permission result containing results for multiple entities.
 */
export interface BatchPermissionResult<T extends PermissionMembership = PermissionMembership> {
  /** Map from entity ID to simplified permission result */
  results: Map<string, PermissionResult<T>>;
  /** Map from entity ID to full permission decision (for debugging/auditing) */
  decisions: Map<string, PermissionDecision<T>>;
}

/**
 * Checks if a permission is allowed for the given memberships and action.
 * Accepts a single entity or array of entities.
 *
 * This is the shared entry point used by every tier (backend handlers, yjs relay) so the
 * authorization decision is computed by exactly one engine.
 *
 * @param memberships - User's memberships to check against
 * @param action - The action to check (create, read, update, delete)
 * @param entityOrEntities - Single entity or array of entities to check
 * @param options - Optional settings (e.g., isSystemAdmin for admin bypass, userId for `'own'`)
 * @returns Single entity: `PermissionResult` with `{ isAllowed, membership }`
 * @returns Array: `BatchPermissionResult` with `{ results: Map<id, PermissionResult>, decisions }`
 *
 * Permission is allowed if the entity OR an ancestor matches a membership grant.
 * System admins (options.isSystemAdmin === true) get all permissions.
 */
export function checkPermission<T extends PermissionMembership>(
  memberships: T[],
  action: EntityActionType,
  entity: SubjectForPermission,
  options?: PermissionCheckOptions,
): PermissionResult<T>;
export function checkPermission<T extends PermissionMembership>(
  memberships: T[],
  action: EntityActionType,
  entities: SubjectForPermission[],
  options?: PermissionCheckOptions,
): BatchPermissionResult<T>;
export function checkPermission<T extends PermissionMembership>(
  memberships: T[],
  action: EntityActionType,
  entityOrEntities: SubjectForPermission | SubjectForPermission[],
  options?: PermissionCheckOptions,
): PermissionResult<T> | BatchPermissionResult<T> {
  const isSingle = !Array.isArray(entityOrEntities);

  // Inject the configured grants; explicit options (tests) take precedence.
  const optionsWithGrants: PermissionCheckOptions = {
    publicGrants: publicReadGrants,
    elevatedRoles,
    ...options,
  };

  if (isSingle) {
    const { can, membership } = getAllDecisions(accessPolicies, memberships, entityOrEntities, optionsWithGrants);
    return { isAllowed: can[action], membership };
  }

  const decisions = getAllDecisions(accessPolicies, memberships, entityOrEntities, optionsWithGrants);
  const results = new Map<string, PermissionResult<T>>();

  for (const [id, decision] of decisions) {
    results.set(id, { isAllowed: decision.can[action], membership: decision.membership });
  }

  return { results, decisions };
}
