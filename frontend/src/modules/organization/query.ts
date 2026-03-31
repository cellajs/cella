import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type AutoCreateOrganizationData,
  autoCreateOrganization,
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
import type { ApiError } from '~/lib/api';
import { addMyMembershipCache } from '~/modules/memberships/query-mutations';
import type { EnrichedOrganization } from '~/modules/organization/types';
import {
  baseInfiniteQueryOptions,
  createCacheFinder,
  createEntityKeys,
  invalidateIfLastMutation,
  preserveIncluded,
  registerEntityQueryKeys,
} from '~/query/basic';
import { cacheCreate, cacheRemove, cacheUpdate } from '~/query/basic/cache-mutations';
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
    queryFn: async () => getOrganization({ path: { tenantId, id }, query: { include: 'counts' } }),
    placeholderData: () => findOrganizationByIdOrSlug(id, tenantId),
    structuralSharing: preserveIncluded,
  });

type OrganizationsListParams = Omit<NonNullable<GetOrganizationsData['query']>, 'limit' | 'offset'> & {
  limit?: number;
};

/**
 * Infinite query options to get a paginated list of organizations.
 * Note: `include` is NOT part of the cache key - queries with/without counts share the same cache
 * for seamless offline behavior. The most recent fetch determines what's cached.
 */
export const organizationsListQueryOptions = (params: OrganizationsListParams) => {
  const {
    q = '',
    sort = 'createdAt',
    order = 'desc',
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

      return getOrganizations({
        query: { ...baseQuery, offset },
        signal,
      });
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
          throw new Error('org_limit_reached');
        }
        throw new Error('create_resource');
      }

      // Return the first created organization (currently only single creation supported)
      return result.data[0] as EnrichedOrganization;
    },
    onSuccess: (createdOrganization) => {
      if (createdOrganization.included?.membership) addMyMembershipCache(createdOrganization.included.membership);
      cacheCreate(listKey, [createdOrganization]);
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, listKey);
    },
  });
};

// TODO can we remove this ?
/**
 * Mutation hook for creating an organization with auto-tenant creation.
 * Used by new users who don't have a tenant yet.
 */
export const useOrganizationAutoCreateMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<EnrichedOrganization, ApiError, AutoCreateOrganizationData['body']>({
    mutationKey: [...keys.create, 'auto'],
    mutationFn: async (body) => {
      const result = await autoCreateOrganization({ body });
      return result as EnrichedOrganization;
    },
    onSuccess: (createdOrganization) => {
      if (createdOrganization.included?.membership) addMyMembershipCache(createdOrganization.included.membership);
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
