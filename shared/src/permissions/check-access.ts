import { policyMatrix, elevatedRoles, publicReadGrants } from '../../config/permissions-config';
import type { EntityActionType } from '../../types';
import { getAllDecisions } from './engine/check';
import { type EngineAccess, getDecisionsForAccesses } from './engine/resolve-access';
import type {
  PermissionCheckOptions,
  PermissionDecision,
  PermissionMembership,
  SubjectForPermission,
} from './engine/types';

/**
 * Explicit authenticated or anonymous actor used by SQL permission predicates.
 * The discriminant prevents an accidentally omitted user ID from silently denying actor-based
 * conditions.
 */
export type Actor = { userId: string; isSystemAdmin?: boolean } | { anonymous: true };

/**
 * Who is asking, WITH what they hold: the one input object of {@link checkAccess}.
 *
 * Memberships and actor travel together by construction: the old `(memberships, …, actor)`
 * signature let a call site pair one user's memberships with another user's actor, a bug no
 * type could catch. An anonymous access carries no memberships at all: anonymity and
 * membership are contradictory, so the shape forbids the combination outright.
 */
export type Access<T extends PermissionMembership = PermissionMembership> =
  | { userId: string; isSystemAdmin?: boolean; memberships: T[] }
  | { anonymous: true };

/** Access → engine access. System admins bypass every check; anonymous actors hold nothing. */
const toEngineAccess = <T extends PermissionMembership>(access: Access<T>): EngineAccess<T> =>
  'anonymous' in access
    ? { memberships: [] }
    : { memberships: access.memberships, userId: access.userId, isSystemAdmin: access.isSystemAdmin === true };

/**
 * Permission result containing membership and whether the action is allowed.
 */
export interface PermissionResult<T extends PermissionMembership = PermissionMembership> {
  /** Whether the specific action is allowed */
  allowed: boolean;
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

/** Options accepted by {@link checkAccessFanout}. */
export interface CheckAccessFanoutOptions {
  /**
   * `'throw'` (default) surfaces a malformed membership like the single-access form;
   * `'deny'` fail-closes just that access and keeps resolving the rest (stream fan-out).
   */
  onInvalidMembership?: 'throw' | 'deny';
}

/** Config-bound engine options: every entry point of the family injects the same grants. */
// Shared JS permission entry points inject identical public and elevated grants.
// SQL collection predicates are the tested database-side projection of the same decisions.
const boundOptions = { publicGrants: publicReadGrants, elevatedRoles };

/** Engine options for one access, on top of the config-bound grants. */
const accessOptions = <T extends PermissionMembership>(engineAccess: EngineAccess<T>): PermissionCheckOptions => ({
  ...boundOptions,
  userId: engineAccess.userId,
  isSystemAdmin: engineAccess.isSystemAdmin,
});

/**
 * May this actor perform this action on this subject? The request-path check: guards,
 * detail reads, the yjs relay, and dispatch's `canReceiveProductEvent` all land here.
 */
export function checkAccess<T extends PermissionMembership>(
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

/**
 * One actor, many rows: list splitting (`splitByPermission`). The same decision as mapping
 * {@link checkAccess} over the subjects, computed in one engine pass.
 */
export function checkAccessBatch<T extends PermissionMembership>(
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

/**
 * Many actors, one row: stream fan-out. The engine collapses accesses into equivalence
 * classes and runs the policy walk once per class, so cost scales with distinct access
 * classes, not with actors. Same decision per access as {@link checkAccess}; the property
 * test in `resolve-access.test.ts` pins the two.
 */
export function checkAccessFanout<T extends PermissionMembership>(
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
