/**
 * Membership-specific cache operations.
 *
 * Handles query invalidation and data refresh for membership events.
 * Used by both live stream handler and catchup processor.
 */

import type { ContextEntityType } from 'shared';
import { getAndSetMe } from '~/modules/me/helpers';
import { memberQueryKeys } from '~/modules/memberships/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';

/** Invalidate all context entity detail queries (fallback when contextType unknown) */
function invalidateAllContextDetails(): void {
  const registry = getContextEntityTypeToListQueries();
  for (const contextType of Object.keys(registry)) {
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
  const userId = useUserStore.getState().user.id;
  const queryFactory = contextType ? getContextEntityTypeToListQueries()[contextType] : null;

  if (queryFactory) {
    const queryKey = queryFactory({ userId }).queryKey;
    queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
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
      predicate: (query) => query.queryKey.some((k) => typeof k === 'object' && k !== null && 'orgId' in k),
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
 * Refresh menu data.
 * Called after membership create/delete to update visible entities.
 */
export function refreshMenu(): void {
  getMenuData();
}

/**
 * Refresh current user data.
 * Called after membership updates in case role changed (affects permissions).
 */
export function refreshMe(): void {
  getAndSetMe();
}
