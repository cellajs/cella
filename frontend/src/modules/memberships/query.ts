import { infiniteQueryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
import { type GetMembersData, type GetPendingInvitationsData, getMembers, getPendingInvitations } from '~/api.gen';
import { baseGetNextPageParam } from '~/query/helpers/get-next-page-params';
import { formatUpdatedCacheData } from '~/query/helpers/mutate-query';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData } from '~/query/types';
import type { Member } from './types';

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
  sort: _sort,
  order: _order,
  role,
  limit: _limit,
}: GetMembersParams & { limit?: number }) => {
  const sort = _sort || 'createdAt';
  const order = _order || 'desc';
  const limit = String(_limit || appConfig.requestLimits.members);

  const queryKey = membersKeys.table.members({ idOrSlug, entityType, orgIdOrSlug, q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: { page: 0, offset: 0 },
    staleTime: 1000 * 60 * 2, // 2m
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));

      return await getMembers({
        query: { q, sort, order, role, limit, idOrSlug, entityType, offset },
        path: { orgIdOrSlug },
        signal,
      });
    },
    getNextPageParam: baseGetNextPageParam,
    enabled: () => {
      const data = queryClient.getQueryData<InfiniteQueryData<Member>>(
        membersKeys.table.members({ idOrSlug, entityType, orgIdOrSlug, q: '', sort: 'createdAt', order: 'desc', role: undefined }),
      );
      if (!data) return true;
      const totalCount = data.pages[data.pages.length - 1].total;
      const fetchedCount = data.pages.reduce((acc, page) => acc + page.items.length, 0);

      return fetchedCount < totalCount;
    },
    initialData: () => {
      const cache = queryClient.getQueryData<InfiniteQueryData<Member>>(
        membersKeys.table.members({ idOrSlug, entityType, orgIdOrSlug, q: '', sort: 'createdAt', order: 'desc', role: undefined }),
      );
      if (!cache) return;
      const cachedItems = cache.pages.flatMap((p) => p.items);
      const validSearch = q.trim().toLowerCase();

      const sortOptions: Record<string, (m: Member) => string> = {
        id: (m) => m.id,
        name: (m) => m.name,
        email: (m) => m.email,
        createdAt: (m) => m.createdAt,
        lastSeenAt: (m) => m.lastSeenAt || '',
        role: (m) => m.membership.role,
      };

      const filteredItems = cachedItems
        .filter((m) => {
          const matchesSearch = !validSearch.length || m.name.toLowerCase().includes(validSearch) || m.email.toLowerCase().includes(validSearch);

          const matchesRole = !role || m.membership.role === role;

          return matchesSearch && matchesRole;
        })
        .sort((a, b) => {
          const getVal = sort && sortOptions[sort] ? sortOptions[sort] : (m: Member) => m.id;

          const aVal = getVal(a);
          const bVal = getVal(b);

          // Null handling
          if (aVal == null && bVal == null) return 0;
          if (aVal == null) return 1;
          if (bVal == null) return -1;

          // Special case for role (priority order)
          if (sort === 'role') {
            const roleRank: Record<string, number> = { admin: 0, member: 1 };
            const cmp = roleRank[aVal] - roleRank[bVal];
            return order === 'asc' ? cmp : -cmp;
          }

          // Locale-aware string comparison
          const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
          return order === 'asc' ? cmp : -cmp;
        });

      const totalChange = filteredItems.length - cachedItems.length;

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
  sort: _sort,
  order: _order,
  limit: _limit,
}: GetMembershipInvitationsParams & { limit?: number }) => {
  const sort = _sort || 'createdAt';
  const order = _order || 'desc';
  const limit = String(_limit || appConfig.requestLimits.pendingInvitations);

  const queryKey = membersKeys.table.pending({ idOrSlug, entityType, orgIdOrSlug, q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: { page: 0, offset: 0 },
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));

      return await getPendingInvitations({
        query: { q, sort, order, limit, idOrSlug, entityType, offset },
        path: { orgIdOrSlug },
        signal,
      });
    },
    getNextPageParam: baseGetNextPageParam,
  });
};
