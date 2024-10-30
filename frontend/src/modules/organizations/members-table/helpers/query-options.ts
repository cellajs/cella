import { infiniteQueryOptions } from '@tanstack/react-query';
import { type GetMembersParams, getMembers } from '~/api/memberships';

// Build query to get members with infinite scroll
export const membersQueryOptions = ({
  idOrSlug,
  orgIdOrSlug,
  entityType,
  q,
  sort: initialSort,
  order: initialOrder,
  role,
  limit = 40,
  rowsLength = 0,
}: GetMembersParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['members', idOrSlug, entityType, q, sort, order, role],
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) =>
      getMembers(
        {
          page,
          q,
          sort,
          order,
          role,
          limit,
          idOrSlug,
          orgIdOrSlug,
          entityType,
          offset: rowsLength,
        },
        signal,
      ),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
