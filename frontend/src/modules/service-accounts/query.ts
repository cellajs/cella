import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type CreateServiceAccountData,
  type CreateServiceAccountResponse,
  createServiceAccount,
  getCredentials,
  getServiceAccounts,
  type RevokeCredentialData,
  type RevokeCredentialResponse,
  revokeCredential,
} from 'sdk';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import type { MutationData } from '~/query/types';

type OrgPath = { tenantId: string; organizationId: string };

export const serviceAccountKeys = {
  all: ['service-accounts'] as const,
  list: (path: OrgPath) => ['service-accounts', 'list', path.tenantId, path.organizationId] as const,
  credentials: (path: OrgPath, id: string) => ['service-accounts', 'credentials', path.tenantId, id] as const,
  create: ['service-accounts', 'create'] as const,
  revoke: ['service-accounts', 'revoke'] as const,
};

export const serviceAccountsQueryOptions = (path: OrgPath) =>
  queryOptions({
    queryKey: serviceAccountKeys.list(path),
    queryFn: () => getServiceAccounts({ path, query: { limit: String(appConfig.requestLimits.default) } }),
  });

export const credentialsQueryOptions = (path: OrgPath, id: string) =>
  queryOptions({
    queryKey: serviceAccountKeys.credentials(path, id),
    queryFn: () => getCredentials({ path: { ...path, id } }),
  });

/** One-step "create API key": the account and its first key come back together; the secret is in the response once. */
export const useCreateServiceAccountMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<CreateServiceAccountResponse, ApiError, MutationData<CreateServiceAccountData>>({
    mutationKey: serviceAccountKeys.create,
    mutationFn: ({ path, body }) => createServiceAccount({ path, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serviceAccountKeys.all }),
  });
};

export const useRevokeCredentialMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<RevokeCredentialResponse, ApiError, MutationData<RevokeCredentialData>>({
    mutationKey: serviceAccountKeys.revoke,
    mutationFn: ({ path }) => revokeCredential({ path }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serviceAccountKeys.all }),
  });
};
