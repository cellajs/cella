import {
  appConfig,
  type ContextEntityType,
  getContextRoles,
  hierarchy,
  isContextEntity,
  type ProductEntityType,
} from 'shared';
import { env } from '#/env';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { allActionsAllowed, createActionRecord } from './action-helpers';
import { formatBatchPermissionSummary, formatPermissionDecision } from './format';
import type {
  AccessPolicies,
  ActionAttribution,
  EntityActionPermissions,
  PermissionCheckOptions,
  PermissionDecision,
  SubjectForPermission,
} from './types';
import { validateMembership, validateSubject } from './validation';

/** Membership index: Map from `${contextType}:${contextId}` to memberships */
type MembershipIndex<T extends MembershipBaseModel> = Map<string, T[]>;

/** Policy index: Map from `${contextType}:${role}` to permissions */
type PolicyIndex = Map<string, EntityActionPermissions>;

/** Builds a Map indexing memberships by `${contextType}:${contextId}` for O(1) lookup. */
const buildMembershipIndex = <T extends MembershipBaseModel>(memberships: T[]): MembershipIndex<T> => {
  const index: MembershipIndex<T> = new Map();
  for (const m of memberships) {
    const contextIdKey = appConfig.entityIdColumnKeys[m.contextType];
    const key = `${m.contextType}:${(m as any)[contextIdKey]}`;
    const list = index.get(key) ?? [];
    list.push(m);
    index.set(key, list);
  }
  return index;
};

/**
 * Builds a Map indexing policies by `${contextType}:${role}` for O(1) lookup.
 * Uses policies for a specific entityType (subject.entityType).
 */
const buildPolicyIndex = (policies: AccessPolicies, entityType: ContextEntityType | ProductEntityType): PolicyIndex => {
  const index: PolicyIndex = new Map();
  const subjectPolicies = policies[entityType] ?? [];
  for (const p of subjectPolicies) {
    index.set(`${p.contextType}:${p.role}`, p.permissions);
  }
  return index;
};

/**
 * Gets or creates a policy index for an entity type from the cache.
 */
const getOrBuildPolicyIndex = (
  policies: AccessPolicies,
  entityType: ContextEntityType | ProductEntityType,
  cache: Map<ContextEntityType | ProductEntityType, PolicyIndex>,
): PolicyIndex => {
  const cached = cache.get(entityType);
  if (cached) return cached;

  const index = buildPolicyIndex(policies, entityType);
  cache.set(entityType, index);
  return index;
};

/**
 * Extracts the context ID from subject for a given contextType:
 * - If `subject.entityType === contextType` and subject has `id`: returns `subject.id`
 * - Otherwise: returns `subject[entityIdColumnKeys[contextType]]` (e.g., subject.organizationId)
 */
const getSubjectContextId = (
  subject: SubjectForPermission,
  contextType: ContextEntityType,
): string | null | undefined => {
  if (subject.entityType === contextType && 'id' in subject) {
    return subject.id;
  }
  const contextIdKey = appConfig.entityIdColumnKeys[contextType];
  return subject[contextIdKey];
};

/**
 * Internal function to check permissions for a single subject using pre-built indices.
 * This is the core logic shared by both single and batch permission checks.
 */
const checkWithIndices = <T extends MembershipBaseModel>(
  membershipIndex: MembershipIndex<T>,
  policyIndex: PolicyIndex,
  subject: SubjectForPermission,
  orderedContexts: ContextEntityType[],
  isSystemAdmin: boolean,
): PermissionDecision<T> => {
  // Primary context is always the first (most specific) in the hierarchy
  const primaryContext = orderedContexts[0];

  // Resolve primary context membership (used by both system admin and normal flow)
  const primaryContextId = getSubjectContextId(subject, primaryContext);
  const primaryMemberships = primaryContextId
    ? (membershipIndex.get(`${primaryContext}:${primaryContextId}`) ?? [])
    : [];
  const resolvedMembership = primaryMemberships[0] ?? null;

  // If system admin, grant all permissions immediately (but still return membership if exists)
  if (isSystemAdmin) {
    const allGranted = createActionRecord(() => ({
      enabled: true,
      grantedBy: [{ contextType: 'system' as ContextEntityType, contextId: 'admin', role: 'admin' }],
    }));

    const can = { ...allActionsAllowed };
    const contextIds = primaryContextId ? { [primaryContext]: primaryContextId } : {};

    return {
      subject: { entityType: subject.entityType, id: subject.id, contextIds },
      orderedContexts,
      primaryContext,
      actions: allGranted,
      can,
      membership: resolvedMembership,
    };
  }

  // Initialize action attribution table: each action starts denied with no grants
  const actions = createActionRecord((): ActionAttribution => ({ enabled: false, grantedBy: [] }));

  // Collect resolved context IDs for debugging
  const contextIds: Partial<Record<ContextEntityType, string>> = {};

  // Walk through each context level (most specific first, then ancestors)
  for (const contextType of orderedContexts) {
    // Strict: context in hierarchy must have roles defined
    const contextRoles = getContextRoles(contextType);
    if (contextRoles.length === 0) {
      throw new Error(
        `[Permission] Context "${contextType}" has no roles defined but is in hierarchy for ${subject.entityType}`,
      );
    }

    // Get the context ID from the subject for this context type
    const subjectContextId = getSubjectContextId(subject, contextType);
    if (!subjectContextId) {
      // This can be valid for optional context levels - log warning in debug mode
      if (env.DEBUG) {
        console.warn(`[Permission] ${subject.entityType}:${subject.id} missing context ID for ${contextType}`);
      }
      continue;
    }

    // Track resolved context ID for debugging
    contextIds[contextType] = subjectContextId;

    // Find all memberships the user has in this specific context instance
    const matchingMemberships = membershipIndex.get(`${contextType}:${subjectContextId}`) ?? [];

    for (const m of matchingMemberships) {
      // Look up what permissions this role grants for this entity type in this context
      const permissions = policyIndex.get(`${contextType}:${m.role}`);
      if (!permissions) {
        // Strict: role exists in membership but has no policy - likely config/data issue
        throw new Error(
          `[Permission] Role "${m.role}" in context ${contextType} has no policy for ${subject.entityType}`,
        );
      }

      // Attribute each granted action to this membership
      for (const action of appConfig.entityActions) {
        if (permissions[action] !== 1) continue;
        actions[action].enabled = true;
        actions[action].grantedBy.push({ contextType, contextId: subjectContextId, role: m.role });
      }
    }
  }

  // Derive simple `can` map from actions table
  const can = createActionRecord((action) => actions[action].enabled);

  return {
    subject: { entityType: subject.entityType, id: subject.id, contextIds },
    orderedContexts,
    primaryContext,
    actions,
    can,
    membership: resolvedMembership,
  };
};

/**
 * Checks all permissions for one or more subjects.
 * When passed a single subject, returns a PermissionDecision.
 * When passed an array of subjects, returns a Map keyed by subject.id.
 *
 * The decision includes:
 * - `actions`: Per-action attribution showing which memberships granted each action
 * - `can`: Simple boolean map (true if action is enabled)
 * - `membership`: First membership from primaryContext
 *
 * ## Key concepts
 * - `orderedContexts`: Context types to check, ordered from most specific to root.
 *   For product entities (e.g., attachment): just ancestors [organization].
 *   For context entities (e.g., project): [project, organization] (self + ancestors).
 *
 * - `primaryContext`: Always orderedContexts[0]. This is where we capture
 *   the user's "direct" membership to the entity. For products, this is the closest ancestor.
 *
 * - `actions` attribution: For each action, tracks all grants that enabled it.
 *   Useful for debugging ("why can user delete?") and auditing.
 *
 * - `options.systemRole`: If 'admin', grants all permissions regardless of memberships.
 *
 * ## Example: Checking "attachment" with organizationId="org1"
 * 1. orderedContexts = [organization] (attachment's ancestor)
 * 2. primaryContext = organization
 * 3. Find user's memberships where contextType=organization AND organizationId=org1
 * 4. For each membership, look up permissions and attribute each granted action
 * 5. Derive `can` from actions, capture first membership
 */
export function getAllDecisions<T extends MembershipBaseModel>(
  policies: AccessPolicies,
  memberships: T[],
  subjects: SubjectForPermission,
  options?: PermissionCheckOptions,
): PermissionDecision<T>;
export function getAllDecisions<T extends MembershipBaseModel>(
  policies: AccessPolicies,
  memberships: T[],
  subjects: SubjectForPermission[],
  options?: PermissionCheckOptions,
): Map<string, PermissionDecision<T>>;
export function getAllDecisions<T extends MembershipBaseModel>(
  policies: AccessPolicies,
  memberships: T[],
  subjects: SubjectForPermission | SubjectForPermission[],
  options?: PermissionCheckOptions,
): PermissionDecision<T> | Map<string, PermissionDecision<T>> {
  const isSingle = !Array.isArray(subjects);
  const subjectArray = isSingle ? [subjects] : subjects;
  const isSystemAdmin = options?.systemRole === 'admin';

  const results = new Map<string, PermissionDecision<T>>();

  if (subjectArray.length === 0) {
    return isSingle ? results.get(subjects.id)! : results;
  }

  // Validate all inputs before processing
  for (let i = 0; i < subjectArray.length; i++) {
    validateSubject(subjectArray[i], i);
  }
  for (let i = 0; i < memberships.length; i++) {
    validateMembership(memberships[i], i);
  }

  // Build membership index once for all subjects
  const membershipIndex = buildMembershipIndex(memberships);

  // Cache for policy indices by entity type
  const policyIndexCache = new Map<ContextEntityType | ProductEntityType, PolicyIndex>();

  // Cache for relevant contexts by entity type
  const contextCache = new Map<ContextEntityType | ProductEntityType, ContextEntityType[]>();

  for (const subject of subjectArray) {
    // Get or compute ordered contexts for this entity type (most specific → root).
    // For context entities (e.g., project): [project, organization] — includes self + ancestors
    // For product entities (e.g., attachment): [organization] — just ancestors
    // The first element [0] is always the primary context used for membership capture.
    let orderedContexts = contextCache.get(subject.entityType);

    if (!orderedContexts) {
      const ancestors = hierarchy.getOrderedAncestors(subject.entityType) as ContextEntityType[];
      orderedContexts = isContextEntity(subject.entityType) ? [subject.entityType, ...ancestors] : [...ancestors];
      contextCache.set(subject.entityType, orderedContexts);
    }
    // Get or build policy index for this entity type
    const policyIndex = getOrBuildPolicyIndex(policies, subject.entityType, policyIndexCache);

    // Perform the permission check using pre-built indices
    const decision = checkWithIndices(membershipIndex, policyIndex, subject, orderedContexts, isSystemAdmin);
    results.set(subject.id, decision);
  }

  // Return single decision or full map based on input type
  if (isSingle) {
    const decision = results.get(subjects.id);

    // Should never happen
    if (!decision) throw new Error(`[Permission] Check failed for subject ${subjects.entityType}:${subjects.id}`);

    if (env.DEBUG) console.debug(formatPermissionDecision(decision));
    return decision;
  }

  if (env.DEBUG) console.debug(formatBatchPermissionSummary(results));
  return results;
}
