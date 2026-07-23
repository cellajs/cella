import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateDomainResponse, DeleteDomainResponse, Tenant, VerifyDomainResponse } from 'sdk';
import {
  type CreateDomainData,
  type CreateTenantData,
  createDomain,
  createTenant,
  type DeleteDomainData,
  deleteDomain,
  type GetTenantsData,
  getDomain,
  getDomains,
  getTenants,
  type UpdateTenantData,
  updateTenant,
  type VerifyDomainData,
  verifyDomain,
} from 'sdk';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import { tenantsSearchDefaults } from '~/modules/tenants/search-params-schemas';
import { baseInfiniteQueryOptions } from '~/query/basic/infinite-query-options';
import type { MutationData } from '~/query/types';

type TenantFilters = Omit<NonNullable<GetTenantsData['query']>, 'limit' | 'offset'>;
type TenantsListParams = TenantFilters & { limit?: number };

/**
 * Query keys for tenant operations.
 * Tenants are resources (not entities), so we define keys manually.
 */
const tenantQueryKeys = {
  list: {
    base: ['tenant', 'list'] as const,
    filtered: (filters: TenantFilters) => ['tenant', 'list', filters] as const,
  },
  create: ['tenant', 'create'] as const,
  update: ['tenant', 'update'] as const,
};

/**
 * Infinite query options for fetching a paginated list of tenants.
 */
export const tenantsListQueryOptions = (params: TenantsListParams) => {
  const defaults = tenantsSearchDefaults;
  const {
    q = defaults.q,
    status,
    sort = defaults.sort,
    order = defaults.order,
    limit = appConfig.requestLimits.users, // Use users limit as fallback
  } = params;
  const filters = { q, status, sort, order };
  const requestQuery = { ...filters, limit: String(limit) };

  return infiniteQueryOptions({
    queryKey: tenantQueryKeys.list.filtered(filters),
    queryFn: ({ pageParam: { page, offset }, signal }) => {
      const requestOffset = String(offset ?? (page ?? 0) * limit);
      return getTenants({ query: { ...requestQuery, offset: requestOffset }, signal });
    },
    ...baseInfiniteQueryOptions,
    refetchOnMount: true,
  });
};

/**
 * Mutation hook for creating a new tenant.
 */
export const useTenantCreateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<Tenant, ApiError, CreateTenantData['body']>({
    mutationKey: tenantQueryKeys.create,
    mutationFn: (body) => createTenant({ body }),
    onSuccess: () => {
      // Invalidate tenant list to refetch
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.list.base });
    },
  });
};

/**
 * Mutation hook for updating a tenant.
 */
export const useTenantUpdateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<Tenant, ApiError, MutationData<UpdateTenantData>>({
    mutationKey: tenantQueryKeys.update,
    mutationFn: ({ path, body }) => updateTenant({ path, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.list.base });
    },
  });
};

/**
 * Query keys for domain operations.
 */
const domainQueryKeys = {
  list: (tenantId: string) => ['domain', 'list', tenantId] as const,
  detail: (tenantId: string, id: string) => ['domain', 'detail', tenantId, id] as const,
  create: ['domain', 'create'] as const,
  delete: ['domain', 'delete'] as const,
  verify: ['domain', 'verify'] as const,
};

/**
 * Query options for fetching domains of a tenant.
 */
export const domainsQueryOptions = (tenantId: string) =>
  queryOptions({
    queryKey: domainQueryKeys.list(tenantId),
    queryFn: () => getDomains({ path: { tenantId } }),
  });

/**
 * Query options for fetching a single domain with its verification token.
 */
export const domainDetailQueryOptions = (tenantId: string, id: string) =>
  queryOptions({
    queryKey: domainQueryKeys.detail(tenantId, id),
    queryFn: () => getDomain({ path: { tenantId, id } }),
  });

/**
 * Mutation hook for adding a domain to a tenant.
 */
export const useDomainCreateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<CreateDomainResponse, ApiError, MutationData<CreateDomainData>>({
    mutationKey: domainQueryKeys.create,
    mutationFn: ({ path, body }) => createDomain({ path, body }),
    onSuccess: (_, { path }) => {
      queryClient.invalidateQueries({ queryKey: domainQueryKeys.list(path.tenantId) });
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.list.base });
    },
  });
};

/**
 * Mutation hook for removing a domain from a tenant.
 */
export const useDomainDeleteMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<DeleteDomainResponse, ApiError, MutationData<DeleteDomainData>>({
    mutationKey: domainQueryKeys.delete,
    mutationFn: ({ path }) => deleteDomain({ path }),
    onSuccess: (_, { path }) => {
      queryClient.invalidateQueries({ queryKey: domainQueryKeys.list(path.tenantId) });
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.list.base });
    },
  });
};

/**
 * Mutation hook for verifying a domain via DNS TXT record lookup.
 */
export const useDomainVerifyMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<VerifyDomainResponse, ApiError, MutationData<VerifyDomainData>>({
    mutationKey: domainQueryKeys.verify,
    mutationFn: ({ path }) => verifyDomain({ path }),
    onSuccess: (_, { path }) => {
      queryClient.invalidateQueries({ queryKey: domainQueryKeys.list(path.tenantId) });
      queryClient.invalidateQueries({ queryKey: domainQueryKeys.detail(path.tenantId, path.id) });
    },
  });
};
