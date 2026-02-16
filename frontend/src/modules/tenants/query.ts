import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { appConfig } from 'shared';
import type { Tenant } from '~/api.gen';
import {
  type ArchiveTenantData,
  archiveTenant,
  type CreateTenantData,
  createTenant,
  type GetTenantsData,
  getTenantById,
  getTenants,
  type UpdateTenantData,
  updateTenant,
} from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { baseInfiniteQueryOptions } from '~/query/basic';
import type { MutationData } from '~/query/types';

type TenantFilters = Omit<GetTenantsData['query'], 'limit' | 'offset'>;

/**
 * Query keys for tenant operations.
 * Tenants are resources (not entities), so we define keys manually.
 */
export const tenantQueryKeys = {
  all: ['tenant'] as const,
  list: {
    base: ['tenant', 'list'] as const,
    filtered: (filters: TenantFilters) => ['tenant', 'list', filters] as const,
  },
  detail: {
    base: ['tenant', 'detail'] as const,
    byId: (id: string) => ['tenant', 'detail', id] as const,
  },
  create: ['tenant', 'create'] as const,
  update: ['tenant', 'update'] as const,
  delete: ['tenant', 'delete'] as const,
};

/**
 * Query options for fetching a single tenant by ID.
 */
export const tenantQueryOptions = (tenantId: string) =>
  queryOptions({
    queryKey: tenantQueryKeys.detail.byId(tenantId),
    queryFn: async () => getTenantById({ path: { tenantId } }),
  });

/**
 * Infinite query options for fetching a paginated list of tenants.
 */
export const tenantsListQueryOptions = ({
  q = '',
  status,
  sort = 'createdAt',
  order = 'desc',
  limit: baseLimit = appConfig.requestLimits.users, // Use users limit as fallback
}: Omit<NonNullable<GetTenantsData['query']>, 'limit' | 'offset'> & { limit?: number }) => {
  const limit = String(baseLimit);

  const queryKey = tenantQueryKeys.list.filtered({ q, status, sort, order });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));
      return await getTenants({ query: { q, status, sort, order, limit, offset }, signal });
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
      // Invalidate tenant list to refetch
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.list.base });
    },
  });
};

/**
 * Mutation hook for archiving a tenant.
 */
export const useTenantArchiveMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, ApiError, MutationData<ArchiveTenantData>>({
    mutationKey: tenantQueryKeys.delete,
    mutationFn: ({ path }) => archiveTenant({ path }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.list.base });
    },
  });
};
