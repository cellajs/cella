import { getMyMemberships } from 'sdk';
import { appConfig, type ContextEntityType } from 'shared';
import { getAndSetMe } from '~/modules/me/helpers';
import { meKeys } from '~/modules/me/query';
import { memberQueryKeys } from '~/modules/memberships/query';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic';
import { queryClient } from '~/query/query-client';

/**
 * Invalidate all context entity detail queries (fallback when contextType unknown)
 */
function invalidateAllContextDetails(): void {
  for (const contextType of appConfig.contextEntityTypes) {
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === contextType && query.queryKey[1] === 'detail',
      refetchType: 'none',
    });
  }
}

/**
 * Invalidate context entity list for a specific contextType.
 * Falls back to invalidating all context details if contextType is unknown.
 *
 * @param contextType - The context entity type (e.g., 'organization'), or null for fallback
 */
export function invalidateContextList(contextType: ContextEntityType | null): void {
  if (contextType && hasEntityQueryKeys(contextType)) {
    // Invalidate by the `list` prefix key — covers all filtered list variants for this context type.
    queryClient.invalidateQueries({ queryKey: getEntityQueryKeys(contextType).list.base, refetchType: 'active' });
  } else {
    invalidateAllContextDetails();
  }
}

/**
 * Invalidate member queries for an organization.
 * Invalidates member lists that include the specified organization.
 *
 * @param organizationId - The organization ID, or null to invalidate all member queries
 */
export function invalidateMemberQueries(organizationId: string | null): void {
  if (organizationId) {
    queryClient.invalidateQueries({
      queryKey: memberQueryKeys.list.base,
      predicate: (query) => query.queryKey.some((k) => typeof k === 'object' && k !== null && 'organizationId' in k),
      refetchType: 'active',
    });
  } else {
    // Fallback for catchup: invalidate all member queries
    queryClient.invalidateQueries({
      queryKey: memberQueryKeys.list.base,
      refetchType: 'active',
    });
  }
}

/**
 * Invalidate memberships cache so the enrichment subscriber
 * re-enriches entity lists and useMenu reactively rebuilds.
 */
export function invalidateMemberships(): void {
  queryClient.invalidateQueries({ queryKey: meKeys.memberships, refetchType: 'active' });
}

/**
 * Fetch memberships via fetchQuery — ensures fresh data while deduplicating
 * with any in-flight getMyMemberships request (e.g., from getMenuData's ensureQueryData).
 * Preferred over invalidateQueries during catchup to avoid redundant fetches on app init.
 */
export function fetchMemberships(): void {
  queryClient.fetchQuery({ queryKey: meKeys.memberships, queryFn: async ({ signal }) => getMyMemberships({ signal }) });
}

/**
 * Refresh current user data.
 * Called after membership updates in case role changed (affects permissions).
 */
export function refreshMe(): void {
  getAndSetMe();
}
