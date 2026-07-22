import type { ChannelEntityType } from '../../../types';
import type { AccessPolicies } from '../types';
import { allActionsDenied, createActionRecord } from '../action-helpers';
import { isRowCondition, matchesRowCondition, type RowConditionName, type RowForCondition } from '../row-conditions';
import { buildPolicyIndex, checkWithIndices, getMembershipIndex, getSubjectChannelId } from './check';
import { resolveTopology } from './resolve-topology';
import type { PermissionCheckOptions, PermissionDecision, PermissionMembership, SubjectForPermission } from './types';
import { validateSubject } from './validation';

/**
 * One actor's inputs to a decision, engine-shaped: the memberships plus the two actor
 * fields the engine reads. Anonymous actors are expressed as `{ memberships: [] }` with
 * no `userId`; the `checkAccess*` wrappers map their public `Access` union onto this.
 */
export interface EngineAccess<T extends PermissionMembership = PermissionMembership> {
  memberships: T[];
  userId?: string;
  isSystemAdmin?: boolean;
}

export interface ResolveAccessOptions extends PermissionCheckOptions {
  /**
   * What to do when an access's memberships fail `validateMembership`:
   * - `'throw'` (default): surface the error, matching the single-access path; a malformed
   *   membership in a request context is a bug to crash on.
   * - `'deny'`: fail-close JUST that access (all actions denied) and keep resolving the rest.
   *   For fan-out callers (stream dispatch) where one corrupt subscriber must not poison the
   *   batch or mask the others.
   */
  onInvalidMembership?: 'throw' | 'deny';
}

/** All-denied decision for an access the engine refuses to evaluate (fail-closed). */
const deniedDecision = <T extends PermissionMembership>(subject: SubjectForPermission): PermissionDecision<T> => ({
  subject: { entityType: subject.entityType, id: subject.id, channelIds: {} },
  actions: createActionRecord(() => ({ enabled: false, grantedBy: [] })),
  can: { ...allActionsDenied },
  membership: null,
});

/**
 * Resolves many actors against one subject by grouping accesses the policy engine cannot
 * distinguish. Keys include system-admin state, referenced row conditions, and roles at
 * each subject channel level. The per-call class result is then paired with each access's
 * own membership; property tests compare it with independent single-access decisions.
 */
export function getDecisionsForAccesses<T extends PermissionMembership>(
  policies: AccessPolicies,
  accesses: EngineAccess<T>[],
  subject: SubjectForPermission,
  options?: ResolveAccessOptions,
): PermissionDecision<T>[] {
  const { hierarchy, entityActions, getRoles } = resolveTopology(options?.topology);
  validateSubject(subject, undefined, hierarchy);

  const ancestors = hierarchy.getOrderedAncestors(subject.entityType) as ChannelEntityType[];
  const orderedChannels = (
    hierarchy.isChannel(subject.entityType) ? [subject.entityType, ...ancestors] : [...ancestors]
  ) as ChannelEntityType[];

  const policyIndex = buildPolicyIndex(policies, subject.entityType);

  // Row conditions this subject's policies actually reference: these are the only places
  // an actor's identity can enter a decision besides roles and the admin bit.
  const conditionNames: RowConditionName[] = [];
  for (const permissions of policyIndex.values()) {
    for (const action of entityActions) {
      const value = permissions[action];
      if (isRowCondition(value) && !conditionNames.includes(value)) conditionNames.push(value);
    }
  }

  const conditionRow: RowForCondition = { ...subject.row, createdBy: subject.createdBy };

  // The subject's channel levels, resolved once: the exact index lookups the walk makes.
  const channelLevels: Array<[ChannelEntityType, string]> = [];
  for (const channelType of orderedChannels) {
    const channelId = getSubjectChannelId(subject, channelType);
    if (channelId) channelLevels.push([channelType, channelId]);
  }
  const primaryChannel = orderedChannels[0];
  const primaryChannelId = primaryChannel ? getSubjectChannelId(subject, primaryChannel) : undefined;

  const memo = new Map<string, PermissionDecision<T>>();

  return accesses.map((access) => {
    let membershipIndex: ReturnType<typeof getMembershipIndex<T>>;
    try {
      membershipIndex = getMembershipIndex(access.memberships);
    } catch (error) {
      if (options?.onInvalidMembership === 'deny') return deniedDecision<T>(subject);
      throw error;
    }

    let key: string;
    if (access.isSystemAdmin === true) {
      key = 'A'; // admin bypass reads nothing else from the actor
    } else {
      key = '|';
      for (const name of conditionNames) {
        key += matchesRowCondition(name, conditionRow, { userId: access.userId }) ? '1' : '0';
      }
      for (const [channelType, channelId] of channelLevels) {
        const held = membershipIndex.get(`${channelType}:${channelId}`);
        if (held?.length) {
          const roles = held.map((m) => m.role as string);
          if (roles.length > 1) roles.sort();
          key += `|${channelType}:${roles.join('+')}`;
        }
      }
    }

    let decision = memo.get(key);
    if (!decision) {
      decision = checkWithIndices(
        membershipIndex,
        policyIndex,
        subject,
        orderedChannels,
        getRoles,
        entityActions,
        access.isSystemAdmin === true,
        access.userId,
        options?.publicGrants,
        options?.elevatedRoles,
        options?.debug,
      );
      memo.set(key, decision);
    }

    // Re-personalize: the class decision's membership belongs to the class representative.
    const membership = primaryChannelId
      ? (membershipIndex.get(`${primaryChannel}:${primaryChannelId}`)?.[0] ?? null)
      : null;
    return decision.membership === membership ? decision : { ...decision, membership };
  });
}
