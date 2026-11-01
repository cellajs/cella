import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
  type ChannelBase,
  checkMembershipInvite,
  type GetMembersData,
  type GetPendingMembershipsData,
  getMembers,
  getPendingMemberships,
  type InviteOutcome,
} from 'sdk';
import { appConfig } from 'shared';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import { membersSearchDefaults } from '~/modules/memberships/search-params-schemas';
import { offsetPaging, pageQuery } from '~/query/basic/infinite-query-options';

type PendingMembershipsParams = Pick<GetPendingMembershipsData['query'], 'entityId' | 'entityType'> & GetPendingMembershipsData['path'];
type MembersParams = Omit<GetMembersData['query'], 'limit' | 'offset'> & GetMembersData['path'];
type PendingMembershipsListParams = PendingMembershipsParams & { limit?: number };
type MembersListParams = MembersParams & { limit?: number };

const keys = {
  list: {
    base: ['member', 'list'] as const,
    members: (filters: MembersParams) => [...keys.list.base, filters] as const,
    similarMembers: (filters: Pick<MembersParams, 'tenantId' | 'organizationId' | 'entityId' | 'entityType'>) =>
      [...keys.list.base, filters] as const,
    pending: (filters: PendingMembershipsParams) => ['invites', ...keys.list.base, filters] as const,
    similarPending: (filters: Pick<PendingMembershipsParams, 'entityId' | 'entityType'>) => ['invites', ...keys.list.base, filters] as const,
  },
  check: (channelId?: string) => ['invites', 'check', channelId] as const,
  update: ['member', 'update'] as const,
  delete: ['member', 'delete'] as const,
};

export const memberQueryKeys = keys;

/** The most addresses one invite or check request takes; more go out in batches of this size. */
const inviteBatchSize = 50;

/** Splits addresses into request-sized batches. */
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
      const query = { entityId: channel.id, entityType: channel.entityType };
      const results = await Promise.all(
        inviteBatches(emails).map((batch) => checkMembershipInvite({ path, query, body: { emails: batch }, signal })),
      );
      return results.flatMap(({ outcomes }) => outcomes);
    },
    enabled: !!channel && emails.length > 0,
    staleTime: 30_000,
  });

export const membersListQueryOptions = (params: MembersListParams) => {
  const {
    entityId,
    tenantId,
    organizationId,
    entityType,
    q = membersSearchDefaults.q,
    sort = membersSearchDefaults.sort,
    order = membersSearchDefaults.order,
    role,
    userIds,
    include,
    limit = appConfig.requestLimits.members,
  } = params;
  // `include` stays out of the cache key so queries with/without counts share the same cache
  const filters = { q, sort, order, role, userIds };
  const keyFilters = { entityId, entityType, tenantId, organizationId, ...filters };
  const query = { ...filters, include, entityId, entityType };

  return infiniteQueryOptions({
    queryKey: keys.list.members(keyFilters),
    ...offsetPaging(limit, (offset, signal) => fetchMembersPage(query, { tenantId, organizationId }, limit, offset, signal)),
    refetchOnMount: true,
  });
};

export const pendingMembershipsQueryOptions = (params: PendingMembershipsListParams) => {
  const { entityId, tenantId, organizationId, entityType, limit = appConfig.requestLimits.pendingMemberships } = params;
  const query = { entityId, entityType };

  return infiniteQueryOptions({
    queryKey: keys.list.pending({ entityId, entityType, tenantId, organizationId }),
    ...offsetPaging(limit, (offset, signal) =>
      getPendingMemberships({ query: { ...query, ...pageQuery(limit, offset) }, path: { tenantId, organizationId }, signal }),
    ),
    refetchOnMount: true,
  });
};

const fetchMembersPage = (
  query: Omit<GetMembersData['query'], 'limit' | 'offset'>,
  path: GetMembersData['path'],
  limit: number,
  offset: number,
  signal?: AbortSignal,
) => getMembers({ query: { ...query, ...pageQuery(limit, offset) }, path, signal });

/** Fetch members for table export. Bypasses cache; items carry their counts and MFA setting, as in the members table. */
export const fetchMembersForExport = async (params: MembersParams & { limit: number; offset?: number }) => {
  const { limit, offset = 0, tenantId, organizationId, q, role, entityId, entityType } = params;
  const { sort = membersSearchDefaults.sort, order = membersSearchDefaults.order } = params;
  const query = { q, sort, order, role, entityId, entityType, include: 'counts,mfa' };
  return (await fetchMembersPage(query, { tenantId, organizationId }, limit, offset)).items;
};
