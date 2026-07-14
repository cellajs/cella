import type { ContextEntityType, EntityActionType, ProductEntityType } from '../../../types';
import { allActionsAllowed, createActionRecord } from '../action-helpers';
import { type PublicReadGrants, publicRow } from '../public-read';
import { type ConditionActor, isRowCondition, rowPredicateMatches, type RowForCondition } from '../row-conditions';
import type { AccessPolicies, EntityActionPermissions } from '../types';
import { formatBatchPermissionSummary, formatPermissionDecision } from './format';
import { resolveTopology } from './resolve-topology';
import type {
  ActionAttribution,
  PermissionCheckOptions,
  PermissionDecision,
  PermissionMembership,
  ResolvedContextIds,
  SubjectForPermission,
} from './types';
import { validateMembership, validateSubject } from './validation';

/** Membership index: Map from `${contextType}:${contextId}` to memberships */
type MembershipIndex<T extends PermissionMembership> = Map<string, T[]>;

/** Policy index: Map from `${contextType}:${role}` to permissions */
type PolicyIndex = Map<string, EntityActionPermissions>;

/** Builds a Map indexing memberships by `${contextType}:${contextId}` for O(1) lookup. */
const buildMembershipIndex = <T extends PermissionMembership>(memberships: T[]): MembershipIndex<T> => {
  const index: MembershipIndex<T> = new Map();
  for (const m of memberships) {
    if (!m.contextId) {
      throw new Error(`[Permission] Membership missing context ID for ${m.contextType}`);
    }
    const key = `${m.contextType}:${m.contextId}`;
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
 * - Otherwise: returns `subject.contextIds[contextType]` (e.g., subject.contextIds.organization)
 */
const getSubjectContextId = (
  subject: SubjectForPermission,
  contextType: ContextEntityType,
): string | null | undefined => {
  if (subject.entityType === contextType && subject.id) {
    return subject.id;
  }
  return subject.contextIds[contextType];
};

/**
 * Internal function to check permissions for a single subject using pre-built indices.
 * This is the core logic shared by both single and batch permission checks.
 *
 * Supports row-conditional grants: when a policy value is a `RowCondition` (e.g. the
 * built-in `own`, normalized from the `'own'` literal), the engine evaluates its
 * check-form against the subject's row fields to determine the grant.
 */
const checkWithIndices = <T extends PermissionMembership>(
  membershipIndex: MembershipIndex<T>,
  policyIndex: PolicyIndex,
  subject: SubjectForPermission,
  orderedContexts: ContextEntityType[],
  getRoles: (contextType: ContextEntityType) => readonly string[],
  entityActions: readonly EntityActionType[],
  isSystemAdmin: boolean,
  userId?: string,
  publicGrants?: PublicReadGrants,
  elevatedRoles?: readonly string[],
  debug?: boolean,
): PermissionDecision<T> => {
  // Primary context is orderedContexts[0]; the hierarchy guarantees the array is never empty.
  const primaryContext = orderedContexts[0];
  if (primaryContext === undefined) throw new Error('checkSubject: orderedContexts must not be empty');

  // Resolve primary context membership (used by both system admin and normal flow)
  const primaryContextId = getSubjectContextId(subject, primaryContext);
  const primaryMemberships = primaryContextId
    ? (membershipIndex.get(`${primaryContext}:${primaryContextId}`) ?? [])
    : [];
  const resolvedMembership = primaryMemberships[0] ?? null;

  // If system admin, grant all permissions immediately (but still return membership if exists)
  if (isSystemAdmin) {
    const allGranted = createActionRecord(
      (): ActionAttribution => ({
        enabled: true,
        grantedBy: [{ type: 'systemAdmin' }],
      }),
    );

    const can = { ...allActionsAllowed };
    const contextIds: ResolvedContextIds = primaryContextId ? { [primaryContext]: primaryContextId } : {};

    return {
      subject: { entityType: subject.entityType, id: subject.id, contextIds },
      orderedContexts,
      primaryContext,
      actions: allGranted,
      can,
      membership: resolvedMembership,
    };
  }

  const actions = createActionRecord((): ActionAttribution => ({ enabled: false, grantedBy: [] }));

  // Collect resolved context IDs for debugging
  const contextIds: ResolvedContextIds = {};

  // Row fields + actor for row-condition evaluation, built once per subject
  const conditionRow: RowForCondition = { ...subject.row, createdBy: subject.createdBy };
  const conditionActor: ConditionActor = { userId };

  // Grant scoping (elevatedRoles): product subjects only — context subjects keep full
  // elevation semantics (e.g. members of a parent context may still discover child
  // contexts). The subject's HOME is the most specific context with an id; non-elevated
  // roles speak only for rows homed at their own grant level.
  const isProductSubject = (subject.entityType as string) !== primaryContext;
  const homeContext =
    elevatedRoles && isProductSubject ? orderedContexts.find((ct) => getSubjectContextId(subject, ct)) : undefined;

  // Walk through each context level (most specific first, then ancestors)
  for (const contextType of orderedContexts) {
    // Strict: context in hierarchy must have roles defined
    const contextRoles = getRoles(contextType);
    if (contextRoles.length === 0) {
      throw new Error(
        `[Permission] Context "${contextType}" has no roles defined but is in hierarchy for ${subject.entityType}`,
      );
    }

    const subjectContextId = getSubjectContextId(subject, contextType);
    if (!subjectContextId) {
      // This can be valid for optional context levels - log warning in debug mode
      if (debug) {
        console.warn(`[Permission] ${subject.entityType}:${subject.id} missing context ID for ${contextType}`);
      }
      continue;
    }

    // Track resolved context ID for debugging
    contextIds[contextType] = subjectContextId;

    // Find all memberships the user has in this specific context instance
    const matchingMemberships = membershipIndex.get(`${contextType}:${subjectContextId}`) ?? [];

    for (const m of matchingMemberships) {
      const permissions = policyIndex.get(`${contextType}:${m.role}`);
      if (!permissions) {
        // Strict: role exists in membership but has no policy - likely config/data issue
        throw new Error(
          `[Permission] Role "${m.role}" in context ${contextType} has no policy for ${subject.entityType}`,
        );
      }

      // Grant scope: applies to EVERY action of the grant, including create (a target
      // placement's home decides which grants may create there) and 'own' conditions.
      if (elevatedRoles && isProductSubject && !elevatedRoles.includes(m.role) && contextType !== homeContext) {
        continue;
      }

      // Attribute each granted action to this membership
      for (const action of entityActions) {
        const policyValue = permissions[action];

        // Unconditional grant
        if (policyValue === 1) {
          actions[action].enabled = true;
          actions[action].grantedBy.push({
            type: 'membership',
            contextType,
            contextId: subjectContextId,
            role: m.role,
          });
          continue;
        }

        // Row-conditional grant: allowed only when the row satisfies the condition for this
        // actor (e.g. built-in `own`: actor created the row). Attributed by condition name.
        if (isRowCondition(policyValue) && rowPredicateMatches(policyValue.predicate, conditionRow, conditionActor)) {
          actions[action].enabled = true;
          actions[action].grantedBy.push({ type: 'relation', relation: policyValue.name });
        }
      }
    }
  }

  // Subject-level public read grant: rows readable by any actor (anonymous included) when
  // the row's own `publicAt` is set. Membership-independent, so it is evaluated outside the
  // policy walk — but through the same row-predicate the SQL compiler uses (`public-read.ts`).
  const publicMode = publicGrants?.[subject.entityType];
  if (publicMode && rowPredicateMatches(publicRow.predicate, conditionRow, conditionActor)) {
    actions.read.enabled = true;
    actions.read.grantedBy.push({ type: 'public', mode: publicMode });
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
 * Checks all permissions for one or more subjects. A single subject returns a
 * `PermissionDecision`; an array returns a `Map` keyed by subject.id.
 *
 * See README.md in this directory for the context/attribution data model and a worked example.
 */
export function getAllDecisions<T extends PermissionMembership>(
  policies: AccessPolicies,
  memberships: T[],
  subjects: SubjectForPermission,
  options?: PermissionCheckOptions,
): PermissionDecision<T>;
export function getAllDecisions<T extends PermissionMembership>(
  policies: AccessPolicies,
  memberships: T[],
  subjects: SubjectForPermission[],
  options?: PermissionCheckOptions,
): Map<string, PermissionDecision<T>>;
export function getAllDecisions<T extends PermissionMembership>(
  policies: AccessPolicies,
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
  // Topology defaults to the app's real config; tests override it to drive the engine on a
  // synthetic hierarchy (see shared/src/testing/wide-fixture.ts). No override → unchanged behavior.
  const { hierarchy: topoHierarchy, entityActions, getRoles } = resolveTopology(options?.topology);

  const results = new Map<string, PermissionDecision<T>>();

  if (subjectArray.length === 0) {
    return isSingle ? results.get(subjects.id ?? '_idx:0')! : results;
  }

  // Validate all inputs before processing (against the topology hierarchy, which may be synthetic)
  subjectArray.forEach((subject, i) => validateSubject(subject, i, topoHierarchy));
  memberships.forEach((membership, i) => validateMembership(membership, i));

  // Build membership index once for all subjects
  const membershipIndex = buildMembershipIndex(memberships);

  // Cache for policy indices by entity type
  const policyIndexCache = new Map<ContextEntityType | ProductEntityType, PolicyIndex>();

  // Cache for relevant contexts by entity type
  const contextCache = new Map<ContextEntityType | ProductEntityType, ContextEntityType[]>();

  // Ordered contexts for an entity type (most specific → root), cached.
  // For context entities (e.g., project): [project, organization] (includes self and ancestors)
  // For product entities (e.g., attachment): [organization] (just ancestors)
  // The first element [0] is always the primary context used for membership capture.
  const resolveOrderedContexts = (entityType: ContextEntityType | ProductEntityType): ContextEntityType[] => {
    let orderedContexts = contextCache.get(entityType);
    if (!orderedContexts) {
      const ancestors = topoHierarchy.getOrderedAncestors(entityType) as ContextEntityType[];
      // isContext (unlike the entity-guards type guard) returns plain boolean, so cast the
      // context-branch result: a true isContext means entityType is a context by construction.
      orderedContexts = (
        topoHierarchy.isContext(entityType) ? [entityType, ...ancestors] : [...ancestors]
      ) as ContextEntityType[];
      contextCache.set(entityType, orderedContexts);
    }
    return orderedContexts;
  };

  for (const subject of subjectArray) {
    const orderedContexts = resolveOrderedContexts(subject.entityType);
    // Get or build policy index for this entity type
    const policyIndex = getOrBuildPolicyIndex(policies, subject.entityType, policyIndexCache);

    // Perform the permission check using pre-built indices
    const decision = checkWithIndices(
      membershipIndex,
      policyIndex,
      subject,
      orderedContexts,
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

  // Return single decision or full map based on input type
  if (isSingle) {
    const key = subjects.id ?? '_idx:0';
    const decision = results.get(key);

    // Should never happen
    if (!decision) throw new Error(`[Permission] Check failed for subject ${subjects.entityType}:${subjects.id}`);

    if (debug) console.debug(formatPermissionDecision(decision));
    return decision;
  }

  if (debug) console.debug(formatBatchPermissionSummary(results));
  return results;
}
