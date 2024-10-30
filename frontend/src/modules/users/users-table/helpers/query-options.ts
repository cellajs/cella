import { infiniteQueryOptions } from '@tanstack/react-query';
import { type GetUsersParams, getUsers } from '~/api/users';

export const usersQueryOptions = ({
  q,
  sort: initialSort,
  order: initialOrder,
  role,
  limit = 40,
  rowsLength = 0,
}: GetUsersParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['users', q, sort, order, role],
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async ({ pageParam: page, signal }) =>
      await getUsers(
        {
          page,
          q,
          sort,
          order,
          role,
          // Fetch more items than the limit if some items were deleted
          limit: limit + Math.max(limit - rowsLength, 0),
          // If some items were added, offset should be undefined, otherwise it should be the length of the rows
          offset: rowsLength - limit > 0 ? undefined : rowsLength,
        },
        signal,
      ),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
