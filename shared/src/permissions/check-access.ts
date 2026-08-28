import { hierarchy } from '../../config/hierarchy-config.ts';
import { policyMatrix, publicReadGrants } from '../../config/permissions-config.ts';
import type { EntityActionType } from '../../types.ts';
import { getAllDecisions } from './engine/check.ts';
import { type EngineAccess, getDecisionsForAccesses } from './engine/resolve-access.ts';
import type {
  AccessMembership,
  PermissionCheckOptions,
  PermissionDecision,
  SubjectForPermission,
} from './engine/types.ts';

/**
 * Authenticated or anonymous actor used by SQL permission predicates. The discriminant makes an
 * omitted user id a type error, so no actor-based condition is denied by accident.
 */
export type Actor = { userId: string; isSystemAdmin?: boolean } | { anonymous: true };

/**
 * Memberships and actor travel together, so no call site can pair one user's memberships with
 * another's actor. An anonymous access carries no memberships.
 */
export type Access<T extends AccessMembership = AccessMembership> =
  | { userId: string; isSystemAdmin?: boolean; memberships: T[] }
  | { anonymous: true };

/** System admins bypass every check; anonymous actors hold nothing. */
const toEngineAccess = <T extends AccessMembership>(access: Access<T>): EngineAccess<T> =>
  'anonymous' in access
    ? { memberships: [] }
    : { memberships: access.memberships, userId: access.userId, isSystemAdmin: access.isSystemAdmin === true };

export interface PermissionResult<T extends AccessMembership = AccessMembership> {
  allowed: boolean;
  /** The user's membership for this entity, null when none applies. */
  membership: T | null;
}

export interface BatchPermissionResult<T extends AccessMembership = AccessMembership> {
  /** Keyed by entity id. */
  results: Map<string, PermissionResult<T>>;
  /** Keyed by entity id; the full decision, for debugging and auditing. */
  decisions: Map<string, PermissionDecision<T>>;
}

export interface CheckAccessFanoutOptions {
  /**
   * `'throw'` (default) reports a malformed membership like the single-access form. `'deny'`
   * fail-closes that one access and keeps resolving the rest, which stream fan-out needs.
   */
  onInvalidMembership?: 'throw' | 'deny';
}

// Every entry point injects the same public and elevated grants. SQL collection predicates are
// the tested database-side projection of the same decisions.
const boundOptions = { publicGrants: publicReadGrants, elevatedGrants: hierarchy.elevatedGrants };

const accessOptions = <T extends AccessMembership>(engineAccess: EngineAccess<T>): PermissionCheckOptions => ({
  ...boundOptions,
  userId: engineAccess.userId,
  isSystemAdmin: engineAccess.isSystemAdmin,
});

/** The request-path check. @see cella/PERMISSIONS.md */
export function checkAccess<T extends AccessMembership>(
  access: Access<T>,
  action: EntityActionType,
  subject: SubjectForPermission,
): PermissionResult<T> {
  const engineAccess = toEngineAccess(access);
  const { can, membership } = getAllDecisions(
    policyMatrix,
    engineAccess.memberships,
    subject,
    accessOptions(engineAccess),
  );
  return { allowed: can[action], membership };
}

/** One actor, many rows: `splitByPermission`, in one engine pass. */
export function checkAccessBatch<T extends AccessMembership>(
  access: Access<T>,
  action: EntityActionType,
  subjects: SubjectForPermission[],
): BatchPermissionResult<T> {
  const engineAccess = toEngineAccess(access);
  const decisions = getAllDecisions(policyMatrix, engineAccess.memberships, subjects, accessOptions(engineAccess));
  const results = new Map<string, PermissionResult<T>>();
  for (const [id, decision] of decisions) {
    results.set(id, { allowed: decision.can[action], membership: decision.membership });
  }
  return { results, decisions };
}

/** Many actors, one row: stream fan-out. @see resolve-access.ts */
export function checkAccessFanout<T extends AccessMembership>(
  accesses: Access<T>[],
  action: EntityActionType,
  subject: SubjectForPermission,
  options?: CheckAccessFanoutOptions,
): PermissionResult<T>[] {
  const decisions = getDecisionsForAccesses(policyMatrix, accesses.map(toEngineAccess), subject, {
    ...boundOptions,
    onInvalidMembership: options?.onInvalidMembership,
  });
  return decisions.map((decision) => ({ allowed: decision.can[action], membership: decision.membership }));
}
