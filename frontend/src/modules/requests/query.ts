import { infiniteQueryOptions, useMutation } from '@tanstack/react-query';
import { config } from 'config';
import type { ApiError } from '~/lib/api';
import { type CreateRequestBody, type GetRequestsParams, createRequest, deleteRequests, getRequests } from '~/modules/requests/api';
import type { Request } from '~/modules/requests/types';
import { CreateRequestResponses } from '~/openapi-client';

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
  sort: _sort,
  order: _order,
  limit: _limit,
}: Omit<GetRequestsParams, 'limit'> & {limit?: number}) => {
  const sort = _sort || 'createdAt';
  const order = _order || 'asc';
  const limit = String(_limit || config.requestLimits.requests);

  const queryKey = requestsKeys.table.entries({ q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: { page: 0, offset: 0 },
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || page * Number(limit));

      return await getRequests({ q, sort, order, limit, offset }, signal)
    },
    getNextPageParam: (_lastPage, allPages) => {
      const page = allPages.length;
      const offset = allPages.reduce((acc, page) => acc + page.items.length, 0);
      return { page, offset };
    },
  });
};

/**
 * Mutation hook to create a new request.
 *
 * @returns Mutation hook for creating a new request.
 */
export const useCreateRequestMutation = () => {
  return useMutation<CreateRequestResponses[200], ApiError, CreateRequestBody>({
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
