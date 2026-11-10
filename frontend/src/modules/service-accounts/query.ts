import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  type CreateServiceAccountData,
  type CreateServiceAccountResponse,
  createServiceAccount,
  listApiKeys,
  listServiceAccounts,
  type RevokeApiKeyData,
  type RevokeApiKeyResponse,
  revokeApiKey,
} from 'sdk';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import { withStepUp } from '~/modules/auth/step-up';
import { StepUpDismissedError } from '~/modules/auth/step-up-retry';
import { toaster } from '~/modules/common/toaster/toaster';
import { syncChunkSize } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { queryClient } from '~/query/query-client';
import type { MutationData, QueryOrgContext } from '~/query/types';

const serviceAccountKeys = {
  list: (path: QueryOrgContext) => ['service-accounts', 'list', path.tenantId, path.organizationId] as const,
  apiKeys: (path: QueryOrgContext, accountId: string) => ['service-accounts', 'apiKeys', path.tenantId, path.organizationId, accountId] as const,
  create: ['service-accounts', 'create'] as const,
  revoke: ['service-accounts', 'revoke'] as const,
};

export const serviceAccountsQueryOptions = (path: QueryOrgContext) =>
  queryOptions({
    queryKey: serviceAccountKeys.list(path),
    queryFn: () => listServiceAccounts({ path, query: { maxPageSize: appConfig.pageSizes.default } }),
  });

export const apiKeysQueryOptions = (path: QueryOrgContext, accountId: string) =>
  queryOptions({
    queryKey: serviceAccountKeys.apiKeys(path, accountId),
    queryFn: () => fetchAllPages((page) => listApiKeys({ path: { ...path, serviceAccountId: accountId }, query: page }), syncChunkSize),
  });

/** One-step "create API key": the account and its first key come back together; the secret is in the response once. */
export const useCreateServiceAccountMutation = () =>
  useMutation<CreateServiceAccountResponse, ApiError, MutationData<CreateServiceAccountData>>({
    mutationKey: serviceAccountKeys.create,
    mutationFn: ({ path, body }) => withStepUp(() => createServiceAccount({ path, body })),
    onSuccess: ({ serviceAccount, apiKey }, { path }) => {
      queryClient.setQueryData(serviceAccountsQueryOptions(path).queryKey, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, results: [serviceAccount, ...oldData.results], totalSize: oldData.totalSize + 1 };
      });
      // The secret never enters the cache; the listed row is the safe shape.
      if (apiKey) {
        const { secret: _secret, ...listed } = apiKey;
        queryClient.setQueryData(apiKeysQueryOptions(path, serviceAccount.id).queryKey, { results: [listed], totalSize: 1 });
      }
      toaster.success(t('c:success.create_resource', { resource: t('c:api_key') }));
    },
    onError(error) {
      if (error instanceof StepUpDismissedError) return;
      console.error('Error creating API key:', error);
    },
  });

export const useRevokeApiKeyMutation = () =>
  useMutation<RevokeApiKeyResponse, ApiError, MutationData<RevokeApiKeyData>>({
    mutationKey: serviceAccountKeys.revoke,
    mutationFn: ({ path }) => revokeApiKey({ path }),
    onSuccess: (revoked, { path }) => {
      queryClient.setQueryData(apiKeysQueryOptions(path, path.serviceAccountId).queryKey, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, results: oldData.results.map((item) => (item.id === revoked.id ? revoked : item)) };
      });
      toaster.success(t('c:success.revoke_resource', { resource: t('c:api_key') }));
    },
    onError(error) {
      console.error('Error revoking API key:', error);
    },
  });
