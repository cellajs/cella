import { infiniteQueryOptions } from '@tanstack/react-query';
import { type GetMembersData, type GetPendingMembershipsData, getMembers, getPendingMemberships } from 'sdk';
import { appConfig } from 'shared';
import { membersSearchDefaults } from '~/modules/memberships/search-params-schemas';
import { offsetPaging, pageQuery } from '~/query/basic/infinite-query-options';

type PendingMembershipsParams = Omit<GetPendingMembershipsData['query'], 'limit' | 'offset'> & GetPendingMembershipsData['path'];
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
  update: ['member', 'update'] as const,
  delete: ['member', 'delete'] as const,
};

export const memberQueryKeys = keys;

export const membersListQueryOptions = (params: MembersListParams) => {
  const defaults = membersSearchDefaults;
  const {
    entityId,
    tenantId,
    organizationId,
    entityType,
    q = defaults.q,
    sort = defaults.sort,
    order = defaults.order,
    role,
    userIds,
    include,
    limit = appConfig.requestLimits.members,
  } = params;
  // `include` stays out of the cache key so queries with/without counts share the same cache
  const filters = { q, sort, order, role, userIds };
  const keyFilters = { entityId, entityType, tenantId, organizationId, ...filters };
  const requestQuery = { ...filters, include, entityId, entityType };

  return infiniteQueryOptions({
    queryKey: keys.list.members(keyFilters),
    ...offsetPaging(limit, (offset, signal) => fetchMembersPage(requestQuery, { tenantId, organizationId }, limit, offset, signal)),
    refetchOnMount: true,
  });
};

export const pendingMembershipsQueryOptions = (params: PendingMembershipsListParams) => {
  const {
    entityId,
    tenantId,
    organizationId,
    entityType,
    q = '',
    sort = 'createdAt',
    order = 'desc',
    limit = appConfig.requestLimits.pendingMemberships,
  } = params;
  const filters = { q, sort, order };
  const keyFilters = { entityId, entityType, tenantId, organizationId, ...filters };
  const query = { ...filters, entityId, entityType };

  return infiniteQueryOptions({
    queryKey: keys.list.pending(keyFilters),
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
