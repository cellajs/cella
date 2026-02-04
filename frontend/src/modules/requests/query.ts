import { infiniteQueryOptions, useMutation } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import {
  type CreateRequestData,
  type CreateRequestResponse,
  createRequest,
  deleteRequests,
  type GetRequestsData,
  getRequests,
  type SystemInviteData,
  type SystemInviteResponse,
  systemInvite,
} from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/service';
import type { Request } from '~/modules/requests/types';
import { baseInfiniteQueryOptions } from '~/query/basic';

/**
 * Keys for request related queries. These keys help to uniquely identify different query. For managing query caching and invalidation.
 */
export const requestsKeys = {
  all: ['requests'] as const,
  table: {
    base: () => ['requests', 'table'] as const,
    entries: (filters: Omit<GetRequestsData['query'], 'limit' | 'offset'>) =>
      [...requestsKeys.table.base(), filters] as const,
  },
  approve: () => ['requests', 'approve'],
  create: () => ['requests', 'create'],
  delete: () => ['requests', 'delete'],
};

/**
 * Query options to get a paginated list of requests.
 *
 * This function returns infinite query options to fetch a list of requests with support for pagination.
 *
 * @param param.q - Search query for filtering requests(default is an empty string).
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default: `appConfig.requestLimits.requests`).
 * @returns Infinite query options.
 */
export const requestsListQueryOptions = ({
  q = '',
  sort = 'createdAt',
  order = 'asc',
  limit: baseLimit = appConfig.requestLimits.requests,
}: Omit<NonNullable<GetRequestsData['query']>, 'limit' | 'offset'> & { limit?: number }) => {
  const limit = String(baseLimit);

  const queryKey = requestsKeys.table.entries({ q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));
      return await getRequests({ query: { q, sort, order, limit, offset }, signal });
    },
    ...baseInfiniteQueryOptions,
    refetchOnMount: true,
  });
};

/**
 * Mutation hook to create a new request.
 *
 * @returns Mutation hook for creating a new request.
 */
export const useCreateRequestMutation = () => {
  return useMutation<CreateRequestResponse, ApiError, CreateRequestData['body']>({
    mutationKey: requestsKeys.create(),
    mutationFn: (body) => createRequest({ body }),
  });
};

/**
 * Mutation hook for approving user access requests by sending invites.
 *
 * @returns A mutation that sends an invitation email to a user who has requested access.
 */
export const useSendApprovalInviteMutation = () => {
  return useMutation<SystemInviteResponse, ApiError, SystemInviteData['body']>({
    mutationKey: requestsKeys.approve(),
    mutationFn: async (body) => await systemInvite({ body }),
    onSuccess: () => toaster(t('common:success.users_invited'), 'success'),
    onError: () => toaster(t('error:bad_request_action'), 'error'),
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
    mutationFn: async (requests) => {
      const ids = requests.map(({ id }) => id);
      await deleteRequests({ body: { ids } });
      return true;
    },
  });
};
