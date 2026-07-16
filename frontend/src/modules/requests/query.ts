import { infiniteQueryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  type CreateRequestData,
  type CreateRequestResponse,
  createRequest,
  deleteRequests,
  type GetRequestsData,
  getRequests,
  type Request,
  type SystemInviteData,
  type SystemInviteResponse,
  systemInvite,
} from 'sdk';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/toaster';
import { requestsSearchDefaults } from '~/modules/requests/search-params-schemas';
import { baseInfiniteQueryOptions } from '~/query/basic/infinite-query-options';

/**
 * Keys for request related queries. These keys help to uniquely identify different query. For managing query caching and invalidation.
 */
export const requestsKeys = {
  table: {
    base: () => ['requests', 'table'] as const,
    entries: (filters: Omit<GetRequestsData['query'], 'limit' | 'offset'>) =>
      [...requestsKeys.table.base(), filters] as const,
  },
  approve: () => ['requests', 'approve'],
  create: () => ['requests', 'create'],
  delete: () => ['requests', 'delete'],
};

/** Infinite query options for a paginated list of requests. */
export const requestsListQueryOptions = ({
  q = requestsSearchDefaults.q,
  sort = requestsSearchDefaults.sort,
  order = requestsSearchDefaults.order,
  limit: baseLimit = appConfig.requestLimits.requests,
}: Omit<NonNullable<GetRequestsData['query']>, 'limit' | 'offset'> & { limit?: number }) => {
  const limit = String(baseLimit);

  const queryKey = requestsKeys.table.entries({ q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));
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
    onSuccess: () => toaster(t('c:success.users_invited'), 'success'),
    onError: () => toaster(t('error:bad_request_action'), 'error'),
  });
};

/**
 * Mutation hook to delete requests.
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

/** Fetch requests for table export. Bypasses cache; returns flat items. */
export const fetchRequestsForExport = async (params: {
  limit: number;
  offset?: number;
  q?: string;
  sort?: NonNullable<GetRequestsData['query']>['sort'];
  order?: NonNullable<GetRequestsData['query']>['order'];
}) => {
  const {
    limit,
    offset = 0,
    q = requestsSearchDefaults.q,
    sort = requestsSearchDefaults.sort,
    order = requestsSearchDefaults.order,
  } = params;
  const response = await getRequests({
    query: { q, sort, order, limit: String(limit), offset: String(offset) },
  });
  return response.items;
};
