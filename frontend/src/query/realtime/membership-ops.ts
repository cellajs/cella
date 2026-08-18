import { getMyMemberships } from 'sdk';
import { appConfig, type ChannelEntityType } from 'shared';
import { getAndSetMe } from '~/modules/me/helpers';
import { meKeys } from '~/modules/me/query';
import { memberQueryKeys } from '~/modules/memberships/query';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';

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
    // The `list` prefix covers every filtered list variant for this channel type.
    queryClient.invalidateQueries({ queryKey: getEntityQueryKeys(channelType).list.base, refetchType: 'active' });
  } else {
    invalidateAllChannelDetails();
  }
}

export function invalidateMemberQueries(organizationId: string | null): void {
  if (organizationId) {
    queryClient.invalidateQueries({
      queryKey: memberQueryKeys.list.base,
      predicate: (query) => query.queryKey.some((k) => typeof k === 'object' && k !== null && 'organizationId' in k),
      refetchType: 'active',
    });
  } else {
    // Catchup fallback: every member query.
    queryClient.invalidateQueries({
      queryKey: memberQueryKeys.list.base,
      refetchType: 'active',
    });
  }
}

/** The enrichment subscriber re-enriches entity lists from this, and useMenu rebuilds. */
export function invalidateMemberships(): void {
  queryClient.invalidateQueries({ queryKey: meKeys.memberships, refetchType: 'active' });
}

/** fetchQuery deduplicates against an in-flight getMyMemberships, which invalidateQueries would not, avoiding a redundant fetch on app init. */
export function fetchMemberships(): Promise<unknown> {
  return queryClient.fetchQuery({
    queryKey: meKeys.memberships,
    queryFn: async ({ signal }) => getMyMemberships({ signal }),
  });
}

/** Called after membership updates, since a role change alters permissions. */
export function refreshMe(): void {
  getAndSetMe();
}
