import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetOrganizationsParams, getOrganizations } from '~/api/organizations';

const LIMIT = config.requestLimits.organizations;

export const organizationsQueryOptions = ({ q = '', sort: initialSort, order: initialOrder, limit = LIMIT }: GetOrganizationsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = ['organizations', 'list', q, sort, order];

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getOrganizations({ page, q, sort, order, limit, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
