import { appConfig, type ChannelEntityType } from 'shared';
import { meKeys, myMembershipsQueryOptions } from '~/modules/me/query';
import { memberQueryKeys } from '~/modules/memberships/query';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { defaultStaleTime, queryClient } from '~/query/query-client';

function invalidateAllChannelDetails(): void {
  for (const channelType of appConfig.channelEntityTypes) {
    queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === channelType && query.queryKey[1] === 'detail', refetchType: 'none' });
  }
}

/** Invalidate the channel entity list for `channelType`; a null or unregistered type marks every channel detail stale. */
export function invalidateChannelList(channelType: ChannelEntityType | null): void {
  if (channelType && hasEntityQueryKeys(channelType)) {
    // The `list` prefix covers every filtered list variant for this channel type.
    queryClient.invalidateQueries({ queryKey: getEntityQueryKeys(channelType).list.base, refetchType: 'active' });
  } else {
    invalidateAllChannelDetails();
  }
}

/** Member lists and pending invitation lists, of one organization or, without one, of all. */
export function invalidateMemberQueries(organizationId: string | null): void {
  for (const queryKey of [memberQueryKeys.list.base, ['invites', ...memberQueryKeys.list.base]]) {
    queryClient.invalidateQueries({
      queryKey,
      predicate: (query) =>
        !organizationId ||
        query.queryKey.some(
          (segment) => typeof segment === 'object' && segment !== null && 'organizationId' in segment && segment.organizationId === organizationId,
        ),
      refetchType: 'active',
    });
  }
}

const isInOrganization = (data: unknown, organizationId: string) =>
  typeof data === 'object' &&
  data !== null &&
  'id' in data &&
  (data.id === organizationId || ('organizationId' in data && data.organizationId === organizationId));

/** Channel details of one organization or, without one, of all, whose membership counts CDC writes after the REST answer. */
export function invalidateChannelDetails(organizationId: string | null): void {
  for (const channelType of appConfig.channelEntityTypes) {
    if (!hasEntityQueryKeys(channelType)) continue;
    queryClient.invalidateQueries({
      queryKey: getEntityQueryKeys(channelType).detail.base,
      predicate: ({ state }) => !organizationId || isInOrganization(state.data, organizationId),
      refetchType: 'active',
    });
  }
}

/** The channel enrichment subscriber reruns on this, and useMenu rebuilds. */
export function invalidateMemberships(): void {
  queryClient.invalidateQueries({ queryKey: meKeys.memberships, refetchType: 'active' });
}

/** `query` deduplicates against an in-flight listMyMemberships, which invalidateQueries would not, avoiding a redundant fetch on app init. */
export function fetchMemberships(): Promise<unknown> {
  // A catchup within the stale time of the route loader's read fetches nothing.
  return queryClient.query({ ...myMembershipsQueryOptions(), staleTime: defaultStaleTime });
}
