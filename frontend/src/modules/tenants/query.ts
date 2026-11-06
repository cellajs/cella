import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type Connection,
  type CreateConnectionData,
  type CreateTenantData,
  createConnection,
  createTenant,
  type DeleteConnectionData,
  deleteConnection,
  type ListTenantsData,
  listConnections,
  listTenants,
  type Tenant,
  type UpdateConnectionData,
  type UpdateTenantData,
  updateConnection,
  updateTenant,
} from 'sdk';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import { tenantsSearchDefaults } from '~/modules/tenants/search-params-schemas';
import { syncChunkSize } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { orderByParam, pageQuery, tokenPaging } from '~/query/basic/infinite-query-options';
import type { ListFilters, MutationData } from '~/query/types';

type TenantFilters = ListFilters<NonNullable<ListTenantsData['query']>>;
type TenantsListParams = TenantFilters & { limit?: number };

/** Tenants are resources, not entities, so their query keys are defined manually. */
const tenantQueryKeys = {
  list: { base: ['tenant', 'list'] as const, filtered: (filters: TenantFilters) => ['tenant', 'list', filters] as const },
  selfCreate: ['tenant', 'self-create'] as const,
  update: ['tenant', 'update'] as const,
};

export const tenantsListQueryOptions = (params: TenantsListParams) => {
  const {
    q = tenantsSearchDefaults.q,
    status,
    sort = tenantsSearchDefaults.sort,
    order = tenantsSearchDefaults.order,
    // requestLimits has no tenants entry
    limit = appConfig.requestLimits.users,
  } = params;
  const filters = { q, status, sort, order };

  return infiniteQueryOptions({
    queryKey: tenantQueryKeys.list.filtered(filters),
    ...tokenPaging((pageToken, signal) =>
      listTenants({ query: { q, status, orderBy: orderByParam(sort, order), ...pageQuery(limit, pageToken) }, signal }),
    ),
    refetchOnMount: true,
  });
};

/** Self-serve tenant creation: every new organization mints its own tenant. */
export const useSelfCreateTenantMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<Tenant, ApiError, CreateTenantData['body']>({
    mutationKey: tenantQueryKeys.selfCreate,
    mutationFn: (body) => createTenant({ body }),
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
  queryOptions({
    queryKey: connectionQueryKeys.list(tenantId),
    queryFn: () => fetchAllPages((page) => listConnections({ path: { tenantId }, query: page }), syncChunkSize),
  });

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

  return useMutation<void, ApiError, MutationData<DeleteConnectionData>>({
    mutationKey: connectionQueryKeys.delete,
    mutationFn: async ({ path }) => {
      await deleteConnection({ path });
    },
    onSuccess: (_, { path }) => {
      queryClient.invalidateQueries({ queryKey: connectionQueryKeys.list(path.tenantId) });
    },
  });
};
