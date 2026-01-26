import { appConfig, type ContextEntityType, type EntityActionType, type ProductEntityType } from 'config';
import { env } from '#/env';
import { getAncestorContexts, getContextRoles, isProductEntity } from './hierarchy';
import type {
  AccessPolicies,
  ActionAttribution,
  EntityActionPermissions,
  MembershipForPermission,
  PermissionCheckOptions,
  PermissionDecision,
  SubjectForPermission,
} from './types';

/** @deprecated Use PermissionDecision instead */
export type AllPermissionsResult<T extends MembershipForPermission> = PermissionDecision<T>;

/**
 * Builds a Map indexing memberships by `${contextType}:${contextId}` for O(1) lookup.
 * Each key maps to an array of memberships (user can have multiple roles in same context).
 */
const buildMembershipIndex = <T extends MembershipForPermission>(memberships: T[]): Map<string, T[]> => {
  const index = new Map<string, T[]>();
  for (const m of memberships) {
    const contextIdKey = appConfig.entityIdColumnKeys[m.contextType];
    const key = `${m.contextType}:${m[contextIdKey]}`;
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
const buildPolicyIndex = (
  policies: AccessPolicies,
  entityType: ContextEntityType | ProductEntityType,
): Map<string, EntityActionPermissions> => {
  const index = new Map<string, EntityActionPermissions>();
  const subjectPolicies = policies[entityType] ?? [];
  for (const p of subjectPolicies) {
    index.set(`${p.contextType}:${p.role}`, p.permissions);
  }
  return index;
};

/**
 * Extracts the context ID from subject for a given contextType:
 * - If `subject.entityType === contextType` and subject has `id`: returns `subject.id`
 * - Otherwise: returns `subject[entityIdColumnKeys[contextType]]` (e.g., subject.organizationId)
 */
const getSubjectContextId = (subject: SubjectForPermission, contextType: ContextEntityType): string | undefined => {
  if (subject.entityType === contextType && 'id' in subject) {
    return subject.id;
  }
  const contextIdKey = appConfig.entityIdColumnKeys[contextType];
  return subject[contextIdKey];
};

/**
 * Returns context types to check for permissions:
 * - Product entities: `getAncestorContexts(entityType)` (e.g., task → [project, organization])
 * - Context entities: `[entityType, ...getAncestorContexts()]` (e.g., project → [project, organization])
 * The first element is the "primaryContextType" used for membership capture.
 */
const getRelevantContexts = (entityType: ContextEntityType | ProductEntityType): ContextEntityType[] => {
  if (isProductEntity(entityType)) {
    return getAncestorContexts(entityType);
  }
  return [entityType, ...getAncestorContexts(entityType)];
};

/**
 * Formats a PermissionDecision for debug logging.
 * Output shows the full decision tree: subject, contexts, and per-action attribution.
 */
const formatPermissionDecision = <T extends MembershipForPermission>(decision: PermissionDecision<T>): string => {
  const lines = [
    `[Permission Check] entity=${decision.subject.entityType} id=${decision.subject.id}`,
    `├─ Context IDs: ${JSON.stringify(decision.subject.contextIds)}`,
    `├─ Relevant Contexts: [${decision.relevantContexts.join(', ')}]`,
    `├─ Primary Context: ${decision.primaryContext}`,
    '│',
    '├─ Action Attribution:',
  ];

  for (const action of appConfig.entityActions) {
    const attr = decision.actions[action];
    const status = attr.enabled ? '✓ GRANTED' : '✗ DENIED';
    const grants =
      attr.grantedBy.length > 0
        ? `by [${attr.grantedBy.map((g) => `${g.contextType}:${g.contextId}/${g.role}`).join(', ')}]`
        : '(no grants)';
    lines.push(`│  ├─ ${action}: ${status} ${grants}`);
  }

  lines.push('│');
  lines.push(`├─ can: ${JSON.stringify(decision.can)}`);
  lines.push(`└─ membership: ${decision.membership ? `role=${decision.membership.role}` : 'null'}`);

  return lines.join('\n');
};

/**
 * Checks all permissions for a subject and returns a full PermissionDecision.
 *
 * The decision includes:
 * - `actions`: Per-action attribution showing which memberships granted each action
 * - `can`: Simple boolean map (true if action is enabled)
 * - `membership`: First membership from primaryContext
 *
 * ## Key concepts
 * - `relevantContexts`: Context types to check, ordered from most specific to root.
 *   For product entities (e.g., attachment): just ancestors [organization].
 *   For context entities (e.g., project): [project, organization] (self + ancestors).
 *
 * - `primaryContext`: The first context in relevantContexts. This is where we capture
 *   the user's "direct" membership to the entity. For products, this is the closest ancestor.
 *
 * - `actions` attribution: For each action, tracks all grants that enabled it.
 *   Useful for debugging ("why can user delete?") and auditing.
 *
 * - `options.systemRole`: If 'admin', grants all permissions regardless of memberships.
 *
 * ## Example: Checking "attachment" with organizationId="org1"
 * 1. relevantContexts = [organization] (attachment's ancestor)
 * 2. primaryContext = organization
 * 3. Find user's memberships where contextType=organization AND organizationId=org1
 * 4. For each membership, look up permissions and attribute each granted action
 * 5. Derive `can` from actions, capture first membership
 */
export const checkAllPermissions = <T extends MembershipForPermission>(
  policies: AccessPolicies,
  memberships: T[],
  subject: SubjectForPermission,
  options?: PermissionCheckOptions,
): PermissionDecision<T> => {
  const isSystemAdmin = options?.systemRole === 'admin';

  // Get context types to check: for product entities this is their ancestors,
  // for context entities this is [self, ...ancestors]
  const relevantContexts = getRelevantContexts(subject.entityType);
  const primaryContext = relevantContexts[0];

  // Index memberships by "${contextType}:${contextId}" for O(1) lookup
  // Done early so we can resolve membership even for system admins
  const membershipIndex = buildMembershipIndex(memberships);

  // Resolve primary context membership (used by both system admin and normal flow)
  const primaryContextId = getSubjectContextId(subject, primaryContext);
  const primaryMemberships = primaryContextId
    ? (membershipIndex.get(`${primaryContext}:${primaryContextId}`) ?? [])
    : [];
  const resolvedMembership = primaryMemberships[0] ?? null;

  // If system admin, grant all permissions immediately (but still return membership if exists)
  if (isSystemAdmin) {
    const allGranted = Object.fromEntries(
      appConfig.entityActions.map((action) => [
        action,
        {
          enabled: true,
          grantedBy: [{ contextType: 'system' as ContextEntityType, contextId: 'admin', role: 'admin' }],
        },
      ]),
    ) as Record<EntityActionType, ActionAttribution>;

    const can = Object.fromEntries(appConfig.entityActions.map((action) => [action, true])) as Record<
      EntityActionType,
      boolean
    >;

    return {
      subject: {
        entityType: subject.entityType,
        id: subject.id,
        contextIds: primaryContextId ? { [primaryContext]: primaryContextId } : {},
      },
      relevantContexts,
      primaryContext,
      actions: allGranted,
      can,
      membership: resolvedMembership,
    };
  }

  // Index policies by "${contextType}:${role}" for this subject's entityType
  const policyIndex = buildPolicyIndex(policies, subject.entityType);

  // Initialize action attribution table: each action starts denied with no grants
  const actions = Object.fromEntries(
    appConfig.entityActions.map((action) => [action, { enabled: false, grantedBy: [] } as ActionAttribution]),
  ) as Record<EntityActionType, ActionAttribution>;

  // Collect resolved context IDs for debugging
  const contextIds: Partial<Record<ContextEntityType, string>> = {};

  // Walk through each context level (entity's own context first, then ancestors)
  for (const contextType of relevantContexts) {
    // Skip contexts that have no roles defined (shouldn't happen in valid config)
    if (getContextRoles(contextType).length === 0) continue;

    // Get the context ID from the subject for this context type
    const subjectContextId = getSubjectContextId(subject, contextType);
    if (!subjectContextId) continue;

    // Track resolved context ID for debugging
    contextIds[contextType] = subjectContextId;

    // Find all memberships the user has in this specific context instance
    const matchingMemberships = membershipIndex.get(`${contextType}:${subjectContextId}`) ?? [];

    for (const m of matchingMemberships) {
      // Look up what permissions this role grants for this entity type in this context
      const permissions = policyIndex.get(`${contextType}:${m.role}`);
      if (!permissions) continue;

      // Attribute each granted action to this membership
      for (const action of appConfig.entityActions) {
        if (permissions[action] === 1) {
          actions[action].enabled = true;
          actions[action].grantedBy.push({
            contextType,
            contextId: subjectContextId,
            role: m.role,
          });
        }
      }
    }
  }

  // Derive simple `can` map from actions table
  const can = Object.fromEntries(appConfig.entityActions.map((action) => [action, actions[action].enabled])) as Record<
    EntityActionType,
    boolean
  >;

  const decision: PermissionDecision<T> = {
    subject: {
      entityType: subject.entityType,
      id: subject.id,
      contextIds,
    },
    relevantContexts,
    primaryContext,
    actions,
    can,
    membership: resolvedMembership,
  };

  if (env.DEBUG) {
    console.debug(formatPermissionDecision(decision));
  }

  return decision;
};
