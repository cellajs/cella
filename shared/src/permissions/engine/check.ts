import type { ChannelEntityType, ProductEntityType } from '../../../types.ts';
import { appConfig } from '../../config-builder/app-config.ts';
import { allActionsAllowed, createActionRecord } from '../action-helpers.ts';
import { type ConditionActor, conditionRowOf, isRowCondition, matchesRowCondition } from '../row-conditions.ts';
import type { EntityActionPermissions, PolicyMatrix } from '../types.ts';
import { resolveHierarchy } from './resolve-hierarchy.ts';
import type {
  AccessMembership,
  ActionAttribution,
  PermissionCheckOptions,
  PermissionDecision,
  ResolvedChannelIds,
  SubjectForPermission,
} from './types.ts';
import { validateMembership, validateSubject } from './validation.ts';

/** Memberships keyed by `${channelType}:${channelId}`. */
export type MembershipIndex<T extends AccessMembership> = Map<string, T[]>;

/** Permissions keyed by `${channelType}:${role}`. */
export type PolicyIndex = Map<string, EntityActionPermissions>;

/**
 * Validated indexes cached by array identity: membership updates replace arrays, so a stable
 * reference is safe to reuse and the WeakMap releases entries with them. Never mutate a
 * memberships array after passing it to a permission check.
 */
const membershipIndexMemo = new WeakMap<object, MembershipIndex<AccessMembership>>();

/** Memoized by input identity. */
export const getMembershipIndex = <T extends AccessMembership>(memberships: T[]): MembershipIndex<T> => {
  const cached = membershipIndexMemo.get(memberships);
  if (cached) return cached as MembershipIndex<T>;

  const index: MembershipIndex<T> = new Map();
  memberships.forEach((membership, i) => {
    validateMembership(membership, i);
    const key = `${membership.channelType}:${membership.channelId}`;
    const list = index.get(key) ?? [];
    list.push(membership);
    index.set(key, list);
  });
  membershipIndexMemo.set(memberships, index as MembershipIndex<AccessMembership>);
  return index;
};

/** Indexes one entity type's policies by channel type and role. */
export const buildPolicyIndex = (policies: PolicyMatrix, entityType: ChannelEntityType | ProductEntityType): PolicyIndex => {
  const index: PolicyIndex = new Map();
  const entityPolicies = policies[entityType] ?? [];
  for (const policy of entityPolicies) {
    index.set(`${policy.channelType}:${policy.role}`, policy.permissions);
  }
  return index;
};

/** Resolves a channel subject's own ID before consulting its ancestor IDs. */
export const getSubjectChannelId = (subject: SubjectForPermission, channelType: ChannelEntityType): string | null | undefined => {
  if (subject.entityType === channelType && subject.id) {
    return subject.id;
  }
  return subject.channelIds[channelType];
};

/**
 * One subject's decision from prebuilt membership and policy indexes, reading memberships on `orderedChannels` (most
 * specific first). Named row conditions are matched against the subject's row fields.
 */
export const checkWithIndices = <T extends AccessMembership>(
  membershipIndex: MembershipIndex<T>,
  policyIndex: PolicyIndex,
  subject: SubjectForPermission,
  orderedChannels: ChannelEntityType[],
  getRoles: (channelType: ChannelEntityType) => readonly string[],
  options: PermissionCheckOptions,
): PermissionDecision<T> => {
  const { actorId, publicGrants, elevatedGrants } = options;
  const primaryChannel = orderedChannels[0];
  if (primaryChannel === undefined) throw new Error(`[Permission] ${subject.entityType} has no channel to check`);

  const primaryChannelId = getSubjectChannelId(subject, primaryChannel);
  const primaryMemberships = primaryChannelId ? (membershipIndex.get(`${primaryChannel}:${primaryChannelId}`) ?? []) : [];
  const resolvedMembership = primaryMemberships[0] ?? null;

  if (options.isSystemAdmin === true) {
    const allGranted = createActionRecord(
      (): ActionAttribution => ({
        allowed: true,
        grantedBy: [{ type: 'systemAdmin' }],
      }),
    );

    const can = { ...allActionsAllowed };
    const channelIds: ResolvedChannelIds = primaryChannelId ? { [primaryChannel]: primaryChannelId } : {};

    return {
      subject: { entityType: subject.entityType, id: subject.id, channelIds },
      actions: allGranted,
      can,
      membership: resolvedMembership,
    };
  }

  const actions = createActionRecord((): ActionAttribution => ({ allowed: false, grantedBy: [] }));

  const channelIds: ResolvedChannelIds = {};

  const conditionRow = conditionRowOf(subject);
  const conditionActor: ConditionActor = { actorId };

  // Non-elevated grants apply only at the row's home channel; channel subjects keep ancestor
  // elevation. Elevation is per (channelType, role): `${channelType}:${role}` ∈ elevatedGrants.
  const isProductSubject = subject.entityType !== primaryChannel;
  const homeChannel =
    elevatedGrants && isProductSubject ? orderedChannels.find((channelType) => getSubjectChannelId(subject, channelType)) : undefined;

  for (const channelType of orderedChannels) {
    const channelRoles = getRoles(channelType);
    if (channelRoles.length === 0) {
      throw new Error(`[Permission] Channel "${channelType}" has no roles defined but is in hierarchy for ${subject.entityType}`);
    }

    const subjectChannelId = getSubjectChannelId(subject, channelType);
    if (!subjectChannelId) continue;

    channelIds[channelType] = subjectChannelId;

    const matchingMemberships = membershipIndex.get(`${channelType}:${subjectChannelId}`) ?? [];

    for (const membership of matchingMemberships) {
      const permissions = policyIndex.get(`${channelType}:${membership.role}`);
      // Missing policy rows deny by default, like omitted actions.
      if (!permissions) continue;

      const outsideElevation =
        elevatedGrants && isProductSubject && !elevatedGrants.has(`${channelType}:${membership.role}`) && channelType !== homeChannel;
      if (outsideElevation) continue;

      for (const action of appConfig.entityActions) {
        const policyValue = permissions[action];

        if (policyValue === 1) {
          actions[action].allowed = true;
          actions[action].grantedBy.push({ type: 'membership', channelType, channelId: subjectChannelId, role: membership.role });
          continue;
        }

        // Attribute satisfied conditional grants by condition name.
        if (isRowCondition(policyValue) && matchesRowCondition(policyValue, conditionRow, conditionActor)) {
          actions[action].allowed = true;
          actions[action].grantedBy.push({ type: 'relation', relation: policyValue });
        }
      }
    }
  }

  // Public reads are membership-independent but use the same row condition as the SQL compiler.
  if (publicGrants?.[subject.entityType] && matchesRowCondition('public', conditionRow, conditionActor)) {
    actions.read.allowed = true;
    actions.read.grantedBy.push({ type: 'public' });
  }

  const can = createActionRecord((action) => actions[action].allowed);

  return {
    subject: { entityType: subject.entityType, id: subject.id, channelIds },
    actions,
    can,
    membership: resolvedMembership,
  };
};

/** One subject returns a `PermissionDecision`; an array returns a `Map` keyed by subject id, or `_idx:<position>` without one. */
export function getAllDecisions<T extends AccessMembership>(
  policies: PolicyMatrix,
  memberships: T[],
  subjects: SubjectForPermission,
  options?: PermissionCheckOptions,
): PermissionDecision<T>;
export function getAllDecisions<T extends AccessMembership>(
  policies: PolicyMatrix,
  memberships: T[],
  subjects: SubjectForPermission[],
  options?: PermissionCheckOptions,
): Map<string, PermissionDecision<T>>;
export function getAllDecisions<T extends AccessMembership>(
  policies: PolicyMatrix,
  memberships: T[],
  subjects: SubjectForPermission | SubjectForPermission[],
  options?: PermissionCheckOptions,
): PermissionDecision<T> | Map<string, PermissionDecision<T>> {
  const subjectArray = Array.isArray(subjects) ? subjects : [subjects];
  const results = new Map<string, PermissionDecision<T>>();
  // An empty batch decides nothing, so it validates no membership either.
  if (subjectArray.length === 0) return results;

  const { hierarchy, getRoles, orderedChannels } = resolveHierarchy(options);
  subjectArray.forEach((subject, i) => {
    validateSubject(subject, i, hierarchy);
  });

  const membershipIndex = getMembershipIndex(memberships);
  const engineOptions = options ?? {};

  // Built once per entity type of the call: its policy index and the channels its memberships sit on.
  const perEntityType = new Map<ChannelEntityType | ProductEntityType, { policyIndex: PolicyIndex; channels: ChannelEntityType[] }>();
  const decide = (subject: SubjectForPermission): PermissionDecision<T> => {
    let indexes = perEntityType.get(subject.entityType);
    if (!indexes) {
      indexes = { policyIndex: buildPolicyIndex(policies, subject.entityType), channels: orderedChannels(subject.entityType) };
      perEntityType.set(subject.entityType, indexes);
    }
    return checkWithIndices(membershipIndex, indexes.policyIndex, subject, indexes.channels, getRoles, engineOptions);
  };

  if (!Array.isArray(subjects)) return decide(subjects);

  subjects.forEach((subject, i) => {
    results.set(subject.id ?? `_idx:${i}`, decide(subject));
  });
  return results;
}
