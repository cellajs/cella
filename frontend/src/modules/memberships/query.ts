import { infiniteQueryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
import { type GetMembersData, type GetPendingInvitationsData, getMembers, getPendingInvitations } from '~/api.gen';
import { formatUpdatedData } from '~/query/helpers/mutate-query';
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
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));

      return await getMembers({
        query: { q, sort, order, role, limit, idOrSlug, entityType, offset },
        path: { orgIdOrSlug },
        signal,
      });
    },
    getNextPageParam: (_lastPage, allPages) => {
      const page = allPages.length;
      const offset = allPages.reduce((acc, page) => acc + page.items.length, 0);
      return { page, offset };
    },
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

      const filteredItems = cachedItems
        .filter((m) => {
          const matchesSearch = !validSearch.length || m.name.toLowerCase().includes(validSearch) || m.email.toLowerCase().includes(validSearch);

          const matchesRole = !role || m.membership.role === role;

          return matchesSearch && matchesRole;
        })
        .sort((a, b) => {
          const aVal = a[sort];
          const bVal = b[sort];

          if (aVal === null) return 1;
          if (bVal === null) return -1;

          if (aVal < bVal) return order === 'asc' ? -1 : 1;
          if (aVal > bVal) return order === 'asc' ? 1 : -1;
          return 0;
        });

      const totalChange = filteredItems.length - cachedItems.length;

      // biome-ignore lint/suspicious/noExplicitAny: TODO fix it
      return formatUpdatedData(cache, filteredItems, _limit, totalChange) as any;
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
    getNextPageParam: (_lastPage, allPages) => {
      const page = allPages.length;
      const offset = allPages.reduce((acc, page) => acc + page.items.length, 0);
      return { page, offset };
    },
  });
};
