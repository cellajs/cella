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
import { cacheCreate, cacheRemove, cacheUpdate } from '~/query/basic/cache-mutations';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { createCacheFinder } from '~/query/basic/find-in-list-cache';
import { baseInfiniteQueryOptions } from '~/query/basic/infinite-query-options';
import { invalidateIfLastMutation } from '~/query/basic/invalidation-helpers';
import { preserveIncluded } from '~/query/basic/preserve-included';
import type { MutationData } from '~/query/types';

type OrganizationFilters = Omit<GetOrganizationsData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<OrganizationFilters>('organization');

// Register query keys for dynamic lookup in stream handlers
registerEntityQueryKeys('organization', keys);

/**
 * Organization query keys.
 */
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

type OrganizationsListParams = Omit<NonNullable<GetOrganizationsData['query']>, 'limit' | 'offset'> & {
  limit?: number;
};

/**
 * Paginated organizations infinite query. `include` is deliberately not part of the cache key because
 * queries with/without counts share one cache for offline behavior; the most recent fetch wins.
 */
export const organizationsListQueryOptions = (params: OrganizationsListParams) => {
  const {
    q = organizationsSearchDefaults.q,
    sort = organizationsSearchDefaults.sort,
    // displayOrder reads ascending; every other column defaults to descending
    order = sort === 'displayOrder' ? 'asc' : 'desc',
    relatableUserId,
    excludeArchived,
    role,
    include,
    limit: baseLimit = appConfig.requestLimits.organizations,
  } = params;

  const limit = String(baseLimit);

  // Exclude `include` from cache key so queries with/without counts share the same cache
  const keyFilters = { q, sort, order, relatableUserId, excludeArchived, role };

  const queryKey = keys.list.filtered(keyFilters);
  const baseQuery = { ...keyFilters, include, limit };

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));

      const result = await getOrganizations({
        query: { ...baseQuery, offset },
        signal,
      });
      // Cache entries are populated by the enrichment pipeline (membership/can/ancestorSlugs).
      return result as { items: EnrichedOrganization[]; total: number };
    },
    ...baseInfiniteQueryOptions,
    refetchOnMount: true,
  });
};

/**
 * Mutation hook for creating a new organization.
 */
export const useOrganizationCreateMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<EnrichedOrganization, ApiError, MutationData<CreateOrganizationsData>>({
    mutationKey: keys.create,
    mutationFn: async ({ path, body }) => {
      const result = await createOrganizations({ path, body });

      // If the org was not created (empty data), check rejection reasons
      if (!result.data.length) {
        const reasons = result.rejectionReasons ? Object.keys(result.rejectionReasons) : [];
        if (reasons.includes('org_limit_reached')) {
          throw new ApiError({ status: 422, type: 'org_limit_reached' });
        }
        throw new ApiError({ status: 422, type: 'create_resource' });
      }

      // Return the first created organization (currently only single creation supported)
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

/**
 * Mutation hook for updating an existing organization.
 */
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

/**
 * Mutation hook for deleting organizations.
 */
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
      for (const org of organizations) queryClient.removeQueries({ queryKey: keys.detail.byId(org.id) });
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, listKey);
    },
  });
};

/**
 * Fetch organizations for table export. Bypasses cache; returns flat items.
 */
export const fetchOrganizationsForExport = async (params: {
  limit: number;
  offset?: number;
  q?: string;
  sort?: NonNullable<GetOrganizationsData['query']>['sort'];
  order?: NonNullable<GetOrganizationsData['query']>['order'];
}) => {
  const { limit, offset = 0, q = '', sort = organizationsSearchDefaults.sort } = params;
  // displayOrder reads ascending; every other column defaults to descending
  const order = params.order ?? (sort === 'displayOrder' ? 'asc' : 'desc');
  const response = await getOrganizations({
    query: { limit: String(limit), q, sort, order, offset: String(offset) },
  });
  return response.items;
};
