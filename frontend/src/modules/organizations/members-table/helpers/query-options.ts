import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetMembersParams, getMembers } from '~/api/memberships';
import { membersKeys } from '~/query/query-key-factories';

const LIMIT = config.requestLimits.members;

// Build query to get members with infinite scroll
export const membersQueryOptions = ({
  idOrSlug,
  orgIdOrSlug,
  entityType,
  q = '',
  sort: initialSort,
  order: initialOrder,
  role,
  limit = LIMIT,
}: GetMembersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = membersKeys.list({ idOrSlug, entityType, orgIdOrSlug, q, sort, order, role });

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
