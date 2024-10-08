import { infiniteQueryOptions } from '@tanstack/react-query';

import { type GetOrganizationsParams, getOrganizations } from '~/api/organizations';

export const organizationsQueryOptions = ({
  q,
  sort: initialSort,
  order: initialOrder,
  limit = 40,
  rowsLength = 0,
}: GetOrganizationsParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['organizations', q, sort, order],
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) =>
      await getOrganizations(
        {
          page,
          q,
          sort,
          order,
          // Fetch more items than the limit if some items were deleted
          limit: limit + Math.max(page * limit - rowsLength, 0),
          // If some items were added, offset should be undefined, otherwise it should be the length of the rows
          offset: rowsLength - page * limit > 0 ? undefined : rowsLength,
        },
        signal,
      ),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
