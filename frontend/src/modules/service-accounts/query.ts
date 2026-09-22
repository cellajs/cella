import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  type CreateServiceAccountData,
  type CreateServiceAccountResponse,
  createServiceAccount,
  type GetCredentialsResponse,
  type GetServiceAccountsResponse,
  getCredentials,
  getServiceAccounts,
  type RevokeCredentialData,
  type RevokeCredentialResponse,
  revokeCredential,
} from 'sdk';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/toaster';
import { queryClient } from '~/query/query-client';
import type { MutationData, QueryOrgContext } from '~/query/types';

export const serviceAccountKeys = {
  all: ['service-accounts'] as const,
  list: (path: QueryOrgContext) => ['service-accounts', 'list', path.tenantId, path.organizationId] as const,
  credentials: (path: QueryOrgContext, id: string) =>
    ['service-accounts', 'credentials', path.tenantId, path.organizationId, id] as const,
  create: ['service-accounts', 'create'] as const,
  revoke: ['service-accounts', 'revoke'] as const,
};

export const serviceAccountsQueryOptions = (path: QueryOrgContext) =>
  queryOptions({
    queryKey: serviceAccountKeys.list(path),
    queryFn: () => getServiceAccounts({ path, query: { limit: String(appConfig.requestLimits.default) } }),
  });

export const credentialsQueryOptions = (path: QueryOrgContext, id: string) =>
  queryOptions({
    queryKey: serviceAccountKeys.credentials(path, id),
    queryFn: () => getCredentials({ path: { ...path, id } }),
  });

/** One-step "create API key": the account and its first key come back together; the secret is in the response once. */
export const useCreateServiceAccountMutation = () => {
  return useMutation<CreateServiceAccountResponse, ApiError, MutationData<CreateServiceAccountData>>({
    mutationKey: serviceAccountKeys.create,
    mutationFn: ({ path, body }) => createServiceAccount({ path, body }),
    onSuccess: ({ serviceAccount, credential }, { path }) => {
      queryClient.setQueryData<GetServiceAccountsResponse>(serviceAccountKeys.list(path), (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, items: [serviceAccount, ...oldData.items], total: oldData.total + 1 };
      });
      // The secret never enters the cache; the listed row is the safe shape.
      if (credential) {
        const { secret: _secret, ...listed } = credential;
        queryClient.setQueryData<GetCredentialsResponse>(serviceAccountKeys.credentials(path, serviceAccount.id), {
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

export const useRevokeCredentialMutation = () => {
  return useMutation<RevokeCredentialResponse, ApiError, MutationData<RevokeCredentialData>>({
    mutationKey: serviceAccountKeys.revoke,
    mutationFn: ({ path }) => revokeCredential({ path }),
    onSuccess: (revoked, { path }) => {
      const { tenantId, organizationId, id } = path;
      queryClient.setQueryData<GetCredentialsResponse>(
        serviceAccountKeys.credentials({ tenantId, organizationId }, id),
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
