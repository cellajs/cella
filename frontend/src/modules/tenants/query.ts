import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type Connection,
  type CreateConnectionData,
  type CreateTenantData,
  createConnection,
  createDemo,
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
import { appConfig, type TenantKind } from 'shared';
import type { ApiError } from '~/lib/api';
import { tenantsSearchDefaults } from '~/modules/tenants/search-params-schemas';
import { syncChunkSize } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { orderByParam, pageQuery, tokenPaging } from '~/query/basic/infinite-query-options';
import type { ListFilters, MutationData } from '~/query/types';

/** The list's filters as the route holds them: the kinds as a list, which the request joins with commas. */
type TenantFilters = Omit<ListFilters<NonNullable<ListTenantsData['query']>>, 'kind'> & { kind?: TenantKind[] };

/** Tenants are resources, not entities, so their query keys are defined manually. */
const tenantQueryKeys = {
  list: { base: ['tenant', 'list'] as const, filtered: (filters: TenantFilters) => ['tenant', 'list', filters] as const },
  selfCreate: ['tenant', 'self-create'] as const,
  createDemo: ['tenant', 'create-demo'] as const,
  update: ['tenant', 'update'] as const,
};

/** A kind list as the API reads it (`csvQuerySchema`); none picked sends nothing, so the API lists its default kinds. */
export const tenantKindsParam = (kinds: TenantKind[] = []) => (kinds.length ? kinds.join(',') : undefined);

export const tenantsListQueryOptions = (params: TenantFilters & { limit?: number }) => {
  const {
    q = tenantsSearchDefaults.q,
    status,
    kind = [],
    sort = tenantsSearchDefaults.sort,
    order = tenantsSearchDefaults.order,
    // pageSizes has no tenants entry
    limit = appConfig.pageSizes.users,
  } = params;
  const filters = { q, status, kind, sort, order };
  const query = { q, status, kind: tenantKindsParam(kind), orderBy: orderByParam(sort, order) };

  return infiniteQueryOptions({
    queryKey: tenantQueryKeys.list.filtered(filters),
    ...tokenPaging((pageToken, signal) => listTenants({ query: { ...query, ...pageQuery(limit, pageToken) }, signal })),
    refetchOnMount: true,
  });
};

/** Takes a demo for this browser and opens its organization: the server set a demo session, so the app reloads on the organization's page with it. */
export const useCreateDemoMutation = () =>
  useMutation<Tenant, ApiError>({
    mutationKey: tenantQueryKeys.createDemo,
    mutationFn: () => createDemo(),
    onSuccess: (tenant) => {
      if (tenant.organization) window.location.assign(`/${tenant.id}/${tenant.organization.slug}/organization`);
    },
  });

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
