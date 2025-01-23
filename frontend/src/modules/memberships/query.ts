import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';

import { type GetMembersParams, getMembers } from '~/modules/memberships/api';

// Keys for members queries
export const membersKeys = {
  all: ['members'] as const,
  list: () => [...membersKeys.all, 'list'] as const,
  table: (filters?: GetMembersParams) => [...membersKeys.list(), filters] as const,
  similar: (filters?: Pick<GetMembersParams, 'orgIdOrSlug' | 'idOrSlug' | 'entityType'>) => [...membersKeys.all, filters] as const,
  update: () => [...membersKeys.all, 'update'] as const,
  delete: () => [...membersKeys.all, 'delete'] as const,
};

// Infinite Query Options to get a paginated list of members
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
