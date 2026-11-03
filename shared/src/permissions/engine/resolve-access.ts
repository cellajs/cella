import type { ChannelEntityType, EntityActionType } from '../../../types.ts';
import { appConfig } from '../../config-builder/app-config.ts';
import { allActionsDenied } from '../action-helpers.ts';
import { conditionRowOf, isRowCondition, matchesRowCondition, type RowConditionName } from '../row-conditions.ts';
import type { PolicyMatrix } from '../types.ts';
import { buildPolicyIndex, checkWithIndices, getMembershipIndex, getSubjectChannelId, type MembershipIndex } from './check.ts';
import { resolveHierarchy } from './resolve-hierarchy.ts';
import type { AccessMembership, PermissionCheckOptions, SubjectForPermission } from './types.ts';
import { validateSubject } from './validation.ts';

/**
 * One actor's inputs to a decision: memberships plus the two actor fields the engine reads. An
 * anonymous actor is `{ memberships: [] }` with no `actorId`, which the `checkAccess*` wrappers
 * map their public `Access` union onto.
 */
export interface EngineAccess<T extends AccessMembership = AccessMembership> {
  memberships: T[];
  actorId?: string;
  isSystemAdmin?: boolean;
}

/**
 * Many actors against one subject, grouping accesses the policy engine cannot tell apart. Keys
 * cover system-admin state, referenced row conditions and roles at each subject channel level.
 * An access whose memberships fail `validateMembership` is denied every action, and the rest
 * still resolve, so one corrupt stream subscriber does not take the batch down with it.
 * @returns One action record per access, in their order.
 */
export const getDecisionsForAccesses = <T extends AccessMembership>(
  policies: PolicyMatrix,
  accesses: EngineAccess<T>[],
  subject: SubjectForPermission,
  options?: PermissionCheckOptions,
): Record<EntityActionType, boolean>[] => {
  const { hierarchy, orderedChannels } = resolveHierarchy(options);
  validateSubject(subject, undefined, hierarchy);

  const channels = orderedChannels(subject.entityType);
  const policyIndex = buildPolicyIndex(policies, subject.entityType);

  // Row conditions this subject's policies reference: besides roles and the admin bit, the only
  // places an actor's identity enters a decision.
  const conditionNames: RowConditionName[] = [];
  for (const permissions of policyIndex.values()) {
    for (const action of appConfig.entityActions) {
      const value = permissions[action];
      if (isRowCondition(value) && !conditionNames.includes(value)) conditionNames.push(value);
    }
  }

  const conditionRow = conditionRowOf(subject);

  const channelLevels: Array<[ChannelEntityType, string]> = [];
  for (const channelType of channels) {
    const channelId = getSubjectChannelId(subject, channelType);
    if (channelId) channelLevels.push([channelType, channelId]);
  }

  const memo = new Map<string, Record<EntityActionType, boolean>>();

  return accesses.map((access) => {
    let membershipIndex: MembershipIndex<T>;
    try {
      membershipIndex = getMembershipIndex(access.memberships);
    } catch {
      return allActionsDenied;
    }

    let key: string;
    if (access.isSystemAdmin === true) {
      key = 'A'; // admin bypass reads nothing else from the actor
    } else {
      key = '|';
      for (const name of conditionNames) {
        key += matchesRowCondition(name, conditionRow, { actorId: access.actorId }) ? '1' : '0';
      }
      for (const [channelType, channelId] of channelLevels) {
        const held = membershipIndex.get(`${channelType}:${channelId}`);
        if (held?.length) {
          const roles = held.map((membership) => membership.role);
          if (roles.length > 1) roles.sort();
          key += `|${channelType}:${roles.join('+')}`;
        }
      }
    }

    let can = memo.get(key);
    if (!can) {
      can = checkWithIndices(membershipIndex, policyIndex, subject, channels, hierarchy, {
        actorId: access.actorId,
        isSystemAdmin: access.isSystemAdmin,
        publicGrants: options?.publicGrants,
      }).can;
      memo.set(key, can);
    }
    return can;
  });
};
