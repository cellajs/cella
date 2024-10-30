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
  const offset = rowsLength;

  return infiniteQueryOptions({
    queryKey: ['organizations', q, sort, order],
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getOrganizations({ page, q, sort, order, limit, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
