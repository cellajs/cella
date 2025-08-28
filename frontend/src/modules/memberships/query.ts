import { infiniteQueryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
import { type GetMembersData, type GetPendingInvitationsData, getMembers, getPendingInvitations } from '~/api.gen';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData } from '~/query/types';
import { baseGetNextPageParam, filterVisibleData, infiniteQueryEnabled } from '~/query/utils/infinite-query-options';
import { formatUpdatedCacheData } from '~/query/utils/mutate-query';
import type { Member, PendingInvitation } from './types';

type GetMembershipInvitationsParams = Omit<GetPendingInvitationsData['query'], 'limit' | 'offset'> & GetPendingInvitationsData['path'];
type GetMembersParams = Omit<GetMembersData['query'], 'limit' | 'offset'> & GetMembersData['path'];
/**
 * Keys for members related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const membersKeys = {
  all: ['members'] as const,
  table: {
    base: () => [...membersKeys.all, 'table'] as const,
    members: (filters: GetMembersParams) => [...membersKeys.table.base(), filters] as const,
    similarMembers: (filters: Pick<GetMembersParams, 'orgIdOrSlug' | 'idOrSlug' | 'entityType'>) => [...membersKeys.table.base(), filters] as const,
    pending: (filters: GetMembershipInvitationsParams) => ['invites', ...membersKeys.table.base(), filters] as const,
    similarPending: (filters: Pick<GetMembershipInvitationsParams, 'idOrSlug' | 'entityType'>) =>
      ['invites', ...membersKeys.table.base(), filters] as const,
  },
  update: () => [...membersKeys.all, 'update'] as const,
  delete: () => [...membersKeys.all, 'delete'] as const,
};

/**
 * Infinite query options to fetch a paginated list of members.
 *
 * This function returns the configuration needed to query a list of members from target entity with pagination.
 *
 * @param param.idOrSlug - ID or slug of entity.
 * @param param.entityType - Type of entity.
 * @param param.orgIdOrSlug - ID or slug of organization based of witch entity created.
 * @param param.q - Optional search query to filter members by (default is an empty string).
 * @param param.role - Role of the members to filter by.
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default is configured in `appConfig.requestLimits.members`).
 * @returns Infinite query options.
 */
export const membersQueryOptions = ({
  idOrSlug,
  orgIdOrSlug,
  entityType,
  q = '',
  sort = 'createdAt',
  order = 'desc',
  role,
  limit: _limit,
}: GetMembersParams & { limit?: number }) => {
  const limit = String(_limit || appConfig.requestLimits.members);
  const staleTime = 1000 * 60 * 2; // 2m

  const baseQueryKey = membersKeys.table.members({ idOrSlug, entityType, orgIdOrSlug, q: '', sort: 'createdAt', order: 'desc', role: undefined });
  const queryKey = membersKeys.table.members({ idOrSlug, entityType, orgIdOrSlug, q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: { page: 0, offset: 0 },
    staleTime,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));

      return await getMembers({
        query: { q, sort, order, role, limit, idOrSlug, entityType, offset },
        path: { orgIdOrSlug },
        signal,
      });
    },
    getNextPageParam: baseGetNextPageParam,
    enabled: () => infiniteQueryEnabled(baseQueryKey, staleTime),
    initialData: () => {
      const cache = queryClient.getQueryData<InfiniteQueryData<Member>>(baseQueryKey);
      if (!cache) return;

      const { filteredItems, totalChange } = filterVisibleData(cache, {
        q,
        sort,
        order,
        searchIn: ['name', 'email'],
        additionalFilter: role ? (m) => m.membership.role === role : undefined,
        sortOptions: { role: (m) => m.membership.role },
      });

      return formatUpdatedCacheData(cache, filteredItems, _limit, totalChange) as InfiniteQueryData<Member>;
    },
  });
};

/**
 * Infinite query options to fetch a paginated list of invited members.
 *
 * This function returns the configuration needed to query a list of members from target entity with pagination.
 *
 * @param param.idOrSlug - ID or slug of entity.
 * @param param.entityType - Type of entity.
 * @param param.orgIdOrSlug - ID or slug of organization based of witch entity created.
 * @param param.q - Optional search query to filter invited members by (default is an empty string).
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default is configured in `appConfig.requestLimits.pendingInvitations`).
 * @returns Infinite query options.
 */
export const pendingInvitationsQueryOptions = ({
  idOrSlug,
  orgIdOrSlug,
  entityType,
  q = '',
  sort = 'createdAt',
  order = 'desc',
  limit: _limit,
}: GetMembershipInvitationsParams & { limit?: number }) => {
  const limit = String(_limit || appConfig.requestLimits.pendingInvitations);
  const staleTime = 1000 * 60 * 2; // 2m

  const baseQueryKey = membersKeys.table.pending({ idOrSlug, entityType, orgIdOrSlug, q: '', sort: 'createdAt', order: 'desc' });
  const queryKey = membersKeys.table.pending({ idOrSlug, entityType, orgIdOrSlug, q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: { page: 0, offset: 0 },
    staleTime,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));

      return await getPendingInvitations({
        query: { q, sort, order, limit, idOrSlug, entityType, offset },
        path: { orgIdOrSlug },
        signal,
      });
    },
    getNextPageParam: baseGetNextPageParam,
    enabled: () => infiniteQueryEnabled(baseQueryKey, staleTime),
    initialData: () => {
      const cache = queryClient.getQueryData<InfiniteQueryData<PendingInvitation>>(baseQueryKey);
      if (!cache) return;

      const { filteredItems, totalChange } = filterVisibleData(cache, { q, sort, order, searchIn: ['name', 'email'] });

      return formatUpdatedCacheData(cache, filteredItems, _limit, totalChange) as InfiniteQueryData<PendingInvitation>;
    },
  });
};
