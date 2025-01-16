import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetRequestsParams, getRequests } from '~/modules/requests/api';

// Keys for requests queries
export const requestsKeys = {
  all: ['requests'] as const,
  list: () => [...requestsKeys.all, 'list'] as const,
  table: (filters?: GetRequestsParams) => [...requestsKeys.list(), filters] as const,
  sendNewsletter: () => [...requestsKeys.all, 'sendNewsLetter'],
  create: () => [...requestsKeys.all, 'create'],
  delete: () => [...requestsKeys.all, 'delete'],
};

// Infinite Query Options to get a paginated list of requests
export const requestsQueryOptions = ({
  q = '',
  sort: initialSort,
  order: initialOrder,
  limit = config.requestLimits.requests,
}: GetRequestsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = requestsKeys.table({ q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getRequests({ page, q, sort, order, limit, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
