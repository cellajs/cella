import {
  type AccessPolicies,
  accessPolicies,
  type ContextEntityType,
  getPolicyPermissions,
  getSubjectPolicies,
  hierarchy,
  isRowCondition,
  type NormalizedPermissionValue,
  type ProductEntityType,
  type RowCondition,
} from 'shared';
import { AppError } from '#/core/error';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/** The `read` policy value a role grants for the entity type within the given context. */
const roleReadValue = (
  policies: AccessPolicies,
  entityType: ProductEntityType,
  contextType: ContextEntityType,
  role: string,
): NormalizedPermissionValue => {
  const subjectPolicies = getSubjectPolicies(entityType, policies);
  const permissions = getPolicyPermissions(subjectPolicies, contextType, role);
  return permissions?.read ?? 0;
};

/**
 * A row-conditional slice of the caller's readable scope: rows within `subContextIds`
 * (undefined = org-wide) are readable only where `condition` matches.
 * Compiled to SQL by `buildCollectionReadWhere` (`row-predicates.ts`).
 */
export interface ConditionalScope {
  condition: RowCondition;
  subContextIds: string[] | undefined;
}

/** Accumulator for scope resolution: unconditional ids + per-condition ids, org-wide flags. */
interface ScopeAccumulator {
  unconditionalOrgWide: boolean;
  unconditionalIds: Set<string>;
  /** Keyed by condition name; conditions sharing a name must be the same rule. */
  conditional: Map<string, { condition: RowCondition; orgWide: boolean; ids: Set<string> }>;
}

/**
 * Resolve the caller's readable scope for a product entity within an organization.
 *
 * - Unconditional grants (`read: 1`) widen the plain sub-context scope, as before.
 * - Row-conditional grants (`read: <condition>`, e.g. `'own'`) contribute a
 *   {@link ConditionalScope}: those contexts' rows are readable where the condition
 *   matches. This makes condition-only roles listable at all; a role with only
 *   `read: 'own'` otherwise contributes no unconditional scope.
 */
const resolveScopes = (
  policies: AccessPolicies,
  memberships: MembershipBaseModel[],
  entityType: ProductEntityType,
  organizationId: string,
): ScopeAccumulator => {
  const ancestors = hierarchy.getOrderedAncestors(entityType); // most-specific → root, e.g. [project, organization]
  const rootContext = ancestors.at(-1) ?? null; // organization
  const subContextType = ancestors.find((context) => context !== rootContext) ?? null; // project

  const acc: ScopeAccumulator = {
    unconditionalOrgWide: false,
    unconditionalIds: new Set(),
    conditional: new Map(),
  };

  const addConditional = (condition: RowCondition, contextId: string | null) => {
    const entry = acc.conditional.get(condition.name) ?? { condition, orgWide: false, ids: new Set<string>() };
    if (contextId === null) entry.orgWide = true;
    else entry.ids.add(contextId);
    acc.conditional.set(condition.name, entry);
  };

  const addUnconditional = (contextId: string | null) => {
    if (contextId === null) acc.unconditionalOrgWide = true;
    else acc.unconditionalIds.add(contextId);
  };

  for (const membership of memberships) {
    // Root-context (e.g. organization) grant → org-wide scope.
    if (rootContext && membership.contextType === rootContext && membership.contextId === organizationId) {
      const value = roleReadValue(policies, entityType, rootContext, membership.role);
      if (value === 1) addUnconditional(null);
      else if (isRowCondition(value)) addConditional(value, null);
    }

    // Sub-context (e.g. project) grant → scope to those ids within this organization.
    if (
      subContextType &&
      membership.contextType === subContextType &&
      membership.organizationId === organizationId &&
      membership.contextId
    ) {
      const value = roleReadValue(policies, entityType, subContextType, membership.role);
      if (value === 1) addUnconditional(membership.contextId);
      else if (isRowCondition(value)) addConditional(value, membership.contextId);
    }
  }

  return acc;
};

/**
 * Result of resolving the effective scope filter for a collection read.
 *
 * Unconditional scope (rows readable outright):
 * - `subContextIds === undefined` → no sub-context filter (org-wide read, e.g. org admin).
 * - `subContextIds === []` → no unconditional scope.
 * - `subContextIds === [..]` → restrict rows to these sub-context ids.
 *
 * Conditional scopes (`conditionalScopes`): additional rows readable where a row
 * condition matches (OR-ed with the unconditional scope). Empty for callers whose roles
 * carry no row-conditional read grants, existing call sites that only consume
 * `subContextIds` keep their exact previous behavior.
 *
 * A read is empty only when `subContextIds` is `[]` AND `conditionalScopes` is empty.
 */
export interface CollectionReadFilter {
  subContextIds: string[] | undefined;
  conditionalScopes: ConditionalScope[];
}

/** Whether the resolved filter yields no readable rows at all (op should return an empty list). */
export const hasNoReadScope = (filter: CollectionReadFilter): boolean => {
  return (
    filter.subContextIds !== undefined && filter.subContextIds.length === 0 && filter.conditionalScopes.length === 0
  );
};

const toConditionalScopes = (acc: ScopeAccumulator): ConditionalScope[] => {
  // Org-wide unconditional scope subsumes every conditional slice.
  if (acc.unconditionalOrgWide) return [];

  const scopes: ConditionalScope[] = [];
  for (const { condition, orgWide, ids } of acc.conditional.values()) {
    if (orgWide) {
      scopes.push({ condition, subContextIds: undefined });
      continue;
    }
    // Ids already unconditionally readable don't need the conditional slice.
    const remaining = [...ids].filter((id) => !acc.unconditionalIds.has(id));
    if (remaining.length > 0) scopes.push({ condition, subContextIds: remaining });
  }
  return scopes;
};

/**
 * Resolve the effective scope filter for a product collection read, scoping the result to
 * the caller's membership-derived access.
 *
 * @param memberships - The caller's memberships.
 * @param entityType - The product entity being listed.
 * @param organizationId - The organization the request is scoped to.
 * @param requested - Optional explicit sub-context narrowing already resolved from the request:
 *   - `subContextId`: a single explicit id (e.g. `projectId` query param).
 *   - `subContextIds`: a pre-resolved set (e.g. all project ids of a requested workspace).
 *   When neither is provided the read is an aggregate over the caller's readable scope.
 * @throws AppError 403 `forbidden` when an explicitly requested id is outside the caller's
 *   readable scope entirely (neither unconditional nor covered by any conditional scope).
 */
export const resolveCollectionReadFilter = (
  memberships: MembershipBaseModel[],
  entityType: ProductEntityType,
  organizationId: string,
  requested?: { subContextId?: string; subContextIds?: string[] },
): CollectionReadFilter => {
  return resolveCollectionReadFilterForPolicies(accessPolicies, memberships, entityType, organizationId, requested);
};

/**
 * Same as {@link resolveCollectionReadFilter} but against an explicit policy set,
 * mirroring `getAllDecisions(policies, …)`. Used by the check/SQL parity property test
 * to exercise synthetic policies; handlers use the bound wrapper above.
 */
export const resolveCollectionReadFilterForPolicies = (
  policies: AccessPolicies,
  memberships: MembershipBaseModel[],
  entityType: ProductEntityType,
  organizationId: string,
  requested?: { subContextId?: string; subContextIds?: string[] },
): CollectionReadFilter => {
  const acc = resolveScopes(policies, memberships, entityType, organizationId);
  const conditionalScopes = toConditionalScopes(acc);

  const unconditionallyReadable = (id: string): boolean => acc.unconditionalOrgWide || acc.unconditionalIds.has(id);
  const conditionalScopesFor = (ids: string[]): ConditionalScope[] => {
    const remaining = ids.filter((id) => !unconditionallyReadable(id));
    if (remaining.length === 0) return [];
    return conditionalScopes
      .map(({ condition, subContextIds }) => ({
        condition,
        subContextIds: subContextIds === undefined ? remaining : remaining.filter((id) => subContextIds.includes(id)),
      }))
      .filter((scope) => scope.subContextIds.length > 0);
  };

  // Explicit single id (e.g. ?projectId=…): must be within the caller's readable scope.
  if (requested?.subContextId !== undefined) {
    const id = requested.subContextId;
    if (unconditionallyReadable(id)) return { subContextIds: [id], conditionalScopes: [] };

    const scopes = conditionalScopesFor([id]);
    if (scopes.length === 0) {
      throw new AppError(403, 'forbidden', 'warn', { entityType });
    }
    return { subContextIds: [], conditionalScopes: scopes };
  }

  // Explicit set (e.g. all projects of a workspace): intersect with the caller's scope.
  if (requested?.subContextIds !== undefined) {
    const unconditional = requested.subContextIds.filter((id) => unconditionallyReadable(id));
    return { subContextIds: unconditional, conditionalScopes: conditionalScopesFor(requested.subContextIds) };
  }

  // Aggregate read: org-wide for ancestor-level grants, otherwise the caller's readable sub-contexts.
  return {
    subContextIds: acc.unconditionalOrgWide ? undefined : [...acc.unconditionalIds],
    conditionalScopes,
  };
};
