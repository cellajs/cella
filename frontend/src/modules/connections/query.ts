import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  type CreateLtiRegistrationLinkData,
  type CreateLtiRegistrationLinkResponse,
  createLtiRegistrationLink,
  type DeleteLtiConnectionData,
  deleteLtiConnection,
  listLtiConnections,
  listLtiContexts,
} from 'sdk';
import type { ApiError } from '~/lib/api';
import { withStepUp } from '~/modules/auth/step-up';
import { toaster } from '~/modules/common/toaster/toaster';
import { syncChunkSize } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { queryClient } from '~/query/query-client';
import type { MutationData, QueryOrgContext } from '~/query/types';

const ltiConnectionKeys = {
  list: (path: QueryOrgContext) => ['connections', 'lti', path.tenantId, path.organizationId] as const,
  contexts: (path: QueryOrgContext) => ['connections', 'lti-contexts', path.tenantId, path.organizationId] as const,
  createLink: ['connections', 'create-lti-registration-link'] as const,
  delete: ['connections', 'delete-lti'] as const,
};

/** The LTI platforms the app is registered at for the organization's tenant. */
export const ltiConnectionsQueryOptions = (path: QueryOrgContext) =>
  queryOptions({
    queryKey: ltiConnectionKeys.list(path),
    queryFn: () => fetchAllPages((page) => listLtiConnections({ path, query: page }), syncChunkSize),
  });

/** The courses of the organization's LTI connections, with how the last member import of each ran. */
export const ltiContextsQueryOptions = (path: QueryOrgContext) =>
  queryOptions({
    queryKey: ltiConnectionKeys.contexts(path),
    queryFn: () => fetchAllPages((page) => listLtiContexts({ path, query: page }), syncChunkSize),
  });

/** A one-use registration link; its value is answered once and never enters the cache. */
export const useCreateLtiRegistrationLinkMutation = () =>
  useMutation<CreateLtiRegistrationLinkResponse, ApiError, MutationData<CreateLtiRegistrationLinkData>>({
    mutationKey: ltiConnectionKeys.createLink,
    mutationFn: ({ path }) => withStepUp(() => createLtiRegistrationLink({ path })),
  });

export const useDeleteLtiConnectionMutation = () =>
  useMutation<void, ApiError, MutationData<DeleteLtiConnectionData>>({
    mutationKey: ltiConnectionKeys.delete,
    mutationFn: async ({ path }) => {
      await deleteLtiConnection({ path });
    },
    onSuccess: (_, { path }) => {
      queryClient.setQueryData(ltiConnectionsQueryOptions(path).queryKey, (oldData) => {
        if (!oldData) return oldData;
        const results = oldData.results.filter((connection) => connection.id !== path.connectionId);
        return { ...oldData, results, totalSize: results.length };
      });
      toaster.success(t('c:success.delete_resource', { resource: t('c:connection') }));
    },
  });
