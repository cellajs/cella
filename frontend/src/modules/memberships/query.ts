import { infiniteQueryOptions } from '@tanstack/react-query';
import { appConfig } from 'shared';
import { type GetMembersData, type GetPendingMembershipsData, getMembers, getPendingMemberships } from '~/api.gen';
import { baseInfiniteQueryOptions } from '~/query/basic';

type GetPendingMembershipsParams = Omit<GetPendingMembershipsData['query'], 'limit' | 'offset'> &
  GetPendingMembershipsData['path'];
type GetMembersParams = Omit<GetMembersData['query'], 'limit' | 'offset'> & GetMembersData['path'];

const keys = {
  all: ['member'],
  list: {
    base: ['member', 'list'],
    members: (filters: GetMembersParams) => [...keys.list.base, filters],
    similarMembers: (filters: Pick<GetMembersParams, 'orgId' | 'entityId' | 'entityType'>) => [
      ...keys.list.base,
      filters,
    ],
    pending: (filters: GetPendingMembershipsParams) => ['invites', ...keys.list.base, filters],
    similarPending: (filters: Pick<GetPendingMembershipsParams, 'entityId' | 'entityType'>) => [
      'invites',
      ...keys.list.base,
      filters,
    ],
  },
  update: () => ['member', 'update'],
  delete: () => ['member', 'delete'],
};

export const memberQueryKeys = keys;

/**
 * Infinite query options to fetch a paginated list of members.
 *
 * This function returns the configuration needed to query a list of members from target entity with pagination.
 *
 * @param param.entityId - ID or slug of entity.
 * @param param.entityType - Type of entity.
 * @param param.orgId - ID or slug of organization based of witch entity created.
 * @param param.q - Optional search query to filter members by (default is an empty string).
 * @param param.role - Role of the members to filter by.
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default is configured in `appConfig.requestLimits.members`).
 * @returns Infinite query options.
 */
export const membersListQueryOptions = ({
  entityId,
  orgId,
  entityType,
  q = '',
  sort = 'createdAt',
  order = 'desc',
  role,
  limit: baseLimit = appConfig.requestLimits.members,
}: GetMembersParams & { limit?: number }) => {
  const limit = String(baseLimit);

  const queryKey = keys.list.members({ entityId, entityType, orgId, q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));

      return await getMembers({
        query: { q, sort, order, role, limit, entityId, entityType, offset },
        path: { orgId },
        signal,
      });
    },
    ...baseInfiniteQueryOptions,
    refetchOnMount: true,
  });
};

/**
 * Infinite query options to fetch a paginated list of invited members.
 *
 * This function returns the configuration needed to query a list of members from target entity with pagination.
 *
 * @param param.entityId - ID or slug of entity.
 * @param param.entityType - Type of entity.
 * @param param.orgId - ID or slug of organization based of witch entity created.
 * @param param.q - Optional search query to filter invited members by (default is an empty string).
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default is configured in `appConfig.requestLimits.pendingMemberships`).
 * @returns Infinite query options.
 */
export const pendingMembershipsQueryOptions = ({
  entityId,
  orgId,
  entityType,
  q = '',
  sort = 'createdAt',
  order = 'desc',
  limit: baseLimit = appConfig.requestLimits.pendingMemberships,
}: GetPendingMembershipsParams & { limit?: number }) => {
  const limit = String(baseLimit);
  const queryKey = keys.list.pending({ entityId, entityType, orgId, q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));

      return await getPendingMemberships({
        query: { q, sort, order, limit, entityId, entityType, offset },
        path: { orgId },
        signal,
      });
    },
    ...baseInfiniteQueryOptions,
    refetchOnMount: true,
  });
};
