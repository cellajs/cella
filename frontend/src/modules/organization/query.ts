import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { appConfig } from 'shared';
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
} from '~/api.gen';
import type { ApiError } from '~/lib/api';
import type { EnrichedOrganization } from '~/modules/organization/types';
import {
  baseInfiniteQueryOptions,
  createEntityKeys,
  findInListCache,
  invalidateIfLastMutation,
  registerEntityQueryKeys,
  useMutateQueryData,
} from '~/query/basic';
import type { MutationData } from '~/query/types';

type OrganizationFilters = Omit<GetOrganizationsData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<OrganizationFilters>('organization');

// Register query keys for dynamic lookup in stream handlers
registerEntityQueryKeys('organization', keys);

/**
 * Organization query keys.
 */
export const organizationQueryKeys = keys;

/** Find an organization in the list cache by id or slug. */
export const findOrganizationInListCache = (idOrSlug: string) =>
  findInListCache<Organization>(keys.list.base, (org) => org.id === idOrSlug || org.slug === idOrSlug);

/**
 * Query options for a single organization by ID.
 * NOTE: Slug is only used on page load. All subsequent queries must use ID.
 */
export const organizationQueryOptions = (id: string, tenantId: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: async () => getOrganization({ path: { tenantId, organizationId: id }, query: { include: 'counts' } }),
    placeholderData: () => findOrganizationInListCache(id),
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
  const mutateCache = useMutateQueryData(keys.list.base);

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
      mutateCache.create([createdOrganization]);
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, keys.list.base);
    },
  });
};

/**
 * Mutation hook for updating an existing organization.
 */
export const useOrganizationUpdateMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base, () => keys.detail.base, ['update']);

  return useMutation<Organization, ApiError, MutationData<UpdateOrganizationData>>({
    mutationKey: keys.update,
    mutationFn: ({ path, body }) => updateOrganization({ path, body }),
    onSuccess: (updatedOrganization) => {
      mutateCache.update([updatedOrganization]);
      // Directly update detail cache so beforeLoad doesn't use stale slug for URL rewrite
      queryClient.setQueryData(keys.detail.byId(updatedOrganization.id), updatedOrganization);
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, keys.list.base);
    },
  });
};

/**
 * Mutation hook for deleting organizations.
 */
export const useOrganizationDeleteMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base, (org) => keys.detail.byId(org.id), ['remove']);

  return useMutation<void, ApiError, MutationData<DeleteOrganizationsData> & { organizations: Organization[] }>({
    mutationKey: keys.delete,
    mutationFn: async ({ path, body }) => {
      await deleteOrganizations({ path, body });
    },
    onSuccess: (_, { organizations }) => {
      mutateCache.remove(organizations);
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, keys.list.base);
    },
  });
};
