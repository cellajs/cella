import { infiniteQueryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  batchDeleteRequests,
  type CreateRequestData,
  type CreateRequestResponse,
  createRequest,
  type InviteUsersResponse,
  inviteUsers,
  type ListRequestsData,
  listRequests,
  type Request,
} from 'sdk';
import { appConfig } from 'shared';
import { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/toaster';
import { requestsSearchDefaults } from '~/modules/requests/search-params-schemas';
import { cacheRemove, cacheUpdate } from '~/query/basic/cache-mutations';
import type { PageRequest } from '~/query/basic/fetch-all-pages';
import { orderByParam, pageQuery, tokenPaging } from '~/query/basic/infinite-query-options';
import type { ListFilters } from '~/query/types';

type RequestFilters = ListFilters<NonNullable<ListRequestsData['query']>>;
type RequestsListParams = RequestFilters & { limit?: number };

const requestsKeys = {
  table: {
    base: ['requests', 'table'] as const,
    entries: (filters: RequestFilters) => [...requestsKeys.table.base, filters] as const,
  },
  approve: ['requests', 'approve'] as const,
  create: ['requests', 'create'] as const,
  delete: ['requests', 'delete'] as const,
};

const withDefaults = ({
  q = requestsSearchDefaults.q,
  sort = requestsSearchDefaults.sort,
  order = requestsSearchDefaults.order,
}: RequestFilters) => ({ q, sort, order });

const fetchRequestsPage = (filters: RequestFilters, page: PageRequest, signal?: AbortSignal) => {
  const { q, sort, order } = withDefaults(filters);
  return listRequests({ query: { q, orderBy: orderByParam(sort, order), ...page }, signal });
};

export const requestsListQueryOptions = ({ limit = appConfig.requestLimits.requests, ...params }: RequestsListParams) => {
  const filters = withDefaults(params);

  return infiniteQueryOptions({
    queryKey: requestsKeys.table.entries(filters),
    ...tokenPaging((pageToken, signal) => fetchRequestsPage(filters, pageQuery(limit, pageToken), signal)),
    refetchOnMount: true,
  });
};

/** Public forms send one-shot requests: a failure shows at once, and the form never waits on offline replay. */
export const useCreateRequestMutation = () => {
  return useMutation<CreateRequestResponse, ApiError, CreateRequestData['body']>({
    mutationKey: requestsKeys.create,
    mutationFn: (body) => createRequest({ body }),
    networkMode: 'always',
    retry: false,
    // The global handler toasts only an ApiError; this toasts the rest (no response, or one that is not an API error).
    onError: (error) => {
      if (!(error instanceof ApiError)) toaster.error(t('c:server_unreachable.text'));
    },
  });
};

/** Approves waitlist requests: each address gets an invitation email, and the cached rows read invited. */
export const useSendApprovalInviteMutation = () => {
  return useMutation<InviteUsersResponse, ApiError, Request[]>({
    mutationKey: requestsKeys.approve,
    mutationFn: (requests) => inviteUsers({ body: { emails: requests.map(({ email }) => email) } }),
    onSuccess: (_, requests) => {
      cacheUpdate(
        requestsKeys.table.base,
        requests.map((request) => ({ ...request, wasInvited: true })),
      );
      toaster.success(t('c:success.users_invited'));
    },
  });
};

export const useDeleteRequestMutation = () => {
  return useMutation<void, ApiError, Request[]>({
    mutationKey: requestsKeys.delete,
    mutationFn: async (requests) => {
      const ids = requests.map(({ id }) => id);
      await batchDeleteRequests({ body: { ids } });
    },
    onSuccess: (_, requests) => cacheRemove(requestsKeys.table.base, requests),
  });
};

/** A page of requests for a table export. Bypasses cache. */
export const fetchRequestsForExport = (filters: RequestFilters, page: PageRequest) => fetchRequestsPage(filters, page);
