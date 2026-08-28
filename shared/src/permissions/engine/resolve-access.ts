import type { ChannelEntityType } from '../../../types.ts';
import { allActionsDenied, createActionRecord } from '../action-helpers.ts';
import { isRowCondition, matchesRowCondition, type RowConditionName, type RowForCondition } from '../row-conditions.ts';
import type { PolicyMatrix } from '../types.ts';
import { buildPolicyIndex, checkWithIndices, getMembershipIndex, getSubjectChannelId } from './check.ts';
import { resolveHierarchy } from './resolve-hierarchy.ts';
import type { AccessMembership, PermissionCheckOptions, PermissionDecision, SubjectForPermission } from './types.ts';
import { validateSubject } from './validation.ts';

/**
 * One actor's inputs to a decision: memberships plus the two actor fields the engine reads. An
 * anonymous actor is `{ memberships: [] }` with no `userId`, which the `checkAccess*` wrappers
 * map their public `Access` union onto.
 */
export interface EngineAccess<T extends AccessMembership = AccessMembership> {
  memberships: T[];
  userId?: string;
  isSystemAdmin?: boolean;
}

export interface ResolveAccessOptions extends PermissionCheckOptions {
  /**
   * When an access's memberships fail `validateMembership`: `'throw'` (default) raises, matching
   * the single-access path, since a malformed membership on a request is a bug. `'deny'`
   * fail-closes that one access and keeps resolving the rest, so one corrupt stream subscriber
   * does not take the batch down with it.
   */
  onInvalidMembership?: 'throw' | 'deny';
}

/** Fail-closed decision for an access the engine refuses to evaluate. */
const deniedDecision = <T extends AccessMembership>(subject: SubjectForPermission): PermissionDecision<T> => ({
  subject: { entityType: subject.entityType, id: subject.id, channelIds: {} },
  actions: createActionRecord(() => ({ allowed: false, grantedBy: [] })),
  can: { ...allActionsDenied },
  membership: null,
});

/**
 * Many actors against one subject, grouping accesses the policy engine cannot tell apart. Keys
 * cover system-admin state, referenced row conditions and roles at each subject channel level.
 * Each class result is then paired with the access's own membership.
 */
export function getDecisionsForAccesses<T extends AccessMembership>(
  policies: PolicyMatrix,
  accesses: EngineAccess<T>[],
  subject: SubjectForPermission,
  options?: ResolveAccessOptions,
): PermissionDecision<T>[] {
  const { hierarchy, entityActions, getRoles } = resolveHierarchy(options);
  validateSubject(subject, undefined, hierarchy);

  const ancestors = hierarchy.getOrderedAncestors(subject.entityType) as ChannelEntityType[];
  const orderedChannels = (
    hierarchy.isChannel(subject.entityType) ? [subject.entityType, ...ancestors] : [...ancestors]
  ) as ChannelEntityType[];

  const policyIndex = buildPolicyIndex(policies, subject.entityType);

  // Row conditions this subject's policies reference: besides roles and the admin bit, the only
  // places an actor's identity enters a decision.
  const conditionNames: RowConditionName[] = [];
  for (const permissions of policyIndex.values()) {
    for (const action of entityActions) {
      const value = permissions[action];
      if (isRowCondition(value) && !conditionNames.includes(value)) conditionNames.push(value);
    }
  }

  const conditionRow: RowForCondition = { ...subject.row, createdBy: subject.createdBy };

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
        options?.elevatedGrants,
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
