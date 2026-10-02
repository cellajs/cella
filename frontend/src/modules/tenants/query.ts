import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Connection, Tenant } from 'sdk';
import {
  type CreateConnectionData,
  createConnection,
  type DeleteConnectionData,
  deleteConnection,
  type GetTenantsData,
  getConnections,
  getTenants,
  type SelfCreateTenantData,
  selfCreateTenant,
  type UpdateConnectionData,
  type UpdateTenantData,
  updateConnection,
  updateTenant,
} from 'sdk';
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

const connectionQueryKeys = {
  list: (tenantId: string) => ['connection', 'list', tenantId] as const,
  create: ['connection', 'create'] as const,
  update: ['connection', 'update'] as const,
  delete: ['connection', 'delete'] as const,
};

/** The tenant's connections: the institutions whose members sign in through a federation. */
export const connectionsQueryOptions = (tenantId: string) =>
  queryOptions({ queryKey: connectionQueryKeys.list(tenantId), queryFn: () => getConnections({ path: { tenantId } }) });

export const useConnectionCreateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<Connection, ApiError, MutationData<CreateConnectionData>>({
    mutationKey: connectionQueryKeys.create,
    mutationFn: ({ path, body }) => createConnection({ path, body }),
    onSuccess: (_, { path }) => {
      queryClient.invalidateQueries({ queryKey: connectionQueryKeys.list(path.tenantId) });
    },
  });
};

export const useConnectionUpdateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<Connection, ApiError, MutationData<UpdateConnectionData>>({
    mutationKey: connectionQueryKeys.update,
    mutationFn: ({ path, body }) => updateConnection({ path, body }),
    onSuccess: (_, { path }) => {
      queryClient.invalidateQueries({ queryKey: connectionQueryKeys.list(path.tenantId) });
    },
  });
};

export const useConnectionDeleteMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<Connection, ApiError, MutationData<DeleteConnectionData>>({
    mutationKey: connectionQueryKeys.delete,
    mutationFn: ({ path }) => deleteConnection({ path }),
    onSuccess: (_, { path }) => {
      queryClient.invalidateQueries({ queryKey: connectionQueryKeys.list(path.tenantId) });
    },
  });
};
