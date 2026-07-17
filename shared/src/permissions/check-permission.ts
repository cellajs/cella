import { accessPolicies, elevatedRoles, publicReadGrants } from '../../config/permissions-config';
import type { EntityActionType } from '../../types';
import { getAllDecisions } from './permission-manager/check';
import type {
  PermissionCheckOptions,
  PermissionDecision,
  PermissionMembership,
  SubjectForPermission,
} from './permission-manager/types';

/**
 * Who is acting.
 *
 * The discriminated union makes the actor state explicit. An optional `userId` is
 * how permission bugs get in: a caller that simply forgets it still compiles, and every rule
 * that reads the actor (`'own'`, and any fork condition) then silently fails closed. A
 * denial nobody notices. Anonymity has to be *stated*, not achieved by omission.
 *
 * `{ anonymous: true }` cannot be produced by accident and is greppable in review.
 */
export type Actor = { userId: string; isSystemAdmin?: boolean } | { anonymous: true };

/** Actor → engine options. System admins bypass every check; anonymous actors carry no id. */
const actorOptions = (actor: Actor): PermissionCheckOptions =>
  'anonymous' in actor ? {} : { userId: actor.userId, isSystemAdmin: actor.isSystemAdmin === true };

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
 * The one authorization entry point shared by every tier (backend handlers, yjs relay), so the
 * decision is computed by a single engine. Public read grants and `elevatedRoles` are injected
 * here; callers only supply the {@link Actor}. Allowed if the entity OR an ancestor matches a grant.
 *
 * Overloaded on the entity arg: a single entity returns `PermissionResult`; an array returns
 * `BatchPermissionResult` (`{ results: Map<id, …>, decisions }`).
 */
export function checkPermission<T extends PermissionMembership>(
  memberships: T[],
  action: EntityActionType,
  entity: SubjectForPermission,
  actor: Actor,
): PermissionResult<T>;
export function checkPermission<T extends PermissionMembership>(
  memberships: T[],
  action: EntityActionType,
  entities: SubjectForPermission[],
  actor: Actor,
): BatchPermissionResult<T>;
export function checkPermission<T extends PermissionMembership>(
  memberships: T[],
  action: EntityActionType,
  entityOrEntities: SubjectForPermission | SubjectForPermission[],
  actor: Actor,
): PermissionResult<T> | BatchPermissionResult<T> {
  const isSingle = !Array.isArray(entityOrEntities);

  const options: PermissionCheckOptions = {
    publicGrants: publicReadGrants,
    elevatedRoles,
    ...actorOptions(actor),
  };

  if (isSingle) {
    const { can, membership } = getAllDecisions(accessPolicies, memberships, entityOrEntities, options);
    return { isAllowed: can[action], membership };
  }

  const decisions = getAllDecisions(accessPolicies, memberships, entityOrEntities, options);
  const results = new Map<string, PermissionResult<T>>();

  for (const [id, decision] of decisions) {
    results.set(id, { isAllowed: decision.can[action], membership: decision.membership });
  }

  return { results, decisions };
}
