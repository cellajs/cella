import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type CreateOrganizationsData,
  createOrganizations,
  type DeleteOrganizationsData,
  deleteOrganizations,
  type GetOrganizationsData,
  getOrganization,
  getOrganizations,
  type Organization,
  type UpdateOrganizationData,
  updateOrganization,
} from 'sdk';
import { appConfig } from 'shared';
import { ApiError } from '~/lib/api';
import { addMyMembershipCache, getApiIncludedMembership } from '~/modules/memberships/query-mutations';
import { organizationsSearchDefaults } from '~/modules/organization/search-params-schemas';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { cacheCreate, cacheRemove, cacheUpdate, removeDetailQueriesById } from '~/query/basic/cache-mutations';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { createCacheFinder } from '~/query/basic/find-in-list-cache';
import { offsetPaging, pageQuery } from '~/query/basic/infinite-query-options';
import { invalidateIfLastMutation } from '~/query/basic/invalidation-helpers';
import { preserveIncluded } from '~/query/basic/preserve-included';
import type { MutationData } from '~/query/types';

type OrganizationFilters = Omit<GetOrganizationsData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<OrganizationFilters>('organization');

// Register query keys for dynamic lookup in stream handlers
registerEntityQueryKeys('organization', keys);

export const organizationQueryKeys = keys;

const findOrganizationInCache = createCacheFinder<Organization>('organization');

/** Find an organization in cache by id or slug. Slug matches are scoped to the given tenant. */
export const findOrganizationByIdOrSlug = (idOrSlug: string, tenantId: string) =>
  findOrganizationInCache((org) => org.id === idOrSlug || (org.slug === idOrSlug && org.tenantId === tenantId));

/**
 * Query options for a single organization by ID.
 * NOTE: Slug is only used on page load. All subsequent queries must use ID.
 */
export const organizationQueryOptions = (id: string, tenantId: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: async () =>
      (await getOrganization({ path: { tenantId, id }, query: { include: 'counts' } })) as EnrichedOrganization,
    placeholderData: () => findOrganizationByIdOrSlug(id, tenantId) as EnrichedOrganization | undefined,
    structuralSharing: preserveIncluded,
  });

type OrganizationsQuery = Omit<NonNullable<GetOrganizationsData['query']>, 'limit' | 'offset'>;
type OrganizationsListParams = OrganizationsQuery & { limit?: number };

/** Search filters with the table defaults filled in; `include` is left out, so it never reaches a list key. */
const withDefaults = ({
  q = organizationsSearchDefaults.q,
  sort = organizationsSearchDefaults.sort,
  // displayOrder reads ascending; every other column defaults to descending
  order = sort === 'displayOrder' ? 'asc' : 'desc',
  relatableUserId,
  excludeArchived,
  role,
}: OrganizationsQuery) => ({ q, sort, order, relatableUserId, excludeArchived, role });

const fetchOrganizationsPage = async (
  query: OrganizationsQuery,
  limit: number,
  offset: number,
  signal?: AbortSignal,
) => {
  const result = await getOrganizations({ query: { ...query, ...pageQuery(limit, offset) }, signal });
  // Cache entries are populated by the enrichment pipeline (membership/can/ancestorSlugs).
  return result as { items: EnrichedOrganization[]; total: number };
};

export const organizationsListQueryOptions = ({
  include,
  limit = appConfig.requestLimits.organizations,
  ...params
}: OrganizationsListParams) => {
  // Queries with and without counts share one cache entry.
  const filters = withDefaults(params);

  return infiniteQueryOptions({
    queryKey: keys.list.filtered(filters),
    ...offsetPaging(limit, (offset, signal) => fetchOrganizationsPage({ ...filters, include }, limit, offset, signal)),
    refetchOnMount: true,
  });
};

export const useOrganizationCreateMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<EnrichedOrganization, ApiError, MutationData<CreateOrganizationsData>>({
    mutationKey: keys.create,
    mutationFn: async ({ path, body }) => {
      const result = await createOrganizations({ path, body });

      if (!result.data.length) {
        const reasons = result.rejectionReasons ? Object.keys(result.rejectionReasons) : [];
        if (reasons.includes('org_limit_reached')) {
          throw new ApiError({ status: 422, type: 'org_limit_reached' });
        }
        throw new ApiError({ status: 422, type: 'create_resource' });
      }

      // The endpoint creates a list; single creation is the only caller.
      return result.data[0] as EnrichedOrganization;
    },
    onSuccess: (createdOrganization) => {
      const membership = getApiIncludedMembership(createdOrganization);
      if (membership) addMyMembershipCache(membership);
      cacheCreate(listKey, [createdOrganization]);
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, listKey);
    },
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
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, listKey);
    },
  });
};

export const useOrganizationDeleteMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<void, ApiError, MutationData<DeleteOrganizationsData> & { organizations: Organization[] }>({
    mutationKey: keys.delete,
    mutationFn: async ({ path, body }) => {
      await deleteOrganizations({ path, body });
    },
    onSuccess: (_, { organizations }) => {
      cacheRemove(listKey, organizations);
      removeDetailQueriesById(
        queryClient,
        keys.detail.base,
        organizations.map(({ id }) => id),
      );
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, listKey);
    },
  });
};

/** Fetch organizations for table export. Bypasses cache; returns flat items without counts. */
export const fetchOrganizationsForExport = async ({
  limit,
  offset = 0,
  q,
  sort,
  order,
}: Pick<OrganizationsQuery, 'q' | 'sort' | 'order'> & { limit: number; offset?: number }) =>
  (await fetchOrganizationsPage(withDefaults({ q, sort, order }), limit, offset)).items;
