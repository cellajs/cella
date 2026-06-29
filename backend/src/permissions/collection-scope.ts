import {
  accessPolicies,
  type ContextEntityType,
  getPolicyPermissions,
  getSubjectPolicies,
  hierarchy,
  type ProductEntityType,
} from 'shared';
import { AppError } from '#/core/error';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/** Whether a role grants unconditional `read` on the entity type within the given context. */
const roleGrantsRead = (entityType: ProductEntityType, contextType: ContextEntityType, role: string): boolean => {
  const policies = getSubjectPolicies(entityType, accessPolicies);
  const permissions = getPolicyPermissions(policies, contextType, role as never);
  // Only an unconditional grant (1) widens collection scope; 'own' is row-conditional, not a context grant.
  return permissions?.read === 1;
};

/**
 * Returns undefined for org-wide access; otherwise the readable sub-context ids.
 */
const getReadableSubContextIds = (
  memberships: MembershipBaseModel[],
  entityType: ProductEntityType,
  organizationId: string,
): string[] | undefined => {
  const ancestors = hierarchy.getOrderedAncestors(entityType); // most-specific → root, e.g. [project, organization]
  const rootContext = ancestors.at(-1) ?? null; // organization
  const subContextType = ancestors.find((context) => context !== rootContext) ?? null; // project

  const readableSubContextIds = new Set<string>();

  for (const membership of memberships) {
    // Root-context (e.g. organization) read grant → full org visibility.
    if (
      rootContext &&
      membership.contextType === rootContext &&
      membership.contextId === organizationId &&
      roleGrantsRead(entityType, rootContext, membership.role)
    ) {
      return undefined;
    }

    // Sub-context (e.g. project) read grant → scope to those ids within this organization.
    if (
      subContextType &&
      membership.contextType === subContextType &&
      membership.organizationId === organizationId &&
      membership.contextId &&
      roleGrantsRead(entityType, subContextType, membership.role)
    ) {
      readableSubContextIds.add(membership.contextId);
    }
  }

  return [...readableSubContextIds];
};

/**
 * Result of resolving the effective sub-context id filter for a collection read.
 * - `subContextIds === undefined` → no sub-context filter (org-wide read, e.g. org admin).
 * - `subContextIds === []` → caller has no readable scope → the op should return an empty list.
 * - `subContextIds === [..]` → restrict rows to these sub-context ids.
 */
export interface CollectionReadFilter {
  subContextIds: string[] | undefined;
}

/**
 * Resolve the effective sub-context id filter for a product collection read, scoping the result to
 * the caller's membership-derived access.
 *
 * @param memberships - The caller's memberships.
 * @param entityType - The product entity being listed.
 * @param organizationId - The organization the request is scoped to.
 * @param requested - Optional explicit sub-context narrowing already resolved from the request:
 *   - `subContextId`: a single explicit id (e.g. `projectId` query param).
 *   - `subContextIds`: a pre-resolved set (e.g. all project ids of a requested workspace).
 *   When neither is provided the read is an aggregate over the caller's readable scope.
 * @throws AppError 403 `forbidden` when an explicitly requested id is outside the caller's readable scope.
 */
export const resolveCollectionReadFilter = (
  memberships: MembershipBaseModel[],
  entityType: ProductEntityType,
  organizationId: string,
  requested?: { subContextId?: string; subContextIds?: string[] },
): CollectionReadFilter => {
  const readableSubContextIds = getReadableSubContextIds(memberships, entityType, organizationId);

  // Explicit single id (e.g. ?projectId=…): must be within the caller's readable scope.
  if (requested?.subContextId !== undefined) {
    if (readableSubContextIds !== undefined && !readableSubContextIds.includes(requested.subContextId)) {
      throw new AppError(403, 'forbidden', 'warn', { entityType });
    }
    return { subContextIds: [requested.subContextId] };
  }

  // Explicit set (e.g. all projects of a workspace): intersect with readable scope unless org-wide.
  if (requested?.subContextIds !== undefined) {
    const ids =
      readableSubContextIds === undefined
        ? requested.subContextIds
        : requested.subContextIds.filter((id) => readableSubContextIds.includes(id));
    return { subContextIds: ids };
  }

  // Aggregate read: org-wide for ancestor-level grants, otherwise the caller's readable sub-contexts.
  return { subContextIds: readableSubContextIds };
};
