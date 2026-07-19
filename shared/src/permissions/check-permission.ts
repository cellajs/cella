import { accessPolicies, elevatedRoles, publicReadGrants } from '../../config/permissions-config';
import type { EntityActionType } from '../../types';
import { getAllDecisions } from './permission-manager/check';
import { type EngineAccess, getDecisionsForAccesses } from './permission-manager/resolve-access';
import type {
  PermissionCheckOptions,
  PermissionDecision,
  PermissionMembership,
  SubjectForPermission,
} from './permission-manager/types';

/**
 * Who is acting, for tiers that compile predicates rather than run the JS engine (the SQL
 * twin: `compileRowConditionSql`, collection scopes, catchup reads).
 *
 * The discriminated union makes the actor state explicit. An optional `userId` is
 * how permission bugs get in: a caller that simply forgets it still compiles, and every rule
 * that reads the actor (`'own'`, and any fork condition) then silently fails closed. A
 * denial nobody notices. Anonymity has to be *stated*, not achieved by omission.
 *
 * `{ anonymous: true }` cannot be produced by accident and is greppable in review.
 */
export type Actor = { userId: string; isSystemAdmin?: boolean } | { anonymous: true };

/**
 * Who is asking, WITH what they hold: the one input object of {@link checkAccess}.
 *
 * Memberships and actor travel together by construction — the old `(memberships, …, actor)`
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

/** Options accepted by the many-accesses form. */
export interface CheckAccessBatchOptions {
  /**
   * `'throw'` (default) surfaces a malformed membership like the single-access form;
   * `'deny'` fail-closes just that access and keeps resolving the rest (stream fan-out).
   */
  onInvalidMembership?: 'throw' | 'deny';
}

/**
 * The one authorization entry point shared by every JS tier (backend handlers, yjs relay,
 * stream dispatch), so the decision is computed by a single engine. Public read grants and
 * `elevatedRoles` are injected here; callers only supply {@link Access} objects.
 * Allowed if the entity OR an ancestor matches a grant.
 *
 * Three shapes, one semantics:
 * - `checkAccess(access, action, subject)` → `PermissionResult` — the request-path check.
 * - `checkAccess(access, action, subjects[])` → `BatchPermissionResult` — one actor, many
 *   rows (list splitting).
 * - `checkAccess(accesses[], action, subject, options?)` → `PermissionResult[]` — many
 *   actors, one row (stream fan-out). The engine collapses accesses into equivalence
 *   classes internally and runs the policy walk once per class, so cost scales with
 *   distinct access classes, not with actors.
 *
 * The SQL twin (`compileRowConditionSql`, collection scopes) is the one deliberate second
 * form — Postgres cannot call this function — and stays pinned by the row-predicate parity
 * tests.
 */
export function checkAccess<T extends PermissionMembership>(
  access: Access<T>,
  action: EntityActionType,
  subject: SubjectForPermission,
): PermissionResult<T>;
export function checkAccess<T extends PermissionMembership>(
  access: Access<T>,
  action: EntityActionType,
  subjects: SubjectForPermission[],
): BatchPermissionResult<T>;
export function checkAccess<T extends PermissionMembership>(
  accesses: Access<T>[],
  action: EntityActionType,
  subject: SubjectForPermission,
  options?: CheckAccessBatchOptions,
): PermissionResult<T>[];
export function checkAccess<T extends PermissionMembership>(
  accessOrAccesses: Access<T> | Access<T>[],
  action: EntityActionType,
  subjectOrSubjects: SubjectForPermission | SubjectForPermission[],
  options?: CheckAccessBatchOptions,
): PermissionResult<T> | BatchPermissionResult<T> | PermissionResult<T>[] {
  // Many accesses × one subject: engine-side class collapse.
  if (Array.isArray(accessOrAccesses)) {
    if (Array.isArray(subjectOrSubjects)) {
      throw new Error('[Permission] checkAccess: many accesses × many subjects is not a supported shape');
    }
    const decisions = getDecisionsForAccesses(
      accessPolicies,
      accessOrAccesses.map(toEngineAccess),
      subjectOrSubjects,
      { publicGrants: publicReadGrants, elevatedRoles, onInvalidMembership: options?.onInvalidMembership },
    );
    return decisions.map((decision) => ({ isAllowed: decision.can[action], membership: decision.membership }));
  }

  const engineAccess = toEngineAccess(accessOrAccesses);
  const engineOptions: PermissionCheckOptions = {
    publicGrants: publicReadGrants,
    elevatedRoles,
    userId: engineAccess.userId,
    isSystemAdmin: engineAccess.isSystemAdmin,
  };

  // One access × one subject: the request-path check.
  if (!Array.isArray(subjectOrSubjects)) {
    const { can, membership } = getAllDecisions(
      accessPolicies,
      engineAccess.memberships,
      subjectOrSubjects,
      engineOptions,
    );
    return { isAllowed: can[action], membership };
  }

  // One access × many subjects: list splitting.
  const decisions = getAllDecisions(accessPolicies, engineAccess.memberships, subjectOrSubjects, engineOptions);
  const results = new Map<string, PermissionResult<T>>();
  for (const [id, decision] of decisions) {
    results.set(id, { isAllowed: decision.can[action], membership: decision.membership });
  }
  return { results, decisions };
}
