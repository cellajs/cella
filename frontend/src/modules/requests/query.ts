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
import { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/toaster';
import { requestsSearchDefaults } from '~/modules/requests/search-params-schemas';
import { offsetPaging, pageQuery } from '~/query/basic/infinite-query-options';

type RequestFilters = Omit<NonNullable<GetRequestsData['query']>, 'limit' | 'offset'>;
type RequestsListParams = RequestFilters & { limit?: number };

export const requestsKeys = {
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

/** One page of requests, search defaults filled in. */
const fetchRequestsPage = (filters: RequestFilters, limit: number, offset: number, signal?: AbortSignal) =>
  getRequests({ query: { ...withDefaults(filters), ...pageQuery(limit, offset) }, signal });

export const requestsListQueryOptions = ({ limit = appConfig.requestLimits.requests, ...params }: RequestsListParams) => {
  const filters = withDefaults(params);

  return infiniteQueryOptions({
    queryKey: requestsKeys.table.entries(filters),
    ...offsetPaging(limit, (offset, signal) => fetchRequestsPage(filters, limit, offset, signal)),
    refetchOnMount: true,
  });
};

/** Public forms send one-shot requests: a failure surfaces at once, and the form never waits on offline replay. */
export const useCreateRequestMutation = () => {
  return useMutation<CreateRequestResponse, ApiError, CreateRequestData['body']>({
    mutationKey: requestsKeys.create,
    mutationFn: (body) => createRequest({ body }),
    networkMode: 'always',
    retry: false,
    // The global handler toasts every ApiError and stays silent on the rest (no response, or one that is not an API error).
    onError: (error) => {
      if (!(error instanceof ApiError)) toaster.error(t('c:server_unreachable.text'));
    },
  });
};

/** Approving a request sends the user an invitation email. */
export const useSendApprovalInviteMutation = () => {
  return useMutation<SystemInviteResponse, ApiError, SystemInviteData['body']>({
    mutationKey: requestsKeys.approve,
    mutationFn: (body) => systemInvite({ body }),
    onSuccess: () => toaster.success(t('c:success.users_invited')),
    onError: () => toaster.error(t('error:bad_request_action')),
  });
};

export const useDeleteRequestMutation = () => {
  return useMutation<boolean, ApiError, Request[]>({
    mutationKey: requestsKeys.delete,
    mutationFn: async (requests) => {
      const ids = requests.map(({ id }) => id);
      await deleteRequests({ body: { ids } });
      return true;
    },
  });
};

/** Fetch requests for table export. Bypasses cache; returns flat items. */
export const fetchRequestsForExport = async ({ limit, offset = 0, ...filters }: RequestsListParams & { limit: number; offset?: number }) =>
  (await fetchRequestsPage(filters, limit, offset)).items;
