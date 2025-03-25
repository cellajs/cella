import { infiniteQueryOptions, useMutation } from '@tanstack/react-query';
import { config } from 'config';
import type { ApiError } from '~/lib/api';
import { type CreateRequestBody, type GetRequestsParams, createRequest, deleteRequests, getRequests } from '~/modules/requests/api';
import type { Request } from '~/modules/requests/types';
import { getOffset } from '~/query/helpers';

/**
 * Keys for request related queries. These keys help to uniquely identify different query. For managing query caching and invalidation.
 */
export const requestsKeys = {
  all: ['requests'] as const,
  table: {
    base: () => [...requestsKeys.all, 'table'] as const,
    entries: (filters: GetRequestsParams) => [...requestsKeys.table.base(), filters] as const,
  },
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

  const queryKey = requestsKeys.table.entries({ q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam: page, signal }) => {
      const offset = getOffset(queryKey); // Calculate before fetching ensuring correct offset
      return await getRequests({ page, q, sort, order, limit, offset }, signal);
    },
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

/**
 * Mutation hook to delete a requests.
 *
 * @returns Mutation hook for deleting requests.
 */
export const useDeleteRequestMutation = () => {
  return useMutation<boolean, ApiError, Request[]>({
    mutationKey: requestsKeys.delete(),
    mutationFn: (requests) => deleteRequests(requests.map(({ id }) => id)),
  });
};
