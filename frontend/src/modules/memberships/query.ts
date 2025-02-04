import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';

import { type GetMembersParams, getMembers } from '~/modules/memberships/api';

/**
 * Keys for members queries.
 * This object contains different keys for identifying and caching queries related to members.
 */
export const membersKeys = {
  all: ['members'] as const,
  list: () => [...membersKeys.all, 'list'] as const,
  table: (filters?: GetMembersParams) => [...membersKeys.list(), filters] as const,
  similar: (filters?: Pick<GetMembersParams, 'orgIdOrSlug' | 'idOrSlug' | 'entityType'>) => [...membersKeys.list(), filters] as const,
  update: () => [...membersKeys.all, 'update'] as const,
  delete: () => [...membersKeys.all, 'delete'] as const,
};

/**
 * Infinite query options to fetch a paginated list of members.
 *
 * This function returns the configuration needed to query a list of members from target entity with pagination.
 *
 * @param idOrSlug - ID or slug of entity.
 * @param entityType - Type of entity.
 * @param orgIdOrSlug - ID or slug of organization based of witch entity created.
 * @param q - Optional search query to filter members by (default is an empty string).
 * @param role - Role of the members to filter by.
 * @param sort - Field to sort by (default is 'createdAt').
 * @param order - Order of sorting (default is 'desc').
 * @param limit - Number of items per page (default is configured in `config.requestLimits.members`).
 * @returns Infinite query options.
 */
export const membersQueryOptions = ({
  idOrSlug,
  orgIdOrSlug,
  entityType,
  q = '',
  sort: initialSort,
  order: initialOrder,
  role,
  limit = config.requestLimits.members,
}: GetMembersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = membersKeys.table({ idOrSlug, entityType, orgIdOrSlug, q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) =>
      await getMembers({ page, q, sort, order, role, limit, idOrSlug, orgIdOrSlug, entityType, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
