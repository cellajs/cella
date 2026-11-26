import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import { isRecord } from 'shared/utils/as-record';
import { meKeys, myMembershipsQueryOptions } from '~/modules/me/query';
import { memberQueryKeys } from '~/modules/memberships/query';
import { isFilterSegment } from '~/query/basic/create-query-keys';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { defaultStaleTime, queryClient } from '~/query/query-client';

/** Memberships the caller's own requests answered with, each until the time its echo on the stream stops counting. */
const ownWrites = new Map<string, number>();
// An echo arrives within a second or two; a later signal may be someone else's change to the same membership
const ownWriteMs = 10_000;

/** Notes a membership the caller's own request answered with and put in the cache: its echo on the stream refetches nothing. */
export function noteOwnMembershipWrite(id: string): void {
  const now = Date.now();
  for (const [noted, until] of ownWrites) {
    if (until <= now) ownWrites.delete(noted);
  }
  ownWrites.set(id, now + ownWriteMs);
}

/** Whether a signal about membership `id` echoes the caller's own write; a write matches one signal. */
export function isOwnMembershipEcho(id: string): boolean {
  const until = ownWrites.get(id);
  ownWrites.delete(id);
  return until !== undefined && until > Date.now();
}

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
        query.queryKey.some((segment) => isFilterSegment(segment) && 'organizationId' in segment && segment.organizationId === organizationId),
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

/**
 * Refetches where shown, else marks, the channel lists and the details of a channel and of the channels inside it, after
 * a change that reaches into them, such as an archive or an arrangement of their pages.
 */
export function invalidateChannelsInside(channelId: string): void {
  for (const channelType of hierarchy.channelTypes) {
    if (channelType === 'organization') continue;
    invalidateChannelList(channelType);
    if (!hasEntityQueryKeys(channelType)) continue;
    queryClient.invalidateQueries({
      queryKey: getEntityQueryKeys(channelType).detail.base,
      predicate: ({ state }) => isRecord(state.data) && hierarchy.isAtOrInside(channelType, state.data, channelId),
      refetchType: 'active',
    });
  }
}

/** useMenu rebuilds on this. */
export function invalidateMemberships(): void {
  queryClient.invalidateQueries({ queryKey: meKeys.memberships, refetchType: 'active' });
}

/** `query` deduplicates against an in-flight listMyMemberships, which invalidateQueries would not, avoiding a redundant fetch on app init. */
export function fetchMemberships(): Promise<unknown> {
  // A catchup within the stale time of the route loader's read fetches nothing.
  return queryClient.query({ ...myMembershipsQueryOptions(), staleTime: defaultStaleTime });
}
