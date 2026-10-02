import { infiniteQueryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Tenant } from 'sdk';
import { type GetTenantsData, getTenants, type SelfCreateTenantData, selfCreateTenant, type UpdateTenantData, updateTenant } from 'sdk';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import { tenantsSearchDefaults } from '~/modules/tenants/search-params-schemas';
import { offsetPaging, pageQuery } from '~/query/basic/infinite-query-options';
import type { MutationData } from '~/query/types';

type TenantFilters = Omit<NonNullable<GetTenantsData['query']>, 'limit' | 'offset'>;
type TenantsListParams = TenantFilters & { limit?: number };

/** Tenants are resources, not entities, so their query keys are defined manually. */
const tenantQueryKeys = {
  list: { base: ['tenant', 'list'] as const, filtered: (filters: TenantFilters) => ['tenant', 'list', filters] as const },
  selfCreate: ['tenant', 'self-create'] as const,
  update: ['tenant', 'update'] as const,
};

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

  return infiniteQueryOptions({
    queryKey: tenantQueryKeys.list.filtered(filters),
    ...offsetPaging(limit, (offset, signal) => getTenants({ query: { ...filters, ...pageQuery(limit, offset) }, signal })),
    refetchOnMount: true,
  });
};

/** Self-serve tenant creation: every new organization mints its own tenant. */
export const useSelfCreateTenantMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<Tenant, ApiError, SelfCreateTenantData['body']>({
    mutationKey: tenantQueryKeys.selfCreate,
    mutationFn: (body) => selfCreateTenant({ body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.list.base });
    },
  });
};

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
