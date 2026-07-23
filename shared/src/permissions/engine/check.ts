import type { ChannelEntityType, EntityActionType, ProductEntityType } from '../../../types';
import { allActionsAllowed, createActionRecord } from '../action-helpers';
import type { PublicReadGrants } from '../public-read';
import { type ConditionActor, isRowCondition, matchesRowCondition, type RowForCondition } from '../row-conditions';
import type { PolicyMatrix, EntityActionPermissions } from '../types';
import { formatBatchPermissionSummary, formatPermissionDecision } from './format';
import { resolveHierarchy } from './resolve-hierarchy';
import type {
  ActionAttribution,
  PermissionCheckOptions,
  PermissionDecision,
  AccessMembership,
  ResolvedChannelIds,
  SubjectForPermission,
} from './types';
import { validateMembership, validateSubject } from './validation';

/** Memberships keyed by `${channelType}:${channelId}`. */
export type MembershipIndex<T extends AccessMembership> = Map<string, T[]>;

/** Permissions keyed by `${channelType}:${role}`. */
export type PolicyIndex = Map<string, EntityActionPermissions>;

const buildMembershipIndex = <T extends AccessMembership>(memberships: T[]): MembershipIndex<T> => {
  const index: MembershipIndex<T> = new Map();
  for (const m of memberships) {
    if (!m.channelId) {
      throw new Error(`[Permission] Membership missing channelId for ${m.channelType}`);
    }
    const key = `${m.channelType}:${m.channelId}`;
    const list = index.get(key) ?? [];
    list.push(m);
    index.set(key, list);
  }
  return index;
};

/**
 * Validated indexes cached by array identity. Membership update paths replace arrays, making a
 * stable reference safe to reuse; the WeakMap releases entries with their arrays. Callers must
 * not mutate a memberships array after passing it to a permission check.
 */
const membershipIndexMemo = new WeakMap<object, MembershipIndex<AccessMembership>>();

/** Returns a validated membership index, memoized by input identity. */
export const getMembershipIndex = <T extends AccessMembership>(memberships: T[]): MembershipIndex<T> => {
  const cached = membershipIndexMemo.get(memberships);
  if (cached) return cached as MembershipIndex<T>;

  memberships.forEach((m, i) => validateMembership(m, i));
  const index = buildMembershipIndex(memberships);
  membershipIndexMemo.set(memberships, index as MembershipIndex<AccessMembership>);
  return index;
};

/** Indexes one entity type's policies by channel type and role. */
export const buildPolicyIndex = (
  policies: PolicyMatrix,
  entityType: ChannelEntityType | ProductEntityType,
): PolicyIndex => {
  const index: PolicyIndex = new Map();
  const entityPolicies = policies[entityType] ?? [];
  for (const p of entityPolicies) {
    index.set(`${p.channelType}:${p.role}`, p.permissions);
  }
  return index;
};

const getOrBuildPolicyIndex = (
  policies: PolicyMatrix,
  entityType: ChannelEntityType | ProductEntityType,
  cache: Map<ChannelEntityType | ProductEntityType, PolicyIndex>,
): PolicyIndex => {
  const cached = cache.get(entityType);
  if (cached) return cached;

  const index = buildPolicyIndex(policies, entityType);
  cache.set(entityType, index);
  return index;
};

/** Resolves a channel subject's own ID before consulting its ancestor IDs. */
export const getSubjectChannelId = (
  subject: SubjectForPermission,
  channelType: ChannelEntityType,
): string | null | undefined => {
  if (subject.entityType === channelType && subject.id) {
    return subject.id;
  }
  return subject.channelIds[channelType];
};

/**
 * Evaluates one subject against prebuilt membership and policy indexes. Named row conditions
 * are matched against the subject's row fields.
 */
export const checkWithIndices = <T extends AccessMembership>(
  membershipIndex: MembershipIndex<T>,
  policyIndex: PolicyIndex,
  subject: SubjectForPermission,
  orderedChannels: ChannelEntityType[],
  getRoles: (channelType: ChannelEntityType) => readonly string[],
  entityActions: readonly EntityActionType[],
  isSystemAdmin: boolean,
  userId?: string,
  publicGrants?: PublicReadGrants,
  elevatedRoles?: readonly string[],
  debug?: boolean,
): PermissionDecision<T> => {
  const primaryChannel = orderedChannels[0];
  if (primaryChannel === undefined) throw new Error('checkSubject: orderedChannels must not be empty');

  const primaryChannelId = getSubjectChannelId(subject, primaryChannel);
  const primaryMemberships = primaryChannelId
    ? (membershipIndex.get(`${primaryChannel}:${primaryChannelId}`) ?? [])
    : [];
  const resolvedMembership = primaryMemberships[0] ?? null;

  if (isSystemAdmin) {
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

  const conditionRow: RowForCondition = { ...subject.row, createdBy: subject.createdBy };
  const conditionActor: ConditionActor = { userId };

  // Non-elevated roles grant product access only at the row's home channel. Channel subjects
  // retain ancestor elevation semantics.
  const isProductSubject = (subject.entityType as string) !== primaryChannel;
  const homeChannel =
    elevatedRoles && isProductSubject ? orderedChannels.find((ct) => getSubjectChannelId(subject, ct)) : undefined;

  for (const channelType of orderedChannels) {
    const channelRoles = getRoles(channelType);
    if (channelRoles.length === 0) {
      throw new Error(
        `[Permission] Channel "${channelType}" has no roles defined but is in hierarchy for ${subject.entityType}`,
      );
    }

    const subjectChannelId = getSubjectChannelId(subject, channelType);
    if (!subjectChannelId) {
      if (debug) {
        console.warn(`[Permission] ${subject.entityType}:${subject.id} missing channelId for ${channelType}`);
      }
      continue;
    }

    channelIds[channelType] = subjectChannelId;

    const matchingMemberships = membershipIndex.get(`${channelType}:${subjectChannelId}`) ?? [];

    for (const m of matchingMemberships) {
      const permissions = policyIndex.get(`${channelType}:${m.role}`);
      // Missing policy rows deny by default, like omitted actions.
      if (!permissions) continue;

      if (elevatedRoles && isProductSubject && !elevatedRoles.includes(m.role) && channelType !== homeChannel) {
        continue;
      }

      for (const action of entityActions) {
        const policyValue = permissions[action];

        if (policyValue === 1) {
          actions[action].allowed = true;
          actions[action].grantedBy.push({
            type: 'membership',
            channelType,
            channelId: subjectChannelId,
            role: m.role,
          });
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

/**
 * Checks all permissions for one or more subjects. A single subject returns a
 * `PermissionDecision`; an array returns a `Map` keyed by subject.id.
 */
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
  const isSingle = !Array.isArray(subjects);
  const subjectArray = isSingle ? [subjects] : subjects;
  const isSystemAdmin = options?.isSystemAdmin === true;
  const userId = options?.userId;
  const publicGrants = options?.publicGrants;
  const elevatedRoles = options?.elevatedRoles;
  const debug = options?.debug === true;
  // Tests may inject a synthetic hierarchy; production defaults to the app configuration.
  const { hierarchy: resolvedHierarchy, entityActions, getRoles } = resolveHierarchy(options);

  const results = new Map<string, PermissionDecision<T>>();

  if (subjectArray.length === 0) {
    return isSingle ? results.get(subjects.id ?? '_idx:0')! : results;
  }

  subjectArray.forEach((subject, i) => validateSubject(subject, i, resolvedHierarchy));

  const membershipIndex = getMembershipIndex(memberships);

  const policyIndexCache = new Map<ChannelEntityType | ProductEntityType, PolicyIndex>();

  const channelCache = new Map<ChannelEntityType | ProductEntityType, ChannelEntityType[]>();

  // Channel subjects include themselves before their ancestors; product subjects contain only
  // ancestors. The first entry is the primary channel used for membership capture.
  const resolveOrderedChannels = (entityType: ChannelEntityType | ProductEntityType): ChannelEntityType[] => {
    let orderedChannels = channelCache.get(entityType);
    if (!orderedChannels) {
      const ancestors = resolvedHierarchy.getOrderedAncestors(entityType) as ChannelEntityType[];
      // isChannel returns boolean, so TypeScript cannot narrow entityType.
      orderedChannels = (
        resolvedHierarchy.isChannel(entityType) ? [entityType, ...ancestors] : [...ancestors]
      ) as ChannelEntityType[];
      channelCache.set(entityType, orderedChannels);
    }
    return orderedChannels;
  };

  for (const subject of subjectArray) {
    const orderedChannels = resolveOrderedChannels(subject.entityType);
    const policyIndex = getOrBuildPolicyIndex(policies, subject.entityType, policyIndexCache);

    const decision = checkWithIndices(
      membershipIndex,
      policyIndex,
      subject,
      orderedChannels,
      getRoles,
      entityActions,
      isSystemAdmin,
      userId,
      publicGrants,
      elevatedRoles,
      debug,
    );

    const key = subject.id ?? `_idx:${subjectArray.indexOf(subject)}`;
    results.set(key, decision);
  }

  if (isSingle) {
    const key = subjects.id ?? '_idx:0';
    const decision = results.get(key);

    if (!decision) throw new Error(`[Permission] Check failed for subject ${subjects.entityType}:${subjects.id}`);

    if (debug) console.debug(formatPermissionDecision(decision));
    return decision;
  }

  if (debug) console.debug(formatBatchPermissionSummary(results));
  return results;
}
