import { getMyMemberships } from 'sdk';
import { appConfig, type ChannelEntityType } from 'shared';
import { getAndSetMe } from '~/modules/me/helpers';
import { meKeys } from '~/modules/me/query';
import { memberQueryKeys } from '~/modules/memberships/query';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';

/**
 * Invalidate all channel entity detail queries (fallback when channelType unknown)
 */
function invalidateAllChannelDetails(): void {
  for (const channelType of appConfig.channelEntityTypes) {
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === channelType && query.queryKey[1] === 'detail',
      refetchType: 'none',
    });
  }
}

/** Invalidate the channel entity list for `channelType`; falls back to invalidating all context details when null/unknown. */
export function invalidateChannelList(channelType: ChannelEntityType | null): void {
  if (channelType && hasEntityQueryKeys(channelType)) {
    // Invalidate by the `list` prefix key; covers all filtered list variants for this context type.
    queryClient.invalidateQueries({ queryKey: getEntityQueryKeys(channelType).list.base, refetchType: 'active' });
  } else {
    invalidateAllChannelDetails();
  }
}

/** Invalidate member queries for an org (null invalidates all member queries). */
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
 * Fetch memberships via fetchQuery, ensuring fresh data while deduplicating
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
