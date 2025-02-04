import { infiniteQueryOptions, useMutation } from '@tanstack/react-query';
import { config } from 'config';
import type { ApiError } from '~/lib/api';
import { type CreateRequestBody, type GetRequestsParams, createRequest, getRequests } from '~/modules/requests/api';

/**
 * Keys for request related queries. These keys help to uniquely identify different query. For managing query caching and invalidation.
 */
export const requestsKeys = {
  all: ['requests'] as const,
  list: () => [...requestsKeys.all, 'list'] as const,
  table: (filters?: GetRequestsParams) => [...requestsKeys.list(), filters] as const,
  create: () => [...requestsKeys.all, 'create'],
  delete: () => [...requestsKeys.all, 'delete'],
};

/**
 * Query options to get a paginated list of requests.
 *
 * This function returns infinite query options to fetch a list of requests with support for pagination.
 *
 * @param param.q - Search query for filtering requests(default is an empty string).
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default: `config.requestLimits.requests`).
 * @returns Infinite query options.
 */
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

/**
 * Mutation hook to create a new request.
 *
 * @returns Mutation hook for creating a new request.
 */
export const useCreateRequestMutation = () => {
  return useMutation<boolean, ApiError, CreateRequestBody>({
    mutationKey: requestsKeys.create(),
    mutationFn: createRequest,
  });
};
