import { infiniteQueryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
import { type GetMembersData, type GetPendingMembershipsData, getMembers, getPendingMemberships } from '~/api.gen';
import type { Member, PendingMembership } from '~/modules/memberships/types';
import { baseInfiniteQueryOptions, infiniteQueryUseCachedIfCompleteOptions } from '~/query/utils/infinite-query-options';

type GetPendingMembershipsParams = Omit<GetPendingMembershipsData['query'], 'limit' | 'offset'> & GetPendingMembershipsData['path'];
type GetMembersParams = Omit<GetMembersData['query'], 'limit' | 'offset'> & GetMembersData['path'];
/**
 * Keys for members related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */

const keys = {
  all: ['members'],
  table: {
    base: ['members', 'table'],
    members: (filters: GetMembersParams) => [...keys.table.base, filters],
    similarMembers: (filters: Pick<GetMembersParams, 'orgIdOrSlug' | 'idOrSlug' | 'entityType'>) => [...keys.table.base, filters],
    pending: (filters: GetPendingMembershipsParams) => ['invites', ...keys.table.base, filters],
    similarPending: (filters: Pick<GetPendingMembershipsParams, 'idOrSlug' | 'entityType'>) => ['invites', ...keys.table.base, filters],
  },
  update: () => ['members', 'update'],
  delete: () => ['members', 'delete'],
};

export const membersKeys = keys;

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
  limit: baseLimit = appConfig.requestLimits.members,
}: GetMembersParams & { limit?: number }) => {
  const limit = String(baseLimit);

  const baseQueryKey = membersKeys.table.members({ idOrSlug, entityType, orgIdOrSlug, q: '', sort: 'createdAt', order: 'desc', role: undefined });
  const queryKey = membersKeys.table.members({ idOrSlug, entityType, orgIdOrSlug, q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));

      return await getMembers({
        query: { q, sort, order, role, limit, idOrSlug, entityType, offset },
        path: { orgIdOrSlug },
        signal,
      });
    },
    ...baseInfiniteQueryOptions,
    ...infiniteQueryUseCachedIfCompleteOptions<Member>(baseQueryKey, {
      q,
      sort,
      order,
      searchIn: ['name', 'email'],
      limit: baseLimit,
      additionalFilter: role ? ({ membership }) => membership.role === role : undefined,
      sortOptions: { role: ({ membership }) => membership.role },
    }),
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
 * @param param.limit - Number of items per page (default is configured in `appConfig.requestLimits.pendingMemberships`).
 * @returns Infinite query options.
 */
export const pendingMembershipsQueryOptions = ({
  idOrSlug,
  orgIdOrSlug,
  entityType,
  q = '',
  sort = 'createdAt',
  order = 'desc',
  limit: baseLimit = appConfig.requestLimits.pendingMemberships,
}: GetPendingMembershipsParams & { limit?: number }) => {
  const limit = String(baseLimit);

  const baseQueryKey = membersKeys.table.pending({ idOrSlug, entityType, orgIdOrSlug, q: '', sort: 'createdAt', order: 'desc' });
  const queryKey = membersKeys.table.pending({ idOrSlug, entityType, orgIdOrSlug, q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));

      return await getPendingMemberships({
        query: { q, sort, order, limit, idOrSlug, entityType, offset },
        path: { orgIdOrSlug },
        signal,
      });
    },
    ...baseInfiniteQueryOptions,
    ...infiniteQueryUseCachedIfCompleteOptions<PendingMembership>(baseQueryKey, { q, sort, order, searchIn: ['email'], limit: baseLimit }),
  });
};
