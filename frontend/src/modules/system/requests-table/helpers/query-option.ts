import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetRequestsParams, getRequests } from '~/api/requests';
import { getPaginatedOffset } from '~/utils/mutate-query';

const LIMIT = config.requestLimits.requests;

export const requestsQueryOptions = ({ q = '', sort: initialSort, order: initialOrder, limit = LIMIT }: GetRequestsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = ['requests', 'list', q, sort, order];
  const offset = getPaginatedOffset(queryKey);

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getRequests({ page, q, sort, order, limit, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
