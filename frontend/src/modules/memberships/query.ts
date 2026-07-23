import { infiniteQueryOptions } from '@tanstack/react-query';
import { type GetMembersData, type GetPendingMembershipsData, getMembers, getPendingMemberships } from 'sdk';
import { appConfig } from 'shared';
import { membersSearchDefaults } from '~/modules/memberships/search-params-schemas';
import { baseInfiniteQueryOptions } from '~/query/basic/infinite-query-options';

type PendingMembershipsParams = Omit<GetPendingMembershipsData['query'], 'limit' | 'offset'> &
  GetPendingMembershipsData['path'];
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
    similarPending: (filters: Pick<PendingMembershipsParams, 'entityId' | 'entityType'>) =>
      ['invites', ...keys.list.base, filters] as const,
  },
  update: ['member', 'update'] as const,
  delete: ['member', 'delete'] as const,
};

export const memberQueryKeys = keys;

/** Infinite query options for a paginated list of members of the target entity. */
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
    limit = appConfig.requestLimits.members,
  } = params;
  const filters = { q, sort, order, role, userIds };
  const keyFilters = { entityId, entityType, tenantId, organizationId, ...filters };
  const path = { tenantId, organizationId };
  const requestQuery = { ...filters, limit: String(limit), entityId, entityType };

  return infiniteQueryOptions({
    queryKey: keys.list.members(keyFilters),
    queryFn: ({ pageParam: { page, offset }, signal }) => {
      const requestOffset = String(offset ?? (page ?? 0) * limit);
      return getMembers({ query: { ...requestQuery, offset: requestOffset }, path, signal });
    },
    ...baseInfiniteQueryOptions,
    refetchOnMount: true,
  });
};

/** Infinite query options for a paginated list of invited (pending) members of the target entity. */
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
  const path = { tenantId, organizationId };
  const requestQuery = { ...filters, limit: String(limit), entityId, entityType };

  return infiniteQueryOptions({
    queryKey: keys.list.pending(keyFilters),
    queryFn: ({ pageParam: { page, offset }, signal }) => {
      const requestOffset = String(offset ?? (page ?? 0) * limit);
      return getPendingMemberships({ query: { ...requestQuery, offset: requestOffset }, path, signal });
    },
    ...baseInfiniteQueryOptions,
    refetchOnMount: true,
  });
};

/** Fetch members for table export. Bypasses cache; returns flat items. */
export const fetchMembersForExport = async (params: MembersParams & { limit: number; offset?: number }) => {
  const { limit, offset = 0, ...rest } = params;
  const { items } = await getMembers({
    query: {
      q: rest.q,
      sort: rest.sort ?? membersSearchDefaults.sort,
      order: rest.order ?? membersSearchDefaults.order,
      role: rest.role,
      limit: String(limit),
      offset: String(offset),
      entityId: rest.entityId,
      entityType: rest.entityType,
    },
    path: { tenantId: rest.tenantId, organizationId: rest.organizationId },
  });
  return items;
};
