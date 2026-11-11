import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type BatchCreateOrganizationsData,
  type BatchCreateOrganizationsResponse,
  type BatchDeleteOrganizationsData,
  batchCreateOrganizations,
  batchDeleteOrganizations,
  getOrganization,
  type ListOrganizationsData,
  listOrganizations,
  type Organization,
  type PublishOrganizationData,
  type PublishOrganizationResponse,
  publishOrganization,
  type UpdateOrganizationData,
  updateOrganization,
} from 'sdk';
import { appConfig, type TenantKind } from 'shared';
import { ApiError } from '~/lib/api';
import { addMyMembershipCache } from '~/modules/memberships/query-mutations';
import { organizationsSearchDefaults } from '~/modules/organization/search-params-schemas';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { tenantKindsParam } from '~/modules/tenants/query';
import { cacheCreate, cacheRemove, cacheUpdate, removeDetailQueriesOnceUnobserved } from '~/query/basic/cache-mutations';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys } from '~/query/basic/entity-query-registry';
import type { PageRequest } from '~/query/basic/fetch-all-pages';
import { createCacheFinder } from '~/query/basic/find-in-list-cache';
import { orderByParam, pageQuery, refetchOnMountForIncluded, tokenPaging } from '~/query/basic/infinite-query-options';
import { invalidateIfLastMutation } from '~/query/basic/invalidation-helpers';
import { preserveIncluded } from '~/query/basic/preserve-included';
import type { ListFilters, MutationData, QueryData } from '~/query/types';

/** The list's filters as a route holds them: the tenant kinds as a list, which the request joins with commas. */
type OrganizationFilters = Omit<ListFilters<NonNullable<ListOrganizationsData['query']>>, 'kind'> & { kind?: TenantKind[] };

const keys = createEntityKeys<OrganizationFilters>('organization');

registerEntityQueryKeys('organization', keys);

const findOrganizationInCache = createCacheFinder<Organization>('organization');

/** Find an organization in cache by id or slug. Slug matches are scoped to the given tenant. */
export const findOrganizationByIdOrSlug = (idOrSlug: string, tenantId: string) =>
  findOrganizationInCache((org) => org.id === idOrSlug || (org.slug === idOrSlug && org.tenantId === tenantId));

/** Detail query by id: the route resolves a slug only on page load (route-logic.ts), so every later query passes the id. */
export const organizationQueryOptions = (id: string, tenantId: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: async (): Promise<EnrichedOrganization> => getOrganization({ path: { tenantId, organizationId: id }, query: { include: 'counts' } }),
    placeholderData: (): EnrichedOrganization | undefined => findOrganizationByIdOrSlug(id, tenantId),
    structuralSharing: preserveIncluded,
  });

type OrganizationsListParams = OrganizationFilters & { limit?: number };

/** Search filters with the API defaults filled in; `include` is left out, so queries with and without counts share one list key. */
const withDefaults = ({
  q = organizationsSearchDefaults.q,
  sort = organizationsSearchDefaults.sort,
  order = organizationsSearchDefaults.order,
  relatableUserId,
  excludeHidden,
  role,
  kind = [],
}: OrganizationFilters) => ({ q, sort, order, relatableUserId, excludeHidden, role, kind });

// Cache enrichment adds the ancestor slugs.
const fetchOrganizationsPage = async (
  { sort, order, kind, ...query }: ReturnType<typeof withDefaults> & Pick<OrganizationFilters, 'include'>,
  page: PageRequest,
  signal?: AbortSignal,
): Promise<QueryData<EnrichedOrganization>> =>
  listOrganizations({ query: { ...query, kind: tenantKindsParam(kind), orderBy: orderByParam(sort, order), ...page }, signal });

export const organizationsListQueryOptions = ({ include, limit = appConfig.pageSizes.organizations, ...params }: OrganizationsListParams) => {
  const filters = withDefaults(params);

  return infiniteQueryOptions({
    queryKey: keys.list.filtered(filters),
    ...tokenPaging((pageToken, signal) => fetchOrganizationsPage({ ...filters, include }, pageQuery(limit, pageToken), signal)),
    refetchOnMount: refetchOnMountForIncluded(include),
  });
};

export const useOrganizationCreateMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<BatchCreateOrganizationsResponse['results'][number], ApiError, MutationData<BatchCreateOrganizationsData>>({
    mutationKey: keys.create,
    // The create form shows a taken handle on its field.
    meta: { suppressGlobalErrorToast: (error) => error.type === 'slug_exists' },
    mutationFn: async ({ path, body }) => {
      const { results, rejectionReasons } = await batchCreateOrganizations({ path, body });
      // A tenant without a free slot is refused with a 403, so a single create comes back empty when its slug is taken.
      const [created] = results;
      if (created) return created;
      if (rejectionReasons?.slug_exists) throw new ApiError({ status: 409, type: 'slug_exists', entityType: 'organization', severity: 'warn' });
      throw new ApiError({ status: 422, type: 'create_resource', entityType: 'organization', severity: 'error' });
    },
    onSuccess: (createdOrganization) => {
      addMyMembershipCache(createdOrganization.included.membership);
      cacheCreate(listKey, [createdOrganization]);
    },
    onSettled: () => invalidateIfLastMutation(queryClient, keys.all, listKey),
  });
};

export const useOrganizationUpdateMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<Organization, ApiError, MutationData<UpdateOrganizationData>>({
    mutationKey: keys.update,
    mutationFn: ({ path, body }) => updateOrganization({ path, body }),
    onSuccess: (updatedOrganization) => {
      cacheUpdate(listKey, [updatedOrganization]);
      queryClient.invalidateQueries({ queryKey: keys.detail.base });
      // Directly update detail cache so beforeLoad doesn't use stale slug for URL rewrite
      queryClient.setQueryData(keys.detail.byId(updatedOrganization.id), updatedOrganization);
    },
    onSettled: () => invalidateIfLastMutation(queryClient, keys.all, listKey),
  });
};

/** Publishes a draft organization; the response also says how many held invitations went out. */
export const useOrganizationPublishMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<PublishOrganizationResponse, ApiError, MutationData<PublishOrganizationData>>({
    mutationKey: [...keys.update, 'publish'],
    mutationFn: ({ path }) => publishOrganization({ path }),
    onSuccess: ({ organization }) => {
      cacheUpdate(listKey, [organization]);
      queryClient.setQueryData(keys.detail.byId(organization.id), organization);
    },
    onSettled: () => invalidateIfLastMutation(queryClient, keys.all, listKey),
  });
};

export const useOrganizationDeleteMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<void, ApiError, MutationData<BatchDeleteOrganizationsData> & { organizations: Organization[] }>({
    mutationKey: keys.delete,
    mutationFn: async ({ path, body }) => {
      await batchDeleteOrganizations({ path, body });
    },
    onSuccess: (_, { organizations }) => {
      cacheRemove(listKey, organizations);
      removeDetailQueriesOnceUnobserved(
        queryClient,
        keys.detail.base,
        organizations.map(({ id }) => id),
      );
    },
    onSettled: () => invalidateIfLastMutation(queryClient, keys.all, listKey),
  });
};

/** A page of organizations for a table export. Bypasses cache; rows carry their counts and the caller's membership. */
export const fetchOrganizationsForExport = ({ q, sort, order }: Pick<OrganizationFilters, 'q' | 'sort' | 'order'>, page: PageRequest) =>
  fetchOrganizationsPage({ ...withDefaults({ q, sort, order }), include: 'counts,membership' }, page);
