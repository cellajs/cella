import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  type CreateServiceAccountData,
  type CreateServiceAccountResponse,
  createServiceAccount,
  type GetApiKeysResponse,
  type GetServiceAccountsResponse,
  getApiKeys,
  getServiceAccounts,
  type RevokeApiKeyData,
  type RevokeApiKeyResponse,
  revokeApiKey,
} from 'sdk';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/toaster';
import { queryClient } from '~/query/query-client';
import type { MutationData, QueryOrgContext } from '~/query/types';

export const serviceAccountKeys = {
  all: ['service-accounts'] as const,
  list: (path: QueryOrgContext) => ['service-accounts', 'list', path.tenantId, path.organizationId] as const,
  apiKeys: (path: QueryOrgContext, id: string) =>
    ['service-accounts', 'apiKeys', path.tenantId, path.organizationId, id] as const,
  create: ['service-accounts', 'create'] as const,
  revoke: ['service-accounts', 'revoke'] as const,
};

export const serviceAccountsQueryOptions = (path: QueryOrgContext) =>
  queryOptions({
    queryKey: serviceAccountKeys.list(path),
    queryFn: () => getServiceAccounts({ path, query: { limit: String(appConfig.requestLimits.default) } }),
  });

export const apiKeysQueryOptions = (path: QueryOrgContext, id: string) =>
  queryOptions({
    queryKey: serviceAccountKeys.apiKeys(path, id),
    queryFn: () => getApiKeys({ path: { ...path, id } }),
  });

/** One-step "create API key": the account and its first key come back together; the secret is in the response once. */
export const useCreateServiceAccountMutation = () => {
  return useMutation<CreateServiceAccountResponse, ApiError, MutationData<CreateServiceAccountData>>({
    mutationKey: serviceAccountKeys.create,
    mutationFn: ({ path, body }) => createServiceAccount({ path, body }),
    onSuccess: ({ serviceAccount, apiKey }, { path }) => {
      queryClient.setQueryData<GetServiceAccountsResponse>(serviceAccountKeys.list(path), (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, items: [serviceAccount, ...oldData.items], total: oldData.total + 1 };
      });
      // The secret never enters the cache; the listed row is the safe shape.
      if (apiKey) {
        const { secret: _secret, ...listed } = apiKey;
        queryClient.setQueryData<GetApiKeysResponse>(serviceAccountKeys.apiKeys(path, serviceAccount.id), {
          items: [listed],
        });
      }
      toaster.success(t('c:success.create_resource', { resource: t('c:api_key') }));
    },
    onError(error) {
      console.error('Error creating API key:', error);
    },
  });
};

export const useRevokeApiKeyMutation = () => {
  return useMutation<RevokeApiKeyResponse, ApiError, MutationData<RevokeApiKeyData>>({
    mutationKey: serviceAccountKeys.revoke,
    mutationFn: ({ path }) => revokeApiKey({ path }),
    onSuccess: (revoked, { path }) => {
      const { tenantId, organizationId, id } = path;
      queryClient.setQueryData<GetApiKeysResponse>(
        serviceAccountKeys.apiKeys({ tenantId, organizationId }, id),
        (oldData) => {
          if (!oldData) return oldData;
          return { ...oldData, items: oldData.items.map((item) => (item.id === revoked.id ? revoked : item)) };
        },
      );
      toaster.success(t('c:success.revoke_resource', { resource: t('c:api_key') }));
    },
    onError(error) {
      console.error('Error revoking API key:', error);
    },
  });
};
