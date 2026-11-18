import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
  type ChannelBase,
  checkMemberInvite,
  type InviteOutcome,
  type ListInvitationsData,
  type ListMembersData,
  listInvitations,
  listMembers,
} from 'sdk';
import { appConfig } from 'shared';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import { membersSearchDefaults } from '~/modules/memberships/search-params-schemas';
import type { PageRequest } from '~/query/basic/fetch-all-pages';
import { pageQuery, refetchOnMountForIncluded, tokenPaging } from '~/query/basic/infinite-query-options';
import type { ListFilters } from '~/query/types';

type ChannelInvitationsParams = Pick<ListInvitationsData['query'], 'channelId' | 'channelType'> & ListInvitationsData['path'];
type MemberFilters = ListFilters<ListMembersData['query']>;
type MembersParams = MemberFilters & ListMembersData['path'];
type ChannelInvitationsListParams = ChannelInvitationsParams & { limit?: number };
type MembersListParams = MembersParams & { limit?: number };

const keys = {
  list: {
    base: ['member', 'list'] as const,
    members: (filters: MembersParams) => [...keys.list.base, filters] as const,
    similarMembers: (filters: Pick<MembersParams, 'tenantId' | 'organizationId' | 'channelId' | 'channelType'>) =>
      [...keys.list.base, filters] as const,
    pending: (filters: ChannelInvitationsParams) => ['invites', ...keys.list.base, filters] as const,
    similarPending: (filters: Pick<ChannelInvitationsParams, 'channelId' | 'channelType'>) => ['invites', ...keys.list.base, filters] as const,
  },
  check: (channelId?: string) => ['invites', 'check', channelId] as const,
  update: ['member', 'update'] as const,
  delete: ['member', 'delete'] as const,
};

export const memberQueryKeys = keys;

/** The most addresses one invite or check request takes; more go out in batches of this size. */
const inviteBatchSize = 50;

const inviteBatches = (emails: string[]) =>
  Array.from({ length: Math.ceil(emails.length / inviteBatchSize) }, (_, index) =>
    emails.slice(index * inviteBatchSize, (index + 1) * inviteBatchSize),
  );

/**
 * Sends addresses batch by batch. A failing batch throws when nothing went out yet; after that its addresses and the
 * ones behind it come back as `unsent`, so what did go out is not lost.
 */
export const sendInBatches = async <T>(emails: string[], send: (batch: string[]) => Promise<T>) => {
  const batches = inviteBatches(emails);
  const results: T[] = [];
  for (const [index, batch] of batches.entries()) {
    try {
      results.push(await send(batch));
    } catch (error) {
      if (!index) throw error;
      return { results, unsent: batches.slice(index).flat() };
    }
  }
  return { results, unsent: [] as string[] };
};

type InviteCheckChannel = Pick<ChannelBase, 'id' | 'entityType' | 'tenantId'> & { organizationId?: string | null };

/** What an invite would do with each address. Without a channel (a system invite) nothing is checked. */
export const inviteCheckQueryOptions = (channel: InviteCheckChannel | undefined, emails: string[]) =>
  queryOptions({
    queryKey: [...keys.check(channel?.id), emails] as const,
    queryFn: async ({ signal }): Promise<InviteOutcome[]> => {
      if (!channel) return [];
      const path = { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) };
      const query = { channelId: channel.id, channelType: channel.entityType };
      const results = await Promise.all(inviteBatches(emails).map((batch) => checkMemberInvite({ path, query, body: { emails: batch }, signal })));
      return results.flatMap(({ outcomes }) => outcomes);
    },
    enabled: !!channel && emails.length > 0,
    staleTime: 30_000,
  });

export const membersListQueryOptions = (params: MembersListParams) => {
  const {
    channelId,
    tenantId,
    organizationId,
    channelType,
    q = membersSearchDefaults.q,
    orderBy = membersSearchDefaults.orderBy,
    role,
    userIds,
    include,
    limit = appConfig.pageSizes.members,
  } = params;
  // `include` stays out of the cache key so queries with/without counts share the same cache
  const filters = { q, orderBy, role, userIds };
  const keyFilters = { channelId, channelType, tenantId, organizationId, ...filters };
  const query = { ...filters, include, channelId, channelType };

  return infiniteQueryOptions({
    queryKey: keys.list.members(keyFilters),
    ...tokenPaging((pageToken, signal) => fetchMembersPage(query, { tenantId, organizationId }, pageQuery(limit, pageToken), signal)),
    refetchOnMount: refetchOnMountForIncluded(include),
  });
};

export const channelInvitationsQueryOptions = (params: ChannelInvitationsListParams) => {
  const { channelId, tenantId, organizationId, channelType, limit = appConfig.pageSizes.invitations } = params;
  const query = { channelId, channelType };

  return infiniteQueryOptions({
    queryKey: keys.list.pending({ channelId, channelType, tenantId, organizationId }),
    ...tokenPaging((pageToken, signal) =>
      listInvitations({ query: { ...query, ...pageQuery(limit, pageToken) }, path: { tenantId, organizationId }, signal }),
    ),
    refetchOnMount: true,
  });
};

const fetchMembersPage = (query: MemberFilters, path: ListMembersData['path'], page: PageRequest, signal?: AbortSignal) =>
  listMembers({ query: { ...query, ...page }, path, signal });

/** A page of members for a table export. Bypasses cache; rows carry their counts and MFA setting, as in the members table. */
export const fetchMembersForExport = (params: MembersParams, page: PageRequest) => {
  const { tenantId, organizationId, q, orderBy, role, channelId, channelType } = params;
  return fetchMembersPage({ q, orderBy, role, channelId, channelType, include: 'counts,mfa' }, { tenantId, organizationId }, page);
};
