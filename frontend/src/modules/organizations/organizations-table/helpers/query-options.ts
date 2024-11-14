import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetOrganizationsParams, getOrganizations } from '~/api/organizations';

const LIMIT = config.requestLimits.organizations;

export const organizationsQueryOptions = ({
  q = '',
  sort: initialSort,
  order: initialOrder,
  limit = LIMIT,
  rowsLength = 0,
}: GetOrganizationsParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';
  const offset = rowsLength;

  return infiniteQueryOptions({
    queryKey: ['organizations', 'list', q, sort, order],
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getOrganizations({ page, q, sort, order, limit, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
